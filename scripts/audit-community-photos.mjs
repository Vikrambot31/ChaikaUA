import admin from 'firebase-admin';

const argLimit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);
const LIMIT = Number.isFinite(argLimit) && argLimit > 0 ? Math.floor(argLimit) : 0;

const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.STORAGE_BUCKET ||
  process.env.GCLOUD_STORAGE_BUCKET ||
  '';

const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

if (!databaseURL) {
  throw new Error('Missing FIREBASE_DATABASE_URL (or DATABASE_URL)');
}

if (!bucketName) {
  throw new Error('Missing FIREBASE_STORAGE_BUCKET (or STORAGE_BUCKET)');
}

admin.initializeApp({
  databaseURL,
  storageBucket: bucketName,
});

const db = admin.database();
const bucket = admin.storage().bucket(bucketName);

const isImageContentType = (contentType) => typeof contentType === 'string' && /^image\//i.test(contentType);

const sniffFormat = (buf) => {
  if (!buf || buf.length < 12) return 'unknown';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return 'unknown';
};

const rows = [];

const snapshot = await db.ref('community_photos').once('value');
const raw = snapshot.val() || {};
const entries = Object.entries(raw);
const list = LIMIT > 0 ? entries.slice(0, LIMIT) : entries;

console.log(`Scanning community_photos: ${list.length}/${entries.length}`);

for (const [id, value] of list) {
  const rec = value || {};
  const storagePath = String(rec.storagePath || '').trim();
  const imageUri = String(rec.imageUri || '').trim();
  const status = String(rec.status || 'pending');

  const row = {
    id,
    status,
    storagePath,
    hasStoragePath: Boolean(storagePath),
    hasImageUri: Boolean(imageUri),
    existsInStorage: false,
    size: 0,
    contentType: '',
    sniffedFormat: 'unknown',
    ok: false,
    issue: '',
  };

  if (!storagePath) {
    row.issue = 'missing_storagePath';
    rows.push(row);
    continue;
  }

  try {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    row.existsInStorage = Boolean(exists);
    if (!exists) {
      row.issue = 'storage_object_missing';
      rows.push(row);
      continue;
    }

    const [meta] = await file.getMetadata();
    row.size = Number(meta?.size || 0);
    row.contentType = String(meta?.contentType || '');

    const [buf] = await file.download({ start: 0, end: 1023 });
    row.sniffedFormat = sniffFormat(buf);

    if (row.size <= 0) {
      row.issue = 'zero_size';
    } else if (!isImageContentType(row.contentType)) {
      row.issue = 'bad_content_type';
    } else if (row.sniffedFormat === 'unknown') {
      row.issue = 'unknown_binary_signature';
    } else {
      row.ok = true;
    }
  } catch (error) {
    row.issue = `error:${error?.message || String(error)}`;
  }

  rows.push(row);
}

const broken = rows.filter((r) => !r.ok);
const healthy = rows.filter((r) => r.ok);

console.log('--- Summary ---');
console.log(`Total checked: ${rows.length}`);
console.log(`Healthy: ${healthy.length}`);
console.log(`Broken: ${broken.length}`);

if (broken.length > 0) {
  console.log('--- Broken ---');
  console.table(
    broken.map((r) => ({
      id: r.id,
      status: r.status,
      issue: r.issue,
      contentType: r.contentType,
      sniffedFormat: r.sniffedFormat,
      size: r.size,
      storagePath: r.storagePath,
    })),
  );
}
