/**
 * elena-ferrara-test.mjs
 *
 * Комплексний тест від імені Elena Ferrara.
 * Проходить по всіх екранах додатку, де можна подати заявку/заповнити форму.
 * Логує помилки та проблеми.
 *
 * Запуск: node scripts/elena-ferrara-test.mjs
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

const BOT = {
  name: 'Elena Ferrara',
  email: 'elena.ferrara@chaika-bot.test',
  phone: '+380671000010',
  uid: 'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2',
  avatarKey: '4',
  about: 'Вмію писати ясні, коректні та безпечні тексти для широкої аудиторії. Швидко приводжу будь-яку "сиру" заявку в акуратний формат, що не порушує правила спілкування.',
  profession: 'Контент-редактор та модератор онлайн-спільнот',
};

const LOG = [];
function log(section, status, message, detail = '') {
  LOG.push({ section, status, message, detail });
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : status === 'ERROR' ? '❌' : status === 'SKIP' ? '⏭️' : '—';
  console.log(`  ${icon} [${section}] ${message}${detail ? '\n       ' + detail : ''}`);
}

function logError(section, message, detail = '') {
  log(section, 'ERROR', message, detail);
}

function logOk(section, message) {
  log(section, 'OK', message);
}

function logWarn(section, message, detail = '') {
  log(section, 'WARN', message, detail);
}

function logSkip(section, message) {
  log(section, 'SKIP', message);
}

function createPendingModeration() {
  return {
    moderationStatus: 'pending',
    submittedForModerationAt: new Date().toISOString(),
  };
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const visible = digits.slice(0, 5) + '***' + digits.slice(-2);
  return '+' + visible;
}

function getTTL(category) {
  const map = {
    medicine: 10, repair: 10, psychology: 15, transport: 7,
    shopping: 7, documents: 14, other: 15, electricity: 3,
    delivery: 10, problem: 30,
  };
  return (map[category] || 15) * 24 * 60 * 60 * 1000;
}

function sanitizeText(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

// --- Стандартні поля для /requests (як у firebaseChatAPI.addRequest) ---
function makeRequestRecord(bot, { category, group, subcategory, text, building = 'Чайка', phone, name }) {
  const now = Date.now();
  const pending = createPendingModeration();
  const TTL = getTTL(category);
  return {
    name: sanitizeText(name || bot.name),
    phone: maskPhone(phone || bot.phone),
    language: 'ua',
    category,
    group,
    subcategory: subcategory || category,
    store: '',
    timeSlot: '',
    destination: '',
    building,
    text: sanitizeText(text),
    description: sanitizeText(text),
    userId: bot.uid,
    userPhotoURL: `start-avatar://${bot.avatarKey}`,
    startAvatarKey: bot.avatarKey,
    photoUri: '',
    photoStoragePath: '',
    timestamp: now,
    createdAt: now,
    expires_at: now + TTL,
    status: 'pending',
    isApproved: false,
    isCensored: false,
    requiresManualModeration: true,
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    status_priority: 'pending_02_standard',
    ...pending,
  };
}

// ====================================================================
//  1. ПЕРЕВІРКА ПРОФІЛЮ
// ====================================================================
async function checkProfile(db) {
  console.log('\n━━━ [1] ПЕРЕВІРКА ПРОФІЛЮ ━━━\n');
  const snap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = snap.val();

  if (!profile) {
    logError('Profile', 'Профіль не знайдено в Firebase!');
    return false;
  }

  logOk('Profile', `Профіль знайдено: ${profile.name}`);
  const checks = [
    { field: 'photoURL', check: Boolean(profile.photoURL?.trim()), msg: 'Аватар (photoURL)' },
    { field: 'startAvatarKey', check: Boolean(profile.startAvatarKey), msg: 'startAvatarKey' },
    { field: 'name', check: Boolean(profile.name?.trim()), msg: 'Ім\'я (name)' },
    { field: 'phone', check: Boolean(profile.phone?.trim()), msg: 'Телефон (phone)' },
    { field: 'registrationStatus', check: profile.registrationStatus === 'complete', msg: 'registrationStatus = complete' },
  ];

  let allOk = true;
  for (const c of checks) {
    if (c.check) {
      logOk('Profile', `${c.msg}: ${c.check ? '✅' : '❌'} ${profile[c.field] || ''}`);
    } else {
      logError('Profile', `${c.msg} — порожньо або incomplete`);
      allOk = false;
    }
  }

  // invite_access
  const inviteSnap = await db.ref(`invite_access/${BOT.uid}`).once('value');
  const invite = inviteSnap.val();
  if (invite?.status === 'approved') {
    logOk('Profile', `invite_access: ${invite.status}`);
  } else {
    logWarn('Profile', `invite_access: ${invite?.status || 'відсутній'} — деякі екрани можуть бути заблоковані`);
  }

  // user_roles
  const rolesSnap = await db.ref(`user_roles/${BOT.uid}`).once('value');
  const roles = rolesSnap.val();
  if (roles) {
    logOk('Profile', `user_roles: ${JSON.stringify(roles)}`);
  } else {
    logWarn('Profile', 'user_roles: відсутні — користувач без ролі admin/moderator');
  }

  return allOk;
}

// ====================================================================
//  2. OSBB-SETUP — приєднання до ОСББ
// ====================================================================
async function screenOsbbSetup(db) {
  console.log('\n━━━ [2] OSBB-Setup — Приєднання до ОСББ ━━━\n');
  const buildingId = 'lob-15';

  // Check if already a member
  const existing = await db.ref(`osbb_members/${buildingId}/${BOT.uid}`).once('value');
  if (existing.exists()) {
    logSkip('OSBB-Setup', 'Вже є учасником ОСББ');
    return existing.val();
  }

  const memberData = {
    uid: BOT.uid,
    buildingId,
    apartment: '42',
    role: 'resident',
    status: 'approved',
    managerName: null,
    managerPhone: null,
    updatedAt: new Date().toISOString(),
  };

  try {
    await db.ref(`osbb_members/${buildingId}/${BOT.uid}`).set(memberData);
    logOk('OSBB-Setup', `Записано як resident будинку ${buildingId}, кв.42`);

    // Verify
    const saved = await db.ref(`osbb_members/${buildingId}/${BOT.uid}`).once('value');
    if (saved.exists()) {
      const data = saved.val();
      logOk('OSBB-Setup', `Підтверджено: role=${data.role}, status=${data.status}`);
    }
  } catch (err) {
    logError('OSBB-Setup', `Помилка запису: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  3. STATUS-SVETA — статус світла
// ====================================================================
async function screenStatusSveta(db) {
  console.log('\n━━━ [3] Status-Sveta — Статус світла ━━━\n');

  const building = 'вул. Валерія Лобановського, 15';
  const subcategory = 'power_on';

  const record = makeRequestRecord(BOT, {
    category: 'electricity',
    group: 'electricity',
    subcategory,
    text: `⚡ Світло є — Чайка, ${building}`,
    building,
  });
  record.isApproved = true;
  record.status = 'approved';
  record.requiresManualModeration = false;
  record.submittedForModerationAt = new Date().toISOString();

  try {
    const ref = db.ref('requests');
    const result = await ref.push(record);
    logOk('Status-Sveta', `Запис створено: /requests/${result.key}`);
    logOk('Status-Sveta', `Категорія: electricity, статус: є світло`);

    const saved = await db.ref(`requests/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Status-Sveta', `Підтверджено: status=${saved.val().status}, subcategory=${saved.val().subcategory}`);
    }
  } catch (err) {
    logError('Status-Sveta', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  4. PROBLEMY-CHAYKI — проблема ЖК
// ====================================================================
async function screenProblemyChayki(db) {
  console.log('\n━━━ [4] Problemy-Chayki — Проблема ЖК ━━━\n');

  const record = makeRequestRecord(BOT, {
    category: 'problem',
    group: 'problems',
    subcategory: 'management_request',
    text: 'Відсутня дошка оголошень у вестибюлі під\'їзду. Мешканці не отримують важливу інформацію.',
    building: 'Чайка, вул. Валерія Лобановського, 15',
  });

  try {
    const ref = db.ref('requests');
    const result = await ref.push(record);
    logOk('Problemy-Chayki', `Заявку створено: /requests/${result.key}`);
    logOk('Problemy-Chayki', `Категорія: problem, підкатегорія: management_request`);

    const saved = await db.ref(`requests/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Problemy-Chayki', `Підтверджено: status=${saved.val().status}, text="${saved.val().text.slice(0, 50)}..."`);
    }
  } catch (err) {
    logError('Problemy-Chayki', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  5. FORMA-ZAYAVKI — загальна заявка (Допомога сусідам)
// ====================================================================
async function screenFormaZayavki(db) {
  console.log('\n━━━ [5] Forma-Zayavki — Загальна заявка (Допомога сусідам) ━━━\n');

  const record = makeRequestRecord(BOT, {
    category: 'other',
    group: 'help_neighbors',
    subcategory: 'other',
    text: 'Допомога з редагуванням тексту для літніх сусідів. Потрібно перевірити та виправити оголошення для дошки. Маю досвід редактури — можу допомогти безкоштовно.',
    building: 'Чайка',
  });
  record.isApproved = true;
  record.status = 'approved';
  record.requiresManualModeration = false;

  try {
    const ref = db.ref('requests');
    const result = await ref.push(record);
    logOk('Forma-Zayavki', `Заявку створено: /requests/${result.key}`);
    logOk('Forma-Zayavki', `Група: help_neighbors, статус: auto-approved`);

    const saved = await db.ref(`requests/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Forma-Zayavki', `Підтверджено: status=${saved.val().status}, group=${saved.val().group}`);
    }
  } catch (err) {
    logError('Forma-Zayavki', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  6. ZAPROS-POMOSHI — запрос допомоги
// ====================================================================
async function screenZaprosPomoshi(db) {
  console.log('\n━━━ [6] Zapros-Pomoshi — Запрос допомоги ━━━\n');

  const record = makeRequestRecord(BOT, {
    category: 'other',
    group: 'help_neighbors',
    subcategory: 'other',
    text: 'Потрібен перекладач для спілкування з родиною з-за кордону. Допоможіть перекласти документи та листування. Маю базову англійську, потрібна допомога з італійською.',
    building: 'Чайка',
  });

  try {
    const ref = db.ref('requests');
    const result = await ref.push(record);
    logOk('Zapros-Pomoshi', `Запрос створено: /requests/${result.key}`);
    logOk('Zapros-Pomoshi', `Категорія: other (переклад)`);

    const saved = await db.ref(`requests/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Zapros-Pomoshi', `Підтверджено: status=${saved.val().status}`);
    }
  } catch (err) {
    logError('Zapros-Pomoshi', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  7. KUPLU-PRODAM — куплю/продам
// ====================================================================
async function screenKupluProdam(db) {
  console.log('\n━━━ [7] Kuplu-Prodam — Куплю/Продам ━━━\n');

  const pending = createPendingModeration();
  const now = new Date();
  const TTL_MS = 90 * 24 * 60 * 60 * 1000;

  const listing = {
    itemName: 'Словник італійсько-український',
    category: 'books',
    condition: 'good',
    price: '350',
    description: 'Продам словник італійсько-український. Стан хороший, користувались акуратно. 500 сторінок, тверда обкладинка. Самовивіз з Чайки.',
    phone: BOT.phone,
    photoUri: '',
    photoStoragePath: '',
    photoId: '',
    moderationStatus: pending.moderationStatus,
    submittedForModerationAt: pending.submittedForModerationAt,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    userId: BOT.uid,
    showPhone: true,
    language: 'ua',
  };

  try {
    const ref = db.ref('buy_sell_listings');
    const result = await ref.push(listing);
    logOk('Kuplu-Prodam', `Оголошення створено: /buy_sell_listings/${result.key}`);
    logOk('Kuplu-Prodam', `Товар: "${listing.itemName}", ціна: ${listing.price} грн, стан: good`);

    const saved = await db.ref(`buy_sell_listings/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Kuplu-Prodam', `Підтверджено: moderationStatus=${saved.val().moderationStatus}, category=${saved.val().category}`);
    }
  } catch (err) {
    logError('Kuplu-Prodam', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  8. POISK-RABOTY — пошук роботи (резюме)
// ====================================================================
async function screenPoiskRaboty(db) {
  console.log('\n━━━ [8] Poisk-Raboty — Пошук роботи (резюме) ━━━\n');

  const pending = createPendingModeration();
  const now = new Date();
  const TTL_MS = 60 * 24 * 60 * 60 * 1000;

  const listing = {
    listingKind: 'resume',
    name: BOT.name,
    phone: BOT.phone,
    age: '28',
    workType: 'Редакція та модерація контенту',
    about: 'Досвідчений контент-редактор та модератор онлайн-спільнот. Швидко приводжу тексти до ладу, знаю стандарти безпеки та якості контенту. Шукаю віддалену роботу.',
    photoUri: '',
    photoStoragePath: '',
    moderationStatus: pending.moderationStatus,
    submittedForModerationAt: pending.submittedForModerationAt,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    userId: BOT.uid,
    language: 'ua',
  };

  try {
    const ref = db.ref('job_listings');
    const result = await ref.push(listing);
    logOk('Poisk-Raboty', `Резюме створено: /job_listings/${result.key}`);
    logOk('Poisk-Raboty', `Тип: resume, вік: ${listing.age}, спеціалізація: редактор контенту`);

    const saved = await db.ref(`job_listings/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Poisk-Raboty', `Підтверджено: kind=${saved.val().listingKind}, moderationStatus=${saved.val().moderationStatus}`);
    }
  } catch (err) {
    logError('Poisk-Raboty', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  9. KTO-POTERYAL — потеряно/найдено
// ====================================================================
async function screenKtoPoteryal(db) {
  console.log('\n━━━ [9] Kto-Poteryal — Потеряно/Найдено ━━━\n');

  const pending = createPendingModeration();
  const now = new Date();
  const TTL_MS = 15 * 24 * 60 * 60 * 1000;

  const item = {
    type: 'found',
    name: BOT.name,
    phone: BOT.phone,
    category: 'documents',
    description: 'Знайдено блокнот із записами біля під\'їзду №3 (вул. Лобановського, 15). Всередині особисті нотатки та контакти. Поверну власнику.',
    photoUri: '',
    photoStoragePath: '',
    moderationStatus: pending.moderationStatus,
    submittedForModerationAt: pending.submittedForModerationAt,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    userId: BOT.uid,
    language: 'ua',
  };

  try {
    const ref = db.ref('lost_found');
    const result = await ref.push(item);
    logOk('Kto-Poteryal', `Запис створено: /lost_found/${result.key}`);
    logOk('Kto-Poteryal', `Тип: found, категорія: documents, опис: блокнот із записами`);

    const saved = await db.ref(`lost_found/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Kto-Poteryal', `Підтверджено: type=${saved.val().type}, moderationStatus=${saved.val().moderationStatus}`);
    }
  } catch (err) {
    logError('Kto-Poteryal', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  10. KONTAKT-XXX — контакти Чайки (анкета)
// ====================================================================
async function screenKontaktXxx(db) {
  console.log('\n━━━ [10] Kontakt-XXX — Контакти Чайки ━━━\n');

  const pending = createPendingModeration();
  const now = new Date();
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const contact = {
    itemName: BOT.name,
    category: 'books',
    condition: 'like_new',
    price: '28',
    description: 'Привіт! Я Елена, контент-редактор, живу в Чайці. Шукаю людей для спілкування, обміну книгами та прогулянок районом. Люблю літературу та італійську культуру.',
    phone: BOT.phone,
    photoUri: '',
    photoStoragePath: '',
    photoId: '',
    moderationStatus: pending.moderationStatus,
    submittedForModerationAt: pending.submittedForModerationAt,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    userId: BOT.uid,
    showPhone: true,
    language: 'ua',
  };

  try {
    const ref = db.ref('contacts_listings');
    const result = await ref.push(contact);
    logOk('Kontakt-XXX', `Анкету створено: /contacts_listings/${result.key}`);
    logOk('Kontakt-XXX', `Хто я: books (Хтось для спілкування), шукаю: like_new (Спілкування)`);

    const saved = await db.ref(`contacts_listings/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Kontakt-XXX', `Підтверджено: category=${saved.val().category}, moderationStatus=${saved.val().moderationStatus}`);
    }
  } catch (err) {
    logError('Kontakt-XXX', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  11. ZAGRUZKA-FOTO — завантаження фото в галерею
// ====================================================================
async function screenZagruzkaFoto(db, bucket) {
  console.log('\n━━━ [11] Zagruzka-Foto — Завантаження фото ━━━\n');

  const photoPath = path.join(ROOT, 'assets', 'Chaika foto galary', 'cg03.jpg');
  if (!fs.existsSync(photoPath)) {
    logError('Zagruzka-Foto', `Файл не знайдено: ${photoPath}`);
    return;
  }

  const storagePath = `community_photos/${BOT.uid}/gallery_elena_${Date.now()}.jpg`;

  try {
    // Upload to Storage
    await bucket.file(storagePath).save(fs.readFileSync(photoPath), {
      metadata: { contentType: 'image/jpeg', metadata: { uploadedBy: BOT.uid, source: 'elena_test_photo' } },
    });
    await bucket.file(storagePath).makePublic().catch(() => {});
    logOk('Zagruzka-Foto', `Фото завантажено в Storage: ${storagePath}`);

    // Create DB record
    const now = Date.now();
    const photoRecord = {
      title: 'Ранковий сквер біля Чайки',
      description: 'Тихий ранок у сквері після дощу. Гарне освітлення, свіже листя.',
      imageUri: storagePath,
      storagePath,
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
      locationLabel: 'Сквер, Чайка',
      locationType: 'place',
      likes: 0,
      userId: BOT.uid,
    };

    const ref = db.ref('community_photos');
    const result = await ref.push(photoRecord);
    logOk('Zagruzka-Foto', `Запис фото створено: /community_photos/${result.key}`);

    const saved = await db.ref(`community_photos/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Zagruzka-Foto', `Підтверджено: title="${saved.val().title}", status=${saved.val().status}`);
    }
  } catch (err) {
    logError('Zagruzka-Foto', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  12. FOTO-RAYONA — фото району (швидка загрузка)
// ====================================================================
async function screenFotoRayona(db, bucket) {
  console.log('\n━━━ [12] Foto-Rayona — Фото району ━━━\n');

  const photos = [
    path.join(ROOT, 'assets', 'Chaika foto galary', 'cg04.jpg'),
    path.join(ROOT, 'assets', 'Chaika foto galary', 'cg05.jpg'),
  ];

  for (const p of photos) {
    if (!fs.existsSync(p)) {
      logError('Foto-Rayona', `Файл не знайдено: ${p}`);
      return;
    }
  }

  try {
    const results = [];
    for (let i = 0; i < photos.length; i++) {
      const ts = Date.now() + i;
      const storagePath = `community_photos/${BOT.uid}/fotorayona_elena_${ts}.jpg`;

      await bucket.file(storagePath).save(fs.readFileSync(photos[i]), {
        metadata: { contentType: 'image/jpeg', metadata: { uploadedBy: BOT.uid, source: 'elena_test_fotorayona' } },
      });
      await bucket.file(storagePath).makePublic().catch(() => {});

      const now = Date.now();
      const photoRecord = {
        title: i === 0 ? 'Квітник біля будинку 15' : 'Алея вранці',
        imageUri: storagePath,
        storagePath,
        uploadedBy: BOT.name,
        uploadedByEmail: BOT.email,
        createdAt: now,
        uploadedAt: now,
        status: 'pending',
        safetyStatus: 'pending',
        target: 'gallery_public',
        sourceScreen: 'FotoRayonaScreen',
        sourceScreenLabel: 'Фото района',
        sourceFeature: 'district_gallery_quick_upload',
        likes: 0,
        userId: BOT.uid,
      };

      const ref = db.ref('community_photos');
      const result = await ref.push(photoRecord);
      results.push({ file: photos[i], id: result.key });
    }

    logOk('Foto-Rayona', `Завантажено ${results.length} фото району`);
    for (const r of results) {
      const saved = await db.ref(`community_photos/${r.id}`).once('value');
      if (saved.val()) {
        logOk('Foto-Rayona', `  ${path.basename(r.file)} → status=${saved.val().status} ✅`);
      }
    }
  } catch (err) {
    logError('Foto-Rayona', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  13. PRO-PRILOZHENIE — зворотний зв'язок / пропозиція
// ====================================================================
async function screenProPrilozhenie(db) {
  console.log('\n━━━ [13] Pro-Prilozhenie — Зворотний зв\'язок ━━━\n');

  const suggestion = {
    text: 'Пропозиція: додати шаблони текстів для заявок. Це допоможе новим користувачам швидше створювати якісні заявки та зменшить кількість відхилених публікацій.',
    name: BOT.name,
    phone: BOT.phone,
    userId: BOT.uid,
    moderationStatus: 'pending',
    submittedForModerationAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  try {
    const ref = db.ref('app_suggestions');
    const result = await ref.push(suggestion);
    logOk('Pro-Prilozhenie', `Пропозицію створено: /app_suggestions/${result.key}`);
    logOk('Pro-Prilozhenie', `Текст: "${suggestion.text.slice(0, 60)}..."`);

    const saved = await db.ref(`app_suggestions/${result.key}`).once('value');
    if (saved.val()) {
      logOk('Pro-Prilozhenie', `Підтверджено: moderationStatus=${saved.val().moderationStatus}`);
    }
  } catch (err) {
    logError('Pro-Prilozhenie', `Помилка: ${err.message}`);
    throw err;
  }
}

// ====================================================================
//  14. OSBB-ADD-NEWS (SKIP — requires manager role)
// ====================================================================
async function screenOsbbAddNews(db) {
  console.log('\n━━━ [14] OSBB-AddNews — Додати новину ━━━\n');

  // Check if user is manager
  const membersSnap = await db.ref('osbb_members').once('value');
  const members = membersSnap.val();
  let isManager = false;
  if (members) {
    for (const buildingId of Object.keys(members)) {
      const userEntry = members[buildingId]?.[BOT.uid];
      if (userEntry?.role === 'manager') {
        isManager = true;
        break;
      }
    }
  }

  if (!isManager) {
    logSkip('OSBB-AddNews', 'Потрібна роль manager — Elena є resident. Не може створювати новини ОСББ.');
    logWarn('OSBB-AddNews', 'Це ОЧІКУВАНА поведінка: обмеження за роллю.');
    return;
  }

  // Would create news here if manager
  logSkip('OSBB-AddNews', 'Elena не manager — пропущено.');
}

// ====================================================================
//  15. OSBB-SBOR (SKIP — requires manager role)
// ====================================================================
async function screenOsbbSbor(db) {
  console.log('\n━━━ [15] OSBB-Sbor — Збір коштів ━━━\n');
  logSkip('OSBB-Sbor', 'Потрібна роль manager з canManageCollections. Elena — resident.');
  logWarn('OSBB-Sbor', 'Це ОЧІКУВАНА поведінка: обмеження за роллю.');
}

// ====================================================================
//  16. OSBB-GOLOSOVANIE (SKIP — requires manager role)
// ====================================================================
async function screenOsbbGolosovanie(db) {
  console.log('\n━━━ [16] OSBB-Golosovanie — Голосування ━━━\n');

  // Check if user can vote (needs to be OSBB member)
  const memberSnap = await db.ref('osbb_members/lob-15/' + BOT.uid).once('value');
  if (memberSnap.exists()) {
    logSkip('OSBB-Golosovanie', 'Створення голосувань — тільки для manager, але як resident може голосувати. Потрібна активна кампанія.');
    logWarn('OSBB-Golosovanie', 'Для тесту голосування потрібно спочатку створити голосування через manager.');
  } else {
    logSkip('OSBB-Golosovanie', 'Не є учасником ОСББ — пропущено.');
  }
}

// ====================================================================
//  17. REYTING-DOMOV (Cannot simulate — AsyncStorage only)
// ====================================================================
async function screenReytingDomov() {
  console.log('\n━━━ [17] Reyting-Domov — Рейтинг будинків ━━━\n');
  logSkip('Reyting-Domov', 'Цей екран використовує AsyncStorage (локальне сховище пристрою).');
  logSkip('Reyting-Domov', 'Не можна симулювати через Admin SDK. Потрібна взаємодія через мобільний додаток.');
}

// ====================================================================
//  MAIN
// ====================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Elena Ferrara — Комплексний тест заявок                    ║');
  console.log('║   Мета: створити 1 заявку на кожному екрані               ║');
  console.log('║   Логувати помилки та проблеми                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nБот: ${BOT.name} (${BOT.email})`);
  console.log(`UID: ${BOT.uid}\n`);

  // Init Firebase
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

  // Шаг 1: Проверка профиля
  const profileOk = await checkProfile(db);
  if (!profileOk) {
    console.log('\n❌ Профіль має проблеми — деякі заявки можуть бути заблоковані.');
  }

  // Шаг 2-17: Экраны
  await screenOsbbSetup(db);
  await screenStatusSveta(db);
  await screenProblemyChayki(db);
  await screenFormaZayavki(db);
  await screenZaprosPomoshi(db);
  await screenKupluProdam(db);
  await screenPoiskRaboty(db);
  await screenKtoPoteryal(db);
  await screenKontaktXxx(db);
  await screenZagruzkaFoto(db, bucket);
  await screenFotoRayona(db, bucket);
  await screenProPrilozhenie(db);
  await screenOsbbAddNews(db);
  await screenOsbbSbor(db);
  await screenOsbbGolosovanie(db);
  await screenReytingDomov();

  // ====================================================================
  //  ПІДСУМКОВИЙ ЗВІТ
  // ====================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              ПІДСУМКОВИЙ ЗВІТ                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const ok = LOG.filter(l => l.status === 'OK').length;
  const warn = LOG.filter(l => l.status === 'WARN').length;
  const err = LOG.filter(l => l.status === 'ERROR').length;
  const skip = LOG.filter(l => l.status === 'SKIP').length;

  console.log(`  ✅ Успішно: ${ok}`);
  console.log(`  ⚠️  Попередження: ${warn}`);
  console.log(`  ❌ Помилки: ${err}`);
  console.log(`  ⏭️  Пропущено: ${skip}`);
  console.log(`  ───────────────────────`);
  console.log(`  Всього записів у лозі: ${LOG.length}\n`);

  if (err > 0) {
    console.log('  ❌ Помилки:');
    LOG.filter(l => l.status === 'ERROR').forEach(l => {
      console.log(`    [${l.section}] ${l.message}`);
    });
    console.log('');
  }

  if (warn > 0) {
    console.log('  ⚠️  Спостереження:');
    LOG.filter(l => l.status === 'WARN').forEach(l => {
      console.log(`    [${l.section}] ${l.message}`);
      if (l.detail) console.log(`      → ${l.detail}`);
    });
    console.log('');
  }

  console.log('  Пропущені екрани (потребують особливих ролей/умов):');
  LOG.filter(l => l.status === 'SKIP').forEach(l => {
    console.log(`    ⏭️ [${l.section}] ${l.message}`);
  });

  console.log('\n━━━ Завершено ━━━');
  process.exit(err > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Критична помилка:', err);
  process.exit(1);
});
