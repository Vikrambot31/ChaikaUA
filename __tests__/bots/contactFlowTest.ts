/**
 * contactFlowTest.ts
 * Аудитор системы «Хочу связаться» — 3 бота, клиентский Firebase SDK.
 * Запуск: npx ts-node __tests__/bots/contactFlowTest.ts
 *
 * ОГРАНИЧЕНИЯ: без firebase-admin, без изменений кода проекта, без Admin SDK.
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  Auth,
  UserCredential,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  update,
  Database,
} from 'firebase/database';

// ─── Firebase config ──────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyAy0lA5-0lWAc8GAQvIXJdJxDNqY_KsSB0',
  authDomain: 'chaikaua-3cd9d.firebaseapp.com',
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
  projectId: 'chaikaua-3cd9d',
  storageBucket: 'chaikaua-3cd9d.firebasestorage.app',
  messagingSenderId: '829539655815',
  appId: '1:829539655815:web:73cf8e5636b0a6f106416b',
};

// ─── Боты ─────────────────────────────────────────────────────────────────────

interface Bot {
  name: string;
  email: string;
  uid: string;
  password: string;
}

const BOTS: Bot[] = [
  {
    name: 'Luca Moretti',
    email: 'luca.moretti@chaika-bot.test',
    uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
    password: 'BotChaika2026!',
  },
  {
    name: 'Sofia Conti',
    email: 'sofia.conti@chaika-bot.test',
    uid: 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2',
    password: 'BotChaika2026!',
  },
  {
    name: 'Matteo Bianchi',
    email: 'matteo.bianchi@chaika-bot.test',
    uid: 'YFqlL7WuosMgJrAdXcVvefGDrdz2',
    password: 'BotChaika2026!',
  },
];

const [LUCA, SOFIA, MATTEO] = BOTS;

// ─── Логирование ──────────────────────────────────────────────────────────────

type LogLevel = 'ok' | 'err' | 'warn' | 'info';

interface LogEntry {
  level: LogLevel;
  bot: string;
  message: string;
}

const logs: LogEntry[] = [];
let successes = 0;
let errors = 0;
let warnings = 0;

function log(level: LogLevel, bot: string, message: string): void {
  const icons: Record<LogLevel, string> = {
    ok: '\u2705',
    err: '\u274C',
    warn: '\u26A0\uFE0F',
    info: '\u2139\uFE0F',
  };
  const line = `  ${icons[level]} [${bot}] ${message}`;
  console.log(line);
  logs.push({ level, bot, message });

  if (level === 'ok') successes++;
  else if (level === 'err') errors++;
  else if (level === 'warn') warnings++;
}

// ─── Инициализация ────────────────────────────────────────────────────────────

// Один Firebase App для всего скрипта.
// Боты переключаются через signOut/signIn.
const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Database = getDatabase(app);

// ─── Утилиты ─────────────────────────────────────────────────────────────────

async function loginBot(bot: Bot): Promise<boolean> {
  try {
    const cred: UserCredential = await signInWithEmailAndPassword(
      auth,
      bot.email,
      bot.password,
    );
    if (cred.user.uid !== bot.uid) {
      log(
        'warn',
        bot.name,
        `UID не совпадает: ожидался ${bot.uid}, получен ${cred.user.uid}`,
      );
    }
    log('ok', bot.name, 'Вход выполнен');
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    log('err', bot.name, `Ошибка входа — ${code}`);
    return false;
  }
}

async function logoutCurrent(bot: Bot): Promise<void> {
  try {
    await signOut(auth);
    log('info', bot.name, 'Выход выполнен');
  } catch {
    // молча
  }
}

// ─── Шаг 1: Вход всех ботов ──────────────────────────────────────────────────

async function step1_loginAll(): Promise<Record<string, boolean>> {
  console.log('\n─── Шаг 1: Вход ───');
  const results: Record<string, boolean> = {};
  for (const bot of BOTS) {
    const ok = await loginBot(bot);
    results[bot.uid] = ok;
    if (ok) await logoutCurrent(bot);
  }
  return results;
}

// ─── Шаг 2: Создание заявок в contacts_listings ───────────────────────────────

async function step2_createListings(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 2: Создание заявок contacts_listings ───');

  for (const bot of BOTS) {
    if (!loginStatus[bot.uid]) {
      log('warn', bot.name, 'Пропуск создания заявки — вход не удался');
      continue;
    }

    const ok = await loginBot(bot);
    if (!ok) continue;

    try {
      const listingsRef = ref(db, 'contacts_listings');
      const newRef = push(listingsRef);
      await set(newRef, {
        userId: bot.uid,
        itemName: `Test contact — ${bot.name}`,
        category: 'contact_test',
        condition: '',
        price: '',
        description: `Тестовая заявка бота ${bot.name}`,
        phone: '',
        zodiacSign: '',
        humanDesignType: '',
        humanDesignProfile: '',
        photoStoragePath: '',
        photoUri: '',
        photoId: '',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        moderationStatus: 'pending',
        submittedForModerationAt: new Date().toISOString(),
        language: 'ua',
        createdAt: Date.now(),
        testBot: true,
      });
      log('ok', bot.name, `Заявка создана: ${newRef.key}`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown';
      log('err', bot.name, `Ошибка создания заявки — ${code}`);
    }

    await logoutCurrent(bot);
  }
}

// ─── Шаг 3: Luca читает ленту contacts_listings ──────────────────────────────

async function step3_readFeed(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 3: Чтение ленты contacts_listings ───');

  if (!loginStatus[LUCA.uid]) {
    log('warn', LUCA.name, 'Пропуск чтения ленты — вход не удался');
    return;
  }

  const ok = await loginBot(LUCA);
  if (!ok) return;

  try {
    const snap = await get(ref(db, 'contacts_listings'));
    const count = snap.exists() ? Object.keys(snap.val() ?? {}).length : 0;
    log('info', LUCA.name, `Лента загружена, записей: ${count}`);
    log('ok', LUCA.name, 'Чтение ленты выполнено');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    log('err', LUCA.name, `Ошибка чтения ленты — ${code}`);
  }

  await logoutCurrent(LUCA);
}

// ─── Шаг 4: Отправка запросов на связь ───────────────────────────────────────

interface ContactPair {
  from: Bot;
  to: Bot;
}

const CONTACT_PAIRS: ContactPair[] = [
  { from: LUCA, to: SOFIA },
  { from: SOFIA, to: MATTEO },
  { from: MATTEO, to: LUCA },
];

async function sendContactRequest(from: Bot, to: Bot): Promise<void> {
  const payload = {
    requesterUid: from.uid,
    requesterName: from.name,
    targetUid: to.uid,
    status: 'pending',
    createdAt: Date.now(),
    testBot: true,
  };

  try {
    await set(
      ref(db, `profileViewRequests/${to.uid}/${from.uid}`),
      payload,
    );
    await set(
      ref(db, `outgoingProfileRequestsByUser/${from.uid}/${to.uid}`),
      payload,
    );
    log('ok', from.name, `Запрос на связь -> ${to.name}`);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? 'unknown';
    log('err', from.name, `Ошибка запроса к ${to.name} — ${code}`);
  }
}

async function step4_sendRequests(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 4: Отправка запросов на связь ───');

  for (const { from, to } of CONTACT_PAIRS) {
    if (!loginStatus[from.uid]) {
      log('warn', from.name, `Пропуск запроса к ${to.name} — вход не удался`);
      continue;
    }

    const ok = await loginBot(from);
    if (!ok) continue;

    await sendContactRequest(from, to);
    await logoutCurrent(from);
  }
}

// ─── Шаг 5: Проверка входящих запросов ───────────────────────────────────────

async function step5_checkIncoming(
  loginStatus: Record<string, boolean>,
  label: string,
): Promise<void> {
  console.log(`\n─── ${label}: Проверка входящих запросов ───`);

  for (const bot of BOTS) {
    if (!loginStatus[bot.uid]) {
      log('warn', bot.name, 'Пропуск проверки входящих — вход не удался');
      continue;
    }

    const ok = await loginBot(bot);
    if (!ok) continue;

    try {
      const snap = await get(ref(db, `profileViewRequests/${bot.uid}`));
      const count = snap.exists() ? Object.keys(snap.val() ?? {}).length : 0;
      log('info', bot.name, `Входящие запросы: ${count}`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown';
      log('err', bot.name, `Ошибка чтения входящих — ${code}`);
    }

    await logoutCurrent(bot);
  }
}

// ─── Шаг 6: Проверка исходящих запросов ──────────────────────────────────────

async function step6_checkOutgoing(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 6: Проверка исходящих запросов ───');

  for (const bot of BOTS) {
    if (!loginStatus[bot.uid]) {
      log('warn', bot.name, 'Пропуск проверки исходящих — вход не удался');
      continue;
    }

    const ok = await loginBot(bot);
    if (!ok) continue;

    try {
      const snap = await get(
        ref(db, `outgoingProfileRequestsByUser/${bot.uid}`),
      );
      const count = snap.exists() ? Object.keys(snap.val() ?? {}).length : 0;
      log('info', bot.name, `Исходящие запросы: ${count}`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown';
      log('err', bot.name, `Ошибка чтения исходящих — ${code}`);
    }

    await logoutCurrent(bot);
  }
}

// ─── Шаг 7: Одобрение запросов ───────────────────────────────────────────────

// Sofia одобряет Luca, Matteo одобряет Sofia, Luca одобряет Matteo
const APPROVAL_PAIRS: ContactPair[] = [
  { from: SOFIA, to: LUCA },
  { from: MATTEO, to: SOFIA },
  { from: LUCA, to: MATTEO },
];

async function step7_approveRequests(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 7: Одобрение запросов ───');

  for (const { from: approver, to: requester } of APPROVAL_PAIRS) {
    if (!loginStatus[approver.uid]) {
      log('warn', approver.name, `Пропуск одобрения от ${requester.name} — вход не удался`);
      continue;
    }

    const ok = await loginBot(approver);
    if (!ok) continue;

    try {
      await update(
        ref(db, `profileViewRequests/${approver.uid}/${requester.uid}`),
        { status: 'approved', respondedAt: Date.now() },
      );
      // Обновить исходящий у requester (может не пройти по правилам — обрабатываем)
      await update(
        ref(db, `outgoingProfileRequestsByUser/${requester.uid}/${approver.uid}`),
        { status: 'approved', respondedAt: Date.now() },
      ).catch((err: unknown) => {
        const code = (err as { code?: string }).code ?? 'unknown';
        log('warn', approver.name, `Не удалось обновить исходящий у ${requester.name} — ${code}`);
      });

      log('ok', approver.name, `Одобрил запрос от ${requester.name}`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown';
      log('err', approver.name, `Ошибка одобрения запроса от ${requester.name} — ${code}`);
    }

    await logoutCurrent(approver);
  }
}

// ─── Шаг 8: Проверка уведомлений ─────────────────────────────────────────────

const NOTIFICATION_PATH_FNS: Array<(uid: string) => string> = [
  (uid) => `notifications/${uid}`,
  (uid) => `users/${uid}/notifications`,
  (uid) => `user_notifications/${uid}`,
];

async function step8_checkNotifications(loginStatus: Record<string, boolean>): Promise<void> {
  console.log('\n─── Шаг 8: Проверка уведомлений ───');

  for (const bot of BOTS) {
    if (!loginStatus[bot.uid]) {
      log('warn', bot.name, 'Пропуск проверки уведомлений — вход не удался');
      continue;
    }

    const ok = await loginBot(bot);
    if (!ok) continue;

    for (const pathFn of NOTIFICATION_PATH_FNS) {
      const path = pathFn(bot.uid);
      try {
        const snap = await get(ref(db, path));
        if (snap.exists()) {
          const val = snap.val();
          const count = val && typeof val === 'object' ? Object.keys(val).length : 1;
          log('info', bot.name, `Уведомления [${path}]: ${count}`);
        } else {
          log('info', bot.name, `Уведомлений нет [${path}]`);
        }
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? 'unknown';
        log('warn', bot.name, `Нет доступа к [${path}] — ${code}`);
      }
    }

    await logoutCurrent(bot);
  }
}

// ─── Финальный отчёт ──────────────────────────────────────────────────────────

function printReport(): void {
  console.log('\n==========================================');
  console.log('           ИТОГОВЫЙ ОТЧЁТ');
  console.log('==========================================');
  console.log(`  \u2705 Успехов:         ${successes}`);
  console.log(`  \u274C Ошибок:          ${errors}`);
  console.log(`  \u26A0\uFE0F  Предупреждений:  ${warnings}`);
  console.log(`  \u2139\uFE0F  Всего шагов:    ${logs.length}`);
  console.log('==========================================');

  if (errors > 0) {
    console.log('\n  Детали ошибок:');
    logs
      .filter((l) => l.level === 'err')
      .forEach((l) => console.log(`    \u274C [${l.bot}] ${l.message}`));
  }
}

// ─── Главная функция ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('==========================================');
  console.log('  Аудит: система «Хочу связаться»');
  console.log(`  Дата: ${new Date().toISOString()}`);
  console.log('==========================================');

  // Шаг 1
  const loginStatus = await step1_loginAll();

  const anyLoggedIn = Object.values(loginStatus).some((v) => v);
  if (!anyLoggedIn) {
    log('err', 'system', 'Ни один бот не смог войти — прерывание теста');
    printReport();
    process.exit(1);
  }

  // Шаг 2
  await step2_createListings(loginStatus);

  // Шаг 3
  await step3_readFeed(loginStatus);

  // Шаг 4
  await step4_sendRequests(loginStatus);

  // Шаг 5
  await step5_checkIncoming(loginStatus, 'Шаг 5');

  // Шаг 6
  await step6_checkOutgoing(loginStatus);

  // Шаг 7
  await step7_approveRequests(loginStatus);

  // Шаг 8
  await step8_checkNotifications(loginStatus);

  // Шаг 9: финальная проверка входящих
  await step5_checkIncoming(loginStatus, 'Шаг 9 (финальная проверка)');

  // Шаг 10: отчёт
  printReport();

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Неожиданная ошибка:', err);
  process.exit(1);
});
