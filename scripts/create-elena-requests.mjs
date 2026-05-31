import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');
const VV_JPG_PATH = path.join(ROOT, 'ЗАПУСК АПК', '--Bot-Ai-Klienti', 'Тех задание 5 агентов', 'vv.jpg');

const ELENA = {
  uid: 'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2',
  name: 'Elena Ferrara',
  email: 'elena.ferrara@chaika-bot.test',
  phone: '+380671000010',
  avatarKey: '4',
  apartment: '31',
  age: 28,
  profession: 'Контент-редактор і модератор онлайн-спільнот',
  about: 'Вмію писати ясні, коректні та безпечні тексти для широкої аудиторії.',
  building: 'Чайка',
  houseNumber: '1',
};

const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const NOW_MS = NOW.getTime();

const TEXT = {
  ua: {
    helpNeighbors: 'Потрібна допомога з редагуванням тексту для оголошення. Маю важливе повідомлення для сусідів, але хотіла б, щоб хтось перевірив, чи все зрозуміло і коректно. Буду вдячна за швидкий зворотній зв\'язок сьогодні до 18:00.',
    helpRequest: 'Шукаю людину, яка допоможе відредагувати текст заявки для публікації у спільній стрічці. Текст має бути нейтральним, зрозумілим і без емоційних перегинів. Досвід роботи з текстами вітається.',
    resume: 'Працюю контент-редактором і модератором онлайн-спільнот. Маю досвід написання та редагування текстів для соціальних мереж, форумів і мобільних застосунків. Шукаю віддалену роботу або проєкти в сфері контент-менеджменту.',
    buySell: 'Продаю збірник корисних шаблонів для написання оголошень. Допомагає швидко створити чітке і грамотне повідомлення для будь-якої ситуації. Стан чудовий, користувалась акуратно.',
    lostFound: 'Загубила невеликий блокнот у бежевій обкладинці, формат А6, з написами «Content Notes» на першій сторінці. Можливо, залишила в коворкінгу або в кафе біля дому. Дуже важливий для роботи.',
    problem: 'У під\'їзді на першому поверсі не працює освітлення. Лампа перегоріла ще три дні тому. У вечірній час дуже незручно заходити і виходити. Прошу замінити лампу в найближчий час. Дякую.',
    electricityOn: 'Світло в будинку з\'явилось. Все працює, напруга стабільна. Дякую сусідам за оновлення статусу.',
    business: 'Пропоную послуги редагування та написання текстів для оголошень, постів у соціальних мережах, листів до компаній. Допоможу сформулювати думку чітко, грамотно і без зайвої емоційності.',
    photoTitle: 'Ранкове сонце у дворі ЖК Чайка',
    photoDesc: 'Фото зроблено о 7 ранку біля будинку 1. Чудове освітлення і тиха атмосфера.',
    soulPhotoDesc: 'Захід сонця над Чайкою. Фото для душі, зроблено з вікна 5 поверху.',
    osbbNewsTitle: 'Збір пропозицій щодо озеленення двору',
    osbbNewsBody: 'Шановні сусіди! Пропоную обговорити можливість висадки нових кущів і квітів біля під\'їздів навесні. Чекаю ваші ідеї та пропозиції в коментарях до цієї новини.',
    osbbSborTopic: 'Збір на нову лавку біля під\'їзду',
    osbbSborDesc: 'Пропоную зібрати кошти на встановлення нової лавки біля 1 під\'їзду. Орієнтовна вартість 2000 грн.',
    osbbVoteQuestion: 'Чи підтримуєте ви встановлення нової лавки біля під\'їзду №1?',
    osbbFinancePaid: 'Щомісячний внесок за квітень',
    inviteText: 'Я новий мешканець, прошу надати доступ до застосунку. Дякую!',
    sportTime: '19:00',
  },
};

const HELPER_GROUPS = {
  MEDICINE: 'medicine',
  REPAIR: 'repair',
  PSYCHOLOGY: 'psychology',
  TRANSPORT: 'transport',
  SHOPPING: 'shopping',
  DOCUMENTS: 'documents',
  OTHER: 'other',
};

const HELP_TYPES_MAP = {
  medical: ['Медична допомога', 'medical'],
  translation: ['Переклад та мова', 'translation'],
  documents: ['Допомога з документами', 'documents'],
  computer: ['Комп\'ютерна допомога', 'computer'],
  other: ['Інше', 'other'],
};

function makeTimestamp(daysFromNow = 0, hoursFromNow = 0) {
  const d = new Date(NOW_MS);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(d.getHours() + hoursFromNow);
  return d.getTime();
}

function makeExpiresAt(ttlDays) {
  return makeTimestamp(ttlDays);
}

function pickRandom(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRequestId() {
  return `auto_${NOW_MS}_${pickRandom(1000, 9999)}`;
}

const getRequestStatusPriority = (category, status, moderationPriority) => {
  const prio = moderationPriority === 'high' ? '01' : moderationPriority === 'low' ? '03' : '02';
  return `${status}_${prio}_${category}`;
};

async function uploadVVPhoto(storageBucket, uid) {
  const bytes = fs.readFileSync(VV_JPG_PATH);
  const ext = path.extname(VV_JPG_PATH).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const storagePath = `requests/${uid}/vv_${NOW_MS}.jpg`;
  const file = storageBucket.file(storagePath);

  await file.save(bytes, {
    contentType,
    resumable: false,
    metadata: { metadata: { source: 'elena-test-bot', uid } },
  });

  console.log(`[OK] Photo uploaded: ${storagePath}`);
  return { storagePath };
}

async function createRequest(db, overrides = {}) {
  const id = generateRequestId();
  const ref = db.ref(`requests/${id}`);
  const category = overrides.category || 'other';
  const moderationPriority = overrides.moderationPriority || 'standard';
  const moderationQueue = moderationPriority === 'high' ? 'urgent' : moderationPriority === 'low' ? 'feedback' : 'standard';
  const isAutoApproved = overrides.group === 'help_neighbors' || category === 'electricity';

  const payload = {
    userId: ELENA.uid,
    name: ELENA.name,
    phone: ELENA.phone,
    maskedPhone: ELENA.phone.slice(0, 6) + '***' + ELENA.phone.slice(-2),
    category,
    group: overrides.group || '',
    subcategory: overrides.subcategory || category,
    store: '',
    timeSlot: '',
    destination: '',
    building: ELENA.building,
    text: overrides.text || '',
    description: overrides.text || '',
    language: 'ua',
    status: isAutoApproved ? 'approved' : 'pending',
    isApproved: isAutoApproved,
    isCensored: false,
    requiresManualModeration: !isAutoApproved,
    moderationPriority,
    moderationQueue,
    status_priority: getRequestStatusPriority(category, isAutoApproved ? 'approved' : 'pending', moderationPriority),
    timestamp: NOW_MS,
    createdAt: NOW_MS,
    expires_at: makeExpiresAt(overrides.ttlDays || 15),
    photoUri: overrides.photoUri || '',
    photoStoragePath: overrides.photoStoragePath || '',
    userPhotoURL: `start-avatar://${ELENA.avatarKey}`,
    startAvatarKey: ELENA.avatarKey,
  };

  if (isAutoApproved) {
    payload.moderatedAt = NOW_ISO;
    payload.moderatedBy = 'auto';
  } else {
    payload.submittedForModerationAt = NOW_ISO;
  }

  await ref.set(payload);
  console.log(`[OK] Request created: requests/${id} (${category})`);
  return id;
}

async function createJobListing(db) {
  const id = generateRequestId();
  const ref = db.ref(`job_listings/${id}`);
  const payload = {
    listingKind: 'resume',
    name: ELENA.name,
    phone: ELENA.phone,
    age: String(ELENA.age),
    workType: TEXT.ua.workTypes ? TEXT.ua.workTypes[8] : 'IT / дизайн',
    about: TEXT.ua.resume,
    photoUri: '',
    photoStoragePath: '',
    userId: ELENA.uid,
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
    createdAt: NOW_ISO,
    expiresAt: new Date(NOW_MS + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };
  await ref.set(payload);
  console.log(`[OK] Job listing created: job_listings/${id}`);
  return id;
}

async function createBuySellListing(db) {
  const id = generateRequestId();
  const ref = db.ref(`buy_sell_listings/${id}`);
  const payload = {
    itemName: 'Збірник шаблонів для оголошень',
    category: 'books',
    condition: 'like_new',
    price: '150',
    description: TEXT.ua.buySell,
    phone: ELENA.phone,
    photoUri: '',
    photoStoragePath: '',
    photoId: '',
    userId: ELENA.uid,
    expiresAt: new Date(NOW_MS + 90 * 24 * 60 * 60 * 1000).toISOString(),
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] BuySell listing created: buy_sell_listings/${id}`);
  return id;
}

async function createLostFound(db) {
  const id = generateRequestId();
  const ref = db.ref(`lost_found/${id}`);
  const payload = {
    type: 'lost',
    name: ELENA.name,
    phone: ELENA.phone,
    category: 'Інше',
    description: TEXT.ua.lostFound,
    photoUri: '',
    photoStoragePath: '',
    userId: ELENA.uid,
    expiresAt: new Date(NOW_MS + 15 * 24 * 60 * 60 * 1000).toISOString(),
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] LostFound created: lost_found/${id}`);
  return id;
}

async function createBusinessListing(db) {
  const id = generateRequestId();
  const ref = db.ref(`contacts_listings/${id}`);
  const payload = {
    itemName: 'Редагування та написання текстів',
    category: 'services',
    condition: 'new',
    price: 'Домовність',
    description: TEXT.ua.business,
    phone: ELENA.phone,
    photoUri: '',
    photoStoragePath: '',
    userId: ELENA.uid,
    expiresAt: new Date(NOW_MS + 30 * 24 * 60 * 60 * 1000).toISOString(),
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] Business listing created: contacts_listings/${id}`);
  return id;
}

async function createCommunityPhoto(db, storageBucket, overrides = {}) {
  const id = generateRequestId();
  const ref = db.ref(`community_photos/${id}`);

  let photoStoragePath = '';
  try {
    const result = await uploadVVPhoto(storageBucket, ELENA.uid);
    photoStoragePath = result.storagePath;
  } catch (err) {
    console.log(`[WARN] Photo upload failed: ${err.message}, using placeholder`);
  }

  const payload = {
    title: overrides.title || TEXT.ua.photoTitle,
    description: overrides.description || TEXT.ua.photoDesc,
    imageUri: photoStoragePath,
    downloadUrl: photoStoragePath,
    uploadedBy: ELENA.name,
    uploadedByEmail: ELENA.email,
    createdAt: NOW_MS,
    uploadedAt: NOW_MS,
    status: 'pending',
    target: overrides.target || 'gallery_public',
    sourceScreen: overrides.sourceScreen || 'Zagruzka-Foto',
    safetyStatus: 'pending',
    likes: 0,
    userId: ELENA.uid,
    storagePath: photoStoragePath,
  };

  if (overrides.locationLabel) payload.locationLabel = overrides.locationLabel;
  if (overrides.locationType) payload.locationType = overrides.locationType;

  await ref.set(payload);
  console.log(`[OK] Community photo created: community_photos/${id} (${overrides.sourceScreen || 'general'})`);
  return id;
}

async function createOSBBNews(db, buildingId = '1') {
  const id = generateRequestId();
  const ref = db.ref(`osbb_news/${buildingId}/${id}`);
  const payload = {
    title: TEXT.ua.osbbNewsTitle,
    body: TEXT.ua.osbbNewsBody,
    priority: 'info',
    userId: ELENA.uid,
    userName: ELENA.name,
    createdAt: NOW_ISO,
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] OSBB news created: osbb_news/${buildingId}/${id}`);
  return id;
}

async function createOSBBCollection(db, buildingId = '1') {
  const id = generateRequestId();
  const ref = db.ref(`osbb_collections/${buildingId}/${id}`);
  const payload = {
    title: TEXT.ua.osbbSborTopic,
    description: TEXT.ua.osbbSborDesc,
    target: '2000',
    deadline: new Date(NOW_MS + 30 * 24 * 60 * 60 * 1000).toISOString(),
    monobankLink: '',
    userId: ELENA.uid,
    userName: ELENA.name,
    createdAt: NOW_ISO,
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] OSBB collection created: osbb_collections/${buildingId}/${id}`);
  return id;
}

async function createOSBBVote(db, buildingId = '1') {
  const id = generateRequestId();
  const ref = db.ref(`osbb_votes/${buildingId}/${id}`);
  const payload = {
    title: 'Опитування: нова лавка',
    question: TEXT.ua.osbbVoteQuestion,
    status: 'active',
    options: [
      { id: 'yes', labelKey: 'yes', votes: 0 },
      { id: 'no', labelKey: 'no', votes: 0 },
    ],
    deadline: new Date(NOW_MS + 7 * 24 * 60 * 60 * 1000).toISOString(),
    totalApartments: 100,
    voterIds: {},
    createdAt: NOW_ISO,
    createdBy: ELENA.uid,
    moderationStatus: 'pending',
    submittedForModerationAt: NOW_ISO,
  };
  await ref.set(payload);
  console.log(`[OK] OSBB vote created: osbb_votes/${buildingId}/${id}`);
  return id;
}

async function createOSBBFinancePayment(db, buildingId = '1') {
  const id = generateRequestId();
  const ref = db.ref(`osbb_finances/${buildingId}/payments/${id}`);
  const payload = {
    payerName: ELENA.name,
    paidAmount: '500',
    paidAt: NOW_ISO,
    userId: ELENA.uid,
    apartment: ELENA.apartment,
    createdAt: NOW_ISO,
  };
  await ref.set(payload);
  console.log(`[OK] OSBB finance payment created: osbb_finances/${buildingId}/payments/${id}`);
  return id;
}

async function createSportPlayer(db, sport = 'football') {
  const ref = db.ref(`sports/${sport}/players/${ELENA.uid}`);
  const payload = {
    name: ELENA.name,
    phone: ELENA.phone,
    rating: 0,
    addedAt: NOW_ISO,
  };
  await ref.set(payload);
  console.log(`[OK] Sport player created: sports/${sport}/players/${ELENA.uid}`);

  const today = NOW_ISO.slice(0, 10);
  const dayRef = db.ref(`sports/${sport}/days/${today}/${ELENA.uid}`);
  const dayPayload = {
    name: ELENA.name,
    phone: ELENA.phone,
    time: TEXT.ua.sportTime,
    updatedAt: NOW_ISO,
  };
  await dayRef.set(dayPayload);
  console.log(`[OK] Sport daily entry created: sports/${sport}/days/${today}/${ELENA.uid}`);
}

async function createBuildingRating(db) {
  const ref = db.ref(`ratings/${ELENA.building}_${ELENA.houseNumber}/${ELENA.uid}`);
  const payload = {
    cleaning: 4,
    elevator: 3,
    electricity: 5,
    services: 4,
    createdAt: NOW_MS,
    updatedAt: NOW_MS,
  };
  await ref.set(payload);
  console.log(`[OK] Building rating created: ratings/${ELENA.building}_${ELENA.houseNumber}/${ELENA.uid}`);
}

async function updateElenaProfile(db) {
  const ref = db.ref(`users/${ELENA.uid}`);
  const payload = {
    name: ELENA.name,
    phone: ELENA.phone,
    building: ELENA.building,
    houseNumber: ELENA.houseNumber,
    profession: ELENA.profession,
    about: ELENA.about,
    registrationStatus: 'complete',
    registeredAt: '2026-05-26T10:00:00.000Z',
    startAvatarKey: ELENA.avatarKey,
    provider: 'email',
    providerId: ELENA.uid,
    photoURL: `start-avatar://${ELENA.avatarKey}`,
    photoURLs: [`start-avatar://${ELENA.avatarKey}`],
    photoStoragePaths: [],
    referrerPhone: '',
    apartment: ELENA.apartment,
    age: ELENA.age,
    gender: 'female',
    language: 'ua',
  };
  await ref.set(payload);
  console.log(`[OK] Elena profile updated: users/${ELENA.uid}`);
}

async function main() {
  console.log('\n=== Создание заявок от имени Elena Ferrara ===\n');

  const serviceAccount = await import(pathToFileURL(SERVICE_ACCOUNT_PATH).href, { with: { type: 'json' } });
  const config = getFirebaseAdminConfig();

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount.default),
      ...config,
    });
  }

  const db = admin.database();
  const storageBucket = admin.storage().bucket(config.storageBucket);

  // Step 0: Update Elena's profile with avatar
  console.log('\n--- Step 0: Update profile & avatar ---');
  await updateElenaProfile(db);

  // Create all requests
  console.log('\n--- Requests (Forma-Zayavki.tsx) ---');
  await createRequest(db, {
    category: 'other',
    group: 'help_neighbors',
    text: TEXT.ua.helpNeighbors,
    ttlDays: 10,
    moderationPriority: 'standard',
  });

  console.log('\n--- Detailed help request (Zapros-Pomoshi.tsx) ---');
  await createRequest(db, {
    category: 'translation',
    group: 'care',
    subcategory: 'translation',
    text: TEXT.ua.helpRequest,
    ttlDays: 10,
    moderationPriority: 'standard',
  });

  console.log('\n--- Job listing (Poisk-Raboty.tsx) ---');
  await createJobListing(db);

  console.log('\n--- Buy/Sell (Kuplu-Prodam.tsx) ---');
  await createBuySellListing(db);

  console.log('\n--- Lost & Found (Kto-Poteryal.tsx) ---');
  await createLostFound(db);

  console.log('\n--- Problem report (Problemy-Chayki.tsx) ---');
  await createRequest(db, {
    category: 'problem',
    group: '',
    subcategory: 'lighting',
    text: TEXT.ua.problem,
    ttlDays: 30,
    moderationPriority: 'high',
  });

  console.log('\n--- Electricity status (Status-Sveta.tsx) ---');
  await createRequest(db, {
    category: 'electricity',
    group: '',
    subcategory: 'status_on',
    text: TEXT.ua.electricityOn,
    ttlDays: 15,
    moderationPriority: 'low',
  });

  console.log('\n--- Business listing (ZhkBusinessListScreen) ---');
  await createBusinessListing(db);

  console.log('\n--- Photo uploads ---');
  await createCommunityPhoto(db, storageBucket, { sourceScreen: 'Zagruzka-Foto' });
  await createCommunityPhoto(db, storageBucket, { sourceScreen: 'Foto-Rayona', locationLabel: 'будинок 1, ЖК Чайка', locationType: 'building' });
  await createCommunityPhoto(db, storageBucket, { sourceScreen: 'Foto-Dlya-Dushi', title: 'Захід сонця', description: TEXT.ua.soulPhotoDesc });

  console.log('\n--- OSBB forms ---');
  await createOSBBNews(db);
  await createOSBBCollection(db);
  await createOSBBVote(db);
  await createOSBBFinancePayment(db);

  console.log('\n--- Sports ---');
  await createSportPlayer(db, 'football');

  console.log('\n--- Building rating ---');
  await createBuildingRating(db);

  console.log('\n=== All done! 17 requests created successfully ===\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err?.message || String(err));
  process.exit(1);
});
