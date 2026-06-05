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

// Bot details (Luca Moretti)
const BOT_UID = '24h7Iz6ayzgeD73VkCKrIcGnXJ73';
const BOT_NAME = 'Luca Moretti';
const BOT_PHONE = '+380671000001';

// Create business listing
const timestamp = new Date().toISOString();
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const bizListing = {
  itemName: 'Координація доставок та логістики',
  contactName: BOT_NAME,
  category: 'logistics',
  condition: 'like_new',
  price: 'договірна',
  description: 'Готов допомогти з доставкою по Чайці. Швидко, надійно, на професійному рівні. Займаюсь терміновими доставками, передачею документів, невеликих посилок в межах мікрорайону. Завжди уточню деталі перед дією.',
  phone: BOT_PHONE,
  photoUri: '',
  photoStoragePath: '',
  photoId: '',
  moderationStatus: 'pending_review',
  submittedForModerationAt: timestamp,
  createdAt: timestamp,
  expiresAt: expiresAt,
  userId: BOT_UID,
  workFormat: 'offline',
  workHours: 'daily',
  locationArea: 'phase_1',
  locationStreet: '',
  locationHouseNumber: '',
  showPhone: true,
  language: 'uk'
};

console.log('\n📱 Creating business listing on behalf of bot: Luca Moretti\n');

db.ref('biznes_chaika_listings')
  .push(bizListing)
  .then((ref) => {
    console.log('✅ Business listing created successfully!\n');
    console.log('📌 Listing details:');
    console.log('   ID:', ref.key);
    console.log('   Title:', bizListing.itemName);
    console.log('   Category:', bizListing.category);
    console.log('   Contact:', bizListing.contactName);
    console.log('   Phone:', bizListing.phone);
    console.log('   Status:', bizListing.moderationStatus);
    console.log('   Location:', bizListing.locationArea);
    console.log('   Work Format:', bizListing.workFormat);
    console.log('   Work Hours:', bizListing.workHours);
    console.log('\n🔗 Database path: /biznes_chaika_listings/' + ref.key);
    console.log('\n✨ The listing is pending moderation and will appear after admin approval.\n');

    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error creating listing:', error.message);
    process.exit(1);
  });
