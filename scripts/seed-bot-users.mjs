/**
 * seed-bot-users.mjs
 * Создаёт 10 тестовых бот-аккаунтов в Firebase Auth + RTDB.
 * Каждый бот получает:
 *   - Firebase Auth аккаунт (email/password)
 *   - users/{uid} с registrationStatus:'complete' и startAvatarKey
 *   - invite_access/{uid} со status:'approved'
 *
 * Запуск: node scripts/seed-bot-users.mjs
 * Идемпотентен — повторный запуск пропускает существующие аккаунты.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(
  ROOT,
  'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json',
);

const BOT_PASSWORD = 'BotChaika2026!';
const REGISTERED_AT = new Date('2026-05-26T10:00:00.000Z').toISOString();
const NOW_MS = new Date('2026-05-26T10:00:00.000Z').getTime();

const BOTS = [
  {
    name: 'Luca Moretti',
    email: 'luca.moretti@chaika-bot.test',
    phone: '+380671000001',
    avatarKey: '1',
    apartment: '47',
    profession: 'Координатор доставки та міський логіст',
    about:
      'Живу в ритмі великого міста, добре орієнтуюсь у побутових задачах сусідів: від термінової покупки ліків до передачі документів у межах кварталу. Спокійний, зібраний, швидко відповідаю в чаті.',
  },
  {
    name: 'Giulia Romano',
    email: 'giulia.romano@chaika-bot.test',
    phone: '+380671000002',
    avatarKey: '2',
    apartment: '12',
    profession: 'Менеджер громадських ініціатив та озеленення',
    about:
      'Вмію об\'єднувати людей навколо корисних справ: двір, під\'їзд, локальні покращення. Публікую оголошення про спільні закупівлі рослин, прибирання та допомогу літнім жильцям.',
  },
  {
    name: 'Matteo Bianchi',
    email: 'matteo.bianchi@chaika-bot.test',
    phone: '+380671000003',
    avatarKey: '3',
    apartment: '88',
    profession: 'Електрик по житлових будинках',
    about:
      'Практичний і дисциплінований спеціаліст. Добре описую технічні проблеми простою мовою: де несправність, коли з\'явилась, що вже перевірено, яка терміновість.',
  },
  {
    name: 'Sofia Conti',
    email: 'sofia.conti@chaika-bot.test',
    phone: '+380671000004',
    avatarKey: '4',
    apartment: '23',
    profession: 'UX/UI дизайнер цифрових сервісів',
    about:
      'Уважно дивлюсь на зручність для людей і добре формулюю заявки так, щоб їх було легко зрозуміти та швидко обробити. Мої повідомлення містять контекст і очікуваний результат.',
  },
  {
    name: 'Alessandro Ricci',
    email: 'alessandro.ricci@chaika-bot.test',
    phone: '+380671000005',
    avatarKey: '5',
    apartment: '61',
    profession: 'Шеф-кухар та власник кулінарної студії',
    about:
      'Активний і комунікабельний. Часто публікую пропозиції «хто може допомогти/кому допомогти» у форматі коротких карток: що потрібно, де, до якого часу і як зв\'язатись.',
  },
  {
    name: 'Francesca Gallo',
    email: 'francesca.gallo@chaika-bot.test',
    phone: '+380671000006',
    avatarKey: '6',
    apartment: '35',
    profession: 'Дитяча медсестра',
    about:
      'Уважна до людей і особливо до чутливих тем: здоров\'я, допомога сім\'ям, супровід літніх сусідів. Мої заявки складені дбайливо: без зайвих деталей, але з чіткою терміновістю.',
  },
  {
    name: 'Davide Esposito',
    email: 'davide.esposito@chaika-bot.test',
    phone: '+380671000007',
    avatarKey: '1',
    apartment: '9',
    profession: 'Автомеханік та майстер виїзної діагностики',
    about:
      'Добре підходжу для прикладних заявок, де потрібен зрозумілий план дій: проблема, можлива причина, варіант швидкого вирішення, орієнтир за часом.',
  },
  {
    name: 'Chiara Lombardi',
    email: 'chiara.lombardi@chaika-bot.test',
    phone: '+380671000008',
    avatarKey: '2',
    apartment: '74',
    profession: 'Організатор локальних заходів',
    about:
      'Вмію створювати зрозумілі та привабливі оголошення. Добре формулюю заявки для зустрічей жильців, міні-ярмарків, дитячих активностей. Чітка структура: дата, місце, мета, як відгукнутись.',
  },
  {
    name: 'Marco Santoro',
    email: 'marco.santoro@chaika-bot.test',
    phone: '+380671000009',
    avatarKey: '3',
    apartment: '56',
    profession: 'Сантехнік',
    about:
      'Спеціалізуюсь на побутових та аварійних питаннях: протікання, засори, тиск води, змішувачі, вузли обліку. Мої заявки дають операційний мінімум: симптом, час появи, спосіб зв\'язку.',
  },
  {
    name: 'Elena Ferrara',
    email: 'elena.ferrara@chaika-bot.test',
    phone: '+380671000010',
    avatarKey: '4',
    apartment: '31',
    profession: 'Контент-редактор та модератор онлайн-спільнот',
    about:
      'Вмію писати ясні, коректні та безпечні тексти для широкої аудиторії. Швидко приводжу будь-яку "сиру" заявку в акуратний формат, що не порушує правила спілкування.',
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

const makeProfile = (bot, uid) => ({
  name: bot.name,
  phone: bot.phone,
  building: 'Чайка',
  houseNumber: '1',
  profession: bot.profession,
  about: bot.about,
  registrationStatus: 'complete',
  registeredAt: REGISTERED_AT,
  startAvatarKey: bot.avatarKey,
  provider: 'email',
  providerId: uid,
  photoURL: '',
  photoURLs: [],
  photoStoragePaths: [],
  referrerPhone: '',
});

const makeInviteAccess = () => ({
  status: 'approved',
  manual_grant_reason: 'test_bot_account',
  manual_grant_at: NOW_MS,
  updatedAt: NOW_MS,
  mode: 'manual',
});

// ── main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, {
    with: { type: 'json' },
  });

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });

  const db = admin.database();
  const authClient = admin.auth();

  console.log('\n=== seed-bot-users: старт ===\n');

  const results = [];

  for (const bot of BOTS) {
    let uid;
    let action;

    // 1. Firebase Auth — создать или найти существующий аккаунт
    try {
      const existing = await authClient.getUserByEmail(bot.email);
      uid = existing.uid;
      action = 'existed';
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        const created = await authClient.createUser({
          email: bot.email,
          password: BOT_PASSWORD,
          displayName: bot.name,
          disabled: false,
        });
        uid = created.uid;
        action = 'created';
      } else {
        console.error(`[${bot.name}] Auth error:`, err.message);
        results.push({ name: bot.name, uid: '—', action: 'ERROR', phone: bot.phone });
        continue;
      }
    }

    // 2. RTDB: users/{uid}
    await db.ref(`users/${uid}`).set(makeProfile(bot, uid));

    // 3. RTDB: invite_access/{uid}
    await db.ref(`invite_access/${uid}`).set(makeInviteAccess());

    results.push({ name: bot.name, uid, action, phone: bot.phone, avatar: bot.avatarKey });
    console.log(`[${action.toUpperCase()}] ${bot.name} → uid: ${uid}`);
  }

  console.log('\n=== Результат ===');
  console.log(
    '─'.repeat(90),
  );
  console.log(
    'Имя'.padEnd(22) +
    'UID'.padEnd(32) +
    'Телефон'.padEnd(16) +
    'Аватар'.padEnd(8) +
    'Статус',
  );
  console.log('─'.repeat(90));
  for (const r of results) {
    console.log(
      (r.name || '').padEnd(22) +
      (r.uid || '').padEnd(32) +
      (r.phone || '').padEnd(16) +
      (r.avatar || '').padEnd(8) +
      r.action,
    );
  }
  console.log('─'.repeat(90));
  console.log(`\nВсего: ${results.length} ботов`);
  console.log(`Пароль для всех: ${BOT_PASSWORD}`);
  console.log('\nДля входа в приложение использовать email + пароль выше.');
  console.log('Аватарки подхватятся автоматически (startAvatarKey уже в профиле).\n');

  process.exit(0);
};

main().catch((err) => {
  console.error('seed-bot-users FAILED:', err?.message || String(err));
  process.exit(1);
});
