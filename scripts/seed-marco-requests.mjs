import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

const PHOTO_DIR = path.join(ROOT, 'ЗАПУСК АПК', '--Bot-Ai-Klienti', 'Тех задание 5 агентов');
const PHOTO_FILE = path.join(PHOTO_DIR, 'vv.jpg');

const MARCO = {
  uid: 'gybAiGnrKfZUDqBdTtR3egbfRUH3',
  name: 'Marco Santoro',
  email: 'marco.santoro@chaika-bot.test',
  phone: '+380671000009',
  avatarKey: '3',
  apartment: '56',
  building: 'Чайка',
  houseNumber: '1',
};

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

async function uploadPhoto(bucket) {
  if (!fs.existsSync(PHOTO_FILE)) {
    console.log('Фото не найдено, пропускаем загрузку');
    return '';
  }
  const storagePath = `photo_uploads/marco_santoro/${NOW}_vv.jpg`;
  const bytes = fs.readFileSync(PHOTO_FILE);
  await bucket.file(storagePath).save(bytes, {
    contentType: 'image/jpeg',
    resumable: false,
    metadata: { metadata: { source: 'seed-marco-requests', userId: MARCO.uid } },
  });
  console.log(`Фото загружено: ${storagePath}`);
  return storagePath;
}

async function run() {
  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  const config = getFirebaseAdminConfig();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount.default), ...config });

  const db = admin.database();
  const bucket = admin.storage().bucket(config.storageBucket);

  const photoStoragePath = await uploadPhoto(bucket);
  const photoUri = photoStoragePath || '';

  const created = [];

  const makeBase = () => ({
    userId: MARCO.uid,
    name: MARCO.name,
    phone: MARCO.phone,
    building: MARCO.building,
    language: 'uk',
    timestamp: NOW,
    createdAt: NOW,
    startAvatarKey: MARCO.avatarKey,
  });

  const nowISO = new Date(NOW).toISOString();

  const requests = [
    {
      label: 'Dobavit-Zayavku (основная заявка — сантехника)',
      path: 'requests',
      payload: {
        ...makeBase(),
        text: 'Потрібна заміна змішувача на кухні. У квартирі 56, корпус 1, старий змішувач підтікає. Маю свій інструмент та новий змішувач. Можу зробити сьогодні після 17:00 або завтра в першій половині дня. Відгукніться через застосунок, щоб узгодити час.',
        description: 'Потрібна заміна змішувача на кухні. У квартирі 56, корпус 1, старий змішувач підтікає. Маю свій інструмент та новий змішувач. Можу зробити сьогодні після 17:00 або завтра в першій половині дня. Відгукніться через застосунок, щоб узгодити час.',
        category: 'repair',
        group: 'repair',
        subcategory: 'plumbing',
        status: 'pending',
        isApproved: false,
        isCensored: false,
        expires_at: NOW + 14 * DAY_MS,
        requiresManualModeration: true,
        submittedForModerationAt: nowISO,
        moderationPriority: 'standard',
        moderationQueue: 'standard',
        status_priority: 'pending_02_standard',
        photoUri,
        photoStoragePath,
      },
    },
    {
      label: 'Kuplu-Prodam (продам інструмент)',
      path: 'buy_sell_listings',
      payload: {
        userId: MARCO.uid,
        itemName: 'Набір сантехнічних ключів',
        category: 'construction',
        condition: 'good',
        price: '500',
        description: 'Продам набір сантехнічних ключів. Користувався акуратно, стан добрий. У наборі 5 ключів різного розміру. Самовивіз, корпус 1. Ціна договірна, пишіть у чаті.',
        phone: MARCO.phone,
        photoStoragePath: photoUri,
        photoUri: '',
        photoId: '',
        expiresAt: new Date(NOW + 90 * DAY_MS).toISOString(),
        moderationStatus: 'pending',
        submittedForModerationAt: nowISO,
        language: 'uk',
      },
    },
    {
      label: 'Poisk-Raboty (резюме сантехніка)',
      path: 'job_listings',
      payload: {
        userId: MARCO.uid,
        listingKind: 'resume',
        name: MARCO.name,
        phone: MARCO.phone,
        age: '36',
        workType: 'Одноразова допомога',
        about: 'Досвідчений сантехнік із 10-річним стажем. Допоможу з усуненням протічок, заміною змішувачів, сифонів, прокладок, ремонтом унітазів. Працюю акуратно, з власним інструментом. Одноразово або на постійній основі. Живу в корпусі 1, Чайка.',
        photoStoragePath: photoUri,
        photoUri: '',
        moderationStatus: 'pending',
        submittedForModerationAt: nowISO,
        language: 'uk',
      },
    },
    {
      label: 'Kto-Poteryal (знайдено ключі)',
      path: 'lost_found',
      payload: {
        userId: MARCO.uid,
        type: 'found',
        name: MARCO.name,
        phone: MARCO.phone,
        category: 'keys',
        description: 'Сьогодні вранці знайшов зв\'язку ключів на лавці біля корпусу 1. Лежали з 8:00 до 9:00. Якщо ваші — відгукніться, опишіть ключі, поверну.',
        photoStoragePath: photoUri,
        photoUri: '',
        expiresAt: new Date(NOW + 15 * DAY_MS).toISOString(),
        moderationStatus: 'pending',
        submittedForModerationAt: nowISO,
        language: 'uk',
      },
    },
    {
      label: 'Pomoch-Sosedyam (термінова допомога — протікання)',
      path: 'requests',
      payload: {
        ...makeBase(),
        text: 'Терміново: протікання труби в підвалі корпусу 1. Помітив протікання в підвальному приміщенні корпусу 1. Труба холодної води, тече несильно, але постійно. Потрібен доступ до вентиля. Актуально сьогодні, щоб не допустити підтоплення.',
        description: 'Терміново: протікання труби в підвалі корпусу 1. Помітив протікання в підвальному приміщенні корпусу 1. Труба холодної води, тече несильно, але постійно. Потрібен доступ до вентиля. Актуально сьогодні, щоб не допустити підтоплення.',
        category: 'help',
        group: 'help_neighbors',
        subcategory: 'plumbing',
        status: 'pending',
        isApproved: false,
        isCensored: false,
        expires_at: NOW + 10 * DAY_MS,
        requiresManualModeration: true,
        submittedForModerationAt: nowISO,
        moderationPriority: 'high',
        moderationQueue: 'urgent',
        status_priority: 'pending_01_urgent',
        photoUri,
        photoStoragePath,
      },
    },
    {
      label: 'Zapros-Pomoshi (детальний запит — ремонт унітазу)',
      path: 'requests',
      payload: {
        ...makeBase(),
        text: 'Потребую допомоги з ремонтом бачка унітазу. У квартирі 56 зламався бачок унітазу — не тримає воду. Потрібна заміна внутрішнього механізму. Маю нову запчастину. Актуально протягом 2-3 днів. Відгукніться через застосунок.',
        description: 'Потребую допомоги з ремонтом бачка унітазу. У квартирі 56 зламався бачок унітазу — не тримає воду. Потрібна заміна внутрішнього механізму. Маю нову запчастину. Актуально протягом 2-3 днів. Відгукніться через застосунок.',
        category: 'repair',
        group: 'repair',
        subcategory: 'plumbing',
        status: 'pending',
        isApproved: false,
        isCensored: false,
        expires_at: NOW + 14 * DAY_MS,
        requiresManualModeration: true,
        submittedForModerationAt: nowISO,
        moderationPriority: 'standard',
        moderationQueue: 'standard',
        status_priority: 'pending_02_standard',
        photoUri,
        photoStoragePath,
      },
    },
    {
      label: 'Problemy-Chayki (слабкий напір води)',
      path: 'requests',
      payload: {
        ...makeBase(),
        text: 'Слабкий напір води в корпусі 1. Останні два дні на 3-му поверсі слабкий напір холодної води. Ввечері майже не тече. Прошу перевірити загальний стояк або клапан на вході. Проблема стає критичною у вечірні години.',
        description: 'Слабкий напір води в корпусі 1. Останні два дні на 3-му поверсі слабкий напір холодної води. Ввечері майже не тече. Прошу перевірити загальний стояк або клапан на вході. Проблема стає критичною у вечірні години.',
        category: 'problem',
        group: 'problems',
        subcategory: 'infrastructure',
        status: 'pending',
        isApproved: false,
        isCensored: false,
        expires_at: NOW + 14 * DAY_MS,
        requiresManualModeration: true,
        submittedForModerationAt: nowISO,
        moderationPriority: 'standard',
        moderationQueue: 'standard',
        status_priority: 'pending_02_standard',
        photoUri,
        photoStoragePath,
      },
    },
    {
      label: 'Zagruzka-Foto (фото двору)',
      path: 'community_photos',
      payload: {
        userId: MARCO.uid,
        title: 'Ранок у дворі Чайки після дощу',
        description: 'Свіжий ранок у дворі корпусу 1 після нічного дощу. Тиша, спокій, гарне повітря.',
        imageUri: photoUri,
        storagePath: photoStoragePath,
        uploadedBy: MARCO.name,
        uploadedByEmail: MARCO.email,
        createdAt: NOW,
        uploadedAt: NOW,
        status: 'pending',
        target: 'gallery_public',
        likes: 0,
        safetyStatus: 'pending',
      },
    },
    {
      label: 'Kontakt-XXX (анкета знайомств)',
      path: 'contacts_listings',
      payload: {
        userId: MARCO.uid,
        itemName: 'Marco, 36, сантехнік',
        category: 'Чоловік, сантехнік',
        condition: 'Спілкування, дружба, стосунки',
        price: '36',
        description: 'Практичний, спокійний, без зайвого шуму. Працюю сантехніком, живу в Чайці корпус 1. Люблю порядок, тихі вечори та справжню розмову. Шукаю людину, з якою комфортно мовчати і цікаво говорити. Відгукніться через застосунок, якщо хочете познайомитись.',
        phone: MARCO.phone,
        photoStoragePath: photoUri,
        photoUri: '',
        photoId: '',
        expiresAt: new Date(NOW + 30 * DAY_MS).toISOString(),
        moderationStatus: 'pending',
        submittedForModerationAt: nowISO,
        language: 'uk',
      },
    },
    {
      label: 'ZhkBusinessList (бізнес-список сантехніка)',
      path: `local_business/${MARCO.uid}`,
      noPush: true,
      payload: {
        uid: MARCO.uid,
        userId: MARCO.uid,
        categoryKey: 'repair',
        categoryLabel: 'Ремонт та майстри',
        subcategoryKey: 'plumbing',
        subcategoryLabel: 'Сантехнічні роботи',
        contactName: MARCO.name,
        phone: MARCO.phone,
        description: 'Професійний сантехнік із 10-річним стажем. Виконую будь-які сантехнічні роботи: заміна змішувачів, сифонів, прокладок, ремонт унітазів, усунення засорів та протічок. Працюю акуратно, з власним інструментом. Виїжджаю в межах ЖК Чайка. Оплата за домовленістю.',
        photoStoragePath: photoUri,
        photoUri: '',
        language: 'uk',
        createdAt: nowISO,
        updatedAt: nowISO,
        version: 1,
        status: 'pending',
        moderatedAt: null,
        moderatedBy: null,
        moderationReason: null,
        rejectionReason: null,
      },
    },
    {
      label: 'Status-Sveta (повідомлення про світло)',
      path: 'requests',
      payload: {
        ...makeBase(),
        text: '⚡ Світло є — Чайка, корпус 1',
        description: '⚡ Світло є — Чайка, корпус 1',
        category: 'electricity',
        group: 'electricity',
        subcategory: 'power_on',
        status: 'pending',
        isApproved: false,
        isCensored: false,
        expires_at: NOW + 10 * DAY_MS,
        requiresManualModeration: true,
        submittedForModerationAt: nowISO,
        moderationPriority: 'standard',
        moderationQueue: 'standard',
        status_priority: 'pending_02_standard',
      },
    },
    {
      label: 'Pro-Prilozhenie (пропозиція до застосунку)',
      path: 'app_suggestions',
      payload: {
        text: 'Додайте, будь ласка, можливість швидко викликати майстра зі списку перевірених контактів прямо з ленти заявок. Часто треба знайти сантехніка або електрика, а доводиться гортати стрічку в пошуках.',
        name: MARCO.name,
        phone: MARCO.phone,
        userId: MARCO.uid,
        moderationStatus: 'pending',
        submittedForModerationAt: nowISO,
        createdAt: nowISO,
      },
    },
  ];

  for (const req of requests) {
    if (req.noPush) {
      const ref = db.ref(req.path);
      await ref.set(req.payload);
      created.push({ id: req.path, label: req.label, path: req.path });
      console.log(`+ ${req.label} -> ${req.path} (set)`);
    } else {
      const ref = db.ref(req.path).push();
      await ref.set(req.payload);
      created.push({ id: ref.key, label: req.label, path: req.path });
      console.log(`+ ${req.label} -> ${req.path}/${ref.key}`);
    }
  }

  console.log('\n=== ГОТОВО ===');
  console.log(`Создано заявок: ${created.length}`);
  console.log(`От имени: ${MARCO.name} (${MARCO.email})`);
  console.log(`UID: ${MARCO.uid}`);
  console.log('');
  console.log('Все заявки отправлены на модерацию (статус: pending).');
  console.log('Зайдите в Admin Panel и одобрите их.');

  process.exit(0);
}

run().catch((error) => {
  console.error('Ошибка:', error?.message || String(error));
  process.exit(1);
});
