import 'dotenv/config';

const databaseURL = process.env.FIREBASE_DATABASE_URL;
const apiKey = process.env.FIREBASE_API_KEY;
const email = process.env.MODERATOR_EMAIL;
const password = process.env.MODERATOR_PASSWORD;

if (!databaseURL) throw new Error('Missing FIREBASE_DATABASE_URL');

const dryRun = !process.argv.includes('--write');
const baseUrl = databaseURL.replace(/\/$/, '');
const dbUrl = (path, token) => `${baseUrl}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;

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
  if (signedToken) return signedToken;
  throw new Error(
    'Missing auth. Set FIREBASE_ID_TOKEN/FIREBASE_DATABASE_AUTH_TOKEN or MODERATOR_EMAIL/MODERATOR_PASSWORD (with FIREBASE_API_KEY).',
  );
};

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

const readPath = async (path, token) => {
  const response = await fetch(dbUrl(path, token));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Read ${path} failed: ${response.status} ${body}`);
  }
  return response.json();
};

const patchRoot = async (updates, token) => {
  const response = await fetch(dbUrl('', token), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Patch failed: ${response.status} ${body}`);
  }
};

const authToken = await resolveAuthToken();
const places = await readPath('places', authToken);
if (!places || typeof places !== 'object') {
  console.log(JSON.stringify({ dryRun, scanned: 0, matched: 0, updates: 0, message: 'No places node found' }, null, 2));
  process.exit(0);
}

let scanned = 0;
let matched = 0;
const updates = {};
const changes = [];

for (const [id, value] of Object.entries(places)) {
  scanned += 1;
  const currentName = typeof value?.name === 'string' ? value.name : '';
  const nextName = NAME_MAP.get(currentName);
  if (!nextName || nextName === currentName) continue;

  matched += 1;
  updates[`places/${id}/name`] = nextName;
  changes.push({ id, from: currentName, to: nextName });
}

if (!dryRun && Object.keys(updates).length > 0) {
  await patchRoot(updates, authToken);
}

console.log(
  JSON.stringify(
    {
      dryRun,
      scanned,
      matched,
      updates: Object.keys(updates).length,
      changes,
    },
    null,
    2,
  ),
);

if (dryRun) {
  console.log('Dry run only. Re-run with --write to apply updates.');
}
