import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, get, push, ref, set, update } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebaseScriptConfig } from './firebase-config.mjs';

const ROOT = 'C:/ChaikaUA/mobile-app-short';
const GALLERY_DIR = path.join(ROOT, 'assets', 'Chaika foto galary');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function listSeedImages() {
  const names = fs
    .readdirSync(GALLERY_DIR)
    .filter((name) => /^cg\d{2}\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (names.length === 0) {
    throw new Error('Не найдены файлы cg*.jpg в assets/Chaika foto galary');
  }

  return names;
}

function parseIndex(fileName) {
  const match = fileName.match(/^(?:cg)(\d{2})\.jpg$/i);
  if (!match) return 0;
  return Number(match[1]);
}

async function loadExistingByStoragePath(db) {
  const snapshot = await get(ref(db, 'community_photos'));
  const data = snapshot.val() || {};
  const byStoragePath = new Map();

  for (const [id, value] of Object.entries(data)) {
    const storagePath = typeof value?.storagePath === 'string' ? value.storagePath : '';
    if (storagePath) byStoragePath.set(storagePath, id);
  }

  return byStoragePath;
}

async function uploadAndSeed({ email, password, dryRun }) {
  const firebaseConfig = getFirebaseScriptConfig();

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const storage = getStorage(app);

  console.log('Вход в Firebase...');
  await signInWithEmailAndPassword(auth, email, password);
  console.log('Вход выполнен.');

  const files = listSeedImages();
  const existingByPath = await loadExistingByStoragePath(db);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const fileName of files) {
    const localPath = path.join(GALLERY_DIR, fileName);
    const storagePath = `community_photos/system_gallery/${fileName}`;
    const index = parseIndex(fileName);
    const title = `Чайка ${String(index).padStart(2, '0')}`;

    if (!dryRun) {
      const bytes = fs.readFileSync(localPath);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      const photoRef = storageRef(storage, storagePath);
      await uploadBytes(photoRef, blob, {
        contentType: 'image/jpeg',
        customMetadata: {
          source: 'chaika_seed',
          fileName,
        },
      });
    }

    const payload = {
      title,
      description: 'Архивное фото ЖК Чайка.',
      imageUri: storagePath,
      storagePath,
      uploadedBy: 'Chaika archive',
      createdAt: Date.now(),
      status: 'approved',
      likes: 0,
      userId: 'system',
      locationLabel: 'ЖК Чайка',
      locationType: 'building',
      moderatedAt: Date.now(),
      moderatedBy: 'system_seed_script',
      moderationReason: null,
      rejectionReason: null,
      safetyStatus: 'manual_reviewed',
      safetyReason: 'seed_gallery_approved',
      safetyReviewedAt: Date.now(),
      safetyReviewedBy: 'system_seed_script',
    };

    const existingId = existingByPath.get(storagePath);
    if (existingId) {
      if (!dryRun) {
        await update(ref(db, `community_photos/${existingId}`), payload);
      }
      updated += 1;
      console.log(`[update] ${fileName} -> community_photos/${existingId}`);
      continue;
    }

    if (dryRun) {
      skipped += 1;
      console.log(`[dry-run:create] ${fileName} -> ${storagePath}`);
      continue;
    }

    const newRef = push(ref(db, 'community_photos'));
    await set(newRef, payload);
    created += 1;
    console.log(`[create] ${fileName} -> community_photos/${newRef.key}`);
  }

  console.log('---');
  console.log(`Создано: ${created}`);
  console.log(`Обновлено: ${updated}`);
  console.log(`Dry-run пропущено: ${skipped}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const email = String(options.email || process.env.SEED_ADMIN_EMAIL || '').trim();
  const password = String(options.password || process.env.SEED_ADMIN_PASSWORD || '').trim();
  const dryRun = Boolean(options['dry-run']);

  if (!email || !password) {
    throw new Error('Укажи --email и --password (или SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).');
  }

  await uploadAndSeed({ email, password, dryRun });
}

main().catch((error) => {
  console.error('Ошибка seed-скрипта:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
