/**
 * Matteo Bianchi — upload a photo to "Фото Района" (community_photos)
 * Steps:
 *   1. Check current profile state
 *   2. Set avatar if missing (obstacle check)
 *   3. Check trusted/invite_access role (obstacle check)
 *   4. Upload test image to Storage (community_photos/)
 *   5. Create community_photos RTDB record
 *   6. Verify record exists
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

const BOT = {
  name:      'Matteo Bianchi',
  email:     'matteo.bianchi@chaika-bot.test',
  uid:       'YFqlL7WuosMgJrAdXcVvefGDrdz2',
  avatarKey: '3',
};

// Use one of the district gallery images as the "test photo"
const TEST_PHOTO = path.join(ROOT, 'assets', 'Chaika foto galary', 'cg07.jpg');

const OBSTACLES = [];
function obstacle(id, msg, resolved) {
  OBSTACLES.push({ id, msg, resolved });
  const icon = resolved ? '✅ ВИРІШЕНО' : '❌ БЛОК';
  console.log(`  [Преграда #${id}] ${icon} — ${msg}`);
}
const ok  = (s, m) => console.log(`  ✅ [${s}] ${m}`);
const inf = (s, m) => console.log(`  ℹ️  [${s}] ${m}`);
const err = (s, m) => { console.error(`  ❌ [${s}] ${m}`); process.exit(1); };

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Matteo Bianchi → Фото Района — повна сесія завантаження');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Init Firebase ────────────────────────────────────────────────────────────
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) err('Init', `Service account not found: ${SERVICE_ACCOUNT_PATH}`);
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db     = admin.database();
  const bucket = admin.storage().bucket();
  ok('Init', 'Firebase Admin SDK ініціалізовано');

  // ── Step 1: Check profile ────────────────────────────────────────────────────
  console.log('\n━━━ Крок 1: Профіль ━━━\n');
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile     = profileSnap.val();

  if (!profile) err('Profile', `Профіль users/${BOT.uid} не знайдено`);
  inf('Profile', `Знайдено: email=${profile.email || '—'}, role=${profile.role || '—'}`);
  inf('Profile', `photoURL=${profile.photoURL || '(порожньо)'}`);
  inf('Profile', `registrationStatus=${profile.registrationStatus || '—'}`);
  inf('Profile', `inviteAccess.status=${profile.inviteAccess?.status || '—'}`);

  // ── Step 2: Avatar (обов'язково перед заявками) ──────────────────────────────
  console.log('\n━━━ Крок 2: Аватар (обов\'язкова умова) ━━━\n');
  const hasAvatar = Boolean(profile.photoURL?.trim());
  if (!hasAvatar) {
    obstacle(1, 'Аватар відсутній — validateSubmissionRequirements заблокує відправку', true);
    const avatarUri = `start-avatar://${BOT.avatarKey}`;
    await db.ref(`users/${BOT.uid}`).update({
      photoURL:       avatarUri,
      photoURLs:      [avatarUri],
      startAvatarKey: BOT.avatarKey,
      updatedAt:      Date.now(),
    });
    ok('Avatar', `Аватар встановлено: ${avatarUri}`);
  } else {
    ok('Avatar', `Аватар вже є: ${profile.photoURL}`);
  }

  // ── Step 3: Trusted access check ─────────────────────────────────────────────
  console.log('\n━━━ Крок 3: Роль / Доступ ━━━\n');
  const inviteStatus  = profile.inviteAccess?.status;
  const trustedAccess = ['approved', 'temporary_access', 'whitelist_access'].includes(inviteStatus);
  const roleTrusted   = profile.role === 'trusted' || profile.role === 'admin';

  if (!trustedAccess && !roleTrusted) {
    obstacle(2, `inviteAccess.status="${inviteStatus}" — екран FotoRayonaScreen потребує trusted. withGuard заблокує перехід на екран.`, true);
    await db.ref(`users/${BOT.uid}/inviteAccess`).update({
      status:     'approved',
      grantedAt:  Date.now(),
      grantedBy:  'matteo-foto-rayona-script',
    });
    ok('TrustedAccess', 'inviteAccess.status → approved');
  } else {
    ok('TrustedAccess', `Доступ є: inviteAccess.status=${inviteStatus}, role=${profile.role}`);
  }

  // ── Step 4: Check test photo file ────────────────────────────────────────────
  console.log('\n━━━ Крок 4: Тестовий файл фото ━━━\n');
  if (!fs.existsSync(TEST_PHOTO)) {
    obstacle(3, `Файл тестового фото не знайдено: ${TEST_PHOTO}`, false);
    err('Photo', 'Неможливо продовжити без файлу фото');
  }
  const fileSize = (fs.statSync(TEST_PHOTO).size / 1024).toFixed(1);
  ok('Photo', `Файл є: ${path.basename(TEST_PHOTO)} (${fileSize} KB)`);

  // ── Step 5: Upload to Firebase Storage ───────────────────────────────────────
  console.log('\n━━━ Крок 5: Завантаження у Firebase Storage ━━━\n');
  const ts          = Date.now();
  const storagePath = `community_photos/${BOT.uid}/matteo_test_${ts}.jpg`;

  inf('Storage', `Шлях: ${storagePath}`);
  try {
    await bucket.file(storagePath).save(fs.readFileSync(TEST_PHOTO), {
      metadata: {
        contentType: 'image/jpeg',
        metadata: { uploadedBy: BOT.uid, source: 'matteo-foto-rayona-test' },
      },
    });
    await bucket.file(storagePath).makePublic().catch(() => {});
    ok('Storage', `Файл завантажено у Storage ✓`);
  } catch (e) {
    obstacle(4, `Storage upload failed: ${e.message}`, false);
    err('Storage', e.message);
  }

  // ── Step 6: Write RTDB record (community_photos) ─────────────────────────────
  console.log('\n━━━ Крок 6: Запис у RTDB community_photos ━━━\n');
  const record = {
    title:             'Тестове фото — Маттео Б.',
    imageUri:          storagePath,
    storagePath,
    uploadedBy:        BOT.name,
    uploadedByEmail:   BOT.email,
    createdAt:         ts,
    uploadedAt:        ts,
    status:            'pending',
    safetyStatus:      'pending',
    target:            'gallery_public',
    sourceScreen:      'FotoRayonaScreen',
    sourceScreenLabel: 'Фото района',
    sourceFeature:     'district_gallery_quick_upload',
    likes:             0,
    userId:            BOT.uid,
  };

  let recordId;
  try {
    const pushResult = await db.ref('community_photos').push(record);
    recordId = pushResult.key;
    ok('RTDB', `Запис створено: /community_photos/${recordId}`);
  } catch (e) {
    obstacle(5, `RTDB write failed: ${e.message}`, false);
    err('RTDB', e.message);
  }

  // ── Step 7: Verify ────────────────────────────────────────────────────────────
  console.log('\n━━━ Крок 7: Перевірка запису ━━━\n');
  const saved = (await db.ref(`community_photos/${recordId}`).once('value')).val();
  if (!saved) {
    obstacle(6, 'Запис не підтверджено — зчитати з RTDB не вдалося', false);
    err('Verify', 'Record not found after write');
  }
  ok('Verify', `title="${saved.title}"`);
  ok('Verify', `status="${saved.status}", safetyStatus="${saved.safetyStatus}"`);
  ok('Verify', `userId="${saved.userId}"`);
  ok('Verify', `storagePath="${saved.storagePath}"`);

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' ПІДСУМОК ПРЕГРАД');
  console.log('═══════════════════════════════════════════════════════════\n');
  if (OBSTACLES.length === 0) {
    console.log('  Жодних преград не виявлено — шлях чистий.\n');
  } else {
    for (const o of OBSTACLES) {
      const icon = o.resolved ? '✅' : '❌';
      console.log(`  ${icon} #${o.id} — ${o.msg}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(` ФОТО ЗАВАНТАЖЕНО ✓`);
  console.log(` ID: /community_photos/${recordId}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error('Фатальна помилка:', e);
  process.exit(1);
});
