import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth } from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.FIREBASE_API_KEY,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain || process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: Constants.expoConfig?.extra?.firebaseDatabaseURL || process.env.FIREBASE_DATABASE_URL,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId || process.env.FIREBASE_PROJECT_ID,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: Constants.expoConfig?.extra?.firebaseAppId || process.env.FIREBASE_APP_ID,
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId || process.env.FIREBASE_MEASUREMENT_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

let authInstance;
if (Platform.OS !== 'web') {
  try {
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
    };
    if (typeof getReactNativePersistence !== 'function') {
      throw new Error('React Native auth persistence is unavailable');
    }
    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    authInstance = getAuth(firebaseApp);
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
