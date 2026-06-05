# Технические детали: Система бот-аккаунтов

**Для интеграции с другими системами и AI агентами**

---

## Firebase структура

### Project
- **ID:** `chaikaua-3cd9d`
- **Регион:** europe-west1 (примерно)
- **Database URL:** из `app.json` → `firebaseConfig.databaseURL`

### Authentication (Firebase Auth)

Таблица: `auth` (эмуляция в эмуляторе, production в облаке)

**Созданные аккаунты:**

```
Тип: Email/Password
Кол-во: 10
Email pattern: {firstname}.{lastname}@chaika-bot.test
Password: BotChaika2026! (все одинаковые для тестирования)
```

**Список UID:**

```javascript
const UIDS = {
  'Luca Moretti': '24h7Iz6ayzgeD73VkCKrIcGnXJ73',
  'Giulia Romano': '9rKrBVsQKAPflSblhpeWkM5wIDv1',
  'Matteo Bianchi': 'YFqlL7WuosMgJrAdXcVvefGDrdz2',
  'Sofia Conti': 'NzvDAlsLqPde8ueOvtZvY2zwy1Q2',
  'Alessandro Ricci': 'GEaVFokn5Bdl5kf41ahbBa91jld2',
  'Francesca Gallo': 'hSscTmJTKtTsI6pXeWePtWazDe83',
  'Davide Esposito': 'cwwaHrtU2lNz5niY7NC3lMUM1hA3',
  'Chiara Lombardi': 'jvFZoz7a1JdpA8WSL3w8GySrh762',
  'Marco Santoro': 'gybAiGnrKfZUDqBdTtR3egbfRUH3',
  'Elena Ferrara': 'zhCLiQnSAlbkuHKLKKMCsfhZ4iX2',
}
```

---

## RTDB (Realtime Database) структура

### 1. Таблица: `users/{uid}`

**Путь:** `https://chaikaua-3cd9d.firebaseio.com/users/{uid}.json`

**Пример документа (Luca Moretti):**

```json
{
  "name": "Luca Moretti",
  "phone": "+380671000001",
  "building": "Чайка",
  "houseNumber": "1",
  "registrationStatus": "complete",
  "registeredAt": "2026-05-26T10:00:00.000Z",
  "startAvatarKey": "1",
  "profession": "Координатор доставки та міський логіст",
  "about": "Живу в ритмі великого міста...",
  "provider": "email",
  "providerId": "24h7Iz6ayzgeD73VkCKrIcGnXJ73",
  "photoURL": "",
  "photoURLs": [],
  "photoStoragePaths": [],
  "referrerPhone": ""
}
```

**Ключевые поля:**

| Поле | Тип | Примечание |
|------|-----|-----------|
| `name` | string | Отображаемое имя |
| `phone` | string | Украинский номер +38067100000X |
| `building` | string | "Чайка" для всех |
| `houseNumber` | string | "1" (корпус) |
| `registrationStatus` | string | **MUST BE "complete"** — влияет на `isActive` |
| `startAvatarKey` | string | "1" to "6" — встроенная аватарка |
| `profession` | string | Из описания бота |
| `about` | string | Биография из MD файла |
| `registeredAt` | string | ISO 8601 timestamp |
| `provider` | string | "email" или "google"/"facebook"/"apple" |
| `providerId` | string | UID из Auth |

**Логика в коде:**

```typescript
// src/services/authProfileService.ts
const inferRegistrationStatus = (firebaseUser, profile): 'partial' | 'complete' => {
  const hasName = Boolean(profile?.name || firebaseUser.displayName);
  const hasPhone = Boolean(profile?.phone || firebaseUser.phoneNumber);
  const hasAddress = Boolean(profile?.building && profile?.houseNumber);

  // Email provider: ALL three required
  return hasName && hasPhone && hasAddress ? 'complete' : 'partial';
};

// В app-слое это становится isActive
const user = {
  ...
  isActive: registrationStatus === 'complete',
  ...
}
```

### 2. Таблица: `invite_access/{uid}`

**Путь:** `https://chaikaua-3cd9d.firebaseio.com/invite_access/{uid}.json`

**Пример документа:**

```json
{
  "status": "approved",
  "manual_grant_reason": "test_bot_account",
  "manual_grant_at": 1748275200000,
  "updatedAt": 1748275200000,
  "mode": "manual"
}
```

**Возможные статусы:**

```typescript
type InviteRequestStatus =
  | 'disabled'          // приглашения отключены
  | 'none'              // нет заявки
  | 'pending'           // в очереди на модерацию
  | 'pending_sponsor'   // ждет ответ спонсора
  | 'approved'          // УТВЕРЖДЕНО (нужен этот статус!)
  | 'denied'            // отказано
  | 'cancelled'         // отменено
  | 'needs_manual_review'
  | 'auto_denied'
  | 'temporary_access'  // временный доступ
```

**Для ботов:** статус должен быть **`'approved'`**

### 3. Таблица: `phone_to_uid` (опционально, если используется)

Если приложение использует индекс по телефону:

```json
{
  "+380671000001": "24h7Iz6ayzgeD73VkCKrIcGnXJ73",
  "+380671000002": "9rKrBVsQKAPflSblhpeWkM5wIDv1",
  ...
}
```

**ВАЖНО:** Это может быть индекс для быстрого поиска по телефону. Проверить в коде:
```bash
grep -r "phone_to_uid" src/
grep -r "phoneToUid" src/
```

---

## Seed скрипт (seed-bot-users.mjs)

### Расположение
```
scripts/seed-bot-users.mjs
```

### Как работает

```javascript
// 1. Инициализация Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: '...',
  projectId: 'chaikaua-3cd9d'
});

// 2. Для каждого бота
for (const bot of BOTS) {

  // 2a. Создание/поиск Auth аккаунта
  let uid = await authClient.createUser({
    email: bot.email,
    password: 'BotChaika2026!',
    displayName: bot.name
  });

  // 2b. Запись в users/{uid}
  await db.ref(`users/${uid}`).set({
    name: bot.name,
    phone: bot.phone,
    building: 'Чайка',
    houseNumber: '1',
    registrationStatus: 'complete',
    startAvatarKey: bot.avatarKey,
    profession: bot.profession,
    about: bot.about,
    // ... остальные поля
  });

  // 2c. Запись в invite_access/{uid}
  await db.ref(`invite_access/${uid}`).set({
    status: 'approved',
    manual_grant_reason: 'test_bot_account',
    manual_grant_at: Date.now(),
    updatedAt: Date.now()
  });
}
```

### Запуск

```bash
cd /path/to/mobile-app-short
node scripts/seed-bot-users.mjs
```

### Идемпотентность

- Если аккаунт уже существует → пропускается
- Если RTDB запись уже существует → перезаписывается
- Безопасно запускать повторно

### Требования

- Service account JSON ключ в корне проекта
- Путь: `chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json`
- Доступ к Firebase Database и Auth

---

## Аватарки (startAvatarKey)

### Встроенные аватарки

Хранятся в: `assets/Avatar-start/`

```
assets/Avatar-start/
├── 1.png
├── 2.png
├── 3.png
├── 4.png
├── 5.png
└── 6.png
```

### Как работает в коде

```typescript
// src/utils/startAvatars.ts
export const START_AVATAR_URI_PREFIX = 'start-avatar://';

export const START_AVATARS: StartAvatar[] = [
  { key: '1', uri: 'start-avatar://1', source: require('../../assets/Avatar-start/1.png') },
  { key: '2', uri: 'start-avatar://2', source: require('../../assets/Avatar-start/2.png') },
  // ...
];

// При загрузке профиля:
// Если startAvatarKey = '1' → превращается в 'start-avatar://1'
// Компонент отображает это как встроенную аватарку
```

### Кастомизация

Если нужна другая аватарка:
1. Заменить файлы в `assets/Avatar-start/`
2. Пересоздать ботов (запустить скрипт)

---

## Логирование и отладка

### Проверить статус бота

```bash
# 1. Firebase Console
# https://console.firebase.google.com/project/chaikaua-3cd9d

# 2. Database rules (RTDB)
# https://console.firebase.google.com/project/chaikaua-3cd9d/database/rules

# 3. Проверить конкретного бота
# Перейти в Realtime Database → Data
# users/24h7Iz6ayzgeD73VkCKrIcGnXJ73
```

### REST API проверка

```bash
# Получить профиль Luca Moretti
curl "https://chaikaua-3cd9d.firebaseio.com/users/24h7Iz6ayzgeD73VkCKrIcGnXJ73.json?auth=YOUR_SECRET"

# Получить статус доступа
curl "https://chaikaua-3cd9d.firebaseio.com/invite_access/24h7Iz6ayzgeD73VkCKrIcGnXJ73.json?auth=YOUR_SECRET"
```

### Логи приложения (mobileapp)

```javascript
// Если включена отладка в коде
import { safeLogError } from '../utils/errorLogger';

// Проверить в консоли:
// Settings → Developer → View logs
```

---

## Интеграция с другими системами

### REST API для создания заявок (от бота)

```bash
# Пример: бот Luca создает заявку
# Требуется Firebase ID token

# 1. Получить ID token
curl -X POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=FIREBASE_API_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "email": "luca.moretti@chaika-bot.test",
    "password": "BotChaika2026!",
    "returnSecureToken": true
  }'

# Response: { "idToken": "...", "refreshToken": "..." }

# 2. Создать заявку (POST к Cloud Function или прямо в RTDB)
curl -X POST https://chaikaua-3cd9d.firebaseio.com/requests.json?auth=ID_TOKEN \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "24h7Iz6ayzgeD73VkCKrIcGnXJ73",
    "name": "Luca Moretti",
    "phone": "+380671000001",
    "text": "Готов помочь с доставкой по Чайке сегодня",
    "category": "help",
    "status": "approved",
    "timestamp": 1748275200000
  }'
```

### Python пример (для другого AI)

```python
import firebase_admin
from firebase_admin import credentials, db, auth

# Инициализация
cred = credentials.Certificate('chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://chaikaua-3cd9d.firebaseio.com'
})

# Получить данные бота
bot_uid = '24h7Iz6ayzgeD73VkCKrIcGnXJ73'
ref = db.reference(f'users/{bot_uid}')
bot_data = ref.get()
print(bot_data)

# Создать новую заявку
requests_ref = db.reference('requests')
new_request = {
    'userId': bot_uid,
    'name': bot_data['name'],
    'phone': bot_data['phone'],
    'text': '...',
    'category': 'help',
    'status': 'approved',
    'timestamp': int(time.time() * 1000)
}
requests_ref.push().set(new_request)
```

---

## Возможные проблемы и решения

### Проблема: Бот видит статус "partial" вместо "complete"

**Причина:** Один из полей (name, phone, building, houseNumber) отсутствует или пуст

**Решение:**
```json
// Проверить в RTDB users/{uid}
{
  "name": "Luca Moretti",  // ✓ есть
  "phone": "+380671000001", // ✓ есть
  "building": "Чайка",      // ✓ есть
  "houseNumber": "1"        // ✓ есть
}
```

### Проблема: Аватарка не отображается

**Причина:** `startAvatarKey` некорректен или не совпадает

**Решение:**
```json
{
  "startAvatarKey": "1"  // Должно быть строка, не число: "1" not 1
}
```

### Проблема: Бот не может создавать заявки

**Причина:** Статус в `invite_access/{uid}` не "approved"

**Решение:**
```json
{
  "status": "approved",  // Должно быть именно "approved"
  "updatedAt": 1748275200000
}
```

### Проблема: Пароль не подходит при входе

**Причина:** Пароль неправильный или аккаунт не создался

**Решение:**
- Пароль: `BotChaika2026!` (точно, с восклицательным знаком)
- Проверить в Firebase Console → Authentication

---

## Переиспользование и расширение

### Добавить нового бота

1. Отредактировать `scripts/seed-bot-users.mjs`
2. Добавить в массив `BOTS`:
```javascript
{
  name: 'New Bot',
  email: 'new.bot@chaika-bot.test',
  phone: '+380671000011',
  avatarKey: '5',
  apartment: '99',
  profession: '...',
  about: '...'
}
```
3. Запустить: `node scripts/seed-bot-users.mjs`

### Удалить бота

```javascript
// В Firebase Console → Authentication
// 1. Найти бота
// 2. Нажать три точки → Delete account

// Или через Admin SDK:
admin.auth().deleteUser(uid);
```

### Изменить пароль бота

```javascript
// Через Admin SDK
admin.auth().updateUser(uid, {
  password: 'NewPassword123!'
});
```

---

**Документация актуальна на:** 26 мая 2026
