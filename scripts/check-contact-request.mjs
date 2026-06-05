import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '..', 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com'
});

const db = admin.database();

const VIKRAM_UID = 'wH533Huw2EUV94XIABaN8cCdhRw1';
const BOT_UID   = 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2';

async function check() {
  // 1. Прямо проверить запись
  const snap = await db.ref(`profileViewRequests/${VIKRAM_UID}/${BOT_UID}`).once('value');
  console.log('\n1. Direct path profileViewRequests/VIKRAM/BOT:');
  console.log('   exists:', snap.exists());
  if (snap.exists()) console.log('   value:', JSON.stringify(snap.val(), null, 4));

  // 2. Все дочерние узлы profileViewRequests/VIKRAM
  const allSnap = await db.ref(`profileViewRequests/${VIKRAM_UID}`).once('value');
  console.log('\n2. All children at profileViewRequests/VIKRAM:');
  console.log('   exists:', allSnap.exists());
  if (allSnap.exists()) {
    const keys = Object.keys(allSnap.val());
    console.log('   keys:', keys);
  }

  // 3. Профиль Викрама
  const userSnap = await db.ref(`users/${VIKRAM_UID}`).once('value');
  if (userSnap.exists()) {
    const u = userSnap.val();
    console.log(`\n3. Vikram profile: name="${u.name}", registrationStatus="${u.registrationStatus}"`);
  }

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
