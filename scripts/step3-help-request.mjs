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
  phone: '+380671000001',
  uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
  avatarKey: '1',
};

const PHOTO_PATH = path.join(ROOT, 'assets', 'Chaika foto galary', 'cg01.jpg');

const maskPhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const visible = digits.slice(0, 5) + '***' + digits.slice(-2);
  return '+' + visible;
};

async function main() {
  console.log('=== Шаг 3: Запрос помощи (Zapros-Pomoshi) ===\n');

  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();

  console.log(`Бот: ${BOT.name} (UID: ${BOT.uid})\n`);

  // --- Проверка преград ---
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();
  const hasAvatar = Boolean(profile?.photoURL?.trim());
  console.log(`[Преграда #1] Аватар: ${hasAvatar ? '✅' : '❌'}`);

  if (!fs.existsSync(PHOTO_PATH)) {
    console.error(`❌ Файл не найден: ${PHOTO_PATH}`);
    process.exit(1);
  }
  const photoSize = fs.statSync(PHOTO_PATH).size;
  console.log(`[Преграда #2] Файл фото: ✅ ${path.basename(PHOTO_PATH)} (${(photoSize / 1024).toFixed(1)} KB)`);

  // --- Загрузка фото в Firebase Storage ---
  console.log('\n📤 Загружаю фото в Firebase Storage...');
  const bucket = admin.storage().bucket();
  const storagePath = `requests/${BOT.uid}/help_request_${Date.now()}.jpg`;
  const file = bucket.file(storagePath);

  await file.save(fs.readFileSync(PHOTO_PATH), {
    metadata: {
      contentType: 'image/jpeg',
      metadata: { uploadedBy: BOT.uid, source: 'bot_test_step3' },
    },
  });

  // Make publicly readable (like the app does)
  await file.makePublic().catch(() => {});
  const [publicUrl] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' }).catch(() => ['']);

  console.log(`  Storage path: ${storagePath}`);
  console.log(`  Public URL: ${publicUrl ? '✅ получен' : '⚠️ не получен'}`);

  // --- Формирование запроса помощи ---
  // Luca: доставка и покупки (delivery) → Аптека/лекарства (pharmacy)
  const helpType = 'delivery';
  const subType = 'pharmacy';
  const category = 'delivery'; // CATEGORY_MAP[delivery] = 'delivery'
  const description = 'Терміново потрібні ліки для дитини. Аптека на вул. Шевченка, 12. Хто може привезти сьогодні до вечора?';

  const now = Date.now();
  const TTL_MS = 10 * 24 * 60 * 60 * 1000; // category 'delivery' → group 'care' → 10 days

  const newRequest = {
    userId: BOT.uid,
    name: BOT.name,
    phone: maskPhone(BOT.phone),
    category: 'delivery',
    group: 'care',
    subcategory: 'delivery',
    store: '',
    timeSlot: '',
    destination: '',
    building: 'Чайка',
    text: description,
    description,
    language: 'ru',
    status: 'pending',
    isApproved: false,
    isCensored: false,
    requiresManualModeration: true,
    submittedForModerationAt: new Date().toISOString(),
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    status_priority: 'pending_02_standard',
    photoUri: '',
    photoStoragePath: storagePath,
    timestamp: now,
    createdAt: now,
    expires_at: now + TTL_MS,
  };

  console.log('\n--- Данные запроса ---');
  console.log(`  Тип помощи: delivery (Доставка та покупки)`);
  console.log(`  Уточнение: pharmacy (Аптека / лекарства)`);
  console.log(`  Описание: "${description}"`);
  console.log(`  Фото: ${storagePath}`);
  console.log(`  Статус: pending\n`);

  // --- Отправка ---
  console.log('📤 Отправляю запрос помощи...');
  const requestsRef = db.ref('requests');
  const pushResult = await requestsRef.push(newRequest);

  if (!pushResult.key) {
    console.error('❌ Firebase не вернул ID');
    process.exit(1);
  }

  console.log(`✅ Запрос создан! ID: ${pushResult.key}`);

  // rate_limits
  await db.ref(`rate_limits/${BOT.uid}/requests/lastAt`).set(now).catch(() => {});

  // --- Проверка ---
  const saved = (await db.ref(`requests/${pushResult.key}`).once('value')).val();
  console.log('\n--- Проверка ---');
  console.log(`  name:        ${saved.name}`);
  console.log(`  category:    ${saved.category}`);
  console.log(`  group:       ${saved.group}`);
  console.log(`  status:      ${saved.status}`);
  console.log(`  photoExists: ${Boolean(saved.photoStoragePath)}`);
  console.log(`  expires_at:  ${new Date(saved.expires_at).toISOString()}`);

  console.log('\n=== Шаг 3 завершён ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
