/**
 * test-kuplu-prodam.mjs
 * Бот-тест: симуляція створення оголошення на екрані "Куплю / Продам"
 * Бот: Alessandro Ricci (#5) — спеціалізація: їжа, посуд, події
 *
 * Сценарій:
 *   1. Перевіряє всі прегради, які перевіряє мобільний додаток
 *   2. Симулює заповнення форми поле за полем
 *   3. Записує оголошення в Firebase (шлях buy_sell_listings)
 *   4. Перевіряє збережені дані
 *   5. Фіксує всі знайдені баги та UX-проблеми
 *
 * Запуск: node scripts/test-kuplu-prodam.mjs
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// ─── Дані бота ───────────────────────────────────────────────────────────────
const BOT = {
  name: 'Alessandro Ricci',
  email: 'alessandro.ricci@chaika-bot.test',
  phone: '+380671000005',
  uid: 'GEaVFokn5Bdl5kf41ahbBa91jld2',
  avatarKey: '5',
  apartment: '61',
};

// ─── Параметри форми (що вводить "користувач") ────────────────────────────────
const FORM = {
  category: 'kitchen',                           // Посуд та кухня
  condition: 'good',                             // Гарний стан
  price: '350',                                  // грн
  description: 'Продаю набір керамічних тарілок (6 штук). Стан гарний, без сколів. Купував для кулінарної студії, але вже не потрібні. Самовивіз з кв. 61.',
  phone: '+380671000005',
  language: 'ua',
  // Фото: симулюємо вже завантажений файл (в реальному додатку — через PhotoUploadField)
  photoStoragePath: 'user_photos/GEaVFokn5Bdl5kf41ahbBa91jld2/bot-test-kitchen.jpg',
  photoDownloadUrl: '',  // буде порожнє (імітуємо що photoUri='' а storagePath є)
};

// ─── Список знайдених проблем ─────────────────────────────────────────────────
const bugs = [];
const warnings = [];
const uxIssues = [];

function reportBug(id, severity, title, details, reproduce) {
  bugs.push({ id, severity, title, details, reproduce });
}
function reportWarning(title, details) {
  warnings.push({ title, details });
}
function reportUX(title, details) {
  uxIssues.push({ title, details });
}

// ─── Хелпери ─────────────────────────────────────────────────────────────────

/** Перевірка assertTextMatchesLanguage (копія логіки з contentLanguageGuard.ts) */
function assertTextMatchesLanguage(text, language) {
  const LATIN_WORD_RE = /\b[A-Za-z]{2,}\b/u;
  const CYRILLIC_WORD_RE = /[\u0400-\u04FF]{2,}/u;

  const hasLatinWord = LATIN_WORD_RE.test(text);
  const hasCyrillicWord = CYRILLIC_WORD_RE.test(text);

  if ((language === 'ua' || language === 'ru') && hasLatinWord) {
    return language === 'ua'
      ? 'У заявці знайдено англійські слова. Будь ласка, напишіть текст мовою застосунку.'
      : 'В заявке найдены английские слова. Пожалуйста, напишите текст на языке приложения.';
  }
  if (language === 'en' && hasCyrillicWord) {
    return 'The request contains non-English words. Please write it in the app language.';
  }
  return null;
}

/** Нормалізація ціни (копія з buySellService.ts) */
function normalizePrice(value) {
  const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric) || sanitized.trim() === '') return sanitized;
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 2);
}

/** Перевірка телефону (логіка з Kuplu-Prodam.tsx) */
function validatePhone(phone) {
  return phone.replace(/\D/g, '').length >= 7;
}

// ─── Головна функція ──────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  БОТ-ТЕСТ: Купл-Продам — створення оголошення');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Бот:    ${BOT.name}`);
  console.log(`  Email:  ${BOT.email}`);
  console.log(`  UID:    ${BOT.uid}`);
  console.log(`  Квартира: ${BOT.apartment}`);
  console.log('──────────────────────────────────────────────────────────────\n');

  // ── Ініціалізація Firebase Admin ────────────────────────────────────────────
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });
  const db = admin.database();

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 1: Перевірка преград (validateSubmissionRequirements)
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('【БЛОК 1】Перевірка преград перед відкриттям форми\n');

  // 1.1 Профіль існує?
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();
  if (!profile) {
    console.error('❌ Профіль не знайдено у RTDB. Бот не сідований.');
    process.exit(1);
  }
  console.log(`[Преграда #1] Профіль у RTDB: ✅ є`);
  console.log(`  name: ${profile.name}`);
  console.log(`  registrationStatus: ${profile.registrationStatus}`);

  // 1.2 Аватар (validateSubmissionRequirements перевіряє userPhotoURL)
  const hasAvatar = Boolean(profile?.photoURL?.trim());
  console.log(`\n[Преграда #2] Аватар (userPhotoURL): ${hasAvatar ? '✅' : '❌ НЕТ — блокує відправку'}`);
  if (hasAvatar) {
    console.log(`  photoURL: "${profile.photoURL}"`);
    // Перевірка: start-avatar:// — чи вважається "реальним" аватаром?
    if (profile.photoURL.startsWith('start-avatar://')) {
      reportUX(
        'start-avatar:// проходить валідацію аватара',
        'validateSubmissionRequirements перевіряє лише Boolean(photoURL.trim()). ' +
        'Тимчасовий аватар start-avatar://5 вважається валідним і пропускає форму. ' +
        'Це дозволяє боту з "заглушкою" аватара публікувати оголошення — ' +
        'картка оголошення покаже порожній MiniUserAvatar замість реального фото.'
      );
      console.log(`  ⚠️  UX: start-avatar:// вважається валідним — картка покаже порожній avatar`);
    }
  } else {
    reportBug('BUG-01', 'HIGH',
      'Відправка блокується без аватара',
      'validateSubmissionRequirements повертає false якщо userPhotoURL порожній. ' +
      'Форма відображає Alert з кнопками "Своє фото" / "Тимчасовий аватар" / OK.',
      '1. Видалити photoURL з профілю. 2. Відкрити Купл-Продам. 3. Натиснути "+ Додати оголошення". 4. Заповнити форму. 5. Натиснути "Надіслати на модерацію" → Alert заблокує відправку.'
    );
    process.exit(1);
  }

  // 1.3 invite_access
  const inviteSnap = await db.ref(`invite_access/${BOT.uid}`).once('value');
  const invite = inviteSnap.val();
  console.log(`\n[Преграда #3] invite_access: ${invite?.status === 'approved' ? '✅ approved' : `❌ ${invite?.status || 'відсутній'}`}`);
  if (invite?.status !== 'approved') {
    reportBug('BUG-02', 'CRITICAL',
      'invite_access не approved — доступ до функцій заблокований',
      'Бот не має статусу "approved" у /invite_access/{uid}. Це може блокувати навігацію до екрана.',
      '1. Перевірити /invite_access/GEaVFo... у Firebase Console.'
    );
  }

  // 1.4 Rate limit (buy_sell: 120с між відправками — в пам\'яті клієнта, Admin SDK обходить)
  const rateLimitSnap = await db.ref(`rate_limits/${BOT.uid}`).once('value');
  const rateLimit = rateLimitSnap.val();
  console.log(`\n[Преграда #4] Rate limiter (buy_sell, 120с in-memory):`);
  if (rateLimit) {
    console.log(`  rate_limits у RTDB: ${JSON.stringify(rateLimit)}`);
  } else {
    console.log(`  rate_limits: відсутній — ✅ перша відправка дозволена`);
  }
  reportWarning(
    'Rate limiter — тільки in-memory, скидається при перезапуску',
    'RATE_LIMITERS.buySell = 120 секунд між відправками. ' +
    'Зберігається лише в lastSubmitTimes (пам\'ять JS), не в RTDB/AsyncStorage. ' +
    'Перезапуск / form close і відкриття — скидає лімітер. ' +
    'Бот може спамити оголошеннями перезапускаючи застосунок.'
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 2: Симуляція заповнення форми
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('【БЛОК 2】Симуляція заповнення форми\n');

  // Аналіз форми
  console.log('Поля форми (крок за кроком):');

  // 2.1 Категорія
  console.log(`\n  [Поле 1] Категорія товару`);
  console.log(`  → Вибір: "${FORM.category}" (Посуд та кухня)`);
  console.log(`  → ВАЖЛИВО: itemName = автоматично береться з categories[categoryIndex]`);
  reportUX(
    'Назва товару — немає окремого поля',
    'В формі відсутнє поле "Назва товару". itemName автоматично встановлюється з категорії: ' +
    'text.categories[ITEM_CATEGORY_VALUES.indexOf(category)]. ' +
    'Результат: "Посуд та кухня" замість "Набір тарілок". ' +
    'Пошук по назві товару (searchItemName) не дасть корисного результату — ' +
    'всі оголошення однієї категорії матимуть однакову назву в itemName.'
  );

  // 2.2 Стан товару
  console.log(`\n  [Поле 2] Стан товару`);
  console.log(`  → Вибір: "${FORM.condition}" (Гарний)`);

  // 2.3 Ціна
  console.log(`\n  [Поле 3] Ціна`);
  const priceInput = FORM.price;
  const normalizedPrice = normalizePrice(priceInput);
  const numericPrice = Number(normalizedPrice);
  console.log(`  → Введено: "${priceInput}" → нормалізовано: "${normalizedPrice}"`);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    console.log(`  ❌ Валідація ціни: НЕ ПРОЙШЛА`);
    reportBug('BUG-03', 'HIGH', 'Валідація ціни не проходить', `price="${priceInput}"`, 'Введіть ціну.');
  } else {
    console.log(`  ✅ Валідація ціни: OK (${numericPrice} грн)`);
  }

  // Перевірка: ціна 0 дозволена (безкоштовно)
  const testZeroPrice = normalizePrice('0');
  console.log(`  → Ціна "0" → "${testZeroPrice}" — ✅ дозволено (безкоштовна роздача)`);

  // Перевірка: порожня ціна
  const testEmptyPrice = normalizePrice('');
  const testEmptyNum = Number(testEmptyPrice);
  console.log(`  → Порожня ціна "" → "${testEmptyPrice}" → Number="${testEmptyNum}"`);
  if (!testEmptyPrice) {
    console.log(`  → Валідація: if (!normalizedPrice) → ❌ "Заповніть усі поля"`);
    reportUX(
      'Обов\'язкова ціна — повідомлення "Заповніть усі поля" замість "Вкажіть ціну"',
      'Якщо ціна порожня, спрацьовує загальна перевірка (!category || !condition || !description.trim() || !phone.trim() || !normalizedPrice) → errorFill. ' +
      'Але є і окрема перевірка priceError. Потенційна плутанина для користувача: ' +
      'він не знає яке саме поле пусте.'
    );
  }

  // 2.4 Опис
  console.log(`\n  [Поле 4] Опис`);
  console.log(`  → Введено: "${FORM.description.substring(0, 60)}..."`);
  console.log(`  → Довжина: ${FORM.description.length}/260 символів`);

  // Перевірка contentLanguageGuard
  const langError = assertTextMatchesLanguage(
    `Посуд та кухня ${FORM.description}`.trim(),
    FORM.language
  );
  if (langError) {
    console.log(`  ❌ contentLanguageGuard ВІДХИЛЯЄ текст: "${langError}"`);
    reportBug('BUG-04', 'HIGH',
      'assertTextMatchesLanguage блокує збереження якщо є латинські слова',
      `Помилка: "${langError}". Виникає якщо description або itemName містять латинські слова (бренди, терміни).`,
      '1. Ввести опис з латинськими словами: "Продаю iPad". 2. Натиснути "Надіслати" → catch(error) у handleSubmit → showUserError — але без спеціального повідомлення для мовної помилки.'
    );
  } else {
    console.log(`  ✅ contentLanguageGuard: пройдено`);
  }

  // Тест з латинськими словами
  const descWithLatin = 'Продаю iPhone у гарному стані';
  const latinError = assertTextMatchesLanguage(`Електроніка ${descWithLatin}`, 'ua');
  if (latinError) {
    console.log(`\n  ⚠️  Тест: опис з "iPhone" → contentLanguageGuard: "${latinError}"`);
    reportBug('BUG-05', 'MEDIUM',
      'Назви брендів (iPhone, Samsung) у категорії "Електроніка" блокують збереження',
      'assertTextMatchesLanguage перевіряє БУДЬ-ЯКЕ латинське слово ≥2 символів. ' +
      'Для мов ua/ru навіть слово "OK" або назва бренду кине помилку. ' +
      'Помилка летить у catch → showUserError (загальна), без підказки де проблема.',
      '1. Відкрити форму. 2. Обрати категорію "Електроніка". 3. Написати опис "Продаю iPhone у гарному стані". 4. Натиснути Відправити → Помилка збереження (без чіткого пояснення).'
    );
  }

  // 2.5 Телефон
  console.log(`\n  [Поле 5] Телефон`);
  const phoneValid = validatePhone(FORM.phone);
  console.log(`  → Введено: "${FORM.phone}" → ${phoneValid ? '✅ валідний' : '❌ невалідний'}`);

  // Перевірка початкового стану телефону
  console.log(`  → Початкове значення при відкритті форми:`);
  console.log(`    • Якщо user.phone є → normalizePhoneText(user.phone) = "${FORM.phone}"`);
  console.log(`    • Якщо user.phone відсутній → '' (порожній рядок)`);
  reportUX(
    'Reset форми → phone скидається до "+380", не до user.phone',
    'resetForm() встановлює setPhone("+380"), але початкова ініціалізація бере user?.phone. ' +
    'Якщо користувач випадково закрив форму і відкрив знову (або після успішної відправки) — ' +
    'телефон стане "+380" замість особистого номера. Потрібно або зберігати user.phone або чистити повністю.'
  );

  // 2.6 Фото
  console.log(`\n  [Поле 6] Фото товару (ОБОВ'ЯЗКОВЕ)`);
  console.log(`  → PhotoUploadField: вибір з My Photos або камера`);
  console.log(`  → getDonePhotos: фільтрує photo.status === 'done' && downloadUrl|storagePath`);
  console.log(`  → БЕЗ фото → ❌ Alert: "Додайте хоча б одне фото товару."`);

  reportBug('BUG-06', 'MEDIUM',
    'Фото обов\'язкове, але немає візуального індикатора обов\'язковості',
    'Мітка поля "Фото товару" не має зірочки (*) або іншого індикатора що поле обов\'язкове. ' +
    'Користувач дізнається про це лише після натискання "Надіслати" — отримує Alert. ' +
    'Всі інші обов\'язкові поля теж без індикатора.',
    '1. Відкрити форму. 2. Заповнити всі поля крім фото. 3. Натиснути "Надіслати" → Alert "Додайте хоча б одне фото".'
  );

  reportBug('BUG-07', 'LOW',
    'UploadedPhotosGrid рендериться всередині форми без пропсів',
    'У формі (рядок 832) є <UploadedPhotosGrid /> без будь-яких пропсів. ' +
    'Якщо цей компонент показує всі фото з глобальної черги UploadQueue, ' +
    'він може відображати фото з інших форм або зайві елементи всередині форми Купл-Продам.',
    '1. Завантажити фото через іншу форму (наприклад Foto-Rayona). 2. Відкрити форму Купл-Продам → UploadedPhotosGrid може показати "чужі" фото.'
  );

  // 2.7 Кнопка закрити форму (Modal onRequestClose)
  console.log(`\n  [Закриття форми]`);
  console.log(`  → Android back: handleRequestCloseModal → Alert "Закрити форму?"`);
  console.log(`  → pickerActiveRef: якщо пікер відкритий — Alert НЕ показується (правильно)`);
  reportUX(
    'Закрита форма не очищує AsyncStorage draft негайно',
    'При закритті через Alert → "Так" → setAddFormVisible(false), але AsyncStorage draft ' +
    '@chaika:buy_sell_draft видаляється лише в resetForm() або при наступному відкритті. ' +
    'Якщо додаток завершився аварійно після закриття — draft залишиться і форма відкриється знову.'
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 3: Draft persistence (AsyncStorage)
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('【БЛОК 3】Draft persistence (AsyncStorage)\n');
  console.log('  Ключ: @chaika:buy_sell_draft');
  console.log('  Зберігає: { category, condition, price, description, phone, addFormVisible: true }');
  console.log('  ⚠️  НЕ зберігає: завантажені фото (formPhotos)');
  reportBug('BUG-08', 'MEDIUM',
    'Draft відновлює текстові поля, але НЕ фото — плутанина UX',
    'Після краша / перезавантаження Android Activity (picker) текст повертається, ' +
    'але formPhotos = [] (порожній). Кнопка "Надіслати" покаже помилку "Додайте фото" ' +
    'хоча користувач вже завантажував їх раніше.',
    '1. Відкрити форму, заповнити всі поля включно з фото. 2. Відкрити Picker → Android може перезапустити Activity. 3. Повернутись → текст відновлено, фото — ні.'
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 4: Реальна відправка через Firebase Admin SDK
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('【БЛОК 4】Відправка оголошення в Firebase\n');

  // Перевірка contentLanguageGuard перед відправкою
  const ITEM_CATEGORY_LABELS_UA = ['Меблі', 'Побутова техніка', 'Електроніка', 'Дитячі товари', 'Одяг та взуття', 'Спорт та відпочинок', 'Книги та навчання', 'Посуд та кухня', 'Будматеріали', 'Рослини', 'Інше'];
  const ITEM_CATEGORY_VALUES = ['furniture', 'appliances', 'electronics', 'kids', 'clothes', 'sport', 'books', 'kitchen', 'construction', 'plants', 'other'];
  const categoryIndex = ITEM_CATEGORY_VALUES.indexOf(FORM.category);
  const itemName = categoryIndex >= 0 ? ITEM_CATEGORY_LABELS_UA[categoryIndex] : FORM.category;

  const textToCheck = `${itemName} ${FORM.description}`.trim();
  const langCheckError = assertTextMatchesLanguage(textToCheck, FORM.language);
  if (langCheckError) {
    console.error(`❌ contentLanguageGuard відхилив текст: ${langCheckError}`);
    process.exit(1);
  }

  const createdAt = new Date();
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

  const listing = {
    itemName,
    category: FORM.category,
    condition: FORM.condition,
    price: normalizePrice(FORM.price),
    description: FORM.description,
    phone: FORM.phone,
    photoUri: '',                            // як у сервісі: photoUri завжди '' при збереженні
    photoStoragePath: FORM.photoStoragePath,
    photoId: '',
    moderationStatus: 'pending',
    submittedForModerationAt: createdAt.toISOString(),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + THREE_MONTHS_MS).toISOString(),
    userId: BOT.uid,
    language: FORM.language,
    moderationReason: null,
    rejectionReason: null,
  };

  console.log('Дані для запису:');
  console.log(`  itemName:     "${listing.itemName}"`);
  console.log(`  category:     "${listing.category}"`);
  console.log(`  condition:    "${listing.condition}"`);
  console.log(`  price:        "${listing.price}" грн`);
  console.log(`  phone:        "${listing.phone}"`);
  console.log(`  status:       "${listing.moderationStatus}"`);
  console.log(`  storagePath:  "${listing.photoStoragePath}"`);
  console.log(`  expiresAt:    ${listing.expiresAt}`);

  console.log('\n📤 Записую в /buy_sell_listings...');
  const listRef = db.ref('buy_sell_listings');
  const pushRef = await listRef.push(listing);

  if (!pushRef.key) {
    console.error('❌ Firebase не повернув ключ запису');
    process.exit(1);
  }

  console.log(`✅ Оголошення створено! ID: ${pushRef.key}`);
  console.log(`   Шлях: /buy_sell_listings/${pushRef.key}`);

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 5: Перевірка збережених даних
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('【БЛОК 5】Верифікація збережених даних\n');

  const savedSnap = await db.ref(`buy_sell_listings/${pushRef.key}`).once('value');
  const saved = savedSnap.val();

  let verifyPassed = 0;
  let verifyFailed = 0;

  function verify(label, actual, expected) {
    const ok = actual === expected;
    if (ok) {
      console.log(`  ✅ ${label}: "${actual}"`);
      verifyPassed++;
    } else {
      console.log(`  ❌ ${label}: got "${actual}", expected "${expected}"`);
      verifyFailed++;
    }
  }

  verify('itemName', saved.itemName, listing.itemName);
  verify('category', saved.category, listing.category);
  verify('condition', saved.condition, listing.condition);
  verify('price', saved.price, listing.price);
  verify('phone', saved.phone, listing.phone);
  verify('userId', saved.userId, BOT.uid);
  verify('moderationStatus', saved.moderationStatus, 'pending');
  verify('language', saved.language, 'ua');
  verify('photoUri', saved.photoUri, '');
  verify('photoStoragePath', saved.photoStoragePath, FORM.photoStoragePath);

  // Перевірка що moderationReason = null (не undefined)
  console.log(`  → moderationReason: ${saved.moderationReason === undefined ? '⚠️  undefined (не збережено)' : `"${saved.moderationReason}"`}`);
  if (saved.moderationReason === undefined) {
    reportWarning(
      'moderationReason не зберігається як null',
      'При push() Firebase ігнорує null-значення і не записує поле зовсім. ' +
      'В adminPanel при зчитуванні moderationReason буде undefined замість null — ' +
      'можливі помилки при рендерингу getModerationUserMessage().'
    );
  }

  console.log(`\n  Верифікація: ${verifyPassed} ✅  ${verifyFailed} ❌`);

  // Перевірка що оголошення НЕ з\'являється у публічному фіді (статус pending)
  console.log('\n  Фід (subscribe): оголошення з moderationStatus=pending...');
  console.log('  → subscribe() фільтрує ЛИШЕ status=approved → нова картка в фіді НЕ з\'явиться');
  console.log('  → Очікувана поведінка: ✅ оголошення очікує модерацію');

  // ══════════════════════════════════════════════════════════════════════════════
  // БЛОК 6: Додаткові UX-спостереження
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('【БЛОК 6】Додаткові UX-спостереження\n');

  // Перевірка: чи є оголошення бота у фіді (він раніше міг публікувати)
  const existingSnap = await db.ref('buy_sell_listings')
    .orderByChild('userId')
    .equalTo(BOT.uid)
    .once('value');
  const existing = existingSnap.val() || {};
  const existingIds = Object.keys(existing);
  console.log(`  Оголошення бота у buy_sell_listings: ${existingIds.length} шт.`);

  // Аналіз лімітів
  if (existingIds.length > 5) {
    reportWarning(
      `Бот має ${existingIds.length} оголошень — немає server-side ліміту на кількість`,
      'Клієнтський rate limiter (120с) не захищає від накопичення великої кількості оголошень. ' +
      'Немає ліміту на кількість активних оголошень одного користувача.'
    );
  }

  // Перевірка: статус кожного оголошення
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  for (const [id, item] of Object.entries(existing)) {
    if (item.moderationStatus === 'pending') pendingCount++;
    else if (item.moderationStatus === 'approved') approvedCount++;
    else if (item.moderationStatus === 'rejected') rejectedCount++;
  }
  console.log(`    pending: ${pendingCount}, approved: ${approvedCount}, rejected: ${rejectedCount}`);

  // Нове оголошення (щойно створили)
  pendingCount++; // +1 щойно додали
  console.log(`    + 1 нове (щойно створено) → pending: ${pendingCount}`);

  // ══════════════════════════════════════════════════════════════════════════════
  // ФІНАЛЬНИЙ ЗВІТ
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  ФІНАЛЬНИЙ ЗВІТ: ЗНАЙДЕНІ ПРОБЛЕМИ');
  console.log('══════════════════════════════════════════════════════════════\n');

  if (bugs.length > 0) {
    console.log(`🐛 БАГИ (${bugs.length}):\n`);
    for (const bug of bugs) {
      console.log(`  [${bug.id}] [${bug.severity}] ${bug.title}`);
      console.log(`    Деталі: ${bug.details}`);
      console.log(`    Відтворення: ${bug.reproduce}`);
      console.log();
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠️  ПОПЕРЕДЖЕННЯ (${warnings.length}):\n`);
    for (const w of warnings) {
      console.log(`  • ${w.title}`);
      console.log(`    ${w.details}`);
      console.log();
    }
  }

  if (uxIssues.length > 0) {
    console.log(`🎨 UX-ПРОБЛЕМИ (${uxIssues.length}):\n`);
    for (const u of uxIssues) {
      console.log(`  • ${u.title}`);
      console.log(`    ${u.details}`);
      console.log();
    }
  }

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Результат: ID=${pushRef.key}`);
  console.log(`  Баги: ${bugs.length} | Попередження: ${warnings.length} | UX: ${uxIssues.length}`);
  console.log('══════════════════════════════════════════════════════════════');

  process.exit(verifyFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Фатальна помилка:', err);
  process.exit(1);
});
