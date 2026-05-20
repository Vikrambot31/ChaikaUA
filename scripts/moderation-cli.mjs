import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/ChaikaUA/mobile-app-short';
const APP_JSON_PATH = path.join(ROOT, 'app.json');

const TYPE_CONFIG = {
  requests: {
    path: () => 'requests',
    statusField: 'status',
    titleFields: ['name', 'text', 'description'],
    secondaryFields: ['phone', 'category'],
  },
  community_photos: {
    path: () => 'community_photos',
    statusField: 'status',
    titleFields: ['title', 'description', 'uploadedBy'],
    secondaryFields: ['uploadedBy', 'imageUri'],
  },
  lost_found: {
    path: () => 'lost_found',
    statusField: 'moderationStatus',
    titleFields: ['name', 'category', 'type'],
    secondaryFields: ['phone', 'type'],
  },
  job_listings: {
    path: () => 'job_listings',
    statusField: 'moderationStatus',
    titleFields: ['name', 'workType', 'about'],
    secondaryFields: ['phone', 'age'],
  },
  buy_sell_listings: {
    path: () => 'buy_sell_listings',
    statusField: 'moderationStatus',
    titleFields: ['itemName', 'category', 'description'],
    secondaryFields: ['price', 'phone'],
  },
  coffee_requests: {
    path: () => 'coffee_requests',
    statusField: 'moderationStatus',
    titleFields: ['name', 'goal', 'street'],
    secondaryFields: ['phone', 'age'],
  },
  dating_profiles: {
    path: () => 'dating_profiles',
    statusField: 'moderationStatus',
    titleFields: ['name', 'profession', 'sphere'],
    secondaryFields: ['phone', 'age'],
  },
  osbb_news: {
    path: (options) => `osbb_news/${requireBuilding(options)}`,
    statusField: 'moderationStatus',
    titleFields: ['title', 'body'],
    secondaryFields: ['priority', 'date'],
  },
  osbb_collections: {
    path: (options) => `osbb_collections/${requireBuilding(options)}`,
    statusField: 'moderationStatus',
    titleFields: ['title'],
    secondaryFields: ['targetAmount', 'paymentUrl'],
  },
  osbb_votes: {
    path: (options) => `osbb_votes/${requireBuilding(options)}`,
    statusField: 'moderationStatus',
    titleFields: ['title', 'question'],
    secondaryFields: ['status', 'deadline'],
  },
};

function requireBuilding(options) {
  if (!options.building) {
    throw new Error('Для этого типа нужен --building <buildingId>');
  }

  return options.building;
}

function readAppConfig() {
  const raw = fs.readFileSync(APP_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.expo.extra;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part.startsWith('--')) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
      continue;
    }
    positional.push(part);
  }

  return { positional, options };
}

async function signIn(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Не удалось войти в Firebase');
  }

  return data.idToken;
}

function buildDbUrl(databaseURL, dbPath, idToken) {
  const cleanBase = databaseURL.replace(/\/$/, '');
  const cleanPath = dbPath.replace(/^\//, '');
  return `${cleanBase}/${cleanPath}.json?auth=${encodeURIComponent(idToken)}`;
}

async function dbGet(databaseURL, dbPath, idToken) {
  const response = await fetch(buildDbUrl(databaseURL, dbPath, idToken));
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Ошибка чтения ${dbPath}`);
  }
  return data;
}

async function dbPatch(databaseURL, dbPath, idToken, payload) {
  const response = await fetch(buildDbUrl(databaseURL, dbPath, idToken), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Ошибка записи ${dbPath}`);
  }
  return data;
}

function normalizeType(type) {
  if (!type) {
    throw new Error('Укажи тип. Пример: coffee_requests, dating_profiles, buy_sell_listings');
  }

  const normalized = String(type).trim();
  if (!TYPE_CONFIG[normalized]) {
    throw new Error(`Неизвестный тип: ${normalized}`);
  }

  return normalized;
}

function pickFirstValue(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '';
}

function getSortValue(item) {
  const raw = item.submittedForModerationAt || item.createdAt || item.date || item.timestamp || 0;
  if (typeof raw === 'number') {
    return raw;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatRecord(type, id, item, config) {
  const title = pickFirstValue(item, config.titleFields) || '(без названия)';
  const extra = config.secondaryFields
    .map((field) => item?.[field])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value))
    .join(' | ');

  return {
    id,
    type,
    status: item?.[config.statusField] || 'unknown',
    title,
    extra,
    sortValue: getSortValue(item),
  };
}

async function listRecords(firebase, idToken, type, options) {
  const config = TYPE_CONFIG[type];
  const dbPath = config.path(options);
  const data = await dbGet(firebase.firebaseDatabaseURL, dbPath, idToken);
  const statusFilter = options.status ? String(options.status) : null;
  const limit = options.limit ? Number(options.limit) : 20;

  const items = Object.entries(data || {})
    .map(([id, item]) => ({ raw: item, view: formatRecord(type, id, item, config) }))
    .filter(({ raw }) => !statusFilter || raw?.[config.statusField] === statusFilter)
    .sort((a, b) => b.view.sortValue - a.view.sortValue)
    .slice(0, limit)
    .map(({ view }) => view);

  if (items.length === 0) {
    console.log('Ничего не найдено.');
    return;
  }

  for (const [index, item] of items.entries()) {
    console.log(`${index + 1}. ${item.id}`);
    console.log(`   Тип: ${item.type}`);
    console.log(`   Статус: ${item.status}`);
    console.log(`   Заголовок: ${item.title}`);
    if (item.extra) {
      console.log(`   Данные: ${item.extra}`);
    }
  }
}

async function setStatus(firebase, idToken, type, id, nextStatus, options) {
  const config = TYPE_CONFIG[type];
  const basePath = config.path(options);
  const recordPath = `${basePath}/${id}`;

  await dbPatch(firebase.firebaseDatabaseURL, recordPath, idToken, {
    [config.statusField]: nextStatus,
    moderatedAt: new Date().toISOString(),
  });

  console.log(`Готово: ${type}/${id} -> ${nextStatus}`);
}

function printHelp() {
  console.log(`Команды:\n\n1. Показать pending:\n   npm run moderation -- list coffee_requests --status pending --email admin@chaika.ua --password YOUR_PASSWORD\n\n2. Одобрить:\n   npm run moderation -- approve coffee_requests RECORD_ID --email admin@chaika.ua --password YOUR_PASSWORD\n\n3. Отклонить:\n   npm run moderation -- reject coffee_requests RECORD_ID --email admin@chaika.ua --password YOUR_PASSWORD\n\n4. Для ОСББ нужен buildingId:\n   npm run moderation -- list osbb_news --building BUILDING_ID --status pending --email admin@chaika.ua --password YOUR_PASSWORD\n\nТипы:\n- requests\n- community_photos\n- lost_found\n- job_listings\n- buy_sell_listings\n- coffee_requests\n- dating_profiles\n- osbb_news\n- osbb_collections\n- osbb_votes`);
}

async function main() {
  const firebase = readAppConfig();
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [command, rawType, id] = positional;

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  const email = options.email || process.env.MODERATOR_EMAIL;
  const password = options.password || process.env.MODERATOR_PASSWORD;

  if (!email || !password) {
    throw new Error('Нужны --email и --password или переменные MODERATOR_EMAIL / MODERATOR_PASSWORD');
  }

  const idToken = await signIn(firebase.firebaseApiKey, email, password);

  if (command === 'list') {
    const type = normalizeType(rawType);
    await listRecords(firebase, idToken, type, options);
    return;
  }

  if (command === 'approve' || command === 'reject') {
    const type = normalizeType(rawType);
    if (!id) {
      throw new Error('Нужен ID записи');
    }
    await setStatus(firebase, idToken, type, id, command === 'approve' ? 'approved' : 'rejected', options);
    return;
  }

  throw new Error(`Неизвестная команда: ${command}`);
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exit(1);
});
