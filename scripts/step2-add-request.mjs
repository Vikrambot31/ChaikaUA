import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

const BOT = {
  name: 'Luca Moretti',
  email: 'luca.moretti@chaika-bot.test',
  phone: '+380671000001',
  uid: '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
  avatarKey: '1',
  apartment: '47',
};

const maskPhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const visible = digits.slice(0, 5) + '***' + digits.slice(-2);
  return '+' + visible;
};

const getRequestPriorityParts = (category) => {
  const nc = String(category || '').trim().toLowerCase();
  if (nc === 'app_suggestion') return { moderationPriority: 'low', moderationQueue: 'feedback', priorityNumber: '03', priorityKey: 'low' };
  if (['medical', 'electricity', 'care', 'repair'].includes(nc)) return { moderationPriority: 'high', moderationQueue: 'urgent', priorityNumber: '01', priorityKey: nc };
  return { moderationPriority: 'standard', moderationQueue: 'standard', priorityNumber: '02', priorityKey: 'standard' };
};

const getRequestModerationMeta = (category, status = 'pending') => {
  const parts = getRequestPriorityParts(category);
  return {
    moderationPriority: parts.moderationPriority,
    moderationQueue: parts.moderationQueue,
    status_priority: `${status}_${parts.priorityNumber}_${parts.priorityKey}`,
  };
};

async function main() {
  console.log('=== Шаг 2: Добавить заявку (Dobavit-Zayavku) ===\n');

  // Init Firebase
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });
  const db = admin.database();

  console.log(`Бот: ${BOT.name}`);
  console.log(`UID: ${BOT.uid}`);
  console.log(`Телефон: ${BOT.phone}\n`);

  // --- Проверка преград ПЕРЕД отправкой ---

  // 1. Проверка аватара (из Шага 1)
  const profileSnap = await db.ref(`users/${BOT.uid}`).once('value');
  const profile = profileSnap.val();
  const hasAvatar = Boolean(profile?.photoURL?.trim());
  console.log(`[Преграда #1] Аватар: ${hasAvatar ? '✅ есть' : '❌ НЕТ - блокирует отправку'}`);
  if (!hasAvatar) {
    console.log('  → Ошибка: validateSubmissionRequirements не пропустит.\n');
    process.exit(1);
  }

  // 2. Проверка daily limit (на стороне клиента, Admin SDK обходит, но проверим)
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dailySnap = await db.ref('requests')
    .orderByChild('userId')
    .equalTo(BOT.uid)
    .once('value');
  let todayCount = 0;
  if (dailySnap.val()) {
    Object.values(dailySnap.val()).forEach((r) => {
      if (r.createdAt && r.createdAt >= todayStart.getTime()) todayCount++;
    });
  }
  console.log(`[Преграда #2] Лимит 30 заявок/день: ${todayCount}/30 — ${todayCount >= 30 ? '❌' : '✅'}`);
  if (todayCount >= 30) {
    console.log('  → Дневной лимит исчерпан. Отправка невозможна.\n');
    process.exit(1);
  }

  // --- Формирование заявки ---
  const category = 'parcel_delivery';
  const group = 'transport';
  const description = 'Потрібно терміново доставити ліки з аптеки на вул. Центральна, 5. Хто може допомогти протягом години?';
  const nowIso = new Date().toISOString();
  const moderationMeta = getRequestModerationMeta(category, 'pending');

  const TTL_MS = 15 * 24 * 60 * 60 * 1000; // 15 days default

  const newRequest = {
    userId: BOT.uid,
    name: BOT.name,
    phone: maskPhone(BOT.phone),
    category,
    group,
    subcategory: category,
    store: '',
    timeSlot: '',
    destination: '',
    building: 'Чайка',
    text: description,
    description,
    language: 'ru',
    status: 'pending',
    isApproved: false,
    isCensored: false,
    requiresManualModeration: true,
    submittedForModerationAt: nowIso,
    ...moderationMeta,
    timestamp: now,
    createdAt: now,
    expires_at: now + TTL_MS,
  };

  console.log('\n--- Данные заявки ---');
  console.log(`  Категория: ${category} (группа: ${group})`);
  console.log(`  Описание: "${description}"`);
  console.log(`  Статус: pending (требует модерации)`);
  console.log(`  Телефон (замаскирован): ${newRequest.phone}\n`);

  // --- Отправка ---
  console.log('📤 Отправляю заявку...');
  const requestsRef = db.ref('requests');
  const pushResult = await requestsRef.push(newRequest);

  if (!pushResult.key) {
    console.error('❌ Firebase не вернул ID заявки');
    process.exit(1);
  }

  console.log(`✅ Заявка создана! ID: ${pushResult.key}`);
  console.log(`  Путь: /requests/${pushResult.key}`);

  // --- Запись rate_limits (как в addRequest) ---
  await db.ref(`rate_limits/${BOT.uid}/requests/lastAt`).set(now).catch(() => {});
  console.log('  rate_limits обновлён');

  // --- Проверка результата ---
  const savedSnap = await db.ref(`requests/${pushResult.key}`).once('value');
  const saved = savedSnap.val();
  console.log('\n--- Проверка сохранённых данных ---');
  console.log(`  name:           ${saved.name}`);
  console.log(`  phone:          ${saved.phone}`);
  console.log(`  category:       ${saved.category}`);
  console.log(`  group:          ${saved.group}`);
  console.log(`  status:         ${saved.status}`);
  console.log(`  isApproved:     ${saved.isApproved}`);
  console.log(`  moderation:     ${saved.requiresManualModeration ? 'требуется модератор' : 'авто-одобрено'}`);
  console.log(`  moderationQueue: ${saved.moderationQueue}`);
  console.log(`  moderationPriority: ${saved.moderationPriority}`);
  console.log(`  userId:         ${saved.userId}`);
  console.log(`  createdAt:      ${new Date(saved.createdAt).toISOString()}`);
  console.log(`  expires_at:     ${new Date(saved.expires_at).toISOString()}`);

  console.log('\n=== Шаг 2 завершён ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
