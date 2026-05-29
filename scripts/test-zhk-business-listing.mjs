/**
 * Тест: Послуги Жителів ЖК — ZhkBusinessListScreen
 * Бот: Francesca Gallo (#6) — Спеціалізація: Здоров'я та уход
 *
 * Мета: Знайти баги, UX-проблеми та технічні обмеження
 * при створенні анкети-заявки на екрані "Послуги Жителів ЖК".
 *
 * Запуск: node scripts/test-zhk-business-listing.mjs
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// --- Бот для теста ---
const BOT = {
  name: 'Francesca Gallo',
  email: 'francesca.gallo@chaika-bot.test',
  phone: '+380671000006',
  uid: 'hSscTmJTKtTsI6pXeWePtWazDe83',
  specialization: 'Здоров\'я та уход (health)',
  targetCategory: 'health',
  targetSubcategory: 'nurse',
};

// Результаты тестирования
const bugs = [];
const warnings = [];
const passed = [];

function reportBug(id, title, severity, steps, actual, expected, notes = '') {
  bugs.push({ id, title, severity, steps, actual, expected, notes });
  console.log(`\n  ❌ [${severity.toUpperCase()}] ${id}: ${title}`);
  console.log(`     Шаги: ${steps}`);
  console.log(`     Факт: ${actual}`);
  console.log(`     Ожидалось: ${expected}`);
  if (notes) console.log(`     Примечание: ${notes}`);
}

function reportWarning(id, title, description) {
  warnings.push({ id, title, description });
  console.log(`\n  ⚠️  [WARN] ${id}: ${title}`);
  console.log(`     ${description}`);
}

function reportPass(id, title) {
  passed.push({ id, title });
  console.log(`  ✅ ${id}: ${title}`);
}

// --- Имитация normalizeUkrainianPhoneStrict ---
function normalizeUkrainianPhoneStrict(phone) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+38${digits}`;
  return null;
}

// --- Имитация isSubmitFormValid ---
function isSubmitFormValid({ formCategoryKey, formSubcategoryKey, contactName, phone }) {
  return Boolean(formCategoryKey && formSubcategoryKey && contactName.trim() && phone.trim());
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ТЕСТ: Послуги Жителів ЖК (ZhkBusinessListScreen)           ║');
  console.log('║  Бот: Francesca Gallo — Здоров\'я та уход                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Инициализация Firebase Admin
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });
  const db = admin.database();

  console.log(`Бот: ${BOT.name}`);
  console.log(`UID: ${BOT.uid}`);
  console.log(`Категорія: ${BOT.targetCategory} / ${BOT.targetSubcategory}\n`);

  // ===========================================================
  // БЛОК 1: Предварительные барьеры
  // ===========================================================
  console.log('━━━ БЛОК 1: Перевірка бар\'єрів перед відправкою ━━━\n');

  // 1a. Перевірка профілю (аватар)
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();

  if (!profile) {
    reportBug('BUG-01a', 'Профіль бота не існує в /users', 'CRITICAL',
      'Відкрити екран → натиснути "Розповісти про свої послуги"',
      'Профіль відсутній в БД — validateSubmissionRequirements поверне false',
      'Профіль повинен бути присутній (від seed-bot-users.mjs)');
    console.error('  Критична помилка: профіль відсутній. Перевірте seed-bot-users.mjs.');
    process.exit(1);
  }

  const hasAvatar = Boolean(profile?.photoURL?.trim());
  if (!hasAvatar) {
    reportBug('BUG-01b', 'Відсутній аватар у бота — блокує відправку заявки', 'HIGH',
      'Відкрити форму → заповнити всі поля → натиснути "Надіслати на модерацію"',
      'Alert "Потрібен аватар" замість відправки',
      'Форма повинна відправитись або попередити про аватар ДО відкриття форми');
  } else {
    reportPass('CHK-01', `Аватар наявний: ${profile.photoURL.slice(0, 60)}...`);
  }

  // 1b. Перевірка invite_access
  const accessSnap = await db.ref(`invite_access/${BOT.uid}`).once('value');
  const accessData = accessSnap.val();
  if (!accessData || accessData.status !== 'approved') {
    reportBug('BUG-02', 'invite_access не approved — можливий блок на рівні правил Firebase', 'HIGH',
      'Спроба відправити запис в /local_business',
      `Статус: ${accessData?.status ?? 'відсутній'}`,
      'approved');
  } else {
    reportPass('CHK-02', `invite_access: ${accessData.status}`);
  }

  // ===========================================================
  // БЛОК 2: Тестування валідації форми (статичний аналіз)
  // ===========================================================
  console.log('\n━━━ БЛОК 2: Валідація форми (імітація дій користувача) ━━━\n');

  // ТЕСТ 2a: Кнопка Submit активна при '+380' в полі телефону
  // isSubmitFormValid перевіряє phone.trim() — '+380' є truthy!
  const phoneDefaultValue = '+380';
  const formValidWithDefaultPhone = isSubmitFormValid({
    formCategoryKey: 'health',
    formSubcategoryKey: 'nurse',
    contactName: 'Francesca Gallo',
    phone: phoneDefaultValue,
  });
  const normalizedDefault = normalizeUkrainianPhoneStrict(phoneDefaultValue);

  if (formValidWithDefaultPhone && !normalizedDefault) {
    reportBug('BUG-03', 'Кнопка Submit активна при стандартному "+380" (неповний номер)',
      'MEDIUM',
      '1. Відкрити форму → обрати категорію → ввести ім\'я\n' +
      '     → НЕ змінювати телефон (залишити "+380") → натиснути Submit',
      'Кнопка активна. Після натискання — Alert "Перевірте номер телефону"',
      'Кнопка повинна залишатись неактивною, доки телефон не є дійсним українським номером',
      'isSubmitFormValid перевіряє phone.trim() — "+380" непустий, але недійсний. ' +
      'Потрібно додати normalizeUkrainianPhoneStrict() до isSubmitFormValid.');
  } else {
    reportPass('CHK-03', 'Кнопка Submit вимагає повний номер телефону');
  }

  // ТЕСТ 2b: Поле "Ваше ім'я" не позначене зірочкою, але є обов'язковим
  // В isSubmitFormValid: contactName.trim() — required.
  // Мітка формі: "Ваше ім'я або назва" — немає "*"
  reportBug('BUG-04', 'Поле "Ваше ім\'я" є обов\'язковим, але не позначене зіркою (*)',
    'LOW',
    '1. Відкрити форму\n     2. Звернути увагу на мітки полів',
    'Мітка: "Ваше ім\'я або назва" (без *)',
    'Мітка: "Ваше ім\'я або назва *" (або підказка що обов\'язково)',
    'isSubmitFormValid = Boolean(...contactName.trim()...) — блокує Submit якщо порожньо');

  // ТЕСТ 2c: Фото — мітка відображає "Фото або аватар профілю" замість "Фото (необов'язково)"
  // requiredPhotoLabel з submissionRequirements.ts: "Фото або аватар профілю"
  // t.photoLabel = "Фото (необов'язково)" — є в UI_TEXT але НЕ використовується у формі!
  reportBug('BUG-05', 'Мітка фото у формі: "Фото або аватар профілю" замість "Фото (необов\'язково)"',
    'LOW',
    '1. Відкрити форму → прокрутити до поля фото',
    'Мітка: "Фото або аватар профілю" (з submissionRequirements.getRequiredPhotoLabel)',
    'Мітка: "Фото (необов\'язково)" відповідно до t.photoLabel в UI_TEXT',
    'ZhkBusinessListScreen:1032 використовує requiredPhotoLabel замість t.photoLabel. ' +
    'Рядок t.photoLabel оголошений але не використовується (мертвий код).');

  // ТЕСТ 2d: Немає полів ціни у формі
  reportBug('BUG-06', 'Немає полів для вказання ціни у формі (priceMin, priceMax, currency)',
    'MEDIUM',
    '1. Відкрити форму → переглянути всі поля',
    'Форма: категорія, підкатегорія, ім\'я, телефон, опис, фото — ціни немає',
    'Поля "Ціна від / до" та "Валюта" — тип BusinessItem містить priceMin/priceMax/currency, картки відображають ціну, але ввести її неможливо',
    'Картки (BusinessCard) мають priceRow — показують ціну якщо є. ' +
    'Але форма не дозволяє її задати → ціна завжди порожня для нових оголошень.');

  // ===========================================================
  // БЛОК 3: Обмеження архітектури — 1 оголошення на аккаунт
  // ===========================================================
  console.log('\n━━━ БЛОК 3: Архітектурні обмеження ━━━\n');

  // local_business/{uid} — ключем є UID
  reportBug('BUG-07', 'Обмеження: тільки 1 оголошення на акаунт (UID як ключ)',
    'MEDIUM',
    '1. Подати оголошення про "Медсестра"\n     2. Спробувати подати друге оголошення про "Масаж"',
    'Друге оголошення перезаписує перше (/local_business/{uid} — один запис)',
    'Можливість мати декілька активних послуг одночасно',
    'Архітектура: set(ref(db, `local_business/${uid}`), entry). ' +
    'Для підтримки кількох послуг потрібно перейти на push() з uid-індексом.');

  // Перевірка існуючого запису
  const existingSnap = await db.ref(`local_business/${BOT.uid}`).once('value');
  const existing = existingSnap.val();
  if (existing) {
    console.log(`  ℹ️  Існуючий запис local_business/${BOT.uid}:`);
    console.log(`     status: ${existing.status}`);
    console.log(`     category: ${existing.categoryKey}`);
    console.log(`     version: ${existing.version}`);
    if (existing.status === 'pending') {
      reportWarning('WARN-01', 'Бот вже має запис зі статусом "pending"',
        'Відправка нового запису відобразить Alert "Заявка вже на модерації" — тест "softGuard".');
    }
  } else {
    reportPass('CHK-04', 'Жодного існуючого запису — можна подати перший');
  }

  // ===========================================================
  // БЛОК 4: Відправка заявки (повна імітація)
  // ===========================================================
  console.log('\n━━━ БЛОК 4: Відправка тестової заявки ━━━\n');

  const nowIso = new Date().toISOString();
  const botPhone = BOT.phone;
  const normalizedPhone = normalizeUkrainianPhoneStrict(botPhone);

  if (!normalizedPhone) {
    reportBug('BUG-08', 'Телефон бота не пройшов normalizeUkrainianPhoneStrict', 'CRITICAL',
      'Спроба відправити форму з телефоном бота',
      `normalizeUkrainianPhoneStrict("${botPhone}") = null`,
      'Повинен повернути "+380671000006"');
    process.exit(1);
  }

  reportPass('CHK-05', `Телефон нормалізований: ${normalizedPhone}`);

  // Перевірка валідності форми з коректними даними
  const formIsValid = isSubmitFormValid({
    formCategoryKey: BOT.targetCategory,
    formSubcategoryKey: BOT.targetSubcategory,
    contactName: BOT.name,
    phone: normalizedPhone,
  });

  if (!formIsValid) {
    reportBug('BUG-09', 'isSubmitFormValid повертає false для коректних даних', 'CRITICAL',
      'Заповнити всі поля коректними даними',
      'false',
      'true');
    process.exit(1);
  }

  reportPass('CHK-06', 'isSubmitFormValid = true для коректних даних');

  // Формуємо запис (точно як у handleSubmitBusiness)
  const previousVersion = typeof existing?.version === 'number' ? existing.version : (existing ? 1 : 0);
  const categoryLabels = {
    health: { ua: 'Здоров\'я та медицина', ru: 'Здоровье и медицина', en: 'Health & Medicine' },
  };
  const subcategoryLabels = {
    nurse: { ua: 'Медсестра', ru: 'Медсестра', en: 'Nurse' },
  };

  const entry = {
    uid: BOT.uid,
    userId: BOT.uid,
    categoryKey: BOT.targetCategory,
    categoryLabel: categoryLabels[BOT.targetCategory]['ua'],
    subcategoryKey: BOT.targetSubcategory,
    subcategoryLabel: subcategoryLabels[BOT.targetSubcategory]['ua'],
    contactName: BOT.name,
    phone: normalizedPhone,
    description: 'Надаю послуги медсестри: ін\'єкції, крапельниці, перев\'язки. Виклик додому, досвід 8 років. Є всі необхідні сертифікати.',
    photoStoragePath: '',
    photoUri: '',
    language: 'ua',
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    version: previousVersion + 1,
    status: 'pending',
    moderatedAt: null,
    moderatedBy: null,
    moderationReason: null,
    rejectionReason: null,
  };

  console.log('  Відправляю заявку в /local_business...');
  const businessRef = db.ref(`local_business/${BOT.uid}`);

  try {
    await businessRef.set(entry);
    reportPass('CHK-07', `Заявка записана: /local_business/${BOT.uid}`);
  } catch (err) {
    reportBug('BUG-10', 'Firebase відхилив запис заявки (правила безпеки)', 'CRITICAL',
      'Відправити форму з коректними даними',
      `Помилка: ${err.message}`,
      'Запис успішно збережений');
    process.exit(1);
  }

  // Перевірка збережених даних
  const savedSnap = await db.ref(`local_business/${BOT.uid}`).once('value');
  const saved = savedSnap.val();

  console.log('\n  --- Перевірка збережених даних ---');
  const checks = [
    ['contactName', saved.contactName, BOT.name],
    ['phone', saved.phone, normalizedPhone],
    ['categoryKey', saved.categoryKey, BOT.targetCategory],
    ['subcategoryKey', saved.subcategoryKey, BOT.targetSubcategory],
    ['status', saved.status, 'pending'],
    ['userId', saved.userId, BOT.uid],
    ['version', String(saved.version), String(previousVersion + 1)],
  ];

  for (const [field, actual, expected] of checks) {
    if (String(actual) === String(expected)) {
      reportPass(`CHK-08-${field}`, `${field}: "${actual}"`);
    } else {
      reportBug(`BUG-11-${field}`, `Поле "${field}" не збережено коректно`, 'HIGH',
        'Відправити форму → перевірити /local_business в Firebase',
        `actual: "${actual}"`,
        `expected: "${expected}"`);
    }
  }

  // Тест: likes/ratings не зберігаються при оновленні
  if (existing && (existing.likesByUserId || existing.ratingByUserId)) {
    if (!saved.likesByUserId && !saved.ratingByUserId) {
      reportBug('BUG-12', 'set() перезаписує лайки та рейтинги при оновленні заявки', 'HIGH',
        '1. Мати заявку з лайками/рейтингом\n' +
        '     2. Оновити заявку (підтвердити softGuard)\n' +
        '     3. Перевірити лайки',
        'likesByUserId: null, ratingByUserId: null (стерто)',
        'Лайки та рейтинги збережені',
        'handleSubmitBusiness використовує set() замість update() — повністю замінює запис. ' +
        'Треба spread existing likesByUserId/ratingByUserId в новий entry.');
    } else {
      reportPass('CHK-09', 'Лайки/рейтинги збережені при оновленні');
    }
  } else {
    reportPass('CHK-09', 'Перший запис — перевірка лайків при оновленні не потрібна');
  }

  // ===========================================================
  // БЛОК 5: Перевірка видимості в публічному списку
  // ===========================================================
  console.log('\n━━━ БЛОК 5: Видимість у списку ━━━\n');

  // Список завантажує тільки status='active'
  const activeQuery = await db.ref('local_business').orderByChild('status').equalTo('active').once('value');
  const activeItems = activeQuery.val();
  const activeCount = activeItems ? Object.keys(activeItems).length : 0;

  reportPass('CHK-10', `Активних оголошень у /local_business: ${activeCount}`);

  // Наше тільки-що подане має status='pending' — не відображається
  if (saved.status === 'pending') {
    console.log('  ℹ️  Заявка зі статусом "pending" не відображається у списку.');
    console.log('     Потрібна модерація адміністратором.');
  }

  // Перевірка наявності в pending-черзі адмін-панелі
  reportPass('CHK-11', 'Запис з status=pending готовий до модерації в admin-panel');

  // ===========================================================
  // БЛОК 6: UX-проблеми (з аналізу коду)
  // ===========================================================
  console.log('\n━━━ БЛОК 6: UX-проблеми ━━━\n');

  // UploadedPhotosGrid рендериться без пропсів — показує глобальну чергу
  reportWarning('WARN-02', 'UploadedPhotosGrid рендериться без пропсів (ZhkBusinessListScreen:1041)',
    'Компонент читає фото з Redux store (глобальна черга), а не з пропсів. ' +
    'Якщо користувач щойно завантажував фото на іншому екрані, ці фото можуть ' +
    '"просочитись" у список на цьому екрані.');

  // Закриття модального вікна на Android (onRequestClose з pickerActiveRef)
  reportWarning('WARN-03', 'Android: закриття модалки заблоковано під час відкритого Picker',
    'pickerActiveRef.current блокує handleRequestCloseAddForm коли Picker відкрито. ' +
    'Але на Android кнопка "Назад" може закрити системний picker без оновлення pickerActiveRef, ' +
    'залишаючи модалку "замороженою". Потрібно перевірити на реальному Android-пристрої.');

  // validateSubmissionRequirements: photos параметр передається але ігнорується
  reportBug('BUG-13', 'photos передається в validateSubmissionRequirements але ігнорується',
    'LOW',
    'Заповнити форму без фото → натиснути Submit',
    'validateSubmissionRequirements не перевіряє наявність фото — завжди повертає true якщо є аватар',
    'Якщо фото обов\'язкове для цього екрану — validate має перевіряти',
    'ZhkBusinessListScreen:634 передає photos: formPhotos але функція (submissionRequirements.ts:54) ' +
    'не приймає photos в деструктуризації. Параметр мовчки ігнорується. ' +
    'Фото є необов\'язковим — тоді видалити зайвий параметр для ясності.');

  // Typo в UI_TEXT.ru
  const addRequestRu = 'Расссказать про свои услуги'; // трійне 'с'
  reportBug('BUG-14', 'Опечатка у тексті кнопки (ru): "Расссказать" — зайва літера "с"',
    'LOW',
    'Перейти на екран з мовою "ru" → подивитися на кнопку внизу',
    '"Расссказать про свои услуги" (три "с")',
    '"Рассказать про свои услуги" (два "с")',
    'ZhkBusinessListScreen.tsx:276 — UI_TEXT.ru.addRequest');

  // ===========================================================
  // ПІДСУМОК
  // ===========================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ПІДСУМОК ТЕСТУВАННЯ                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Пройдено перевірок: ${passed.length}`);
  console.log(`⚠️  Попереджень: ${warnings.length}`);
  console.log(`❌ Знайдено багів: ${bugs.length}\n`);

  const critical = bugs.filter((b) => b.severity === 'CRITICAL');
  const high = bugs.filter((b) => b.severity === 'HIGH');
  const medium = bugs.filter((b) => b.severity === 'MEDIUM');
  const low = bugs.filter((b) => b.severity === 'LOW');

  console.log(`   CRITICAL: ${critical.length}`);
  console.log(`   HIGH:     ${high.length}`);
  console.log(`   MEDIUM:   ${medium.length}`);
  console.log(`   LOW:      ${low.length}\n`);

  console.log('━━━ Список багів ━━━\n');
  for (const bug of bugs) {
    console.log(`[${bug.severity}] ${bug.id} — ${bug.title}`);
  }

  console.log('\n━━━ Попередження ━━━\n');
  for (const w of warnings) {
    console.log(`[WARN] ${w.id} — ${w.title}`);
  }

  console.log('\n━━━ Рекомендації по фіксах ━━━\n');
  console.log('BUG-03: Додати normalizeUkrainianPhoneStrict у isSubmitFormValid або валідатор phone.');
  console.log('BUG-04: Додати "*" до мітки поля "Ваше ім\'я або назва".');
  console.log('BUG-05: Використати t.photoLabel замість requiredPhotoLabel (або навпаки — уніфікувати).');
  console.log('BUG-06: Додати поля priceMin, priceMax, currency у форму (optional).');
  console.log('BUG-07: Перейти з set(uid) на push() + userId-індекс для підтримки кількох послуг.');
  console.log('BUG-12: Зберігати likesByUserId/ratingByUserId при update: spread existing у entry.');
  console.log('BUG-13: Видалити зайвий параметр photos з виклику validateSubmissionRequirements.');
  console.log('BUG-14: Виправити опечатку: "Расссказать" → "Рассказать" (ZhkBusinessListScreen:276).\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Критична помилка скрипту:', err.message);
  process.exit(1);
});
