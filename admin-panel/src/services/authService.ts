import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { auth, database } from '../firebase/firebase';

export type SecurityRole = 'admin' | 'moderator' | 'tester' | 'user';

export type AuthAccess =
  | { status: 'loading'; user: User | null; role: null; error: null }
  | { status: 'signedOut'; user: null; role: null; error: null }
  | { status: 'allowed'; user: User; role: SecurityRole; error: null }
  | { status: 'denied'; user: User | null; role: SecurityRole; error: string };

const USER_ROLES_PATH = 'user_roles';
const FALLBACK_PRIMARY_SERVICE_EMAIL = 'vikramsave@ukr.net';
const ACCESS_DENIED_MESSAGE = 'Доступ запрещен. Используйте разрешенный админ-аккаунт.';

const normalizeEmail = (email?: string | null): string => email?.toLowerCase().trim() ?? '';

const primaryServiceEmail = normalizeEmail(
  import.meta.env.VITE_ADMIN_SERVICE_EMAIL || FALLBACK_PRIMARY_SERVICE_EMAIL,
);

const primaryOwnerUid = String(import.meta.env.VITE_ADMIN_OWNER_UID || '').trim();
const adminAuthMode = String(import.meta.env.VITE_ADMIN_AUTH_MODE || 'password').trim().toLowerCase();
let lastAccessDeniedError: string | null = null;

const normalizeRole = (value: unknown): SecurityRole => {
  if (value === 'admin' || value === 'moderator' || value === 'tester') {
    return value;
  }
  return 'user';
};

export const isPrimaryServiceEmail = (user: User | null): boolean =>
  normalizeEmail(user?.email) === primaryServiceEmail;

export const isPrimaryOwnerUid = (user: User | null): boolean =>
  Boolean(primaryOwnerUid && user?.uid === primaryOwnerUid);

export const isGoogleOnlyAuthMode = (): boolean => adminAuthMode === 'google';

export const isPrivilegedRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';

export const getSecurityRole = async (user: User): Promise<SecurityRole> => {
  if (isPrimaryServiceEmail(user)) {
    return 'admin';
  }

  if (isPrimaryOwnerUid(user)) {
    return 'admin';
  }

  const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${user.uid}/role`));
  return normalizeRole(snapshot.val());
};

export const subscribeAuthAccess = (callback: (access: AuthAccess) => void): (() => void) => {
  callback({ status: 'loading', user: null, role: null, error: null });

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      if (lastAccessDeniedError) {
        callback({ status: 'denied', user: null, role: 'user', error: lastAccessDeniedError });
        return;
      }
      callback({ status: 'signedOut', user: null, role: null, error: null });
      return;
    }

    void getSecurityRole(user)
      .then((role) => {
        if (isPrivilegedRole(role)) {
          lastAccessDeniedError = null;
          callback({ status: 'allowed', user, role, error: null });
          return;
        }

        lastAccessDeniedError = ACCESS_DENIED_MESSAGE;
        callback({
          status: 'denied',
          user,
          role,
          error: ACCESS_DENIED_MESSAGE,
        });
        void signOut(auth);
      })
      .catch((error: unknown) => {
        lastAccessDeniedError = ACCESS_DENIED_MESSAGE;
        console.error('[auth] access check failed', error);
        callback({
          status: 'denied',
          user,
          role: 'user',
          error: ACCESS_DENIED_MESSAGE,
        });
        void signOut(auth);
      });
  });
};

export const signInAdmin = async (email: string, password: string): Promise<void> => {
  lastAccessDeniedError = null;
  await signInWithEmailAndPassword(auth, email.trim(), password);
};

export const signInWithGoogle = async (): Promise<void> => {
  lastAccessDeniedError = null;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
};

export const signOutAdmin = async (): Promise<void> => {
  lastAccessDeniedError = null;
  await signOut(auth);
};
