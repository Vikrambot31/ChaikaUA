import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

const BOT = {
  name: 'Luca Moretti',
  email: 'luca.moretti@chaika-bot.test',
  uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
};

const SOURCE_PHOTO = path.join(ROOT, 'assets', 'Chaika foto galary', 'cg03.jpg');

async function main() {
  console.log('=== Шаг 4: Загрузить фото в галерею (Zagruzka-Foto) ===\n');

  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();

  console.log(`Бот: ${BOT.name} (${BOT.email})\n`);

  // --- Проверка преград ---
  const profile = (await db.ref(`users/${BOT.uid}`).once('value')).val();
  console.log(`[Преграда #1] Аватар: ${Boolean(profile?.photoURL?.trim()) ? '✅' : '❌'}`);
  console.log(`[Преграда #2] Файл фото: ${fs.existsSync(SOURCE_PHOTO) ? `✅ ${(fs.statSync(SOURCE_PHOTO).size / 1024).toFixed(1)} KB` : '❌'}`);
  if (!fs.existsSync(SOURCE_PHOTO)) process.exit(1);

  // --- Загрузка фото в Firebase Storage ---
  console.log('\n📤 Загружаю фото в Firebase Storage...');
  const bucket = admin.storage().bucket();
  const storagePath = `community_photos/${BOT.uid}/gallery_${Date.now()}.jpg`;
  await bucket.file(storagePath).save(fs.readFileSync(SOURCE_PHOTO), {
    metadata: { contentType: 'image/jpeg', metadata: { uploadedBy: BOT.uid, source: 'bot_test_step4' } },
  });
  await bucket.file(storagePath).makePublic().catch(() => {});
  console.log(`  Storage path: ${storagePath} ✅`);

  // --- Создание записи в community_photos ---
  const now = Date.now();
  const photoRecord = {
    title: 'Вид на сквер біля Чайки',
    description: 'Ранкове фото скверу, гарне освітлення після дощу',
    imageUri: storagePath,
    uploadedBy: BOT.name,
    uploadedByEmail: BOT.email,
    createdAt: now,
    uploadedAt: now,
    status: 'pending',
    safetyStatus: 'pending',
    target: 'gallery_public',
    sourceScreen: 'PhotoUploadScreen',
    sourceScreenLabel: 'Добавить фото',
    sourceFeature: 'gallery_full_form',
    locationLabel: 'Сквер',
    likes: 0,
    userId: BOT.uid,
    storagePath,
  };

  console.log('\n--- Данные фото ---');
  console.log(`  Название: ${photoRecord.title}`);
  console.log(`  Описание: ${photoRecord.description}`);
  console.log(`  Категория: Сквер`);
  console.log(`  Статус: pending (модерация)`);

  const communityRef = db.ref('community_photos');
  const pushResult = await communityRef.push(photoRecord);
  if (!pushResult.key) {
    console.error('❌ Не удалось создать запись');
    process.exit(1);
  }
  console.log(`\n✅ Запись создана! ID: ${pushResult.key}`);
  console.log(`  Путь: /community_photos/${pushResult.key}`);

  // --- Проверка ---
  const saved = (await db.ref(`community_photos/${pushResult.key}`).once('value')).val();
  console.log('\n--- Проверка ---');
  console.log(`  title:       ${saved.title}`);
  console.log(`  status:      ${saved.status}`);
  console.log(`  safety:      ${saved.safetyStatus}`);
  console.log(`  target:      ${saved.target}`);
  console.log(`  userId:      ${saved.userId}`);
  console.log(`  storagePath: ${saved.storagePath}`);
  console.log(`  location:    ${saved.locationLabel}`);

  console.log('\n=== Шаг 4 завершён ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
