/**
 * audit-my-photos.mjs
 *
 * 1. Аудит: проверяет состояние user_photos в RTDB для всех 10 ботов
 * 2. Тест-загрузка: создаёт реальную запись user_photos/{uid} от имени Luca Moretti
 *    (имитирует полный путь PhotoUploadEngine для экрана "Мои фотографии")
 *
 * Запуск: node scripts/audit-my-photos.mjs
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// ─── Бот для загрузки ────────────────────────────────────────────────────────
const BOT = {
  name:  'Luca Moretti',
  email: 'luca.moretti@chaika-bot.test',
  uid:   '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
};

// Используем несколько кандидатов — берём первый существующий файл
const PHOTO_CANDIDATES = [
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg03.jpg'),
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg01.jpg'),
  path.join(ROOT, 'assets', 'Chaika foto galary', 'cg05.jpg'),
];

const ALL_BOTS = [
  { name: 'Luca Moretti',        uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73' },
  { name: 'Giulia Romano',       uid: '9rKrBVsQKAPflSblhpeWkM5wIDv1' },
  { name: 'Matteo Bianchi',      uid: 'YFqlL7WuosMgJrAdXcVvefGDrdz2' },
  { name: 'Sofia Conti',         uid: null },
  { name: 'Alessandro Ricci',    uid: null },
  { name: 'Francesca Gallo',     uid: null },
  { name: 'Davide Esposito',     uid: null },
  { name: 'Chiara Lombardi',     uid: null },
  { name: 'Marco Santoro',       uid: null },
  { name: 'Elena Ferrara',       uid: null },
];

function pad(str, len) {
  return String(str).padEnd(len);
}

async function auditUserPhotos(db) {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' АУДИТ: user_photos в RTDB');
  console.log('══════════════════════════════════════════════════════');

  let totalPhotos = 0;
  const statusCounts = { not_submitted: 0, pending: 0, approved: 0, rejected: 0, unknown: 0 };

  for (const bot of ALL_BOTS) {
    if (!bot.uid) {
      console.log(`  ${pad(bot.name, 22)} — uid не задан, пропуск`);
      continue;
    }

    const snap = await db.ref(`user_photos/${bot.uid}`).once('value');
    if (!snap.exists()) {
      console.log(`  ${pad(bot.name, 22)} — нет записей в user_photos`);
      continue;
    }

    const photos = snap.val();
    const entries = Object.entries(photos);
    totalPhotos += entries.length;

    const counts = { not_submitted: 0, pending: 0, approved: 0, rejected: 0, unknown: 0 };
    let hasUrlIssue = 0;
    let hasStoragePathAsUrl = 0;

    for (const [key, val] of entries) {
      // Определяем status (движок пишет оба поля)
      const modStat = val.moderationStatus;
      const stat    = val.status;
      const resolved = ['not_submitted','pending','approved','rejected'].includes(modStat)
        ? modStat
        : ['not_submitted','pending','approved','rejected'].includes(stat)
          ? stat
          : 'unknown';
      counts[resolved] = (counts[resolved] || 0) + 1;
      statusCounts[resolved] = (statusCounts[resolved] || 0) + 1;

      // Проверка imageUri: должен быть https://, не storagePath
      const uri = val.imageUri || '';
      if (!uri) hasUrlIssue++;
      else if (!uri.startsWith('https://')) hasStoragePathAsUrl++;
    }

    const issues = [];
    if (hasUrlIssue > 0)          issues.push(`⚠️  ${hasUrlIssue} фото без imageUri`);
    if (hasStoragePathAsUrl > 0)  issues.push(`🔴 ${hasStoragePathAsUrl} фото: imageUri = storagePath (не URL)`);

    const countStr = Object.entries(counts)
      .filter(([,v]) => v > 0)
      .map(([k,v]) => `${k}:${v}`)
      .join('  ');

    console.log(`  ${pad(bot.name, 22)} — ${pad(entries.length + ' фото', 9)}  [${countStr}]${issues.length ? '  ' + issues.join(', ') : ''}`);
  }

  console.log(`\n  Итого фото: ${totalPhotos}`);
  console.log(`  Статусы: ${JSON.stringify(statusCounts)}`);
}

async function auditCommunityPhotos(db) {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' АУДИТ: community_photos в RTDB (для сравнения)');
  console.log('══════════════════════════════════════════════════════');

  const snap = await db.ref('community_photos').orderByChild('status').once('value');
  if (!snap.exists()) {
    console.log('  Нет данных в community_photos');
    return;
  }

  const photos = snap.val();
  const entries = Object.entries(photos);
  const statusCounts = {};
  let hasUrlIssue = 0;
  let hasStoragePathAsUrl = 0;

  for (const [, val] of entries) {
    const s = val.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;

    const uri = val.imageUri || '';
    if (!uri) hasUrlIssue++;
    else if (!uri.startsWith('https://')) hasStoragePathAsUrl++;
  }

  console.log(`  Всего: ${entries.length} фото`);
  console.log(`  Статусы: ${JSON.stringify(statusCounts)}`);
  if (hasUrlIssue > 0)         console.log(`  ⚠️  ${hasUrlIssue} фото без imageUri`);
  if (hasStoragePathAsUrl > 0) console.log(`  🔴 ${hasStoragePathAsUrl} фото: imageUri — не URL (storagePath)`);
}

async function testUploadToUserPhotos(db) {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' ТЕСТ-ЗАГРУЗКА: user_photos (экран "Мои фотографии")');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Бот: ${BOT.name} (${BOT.email})`);
  console.log(`  UID: ${BOT.uid}`);

  // Выбрать файл
  const sourcePath = PHOTO_CANDIDATES.find(p => fs.existsSync(p));
  if (!sourcePath) {
    console.error('❌ Не найден ни один исходный файл фото:', PHOTO_CANDIDATES);
    return;
  }
  const fileSizeKb = (fs.statSync(sourcePath).size / 1024).toFixed(1);
  console.log(`  Файл: ${path.basename(sourcePath)} (${fileSizeKb} KB)`);

  // Загрузить в Firebase Storage → user_photos/{uid}/
  const bucket = admin.storage().bucket();
  const fileName = `user_photo_${Date.now()}.jpg`;
  const storagePath = `user_photos/${BOT.uid}/${fileName}`;

  console.log(`\n  📤 Загрузка в Storage: ${storagePath} ...`);
  await bucket.file(storagePath).save(fs.readFileSync(sourcePath), {
    metadata: {
      contentType: 'image/jpeg',
      metadata: {
        uploadedBy: BOT.uid,
        source: 'audit_script',
        target: 'my_photos',
      },
    },
  });

  // Получить публичный download URL (как делает PhotoUploadEngine)
  const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: '03-01-2030',
  });
  console.log(`  ✅ Storage upload OK`);
  console.log(`  🔗 Download URL: ${signedUrl.slice(0, 80)}...`);

  // Thumbnail — имитируем (просто ссылаемся на тот же файл для теста)
  const thumbnailStoragePath = `thumbnails/user_photos/${BOT.uid}/thumb_${fileName}`;
  await bucket.file(thumbnailStoragePath).save(fs.readFileSync(sourcePath), {
    metadata: { contentType: 'image/jpeg' },
  });
  const [thumbnailUrl] = await bucket.file(thumbnailStoragePath).getSignedUrl({
    action: 'read',
    expires: '03-01-2030',
  });

  // Записать в RTDB user_photos/{uid} — точно как PhotoUploadEngine
  const now = Date.now();
  const rtdbPayload = {
    storagePath,
    imageUri: signedUrl,               // ← должен быть https:// URL
    status: 'saved',                    // ← как пишет engine для personal photo
    uploadStatus: 'saved',
    moderationStatus: 'not_submitted',  // ← UI читает это поле
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    uid: BOT.uid,
    userId: BOT.uid,
    uploadedBy: BOT.name,
    target: 'my_photos',
    title: 'Тест аудит — вид на сквер',
    thumbnailUrl,
    source: 'audit_script_my_photos',
  };

  console.log('\n  📝 Пишем в RTDB user_photos/' + BOT.uid + ' ...');
  const newRef = db.ref(`user_photos/${BOT.uid}`).push();
  await newRef.set(rtdbPayload);
  const rtdbId = newRef.key;
  console.log(`  ✅ RTDB запись создана! ID: ${rtdbId}`);
  console.log(`  Path: user_photos/${BOT.uid}/${rtdbId}`);

  // Верификация
  const saved = (await db.ref(`user_photos/${BOT.uid}/${rtdbId}`).once('value')).val();
  console.log('\n  ── Верификация ──────────────────────────────────');
  console.log(`  moderationStatus : ${saved.moderationStatus}`);
  console.log(`  status           : ${saved.status}`);
  console.log(`  imageUri OK      : ${saved.imageUri?.startsWith('https://') ? '✅' : '❌ ' + saved.imageUri?.slice(0, 40)}`);
  console.log(`  thumbnailUrl OK  : ${saved.thumbnailUrl?.startsWith('https://') ? '✅' : '❌'}`);
  console.log(`  uid              : ${saved.uid}`);
  console.log(`  uploadedBy       : ${saved.uploadedBy}`);

  console.log('\n  ✅ Тест-загрузка завершена успешно!');
  console.log('  В приложении у Luca Moretti должна появиться запись в "Мои фотографии"');
  console.log('  со статусом "Збережено" (not_submitted) — до модерации.');

  return { rtdbId, storagePath };
}

async function analyzeCodeBugs() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' АНАЛИЗ КОДА: причины статусов "Ошибка" и "Ожидание"');
  console.log('══════════════════════════════════════════════════════');

  const bugs = [
    {
      id: 'BUG-1',
      severity: '🔴 КРИТИЧ.',
      title: 'Фото навсегда застревает в очереди после 3 неудач',
      file: 'src/photo-module/UploadQueue.ts:193',
      desc: 'Когда retryCount >= MAX_RETRY_COUNT=3, задача пропускается (continue), ' +
            'но НЕ удаляется из очереди. Очередь (MAX=5) засоряется навсегда. ' +
            'Новые фото не могут быть добавлены — enqueue() возвращает false.',
      cause: 'status=error',
    },
    {
      id: 'BUG-2',
      severity: '🔴 КРИТИЧ.',
      title: 'imageUri в RTDB = storagePath, не download URL',
      file: 'scripts/step4-upload-photo.mjs:67 (старый скрипт)',
      desc: 'Старый скрипт записывал `imageUri: storagePath` (gs:// путь), ' +
            'а не публичный https:// URL. Такие фото не открываются в AppPhotoImage. ' +
            'Новый PhotoUploadEngine это исправил — записывает downloadUrl.',
      cause: 'photos broken in UI',
    },
    {
      id: 'BUG-3',
      severity: '🟡 СРЕДНИЙ',
      title: 'status="ожидание" (queued) после перезапуска приложения',
      file: 'src/photo-module/UploadQueue.ts',
      desc: 'После перезапуска приложения AsyncStorage сохраняет очередь. ' +
            'UploadQueue.process() вызывается только при useFocusEffect. ' +
            'Если пользователь открыл экран, но сеть отсутствует — фото ' +
            'остаётся в статусе "queued" до следующего фокуса на экране.',
      cause: 'status=queued',
    },
    {
      id: 'BUG-4',
      severity: '🟡 СРЕДНИЙ',
      title: 'uid="unknown" при отсутствии авторизации в очереди',
      file: 'src/photo-module/UploadQueue.ts:215',
      desc: 'Если task.uid и photo.userId оба пустые — uid="unknown". ' +
            'Фото уходит в user_photos/unknown/ — никогда не появится в экране пользователя. ' +
            'ensureFirebaseAuth() может вернуть другой uid, чем ожидается.',
      cause: 'status=uploaded но фото не видно',
    },
    {
      id: 'BUG-5',
      severity: '🟡 СРЕДНИЙ',
      title: 'displayedLocalPhotos не чистится после успешного upload',
      file: 'src/photo-module/MyPhotosScreen.tsx:257',
      desc: 'Фото с status="uploaded" фильтруется из displayedLocalPhotos — ' +
            'это правильно. НО: ImageStorage.subscribe() уведомляет ВСЕХ подписчиков ' +
            'после updatePhoto(). Если между uploaded → RTDB listener задержка, ' +
            'фото на мгновение исчезает из обоих списков (мигание UI).',
      cause: 'UX bug',
    },
    {
      id: 'BUG-6',
      severity: '🟢 ИНФО',
      title: 'ensureFirebaseAuth() блокирует upload при expired session',
      file: 'src/photo-module/PhotoUploadEngine.ts:161',
      desc: 'Если Firebase Auth token истёк (особенно у anonymous пользователей), ' +
            'ensureFirebaseAuth() пробует refreshToken. При неудаче — выбрасывает ошибку. ' +
            'Все 3 попытки провалятся → status=error. ' +
            'Retry с кнопки "обновить" тоже провалится до перезапуска приложения.',
      cause: 'status=error',
    },
  ];

  for (const bug of bugs) {
    console.log(`\n  ${bug.id} ${bug.severity} — ${bug.title}`);
    console.log(`    Файл   : ${bug.file}`);
    console.log(`    Причина: ${bug.desc}`);
    console.log(`    Результат в UI: ${bug.cause}`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  АУДИТ: Экран "Мои Фотографии" — статусы и баги     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  let serviceAccount;
  try {
    serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  } catch (err) {
    console.error('❌ Не найден service account:', SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.firebasestorage.app',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();

  // 1. Аудит состояния в RTDB
  await auditUserPhotos(db);
  await auditCommunityPhotos(db);

  // 2. Анализ причин багов
  await analyzeCodeBugs();

  // 3. Тест-загрузка
  await testUploadToUserPhotos(db);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Готово                                              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Критическая ошибка:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
