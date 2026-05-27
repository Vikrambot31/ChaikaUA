import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const TIMEOUT_MS = 20_000;

const parseArgs = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    options[key.slice(2)] = !next || next.startsWith('--') ? true : next;
    if (next && !next.startsWith('--')) i += 1;
  }
  return options;
};

const withTimeout = (promise, label, timeoutMs = TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout after ${timeoutMs}ms`)), timeoutMs)),
]);

const contentTypeFor = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
};

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const target = String(options.target || '').trim();
  const filePath = options.file ? path.resolve(String(options.file)) : '';
  const cleanup = Boolean(options.cleanup);

  if (target !== 'photo_uploads' && target !== 'community_photos') {
    throw new Error('Usage: node scripts/upload-test-photo.mjs --target photo_uploads|community_photos --file <path> [--cleanup]');
  }
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`init_failed: file not found: ${filePath || '<missing>'}`);
  }

  const config = getFirebaseAdminConfig();
  if (admin.apps.length === 0) admin.initializeApp(config);
  const db = admin.database();
  const bucket = admin.storage().bucket(config.storageBucket);
  const now = Date.now();
  const originalName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const storagePath = `${target}/test_upload/${now}_${originalName}`;
  const dbRef = db.ref(target).push();

  try {
    const bytes = fs.readFileSync(filePath);
    await withTimeout(bucket.file(storagePath).save(bytes, {
      contentType: contentTypeFor(filePath),
      resumable: false,
      metadata: { metadata: { source: 'upload-test-photo', target } },
    }), 'storage_upload');
    console.log(`Storage uploaded: ${storagePath}`);
  } catch (error) {
    throw new Error(`storage_upload_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const basePayload = {
    storagePath,
    status: 'approved',
    testUpload: true,
    source: 'upload-test-photo',
  };
  const payload = target === 'photo_uploads'
    ? {
        ...basePayload,
        uid: 'test_upload',
        userName: 'Test Upload',
        uploadedAt: now,
        downloadUrl: storagePath,
      }
    : {
        ...basePayload,
        title: 'Test photo',
        description: 'Created by upload-test-photo.mjs',
        imageUri: storagePath,
        createdAt: now,
        uploadedAt: now,
        target: 'gallery_public',
        uploadedBy: 'Test Upload',
        userId: 'test_upload',
        likes: 0,
      };

  try {
    await withTimeout(dbRef.set(payload), 'db_write');
    const snapshot = await withTimeout(dbRef.once('value'), 'db_read');
    if (!snapshot.exists()) throw new Error('written record not found');
    console.log(`DB written: ${target}/${dbRef.key}`);
  } catch (error) {
    throw new Error(`db_write_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (cleanup) {
    await withTimeout(Promise.all([
      dbRef.remove(),
      bucket.file(storagePath).delete({ ignoreNotFound: true }),
    ]), 'cleanup');
    console.log('Cleanup ok');
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
