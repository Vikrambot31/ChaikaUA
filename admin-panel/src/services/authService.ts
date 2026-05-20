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
  | { status: 'denied'; user: User; role: SecurityRole; error: string };

const USER_ROLES_PATH = 'user_roles';
const FALLBACK_PRIMARY_SERVICE_EMAIL = 'vikramsave@ukr.net';

const normalizeEmail = (email?: string | null): string => email?.toLowerCase().trim() ?? '';

const primaryServiceEmail = normalizeEmail(
  import.meta.env.VITE_ADMIN_SERVICE_EMAIL || FALLBACK_PRIMARY_SERVICE_EMAIL,
);

const normalizeRole = (value: unknown): SecurityRole => {
  if (value === 'admin' || value === 'moderator' || value === 'tester') {
    return value;
  }
  return 'user';
};

export const isPrimaryServiceEmail = (user: User | null): boolean =>
  normalizeEmail(user?.email) === primaryServiceEmail;

export const isPrivilegedRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';

export const getSecurityRole = async (user: User): Promise<SecurityRole> => {
  if (isPrimaryServiceEmail(user)) {
    return 'admin';
  }

  const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${user.uid}/role`));
  return normalizeRole(snapshot.val());
};

export const subscribeAuthAccess = (callback: (access: AuthAccess) => void): (() => void) => {
  callback({ status: 'loading', user: null, role: null, error: null });

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback({ status: 'signedOut', user: null, role: null, error: null });
      return;
    }

    void getSecurityRole(user)
      .then((role) => {
        if (isPrivilegedRole(role)) {
          callback({ status: 'allowed', user, role, error: null });
          return;
        }

        callback({
          status: 'denied',
          user,
          role,
          error: 'У этого аккаунта нет роли admin/moderator.',
        });
      })
      .catch((error: unknown) => {
        callback({
          status: 'denied',
          user,
          role: 'user',
          error: error instanceof Error ? error.message : 'Не удалось проверить права доступа.',
        });
      });
  });
};

export const signInAdmin = async (email: string, password: string): Promise<void> => {
  await signInWithEmailAndPassword(auth, email.trim(), password);
};

export const signInWithGoogle = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
};

export const signOutAdmin = async (): Promise<void> => {
  await signOut(auth);
};
