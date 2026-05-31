/**
 * Submit a test request as Matteo Bianchi (bot account)
 * Simulates exactly what Форма Заявки screen does: sign in → upload photo → push to RTDB
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, push, set } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDcohmy5PiUiEDQ5mholkY59HpOmeeoG6E',
  authDomain: 'chaikaua-3cd9d.firebaseapp.com',
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
  projectId: 'chaikaua-3cd9d',
  storageBucket: 'chaikaua-3cd9d.firebasestorage.app',
  messagingSenderId: '1027130010906',
  appId: '1:1027130010906:web:db3714bfa38b2fb35410a3',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

// Download a real placeholder image to use as the test photo
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, '*') + digits.slice(-4);
}

async function run() {
  console.log('🔐  Signing in as Matteo Bianchi...');
  const credential = await signInWithEmailAndPassword(
    auth,
    'matteo.bianchi@chaika-bot.test',
    'BotChaika2026!',
  );
  const user = credential.user;
  console.log(`✅  Signed in: uid=${user.uid}`);

  // ── Upload test photo ──────────────────────────────────────────────────────
  const photoId = `req_${Date.now()}`;
  const photoPath = `requests/${user.uid}/${photoId}.jpg`;
  console.log(`📸  Downloading placeholder image...`);

  // Real 400×300 placeholder photo (broken light fixture — thematically fitting)
  const photoBytes = await downloadImage('https://picsum.photos/seed/chaika-request/400/300');
  console.log(`📸  Uploading to Storage → ${photoPath} (${photoBytes.byteLength} bytes)`);

  const photoRef = storageRef(storage, photoPath);
  await uploadBytes(photoRef, photoBytes, { contentType: 'image/jpeg' });
  const downloadUrl = await getDownloadURL(photoRef);
  console.log(`✅  Photo uploaded. URL: ${downloadUrl.slice(0, 60)}...`);

  // ── Build request payload (mirrors firebase-config.ts addRequest exactly) ─
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const TTL_30_DAYS = 30 * 24 * 60 * 60 * 1000;

  const description =
    'У під\'їзді №3 не працює освітлення на 4-му поверсі — лампа перегоріла або проблема з автоматом. ' +
    'Виявив сьогодні вранці. Прошу когось з обслуговуючої служби перевірити і замінити.';

  const newRequest = {
    userId: user.uid,
    name: 'Matteo Bianchi',
    phone: '+380671000003',
    maskedPhone: maskPhone('+380671000003'),
    category: 'repair',
    group: 'requests',
    subcategory: 'repair',
    store: '',
    timeSlot: '',
    destination: '',
    building: 'Чайка',
    text: description,
    description,
    language: 'ua',
    status: 'pending',
    isApproved: false,
    isCensored: false,
    requiresManualModeration: true,
    submittedForModerationAt: nowIso,
    timestamp: now,
    createdAt: now,
    expires_at: now + TTL_30_DAYS,
    photoUri: downloadUrl,
    photoStoragePath: photoPath,
    startAvatarKey: '3',
  };

  console.log('📝  Submitting request to RTDB...');
  const pushResult = await push(ref(database, 'requests'), newRequest);
  console.log(`✅  Request submitted! ID: ${pushResult.key}`);

  // ── Set rate-limit marker (mirrors what the app does) ─────────────────────
  await set(ref(database, `rate_limits/${user.uid}/requests/lastAt`), now).catch(() => undefined);

  console.log('\n📋  Request summary:');
  console.log(`    ID:       ${pushResult.key}`);
  console.log(`    User:     Matteo Bianchi (${user.uid})`);
  console.log(`    Category: repair (Ремонт)`);
  console.log(`    Text:     ${description.slice(0, 60)}...`);
  console.log(`    Photo:    ${photoPath}`);
  console.log('\n🎉  Done! Check the admin panel → Requests.');

  process.exit(0);
}

run().catch((err) => {
  console.error('❌  Error:', err.message || err);
  process.exit(1);
});
