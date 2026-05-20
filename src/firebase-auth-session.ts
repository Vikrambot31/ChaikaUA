import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase-core';
import Constants from 'expo-constants';
import { DeviceAuthorizationStatus, syncAuthorizedDeviceForCurrentUser } from './services/deviceAuth';

const FALLBACK_PRIMARY_SERVICE_EMAIL = 'vikramsave@ukr.net';

const normalizeEmail = (email?: string | null) => email?.toLowerCase().trim() ?? '';

const PRIMARY_SERVICE_EMAIL = normalizeEmail(
  Constants.expoConfig?.extra?.adminServiceEmail ||
  process.env.EXPO_PUBLIC_ADMIN_SERVICE_EMAIL ||
  FALLBACK_PRIMARY_SERVICE_EMAIL,
);

type EmailUser = {
  email?: string | null;
  emailVerified?: boolean;
} | null;

let authBootstrapPromise: Promise<any> | null = null;

export const getCurrentUser = () => auth.currentUser;

export const isAnonymousFirebaseUser = (user = auth.currentUser): boolean =>
  Boolean(user?.isAnonymous || user?.providerData?.length === 0);

export const isRealFirebaseUser = (user = auth.currentUser): boolean =>
  Boolean(user && !isAnonymousFirebaseUser(user));

export const ensureFirebaseAuth = async () => {
  // Wait for Firebase to restore the persisted session before deciding to sign in
  // anonymously. On Android cold start, auth.currentUser is briefly null while
  // Firebase reads from storage — without this wait, signInAnonymously races with
  // session restore, producing a uid mismatch that causes permission_denied writes.
  try {
    await auth.authStateReady();
  } catch {
    // authStateReady may throw if auth is not properly initialized; proceed anyway.
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!authBootstrapPromise) {
    authBootstrapPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        authBootstrapPromise = null;
      });
  }

  return authBootstrapPromise;
};

export const isPrimaryServiceEmail = (user: EmailUser = auth.currentUser): boolean => {
  const email = normalizeEmail(user?.email);
  return email === PRIMARY_SERVICE_EMAIL;
};

export const hasPrimaryServiceAccess = (user: EmailUser = auth.currentUser): boolean =>
  Boolean(isPrimaryServiceEmail(user) && user?.emailVerified);

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
  return `authenticated:${user.uid}`;
};
