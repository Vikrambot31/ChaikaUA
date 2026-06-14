import {
  get, ref, update, remove, onValue,
  type Unsubscribe,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../firebase/firebase';

// ── Types ──

export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type CardModerationStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessPlusClaim {
  placeId: string;
  placeName: string;
  placeAddress: string;
  category: string;
  ownerUid: string;
  ownerName: string;
  ownerPhone: string;
  comment: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export interface BusinessMenuItem {
  name: string;
  price: string;
}

export interface BusinessPromotion {
  title: string;
  description: string;
  dateUntil: string;
}

export interface BusinessPlusCard {
  placeId: string;
  placeName: string;
  category: string;
  ownerId: string;
  moderationStatus: CardModerationStatus;
  menuItems?: BusinessMenuItem[];
  promotions?: BusinessPromotion[];
  photoUri?: string;
  photoStoragePath?: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

// ── Helpers ──

const toClaimList = (snap: import('firebase/database').DataSnapshot): BusinessPlusClaim[] => {
  const result: BusinessPlusClaim[] = [];
  snap.forEach((child) => {
    const d = child.val();
    if (!d) return;
    result.push({
      placeId: child.key ?? d.placeId ?? '',
      placeName: d.placeName ?? '',
      placeAddress: d.placeAddress ?? '',
      category: (d.category && d.category.trim()) ? d.category : 'business',
      ownerUid: d.ownerUid ?? '',
      ownerName: d.ownerName ?? '',
      ownerPhone: d.ownerPhone ?? '',
      comment: d.comment ?? '',
      status: d.status ?? 'pending',
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
      approvedBy: d.approvedBy,
      approvedAt: d.approvedAt,
      rejectedBy: d.rejectedBy,
      rejectedAt: d.rejectedAt,
      rejectReason: d.rejectReason,
    });
  });
  return result.sort((a, b) => {
    // pending first, then by date desc
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
};

const toCardList = (snap: import('firebase/database').DataSnapshot): BusinessPlusCard[] => {
  const result: BusinessPlusCard[] = [];
  snap.forEach((child) => {
    const d = child.val();
    if (!d) return;
    result.push({
      placeId: child.key ?? d.placeId ?? '',
      placeName: d.placeName ?? '',
      category: (d.category && d.category.trim()) ? d.category : 'business',
      ownerId: d.ownerId ?? '',
      moderationStatus: d.moderationStatus ?? 'pending',
      menuItems: Array.isArray(d.menuItems) ? d.menuItems : undefined,
      promotions: Array.isArray(d.promotions) ? d.promotions : undefined,
      photoUri: d.photoUri,
      photoStoragePath: d.photoStoragePath,
      updatedAt: d.updatedAt ?? '',
      approvedBy: d.approvedBy,
      approvedAt: d.approvedAt,
      rejectedBy: d.rejectedBy,
      rejectedAt: d.rejectedAt,
      rejectReason: d.rejectReason,
    });
  });
  return result.sort((a, b) => {
    if (a.moderationStatus === 'pending' && b.moderationStatus !== 'pending') return -1;
    if (a.moderationStatus !== 'pending' && b.moderationStatus === 'pending') return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
};

// ── Subscriptions ──

export const subscribeToBusinessPlusClaims = (
  callback: (claims: BusinessPlusClaim[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe =>
  onValue(ref(database, 'business_plus_claims'), (snap) => {
    callback(snap.exists() ? toClaimList(snap) : []);
  }, onError ? (err) => onError(err) : undefined);

export const subscribeToBusinessPlusCards = (
  callback: (cards: BusinessPlusCard[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe =>
  onValue(ref(database, 'business_plus_cards'), (snap) => {
    callback(snap.exists() ? toCardList(snap) : []);
  }, onError ? (err) => onError(err) : undefined);

// ── Claim actions ──

export const approveBusinessClaim = async (
  placeId: string,
  adminUid: string,
): Promise<void> => {
  const now = new Date().toISOString();
  // 1. Update claim status
  await update(ref(database, `business_plus_claims/${placeId}`), {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
    updatedAt: now,
  });
  // 2. Seed business card with ownerId if not exists
  const cardSnap = await get(ref(database, `business_plus_cards/${placeId}`));
  if (!cardSnap.exists()) {
    const claimSnap = await get(ref(database, `business_plus_claims/${placeId}`));
    const claim = claimSnap.val() as BusinessPlusClaim | null;
    if (claim) {
      await update(ref(database, `business_plus_cards/${placeId}`), {
        placeId,
        placeName: claim.placeName,
        category: (claim.category && claim.category.trim()) ? claim.category : 'business',
        ownerId: claim.ownerUid,
        moderationStatus: 'approved',
        updatedAt: now,
      });
      // 3. Write in-app notification for the owner
      await update(ref(database, `user_business_notifications/${claim.ownerUid}`), {
        type: 'claim_approved',
        placeName: claim.placeName,
        placeId,
        timestamp: now,
        read: false,
      });
    }
  } else {
    // Card already exists — still notify the owner
    const claimSnap = await get(ref(database, `business_plus_claims/${placeId}`));
    const claim = claimSnap.val() as BusinessPlusClaim | null;
    if (claim?.ownerUid) {
      await update(ref(database, `user_business_notifications/${claim.ownerUid}`), {
        type: 'claim_approved',
        placeName: claim.placeName,
        placeId,
        timestamp: now,
        read: false,
      });
    }
  }
};

export const rejectBusinessClaim = async (
  placeId: string,
  adminUid: string,
  reason: string,
): Promise<void> => {
  const now = new Date().toISOString();
  // 1. Update claim status
  await update(ref(database, `business_plus_claims/${placeId}`), {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: now,
    rejectReason: reason,
    updatedAt: now,
  });
  // 2. Write in-app notification for the owner
  const claimSnap = await get(ref(database, `business_plus_claims/${placeId}`));
  const claim = claimSnap.val() as BusinessPlusClaim | null;
  if (claim?.ownerUid) {
    await update(ref(database, `user_business_notifications/${claim.ownerUid}`), {
      type: 'claim_rejected',
      placeName: claim.placeName,
      placeId,
      rejectReason: reason,
      timestamp: now,
      read: false,
    });
  }
};

// ── Card actions ──

export const approveBusinessCard = async (
  placeId: string,
  adminUid: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await update(ref(database, `business_plus_cards/${placeId}`), {
    moderationStatus: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
  });
};

export const rejectBusinessCard = async (
  placeId: string,
  adminUid: string,
  reason: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await update(ref(database, `business_plus_cards/${placeId}`), {
    moderationStatus: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: now,
    rejectReason: reason,
  });
};

// ── Business+ subscription management ──

export type BusinessPlusSubStatus = 'active' | 'expired' | 'free';

export interface BusinessPlusSubscription {
  uid: string;
  plan: string;
  status: BusinessPlusSubStatus;
  expiresAt: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  notes: string | null;
  // Enriched from users/{uid}
  userName?: string;
  userPhone?: string;
  businessEmail?: string;
}

export const subscribeToBusinessPlusSubscriptions = (
  callback: (subs: BusinessPlusSubscription[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe =>
  onValue(ref(database, 'user_subscription'), (snap) => {
    const base: BusinessPlusSubscription[] = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        const d = child.val();
        if (!d || d.plan !== 'business_plus') return;
        base.push({
          uid: child.key!,
          plan: d.plan,
          status: d.status ?? 'free',
          expiresAt: d.expiresAt ?? null,
          activatedAt: d.activatedAt ?? null,
          activatedBy: d.activatedBy ?? null,
          notes: d.notes ?? null,
        });
      });
    }
    if (base.length === 0) { callback([]); return; }

    // Enrich with user profiles (name, phone, businessEmail)
    Promise.all(
      base.map(async (sub) => {
        try {
          const profileSnap = await get(ref(database, `users/${sub.uid}`));
          if (profileSnap.exists()) {
            const p = profileSnap.val() as Record<string, unknown>;
            return {
              ...sub,
              userName: typeof p.name === 'string' ? p.name : undefined,
              userPhone: typeof p.phone === 'string' ? p.phone : undefined,
              businessEmail: typeof p.businessEmail === 'string' ? p.businessEmail : undefined,
            };
          }
        } catch { /* ignore */ }
        return sub;
      })
    ).then(callback).catch(() => callback(base));
  }, onError ? (err) => onError(err) : undefined);

export const activateBusinessPlusManual = async (
  uid: string,
  months: 1 | 3 | 6 | 12,
  notes: string,
): Promise<{ ok: boolean; expiresAt: string; months: number }> => {
  const fn = httpsCallable<
    { uid: string; months: number; notes: string },
    { ok: boolean; expiresAt: string; months: number }
  >(functions, 'activateBusinessPlusManual');
  const result = await fn({ uid, months, notes });
  // Clear the pending request flag now that subscription is active
  try { await remove(ref(database, `users/${uid}/businessPlusRequest`)); } catch { /* non-blocking */ }
  return result.data;
};

export const cancelBusinessPlusSubscription = async (uid: string): Promise<{ ok: boolean }> => {
  const fn = httpsCallable<{ uid: string }, { ok: boolean }>(
    functions,
    'cancelBusinessPlusSubscription',
  );
  const result = await fn({ uid });
  return result.data;
};

// ── User profile lookup (reuse from premiumAdminService pattern) ──

// ── Delete / Update card ──

export const deleteBusinessCard = async (placeId: string): Promise<void> => {
  await remove(ref(database, `business_plus_cards/${placeId}`));
};

export const deleteBusinessClaim = async (placeId: string): Promise<void> => {
  await remove(ref(database, `business_plus_claims/${placeId}`));
};

export const updateBusinessCard = async (
  placeId: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await update(ref(database, `business_plus_cards/${placeId}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

export const updateBusinessClaim = async (
  placeId: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await update(ref(database, `business_plus_claims/${placeId}`), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

// ── User profile lookup ──

export const loadOwnerName = async (uid: string): Promise<string> => {
  try {
    const snap = await get(ref(database, `users/${uid}`));
    if (!snap.exists()) return uid.slice(0, 10) + '...';
    const d = snap.val() as Record<string, unknown>;
    return (typeof d.name === 'string' ? d.name : null)
      ?? (typeof d.displayName === 'string' ? d.displayName : null)
      ?? uid.slice(0, 10) + '...';
  } catch {
    return uid.slice(0, 10) + '...';
  }
};
