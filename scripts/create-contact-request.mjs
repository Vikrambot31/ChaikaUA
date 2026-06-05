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

// Найти пользователя с именем "Vikram"
async function findVikramUser() {
  console.log('🔍 Searching for user named Vikram...');

  const allUsersSnap = await db.ref('users').limitToFirst(2000).once('value');
  const allUsers = allUsersSnap.val() || {};

  for (const [uid, user] of Object.entries(allUsers)) {
    if (user && typeof user.name === 'string' && user.name.includes('Vikram')) {
      console.log(`   ✓ Found: ${user.name} (${uid})`);
      return uid;
    }
  }
  return null;
}

async function createContactRequest() {
  console.log('\n📱 Creating contact request to Vikram...\n');

  const targetUserId = await findVikramUser();
  if (!targetUserId) {
    console.error('❌ Could not find user named Vikram');
    process.exit(1);
  }

  // Bot details (Sofia Conti - UX дизайнер, хороший выбор)
  const BOT_UID = 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2';
  const BOT_NAME = 'Sofia Conti';
  const BOT_PHONE = '+380671000004';

  const timestamp = new Date().toISOString();

  const contactRequest = {
    requesterId: BOT_UID,
    requesterName: BOT_NAME,
    requesterPhotoURL: 'start-avatar://4',
    requesterPhone: BOT_PHONE,
    targetUserId: targetUserId,
    targetName: 'Vikram',
    requestedAt: timestamp,
    createdAt: timestamp,
    context: 'help',
    status: 'pending',
    reason: 'by_services',
    sourceType: 'direct',
    sourceId: 'initial-contact',
    sourceTitle: 'Бажаю зв\'язатися'
  };

  try {
    // Записываем оба узла атомарно — как это делает нормальный requestView()
    // Без outgoingProfileRequestsByUser "Дозволити" получает PERMISSION DENIED
    const updates = {
      [`profileViewRequests/${targetUserId}/${BOT_UID}`]: contactRequest,
      [`outgoingProfileRequestsByUser/${BOT_UID}/${targetUserId}`]: contactRequest,
    };
    await db.ref().update(updates);

    console.log('✅ Contact request created successfully!\n');
    console.log('📌 Request details:');
    console.log('   From:', contactRequest.requesterName);
    console.log('   Phone:', contactRequest.requesterPhone);
    console.log('   To (UID):', targetUserId);
    console.log('   Reason:', contactRequest.reason);
    console.log('   Context:', contactRequest.context);
    console.log('   Status:', contactRequest.status);
    console.log('\n🔗 Database path:', requestPath);
    console.log('\n✨ Check Vikram\'s "Хочуть зв\'язатись" → "Вхідні" tab\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating request:', error.message);
    process.exit(1);
  }
}

createContactRequest();
