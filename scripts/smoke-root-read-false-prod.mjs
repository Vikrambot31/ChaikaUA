import admin from 'firebase-admin';
import 'dotenv/config';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import {
  getDatabase,
  get,
  push,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';

const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.DATABASE_URL || '';
const apiKey = process.env.FIREBASE_API_KEY || '';
const authDomain = process.env.FIREBASE_AUTH_DOMAIN || 'chaikaua-3cd9d.firebaseapp.com';
const projectId = process.env.FIREBASE_PROJECT_ID || 'chaikaua-3cd9d';
const ownerUid = process.env.SMOKE_OWNER_UID || 'LfqIMCAyEzLAb7TNc83lYGW9RiV2';
const runId = `root_read_false_${Date.now()}`;
const userUid = `smoke_user_${Date.now()}`;

if (!databaseURL) throw new Error('Missing FIREBASE_DATABASE_URL');
if (!apiKey) throw new Error('Missing FIREBASE_API_KEY');

admin.initializeApp({ databaseURL });

const app = initializeApp({
  apiKey,
  authDomain,
  databaseURL,
  projectId,
});

const auth = getAuth(app);
const db = getDatabase(app);
const adminDb = admin.database();

const cleanupPaths = [];
const results = [];

async function asUser(uid) {
  const token = await admin.auth().createCustomToken(uid);
  const credential = await signInWithCustomToken(auth, token);
  return credential.user;
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error?.message || String(error) });
    console.log(`[FAIL] ${name}: ${error?.message || String(error)}`);
  }
}

async function writeAndCleanup(path, value) {
  await set(ref(db, path), value);
  cleanupPaths.push(path);
}

async function pushAndCleanup(path, value) {
  const itemRef = push(ref(db, path));
  await set(itemRef, value);
  cleanupPaths.push(`${path}/${itemRef.key}`);
  return itemRef.key;
}

async function cleanup() {
  for (const path of cleanupPaths.reverse()) {
    await adminDb.ref(path).remove().catch(() => undefined);
  }
  await signOut(auth).catch(() => undefined);
  await deleteApp(app).catch(() => undefined);
  await Promise.all(admin.apps.map((adminApp) => adminApp.delete().catch(() => undefined)));
}

try {
  await check('login', async () => {
    const user = await asUser(userUid);
    if (user.uid !== userUid) throw new Error(`Unexpected uid ${user.uid}`);
  });

  await check('AppAccessGuard', async () => {
    await get(ref(db, 'security_config/app_control/current'));
    await writeAndCleanup(`authorized_devices/${userUid}/${runId}`, {
      device_id: runId,
      device_name: 'Root Read False Smoke',
      platform: 'test',
      app_version: 'smoke',
      created_at: Date.now(),
      last_seen_at: Date.now(),
      is_allowed: true,
      is_blocked: false,
      security_flags: ['smoke'],
    });
    await get(ref(db, `authorized_devices/${userUid}/${runId}`));
  });

  await check('profile', async () => {
    await writeAndCleanup(`users/${userUid}`, {
      name: 'Smoke User',
      phone: `+1000${Date.now()}`,
      createdAt: Date.now(),
    });
    await get(ref(db, `users/${userUid}`));
  });

  await check('ProfileRequests', async () => {
    await get(ref(db, `outgoingProfileRequestsByUser/${userUid}`));
    await get(ref(db, `profileViewRequests/${userUid}`));
  });

  await check('requests', async () => {
    const id = await pushAndCleanup('requests', {
      userId: userUid,
      category: 'smoke',
      status: 'pending',
      timestamp: Date.now(),
      createdAt: Date.now(),
      title: 'Smoke request',
    });
    await get(ref(db, `requests/${id}`));
  });

  await check('buy/sell', async () => {
    const id = await pushAndCleanup('buy_sell_listings', {
      userId: userUid,
      moderationStatus: 'pending',
      createdAt: Date.now(),
      title: 'Smoke buy sell',
      category: 'smoke',
    });
    await get(ref(db, `buy_sell_listings/${id}`));
  });

  await check('contacts_listings', async () => {
    const id = await pushAndCleanup('contacts_listings', {
      userId: userUid,
      moderationStatus: 'pending',
      createdAt: Date.now(),
      title: 'Smoke contact',
    });
    await get(ref(db, `contacts_listings/${id}`));
  });

  await check('referrals', async () => {
    const phone = `1000${Date.now()}`;
    await update(ref(db, `users/${userUid}`), { phone });
    await writeAndCleanup(`referrals/${phone}/${phone}`, {
      createdAt: Date.now(),
      userId: userUid,
    });
    await get(ref(db, `referrals/${phone}`));
  });

  await check('photo uploads', async () => {
    const id = await pushAndCleanup('photo_uploads', {
      uid: userUid,
      status: 'pending',
      uploadedAt: Date.now(),
      storagePath: `smoke/${runId}.jpg`,
    });
    await get(ref(db, `photo_uploads/${id}`));
  });

  await check('OSBB', async () => {
    const buildingId = `smoke_${runId}`;
    await writeAndCleanup(`osbb_members/${buildingId}/${userUid}`, {
      userId: userUid,
      buildingId,
      createdAt: Date.now(),
    });
    const voteId = await pushAndCleanup(`osbb_votes/${buildingId}`, {
      title: 'Smoke vote',
      createdAt: Date.now(),
      moderationStatus: 'pending',
    });
    const topicId = await pushAndCleanup(`osbb_house_topics/${buildingId}`, {
      title: 'Smoke topic',
      createdAt: Date.now(),
      moderationStatus: 'pending',
    });
    const collectionId = await pushAndCleanup(`osbb_collections/${buildingId}`, {
      title: 'Smoke collection',
      createdAt: Date.now(),
      moderationStatus: 'pending',
    });
    const newsId = await pushAndCleanup(`osbb_news/${buildingId}`, {
      title: 'Smoke news',
      publishedAt: Date.now(),
      moderationStatus: 'pending',
    });
    await get(ref(db, `osbb_votes/${buildingId}/${voteId}`));
    await get(ref(db, `osbb_house_topics/${buildingId}/${topicId}`));
    await get(ref(db, `osbb_collections/${buildingId}/${collectionId}`));
    await get(ref(db, `osbb_news/${buildingId}/${newsId}`));
  });

  await check('logout', async () => {
    await signOut(auth);
    if (auth.currentUser) throw new Error('Still signed in');
  });

  await check('admin panel', async () => {
    await asUser(ownerUid);
    await get(ref(db, 'users'));
    await get(ref(db, 'user_roles'));
    await get(ref(db, 'authorized_devices'));
    await get(ref(db, 'security_logs/client_events'));
  });

  await check('moderation', async () => {
    await get(ref(db, 'requests'));
    await get(ref(db, 'community_photos'));
    await get(ref(db, 'buy_sell_listings'));
    await get(ref(db, 'contacts_listings'));
    await get(ref(db, 'job_listings'));
    await get(ref(db, 'lost_found'));
    await get(ref(db, 'local_business'));
    await get(ref(db, 'osbb_news'));
    await get(ref(db, 'osbb_votes'));
    await get(ref(db, 'osbb_house_topics'));
    await get(ref(db, 'osbb_collections'));
  });

  await check('diagnostics', async () => {
    await get(ref(db, 'diagnostics/runtime'));
    await get(ref(db, 'diagnostics/runtime_moderation'));
    await get(ref(db, 'diagnostics/user_reports'));
    await get(ref(db, 'diagnostics/photo_test_logs'));
  });
} finally {
  await cleanup();
}

const failed = results.filter((result) => result.status === 'FAIL');
console.log('');
console.log('--- Smoke Summary ---');
console.table(results);

if (failed.length > 0) {
  process.exitCode = 1;
}
