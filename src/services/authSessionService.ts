import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase-core';
import { ensureFirebaseAuth, isAnonymousFirebaseUser } from '../firebase-auth-session';
import { logClientError } from '../utils/errorLogger';
import { clearCachedSecurityRole } from './securityRoles';

const AUTH_CLEAR_WAIT_MS = 50;
const AUTH_CLEAR_MAX_ATTEMPTS = 20;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clearNativeGoogleSession = async (): Promise<void> => {
  if (Platform.OS === 'web') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as {
      GoogleSignin?: {
        hasPreviousSignIn?: () => boolean;
        signOut?: () => Promise<void>;
      };
    };
    if (GoogleSignin?.signOut) {
      const hadSession = !GoogleSignin.hasPreviousSignIn || GoogleSignin.hasPreviousSignIn();
      if (hadSession) {
        await GoogleSignin.signOut();
      }
    }
  } catch (error: unknown) {
    void logClientError('auth.clearNativeGoogleSession', error);
    throw error;
  }
};

const clearNativeFacebookSession = async (): Promise<void> => {
  if (Platform.OS === 'web') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LoginManager } = require('react-native-fbsdk-next') as {
      LoginManager?: { logOut?: () => void };
    };
    LoginManager?.logOut?.();
  } catch (error: unknown) {
    void logClientError('auth.clearNativeFacebookSession', error);
  }
};

const waitForFirebaseSignOut = async (): Promise<void> => {
  for (let attempt = 0; attempt < AUTH_CLEAR_MAX_ATTEMPTS; attempt += 1) {
    if (!auth.currentUser || isAnonymousFirebaseUser(auth.currentUser)) return;
    await delay(AUTH_CLEAR_WAIT_MS);
  }
};

const flushAuthPersistence = async (): Promise<void> => {
  try {
    await AsyncStorage.flushGetRequests();
  } catch {
    // Some AsyncStorage implementations do not expose pending read queues.
  }
  await delay(AUTH_CLEAR_WAIT_MS);
};

export const clearSocialProviderSessions = async (): Promise<void> => {
  const results = await Promise.allSettled([
    clearNativeGoogleSession(),
    clearNativeFacebookSession(),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      void logClientError('auth.clearSocialProviderSessions', r.reason);
    }
  }
};

export const signOutPrimarySession = async (
  options: { resumeAnonymous?: boolean } = {},
): Promise<void> => {
  const uid = auth.currentUser?.uid;
  await signOut(auth);
  if (uid) {
    await clearCachedSecurityRole(uid);
  }
  await waitForFirebaseSignOut();
  await flushAuthPersistence();
  await clearSocialProviderSessions();

  if (options.resumeAnonymous) {
    await ensureFirebaseAuth();
  }
};
