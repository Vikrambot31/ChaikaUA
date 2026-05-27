import { get, off, onValue, ref } from 'firebase/database';
import { auth, database } from '../firebase-core';
import { hasPrimaryServiceAccess } from '../firebase-auth-session';
import { CACHE_TTL, cacheGet, cacheSet, cacheInvalidate } from '../utils/cacheLayer';

export type SecurityRole = 'admin' | 'moderator' | 'user';

export type SecurityRoleSnapshot = {
  role: SecurityRole;
  updatedAt: number;
  source: 'remote' | 'cache' | 'default';
};

const USER_ROLES_PATH = 'user_roles';
const ROLE_CACHE_PREFIX = 'user_roles:';

export const normalizeSecurityRole = (value: unknown): SecurityRole => {
  if (value === 'admin' || value === 'moderator') {
    return value;
  }

  return 'user';
};

export const isAdminSecurityRole = (role: SecurityRole): boolean => role === 'admin';

const getRoleCacheKey = (uid: string) => `${ROLE_CACHE_PREFIX}${uid}`;

export const getCachedSecurityRole = async (uid: string): Promise<SecurityRoleSnapshot | null> => {
  try {
    const parsed = await cacheGet<Partial<SecurityRoleSnapshot>>(getRoleCacheKey(uid));
    if (!parsed) return null;
    return {
      role: normalizeSecurityRole(parsed.role),
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
      source: 'cache',
    };
  } catch {
    return null;
  }
};

const setCachedSecurityRole = async (uid: string, role: SecurityRole): Promise<void> => {
  await cacheSet(getRoleCacheKey(uid), {
    role,
    updatedAt: Date.now(),
  }, CACHE_TTL.userRole);
};

export const clearCachedSecurityRole = async (uid: string): Promise<void> => {
  await cacheInvalidate(getRoleCacheKey(uid));
};

export const getSecurityRole = async (uid: string): Promise<SecurityRoleSnapshot> => {
  if (!uid) {
    return { role: 'user', updatedAt: 0, source: 'default' };
  }

  if (auth.currentUser?.uid === uid && hasPrimaryServiceAccess(auth.currentUser)) {
    await setCachedSecurityRole(uid, 'admin');
    return { role: 'admin', updatedAt: Date.now(), source: 'remote' };
  }

  try {
    const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${uid}/role`));
    const role = normalizeSecurityRole(snapshot.val());
    await setCachedSecurityRole(uid, role);
    return {
      role,
      updatedAt: Date.now(),
      source: 'remote',
    };
  } catch {
    return (await getCachedSecurityRole(uid)) ?? { role: 'user', updatedAt: 0, source: 'default' };
  }
};

export const getCurrentUserSecurityRole = async (): Promise<SecurityRoleSnapshot> => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return { role: 'user', updatedAt: 0, source: 'default' };
  }

  return getSecurityRole(uid);
};

export const subscribeCurrentUserSecurityRole = (
  callback: (snapshot: SecurityRoleSnapshot) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback({ role: 'user', updatedAt: 0, source: 'default' });
    return () => {};
  }

  if (hasPrimaryServiceAccess(auth.currentUser)) {
    const snapshot = { role: 'admin' as const, updatedAt: Date.now(), source: 'remote' as const };
    void setCachedSecurityRole(uid, snapshot.role);
    callback(snapshot);
    return () => {};
  }

  const roleRef = ref(database, `${USER_ROLES_PATH}/${uid}/role`);
  const unsubscribe = onValue(roleRef, (snapshot) => {
    const role = normalizeSecurityRole(snapshot.val());
    void setCachedSecurityRole(uid, role);
    callback({
      role,
      updatedAt: Date.now(),
      source: 'remote',
    });
  });

  return () => off(roleRef, 'value', unsubscribe);
};

export const isPrivilegedSecurityRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';
