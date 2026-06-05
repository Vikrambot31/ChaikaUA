import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '..', 'chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json');

// Load service account
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Multiple bot listings
const botListings = [
  {
    // Matteo Bianchi - Electrician
    uid: 'YFqlL7WuosMgJrAdXcVvefGDrdz2',
    name: 'Matteo Bianchi',
    phone: '+380671000003',
    itemName: 'Послуги електрика',
    category: 'electronics',
    condition: 'like_new',
    price: '200-500 грн/год',
    description: 'Електрик з 15+ років досвіду. Чинню: розетки, вимикачі, розпредільчі щитки, домофони, світлові системи. Термінові звернення беру в перший день. Гарантія 1 рік. Викликаю недорого.',
    workFormat: 'offline',
    workHours: 'daily',
    locationArea: 'phase_2'
  },
  {
    // Sofia Conti - UX Designer & Consultant
    uid: 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2',
    name: 'Sofia Conti',
    phone: '+380671000004',
    itemName: 'Консультування щодо дизайну та UX',
    category: 'electronics',
    condition: 'like_new',
    price: '1500-3000 грн/проект',
    description: 'Дизайнер цифрових сервісів. Допомагаю малому бізнесу з веб-дизайном, мобільними додатками, тестуванням інтерфейсів. Швидкі консультації або повноцінні проекти. Вільна розмова українською.',
    workFormat: 'mixed',
    workHours: 'weekdays',
    locationArea: 'phase_1'
  },
  {
    // Alessandro Ricci - Chef & Caterer
    uid: 'GEaVFokn5Bdl5kf41ahbBa91jld2',
    name: 'Alessandro Ricci',
    phone: '+380671000005',
    itemName: 'Готування та кейтеринг',
    category: 'home_food',
    condition: 'like_new',
    price: '300-800 грн/персону',
    description: 'Шеф-кухар з італійськими коренями. Готую домашні обіди, святкові меню, кейтеринг для подій. Свіжі інгредієнти, традиційна кухня. Доставка по Чайці включена.',
    workFormat: 'offline',
    workHours: 'daily',
    locationArea: 'phase_3'
  },
  {
    // Marco Santoro - Plumber
    uid: 'gybAiGnrKfZUDqBdTtR3egbfRUH3',
    name: 'Marco Santoro',
    phone: '+380671000009',
    itemName: 'Сантехнічні роботи',
    category: 'cleaning',
    condition: 'like_new',
    price: '150-400 грн/год',
    description: 'Сантехнік з досвідом. Чиню: смішувачі, засори, протічання, лічильники, умивальники, унітази. Виїзд у той же день можливий. Без лишків, професійно.',
    workFormat: 'offline',
    workHours: 'daily',
    locationArea: 'phase_4'
  },
  {
    // Francesca Gallo - Nurse & Health Consultant
    uid: 'hSscTmJTKtTsI6pXeWePtWazDe83',
    name: 'Francesca Gallo',
    phone: '+380671000006',
    itemName: 'Медсестринська допомога та консультації',
    category: 'medicine',
    condition: 'like_new',
    price: '200-400 грн/відвідування',
    description: 'Медсестра з педіатричним досвідом. Консультую з питань здоров\'я, догляду за літніми людьми, дітьми. Виїзд на дім можливий. Лікарські процедури та інжекції.',
    workFormat: 'offline',
    workHours: 'daily',
    locationArea: 'sofia'
  }
];

async function createListings() {
  console.log('\n📱 Creating multiple business listings from different bots...\n');

  const createdListings = [];
  const timestamp = new Date().toISOString();

  for (const bot of botListings) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const listing = {
      itemName: bot.itemName,
      contactName: bot.name,
      category: bot.category,
      condition: bot.condition,
      price: bot.price,
      description: bot.description,
      phone: bot.phone,
      photoUri: '',
      photoStoragePath: '',
      photoId: '',
      moderationStatus: 'pending_review',
      submittedForModerationAt: timestamp,
      createdAt: timestamp,
      expiresAt: expiresAt,
      userId: bot.uid,
      workFormat: bot.workFormat,
      workHours: bot.workHours,
      locationArea: bot.locationArea,
      locationStreet: '',
      locationHouseNumber: '',
      showPhone: true,
      language: 'uk'
    };

    try {
      const ref = await db.ref('biznes_chaika_listings').push(listing);
      createdListings.push({
        id: ref.key,
        ...bot,
        ...listing
      });
      console.log(`✅ ${bot.name} — listing created (ID: ${ref.key})`);
    } catch (error) {
      console.error(`❌ Failed to create listing for ${bot.name}:`, error.message);
    }
  }

  console.log(`\n📊 Summary: Created ${createdListings.length} business listings\n`);

  createdListings.forEach((listing, idx) => {
    console.log(`${idx + 1}. ${listing.name}`);
    console.log(`   📌 ${listing.itemName}`);
    console.log(`   📍 ${listing.locationArea} | ${listing.workFormat} | ${listing.workHours}`);
    console.log(`   💰 ${listing.price}`);
    console.log(`   🔗 ID: ${listing.id}\n`);
  });

  console.log('✨ All listings are pending moderation and will appear after admin approval.\n');
  process.exit(0);
}

createListings().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
