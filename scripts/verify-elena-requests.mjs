import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');
const ELENA_UID = 'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2';

async function main() {
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  const config = getFirebaseAdminConfig();
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount.default), ...config });
  }
  const db = admin.database();

  console.log('\n=== VERIFICATION ===\n');

  // 1. User profile
  const userSnap = await db.ref(`users/${ELENA_UID}`).once('value');
  const user = userSnap.val();
  if (user) {
    console.log(`[OK] User: ${user.name}`);
    console.log(`     Avatar key: ${user.startAvatarKey}`);
    console.log(`     PhotoURL: ${user.photoURL}`);
    console.log(`     Profession: ${user.profession}`);
    console.log(`     Gender: ${user.gender}, Age: ${user.age}`);
  } else {
    console.log('[FAIL] User profile not found!');
  }

  // 2. Requests by Elena
  const allReqs = await db.ref('requests').orderByChild('userId').equalTo(ELENA_UID).once('value');
  const reqs = allReqs.val();
  const reqCount = reqs ? Object.keys(reqs).length : 0;
  console.log(`\n[COUNT] requests: ${reqCount}`);
  if (reqs) {
    for (const [id, r] of Object.entries(reqs)) {
      console.log(`  - ${r.category}: status=${r.status}, group=${r.group || '-'}, textLen=${r.text?.length || 0}`);
    }
  }

  // 3. Count items in other paths by userId
  const checks = [
    { path: 'job_listings', label: 'job_listings' },
    { path: 'buy_sell_listings', label: 'buy_sell_listings' },
    { path: 'lost_found', label: 'lost_found' },
    { path: 'contacts_listings', label: 'contacts_listings' },
  ];
  for (const c of checks) {
    const snap = await db.ref(c.path).orderByChild('userId').equalTo(ELENA_UID).once('value');
    const val = snap.val();
    console.log(`[COUNT] ${c.label}: ${val ? Object.keys(val).length : 0}`);
  }

  // 4. Community photos
  const photosSnap = await db.ref('community_photos').orderByChild('userId').equalTo(ELENA_UID).once('value');
  const photos = photosSnap.val();
  console.log(`[COUNT] community_photos: ${photos ? Object.keys(photos).length : 0}`);
  if (photos) {
    for (const [id, p] of Object.entries(photos)) {
      console.log(`  - ${p.sourceScreen || '?'}: ${p.title || 'no title'}, hasPhoto: ${Boolean(p.storagePath)}`);
    }
  }

  // 5. OSBB items
  const osbbPaths = ['osbb_news/1', 'osbb_collections/1', 'osbb_votes/1', 'osbb_finances/1/payments'];
  for (const osp of osbbPaths) {
    const snap = await db.ref(osp).once('value');
    const val = snap.val();
    console.log(`[COUNT] ${osp}: ${val ? Object.keys(val).length : 0}`);
  }

  // 6. Sports
  const sportSnap = await db.ref('sports/football/players').once('value');
  const sp = sportSnap.val();
  console.log(`[COUNT] sports/football/players: ${sp ? Object.keys(sp).length : 0}`);
  const hasElena = sp && ELENA_UID in sp;
  console.log(`       Elena registered: ${hasElena ? 'YES' : 'NO'}`);

  // 7. Rating
  const ratingSnap = await db.ref(`ratings/Чайка_1/${ELENA_UID}`).once('value');
  console.log(`[CHECK] rating: ${ratingSnap.exists() ? 'OK' : 'MISSING'}`);

  console.log('\n=== VERIFICATION COMPLETE ===\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
