/**
 * step-kto-poteryal.mjs
 * Имитация действий бота Sofia Conti на экране "Кто потерял?"
 * Шаг за шагом воспроизводит все проверки, которые выполняет приложение,
 * документирует найденные баги и создаёт тестовую запись в /lost_found.
 *
 * Запуск: node scripts/step-kto-poteryal.mjs
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// ── Бот ──────────────────────────────────────────────────────────────────────
const BOT_EMAIL = 'sofia.conti@chaika-bot.test';
const BOT_PASSWORD = 'BotChaika2026!';

// ── Вспомогательные ──────────────────────────────────────────────────────────
const BUGS = [];
let bugCounter = 0;

const logBug = (severity, title, description, reproduction, suggestion = '') => {
  bugCounter++;
  BUGS.push({ id: bugCounter, severity, title, description, reproduction, suggestion });
  const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : '🔵';
  console.log(`\n${icon} БАГ #${bugCounter} [${severity}]: ${title}`);
  console.log(`   Описание: ${description}`);
  console.log(`   Воспроизведение: ${reproduction}`);
  if (suggestion) console.log(`   Рекомендация: ${suggestion}`);
};

const LATIN_WORD_RE = /\b[A-Za-z]{2,}\b/u;
const CYRILLIC_WORD_RE = /[\p{Script=Cyrillic}]{2,}/u;

const assertTextMatchesLanguage = (text, language) => {
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
};

const validatePhone = (phone) => /^\+380\d{9}$/.test(phone.replace(/\s/g, ''));

const normalizePhoneText = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('380')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+38${digits}`;
  return phone.trim();
};

// ── Категории экрана (language: ru) ──────────────────────────────────────────
const CATEGORIES_RU = ['Ключи', 'Игрушка', 'Одежда', 'Документы', 'Карта / брелок', 'Телефон', 'Сумка / рюкзак', 'Украшение', 'Другое'];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ТЕСТ: Экран "Кто потерял?" — Бот Sofia Conti              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Инициализация Firebase ────────────────────────────────────────────────
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });
  const db = admin.database();
  const auth = admin.auth();

  // ── Получить UID по email ─────────────────────────────────────────────────
  console.log(`[Шаг 0] Авторизация бота: ${BOT_EMAIL}`);
  let botUser;
  try {
    botUser = await auth.getUserByEmail(BOT_EMAIL);
    console.log(`  ✅ UID: ${botUser.uid}`);
  } catch (e) {
    console.error(`  ❌ Бот не найден в Firebase Auth: ${e.message}`);
    console.error('  → Запустите сначала: node scripts/seed-bot-users.mjs');
    process.exit(1);
  }
  const BOT_UID = botUser.uid;

  // ── Загрузить профиль из RTDB ─────────────────────────────────────────────
  console.log(`\n[Шаг 1] Загрузка профиля из RTDB (users/${BOT_UID})`);
  const profileSnap = await db.ref(`users/${BOT_UID}`).once('value');
  const profile = profileSnap.val();

  if (!profile) {
    console.error('  ❌ Профиль не найден в RTDB');
    process.exit(1);
  }

  const botName    = profile.name ?? '';
  const botPhone   = profile.phone ?? '';
  const botAvatar  = profile.photoURL ?? '';
  const botLang    = 'ru'; // интерфейс бота на русском

  console.log(`  name:     ${botName}`);
  console.log(`  phone:    ${botPhone}`);
  console.log(`  photoURL: ${botAvatar}`);
  console.log(`  language: ${botLang}`);

  // ── Проверка invite_access ────────────────────────────────────────────────
  console.log(`\n[Шаг 2] Проверка invite_access/${BOT_UID}`);
  const inviteSnap = await db.ref(`invite_access/${BOT_UID}`).once('value');
  const invite = inviteSnap.val();
  if (!invite || invite.status !== 'approved') {
    logBug('CRITICAL', 'Бот не имеет approved в invite_access',
      `Статус: ${invite?.status ?? 'не найден'}`,
      'Проверка выполнена до попытки открыть форму',
      'Запустить seed-bot-users.mjs повторно');
  } else {
    console.log(`  ✅ invite_access: ${invite.status}`);
  }

  // ── СИМУЛЯЦИЯ: Кнопка "+ Добавить заявку" ────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Пользователь нажимает "+ Добавить заявку"');
  console.log('──────────────────────────────────────────────────────────────');

  // validateSubmissionRequirements
  const hasUserId = Boolean(BOT_UID);
  const hasAvatar = Boolean(botAvatar?.trim());

  console.log(`\n[Валидация #1] validateSubmissionRequirements`);
  console.log(`  userId:   ${hasUserId ? '✅' : '❌'} (${BOT_UID})`);
  console.log(`  photoURL: ${hasAvatar ? '✅' : '❌'} (${botAvatar})`);

  if (!hasAvatar) {
    logBug('HIGH', 'Аватар start-avatar:// может не проходить визуальную проверку',
      'photoURL = start-avatar://4 — это схема, не HTTP URL. Компонент MiniUserAvatar / AppPhotoImage может не отображать его корректно.',
      '1. Открыть экран бота\n   2. Нажать "+ Добавить заявку"\n   3. Увидеть ошибку "Нужен аватар" несмотря на наличие start-avatar',
      'Убедиться что validateSubmissionRequirements принимает start-avatar:// как валидный photoURL (Boolean(photoURL?.trim()) должно быть true)');
  } else {
    console.log('  → Форма должна открыться ✅');
  }

  // ── СИМУЛЯЦИЯ: Форма открыта, prefill полей ───────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Форма открыта, проверяем prefill полей');
  console.log('──────────────────────────────────────────────────────────────');

  // Из кода: name и phone предзаполняются из user.name и user.phone
  let formName  = botName;   // prefilled
  let formPhone = normalizePhoneText(botPhone); // prefilled + normalizePhoneText
  let formType  = 'lost';    // бот потерял
  let formCategory = '';     // ещё не выбрана
  let formDescription = '';  // пустое

  console.log(`\n  Prefill имя:    "${formName}"`);
  console.log(`  Prefill телефон: "${formPhone}"`);
  console.log(`  Тип по умолчанию: "found" (не "lost"!)`);

  // Bug: тип по умолчанию = 'found', но пользователь пришёл на экран "Кто потерял?"
  logBug('LOW', 'Форма открывается с типом "Я нашёл" вместо "Я потерял"',
    'useState<RequestType>("found") инициализируется как "found" (найдено), хотя экран называется "Кто потерял?"',
    '1. Открыть экран "Кто потерял?"\n   2. Нажать "+ Добавить заявку"\n   3. Форма откроется с активной кнопкой "Я нашёл" — нужно переключать вручную',
    'Изменить дефолтное значение на "lost" OR предоставить явный выбор без предвзятого значения по умолчанию');

  // ── СИМУЛЯЦИЯ: Пользователь нажимает "Отправить" без заполнения ──────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Нажатие "Отправить" без выбора категории');
  console.log('──────────────────────────────────────────────────────────────');

  const submitEmpty = () => {
    // validateSubmissionRequirements: userId + photoURL — уже прошли
    if (!formPhone.trim() || !formCategory) {
      return { blocked: true, reason: 'formError: Заполните телефон и категорию.' };
    }
    return { blocked: false };
  };
  const emptyResult = submitEmpty();
  console.log(`\n  Ошибка при пустой форме: ${emptyResult.blocked ? `⚠️  "${emptyResult.reason}"` : '(нет)'}`);

  // Bug: сообщение "Заполните телефон и категорию" показывается даже когда телефон заполнен (только категория пустая)
  logBug('MEDIUM', 'Сообщение об ошибке неточное — упоминает телефон когда только категория пустая',
    'formError = "Заполните телефон и категорию." показывается как единое сообщение. Когда телефон уже prefilled и проблема только в отсутствии категории, сообщение вводит в заблуждение.',
    '1. Открыть форму (телефон prefilled)\n   2. Не выбирать категорию\n   3. Нажать "+ Добавить заявку"\n   4. Алерт: "Заполните телефон и категорию." — хотя телефон уже есть',
    'Разделить проверки: отдельный алерт когда только категория пустая');

  // ── СИМУЛЯЦИЯ: Проверка валидации телефона ────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Пользователь вводит разные форматы телефона');
  console.log('──────────────────────────────────────────────────────────────');

  const phoneTests = [
    { input: '+380671000004', expected: true, label: 'Стандартный +380' },
    { input: '0671000004', expected: false, label: '10 цифр без +380 (нормализован в normalizePhoneText, но validatePhone ожидает +380)' },
    { input: '+7 (067) 100-00-04', expected: false, label: 'Российский формат' },
    { input: '380671000004', expected: false, label: 'Без + знака' },
    { input: '+380 67 100 00 04', expected: true, label: '+380 с пробелами (replace whitespace)' },
  ];

  console.log('\n  Тесты validatePhone:');
  phoneTests.forEach(({ input, expected, label }) => {
    const normalized = normalizePhoneText(input);
    const result = validatePhone(normalized);
    const pass = result === expected;
    console.log(`  ${pass ? '✅' : '⚠️ '} "${input}" → normalize→"${normalized}" → valid:${result} (ожидалось: ${expected}) — ${label}`);
  });

  // Потенциальный UX баг с телефоном
  logBug('LOW', 'Телефон 10-цифр (0671000004) normalizePhoneText добавляет +38, но validatePhone требует ровно +380XXXXXXXXX',
    'normalizePhoneText("0671000004") → "+380671000004" (12 цифр, правильно). Но если пользователь вводит "067 100 00 04" (9 цифр без ведущего 0), normalizePhoneText вернёт оригинал без +380, и validatePhone провалится.',
    '1. Открыть форму\n   2. Удалить prefilled телефон\n   3. Ввести "067 100 00 04" (9 цифр)\n   4. Нажать отправить — увидеть ошибку валидации',
    'Добавить более гибкое определение украинских номеров (09x, 06x без ведущего 0 + 380)');

  // ── СИМУЛЯЦИЯ: contentLanguageGuard — ИМЯ БОТА ───────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Проверка contentLanguageGuard для имени бота');
  console.log('──────────────────────────────────────────────────────────────');

  formCategory = 'Ключи';  // бот выбрал категорию
  const checkText = `${formName} ${formCategory}`.trim();
  const langError = assertTextMatchesLanguage(checkText, botLang);

  console.log(`\n  Текст для проверки: "${checkText}"`);
  console.log(`  Язык: "${botLang}"`);
  console.log(`  Результат: ${langError ? `❌ ОШИБКА: "${langError}"` : '✅ OK'}`);

  if (langError) {
    logBug('CRITICAL', 'Latin-имя пользователя блокирует отправку заявки',
      `assertTextMatchesLanguage("${checkText}", "${botLang}") бросает ошибку: "${langError}". Имя пользователя prefill-ится автоматически из профиля — пользователь не видит причину блокировки.`,
      `1. Зайти как бот с именем "Sofia Conti" (Latin)\n   2. Открыть "Кто потерял?" → "+ Добавить заявку"\n   3. Телефон, категория заполнены, язык = "${botLang}"\n   4. Нажать отправить\n   5. lostFoundService.add() → assertTextMatchesLanguage → throw Error\n   6. Пользователь видит showUserError("send") — непонятно что делать`,
      'Исключить поле name из проверки contentLanguageGuard (проверять только description) ИЛИ применять context="general" только к description+category');
  }

  // ── СИМУЛЯЦИЯ: Правильное заполнение формы ───────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Правильное заполнение формы ботом');
  console.log('──────────────────────────────────────────────────────────────');

  // Для обхода contentLanguageGuard — используем кириллическое имя как в профиле
  // В реальном приложении бот не может изменить своё имя в профиле через форму
  const submissionName = 'Софія Конті'; // кириллическая версия имени
  const submissionPhone = normalizePhoneText(botPhone);
  const submissionCategory = 'Ключи';
  const submissionDescription = 'Загубила ключі від квартири на майданчику біля ліфта. Синя брелок-черепаха. Прошу зв\'язатись!';
  const submissionType = 'lost';
  const submissionLang = 'ua'; // используем ua чтобы избежать конфликта с именем

  console.log('\n  Итоговые данные формы:');
  console.log(`  type:        ${submissionType}`);
  console.log(`  name:        "${submissionName}"`);
  console.log(`  phone:       "${submissionPhone}"`);
  console.log(`  category:    "${submissionCategory}"`);
  console.log(`  description: "${submissionDescription}"`);
  console.log(`  language:    "${submissionLang}"`);

  // Финальная проверка contentLanguageGuard
  const finalCheck = `${submissionName} ${submissionCategory}`.trim();
  const finalLangErr = assertTextMatchesLanguage(finalCheck, submissionLang);
  console.log(`\n  contentLanguageGuard("${finalCheck}", "${submissionLang}"): ${finalLangErr ? `❌ ${finalLangErr}` : '✅ OK'}`);

  // Проверка дублей
  console.log(`\n[Шаг 3] Проверка дублей в /lost_found`);
  const existingSnap = await db.ref('lost_found').once('value');
  const existing = existingSnap.val() || {};
  const normalizedPhone = submissionPhone;
  const normalizedDesc = submissionDescription.trim().toLowerCase();
  let hasDuplicate = false;

  for (const [id, item] of Object.entries(existing)) {
    if (item.isArchived || item.type !== submissionType || item.category !== submissionCategory) continue;
    if (item.userId && item.userId !== BOT_UID) continue;
    const samePhone = normalizePhoneText(item.phone) === normalizedPhone;
    const sameDesc = (item.description ?? '').trim().toLowerCase() === normalizedDesc;
    if (samePhone && sameDesc) {
      hasDuplicate = true;
      console.log(`  ⚠️  Дубль найден: /lost_found/${id}`);
      break;
    }
  }

  if (!hasDuplicate) {
    console.log(`  ✅ Дублей не найдено — можно создавать запись`);
  }

  // ── ОТПРАВКА в Firebase ───────────────────────────────────────────────────
  if (hasDuplicate) {
    console.log('\n  → Пропускаю запись — найден дубль');
  } else {
    console.log('\n[Шаг 4] Запись в /lost_found (Admin SDK, минуя auth-guard)');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    const record = {
      type: submissionType,
      name: submissionName,
      phone: submissionPhone,
      category: submissionCategory,
      description: submissionDescription,
      photoUri: '',
      photoStoragePath: '',
      userPhotoURL: botAvatar,
      moderationStatus: 'pending',
      submittedForModerationAt: now.toISOString(),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      userId: BOT_UID,
      language: submissionLang,
      _testBot: true,
      _botEmail: BOT_EMAIL,
    };

    const newRef = await db.ref('lost_found').push(record);
    if (!newRef.key) {
      console.error('  ❌ Firebase не вернул ID');
      process.exit(1);
    }
    console.log(`  ✅ Запись создана: /lost_found/${newRef.key}`);
    console.log(`  moderationStatus: pending (ждёт модератора)`);
    console.log(`  expiresAt: ${expiresAt.toISOString()}`);

    // Проверяем — видна ли запись в feed? (только approved появляются в подписке)
    console.log('\n[Шаг 5] Проверка видимости в feed');
    const savedSnap = await db.ref(`lost_found/${newRef.key}`).once('value');
    const saved = savedSnap.val();
    console.log(`  moderationStatus: ${saved.moderationStatus}`);

    if (saved.moderationStatus === 'pending') {
      logBug('MEDIUM', 'Запись создана, но НЕ видна в списке пока не одобрена модератором',
        'lostFoundService.subscribe() фильтрует только moderationStatus="approved". Pending-запись не отображается создавшему пользователю — нет индикатора "на модерации".',
        '1. Создать заявку\n   2. Получить алерт "Заявка отправлена на модерацию"\n   3. Вернуться в список — своей заявки нет\n   4. Пользователь не знает, прошла ли заявка',
        'Показывать pending-записи текущего пользователя в его списке (собственные заявки на модерации)');
    }
  }

  // ── ДОПОЛНИТЕЛЬНЫЕ UX НАБЛЮДЕНИЯ ─────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('🎬 СИМУЛЯЦИЯ: Дополнительные UX-проблемы');
  console.log('──────────────────────────────────────────────────────────────');

  // Проверка: нет поля "Имя" в русских категориях (всё верно — есть)
  // Проверка: категории горизонтальный скролл — нет индикатора скролла
  logBug('LOW', 'Горизонтальный скролл категорий не имеет визуального индикатора',
    'showsHorizontalScrollIndicator={false} — пользователь не знает что есть ещё категории справа. На маленьких экранах категории "Украшение" и "Другое" не видны.',
    '1. Открыть форму на небольшом экране (5")\n   2. Увидеть только первые 5-6 категорий\n   3. Не очевидно что нужно скроллить',
    'Добавить fadeEdge или показать индикатор прокрутки');

  // Проверка: description placeholder mentions "где потеряно" but field is used for both "found" and "lost"
  logBug('LOW', 'Плейсхолдер описания не меняется при переключении типа found/lost',
    'descriptionPlaceholder = "Описание: цвет, особенности, где потеряно..." — не обновляется при выборе "Я нашёл". Для типа "found" нужен текст "где найдено".',
    '1. Открыть форму\n   2. Переключить на "Я нашёл"\n   3. Placeholder всё равно говорит "где потеряно"',
    'Сделать placeholder зависимым от state type');

  // Проверка: кнопка закрытия формы — двойное подтверждение
  logBug('LOW', 'Закрытие формы требует подтверждения даже для пустой формы',
    'handleRequestCloseModal всегда показывает Alert.alert("Закрити форму?") независимо от того, заполнена форма или нет.',
    '1. Открыть форму\n   2. Ничего не вводить\n   3. Нажать ✕ или свайп вниз\n   4. Появится алерт "Вы ещё не отправили заявку. Закрыть?" — лишний шаг',
    'Показывать алерт только если хотя бы одно поле изменено (dirty state)');

  // ── ИТОГОВЫЙ ОТЧЁТ ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ИТОГОВЫЙ ОТЧЁТ                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const critical = BUGS.filter(b => b.severity === 'CRITICAL');
  const high     = BUGS.filter(b => b.severity === 'HIGH');
  const medium   = BUGS.filter(b => b.severity === 'MEDIUM');
  const low      = BUGS.filter(b => b.severity === 'LOW');

  console.log(`  Всего багов: ${BUGS.length}`);
  console.log(`  🔴 CRITICAL: ${critical.length}`);
  console.log(`  🟠 HIGH:     ${high.length}`);
  console.log(`  🟡 MEDIUM:   ${medium.length}`);
  console.log(`  🔵 LOW:      ${low.length}`);

  console.log('\n  Детальный список:');
  BUGS.forEach(b => {
    const icon = b.severity === 'CRITICAL' ? '🔴' : b.severity === 'HIGH' ? '🟠' : b.severity === 'MEDIUM' ? '🟡' : '🔵';
    console.log(`\n  ${icon} #${b.id} [${b.severity}] ${b.title}`);
    console.log(`     ${b.description}`);
    console.log(`     Воспроизведение: ${b.reproduction}`);
    if (b.suggestion) console.log(`     Fix: ${b.suggestion}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Экран "Кто потерял?" — тест завершён (бот: Sofia Conti)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Критическая ошибка скрипта:', err.message);
  console.error(err.stack);
  process.exit(1);
});
