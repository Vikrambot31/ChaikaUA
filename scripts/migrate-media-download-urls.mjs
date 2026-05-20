import 'dotenv/config';

const databaseURL = process.env.FIREBASE_DATABASE_URL;
const authToken = process.env.FIREBASE_ID_TOKEN || process.env.FIREBASE_DATABASE_AUTH_TOKEN;
if (!databaseURL) throw new Error('Missing FIREBASE_DATABASE_URL');
if (!authToken) throw new Error('Missing FIREBASE_ID_TOKEN or FIREBASE_DATABASE_AUTH_TOKEN for migration reads/writes');

const dryRun = !process.argv.includes('--write');
const dbUrl = (path) => `${databaseURL.replace(/\/$/, '')}/${path}.json?auth=${encodeURIComponent(authToken)}`;

const readPath = async (path) => {
  const response = await fetch(dbUrl(path));
  if (!response.ok) throw new Error(`Read ${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
};

const patchRoot = async (updates) => {
  const response = await fetch(dbUrl(''), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Patch failed: ${response.status} ${await response.text()}`);
};

const parseStoragePath = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(community_photos|lost_found|buy_sell)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.jpg$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const marker = '/o/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return '';
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return '';
  }
};

const migrateCollection = async ({ path, urlField, pathField, keepRequiredUrlField }) => {
  const raw = await readPath(path);
  if (!raw) return { path, scanned: 0, updates: 0 };

  const updates = {};
  let scanned = 0;
  Object.entries(raw).forEach(([key, value]) => {
    scanned += 1;
    const storagePath = parseStoragePath(value[pathField] || value[urlField]);
    if (!storagePath) return;

    updates[`${path}/${key}/${pathField}`] = storagePath;
    updates[`${path}/${key}/${urlField}`] = keepRequiredUrlField ? storagePath : '';
  });

  const updateCount = Object.keys(updates).length;
  if (updateCount && !dryRun) {
    await patchRoot(updates);
  }
  return { path, scanned, updates: updateCount };
};

const results = [];
results.push(await migrateCollection({
  path: 'community_photos',
  urlField: 'imageUri',
  pathField: 'storagePath',
  keepRequiredUrlField: true,
}));
results.push(await migrateCollection({
  path: 'lost_found',
  urlField: 'photoUri',
  pathField: 'photoStoragePath',
  keepRequiredUrlField: false,
}));
results.push(await migrateCollection({
  path: 'buy_sell_listings',
  urlField: 'photoUri',
  pathField: 'photoStoragePath',
  keepRequiredUrlField: false,
}));

console.log(JSON.stringify({ dryRun, results }, null, 2));
if (dryRun) {
  console.log('Dry run only. Re-run with --write to apply updates.');
}
