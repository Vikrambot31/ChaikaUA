import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

const requiredEnv = (name: string): string => {
  if (LOCAL_MODE) return `local-dev-${name}`;
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

export const firebaseConfig = {
  apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: LOCAL_MODE ? 'local.firebaseapp.com' : requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  databaseURL: LOCAL_MODE ? 'https://local-default-rtdb.firebaseio.com' : requiredEnv('VITE_FIREBASE_DATABASE_URL'),
  projectId: LOCAL_MODE ? 'local-dev' : requiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: LOCAL_MODE ? 'local-dev.appspot.com' : requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: LOCAL_MODE ? '000000000000' : requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: LOCAL_MODE ? '1:000000000000:web:0000000000000000' : requiredEnv('VITE_FIREBASE_APP_ID'),
  measurementId: LOCAL_MODE ? undefined : (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined),
};

// HMR-safe: не пересоздаём app если уже существует
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const database = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);
