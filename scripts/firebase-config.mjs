import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_JSON_PATH = path.join(ROOT, 'app.json');

const envOrExtra = (extra, envKey, extraKey) => {
  const value = process.env[envKey] || extra?.[extraKey] || '';
  return typeof value === 'string' ? value.trim() : '';
};

export function readExpoExtra() {
  const raw = fs.readFileSync(APP_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed?.expo?.extra || {};
}

export function getFirebaseScriptConfig() {
  const extra = readExpoExtra();
  return validateFirebaseScriptConfig({
    apiKey: envOrExtra(extra, 'FIREBASE_API_KEY', 'firebaseApiKey'),
    authDomain: envOrExtra(extra, 'FIREBASE_AUTH_DOMAIN', 'firebaseAuthDomain'),
    databaseURL: envOrExtra(extra, 'FIREBASE_DATABASE_URL', 'firebaseDatabaseURL'),
    projectId: envOrExtra(extra, 'FIREBASE_PROJECT_ID', 'firebaseProjectId'),
    storageBucket: envOrExtra(extra, 'FIREBASE_STORAGE_BUCKET', 'firebaseStorageBucket'),
    messagingSenderId: envOrExtra(extra, 'FIREBASE_MESSAGING_SENDER_ID', 'firebaseMessagingSenderId'),
    appId: envOrExtra(extra, 'FIREBASE_APP_ID', 'firebaseAppId'),
    measurementId: envOrExtra(extra, 'FIREBASE_MEASUREMENT_ID', 'firebaseMeasurementId'),
  });
}

export function validateFirebaseScriptConfig(config) {
  const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'appId'];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`init_failed: missing Firebase config keys: ${missing.join(', ')}`);
  }

  if (!/firebaseio\.com/i.test(config.databaseURL)) {
    throw new Error(`misconfigured_database_url: ${config.databaseURL || 'missing'}`);
  }

  if (/appspot\.com/i.test(config.storageBucket) || !/firebasestorage\.app/i.test(config.storageBucket)) {
    throw new Error(`misconfigured_storage_bucket: ${config.storageBucket || 'missing'}`);
  }

  return config;
}

export function getFirebaseAdminConfig() {
  const config = getFirebaseScriptConfig();
  return {
    databaseURL: config.databaseURL,
    storageBucket: config.storageBucket,
    projectId: config.projectId,
  };
}
