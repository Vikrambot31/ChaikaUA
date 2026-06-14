import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BOTS_PATH = path.join(ROOT, '_TEST_BOT_', '--Bot-Ai-Klienti', '3Bot-TEST', 'bots-data.json');
const APP_JSON_PATH = path.join(ROOT, 'app.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

const botsData = JSON.parse(fs.readFileSync(BOTS_PATH, 'utf8'));
const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
const extra = appJson.expo?.extra ?? {};

const apiKey = extra.firebaseApiKey;
const databaseURL = extra.firebaseDatabaseURL;
const password = botsData.password;

if (!apiKey || !databaseURL || !password) {
  throw new Error('Missing Firebase apiKey/databaseURL or bot password');
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
  storageBucket: extra.firebaseStorageBucket,
  projectId: extra.firebaseProjectId,
});

const TOPICS = [
  { subcategory: 'delivery', text: 'Потрібна допомога забрати невелику посилку біля охорони сьогодні після 18:00.' },
  { subcategory: 'shopping', text: 'Потрібна допомога купити хліб і молоко в магазині біля Чайки до вечора.' },
  { subcategory: 'repair_help', text: 'Потрібна допомога перевірити розетку на кухні, світло іноді блимає.' },
  { subcategory: 'documents', text: 'Потрібна допомога роздрукувати одну заяву та передати її сусідам у будинку.' },
  { subcategory: 'household', text: 'Потрібна допомога підняти невелику коробку з машини до квартири.' },
  { subcategory: 'medicine', text: 'Потрібна допомога купити ліки в аптеці та принести до підїзду.' },
  { subcategory: 'transport', text: 'Потрібна допомога підвезти одну сумку до сусіднього будинку після роботи.' },
  { subcategory: 'community', text: 'Потрібна допомога зібрати інформацію для оголошення по будинку.' },
  { subcategory: 'plumbing', text: 'Потрібна допомога подивитися, чому підтікає кран у ванній кімнаті.' },
  { subcategory: 'content', text: 'Потрібна допомога акуратно сформулювати оголошення для сусідів українською.' },
];

const jsonFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok || data?.error) {
    const message = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data;
};

const signIn = async (bot) => {
  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  return jsonFetch(authUrl, {
    method: 'POST',
    body: JSON.stringify({
      email: bot.email,
      password,
      returnSecureToken: true,
    }),
  });
};

const ensureBotAuthPassword = async (bot) => {
  const authClient = admin.auth();
  try {
    const existing = await authClient.getUserByEmail(bot.email);
    await authClient.updateUser(existing.uid, {
      password,
      displayName: bot.name,
      disabled: false,
    });
    return existing.uid;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const created = await authClient.createUser({
      email: bot.email,
      password,
      displayName: bot.name,
      disabled: false,
    });
    return created.uid;
  }
};

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return phone || '';
  return `+${digits.slice(0, 5)}***${digits.slice(-2)}`;
};

const makeRequest = (bot, uid, topic) => {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const avatarKey = String(bot.avatarKey || '1');
  const text = `ТЕСТ: ${topic.text}`;

  return {
    userId: uid,
    name: bot.name,
    phone: bot.phone,
    maskedPhone: maskPhone(bot.phone),
    category: 'help',
    group: 'help_neighbors',
    subcategory: topic.subcategory,
    store: '',
    timeSlot: '',
    destination: '',
    building: bot.houseNumber ? `Чайка, буд. ${bot.houseNumber}` : 'Чайка',
    text,
    description: text,
    language: 'ua',
    status: 'approved',
    isApproved: true,
    isCensored: false,
    requiresManualModeration: false,
    moderatedAt: nowIso,
    moderatedBy: 'auto',
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    status_priority: 'approved_02_standard',
    timestamp: nowMs,
    createdAt: nowMs,
    expires_at: nowMs + 10 * 24 * 60 * 60 * 1000,
    userPhotoURL: `start-avatar://${avatarKey}`,
    startAvatarKey: avatarKey,
    photoUri: '',
    photoStoragePath: '',
  };
};

const updateProfileGate = async (uid, bot, idToken) => {
  const avatarKey = String(bot.avatarKey || '1');
  const age = typeof bot.age === 'number' ? bot.age : 30;
  const gender = bot.gender || 'male';
  return jsonFetch(`${databaseURL}/users/${uid}.json?auth=${idToken}`, {
    method: 'PATCH',
    body: JSON.stringify({
      startAvatarKey: avatarKey,
      photoURL: `start-avatar://${avatarKey}`,
      photoURLs: [`start-avatar://${avatarKey}`],
      age,
      gender,
      updatedAt: Date.now(),
    }),
  });
};

const createRequest = async (request, idToken) => {
  const created = await jsonFetch(`${databaseURL}/requests.json?auth=${idToken}`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return created.name;
};

const verifyRequest = async (requestId, idToken) => {
  return jsonFetch(`${databaseURL}/requests/${requestId}.json?auth=${idToken}`, {
    method: 'GET',
  });
};

const main = async () => {
  console.log('Creating 1 help request from each bot...\n');
  const results = [];

  for (const [index, bot] of botsData.bots.entries()) {
    await ensureBotAuthPassword(bot);
    const auth = await signIn(bot);
    const uid = auth.localId;
    const topic = TOPICS[index % TOPICS.length];

    await updateProfileGate(uid, bot, auth.idToken);

    const request = makeRequest(bot, uid, topic);
    const requestId = await createRequest(request, auth.idToken);
    const verified = await verifyRequest(requestId, auth.idToken);

    results.push({
      bot: bot.name,
      requestId,
      status: verified.status,
      group: verified.group,
      language: verified.language,
      text: verified.text,
    });

    console.log(`${index + 1}. ${bot.name}: ${requestId} (${verified.status}, ${verified.group})`);
  }

  console.log('\nRESULT_JSON');
  console.log(JSON.stringify(results, null, 2));
};

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
