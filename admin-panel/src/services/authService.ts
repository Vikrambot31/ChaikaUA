import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { get, onValue, ref } from 'firebase/database';
import { auth, database } from '../firebase/firebase';
import { LOCAL_MODE, localGet, localPatch, LOCAL_USERS, type LocalUserRole } from '../local/LOCAL_MODE';

export type SecurityRole = 'admin' | 'moderator' | 'user';

export type AuthAccess =
  | { status: 'loading'; user: User | null; role: null; error: null }
  | { status: 'signedOut'; user: null; role: null; error: null }
  | { status: 'allowed'; user: User; role: SecurityRole; error: null }
  | { status: 'denied'; user: User | null; role: SecurityRole; error: string };

// ─── LOCAL_MODE: обход Firebase Auth ────────────────────────────────────────
// Читаем currentUser из localhost:3001/currentUser и сразу отдаём 'allowed'
// Переключить роль: switchLocalUser('moderator') из любого места
export const switchLocalUser = async (role: LocalUserRole): Promise<void> => {
  await localPatch('/currentUser', LOCAL_USERS[role]);
};

const LOCAL_SUBSCRIBE_INTERVAL_MS = 2000; // переопрос /currentUser каждые 2 сек

export const subscribeAuthAccess = LOCAL_MODE
  ? (callback: (access: AuthAccess) => void): (() => void) => {
      callback({ status: 'loading', user: null, role: null, error: null });

      let cancelled = false;

      const poll = () => {
        localGet<{ id: string; name: string; email: string; role: string }>('/currentUser')
          .then((u) => {
            if (cancelled) return;
            const role: SecurityRole = u.role === 'admin' || u.role === 'moderator' ? u.role : 'user';
            // Создаём минимальный объект совместимый с User
            const fakeUser = {
              uid: u.id,
              email: u.email,
              displayName: u.name,
            } as unknown as User;
            callback({ status: 'allowed', user: fakeUser, role, error: null });
          })
          .catch(() => {
            if (cancelled) return;
            // Сервер не отвечает — показываем ошибку
            callback({
              status: 'denied',
              user: null,
              role: 'user',
              error: '⚠️ Локальный сервер недоступен. Запусти: cd local-server && npm start',
            });
          });
      };

      poll();
      const timer = setInterval(poll, LOCAL_SUBSCRIBE_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
  : (callback: (access: AuthAccess) => void): (() => void) => {
      // ─── PROD: оригинальная логика Firebase Auth ─────────────────────────
      callback({ status: 'loading', user: null, role: null, error: null });

      let unsubscribeRole: (() => void) | null = null;

      const stopRoleSubscription = () => {
        unsubscribeRole?.();
        unsubscribeRole = null;
      };

      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        stopRoleSubscription();

        if (!user) {
          if (lastAccessDeniedError) {
            const err = lastAccessDeniedError;
            lastAccessDeniedError = null;
            callback({ status: 'denied', user: null, role: 'user', error: err });
            return;
          }
          callback({ status: 'signedOut', user: null, role: null, error: null });
          return;
        }

        const applyRole = (role: SecurityRole) => {
          if (isPrivilegedRole(role)) {
            lastAccessDeniedError = null;
            callback({ status: 'allowed', user, role, error: null });
            return;
          }
          stopRoleSubscription();
          lastAccessDeniedError = ACCESS_DENIED_MESSAGE;
          callback({ status: 'denied', user, role, error: ACCESS_DENIED_MESSAGE });
          void signOut(auth).catch((err) => console.error('[auth] signOut failed', err));
        };

        if (isPrimaryServiceEmail(user)) {
          applyRole('admin');
          return;
        }

        if (isPrimaryOwnerUid(user)) {
          applyRole('admin');
          return;
        }

        unsubscribeRole = onValue(
          ref(database, `${USER_ROLES_PATH}/${user.uid}/role`),
          (snapshot) => applyRole(normalizeRole(snapshot.val())),
          (error) => {
            stopRoleSubscription();
            console.error('[auth] access check failed', error);
            // Network error reading role — show denied but do NOT sign out.
            // Signing out on a transient RTDB error causes random logouts.
            callback({ status: 'denied', user, role: 'user', error: 'Не вдалося перевірити роль. Оновіть сторінку.' });
          },
        );
      });

      return () => {
        stopRoleSubscription();
        unsubscribeAuth();
      };
    };
// ─────────────────────────────────────────────────────────────────────────────

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
  if (value === 'admin' || value === 'moderator') return value;
  return 'user';
};

export const isPrimaryServiceEmail = (user: User | null): boolean =>
  user?.emailVerified === true && normalizeEmail(user?.email) === primaryServiceEmail;

export const isPrimaryOwnerUid = (user: User | null): boolean =>
  Boolean(primaryOwnerUid && user?.uid === primaryOwnerUid);

export const isGoogleOnlyAuthMode = (): boolean => adminAuthMode === 'google';

export const isPrivilegedRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';

export const getSecurityRole = async (user: User): Promise<SecurityRole> => {
  if (isPrimaryServiceEmail(user)) return 'admin';
  if (isPrimaryOwnerUid(user)) return 'admin';
  const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${user.uid}/role`));
  return normalizeRole(snapshot.val());
};

export const signInAdmin = async (email: string, password: string): Promise<void> => {
  if (LOCAL_MODE) return; // в LOCAL_MODE логин не нужен
  lastAccessDeniedError = null;
  await signInWithEmailAndPassword(auth, email.trim(), password);
};

export const signInWithGoogle = async (): Promise<void> => {
  if (LOCAL_MODE) return;
  lastAccessDeniedError = null;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
};

export const signOutAdmin = async (): Promise<void> => {
  if (LOCAL_MODE) return;
  lastAccessDeniedError = null;
  await signOut(auth);
};
