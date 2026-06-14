import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_MODE } from './local/LOCAL_MODE';

type FirebaseRuntimeConfig = {
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

// Firebase RTDB is in us-central1 — use the firebaseio.com canonical URL.
const CANONICAL_FIREBASE_DATABASE_URL = 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com';
const CANONICAL_FIREBASE_STORAGE_BUCKET = 'chaikaua-3cd9d.firebasestorage.app';

const getExtra = (key: string): string | undefined => {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const isValidDatabaseURL = (url: string): boolean =>
  /firebasedatabase\.app/i.test(url) || /firebaseio\.com/i.test(url);

const requireCanonicalFirebaseConfig = (config: FirebaseRuntimeConfig): FirebaseRuntimeConfig => {
  const rawDatabaseURL = String(config.databaseURL || '').trim();
  const rawStorageBucket = String(config.storageBucket || '').trim();
  const databaseURL = !rawDatabaseURL || /europe-west1\.firebasedatabase\.app/i.test(rawDatabaseURL)
    ? CANONICAL_FIREBASE_DATABASE_URL
    : rawDatabaseURL;
  const storageBucket = !rawStorageBucket || /appspot\.com/i.test(rawStorageBucket)
    ? CANONICAL_FIREBASE_STORAGE_BUCKET
    : rawStorageBucket;

  if (!isValidDatabaseURL(databaseURL)) {
    throw new Error(`misconfigured_database_url: ${databaseURL}`);
  }

  if (!/firebasestorage\.app/i.test(storageBucket)) {
    throw new Error(`misconfigured_storage_bucket: ${storageBucket}`);
  }

  return { ...config, databaseURL, storageBucket };
};

export const getFirebaseRuntimeConfig = (): FirebaseRuntimeConfig => requireCanonicalFirebaseConfig({
  apiKey: getExtra('firebaseApiKey') || getEnv('FIREBASE_API_KEY'),
  authDomain: getExtra('firebaseAuthDomain') || getEnv('FIREBASE_AUTH_DOMAIN'),
  databaseURL: getExtra('firebaseDatabaseURL') || getEnv('FIREBASE_DATABASE_URL'),
  projectId: getExtra('firebaseProjectId') || getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getExtra('firebaseStorageBucket') || getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getExtra('firebaseMessagingSenderId') || getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getExtra('firebaseAppId') || getEnv('FIREBASE_APP_ID'),
  measurementId: getExtra('firebaseMeasurementId') || getEnv('FIREBASE_MEASUREMENT_ID'),
});

// В LOCAL_MODE Firebase не нужен — подставляем заглушку, чтобы импорты не падали
export const firebaseConfig = LOCAL_MODE
  ? {
      apiKey: 'local-dev',
      authDomain: 'local.firebaseapp.com',
      databaseURL: 'https://local-default-rtdb.firebaseio.com',
      projectId: 'local-dev',
      storageBucket: 'local-dev.appspot.com',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:0000000000000000',
    }
  : getFirebaseRuntimeConfig();

// HMR-safe: не пересоздаём app если уже существует
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let authInstance;
if (Platform.OS !== 'web') {
  try {
    // require() resolves to the React Native-specific Firebase Auth bundle in Metro,
    // which exports getReactNativePersistence. Static ES imports do not include it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
    };
    if (typeof getReactNativePersistence !== 'function') {
      throw new Error('getReactNativePersistence not available in this bundle');
    }
    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage) as never,
    });
  } catch (e) {
    // getAuth() returns the existing instance if auth was already initialized (e.g. HMR),
    // which already has AsyncStorage persistence — no data loss in that case.
    // Only if the persistence module truly failed to load will the session not survive restarts.
    authInstance = getAuth(firebaseApp);
    if (!String(e).includes('already-initialized')) {
      console.warn('[firebase-core] AsyncStorage auth persistence unavailable, using in-memory:', e);
    }
  }
} else {
  authInstance = getAuth(firebaseApp);
}

export const auth = authInstance;
export const database = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);

if (Platform.OS !== 'web') {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    const extra = Constants.expoConfig?.extra || {};
    const webClientIdDev =
      extra.googleWebClientIdDev ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_DEV ||
      extra.googleWebClientId;
    const webClientIdProd =
      extra.googleWebClientIdProd ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_PROD ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      extra.googleWebClientId;
    const webClientId = (__DEV__ ? webClientIdDev : webClientIdProd) || '';

    if (!webClientId) {
      console.error('[firebase-core] Google webClientId is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_DEV / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_PROD in environment or app.config.js extra.');
    } else {
      GoogleSignin.configure({ webClientId, offlineAccess: false });
    }
  } catch (googleConfigError) {
    console.warn('[firebase-core] Google Sign-in native module unavailable:', googleConfigError instanceof Error ? googleConfigError.message : String(googleConfigError));
  }
}
