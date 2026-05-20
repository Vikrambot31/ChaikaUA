import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, off, onValue, ref } from 'firebase/database';
import { auth, database } from '../firebase-core';
import { isPrimaryServiceEmail } from '../firebase-auth-session';

export type SecurityRole = 'admin' | 'moderator' | 'tester' | 'user';

export type SecurityRoleSnapshot = {
  role: SecurityRole;
  updatedAt: number;
  source: 'remote' | 'cache' | 'default';
};

const USER_ROLES_PATH = 'user_roles';
const ROLE_CACHE_PREFIX = '@chaika:security_role:';

const normalizeRole = (value: unknown): SecurityRole => {
  if (value === 'admin' || value === 'moderator' || value === 'tester') {
    return value;
  }

  return 'user';
};

export const isAdminSecurityRole = (role: SecurityRole): boolean => role === 'admin';

const getRoleCacheKey = (uid: string) => `${ROLE_CACHE_PREFIX}${uid}`;

export const getCachedSecurityRole = async (uid: string): Promise<SecurityRoleSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(getRoleCacheKey(uid));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SecurityRoleSnapshot>;
    return {
      role: normalizeRole(parsed.role),
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
      source: 'cache',
    };
  } catch {
    return null;
  }
};

const setCachedSecurityRole = async (uid: string, role: SecurityRole): Promise<void> => {
  await AsyncStorage.setItem(getRoleCacheKey(uid), JSON.stringify({
    role,
    updatedAt: Date.now(),
  }));
};

export const clearCachedSecurityRole = async (uid: string): Promise<void> => {
  await AsyncStorage.removeItem(getRoleCacheKey(uid));
};

export const getSecurityRole = async (uid: string): Promise<SecurityRoleSnapshot> => {
  if (!uid) {
    return { role: 'user', updatedAt: 0, source: 'default' };
  }

  if (auth.currentUser?.uid === uid && isPrimaryServiceEmail(auth.currentUser)) {
    await setCachedSecurityRole(uid, 'admin');
    return { role: 'admin', updatedAt: Date.now(), source: 'remote' };
  }

  try {
    const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${uid}/role`));
    const role = normalizeRole(snapshot.val());
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

  if (isPrimaryServiceEmail(auth.currentUser)) {
    const snapshot = { role: 'admin' as const, updatedAt: Date.now(), source: 'remote' as const };
    void setCachedSecurityRole(uid, snapshot.role);
    callback(snapshot);
    return () => {};
  }

  const roleRef = ref(database, `${USER_ROLES_PATH}/${uid}/role`);
  const unsubscribe = onValue(roleRef, (snapshot) => {
    const role = normalizeRole(snapshot.val());
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
