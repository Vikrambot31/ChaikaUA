import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase-core';
import Constants from 'expo-constants';
import { DeviceAuthorizationStatus, syncAuthorizedDeviceForCurrentUser } from './services/deviceAuth';

const FALLBACK_PRIMARY_SERVICE_EMAIL = 'vikramsave@ukr.net';
const DEFAULT_AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

const normalizeEmail = (email?: string | null) => email?.toLowerCase().trim() ?? '';

const PRIMARY_SERVICE_EMAIL = normalizeEmail(
  Constants.expoConfig?.extra?.adminServiceEmail ||
  process.env.EXPO_PUBLIC_ADMIN_SERVICE_EMAIL ||
  FALLBACK_PRIMARY_SERVICE_EMAIL,
);

type EmailUser = {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean;
} | null;

const ADMIN_BACKUP_UID = String(
  Constants.expoConfig?.extra?.adminBackupUid ||
  process.env.EXPO_PUBLIC_ADMIN_BACKUP_UID ||
  '',
).trim();

let authBootstrapPromise: Promise<any> | null = null;
let anonymousSignInPromise: Promise<any> | null = null;

export const getCurrentUser = () => auth.currentUser;

export const isAnonymousFirebaseUser = (user = auth.currentUser): boolean =>
  Boolean(user?.isAnonymous || user?.providerData?.length === 0);

export const isRealFirebaseUser = (user = auth.currentUser): boolean =>
  Boolean(user && !isAnonymousFirebaseUser(user));

export class AuthBootstrapTimeoutError extends Error {
  code = 'auth_timeout';

  constructor() {
    super('auth_timeout');
    this.name = 'AuthBootstrapTimeoutError';
  }
}

export type WriteSessionReason =
  | 'no_auth'
  | 'anonymous'
  | 'auth_mismatch'
  | 'token_refresh_failed';

export class WriteSessionError extends Error {
  code: string;
  reason: WriteSessionReason;
  details: Record<string, unknown>;

  constructor(reason: WriteSessionReason, details: Record<string, unknown> = {}) {
    super(`write_session_${reason}`);
    this.name = 'WriteSessionError';
    this.code = `write_session_${reason}`;
    this.reason = reason;
    this.details = details;
  }
}

const createAuthTimeoutPromise = (timeoutMs: number): Promise<never> =>
  new Promise((_, reject) => {
    setTimeout(() => reject(new AuthBootstrapTimeoutError()), timeoutMs);
  });

export const bootstrapAuth = async (options?: {
  timeoutMs?: number;
  force?: boolean;
}) => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AUTH_BOOTSTRAP_TIMEOUT_MS;
  if (!authBootstrapPromise || options?.force) {
    authBootstrapPromise = (async () => {
      await Promise.race([
        auth.authStateReady(),
        createAuthTimeoutPromise(timeoutMs),
      ]);
      return auth.currentUser;
    })();
  }

  return authBootstrapPromise;
};

export const resetAuthBootstrap = () => {
  authBootstrapPromise = null;
};

export const isAuthBootstrapTimeoutError = (error: unknown): boolean =>
  error instanceof AuthBootstrapTimeoutError ||
  (error instanceof Error && error.message === 'auth_timeout') ||
  (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'auth_timeout');

// Waits for Firebase to restore the persisted session, then returns the current user.
// If no session exists, signs in anonymously so that guests satisfy "auth != null"
// rules and can read public data (feeds, requests, etc.) without registration.
export const ensureFirebaseAuth = async (): Promise<any> => {
  try {
    await bootstrapAuth();
  } catch (error) {
    if (isAuthBootstrapTimeoutError(error)) {
      throw error;
    }
    // authStateReady may throw if auth is not properly initialized; proceed anyway.
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  // No session — sign in anonymously so that guests can read data.
  // Deduplicated: parallel callers share the same in-flight promise.
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .catch(() =>
        signInAnonymously(auth)
          .then((credential) => credential.user)
          .catch(() => null)
      )
      .finally(() => { anonymousSignInPromise = null; });
  }

  return anonymousSignInPromise;
};

export const requireWriteSession = async (options?: {
  expectedUserId?: string | null;
  operation?: string;
  screen?: string;
  requireRealUser?: boolean;
}): Promise<any> => {
  const user = await ensureFirebaseAuth();
  const details = {
    operation: options?.operation,
    screen: options?.screen,
    expectedUserId: options?.expectedUserId || null,
    authUid: user?.uid || null,
    isAnonymous: Boolean(user?.isAnonymous),
  };

  if (!user?.uid) {
    throw new WriteSessionError('no_auth', details);
  }

  if (options?.requireRealUser !== false && isAnonymousFirebaseUser(user)) {
    throw new WriteSessionError('anonymous', details);
  }

  if (options?.expectedUserId && options.expectedUserId !== user.uid) {
    throw new WriteSessionError('auth_mismatch', details);
  }

  try {
    // Use cached token by default; only force-refresh if the cached attempt fails
    // with an auth error (e.g. revoked token). This avoids a 200-500ms network
    // round-trip to Firebase Auth on every single write operation.
    try {
      await user.getIdToken(false);
    } catch {
      await user.getIdToken(true);
    }
  } catch (error) {
    throw new WriteSessionError('token_refresh_failed', {
      ...details,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return user;
};

export const isPrimaryServiceEmail = (user: EmailUser = auth.currentUser): boolean => {
  const email = normalizeEmail(user?.email);
  return email === PRIMARY_SERVICE_EMAIL;
};

export const hasPrimaryServiceAccess = (user: EmailUser = auth.currentUser): boolean =>
  Boolean((ADMIN_BACKUP_UID && user?.uid === ADMIN_BACKUP_UID) || (isPrimaryServiceEmail(user) && user?.emailVerified));

export const getPrimaryServiceAccessState = (user: EmailUser = auth.currentUser) => ({
  isPrimaryEmail: isPrimaryServiceEmail(user),
  isVerified: Boolean(user?.emailVerified),
  hasAccess: hasPrimaryServiceAccess(user),
});

export const isModeratorByEmail = (user = auth.currentUser): boolean =>
  hasPrimaryServiceAccess(user);

export const isModeratorUser = async (user = auth.currentUser) => {
  return isModeratorByEmail(user);
};

export const requireAuthenticated = () => {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};

export const ensurePrimaryServiceOwner = () => {
  const user = requireAuthenticated();
  if (!hasPrimaryServiceAccess(user)) {
    throw new Error('Primary service owner access required');
  }
  return user;
};

export const ensureAuthorizedDeviceSession = async (
  options?: { allowNewDevices?: boolean },
): Promise<DeviceAuthorizationStatus> => {
  const user = requireAuthenticated();
  if (isAnonymousFirebaseUser(user)) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: false,
    };
  }

  return syncAuthorizedDeviceForCurrentUser(options);
};

export const requireModerator = async () => {
  return ensurePrimaryServiceOwner();
};

export const getRequestsAccessScope = async (): Promise<string> => {
  const user = await ensureFirebaseAuth();
  return user ? `authenticated:${user.uid}` : 'unauthenticated';
};
