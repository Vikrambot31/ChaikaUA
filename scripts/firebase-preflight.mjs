import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const TIMEOUT_MS = 20_000;
const HEALTH_PATH = '_health/firebase_preflight';
const STORAGE_PATH = '_health/firebase_preflight/preflight.txt';

const withTimeout = (promise, label, timeoutMs = TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout after ${timeoutMs}ms`)), timeoutMs)),
]);

function initAdmin() {
  try {
    const config = getFirebaseAdminConfig();
    if (admin.apps.length === 0) {
      admin.initializeApp(config);
    }
    return config;
  } catch (error) {
    throw new Error(`init_failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run() {
  const config = initAdmin();
  const db = admin.database();
  const bucket = admin.storage().bucket(config.storageBucket);
  const now = Date.now();

  console.log('Firebase config');
  console.log(`RTDB: ${config.databaseURL}`);
  console.log(`Storage: ${config.storageBucket}`);

  try {
    await withTimeout(db.ref(HEALTH_PATH).set({ ok: true, updatedAt: now }), 'rtdb_write');
    const snapshot = await withTimeout(db.ref(HEALTH_PATH).once('value'), 'rtdb_read');
    if (snapshot.val()?.ok !== true) throw new Error('read value mismatch');
    console.log('RTDB ok');
  } catch (error) {
    throw new Error(`db_write_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const [exists] = await withTimeout(bucket.exists(), 'storage_bucket_exists');
    if (!exists) throw new Error('The specified bucket does not exist');
    await withTimeout(bucket.file(STORAGE_PATH).save(Buffer.from(`preflight ${now}\n`, 'utf8'), {
      contentType: 'text/plain; charset=utf-8',
      resumable: false,
      metadata: { metadata: { source: 'firebase-preflight' } },
    }), 'storage_upload');
    const [fileExists] = await withTimeout(bucket.file(STORAGE_PATH).exists(), 'storage_read');
    if (!fileExists) throw new Error('uploaded object not found');
    console.log('Storage ok');
  } catch (error) {
    throw new Error(`storage_upload_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await withTimeout(Promise.all([
      db.ref(HEALTH_PATH).remove(),
      bucket.file(STORAGE_PATH).delete({ ignoreNotFound: true }),
    ]), 'cleanup');
    console.log('Cleanup ok');
  } catch (error) {
    throw new Error(`cleanup_failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
