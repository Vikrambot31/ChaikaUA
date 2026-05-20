import { get, onValue, query, ref, remove, set } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database } from '../firebase-core';
import { firebaseApp } from '../firebase-core';
import { getCurrentUser } from '../firebase-auth-session';
import { sanitizeStoredText } from '../utils/textUtils';
import { logClientEvent } from '../utils/errorLogger';

const BLOCKED_USERS_PATH = 'service_moderation/blocked_users';
const DELETED_USERS_PATH = 'service_moderation/deleted_users';

export type ModerationControlledUser = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export type BlockedUserRecord = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  reason?: string;
  blockedAt: string;
  blockedBy: string;
};

const nowIso = () => new Date().toISOString();

const ensureServiceAdminAccess = async () => {
  const user = getCurrentUser();
  if (!user?.uid) {
    void logClientEvent('service_moderation_access_denied', { reason: 'missing_auth_user' });
    throw new Error('Authentication required for moderation access');
  }
  return user;
};

const normalizeUser = (user: ModerationControlledUser): ModerationControlledUser => ({
  id: user.id,
  name: sanitizeStoredText(user.name || 'User'),
  email: user.email ? sanitizeStoredText(user.email) : undefined,
  phone: user.phone ? sanitizeStoredText(user.phone) : undefined,
});

export const getUserAccessControlStatus = async (
  uid: string,
): Promise<{ isBlocked: boolean; isDeleted: boolean; reason?: string }> => {
  if (!uid) {
    return { isBlocked: false, isDeleted: false };
  }

  const [blockedSnap, deletedSnap] = await Promise.all([
    get(ref(database, `${BLOCKED_USERS_PATH}/${uid}`)),
    get(ref(database, `${DELETED_USERS_PATH}/${uid}`)),
  ]);

  const blockedValue = blockedSnap.val() as Partial<BlockedUserRecord> | null;

  return {
    isBlocked: blockedSnap.exists(),
    isDeleted: deletedSnap.exists(),
    reason: typeof blockedValue?.reason === 'string' ? sanitizeStoredText(blockedValue.reason) : undefined,
  };
};

export const subscribeUserAccessControlStatus = (
  uid: string,
  callback: (status: { isBlocked: boolean; isDeleted: boolean; reason?: string }) => void,
): (() => void) => {
  if (!uid) {
    callback({ isBlocked: false, isDeleted: false });
    return () => {};
  }

  const blockedRef = ref(database, `${BLOCKED_USERS_PATH}/${uid}`);
  const deletedRef = ref(database, `${DELETED_USERS_PATH}/${uid}`);
  let blocked: { exists: boolean; reason?: string } = { exists: false };
  let deleted = false;

  const emit = () => callback({
    isBlocked: blocked.exists,
    isDeleted: deleted,
    reason: blocked.reason,
  });

  const unsubBlocked = onValue(blockedRef, (snapshot) => {
    const value = snapshot.val() as Partial<BlockedUserRecord> | null;
    blocked = {
      exists: snapshot.exists(),
      reason: typeof value?.reason === 'string' ? sanitizeStoredText(value.reason) : undefined,
    };
    emit();
  });

  const unsubDeleted = onValue(deletedRef, (snapshot) => {
    deleted = snapshot.exists();
    emit();
  });

  return () => {
    unsubBlocked();
    unsubDeleted();
  };
};

export const loadBlockedUsers = async (): Promise<BlockedUserRecord[]> => {
  const snapshot = await get(query(ref(database, BLOCKED_USERS_PATH)));
  if (!snapshot.exists()) {
    return [];
  }

  const raw = snapshot.val() as Record<string, Partial<BlockedUserRecord>>;
  return Object.entries(raw)
    .map(([uid, value]) => ({
      uid,
      name: sanitizeStoredText(value.name || 'User'),
      email: typeof value.email === 'string' ? sanitizeStoredText(value.email) : undefined,
      phone: typeof value.phone === 'string' ? sanitizeStoredText(value.phone) : undefined,
      reason: typeof value.reason === 'string' ? sanitizeStoredText(value.reason) : undefined,
      blockedAt: typeof value.blockedAt === 'string' ? value.blockedAt : nowIso(),
      blockedBy: typeof value.blockedBy === 'string' ? value.blockedBy : 'service-owner',
    }))
    .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
};

export const blockCommunityUser = async (
  user: ModerationControlledUser,
  reason?: string,
): Promise<void> => {
  const admin = await ensureServiceAdminAccess();
  const normalized = normalizeUser(user);

  await set(ref(database, `${BLOCKED_USERS_PATH}/${normalized.id}`), {
    uid: normalized.id,
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone,
    reason: reason ? sanitizeStoredText(reason) : 'Blocked by service moderation',
    blockedAt: nowIso(),
    blockedBy: admin.uid,
  } satisfies BlockedUserRecord);
};

export const unblockCommunityUser = async (uid: string): Promise<void> => {
  await ensureServiceAdminAccess();
  await remove(ref(database, `${BLOCKED_USERS_PATH}/${uid}`));
};

export const deleteCommunityUser = async (
  user: ModerationControlledUser,
): Promise<void> => {
  const admin = await ensureServiceAdminAccess();
  const normalized = normalizeUser(user);

  try {
    const deleteUserFully = httpsCallable<
      {
        uid: string;
        reason?: string;
        name?: string;
        email?: string;
        phone?: string;
      },
      { ok: boolean }
    >(getFunctions(firebaseApp), 'deleteCommunityUserFully');

    await deleteUserFully({
      uid: normalized.id,
      reason: 'Deleted in service moderation (no block)',
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
    });

    return;
  } catch {
    // Fall back to client-side soft delete if the function is not deployed yet.
  }

  await Promise.all([
    set(ref(database, `${DELETED_USERS_PATH}/${normalized.id}`), {
      uid: normalized.id,
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
      deletedAt: nowIso(),
      deletedBy: admin.uid,
    }),
    remove(ref(database, `users/${normalized.id}`)),
    remove(ref(database, `user_roles/${normalized.id}`)),
  ]);
};

export const deleteOsbbNewsItem = async (
  buildingId: string,
  newsId: string,
): Promise<void> => {
  await ensureServiceAdminAccess();
  await remove(ref(database, `osbb_news/${buildingId}/${newsId}`));
};
