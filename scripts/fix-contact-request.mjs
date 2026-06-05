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

const WRONG_UID  = 'wH533Huw2EUV94XIABaN8cCdhRw1'; // PSY-ARMOR-UA -Vikram-
const RIGHT_UID  = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2'; // Викрам (vikramsave@ukr.net)
const BOT_UID    = 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2'; // Sofia Conti

async function fix() {
  console.log('\n🔧 Fixing contact request — moving to correct Vikram UID...\n');

  // 1. Delete wrong request
  await db.ref(`profileViewRequests/${WRONG_UID}/${BOT_UID}`).remove();
  console.log('✓ Deleted wrong request (PSY-ARMOR-UA -Vikram-)');

  // 2. Create correct request
  const timestamp = new Date().toISOString();
  const request = {
    requesterId: BOT_UID,
    requesterName: 'Sofia Conti',
    requesterPhotoURL: 'start-avatar://4',
    requesterPhone: '+380671000004',
    targetUserId: RIGHT_UID,
    targetName: 'Викрам',
    requestedAt: timestamp,
    createdAt: timestamp,
    context: 'help',
    status: 'pending',
    reason: 'by_services',
    sourceType: 'direct',
    sourceId: 'initial-contact',
    sourceTitle: "Бажаю зв'язатися"
  };

  await db.ref(`profileViewRequests/${RIGHT_UID}/${BOT_UID}`).set(request);
  console.log('✓ Created correct request for Викрам (vikramsave@ukr.net)');

  // 3. Verify
  const snap = await db.ref(`profileViewRequests/${RIGHT_UID}`).once('value');
  const keys = snap.exists() ? Object.keys(snap.val()) : [];
  console.log(`\n✅ profileViewRequests/VIKRAM now has ${keys.length} request(s):`, keys);
  console.log('\n✨ Check Profile → "Хочуть зв\'язатись" → "Вхідні"\n');

  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
