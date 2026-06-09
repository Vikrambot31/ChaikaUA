import {
  get, ref, onValue, update,
  orderByChild, startAt, endAt, equalTo, limitToFirst,
  query as dbQuery,
  type Unsubscribe, type DataSnapshot,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../firebase/firebase';

// ── Types ──

export type PremiumStatus = 'active' | 'trial' | 'expired' | 'free';

export interface PremiumSubscription {
  uid: string;
  plan: string;
  status: PremiumStatus;
  startedAt: string | null;
  expiresAt: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
  paymentMethod: string | null;
  notes: string | null;
  trialUsed: boolean;
  autoRenew: boolean;
}

export interface UserProfile {
  name: string;
  phone: string;
}

// ── Helpers ──

const snapshotToSubscriptions = (snap: DataSnapshot): PremiumSubscription[] => {
  const result: PremiumSubscription[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (!data || !data.plan || data.plan === 'free') return;
    result.push({
      uid: child.key!,
      plan: String(data.plan ?? 'free'),
      status: (data.status as PremiumStatus) ?? 'free',
      startedAt: data.startedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      activatedBy: data.activatedBy ?? null,
      activatedAt: data.activatedAt ?? null,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      trialUsed: data.trialUsed === true,
      autoRenew: data.autoRenew !== false, // default true
    });
  });
  return result;
};

// ── RTDB subscription ──

export const subscribeToAllPremiumSubscriptions = (
  callback: (subscriptions: PremiumSubscription[]) => void,
): Unsubscribe => {
  return onValue(ref(database, 'user_subscription'), (snap) => {
    callback(snap.exists() ? snapshotToSubscriptions(snap) : []);
  });
};

// ── User profile lookup ──

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const rawToProfile = (uid: string, d: Record<string, unknown>): UserProfile & { uid: string } => ({
  uid,
  name: str(d.name) || str(d.displayName) || str(d.fullName) || '',
  phone: str(d.phone) || str(d.phoneNumber) || str(d.mobile) || '',
});

export const loadUserProfile = async (uid: string): Promise<UserProfile> => {
  try {
    const snap = await get(ref(database, `users/${uid}`));
    if (!snap.exists()) return { name: '', phone: '' };
    return rawToProfile(uid, snap.val() as Record<string, unknown>);
  } catch {
    return { name: '', phone: '' };
  }
};

export const loadUserProfiles = async (
  uids: string[],
): Promise<Record<string, UserProfile>> => {
  if (uids.length === 0) return {};
  try {
    const snap = await get(ref(database, 'users'));
    if (!snap.exists()) return {};
    const all = snap.val() as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      uids.map((uid) => [uid, all[uid] ? rawToProfile(uid, all[uid]) : { name: '', phone: '' }]),
    );
  } catch {
    return {};
  }
};

export interface UserSearchResult {
  uid: string;
  name: string;
  phone: string;
}

/**
 * Search registered users by UID, phone prefix, or name prefix.
 * Tries all three strategies and returns deduplicated results.
 */
export const searchUsers = async (query: string): Promise<UserSearchResult[]> => {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const results = new Map<string, UserSearchResult>();

  const addSnap = (snap: import('firebase/database').DataSnapshot) => {
    if (!snap.exists()) return;
    snap.forEach((child) => {
      if (results.size >= 20) return;
      const d = child.val() as Record<string, unknown>;
      const p = rawToProfile(child.key!, d);
      results.set(child.key!, p);
    });
  };

  const addSingle = (uid: string, snap: import('firebase/database').DataSnapshot) => {
    if (!snap.exists()) return;
    const p = rawToProfile(uid, snap.val() as Record<string, unknown>);
    results.set(uid, p);
  };

  try {
    // 1. Direct UID lookup (uid is usually 28 chars alphanum, no + or spaces)
    if (q.length >= 10 && !/[+\s]/.test(q)) {
      const snap = await get(ref(database, `users/${q}`));
      addSingle(q, snap);
    }

    // 2. Phone prefix search (index on 'phone' exists in rules)
    const phoneQ = dbQuery(
      ref(database, 'users'),
      orderByChild('phone'),
      startAt(q),
      endAt(q + '\uf8ff'),
      limitToFirst(10),
    );
    addSnap(await get(phoneQ));

    // 3. Name prefix search — try as-is
    const nameQ = dbQuery(
      ref(database, 'users'),
      orderByChild('name'),
      startAt(q),
      endAt(q + '\uf8ff'),
      limitToFirst(10),
    );
    addSnap(await get(nameQ));

    // 4. Name with capitalized first letter (e.g. "vik" → "Vik")
    const cap = q.charAt(0).toUpperCase() + q.slice(1);
    if (cap !== q) {
      const nameQ2 = dbQuery(
        ref(database, 'users'),
        orderByChild('name'),
        startAt(cap),
        endAt(cap + '\uf8ff'),
        limitToFirst(10),
      );
      addSnap(await get(nameQ2));
    }

    // 5. Search pending moderation requests by name/phone (client-side filter)
    try {
      const pendingQ = dbQuery(
        ref(database, 'requests'),
        orderByChild('status'),
        equalTo('pending'),
        limitToFirst(300),
      );
      const pendingSnap = await get(pendingQ);
      if (pendingSnap.exists()) {
        const qLower = q.toLowerCase();
        pendingSnap.forEach((child) => {
          if (results.size >= 30) return;
          const d = child.val() as Record<string, unknown>;
          const name = str(d.name) || str(d.userName) || str(d.displayName) || '';
          const phone = str(d.phone) || '';
          const uid = str(d.userId) || str(d.uid) || '';
          if (!uid || results.has(uid)) return;
          if (name.toLowerCase().includes(qLower) || phone.includes(qLower)) {
            results.set(uid, { uid, name, phone });
          }
        });
      }
    } catch (e) {
      console.warn('[searchUsers] moderation search error:', e);
    }
  } catch (e) {
    console.warn('[searchUsers] error:', e);
  }

  return Array.from(results.values()).slice(0, 20);
};

// ── Auto-renew toggle ──

export const setAutoRenew = async (uid: string, enabled: boolean): Promise<void> => {
  await update(ref(database, `user_subscription/${uid}`), { autoRenew: enabled });
};

// ── Cloud Function calls ──

export const activatePremiumManual = async (
  uid: string,
  months: 1 | 3 | 6 | 12,
  notes: string,
): Promise<{ ok: boolean; expiresAt: string; months: number }> => {
  const fn = httpsCallable<
    { uid: string; months: number; notes: string },
    { ok: boolean; expiresAt: string; months: number }
  >(functions, 'activatePremiumManual');
  const result = await fn({ uid, months, notes });
  return result.data;
};

export const cancelPremiumSubscription = async (
  uid: string,
): Promise<{ ok: boolean }> => {
  const fn = httpsCallable<{ uid: string }, { ok: boolean }>(
    functions,
    'cancelPremiumSubscription',
  );
  const result = await fn({ uid });
  return result.data;
};
