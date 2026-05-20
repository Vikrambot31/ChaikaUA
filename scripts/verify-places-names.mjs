import 'dotenv/config';

const databaseURL = process.env.FIREBASE_DATABASE_URL;
const apiKey = process.env.FIREBASE_API_KEY;
const email = process.env.MODERATOR_EMAIL;
const password = process.env.MODERATOR_PASSWORD;

if (!databaseURL) throw new Error('Missing FIREBASE_DATABASE_URL');

const baseUrl = databaseURL.replace(/\/$/, '');
const dbUrl = (path, token) => `${baseUrl}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;

const NAME_MAP = new Map([
  ['Hala Apteka', 'Галя Аптека'],
  ['Chaykava', 'Чайкава'],
  ['Fora', 'Фора'],
  ['Grano Bakery', 'Grano Bakery (Гранно Бейкері)'],
  ['Yevro-Avto Mahazyn Spd Duban A.m.', 'Євро-Авто Магазин'],
  ["Khinkalʹnya Kuvshyn", 'Хінкальня Кувшин'],
  ["Patelʹnya", 'Пательня'],
  ["Tatarka: Chebureky Po-Krymsʹky", 'Tatarka: Чебуреки по-кримськи'],
  ['Maysternya Krasy', 'Майстерня Краси'],
  ['Zahalʹnoosvitnya Shkola I Stupenya "Chayka"', 'Загальноосвітня школа I ступеня "Чайка"'],
]);

const signIn = async () => {
  if (!apiKey || !email || !password) return null;
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
    throw new Error(data?.error?.message || 'Failed to sign in and obtain Firebase ID token');
  }
  return data.idToken;
};

const resolveAuthToken = async () => {
  const envToken = process.env.FIREBASE_ID_TOKEN || process.env.FIREBASE_DATABASE_AUTH_TOKEN;
  if (envToken) return envToken;
  const signedToken = await signIn();
  return signedToken;
};

const readPath = async (path, token) => {
  const response = await fetch(dbUrl(path, token));
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Read ${path} failed: ${response.status} Permission denied. ` +
          'Set FIREBASE_ID_TOKEN/FIREBASE_DATABASE_AUTH_TOKEN or MODERATOR_EMAIL/MODERATOR_PASSWORD (with FIREBASE_API_KEY).',
      );
    }
    throw new Error(`Read ${path} failed: ${response.status} ${body}`);
  }
  return response.json();
};

const authToken = await resolveAuthToken();
const places = await readPath('places', authToken);
if (!places || typeof places !== 'object') {
  console.log(JSON.stringify({ ok: false, message: 'No places node found' }, null, 2));
  process.exit(1);
}

let scanned = 0;
const legacyLeft = [];
const expectedMissing = [];
const expectedNames = new Set(NAME_MAP.values());

for (const [id, value] of Object.entries(places)) {
  scanned += 1;
  const name = typeof value?.name === 'string' ? value.name : '';

  if (NAME_MAP.has(name)) {
    legacyLeft.push({ id, legacyName: name, expectedName: NAME_MAP.get(name) });
  }
}

for (const expectedName of expectedNames) {
  const found = Object.values(places).some((value) => value?.name === expectedName);
  if (!found) {
    expectedMissing.push(expectedName);
  }
}

const ok = legacyLeft.length === 0;
console.log(
  JSON.stringify(
    {
      ok,
      scanned,
      legacyLeftCount: legacyLeft.length,
      expectedMissingCount: expectedMissing.length,
      legacyLeft,
      expectedMissing,
    },
    null,
    2,
  ),
);

if (!ok) {
  process.exit(2);
}
