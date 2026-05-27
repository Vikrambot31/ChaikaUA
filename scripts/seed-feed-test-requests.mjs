import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(
  ROOT,
  'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json',
);

const OWNER_NAME = process.env.SEED_OWNER_NAME || 'Владелец Чайка (тест)';
const OWNER_PHONE = process.env.SEED_OWNER_PHONE || '+380670000001';
const TEST_PHOTO_URI =
  process.env.SEED_TEST_PHOTO_URI ||
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80';

const now = Date.now();

const scenarios = [
  { category: 'problem', group: 'building_issues', subcategory: 'elevator', text: 'Тест: не працює ліфт у підʼїзді 2.' },
  { category: 'buy_sell', group: 'exchange', subcategory: 'free_items', text: 'Тест: віддам дитячий стілець, самовивіз.' },
  { category: 'contacts', group: 'contacts', subcategory: 'neighbors_contact', text: 'Тест: шукаю контакти перевіреного сантехніка.' },
  { category: 'job_search', group: 'education_services', subcategory: 'job_search', text: 'Тест: шукаю підробіток у Чайці на вечір.' },
  { category: 'lost_found', group: 'lost_found', subcategory: 'lost_item', text: 'Тест: загублено звʼязку ключів біля 3 підʼїзду.' },
  { category: 'help', group: 'help_neighbors', subcategory: 'medicine', text: 'Тест: потрібна допомога купити ліки сьогодні.' },
  { category: 'transport', group: 'transport', subcategory: 'ride_share', text: 'Тест: їду до метро Житомирська, можу підвезти.' },
  { category: 'repair', group: 'repair', subcategory: 'plumbing', text: 'Тест: потрібен сантехнік для заміни змішувача.' },
  { category: 'care', group: 'care', subcategory: 'elderly_help', text: 'Тест: допомога літній людині з продуктами.' },
  { category: 'pets', group: 'pets', subcategory: 'found_pet', text: 'Тест: знайдено дружнього песика біля парку.' },
  { category: 'foodsharing', group: 'foodsharing', subcategory: 'going_shopping', text: 'Тест: йду в магазин, можу купити сусідам.' },
];

const makePayload = (scenario, index) => {
  const timestamp = now + index;
  const idTag = `feed-test-${new Date(now).toISOString().slice(0, 10)}`;
  const description = `${scenario.text} [${idTag}]`;

  return {
    userId: `seed-owner-${new Date(now).toISOString().slice(0, 10)}`,
    name: OWNER_NAME,
    phone: OWNER_PHONE,
    maskedPhone: OWNER_PHONE,
    text: description,
    description,
    category: scenario.category,
    group: scenario.group,
    subcategory: scenario.subcategory,
    building: 'Чайка',
    isCensored: false,
    isApproved: true,
    status: 'approved',
    timestamp,
    createdAt: timestamp,
    expires_at: timestamp + 14 * 24 * 60 * 60 * 1000,
    moderatedAt: timestamp,
    moderatedBy: 'seed-feed-test-script',
    moderationReason: 'manual_test_seed',
    rejectionReason: '',
    photoUri: TEST_PHOTO_URI,
    photoStoragePath: TEST_PHOTO_URI,
  };
};

const main = async () => {
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount.default),
    ...getFirebaseAdminConfig(),
  });

  const db = admin.database();
  const created = [];

  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i];
    const payload = makePayload(scenario, i);
    const recordRef = db.ref('requests').push();
    await recordRef.set(payload);
    created.push({
      id: recordRef.key,
      group: scenario.group,
      subcategory: scenario.subcategory,
    });
  }

  console.log('Созданы тестовые заявки:');
  for (const item of created) {
    console.log(`- ${item.id} (${item.group}/${item.subcategory})`);
  }
  console.log(`Итого: ${created.length}`);
  process.exit(0);
};

main().catch((error) => {
  console.error('Ошибка seed-feed-test-requests:', error?.message || String(error));
  process.exit(1);
});
