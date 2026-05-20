const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

const seedPublication = async () => {
  const ref = db.ref('chayka_news/publications').push();

  await ref.set({
    title: 'Тест новостей Чайки',
    shortText: 'Это пробная публикация для проверки Telegram-бота и экрана Новости Чайка.',
    sourceName: 'ChaikaUA',
    sourceUrl: 'https://dah-online.com/',
    priority: 'info',
    aiGenerated: true,
    telegramStatus: 'pending',
    createdAt: Date.now(),
  });

  console.log(`Seed publication created: ${ref.key}`);
};

seedPublication()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
