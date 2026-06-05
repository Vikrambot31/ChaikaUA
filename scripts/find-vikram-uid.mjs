import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com'
});

const db = admin.database();
const auth = admin.auth();

async function find() {
  console.log('\n🔍 Searching for Vikram accounts...\n');

  // 1. Search all RTDB users containing vikram/Vikram
  const snap = await db.ref('users').limitToFirst(3000).once('value');
  const users = snap.val() || {};

  const candidates = [];
  for (const [uid, user] of Object.entries(users)) {
    const name = (user?.name || '').toLowerCase();
    const email = (user?.email || '').toLowerCase();
    if (name.includes('vikram') || email.includes('vikram')) {
      candidates.push({ uid, name: user.name, email: user.email, registrationStatus: user.registrationStatus, provider: user.provider });
    }
  }

  console.log('RTDB users found:', candidates.length);
  candidates.forEach(c => console.log('  -', JSON.stringify(c)));

  // 2. Search Firebase Auth by email vikramsave@ukr.net
  console.log('\n🔍 Checking Firebase Auth for vikramsave@ukr.net...');
  try {
    const authUser = await auth.getUserByEmail('vikramsave@ukr.net');
    console.log('  Auth UID:', authUser.uid);
    console.log('  Display name:', authUser.displayName);
    console.log('  Email:', authUser.email);

    // Check if this UID has RTDB profile
    const profileSnap = await db.ref(`users/${authUser.uid}`).once('value');
    if (profileSnap.exists()) {
      const p = profileSnap.val();
      console.log(`  RTDB profile: name="${p.name}", status="${p.registrationStatus}"`);
    } else {
      console.log('  RTDB profile: NOT FOUND');
    }

    // Check profileViewRequests for this UID
    const reqSnap = await db.ref(`profileViewRequests/${authUser.uid}`).once('value');
    console.log('  profileViewRequests exists:', reqSnap.exists(), '| keys:', reqSnap.exists() ? Object.keys(reqSnap.val()).length : 0);

  } catch (e) {
    console.log('  Not found:', e.message);
  }

  process.exit(0);
}

find().catch(e => { console.error(e); process.exit(1); });
