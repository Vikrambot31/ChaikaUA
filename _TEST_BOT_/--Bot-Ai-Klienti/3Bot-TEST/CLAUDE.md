# Правила роботи AI агента з тест-ботами Чайки

## ГОЛОВНЕ ПРАВИЛО
Перед кожною заявкою — **завжди завантажити аватар з цієї папки у профіль**.
Папка з аватарами: `_TEST_BOT_/--Bot-Ai-Klienti/3Bot-TEST/Avatar-start/`
Файли: `1.png` … `6.png` — номер відповідає полю `avatarKey` у `bots-data.json`

---

## Покроковий алгоритм (обов'язковий порядок)

### Крок 1 — Отримати реальний UID бота

```js
const userRecord = await admin.auth().getUserByEmail(bot.email);
const uid = userRecord.uid; // ЗАВЖДИ беремо звідси, не з bots-data.json
```

> UID у `bots-data.json` може бути застарілим. Тільки `auth().getUserByEmail()` дає правильний UID.

### Крок 2 — Завантажити фото з папки Avatar-start у Firebase Storage

```js
const avatarFile = `_TEST_BOT_/--Bot-Ai-Klienti/3Bot-TEST/Avatar-start/${bot.avatarKey}.png`;
const storagePath = `profile_photos/${uid}/avatar.png`;

const file = bucket.file(storagePath);
await file.save(fs.readFileSync(avatarFile), {
  contentType: 'image/png',
  metadata: { cacheControl: 'public, max-age=31536000' }
});
await file.makePublic();

const photoURL = `https://storage.googleapis.com/${storageBucket}/${storagePath}`;
```

### Крок 3 — Записати фото у профіль (як EditProfileScreen)

```js
await db.ref(`users/${uid}`).update({
  photoURL,
  photoURLs: [photoURL],
  photoStoragePaths: [storagePath],
  startAvatarKey: String(bot.avatarKey),
  age: bot.age,
  gender: bot.gender,
  updatedAt: Date.now()
});
```

### Крок 4 — Створити заявку (з тим самим photoURL)

```js
await db.ref('requests').push({
  userId: uid,
  name: bot.name,
  phone: bot.phone,
  maskedPhone: '+38067***0X',
  category: 'help',           // або інша категорія
  group: 'help_neighbors',
  subcategory: 'delivery',
  building: `Чайка, буд. ${bot.houseNumber}`,
  text: 'Текст заявки',
  language: 'ua',
  status: 'approved',
  isApproved: true,
  isCensored: false,
  requiresManualModeration: false,
  moderatedAt: new Date().toISOString(),
  moderatedBy: 'auto',
  moderationPriority: 'standard',
  moderationQueue: 'standard',
  status_priority: 'approved_02_standard',
  timestamp: Date.now(),
  createdAt: Date.now(),
  expires_at: Date.now() + 10 * 24 * 60 * 60 * 1000,
  userPhotoURL: photoURL,          // ← реальне фото у заявці
  startAvatarKey: String(bot.avatarKey),
  photoUri: '',
  photoStoragePath: ''
});
```

---

## Ініціалізація Firebase Admin SDK

```js
const admin = require('firebase-admin');
const sa = JSON.parse(fs.readFileSync('chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json', 'utf8'));
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const extra = appJson.expo.extra;

admin.initializeApp({
  credential: admin.credential.cert(sa),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
  storageBucket: extra.firebaseStorageBucket  // 'chaikaua-3cd9d.firebasestorage.app'
});
const db = admin.database();
const bucket = admin.storage().bucket();
```

Файли конфігурації (відносно кореня проекту `C:\ChaikaUA\mobile-app-short`):
- Service account: `chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json`
- Конфіг: `app.json` → `expo.extra`
- Боти: `_TEST_BOT_/--Bot-Ai-Klienti/3Bot-TEST/bots-data.json`

---

## Готовий скрипт для всіх 10 ботів

```bash
cd C:\ChaikaUA\mobile-app-short
node scripts/create-help-requests-from-bots.mjs
```

---

## Дані ботів (`bots-data.json`)

| # | Ім'я | Email | avatarKey | Стать | Вік |
|---|------|-------|-----------|-------|-----|
| 1 | Luca Moretti | luca.moretti@chaika-bot.test | 1 | male | 34 |
| 2 | Giulia Romano | giulia.romano@chaika-bot.test | 2 | female | 31 |
| 3 | Matteo Bianchi | matteo.bianchi@chaika-bot.test | 3 | male | 39 |
| 4 | Sofia Conti | sofia.conti@chaika-bot.test | 4 | female | 27 |
| 5 | Alessandro Ricci | alessandro.ricci@chaika-bot.test | 5 | male | 36 |
| 6 | Francesca Gallo | francesca.gallo@chaika-bot.test | 6 | female | 42 |
| 7 | Davide Esposito | davide.esposito@chaika-bot.test | 1 | male | 45 |
| 8 | Chiara Lombardi | chiara.lombardi@chaika-bot.test | 2 | female | 33 |
| 9 | Marco Santoro | marco.santoro@chaika-bot.test | 3 | male | 41 |
| 10 | Elena Ferrara | elena.ferrara@chaika-bot.test | 4 | female | 28 |

Пароль для всіх: `BotChaika2026!`
