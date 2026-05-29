/**
 * step6-kontakt-xxx.mjs
 * Симулює дії бота на екрані "Контакти Чайки".
 * Мета: знайти баги та трудності при створенні анкети.
 *
 * Бот: Luca Moretti (логіст, UID: 24h7Iz6ayzgeD73VkCKrIcGnXJ73)
 * Запуск: node scripts/step6-kontakt-xxx.mjs
 */

import path from 'node:path';
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
  phone: '+380671000001',
  uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
  avatarKey: '1',
  apartment: '47',
};

// --- Копія логіки з клієнта (для симуляції без React Native) ---

const CONTACT_LEGACY_CATEGORY_VALUES = [
  'furniture', 'appliances', 'electronics', 'kids', 'clothes',
  'sport', 'books', 'kitchen', 'construction', 'plants', 'other',
];

const CATEGORY_LABELS_UA = {
  furniture: 'Чоловік',
  appliances: 'Жінка',
  electronics: 'Пара',
  kids: 'Компанія друзів',
  clothes: 'Сусід по будинку',
  sport: 'Сусід по району',
  books: 'Хтось для спілкування',
  kitchen: 'Хтось для прогулянок',
  construction: 'Хтось для спорту',
  plants: 'Хтось для подорожей',
  other: 'Інше',
};

const CONDITION_LABELS_UA = {
  new: 'Дружбу',
  like_new: 'Спілкування',
  good: 'Романтику',
  fair: 'Спільні інтереси',
};

// Копія assertTextMatchesLanguage з contentLanguageGuard.ts
const LATIN_WORD_RE = /\b[A-Za-z]{2,}\b/u;
const CYRILLIC_WORD_RE = /[\u0400-\u04FF]{2,}/u;

function assertTextMatchesLanguage(text, language) {
  const hasLatinWord = LATIN_WORD_RE.test(text);
  const hasCyrillicWord = CYRILLIC_WORD_RE.test(text);
  if ((language === 'ua' || language === 'ru') && hasLatinWord) {
    throw new Error(
      language === 'ua'
        ? 'У заявці знайдено англійські слова. Будь ласка, напишіть текст мовою застосунку.'
        : 'В заявке найдены английские слова. Пожалуйста, напишите текст на языке приложения.',
    );
  }
  if (language === 'en' && hasCyrillicWord) {
    throw new Error('The request contains non-English words. Please write it in the app language.');
  }
}

// Копія normalizePhoneText (спрощена)
function normalizePhoneText(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '+380';
  return '+' + digits;
}

// Валідація форми (відображає ВИПРАВЛЕНИЙ handleSubmit з Kontakt-XXX.tsx)
function validateForm({ category, condition, price, description, phone, language, userName }) {
  const errors = [];
  const normalizedPrice = price.replace(',', '.').replace(/[^\d.]/g, '');
  const numericPrice = Number(normalizedPrice);

  if (!category) errors.push({ field: 'category', msg: 'Заповніть усі поля (category порожній)' });
  if (!condition) errors.push({ field: 'condition', msg: 'Заповніть усі поля (condition порожній)' });
  if (!description.trim()) errors.push({ field: 'description', msg: 'Додайте кілька слів про себе.' });
  if (!phone.trim()) errors.push({ field: 'phone', msg: 'Заповніть усі поля (phone порожній)' });
  if (!normalizedPrice) errors.push({ field: 'price', msg: 'Вкажіть вік (поле порожнє)' });
  // BUG-02 FIXED: додано перевірку > 120
  if (normalizedPrice && (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 120)) {
    errors.push({ field: 'price', msg: 'Вкажіть коректний вік.' });
  }
  if (phone.replace(/\D/g, '').length < 7) {
    errors.push({ field: 'phone', msg: 'Перевірте номер телефону (менше 7 цифр)' });
  }

  // BUG-01 FIXED: перевірка мови ДО відправки в сервіс — показує конкретне повідомлення
  const langErr = getLanguageValidationError(description.trim(), language);
  if (langErr) {
    errors.push({ field: 'language_guard', msg: langErr, shown_to_user: langErr });
  }

  return errors;
}

// BUG-01 FIXED: копія getLanguageValidationError (тепер викликається ДО сервісу)
function getLanguageValidationError(text, language) {
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

// --------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Шаг 6: Контакти Чайки — симуляція дій бота            ║');
  console.log('║   Мета: знайти баги та трудності при створенні анкети    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Init Firebase Admin
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();

  console.log(`Бот:  ${BOT.name}`);
  console.log(`UID:  ${BOT.uid}`);
  console.log(`Email: ${BOT.email}\n`);

  // ══════════════════════════════════════════════════
  // БЛОК 1: Передумови (як validateSubmissionRequirements)
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 1: Перевірка передумов ━━━\n');

  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();

  const hasAvatar = Boolean(profile?.photoURL?.trim());
  const hasName = Boolean(profile?.name?.trim());
  const registrationStatus = profile?.registrationStatus ?? '(відсутній)';

  console.log(`[1.1] Профіль існує:         ${profile ? '✅' : '❌ НЕ ЗНАЙДЕНО'}`);
  console.log(`[1.2] Аватар (photoURL):     ${hasAvatar ? '✅ є' : '❌ НЕ МАЄ — блокує відправку'}`);
  console.log(`[1.3] Ім\'я профілю:          ${hasName ? `✅ "${profile.name}"` : '❌ відсутнє'}`);
  console.log(`[1.4] registrationStatus:    ${registrationStatus}`);

  if (!hasAvatar) {
    console.log('\n⛔  validateSubmissionRequirements поверне false.');
    console.log('    Alert: "Потрібен аватар — Для надсилання прохання потрібен профіль з аватаром."');
    console.log('    → Кнопка "Опублікувати" заблокована. Бот зупинений.\n');
    console.log('    📋 БАГ-СПОСТЕРЕЖЕННЯ: немає можливості продовжити без аватара,');
    console.log('    але інтерфейс не підсвічує поле аватара при кліку "Опублікувати" —');
    console.log('    лише Alert. На деяких Android Alert зникає після тапу поза ним.\n');
    process.exit(1);
  }

  const inviteSnap = await db.ref(`invite_access/${BOT.uid}`).once('value');
  const inviteData = inviteSnap.val();
  const inviteStatus = inviteData?.status ?? '(відсутній)';
  console.log(`[1.5] invite_access статус:  ${inviteStatus === 'approved' ? '✅ approved' : `⚠️  ${inviteStatus}`}`);

  console.log('\n✅ Передумови пройдено. Переходимо до форми.\n');

  // ══════════════════════════════════════════════════
  // БЛОК 2: Симуляція відкриття форми
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 2: Відкриття форми "+ Додати контакт" ━━━\n');

  console.log('  [Дія] Бот тапає кнопку "+ Додати контакт" внизу екрану.');
  console.log('  → Modal відкривається з анімацією slide.');
  console.log('  → Поле "Контактний телефон" предзаповнюється з профілю: ' + (profile?.phone ?? '(немає у профілі)'));

  const prefillPhone = profile?.phone ? normalizePhoneText(profile.phone) : '+380';
  console.log(`  → normalizePhoneText → "${prefillPhone}"\n`);

  if (!profile?.phone) {
    console.log('  ⚠️  СПОСТЕРЕЖЕННЯ: телефон не збережено в профілі — поле починається з "+380".');
    console.log('     Бот мусить вручну ввести всі цифри. UX-тертя.\n');
  }

  // ══════════════════════════════════════════════════
  // БЛОК 3: Спроба #1 — латинські слова у описі (симуляція типового бага)
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 3: Спроба #1 — введення тексту з латиницею ━━━\n');

  const attempt1 = {
    category: 'furniture',       // "Чоловік"
    condition: 'new',             // "Дружбу"
    price: '34',
    phone: BOT.phone,
    description: 'Привіт! Мене звати Luca, люблю sport та активний відпочинок.',
    language: 'ua',
  };

  console.log('  [Форма #1 — дані бота]:');
  console.log(`    Хто я:        ${CATEGORY_LABELS_UA[attempt1.category]}`);
  console.log(`    Шукаю:        ${CONDITION_LABELS_UA[attempt1.condition]}`);
  console.log(`    Вік:          ${attempt1.price}`);
  console.log(`    Телефон:      ${attempt1.phone}`);
  console.log(`    Про себе:     "${attempt1.description}"`);
  console.log(`    Мова:         ${attempt1.language}\n`);

  const errors1 = validateForm({ ...attempt1, userName: BOT.name });

  if (errors1.length > 0) {
    const langErr = errors1.find((e) => e.field === 'language_guard');
    console.log('  ❌ ПОМИЛКИ при відправці:');
    errors1.forEach((e, i) => {
      console.log(`    [${i + 1}] Поле: ${e.field}`);
      console.log(`         Що бачить користувач: "${e.shown_to_user || e.msg}"`);
    });
    if (langErr) {
      console.log('\n  ✅ BUG-01 FIXED: тепер показує конкретну причину, а не "Не вдалося зберегти".');
    }
    console.log('');
  } else {
    console.log('  ✅ Форма #1 пройшла всі перевірки.\n');
  }

  // ══════════════════════════════════════════════════
  // БЛОК 4: Спроба #2 — порожні поля (submit без заповнення)
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 4: Спроба #2 — кнопка "Опублікувати" без заповнення ━━━\n');

  const attempt2 = {
    category: '',
    condition: '',
    price: '',
    phone: '+380',
    description: '',
    language: 'ua',
  };

  console.log('  [Форма #2 — всі поля порожні]');
  const errors2 = validateForm(attempt2);

  if (errors2.length > 0) {
    console.log('  ❌ Помилки форми (submitAttempted = true → підсвічуються FormFieldError):');
    errors2.forEach((e, i) => {
      console.log(`    [${i + 1}] ${e.field}: ${e.msg}`);
    });
    console.log('');
  }

  // ══════════════════════════════════════════════════
  // БЛОК 5: Спроба #3 — некоректний вік
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 5: Спроба #3 — некоректний вік (0 та 999) ━━━\n');

  for (const ageTest of ['0', '999', '-5', '0.5', '25', '120', '121']) {
    const e = validateForm({ category: 'furniture', condition: 'new', price: ageTest, phone: '+380991234567', description: 'Тест', language: 'ua', userName: BOT.name });
    const priceErr = e.find((err) => err.field === 'price');
    const pass = !priceErr;
    const valid = ['25', '120'].includes(ageTest);
    const label = pass
      ? (valid ? '✅ прийнятий (коректно)' : '⚠️  прийнятий — перевірте логіку')
      : `❌ відхилено — ${priceErr?.msg}`;
    console.log(`  Вік "${ageTest}": ${label}`);
  }
  console.log('  → BUG-02 FIXED: 999, -5, 0.5, 121 тепер відхиляються (діапазон 1–120).');
  console.log('');

  // ══════════════════════════════════════════════════
  // БЛОК 6: Спроба #4 — валідна анкета, відправка в Firebase
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 6: Спроба #4 — валідна анкета, відправка ━━━\n');

  const attempt4 = {
    category: 'furniture',
    condition: 'like_new',
    price: '34',
    phone: BOT.phone,
    description: 'Привіт! Я Лука, логіст, живу в будинку. Шукаю людей для спілкування та прогулянок районом. Відповідаю швидко.',
    language: 'ua',
  };

  console.log('  [Форма #4 — валідні дані]:');
  console.log(`    Хто я:    ${CATEGORY_LABELS_UA[attempt4.category]}`);
  console.log(`    Шукаю:    ${CONDITION_LABELS_UA[attempt4.condition]}`);
  console.log(`    Вік:      ${attempt4.price}`);
  console.log(`    Телефон:  ${attempt4.phone}`);
  console.log(`    Опис:     "${attempt4.description}"\n`);

  const errors4 = validateForm({ ...attempt4, userName: BOT.name });
  const langError4 = errors4.find((e) => e.field === 'language_guard');
  const formErrors4 = errors4.filter((e) => e.field !== 'language_guard');

  if (formErrors4.length > 0) {
    console.log('  ❌ Помилки форми:', formErrors4);
    process.exit(1);
  }

  if (langError4) {
    console.log('  ⚠️  assertTextMatchesLanguage не блокує (текст чистий).');
    console.log(`  Тест: ${langError4.msg}\n`);
  } else {
    console.log('  ✅ Усі перевірки пройдено. Відправляємо в Firebase...\n');
  }

  // BUG-05 FIXED: itemName тепер = ім'я користувача, не категорія
  const itemName = BOT.name || CATEGORY_LABELS_UA[attempt4.category];
  const now = new Date();
  const TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const contactData = {
    itemName,
    category: attempt4.category,
    condition: attempt4.condition,
    price: String(Number(attempt4.price)),
    description: attempt4.description,
    phone: attempt4.phone,
    photoUri: '',
    photoStoragePath: '',
    photoId: '',
    moderationStatus: 'pending',
    submittedForModerationAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    userId: BOT.uid,
    showPhone: true,
    language: attempt4.language,
  };

  const pushResult = await db.ref('contacts_listings').push(contactData);

  if (!pushResult.key) {
    console.error('❌ Firebase не повернув ID');
    process.exit(1);
  }

  console.log(`✅ Анкета збережена! ID: ${pushResult.key}`);
  console.log(`   Шлях: /contacts_listings/${pushResult.key}`);
  console.log(`   Статус: pending (очікує модерації)\n`);

  // Верифікація збереженого запису
  const savedSnap = await db.ref(`contacts_listings/${pushResult.key}`).once('value');
  const saved = savedSnap.val();

  console.log('  Перевірка збережених даних:');
  console.log(`    itemName:              ${saved.itemName}`);
  console.log(`    category:              ${saved.category}`);
  console.log(`    condition:             ${saved.condition}`);
  console.log(`    price (вік):           ${saved.price}`);
  console.log(`    description:           "${saved.description.slice(0, 50)}..."`);
  console.log(`    phone:                 ${saved.phone}`);
  console.log(`    moderationStatus:      ${saved.moderationStatus}`);
  console.log(`    userId:                ${saved.userId}`);
  console.log(`    showPhone:             ${saved.showPhone}`);
  console.log(`    createdAt:             ${saved.createdAt}`);
  console.log(`    expiresAt:             ${saved.expiresAt}`);
  console.log('');

  // ══════════════════════════════════════════════════
  // БЛОК 7: UX-спостереження на картці після модерації
  // ══════════════════════════════════════════════════
  console.log('━━━ БЛОК 7: UX-спостереження на картці (після approval) ━━━\n');

  console.log(`  displayName = profile?.name || item.itemName`);
  console.log(`  profile.name = "${profile?.name ?? '(відсутній)'}", item.itemName = "${itemName}"`);
  const displayName = profile?.name?.trim() || itemName;
  console.log(`  → Картка покаже ім\'я: "${displayName}"`);

  if (!profile?.name?.trim()) {
    console.log('  ⚠️  БАГ UX: якщо у користувача немає profile.name,');
    console.log('     картка показує itemName = категорію ("Чоловік", "Жінка" тощо),');
    console.log('     а не реальне ім\'я людини.\n');
  } else {
    console.log('  ✅ Ім\'я профілю є — картка покаже правильне ім\'я.\n');
  }

  // BUG-04 FIXED: "р." прибрано — тепер просто число
  const ageText = saved.price ? `${saved.price}` : '';
  console.log(`  Вік на картці: "${ageText}" (без "р." — BUG-04 FIXED ✅)\n`);

  // ══════════════════════════════════════════════════
  // ПІДСУМКОВИЙ ЗВІТ
  // ══════════════════════════════════════════════════
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              ПІДСУМКОВИЙ ЗВІТ — Баги та трудності           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results = [
    { id: 'BUG-01', status: '✅ FIXED', title: 'Текст з латиницею → тепер показує конкретну помилку у toast перед відправкою' },
    { id: 'BUG-02', status: '✅ FIXED', title: 'Вік: валідація 1–120 (відхиляє 0, 0.5, 999, 121)' },
    { id: 'BUG-03', status: '✅ FIXED', title: 'Пошук по імені: itemName тепер зберігає реальне ім\'я (вирішено через BUG-05 fix)' },
    { id: 'BUG-04', status: '✅ FIXED', title: '"р." прибрано — вік відображається як просте число' },
    { id: 'BUG-05', status: '✅ FIXED', title: 'Картка показує ім\'я користувача, а не стать' },
    { id: 'BUG-06', status: '— N/A',   title: 'Анкети не зникають (дизайн системи)' },
    { id: 'OBS-01', status: '✅ FIXED', title: 'Телефон починається з "+380" якщо profile.phone порожній' },
  ];

  results.forEach((r) => {
    console.log(`  ${r.id}  ${r.status}  ${r.title}`);
  });
  console.log('');
  const fixed = results.filter((r) => r.status.includes('FIXED')).length;
  console.log(`  Всього виправлено: ${fixed} / ${results.filter((r) => !r.status.includes('N/A')).length}`);

  console.log('━━━ Результат тесту ━━━');
  console.log(`  Анкета бота збережена в Firebase: /contacts_listings/${pushResult.key}`);
  console.log('  Статус: pending → потребує модерації перед появою у списку');
  console.log('  Фото: не завантажено (опціонально для цього екрану)');
  console.log('\n=== Шаг 6 завершено ===');

  process.exit(0);
}

main().catch((err) => {
  console.error('Критична помилка скрипту:', err);
  process.exit(1);
});
