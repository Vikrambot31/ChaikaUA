import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(
  ROOT,
  'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json',
);

const BOT = {
  name: 'Luca Moretti',
  email: 'luca.moretti@chaika-bot.test',
  phone: '+380671000001',
  uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
  avatarKey: '1',
  apartment: '47',
};

async function main() {
  console.log('=== Шаг 1: Выбор аватарки ===\n');

  // 1. Init Firebase Admin
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });
  const db = admin.database();
  const uid = BOT.uid;

  console.log(`Бот: ${BOT.name} (${BOT.email})`);
  console.log(`UID: ${uid}`);
  console.log(`Аватар: #${BOT.avatarKey}\n`);

  // 2. Check current state
  const snapBefore = await db.ref(`users/${uid}`).once('value');
  const profileBefore = snapBefore.val();
  console.log('--- Текущий профиль (ДО) ---');
  console.log(`  photoURL:       ${JSON.stringify(profileBefore?.photoURL)}`);
  console.log(`  photoURLs:      ${JSON.stringify(profileBefore?.photoURLs)}`);
  console.log(`  startAvatarKey: ${JSON.stringify(profileBefore?.startAvatarKey)}`);
  console.log(`  registrationStatus: ${profileBefore?.registrationStatus}\n`);

  // 3. Simulate avatar selection (like StartAvatarPickerScreen.confirm())
  const avatarUri = `start-avatar://${BOT.avatarKey}`;
  console.log('--- Выполняю "saveSelectedStartAvatar" + "updateProfileRecord" ---');
  console.log(`  Устанавливаю photoURL:      "${avatarUri}"`);
  console.log(`  Устанавливаю photoURLs:     ["${avatarUri}"]`);
  console.log(`  Устанавливаю startAvatarKey: "${BOT.avatarKey}"`);

  await db.ref(`users/${uid}`).update({
    photoURL: avatarUri,
    photoURLs: [avatarUri],
    startAvatarKey: BOT.avatarKey,
    updatedAt: Date.now(),
  });

  // 4. Verify
  const snapAfter = await db.ref(`users/${uid}`).once('value');
  const profileAfter = snapAfter.val();
  console.log('\n--- Профиль (ПОСЛЕ) ---');
  console.log(`  photoURL:       ${JSON.stringify(profileAfter?.photoURL)}`);
  console.log(`  photoURLs:      ${JSON.stringify(profileAfter?.photoURLs)}`);
  console.log(`  startAvatarKey: ${JSON.stringify(profileAfter?.startAvatarKey)}`);

  // 5. Check that validateSubmissionRequirements will now pass
  const hasAvatar = Boolean(profileAfter?.photoURL?.trim());
  console.log(`\n--- Проверка validateSubmissionRequirements ---`);
  console.log(`  hasAvatar (Boolean(photoURL?.trim())): ${hasAvatar}`);
  console.log(`  userId: ${Boolean(uid)}`);
  console.log(`  Результат: ${uid && hasAvatar ? '✅ ПРОЙДЕН' : '❌ НЕ ПРОЙДЕН'}`);

  console.log('\n=== Шаг 1 завершён ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
