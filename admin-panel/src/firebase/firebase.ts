import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const requiredEnv = (name: string): string => {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

export const firebaseConfig = {
  apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  databaseURL: requiredEnv('VITE_FIREBASE_DATABASE_URL'),
  projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('VITE_FIREBASE_APP_ID'),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const database = getDatabase(firebaseApp);
export const storage = getStorage(firebaseApp);
