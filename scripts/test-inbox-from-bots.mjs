/**
 * TEST SCRIPT: Inbox Notification System
 * Sends 5 contact requests from different bots to the admin user
 * to verify the new inbox notification feature works correctly.
 *
 * Usage: node scripts/test-inbox-from-bots.mjs
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '..', 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Service account key not found:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
});

const db = admin.database();

// Admin UID (Vikram — the receiver)
const ADMIN_UID = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2';
const ADMIN_NAME = 'Vikram';

// 5 different bots — different screens / contexts / reasons
const TEST_MESSAGES = [
  {
    botUid:  '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
    name:    'Luca Moretti',
    phone:   '+380671000001',
    avatar:  'start-avatar://1',
    context: 'help',
    reason:  'by_issue',
    sourceTitle: 'Допоможіть з доставкою ліків',
    sourceType:  'help_request',
    label:   'Екран: Допомога сусідам',
  },
  {
    botUid:  'NzvDAlsLqPde8ueOvtZvY2zwy1Q2',
    name:    'Sofia Conti',
    phone:   '+380671000004',
    avatar:  'start-avatar://4',
    context: 'lyudi',
    reason:  'acquaintance',
    sourceTitle: 'Хочу познайомитися, я нова мешканка',
    sourceType:  'profile_view',
    label:   'Екран: Люди Чайки',
  },
  {
    botUid:  'cwwaHrtU2lNz5niY7NC3lMUM1hA3',
    name:    'Davide Esposito',
    phone:   '+380671000007',
    avatar:  'start-avatar://1',
    context: 'buysell',
    reason:  'by_listing',
    sourceTitle: 'Продаю Honda Civic 2018, зацікавило ваше оголошення',
    sourceType:  'buy_sell',
    label:   'Екран: Купити/Продати',
  },
  {
    botUid:  'hSscTmJTKtTsI6pXeWePtWazDe83',
    name:    'Francesca Gallo',
    phone:   '+380671000006',
    avatar:  'start-avatar://6',
    context: 'help',
    reason:  'by_services',
    sourceTitle: 'Шукаю волонтера для допомоги літнім людям',
    sourceType:  'help_request',
    label:   'Екран: Запити допомоги',
  },
  {
    botUid:  'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2',
    name:    'Elena Ferrara',
    phone:   '+380671000010',
    avatar:  'start-avatar://4',
    context: 'job',
    reason:  'by_services',
    sourceTitle: 'Вакансія контент-редактора в спільноті Чайки',
    sourceType:  'job_search',
    label:   'Екран: Пошук роботи',
  },
];

async function clearOldTestRequests() {
  console.log('🧹 Clearing previous test requests...');
  const updates = {};
  for (const msg of TEST_MESSAGES) {
    updates[`profileViewRequests/${ADMIN_UID}/${msg.botUid}`] = null;
    updates[`outgoingProfileRequestsByUser/${msg.botUid}/${ADMIN_UID}`] = null;
  }
  await db.ref().update(updates);
  console.log('   ✓ Cleared\n');
}

async function sendBotMessage(msg, delayMs) {
  await new Promise((r) => setTimeout(r, delayMs));

  const now = new Date();
  // Stagger timestamps so they appear in different order in the list
  const ts = new Date(now.getTime() - delayMs).toISOString();

  const request = {
    requesterId:       msg.botUid,
    requesterName:     msg.name,
    requesterPhotoURL: msg.avatar,
    requesterPhone:    msg.phone,
    targetUserId:      ADMIN_UID,
    targetName:        ADMIN_NAME,
    requestedAt:       ts,
    createdAt:         ts,
    context:           msg.context,
    status:            'pending',
    reason:            msg.reason,
    sourceType:        msg.sourceType,
    sourceId:          `test-${msg.botUid.slice(0, 8)}`,
    sourceTitle:       msg.sourceTitle,
  };

  const updates = {
    [`profileViewRequests/${ADMIN_UID}/${msg.botUid}`]:           request,
    [`outgoingProfileRequestsByUser/${msg.botUid}/${ADMIN_UID}`]: request,
  };

  await db.ref().update(updates);

  console.log(`   ✅ [${msg.label}]`);
  console.log(`      From:    ${msg.name}`);
  console.log(`      Context: ${msg.context} / ${msg.reason}`);
  console.log(`      Source:  "${msg.sourceTitle}"\n`);
}

async function verifyRequests() {
  console.log('🔍 Verifying requests in Firebase...');
  const snap = await db.ref(`profileViewRequests/${ADMIN_UID}`).once('value');
  const data = snap.val() || {};

  let found = 0;
  for (const msg of TEST_MESSAGES) {
    const record = data[msg.botUid];
    if (record && record.status === 'pending') {
      found++;
    } else {
      console.warn(`   ⚠️  Missing or wrong status for ${msg.name}`);
    }
  }

  console.log(`   ✓ ${found}/${TEST_MESSAGES.length} requests verified in DB\n`);
  return found;
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  INBOX SYSTEM TEST — Sending bot messages to admin');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Target: ${ADMIN_NAME} (${ADMIN_UID})\n`);

  try {
    await clearOldTestRequests();

    console.log('📨 Sending messages from 5 bots...\n');
    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      await sendBotMessage(TEST_MESSAGES[i], i * 300);
    }

    const verified = await verifyRequests();

    console.log('═══════════════════════════════════════════════════════');
    if (verified === TEST_MESSAGES.length) {
      console.log('  ✅ ALL TESTS PASSED');
      console.log('  → Open the app → you should see the envelope icon');
      console.log(`  → Badge should show: ${TEST_MESSAGES.length}`);
      console.log('  → Tap it → "Вам повідомлення" inbox with 5 cards');
      console.log('  → Tap any card → opens ProfileRequestsScreen');
    } else {
      console.log(`  ⚠️  PARTIAL: ${verified}/${TEST_MESSAGES.length} verified`);
    }
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTest();
