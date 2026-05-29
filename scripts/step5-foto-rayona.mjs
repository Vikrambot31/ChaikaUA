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

const PHOTOS = [
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg04.jpg'),
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg05.jpg'),
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg06.jpg'),
];

async function main() {
  console.log('=== Шаг 5: Фото района (Foto-Rayona) — быстрая загрузка ===\n');

  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();
  const bucket = admin.storage().bucket();

  console.log(`Бот: ${BOT.name}\n`);

  // --- Проверка ---
  const profile = (await db.ref(`users/${BOT.uid}`).once('value')).val();
  console.log(`[Преграда #1] Аватар: ${Boolean(profile?.photoURL?.trim()) ? '✅' : '❌'}`);

  for (const p of PHOTOS) {
    const exists = fs.existsSync(p);
    console.log(`[Преграда #2] Файл ${path.basename(p)}: ${exists ? `✅ ${(fs.statSync(p).size / 1024).toFixed(1)} KB` : '❌'}`);
    if (!exists) process.exit(1);
  }
  console.log('');

  // --- Загрузка батча фото (как в Foto-Rayona: 3 фото за раз) ---
  const results = [];
  for (let i = 0; i < PHOTOS.length; i++) {
    const photoPath = PHOTOS[i];
    const fileName = path.basename(photoPath);
    const ts = Date.now() + i;
    const storagePath = `community_photos/${BOT.uid}/fotorayona_${ts}.jpg`;

    console.log(`📤 [${i + 1}/${PHOTOS.length}] Загружаю ${fileName}...`);
    await bucket.file(storagePath).save(fs.readFileSync(photoPath), {
      metadata: { contentType: 'image/jpeg', metadata: { uploadedBy: BOT.uid, source: 'bot_test_step5' } },
    });
    await bucket.file(storagePath).makePublic().catch(() => {});

    // Создаём запись в community_photos (как в photoAPI.addPhoto)
    const photoRecord = {
      title: 'Фото Чайки',
      imageUri: storagePath,
      storagePath,
      uploadedBy: BOT.name,
      uploadedByEmail: BOT.email,
      createdAt: ts,
      uploadedAt: ts,
      status: 'pending',
      safetyStatus: 'pending',
      target: 'gallery_public',
      sourceScreen: 'FotoRayonaScreen',
      sourceScreenLabel: 'Фото района',
      sourceFeature: 'district_gallery_quick_upload',
      likes: 0,
      userId: BOT.uid,
    };

    const pushResult = await db.ref('community_photos').push(photoRecord);
    const id = pushResult.key || 'unknown';
    results.push({ file: fileName, id, storagePath });
    console.log(`  ✅ Запись создана! ID: ${id}`);
  }

  // --- Итог ---
  console.log('\n--- Результаты батча ---');
  for (const r of results) {
    const saved = (await db.ref(`community_photos/${r.id}`).once('value')).val();
    console.log(`  ${r.file}: status=${saved.status}, safety=${saved.safetyStatus}, storagePath=${saved.storagePath.slice(0, 50)}...`);
  }

  console.log(`\n=== Шаг 5 завершён (загружено ${results.length} фото) ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
