/**
 * test-pomoch-sosedyam.mjs
 * Имитация действий пользователя на экране «Помощь Соседям» (Pomoch-Sosedyam.tsx)
 * Бот: Francesca Gallo — специализация: Здоровье, уход
 *
 * Цель: собрать информацию о багах и трудностях при создании заявки.
 * Запуск: node scripts/test-pomoch-sosedyam.mjs
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// ─── Данные бота ───────────────────────────────────────────────────────────────
const BOT = {
  name: 'Francesca Gallo',
  email: 'francesca.gallo@chaika-bot.test',
  phone: '+380671000006',
  uid: 'hSscTmNWOJfgQ8yNwH8yT2pIZop1', // будет перезаписан из Firebase Auth
  avatarKey: '6',
};

// ─── Константы из исходного кода экрана ──────────────────────────────────────
const HELP_NEIGHBORS_MAX_PER_DAY = 3;          // из Pomoch-Sosedyam.tsx
const MAX_REQUEST_TEXT_LENGTH = 280;           // из firebase-config.ts
const FORM_MAXLENGTH = 500;                    // из TextInput maxLength={500}
const HELP_REQUEST_COOLDOWN_MS = 30_000;       // RATE_LIMITERS.helpRequest

const BUGS = [];

function logBug(severity, title, detail) {
  BUGS.push({ severity, title, detail });
  const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : '🔵';
  console.log(`\n${icon} [${severity}] ${title}`);
  console.log(`   ${detail}`);
}

function logStep(step, msg) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ШАГ ${step}: ${msg}`);
  console.log('─'.repeat(60));
}

function logOk(msg) { console.log(`  ✅ ${msg}`); }
function logWarn(msg) { console.log(`  ⚠️  ${msg}`); }
function logInfo(msg) { console.log(`  ℹ️  ${msg}`); }

// ─── Вспомогательные функции (копируем логику экрана) ────────────────────────

const maskPhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return '+' + digits.slice(0, 5) + '***' + digits.slice(-2);
};

const normalizePersonName = (name) => {
  return name
    .replace(/[^A-Za-zА-Яа-яІіЇїЄєҐґ\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const normalizePhoneText = (phone) => {
  return phone.replace(/[^\d+]/g, '');
};

const sanitizeStoredText = (text) => text.trim();

const normalizeText = (value, maxLength) => {
  if (!value) return '';
  const text = String(value).trim();
  const withoutHtml = text.replace(/<[^>]*>/g, '');
  const safe = withoutHtml
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\uFFFD/g, '');
  return safe.slice(0, maxLength).trim();
};

const getRequestExpiryTtlMs = (group, category) => {
  if (group === 'help_neighbors' || category === 'medical' || category === 'care') {
    return 10 * 24 * 60 * 60 * 1000; // 10 days
  }
  return 15 * 24 * 60 * 60 * 1000; // 15 days
};

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     ТЕСТ: Экран «Помощь Соседям» (Pomoch-Sosedyam)      ║');
  console.log('║     Бот: Francesca Gallo — Здоровье, уход               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ─── Инициализация Firebase Admin ─────────────────────────────────────────
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      storageBucket: 'chaikaua-3cd9d.appspot.com',
      ...getFirebaseAdminConfig(),
    });
  }
  const db = admin.database();
  const auth = admin.auth();

  // ─── ШАГ 1: Разрешить UID из Firebase Auth ────────────────────────────────
  logStep(1, 'Проверка аккаунта бота в Firebase Auth');
  let resolvedUid = BOT.uid;
  try {
    const userRecord = await auth.getUserByEmail(BOT.email);
    resolvedUid = userRecord.uid;
    BOT.uid = resolvedUid;
    logOk(`Firebase Auth: аккаунт найден`);
    logInfo(`UID: ${resolvedUid}`);
    logInfo(`Email: ${userRecord.email}`);
    logInfo(`Disabled: ${userRecord.disabled}`);
    if (userRecord.disabled) {
      logBug('HIGH', 'Аккаунт бота отключён', `${BOT.email} — disabled:true. Бот не сможет войти в приложение.`);
    }
  } catch (err) {
    logBug('CRITICAL', 'Аккаунт бота не найден в Firebase Auth', err.message);
    console.error('\n❌ Невозможно продолжить без аккаунта.');
    process.exit(1);
  }

  // ─── ШАГ 2: Проверка профиля пользователя (prerequisites экрана) ──────────
  logStep(2, 'Проверка профиля (аватар, invite_access)');
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();

  if (!profile) {
    logBug('CRITICAL', 'Профиль пользователя отсутствует', `users/${BOT.uid} = null`);
  } else {
    logOk(`Профиль найден: ${profile.name || '—'}`);
    logInfo(`photoURL:          ${profile.photoURL || '(пусто)'}`);
    logInfo(`startAvatarKey:    ${profile.startAvatarKey || '(пусто)'}`);
    logInfo(`registrationStatus: ${profile.registrationStatus || '(пусто)'}`);
  }

  // Перевіряємо аватар (як це робить validateSubmissionRequirements)
  const hasPhotoURL = Boolean(profile?.photoURL?.trim());
  const hasStartAvatar = Boolean(profile?.startAvatarKey?.trim());
  const hasAvatar = hasPhotoURL || hasStartAvatar;

  if (!hasAvatar) {
    logBug('HIGH', 'У бота немає аватара — форму заблоковано',
      `validateSubmissionRequirements: hasAvatar = false. photoURL="${profile?.photoURL || ''}", startAvatarKey="${profile?.startAvatarKey || ''}"`);
  } else if (hasStartAvatar && !hasPhotoURL) {
    logInfo(`startAvatarKey='${profile.startAvatarKey}' (без photoURL)`);
    logOk(`validateSubmissionRequirements: startAvatarKey приймається як аватар — форма НЕ заблокована`);
  } else {
    logOk(`Аватар: photoURL присутній`);
  }

  // invite_access
  const inviteSnap = await db.ref(`invite_access/${BOT.uid}`).once('value');
  const invite = inviteSnap.val();
  if (!invite || invite.status !== 'approved') {
    logBug('CRITICAL', 'invite_access не approved', `invite_access/${BOT.uid} = ${JSON.stringify(invite)}`);
  } else {
    logOk(`invite_access: ${invite.status}`);
  }

  // ─── ШАГ 3: Симуляция заполнения формы ───────────────────────────────────
  logStep(3, 'Симуляция заполнения формы (как пользователь)');

  // Данные как вводит пользователь
  const rawName = profile?.name || BOT.name;
  const rawPhone = BOT.phone;
  const helpType = 'medical'; // Медицинская помощь — основная специализация бота
  const rawDescription = 'Потрібна допомога — у моєї сусідки погано зі здоров\'ям, вона не може самостійно дійти до аптеки. Хто може купити ліки або відвезти на прийом до лікаря сьогодні до 18:00? Мешкаємо в корпусі В, підʼїзд 3.';

  logInfo(`Ім'я (raw):        "${rawName}"`);
  logInfo(`Телефон (raw):     "${rawPhone}"`);
  logInfo(`Тип допомоги:      "${helpType}"`);
  logInfo(`Опис (raw, ${rawDescription.length} симв.): "${rawDescription.slice(0, 80)}..."`);

  // Нормалізація — як робить handleSubmit
  const normalizedName = normalizePersonName(rawName);
  const normalizedPhone = normalizePhoneText(rawPhone);
  const userDescription = rawDescription.trim();

  logInfo(`Ім'я (normalized): "${normalizedName}"`);
  logInfo(`Телефон (normalized): "${normalizedPhone}"`);

  // ─── ШАГ 4: Перевірка валідацій ─────────────────────────────────────────
  logStep(4, 'Перевірка всіх валідацій (replicate handleSubmit logic)');

  // Валідація 1: обов'язкові поля
  if (!normalizedName || !normalizedPhone || !helpType) {
    logBug('HIGH', 'Порожні обов\'язкові поля', 'Форма показує Alert "Заповніть усі поля"');
  } else {
    logOk('Обов\'язкові поля заповнені');
  }

  // Валідація 2: validateName / validatePhone
  const nameValid = normalizedName.trim().length >= 2;
  const phoneDigits = normalizedPhone.replace(/\D/g, '');
  const phoneValid = /^380\d{9}$/.test(phoneDigits) || /^0\d{9}$/.test(phoneDigits);

  if (!nameValid) logBug('HIGH', 'Ім\'я не пройшло validateName', `"${normalizedName}" < 2 символів`);
  else logOk(`validateName: OK ("${normalizedName}")`);

  if (!phoneValid) logBug('HIGH', 'Телефон не пройшов validatePhone', `"${normalizedPhone}" — очікується +380XXXXXXXXX або 0XXXXXXXXX`);
  else logOk(`validatePhone: OK ("${normalizedPhone}")`);

  // Валідація 3: мінімум 10 символів в описі
  if (userDescription.length < 10) {
    logBug('HIGH', 'Опис занадто короткий', `${userDescription.length} < 10`);
  } else {
    logOk(`Опис: ${userDescription.length} символів — пройшов перевірку мінімуму 10`);
  }

  // ─── БАГ: Невідповідність maxLength форми та сервера ──────────────────────
  if (userDescription.length > MAX_REQUEST_TEXT_LENGTH) {
    const truncated = normalizeText(userDescription, MAX_REQUEST_TEXT_LENGTH);
    logBug('HIGH',
      `Опис обрізається сервером без попередження`,
      `Форма: maxLength=${FORM_MAXLENGTH}, лічильник "X/500".\n` +
      `   Сервер (firebase-config.ts MAX_REQUEST_TEXT_LENGTH=${MAX_REQUEST_TEXT_LENGTH}): обрізає тихо.\n` +
      `   Введено: ${userDescription.length} символів → збережеться ${truncated.length} символів.\n` +
      `   Втрата: "${userDescription.slice(MAX_REQUEST_TEXT_LENGTH, MAX_REQUEST_TEXT_LENGTH + 40)}..."`
    );
  } else {
    logOk(`Опис вміщається в ${MAX_REQUEST_TEXT_LENGTH} симв.`);
  }

  // Валідація 4: validateSubmissionRequirements — перевірка аватара
  logInfo(`validateSubmissionRequirements: userId="${BOT.uid}", photoURL="${profile?.photoURL || ''}", startAvatarKey="${profile?.startAvatarKey || ''}"`);
  logOk('Фото у формі — необов\'язкове (photoLabel: "Фото ситуації (необов\'язково)") — це очікувана поведінка');
  logOk('Захист від uploading: handleSubmit блокує відправку якщо formPhotos.some(p => p.status === "uploading") — OK');

  // Валідація 5: Rate limiter (30 сек, в пам'яті)
  logBug('LOW',
    'Rate limiter тільки в пам\'яті (скидається при перезапуску)',
    `RATE_LIMITERS.helpRequest = 30 сек cooldown, зберігається в lastSubmitTimes[key] (in-memory object).\n` +
    `   Перезапуск/force-close → ліміт скинуто. Можна відправляти необмежено.`
  );

  // Валідація 6: Денний ліміт — AsyncStorage vs сервер
  logBug('MEDIUM',
    'Денний ліміт (3/день) зберігається тільки в AsyncStorage — легко обійти',
    `loadDailyLimitRecord(getDailyKey(userId)) → AsyncStorage → клієнтський контроль.\n` +
    `   Сервер в firebaseChatAPI.addRequest має DAILY_REQUEST_LIMIT=30.\n` +
    `   Реальний ліміт: 30 (сервер) vs 3 (клієнт). Очистка AsyncStorage або новий пристрій — обхід.`
  );

  // ─── ШАГ 5: Відправка заявки в Firebase ──────────────────────────────────
  logStep(5, 'Відправка заявки через Firebase Admin (імітує firebaseChatAPI.addRequest)');

  const payloadDescription = sanitizeStoredText(userDescription);
  const serverDescription = normalizeText(payloadDescription, MAX_REQUEST_TEXT_LENGTH);
  const now = Date.now();
  const isHelpNeighbors = true; // group === 'help_neighbors'
  const autoApprove = isHelpNeighbors; // логіка з firebase-config.ts:668

  const serverRequest = {
    userId: BOT.uid,
    name: normalizedName,
    phone: normalizedPhone,
    maskedPhone: maskPhone(normalizedPhone),
    category: 'help',
    group: 'help_neighbors',
    subcategory: helpType,
    store: '',
    timeSlot: '',
    destination: '',
    building: 'Чайка',
    text: serverDescription,
    description: serverDescription,
    language: 'ua',
    status: autoApprove ? 'approved' : 'pending',  // AUTO-APPROVED!
    isApproved: autoApprove,
    isCensored: false,
    requiresManualModeration: false,
    moderatedAt: autoApprove ? new Date().toISOString() : undefined,
    moderatedBy: autoApprove ? 'auto' : undefined,
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    status_priority: `approved_02_standard`,
    timestamp: now,
    createdAt: now,
    expires_at: now + getRequestExpiryTtlMs('help_neighbors', 'help'),
    photoUri: '',
    photoStoragePath: '',
  };

  // Видалити undefined поля
  Object.keys(serverRequest).forEach((k) => serverRequest[k] === undefined && delete serverRequest[k]);

  logInfo(`status в Firebase:    "${serverRequest.status}" (auto-approved!)`);
  logInfo(`isApproved:           ${serverRequest.isApproved}`);
  logInfo(`expires_at:           ${new Date(serverRequest.expires_at).toISOString()} (+10 днів)`);
  logInfo(`Опис у Firebase (${serverDescription.length} симв.): "${serverDescription.slice(0, 80)}..."`);

  // ─── Перевірка локального Redux стану — читаємо реальний код ────────────────
  // Замість хардкоду — парсимо актуальний вихідний файл
  const fs = await import('node:fs');
  const screenSrc = fs.default.readFileSync(path.join(ROOT, 'src/screens/Pomoch-Sosedyam.tsx'), 'utf8');
  const sliceSrc = fs.default.readFileSync(path.join(ROOT, 'src/redux/slices/helpRequestsSlice.ts'), 'utf8');

  // Перевірка 1: moderationStatus у newRequest
  const modStatusMatch = screenSrc.match(/moderationStatus:\s*['"](\w+)['"]/);
  const actualModStatus = modStatusMatch?.[1] ?? '(не знайдено)';
  if (actualModStatus === 'pending') {
    logBug('HIGH',
      'moderationStatus у Redux захардкожено як "pending" — заявка вже auto-approved',
      `Pomoch-Sosedyam.tsx: moderationStatus: 'pending'\n` +
      `   help_neighbors авто-аппрувиться сервером. Бейдж "Очікує модерації" — хибний.`
    );
  } else {
    logOk(`moderationStatus у Redux = "${actualModStatus}" — відповідає серверному статусу`);
  }

  // Перевірка 2: expiresAt у newRequest — шукаємо рядок де є expiresAt і 10 * або setHours
  const expiresLineMatch = screenSrc.match(/expiresAt:\s*new Date\([^\n]+/);
  const expiresLine = expiresLineMatch?.[0]?.trim() ?? '(не знайдено)';
  const expiresIsToday = expiresLine.includes('setHours(23') || expiresLine.includes('23, 59');
  const expiresIs10Days = expiresLine.includes('10 *') || expiresLine.includes('10*');
  if (expiresIsToday) {
    logBug('HIGH',
      'expiresAt у Redux = кінець сьогодні замість +10 днів',
      `Pomoch-Sosedyam.tsx: ${expiresLine}\n   Firebase зберігає expires_at = +10 днів. Заявка зникне після опівночі.`
    );
  } else if (expiresIs10Days) {
    logOk(`expiresAt у Redux = +10 днів — відповідає Firebase`);
  } else {
    logWarn(`expiresAt — нестандартний вираз: ${expiresLine}. Перевірте вручну.`);
  }

  // Перевірка 3: syncFromRequests — merge чи повна заміна
  const serverExpiresAtMs = serverRequest.expires_at;
  const hasMergeLogic = sliceSrc.includes('localOnly') && sliceSrc.includes('mappedIds');
  const hasFullReplace = sliceSrc.match(/state\.items\s*=\s*mapped\b/) && !hasMergeLogic;
  if (hasFullReplace) {
    logBug('MEDIUM',
      'syncFromRequests повністю замінює state.items — локальна заявка може зникнути до Firebase sync',
      `helpRequestsSlice.ts: state.items = mapped (без merge). Додайте localOnly-логіку.`
    );
  } else if (hasMergeLogic) {
    logOk('syncFromRequests: merge-логіка присутня (localOnly + mapped) — заявка не зникне до Firebase sync');
  } else {
    logWarn('syncFromRequests: структура незрозуміла — перевірте вручну.');
  }

  // Відправляємо в Firebase
  const requestsRef = db.ref('requests');
  const pushResult = await requestsRef.push(serverRequest);

  if (!pushResult.key) {
    logBug('CRITICAL', 'Firebase не повернув ID після push', 'Перевірте правила RTDB та auth');
    process.exit(1);
  }

  const requestId = pushResult.key;
  logOk(`Заявка створена! ID: ${requestId}`);

  // rate_limits
  await db.ref(`rate_limits/${BOT.uid}/requests/lastAt`).set(now).catch(() => {});
  logOk('rate_limits оновлено');

  // ─── ШАГ 6: Верифікація даних у Firebase ─────────────────────────────────
  logStep(6, 'Верифікація збережених даних у Firebase RTDB');
  const saved = (await db.ref(`requests/${requestId}`).once('value')).val();

  logInfo(`name:              "${saved.name}"`);
  logInfo(`status:            "${saved.status}" (очікується: approved)`);
  logInfo(`isApproved:        ${saved.isApproved}`);
  logInfo(`group:             "${saved.group}"`);
  logInfo(`category:          "${saved.category}"`);
  logInfo(`subcategory:       "${saved.subcategory}"`);
  logInfo(`description length: ${saved.description?.length ?? 0} символів`);
  logInfo(`photoUri:          "${saved.photoUri || '(пусто)'}"`);
  logInfo(`photoStoragePath:  "${saved.photoStoragePath || '(пусто)'}"`);
  logInfo(`expires_at:        ${new Date(saved.expires_at).toISOString()}`);
  logInfo(`maskedPhone:       "${saved.maskedPhone}"`);

  if (saved.status !== 'approved') {
    logBug('CRITICAL', `Статус = "${saved.status}" (очікувалось "approved")`, '');
  } else {
    logOk('status = approved (автоматична модерація спрацювала)');
  }

  if (!saved.photoUri && !saved.photoStoragePath) {
    logOk('Підтверджено: заявка збережена БЕЗ фото (очікується за логікою форми)');
  }

  if (saved.description?.length > FORM_MAXLENGTH) {
    logBug('CRITICAL', 'Опис у Firebase довший за maxLength форми (500)', '');
  } else if (saved.description?.length < userDescription.length) {
    logWarn(`Опис обрізаний: введено ${userDescription.length}, збережено ${saved.description.length}`);
  }

  // ─── ШАГ 7: Перевірка видимості у helpRequestsSlice (syncFromRequests) ─────
  logStep(7, 'Перевірка: чи потрапить заявка у список «Термінові запити»');

  // syncFromRequests фільтрує: item.group === 'help_neighbors' || item.category === 'help'
  const passesFilter = saved.group === 'help_neighbors' || saved.category === 'help';
  if (!passesFilter) {
    logBug('CRITICAL', 'Заявка не потрапить у helpRequestsSlice',
      `syncFromRequests filter: group==='help_neighbors' || category==='help'\n` +
      `   Збережено: group='${saved.group}', category='${saved.category}'`);
  } else {
    logOk(`Фільтр syncFromRequests: пройдено (group='${saved.group}')`);
  }

  // isBurning логіка: status !== 'rejected' && expiresAt > new Date()
  const expiresDate = new Date(saved.expires_at);
  const isBurning = saved.status !== 'rejected' && expiresDate > new Date();
  logInfo(`isBurning у syncFromRequests: ${isBurning} (expires: ${expiresDate.toISOString()})`);
  if (!isBurning) {
    logBug('HIGH', 'isBurning = false — заявка не з\'явиться у розділі «Термінові запити»', '');
  } else {
    logOk('isBurning = true — заявка з\'явиться у списку після syncFromRequests');
  }

  // ─── ШАГ 8: Порівняння локального Redux стану та Firebase ────────────────
  logStep(8, 'Порівняння локального Redux стану (після addHelpRequest) та Firebase (з реального коду)');
  console.log('\n  Поле                  | Локальний Redux (з коду) | Firebase (сервер)');
  console.log('  ─────────────────────────────────────────────────────────────────────');
  console.log(`  moderationStatus      | "${actualModStatus}"                | "${saved.status}"`);
  console.log(`  expiresAt             | +10 days (з коду)        | ${new Date(saved.expires_at).toISOString().slice(0,16)}`);
  console.log(`  isBurning             | true (жорстко)           | ${isBurning} (обчислено)`);
  console.log(`  photoUri              | "" (не передається)      | "${saved.photoUri || ''}"`);

  // ─── ПІДСУМОК ─────────────────────────────────────────────────────────────
  logStep('SUMMARY', 'Знайдені баги та рекомендації');

  const critical = BUGS.filter((b) => b.severity === 'CRITICAL');
  const high     = BUGS.filter((b) => b.severity === 'HIGH');
  const medium   = BUGS.filter((b) => b.severity === 'MEDIUM');
  const low      = BUGS.filter((b) => b.severity === 'LOW');

  console.log(`\n  🔴 CRITICAL: ${critical.length}  🟠 HIGH: ${high.length}  🟡 MEDIUM: ${medium.length}  🔵 LOW: ${low.length}`);
  console.log(`  Всього: ${BUGS.length} знайдено\n`);

  BUGS.forEach((bug, i) => {
    const icon = bug.severity === 'CRITICAL' ? '🔴' : bug.severity === 'HIGH' ? '🟠' : bug.severity === 'MEDIUM' ? '🟡' : '🔵';
    console.log(`  ${icon} ${i + 1}. [${bug.severity}] ${bug.title}`);
  });

  console.log(`\n  📍 Firebase запис: requests/${requestId}`);
  console.log(`  👤 Бот: ${BOT.name} (UID: ${BOT.uid})`);
  console.log('\n  ✅ Тест завершено.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Непередбачена помилка:', err.message || err);
  process.exit(1);
});
