/**
 * Elena Ferrara — создание 1 заявки на каждый экран с формой
 * Все заявки с фото vv.jpg
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
const VV_JPG_PATH = path.join(ROOT, 'ЗАПУСК АПК', '--Bot-Ai-Klienti', 'Тех задание 5 агентов', 'vv.jpg');

const BOT = {
  name: 'Elena Ferrara',
  email: 'elena.ferrara@chaika-bot.test',
  phone: '+380671000010',
  uid: 'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2',
  avatarKey: '2',
  about: 'Вмію писати ясні, коректні та безпечні тексти для широкої аудиторії.',
  profession: 'Контент-редактор та модератор онлайн-спільнот',
};

const LOG = [];

function log(icon, section, msg, detail = '') {
  LOG.push({ section, icon, msg, detail });
  console.log(`  ${icon} [${section}] ${msg}${detail ? '\n       ' + detail : ''}`);
}
const ok  = (s, m, d) => log('✅', s, m, d);
const wrn = (s, m, d) => log('⚠️', s, m, d);
const err = (s, m, d) => log('❌', s, m, d);
const skp = (s, m)    => log('⏭️', s, m);

function maskPhone(p) {
  const d = p.replace(/\D/g, '');
  return d.length < 7 ? '***' : '+' + d.slice(0,5) + '***' + d.slice(-2);
}

const now = () => Date.now();
const iso = () => new Date().toISOString();

function pendingModeration() {
  return { moderationStatus: 'pending', submittedForModerationAt: iso() };
}

// ====================================================================
//  1. ЗАГРУЗКА vv.jpg В STORAGE
// ====================================================================
async function uploadVV(bucket) {
  console.log('\n━━━ [0] Загрузка vv.jpg в Firebase Storage ━━━\n');
  if (!fs.existsSync(VV_JPG_PATH)) {
    err('Storage', `Файл не найден: ${VV_JPG_PATH}`);
    return null;
  }
  const storagePath = `community_photos/${BOT.uid}/vv_elena_${now()}.jpg`;
  try {
    await bucket.file(storagePath).save(fs.readFileSync(VV_JPG_PATH), {
      metadata: { contentType: 'image/jpeg', metadata: { uploadedBy: BOT.uid, source: 'elena_vv_photo' } },
    });
    await bucket.file(storagePath).makePublic().catch(() => {});
    const publicUrl = `https://storage.googleapis.com/chaikaua-3cd9d.appspot.com/${encodeURIComponent(storagePath)}`;
    ok('Storage', `vv.jpg загружен: ${storagePath}`);
    ok('Storage', `Public URL: ${publicUrl}`);
    return { storagePath, publicUrl };
  } catch (e) {
    err('Storage', `Ошибка загрузки: ${e.message}`);
    return null;
  }
}

// ====================================================================
//  2. FORMA-ZAYAVKI — help_neighbors / transport
// ====================================================================
async function screenFormaZayavki(db, photo) {
  console.log('\n━━━ [1] Forma-Zayavki.tsx — Допомога сусідам ━━━\n');
  const r = {
    name: BOT.name, phone: maskPhone(BOT.phone), language: 'ua',
    category: 'other', group: 'help_neighbors', subcategory: 'other',
    building: 'Чайка',
    text: 'Можу допомогти з доставкою продуктів сьогодні після 17:00. Маю власний транспорт, можу забрати замовлення з магазину та привезти до під\'їзду. Відгукніться через заявку, уточнимо деталі.',
    description: 'Можу допомогти з доставкою продуктів сьогодні після 17:00. Маю власний транспорт, можу забрати замовлення з магазину та привезти до під\'їзду. Відгукніться через заявку, уточнимо деталі.',
    userId: BOT.uid, userPhotoURL: `start-avatar://${BOT.avatarKey}`, startAvatarKey: BOT.avatarKey,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    timestamp: now(), createdAt: now(), expires_at: now() + 15*86400000,
    status: 'pending', isApproved: false, isCensored: false,
    requiresManualModeration: true, moderationPriority: 'standard',
    moderationQueue: 'standard', status_priority: 'pending_02_standard',
    ...pendingModeration(),
  };
  try {
    const ref = db.ref('requests');
    const res = await ref.push(r);
    ok('Forma-Zayavki', `Заявка створена: /requests/${res.key}`);
    const s = await db.ref(`requests/${res.key}`).once('value');
    if (s.val()) ok('Forma-Zayavki', `Підтверджено: status=${s.val().status}, group=${s.val().group}`);
  } catch (e) { err('Forma-Zayavki', `Помилка: ${e.message}`); }
}

// ====================================================================
//  3. ZAPROS-POMOSHI — documents / translation
// ====================================================================
async function screenZaprosPomoshi(db, photo) {
  console.log('\n━━━ [2] Zapros-Pomoshi.tsx — Запрос допомоги ━━━\n');
  const r = {
    name: BOT.name, phone: maskPhone(BOT.phone), language: 'ua',
    category: 'other', group: 'help_neighbors', subcategory: 'documents',
    building: 'Чайка',
    text: 'Потрібна допомога з перекладом технічної документації з англійської на українську. Близько 10 сторінок, термін — до кінця тижня. Оплата обговорюється. Відгукніться через заявку.',
    description: 'Потрібна допомога з перекладом технічної документації з англійської на українську. Близько 10 сторінок, термін — до кінця тижня. Оплата обговорюється. Відгукніться через заявку.',
    userId: BOT.uid, userPhotoURL: `start-avatar://${BOT.avatarKey}`, startAvatarKey: BOT.avatarKey,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    timestamp: now(), createdAt: now(), expires_at: now() + 15*86400000,
    status: 'pending', isApproved: false, isCensored: false,
    requiresManualModeration: true, moderationPriority: 'standard',
    ...pendingModeration(),
  };
  try {
    const res = await db.ref('requests').push(r);
    ok('Zapros-Pomoshi', `Запрос створено: /requests/${res.key}`);
    const s = await db.ref(`requests/${res.key}`).once('value');
    if (s.val()) ok('Zapros-Pomoshi', `Підтверджено: status=${s.val().status}`);
  } catch (e) { err('Zapros-Pomoshi', `Помилка: ${e.message}`); }
}

// ====================================================================
//  4. POISK-RABOTY — vacancy / IT/Design
// ====================================================================
async function screenPoiskRaboty(db, photo) {
  console.log('\n━━━ [3] Poisk-Raboty.tsx — Пошук роботи (вакансія) ━━━\n');
  const p = pendingModeration();
  const listing = {
    listingKind: 'vacancy', name: BOT.name, phone: BOT.phone,
    workType: 'IT/Design',
    about: 'Шукаю контент-менеджера для редакції сусідського блогу. Завдання: написання та редагування новин, модерація коментарів, підготовка дайджестів. Віддалена робота, гнучкий графік.',
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    moderationStatus: p.moderationStatus, submittedForModerationAt: p.submittedForModerationAt,
    createdAt: iso(), expiresAt: new Date(Date.now() + 60*86400000).toISOString(),
    userId: BOT.uid, language: 'ua',
  };
  try {
    const res = await db.ref('job_listings').push(listing);
    ok('Poisk-Raboty', `Вакансія створена: /job_listings/${res.key}`);
    const s = await db.ref(`job_listings/${res.key}`).once('value');
    if (s.val()) ok('Poisk-Raboty', `Підтверджено: kind=${s.val().listingKind}`);
  } catch (e) { err('Poisk-Raboty', `Помилка: ${e.message}`); }
}

// ====================================================================
//  5. KUPLU-PRODAM — books / good / 350 грн
// ====================================================================
async function screenKupluProdam(db, photo) {
  console.log('\n━━━ [4] Kuplu-Prodam.tsx — Куплю/Продам ━━━\n');
  const p = pendingModeration();
  const listing = {
    itemName: 'Словник італійсько-український + книги з копірайтингу (3 шт.)',
    category: 'books', condition: 'good', price: '350',
    description: 'Продаю книги з редагування та копірайтингу — 3 шт., стан хороший. Також словник італійсько-український (500 стор., тверда обкладинка). Самовивіз з Чайки або зустріч біля метро.',
    phone: BOT.phone,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '', photoId: '',
    moderationStatus: p.moderationStatus, submittedForModerationAt: p.submittedForModerationAt,
    createdAt: iso(), expiresAt: new Date(Date.now() + 90*86400000).toISOString(),
    userId: BOT.uid, showPhone: true, language: 'ua',
  };
  try {
    const res = await db.ref('buy_sell_listings').push(listing);
    ok('Kuplu-Prodam', `Оголошення створено: /buy_sell_listings/${res.key}`);
    ok('Kuplu-Prodam', `Товар: "${listing.itemName}", ціна: 350 грн`);
    const s = await db.ref(`buy_sell_listings/${res.key}`).once('value');
    if (s.val()) ok('Kuplu-Prodam', `Підтверджено: category=${s.val().category}`);
  } catch (e) { err('Kuplu-Prodam', `Помилка: ${e.message}`); }
}

// ====================================================================
//  6. KTO-POTERYAL — found / keys
// ====================================================================
async function screenKtoPoteryal(db, photo) {
  console.log('\n━━━ [5] Kto-Poteryal.tsx — Потеряно/Найдено ━━━\n');
  const p = pendingModeration();
  const item = {
    type: 'found', name: BOT.name, phone: BOT.phone,
    category: 'keys',
    description: 'Знайдено зв\'язку ключів біля корпусу 1, під\'їзд 2, на лавці біля входу. Ключі на металевому кільці, 3 штуки + брелок. Поверну власнику. Відгукніться через заявку.',
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    moderationStatus: p.moderationStatus, submittedForModerationAt: p.submittedForModerationAt,
    createdAt: iso(), expiresAt: new Date(Date.now() + 15*86400000).toISOString(),
    userId: BOT.uid, language: 'ua',
  };
  try {
    const res = await db.ref('lost_found').push(item);
    ok('Kto-Poteryal', `Запис створено: /lost_found/${res.key}`);
    ok('Kto-Poteryal', `Тип: found, категорія: keys`);
    const s = await db.ref(`lost_found/${res.key}`).once('value');
    if (s.val()) ok('Kto-Poteryal', `Підтверджено: type=${s.val().type}`);
  } catch (e) { err('Kto-Poteryal', `Помилка: ${e.message}`); }
}

// ====================================================================
//  7. KONTAKT-XXX — books (Someone to talk) / communication
// ====================================================================
async function screenKontaktXxx(db, photo) {
  console.log('\n━━━ [6] Kontakt-XXX.tsx — Контакти Чайки ━━━\n');
  const p = pendingModeration();
  const contact = {
    itemName: BOT.name,
    category: 'books', condition: 'like_new', price: '28',
    description: 'Привіт! Я Елена, контент-редактор, живу в Чайці (кв. 31). Шукаю співрозмовника для English Speaking Club по суботах. Люблю літературу, подорожі та італійську культуру. Пишіть у чаті!',
    phone: BOT.phone,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '', photoId: '',
    moderationStatus: p.moderationStatus, submittedForModerationAt: p.submittedForModerationAt,
    createdAt: iso(), expiresAt: new Date(Date.now() + 30*86400000).toISOString(),
    userId: BOT.uid, showPhone: true, language: 'ua',
  };
  try {
    const res = await db.ref('contacts_listings').push(contact);
    ok('Kontakt-XXX', `Анкету створено: /contacts_listings/${res.key}`);
    const s = await db.ref(`contacts_listings/${res.key}`).once('value');
    if (s.val()) ok('Kontakt-XXX', `Підтверджено: category=${s.val().category}`);
  } catch (e) { err('Kontakt-XXX', `Помилка: ${e.message}`); }
}

// ====================================================================
//  8. PROBLEMY-CHAYKI — yard
// ====================================================================
async function screenProblemyChayki(db, photo) {
  console.log('\n━━━ [7] Problemy-Chayki.tsx — Проблеми ЖК ━━━\n');
  const r = {
    name: BOT.name, phone: maskPhone(BOT.phone), language: 'ua',
    category: 'problem', group: 'problems', subcategory: 'yard',
    building: 'Чайка, вул. Валерія Лобановського, 15',
    text: 'Не скошена трава біля дитячого майданчика, корпус 1. Трава дуже висока, дітям незручно гратися, багато комарів. Прошу привести територію до ладу.',
    description: 'Не скошена трава біля дитячого майданчика, корпус 1. Трава дуже висока, дітям незручно гратися, багато комарів. Прошу привести територію до ладу.',
    userId: BOT.uid, userPhotoURL: `start-avatar://${BOT.avatarKey}`, startAvatarKey: BOT.avatarKey,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    timestamp: now(), createdAt: now(), expires_at: now() + 30*86400000,
    status: 'pending', isApproved: false, isCensored: false,
    requiresManualModeration: true, moderationPriority: 'standard',
    ...pendingModeration(),
  };
  try {
    const res = await db.ref('requests').push(r);
    ok('Problemy-Chayki', `Заявку створено: /requests/${res.key}`);
    const s = await db.ref(`requests/${res.key}`).once('value');
    if (s.val()) ok('Problemy-Chayki', `Підтверджено: subcategory=${s.val().subcategory}`);
  } catch (e) { err('Problemy-Chayki', `Помилка: ${e.message}`); }
}

// ====================================================================
//  9. STATUS-SVETA — power_on
// ====================================================================
async function screenStatusSveta(db, photo) {
  console.log('\n━━━ [8] Status-Sveta.tsx — Статус світла ━━━\n');
  const r = {
    name: BOT.name, phone: maskPhone(BOT.phone), language: 'ua',
    category: 'electricity', group: 'electricity', subcategory: 'power_on',
    building: 'вул. Валерія Лобановського, 15',
    text: '⚡ Світло є — Чайка, вул. Валерія Лобановського, 15. Світло з\'явилось о 16:20 після короткочасного відключення. Все працює.',
    description: '⚡ Світло є — Чайка, вул. Валерія Лобановського, 15. Світло з\'явилось о 16:20.',
    userId: BOT.uid, userPhotoURL: `start-avatar://${BOT.avatarKey}`, startAvatarKey: BOT.avatarKey,
    photoUri: photo?.publicUrl || '', photoStoragePath: photo?.storagePath || '',
    timestamp: now(), createdAt: now(), expires_at: now() + 3*86400000,
    status: 'pending', isApproved: false, isCensored: false,
    requiresManualModeration: true, moderationPriority: 'standard',
    ...pendingModeration(),
  };
  try {
    const res = await db.ref('requests').push(r);
    ok('Status-Sveta', `Запис створено: /requests/${res.key}`);
    const s = await db.ref(`requests/${res.key}`).once('value');
    if (s.val()) ok('Status-Sveta', `Підтверджено: subcategory=${s.val().subcategory}`);
  } catch (e) { err('Status-Sveta', `Помилка: ${e.message}`); }
}

// ====================================================================
//  10. ZAGRUZKA-FOTO — галерея
// ====================================================================
async function screenZagruzkaFoto(db, bucket, photo) {
  console.log('\n━━━ [9] Zagruzka-Foto.tsx — Завантаження фото в галерею ━━━\n');
  // Use the already-uploaded vv.jpg reference
  const storagePath = photo?.storagePath || `community_photos/${BOT.uid}/vv_elena_${now()}.jpg`;
  const record = {
    title: 'Затишний куточок на Чайці — ранок біля корпусу 2',
    description: 'Тихий ранок у сквері біля корпусу 2 після дощу. Свіже листя, гарне освітлення, спокійне місце для відпочинку.',
    imageUri: storagePath, storagePath,
    uploadedBy: BOT.name, uploadedByEmail: BOT.email,
    createdAt: now(), uploadedAt: now(),
    status: 'pending', safetyStatus: 'pending',
    target: 'gallery_public',
    sourceScreen: 'PhotoUploadScreen', sourceScreenLabel: 'Добавить фото', sourceFeature: 'gallery_full_form',
    locationLabel: 'Сквер, Чайка', locationType: 'place',
    likes: 0, userId: BOT.uid,
  };
  try {
    const res = await db.ref('community_photos').push(record);
    ok('Zagruzka-Foto', `Запис фото створено: /community_photos/${res.key}`);
    const s = await db.ref(`community_photos/${res.key}`).once('value');
    if (s.val()) ok('Zagruzka-Foto', `Підтверджено: title="${s.val().title}"`);
  } catch (e) { err('Zagruzka-Foto', `Помилка: ${e.message}`); }
}

// ====================================================================
//  11. FOTO-RAYONA — швидке фото району
// ====================================================================
async function screenFotoRayona(db, bucket, photo) {
  console.log('\n━━━ [10] Foto-Rayona.tsx — Фото району ━━━\n');
  const storagePath = photo?.storagePath || `community_photos/${BOT.uid}/vv_elena_${now()}.jpg`;
  const record = {
    title: 'Квітник біля будинку 15',
    imageUri: storagePath, storagePath,
    uploadedBy: BOT.name, uploadedByEmail: BOT.email,
    createdAt: now(), uploadedAt: now(),
    status: 'pending', safetyStatus: 'pending',
    target: 'gallery_public',
    sourceScreen: 'FotoRayonaScreen', sourceScreenLabel: 'Фото района', sourceFeature: 'district_gallery_quick_upload',
    likes: 0, userId: BOT.uid,
  };
  try {
    const res = await db.ref('community_photos').push(record);
    ok('Foto-Rayona', `Фото району створено: /community_photos/${res.key}`);
    const s = await db.ref(`community_photos/${res.key}`).once('value');
    if (s.val()) ok('Foto-Rayona', `Підтверджено: title="${s.val().title}"`);
  } catch (e) { err('Foto-Rayona', `Помилка: ${e.message}`); }
}

// ====================================================================
//  12. ZHK-BUSINESS-LISTING — education / courses
// ====================================================================
async function screenZhkBusinessList(db, photo) {
  console.log('\n━━━ [11] ZhkBusinessListScreen.tsx — Бізнес Чайки ━━━\n');
  const entry = {
    uid: BOT.uid, userId: BOT.uid,
    categoryKey: 'education', categoryLabel: 'Освіта',
    subcategoryKey: 'courses', subcategoryLabel: 'Курси та редакція',
    contactName: BOT.name, phone: BOT.phone,
    description: 'Редакція та копірайтинг — допоможу оформити текст заявки, оголошення або допис для спільноти. Виправлю граматику, зроблю текст чітким і безпечним. Недорого, за домовленістю.',
    photoStoragePath: photo?.storagePath || '', photoUri: photo?.publicUrl || '',
    language: 'ua',
    createdAt: iso(), updatedAt: iso(), version: '1',
    status: 'pending', moderatedAt: null, moderatedBy: null,
    moderationReason: null, rejectionReason: null,
    likesByUserId: {}, likeCount: 0, ratingByUserId: {},
  };
  try {
    await db.ref(`local_business/${BOT.uid}`).set(entry);
    ok('ZhkBusinessList', `Бізнес-листинг створено: /local_business/${BOT.uid}`);
  } catch (e) { err('ZhkBusinessList', `Помилка: ${e.message}`); }
}

// ====================================================================
//  13. PRO-PRILOZHENIE — feedback / suggestion
// ====================================================================
async function screenProPrilozhenie(db) {
  console.log('\n━━━ [12] Pro-Prilozhenie.tsx — Зворотний зв\'язок ━━━\n');
  const suggestion = {
    text: 'Пропозиція: додати шаблони текстів для різних типів заявок. Це допоможе новим мешканцям швидше створювати якісні публікації та зменшить кількість відхилених заявок на модерації.',
    name: BOT.name, phone: BOT.phone,
    userId: BOT.uid,
    moderationStatus: 'pending',
    submittedForModerationAt: iso(),
    createdAt: iso(),
  };
  try {
    const res = await db.ref('app_suggestions').push(suggestion);
    ok('Pro-Prilozhenie', `Пропозицію створено: /app_suggestions/${res.key}`);
    const s = await db.ref(`app_suggestions/${res.key}`).once('value');
    if (s.val()) ok('Pro-Prilozhenie', `Підтверджено: status=${s.val().moderationStatus}`);
  } catch (e) { err('Pro-Prilozhenie', `Помилка: ${e.message}`); }
}

// ====================================================================
//  14-15-16. OSBB SCREENS — skip
// ====================================================================
async function screenOsbbScreens() {
  console.log('\n━━━ [13-15] OSBB екрани — пропущено ━━━\n');
  skp('OSBB-AddNews', 'Потрібна роль manager. Elena — resident.');
  skp('OSBB-Sbor', 'Потрібен canManageCollections. Elena — resident.');
  skp('OSBB-Golosovanie', 'Створення — manager, голосування — потребує активної кампанії.');
}

// ====================================================================
//  MAIN
// ====================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Elena Ferrara — 1 заявка на кожен екран        ║');
  console.log('║  Фото: vv.jpg (для всіх заявок)                ║');
  console.log('║  Аватар: тимчасовий (key 4→2)                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\nБот: ${BOT.name} (${BOT.email}) | UID: ${BOT.uid} | Avatar: #${BOT.avatarKey}\n`);

  // Init Firebase Admin
  const sa = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(sa.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();
  const bucket = admin.storage().bucket();

  // 0. Upload vv.jpg
  const photo = await uploadVV(bucket);
  if (!photo) {
    wrn('Storage', 'Не вдалося завантажити vv.jpg. Заявки будуть без фото.');
  }

  // 1-12. Screens
  await screenFormaZayavki(db, photo);
  await screenZaprosPomoshi(db, photo);
  await screenPoiskRaboty(db, photo);
  await screenKupluProdam(db, photo);
  await screenKtoPoteryal(db, photo);
  await screenKontaktXxx(db, photo);
  await screenProblemyChayki(db, photo);
  await screenStatusSveta(db, photo);
  await screenZagruzkaFoto(db, bucket, photo);
  await screenFotoRayona(db, bucket, photo);
  await screenZhkBusinessList(db, photo);
  await screenProPrilozhenie(db);

  // 13-15. OSBB
  await screenOsbbScreens();

  // ====================================================================
  //  REPORT
  // ====================================================================
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║              ПІДСУМКОВИЙ ЗВІТ                   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const stats = { ok: 0, warn: 0, err: 0, skip: 0 };
  LOG.forEach(l => {
    if (l.icon === '✅') stats.ok++;
    else if (l.icon === '⚠️') stats.warn++;
    else if (l.icon === '❌') stats.err++;
    else if (l.icon === '⏭️') stats.skip++;
  });

  console.log(`  ✅ Успішно: ${stats.ok}`);
  console.log(`  ⚠️  Попередження: ${stats.warn}`);
  console.log(`  ❌ Помилки: ${stats.err}`);
  console.log(`  ⏭️  Пропущено: ${stats.skip}`);
  console.log(`  ───────────────────────`);
  console.log(`  Всього дій: ${LOG.length}\n`);

  if (stats.err > 0) {
    console.log('  ❌ Помилки:');
    LOG.filter(l => l.icon === '❌').forEach(l =>
      console.log(`    [${l.section}] ${l.msg}`));
    console.log('');
  }

  console.log('  Створені заявки (екрани):');
  const screens = [
    'Forma-Zayavki (help_neighbors)',
    'Zapros-Pomoshi (documents)',
    'Poisk-Raboty (vacancy)',
    'Kuplu-Prodam (books)',
    'Kto-Poteryal (found/keys)',
    'Kontakt-XXX (communication)',
    'Problemy-Chayki (yard)',
    'Status-Sveta (power_on)',
    'Zagruzka-Foto (gallery)',
    'Foto-Rayona (district)',
    'ZhkBusinessList (education)',
    'Pro-Prilozhenie (feedback)',
  ];
  screens.forEach(s => console.log(`  ✅ ${s}`));
  console.log('  ⏭️ OSBB-AddNews (skip — manager role)');
  console.log('  ⏭️ OSBB-Sbor (skip — manager role)');
  console.log('  ⏭️ OSBB-Golosovanie (skip — manager role)');
  console.log(`\n  Фото для всіх заявок: vv.jpg`);
  console.log(`  Аватар: змінено з 4 на 2 (тимчасовий)`);

  console.log('\n━━━ Завершено ━━━');
}

main().catch(e => {
  console.error('\n❌ Критична помилка:', e);
  process.exit(1);
});
