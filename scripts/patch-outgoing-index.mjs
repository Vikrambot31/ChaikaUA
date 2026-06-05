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

const VIKRAM_UID = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2';
const BOT_UID    = 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2';

async function patch() {
  console.log('\n🔧 Patching missing outgoingProfileRequestsByUser entry...\n');

  // 1. Read the existing profileViewRequests entry (source of truth)
  const snap = await db.ref(`profileViewRequests/${VIKRAM_UID}/${BOT_UID}`).once('value');
  if (!snap.exists()) {
    console.error('❌ profileViewRequests entry not found');
    process.exit(1);
  }
  const payload = snap.val();
  console.log('✓ Read profileViewRequests entry:', JSON.stringify(payload, null, 2));

  // 2. Write the same payload to outgoingProfileRequestsByUser (mirrored index)
  //    This is what the normal requestView() flow creates but our script missed.
  await db.ref(`outgoingProfileRequestsByUser/${BOT_UID}/${VIKRAM_UID}`).set(payload);
  console.log('✓ Created outgoingProfileRequestsByUser/BOT/VIKRAM');

  // 3. Verify
  const outSnap = await db.ref(`outgoingProfileRequestsByUser/${BOT_UID}/${VIKRAM_UID}`).once('value');
  console.log('\n✅ Verification:');
  console.log('  outgoing entry exists:', outSnap.exists());
  console.log('  status:', outSnap.val()?.status);

  console.log('\n✨ Now "Дозволити" should work — Firebase can update both nodes.\n');

  process.exit(0);
}

patch().catch(e => { console.error(e); process.exit(1); });
