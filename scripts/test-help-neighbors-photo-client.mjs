import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref as dbRef, get, push, set, remove } from 'firebase/database';
import { getStorage, ref as stRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig, getFirebaseScriptConfig } from './firebase-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');
const SOURCE_PHOTO = path.join(ROOT, 'assets', 'Chaika foto galary', 'cg01.jpg');

const BOT = {
  email: process.env.CHAIKA_BOT_EMAIL || 'francesca.gallo@chaika-bot.test',
  password: process.env.CHAIKA_BOT_PASSWORD || 'BotChaika2026!',
};

const out = { startedAt: new Date().toISOString(), bot: BOT.email, steps: [], bugs: [] };
const step = (name, ok, details = {}) => out.steps.push({ name, ok, details });
const bug = (severity, title, details = {}) => out.bugs.push({ severity, title, details });

const cleanup = async ({ storage, storagePath, db, photoPath, adminDb }) => {
  if (storagePath) {
    try {
      await deleteObject(stRef(storage, storagePath));
      step('cleanup Storage object', true, { storagePath });
    } catch (error) {
      step('cleanup Storage object', false, { code: error.code, message: error.message, storagePath });
    }
  }
  if (photoPath) {
    try {
      await remove(dbRef(db, photoPath));
      step('cleanup request_photo by owner', true, { photoPath });
    } catch {
      await adminDb.ref(photoPath).remove();
      step('cleanup request_photo by admin', true, { photoPath });
    }
  }
};

async function main() {
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount.default), ...getFirebaseAdminConfig() });
  }
  const adminDb = admin.database();

  const app = initializeClientApp(getFirebaseScriptConfig(), `help-neighbors-photo-smoke-${Date.now()}`);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const storage = getStorage(app);
  let storagePath = '';
  let photoPath = '';

  try {
    const cred = await signInWithEmailAndPassword(auth, BOT.email, BOT.password);
    const uid = cred.user.uid;
    out.uid = uid;
    step('client auth', true, { uid });

    const [profileSnap, inviteSnap] = await Promise.all([
      get(dbRef(db, `users/${uid}`)),
      get(dbRef(db, `invite_access/${uid}`)),
    ]);
    const profile = profileSnap.val();
    const invite = inviteSnap.val();
    step('profile prerequisites', true, {
      hasProfile: Boolean(profile),
      inviteStatus: invite?.status || null,
      hasAvatar: Boolean(profile?.photoURL || profile?.startAvatarKey),
    });

    if (!profile) bug('CRITICAL', 'Bot profile is missing', { path: `users/${uid}` });
    if (invite?.status !== 'approved') bug('CRITICAL', 'Bot invite_access is not approved', { value: invite });
    if (!profile?.photoURL && !profile?.startAvatarKey) bug('HIGH', 'Bot has no avatar; submit would be blocked');
    if (out.bugs.length) return;

    const photoBuffer = fs.readFileSync(SOURCE_PHOTO);
    const now = Date.now();
    storagePath = `requests/${uid}/help_neighbors_smoke_${now}.jpg`;
    await uploadBytes(stRef(storage, storagePath), photoBuffer, {
      contentType: 'image/jpeg',
      customMetadata: { source: 'test-help-neighbors-photo-client' },
    });
    const downloadUrl = await getDownloadURL(stRef(storage, storagePath));
    step('Storage upload + getDownloadURL', true, { storagePath, hasDownloadUrl: Boolean(downloadUrl) });

    const photoRef = await push(dbRef(db, `request_photos/${uid}`), {
      storagePath,
      imageUri: downloadUrl,
      status: 'pending',
      uploadStatus: 'saved',
      moderationStatus: 'pending',
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      uid,
      userId: uid,
      uploadedBy: profile?.name || cred.user.email || uid,
      target: 'my_photos',
      sourceScreen: 'HelpNeighborsScreen',
      sourceScreenLabel: 'Помощь соседям',
    });
    photoPath = `request_photos/${uid}/${photoRef.key}`;
    step('RTDB request_photos write', true, { photoPath });

    const savedPhoto = (await get(dbRef(db, photoPath))).val();
    step('RTDB request_photos owner read', true, {
      status: savedPhoto?.status,
      moderationStatus: savedPhoto?.moderationStatus,
      imageUriIsHttps: /^https?:\/\//i.test(savedPhoto?.imageUri || ''),
    });

    await set(dbRef(db, `rate_limits/${uid}/__smoke_help_neighbors_photo`), { at: now });
    const rateLimitProbe = (await get(dbRef(db, `rate_limits/${uid}/__smoke_help_neighbors_photo`))).val();
    step('RTDB rate_limits owner read/write', true, { rateLimitProbe });
    await remove(dbRef(db, `rate_limits/${uid}/__smoke_help_neighbors_photo`));
  } catch (error) {
    bug('HIGH', 'Help-neighbors photo client smoke failed', { code: error.code, message: error.message, storagePath, photoPath });
  } finally {
    await cleanup({ storage, storagePath, db, photoPath, adminDb });
  }
}

await main();
console.log(JSON.stringify(out, null, 2));
process.exit(out.bugs.length ? 1 : 0);
