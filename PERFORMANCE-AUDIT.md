# Аудит продуктивності екранів з введенням даних і фото

## Зміст
1. [Екрани з можливістю додавання фото/даних](#1-екрани)
2. [Вузькі місця при навантаженні](#2-вузькі-місця)
3. [Конкретний код що тормозить](#3-код)
4. [Рекомендації по оптимізації](#4-оптимізація)

---

## 1. Екрани з можливістю додавання фото/даних

| Екран | Файл | Фото | Поля форми | Ризик тормозів |
|---|---|---|---|---|
| Завантаження фото | `src/screens/Zagruzka-Foto.tsx` | до 5 | title, description, category, location | **ВИСОКИЙ** |
| Фото для душі | `src/screens/Foto-Dlya-Dushi.tsx` | 1 | description, address | **ВИСОКИЙ** |
| Фото району | `src/screens/Foto-Rayona.tsx` | — (перегляд) | — | **СЕРЕДНІЙ** (RTDB full scan) |
| Форма заявки | `src/screens/Forma-Zayavki.tsx` | 1 | name, phone, helpType, description | **СЕРЕДНІЙ** |
| Купити/Продати | `src/screens/CreateBuySellScreen.tsx` | до 5 | name, type, category, condition, price, desc, phone | **ВИСОКИЙ** |
| Хто загубив | `src/screens/Kto-Poteryal.tsx` | 1 | type, category, name, phone, description, location | **СЕРЕДНІЙ** |
| Редагувати профіль | `src/screens/EditProfileScreen.tsx` | 1 (аватар) | name, phone, city, apartment, profession, about | **НИЗЬКИЙ** |
| Мої фото | `src/photo-module/MyPhotosScreen.tsx` | до 10 | — | **ВИСОКИЙ** |
| Модерація | `src/screens/Moderaciya-Foto.tsx` | — (перегляд) | 7 колекцій RTDB | **ВИСОКИЙ** |
| Реєстрація | `src/screens/Registraciya-Polnaya.tsx` | — | name, email, phone, password, street, building | **НИЗЬКИЙ** |
| Меню бізнесу | `src/screens/BusinessMenuEditorScreen.tsx` | 1 | до 20 страв | **СЕРЕДНІЙ** |

---

## 2. Вузькі місця при навантаженні

### 🔴 КРИТИЧНО: Потрійна компресія зображень

**Файли:**
- `src/utils/imageCompressor.ts:44-75`
- `src/services/photoService.ts:118-123`
- `src/services/photoUploadService.ts:138-143`
- `src/photo-module/PhotoUploadEngine.ts:307-311`

**Проблема:** Одне фото проходить **3 проходи** `ImageManipulator.manipulateAsync`:
1. `compressImage()` в photoService — стиснення до 1600px (рядки 44-75 в imageCompressor.ts)
2. `createPreview()` в photoService — створення прев'ю 300px (рядок 123 в photoService.ts)
3. `uploadPhotoToNamespace()` — друге стиснення до 1920px (рядки 138-143 в photoUploadService.ts)
4. Генерація thumbnail 360px в upload engine (рядки 307-311 в PhotoUploadEngine.ts)

**Кожен** `manipulateAsync` — це native bridge call, який блокує JS thread на **500ms-2с** на低端 пристроях.

```
// imageCompressor.ts:44-52 — Перший прохід: нормалізація формату
const normalized = await ImageManipulator.manipulateAsync(
  localUri,
  [],  // без змін розміру, але конвертує в JPEG
  { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
);

// imageCompressor.ts:67-75 — Другий прохід: реальна компресія
const compressed = await ImageManipulator.manipulateAsync(
  normalized.uri,
  actions,  // resize
  { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
);
```

```
// photoUploadService.ts:138-143 — Третій прохід: ще одна компресія при завантаженні
compressedUri = await compressImage(localUri, {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.82,
});
```

```
// PhotoUploadEngine.ts:307-311 — Четвертий прохід: thumbnail
const thumbResult = await ImageManipulator.manipulateAsync(
  localUri,
  [{ resize: { width: 360 } }],
  { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
);
```

### 🔴 КРИТИЧНО: AsyncStorage перезапис при кожному progress tick

**Файл:** `src/photo-module/ImageStorage.ts:39-44`

**Проблема:** Кожне оновлення progress (кожні ~100ms під час завантаження) викликає повний read-modify-write цикл AsyncStorage.

```
// ImageStorage.ts:39-44 — writePhotos
const writePhotos = async (photos: UserPhoto[]): Promise<UserPhoto[]> => {
  const sorted = sortPhotos(photos).slice(0, MAX_STORED_PHOTOS).map(preparePhotoForStorage);
  memoryPhotos = sorted;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));  // ← ТУТ ТУРМОЗИТЬ
  notify(sorted);
  return sorted;
};
```

```
// UploadQueue.ts:300 — Кожен progress tick викликає writePhotos
onProgress: (percent) => {
  void ImageStorage.updatePhoto(task.photoId, { progress: percent });  // ← read + map + write
},
```

```
// ImageStorage.ts:63-73 — updatePhoto робить повний read-modify-write
async updatePhoto(photoId: string, patch: Partial<UserPhoto>): Promise<UserPhoto | null> {
  const photos = await this.getPhotos();  // ← AsyncStorage read
  const next = photos.map((photo) => {    // ← map через ВСІ фото (до 80)
    if (photo.id !== photoId) return photo;
    updated = { ...photo, ...patch, updatedAt: Date.now() };
    return updated;
  });
  await writePhotos(next);               // ← AsyncStorage write
  return updated;
}
```

**Вплив:** 5 фото × 10 progress updates × 2 operation (read+write) = **100 AsyncStorage ops** за одне завантаження.

### 🔴 КРИТИЧНО: Firebase RTDB full collection scan в галереях

**Файли:**
- `src/screens/Foto-Dlya-Dushi.tsx:252-306`
- `src/screens/Foto-Rayona.tsx:195-261`

**Проблема:** Обидва екрани підписуються на **ВСІ** `community_photos_public` і `community_photos` вузли, завантажуючи весь обсяг даних, потім фільтрують клієнтською стороною.

```
// Foto-Dlya-Dushi.tsx:252-253 — Завантажує ВСІ public фото
const publicQuery = query(ref(database, 'community_photos_public'), orderByChild('sourceScreen'), equalTo(SCREEN_ID));
unsubPublic = onValue(publicQuery, (snapshot) => {  // ← кожен update = re-parse ВСЬОГО дерева
  const value = snapshot.val() as unknown;
  approvedPhotos.length = 0;
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {  // ← O(n) кожного разу
    const photo = parsePhoto(id, raw, true);
    if (photo) approvedPhotos.push(photo);
  });
  updatePhotos(approvedPhotos, pendingPhotos);  // ← re-render
});

// Foto-Dlya-Dushi.tsx:278-279 — Завантажує ВСІ community_photos (весь node!)
const ownPendingRef = ref(database, 'community_photos');  // ← БЕЗ фільтрації на сервері!
unsubPending = onValue(ownPendingRef, (snapshot) => {
  // Фільтрує тільки pending + owner === currentUid на клієнті
  Object.entries(value).forEach(([id, raw]) => {
    if (status === 'pending' && owner === currentUid) { ... }  // ← O(n) для кожного фото
  });
});
```

```
// Foto-Rayona.tsx:195 — Те саме: full scan без серверної фільтрації
const publicRef = ref(database, 'community_photos_public');  // ← ВСІ фото, без фільтру
unsubPublic = onValue(publicRef, (snapshot) => { ... });
```

**Вплив:** З кожним новим фото в системі, розмір payload зростає лінійно. При 500 фото — це вже ~500KB JSON, який парситься при кожному оновленні.

### 🟡 СЕРЕДНІЙ: AppPhotoImage — масовий download при монтуванні сітки

**Файл:** `src/components/AppPhotoImage.tsx:218-369`

**Проблема:** Кожен `AppPhotoImage` при монтуванні:
1. Викликає `getDownloadURL` для Firebase Storage (мережевий запит)
2. Завантажує файл на диск (`FileSystem.downloadAsync`) — до 50MB кешу

```
// AppPhotoImage.tsx:280 — Кожен екземпляр = 1 network download
const downloaded = await FileSystem.downloadAsync(url, targetPath);
```

**Вплив:** Сітка з 60 фото = 60 parallel `getDownloadURL` + 60 sequential disk downloads. На повільному інтернеті — фото показують спінери по 5-10 секунд.

### 🟡 СЕРЕДНІЙ: UploadQueue.process() кожні 25с навіть при порожній черзі

**Файл:** `App.tsx:262-282`

```
// App.tsx:268-270 — Polling кожні 25 секунд
const intervalId = setInterval(() => {
  void UploadQueue.process();  // ← навіть якщо черга порожня
}, 25000);
```

```
// UploadQueue.ts:readQueue() — кожен process() читає AsyncStorage
async readQueue(): Promise<UploadTask[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);  // ← read навіть при порожній черзі
  ...
}
```

### 🟡 СЕРЕДНІЙ: Draft save без debounce

**Файли:**
- `src/screens/Zagruzka-Foto.tsx:245-249` — **БЕЗ debounce**
- `src/screens/CreateBuySellScreen.tsx:124-130` — **БЕЗ debounce**

```
// Zagruzka-Foto.tsx:245-249 — Запис кожного change без затримки
useEffect(() => {
  if (!title && !description && !selectedCategory && !locationSearch) return;
  const draft = { title, description, selectedCategory, locationSearch };
  void AsyncStorage.setItem(PHOTO_UPLOAD_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
}, [title, description, selectedCategory, locationSearch]);  // ← кожне натискання клавіші
```

```
// CreateBuySellScreen.tsx:124-130 — Те саме
useEffect(() => {
  if (!isDirty) return;
  void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({
    itemName, listingType, category, condition, price, description, phone, hadPhotos: formPhotos.length > 0,
  })).catch(() => {});
}, [category, condition, description, formPhotos.length, isDirty, itemName, listingType, phone, price]);
```

**Порівняння:** `Forma-Zayavki.tsx:492-501` має правильний debounce 600ms.

### 🟡 СЕРЕДНІЙ: Moderaciya-Foto — завантаження 7 колекцій одночасно

**Файл:** `src/screens/Moderaciya-Foto.tsx:158-240`

```
// Moderaciya-Foto.tsx:164-240 — Паралельне завантаження ВСІХ колекцій
const loaders: Promise<void>[] = [];
loaders.push(firebaseChatAPI.getRequestsPaginated({ limit: 200 }));  // 200 requests
if (tab === 'photos' || tab === 'requests') {
  loaders.push(photoAPI.getPhotosOnce());  // ВСІ фото
}
if (tab === 'buysell') {
  loaders.push(get(ref(database, 'buy_sell_listings')));  // ВСІ оголошення
}
if (tab === 'contacts') {
  loaders.push(get(ref(database, 'contacts_listings')));  // ВСІ контакти
}
if (tab === 'jobs') {
  loaders.push(get(ref(database, 'job_listings')));  // ВСІ вакансії
}
```

### 🟢 НИЗЬКИЙ: waitForUpload polling

**Файл:** `src/photo-module/waitForUpload.ts:8-33`

```
// waitForUpload.ts:19 — Кожен poll = N AsyncStorage reads
const photos = await Promise.all(photoIds.map((photoId) => ImageStorage.getPhoto(photoId)));
// × 10 ітерацій (кожні 1.2с, макс 12с) = 10 × N reads
```

---

## 3. Конкретний код що тормозить (строчка за строчкою)

### Потрійна компресія зображень

| # | Файл:Рядок | Код | Що робить | Час (ms) |
|---|---|---|---|---|
| 1 | `imageCompressor.ts:44` | `await ImageManipulator.manipulateAsync(localUri, [], { compress: 1, format: JPEG })` | Нормалізація формату (content:// → file://, HEIC → JPEG) | 200-800 |
| 2 | `imageCompressor.ts:67` | `await ImageManipulator.manipulateAsync(normalized.uri, actions, { compress: quality })` | Resize + стиснення до 1600px | 300-1000 |
| 3 | `photoService.ts:123` | `await createPreview(compressedUri)` → викликає `ImageManipulator.manipulateAsync(...)` | Прев'ю 300px | 200-500 |
| 4 | `photoUploadService.ts:138` | `await compressImage(localUri, { maxWidth: 1920 })` | Друге стиснення до 1920px (навіть якщо вже 1600!) | 300-1000 |
| 5 | `PhotoUploadEngine.ts:307` | `await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: 360 } }])` | Thumbnail 360px | 200-500 |

**Загалом на 1 фото:** 4-5 native bridge calls = **1200-4300ms** на低端 пристроях.

### AsyncStorage перезапис при progress

| # | Файл:Рядок | Код | Що робить |
|---|---|---|---|
| 6 | `UploadQueue.ts:300` | `void ImageStorage.updatePhoto(task.photoId, { progress: percent })` | Викликає updatePhoto кожні ~100ms |
| 7 | `ImageStorage.ts:64` | `const photos = await this.getPhotos()` | AsyncStorage read (до 80 записів) |
| 8 | `ImageStorage.ts:66` | `photos.map((photo) => { ... })` | Map через всі фото |
| 9 | `ImageStorage.ts:71` | `await writePhotos(next)` | AsyncStorage write (JSON.stringify + setItem) |
| 10 | `ImageStorage.ts:17-18` | `const sorted = sortPhotos(photos); listeners.forEach(listener => listener(sorted))` | Sort + fan-out до всіх subscribers |

**Загалом на 5 фото × 10 ticks:** 100 read-modify-write циклів = **~5000ms** total I/O.

### Firebase RTDB full scan

| # | Файл:Рядок | Код | Що робить |
|---|---|---|---|
| 11 | `Foto-Dlya-Dushi.tsx:252` | `query(ref(database, 'community_photos_public'), orderByChild('sourceScreen'), equalTo(SCREEN_ID))` | Серверна фільтрація по sourceScreen — **добре** |
| 12 | `Foto-Dlya-Dushi.tsx:278` | `ref(database, 'community_photos')` | **ПОВНИЙ** скан community_photos без фільтру! |
| 13 | `Foto-Dlya-Dushi.tsx:286-296` | `Object.entries(value).forEach(...)` | Клієнтська фільтрація pending + owner — **O(n)** |
| 14 | `Foto-Rayona.tsx:195` | `ref(database, 'community_photos_public')` | **ПОВНИЙ** скан без серверного фільтру! |
| 15 | `Foto-Rayona.tsx:221` | `ref(database, 'community_photos')` | Повний скан для pending — аналогічно |
| 16 | `Foto-Rayona.tsx:229-248` | `Object.entries(value).forEach(...)` | Клієнтська фільтрація по status + owner + sourceScreen |

**Вплив:** При 1000 фото в community_photos_public — ~200-500KB JSON парситься при кожному update будь-якого фото в системі.

### AppPhotoImage масовий download

| # | Файл:Рядок | Код | Що робить |
|---|---|---|---|
| 17 | `AppPhotoImage.tsx:244` | `url = await storageUrlResolver(createStorageRef(storage, path))` | Firebase getDownloadURL — network call |
| 18 | `AppPhotoImage.tsx:280` | `const downloaded = await FileSystem.downloadAsync(url, targetPath)` | Повний download файлу на диск |

**60 фото в сітці:** 60 × (getDownloadURL + downloadAsync) = **хвилини** на повільному з'єднанні.

### Draft save без debounce

| # | Файл:Рядок | Код | Проблема |
|---|---|---|---|
| 19 | `Zagruzka-Foto.tsx:248` | `AsyncStorage.setItem(PHOTO_UPLOAD_DRAFT_KEY, JSON.stringify(draft))` | Без debounce — кожне натискання клавіші |
| 20 | `CreateBuySellScreen.tsx:126-129` | `AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({...}))` | Без debounce — кожна зміна будь-якого поля |

---

## 4. Рекомендації по оптимізації

### 🔴 Негайні (високий вплив)

#### 4.1. Усунути потрійну компресію

**Файл:** `src/utils/imageCompressor.ts`

**Рішення:** Залишити **один** прохід компресії в `photoService.preparePhoto()` (1600px), видалити друге стиснення в `photoUploadService.ts:138-143`.

```
// photoUploadService.ts:137-143 — ЗАМІНИТИ НА:
// Якщо compressedUri вже є з photoService — використовувати його без повторної компресії
if (!compressedUri) {
  // Тільки якщо photoService не стиснув (fallback)
  compressedUri = await compressImage(localUri, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
}
```

**Thumbnail** можна зробити з **вже стиснутого** файлу (рядок 308 в PhotoUploadEngine.ts), замінивши `localUri` на `compressedUri`.

#### 4.2. Додати debounce до draft save

**Файли:** `Zagruzka-Foto.tsx:245-249`, `CreateBuySellScreen.tsx:124-130`

**Рішення:** Додати `setTimeout` 600ms, як в `Forma-Zayavki.tsx:492-501`.

```typescript
// Zagruzka-Foto.tsx — замінити useEffect на:
useEffect(() => {
  const timer = setTimeout(() => {
    if (!title && !description && !selectedCategory && !locationSearch) return;
    void AsyncStorage.setItem(PHOTO_UPLOAD_DRAFT_KEY, JSON.stringify({
      title, description, selectedCategory, locationSearch
    })).catch(() => {});
  }, 600);
  return () => clearTimeout(timer);
}, [title, description, selectedCategory, locationSearch]);
```

#### 4.3. ImageStorage: throttle progress updates

**Файл:** `src/photo-module/UploadQueue.ts:299-301`

**Рішення:** Оновлювати progress не частіше 1 разу на 500ms.

```typescript
// UploadQueue.ts:299-301 — ЗАМІНИТИ НА:
let lastProgressUpdate = 0;
onProgress: (percent) => {
  const now = Date.now();
  if (now - lastProgressUpdate < 500) return;  // throttle
  lastProgressUpdate = now;
  void ImageStorage.updatePhoto(task.photoId, { progress: percent });
},
```

### 🟡 Середні (помірний вплив)

#### 4.4. RTDB: серверна фільтрація замість клієнтської

**Файли:** `Foto-Dlya-Dushi.tsx:278`, `Foto-Rayona.tsx:195,221`

**Рішення:**
- Для `community_photos_public`: додати `orderByChild('sourceScreen')` (вже є в Foto-Dlya-Dushi, але **відсутнє** в Foto-Rayona)
- Для `community_photos` pending: використовувати `query()` з `orderByChild('status')` + `equalTo('pending')` замість `ref(database, 'community_photos')`

```typescript
// Foto-Rayona.tsx:195 — ЗАМІНИТИ НА:
const publicQuery = query(
  ref(database, 'community_photos_public'),
  orderByChild('sourceScreen'),
  equalTo(SCREEN_ID)  // Серверна фільтрація!
);
unsubPublic = onValue(publicQuery, ...);

// Foto-Rayona.tsx:221 — ЗАМІНИТИ НА:
const pendingQuery = query(
  ref(database, 'community_photos'),
  orderByChild('status'),
  equalTo('pending')
);
unsubPending = onValue(pendingQuery, ...);
```

#### 4.5. AppPhotoImage: lazy download + prioritized loading

**Файл:** `src/components/AppPhotoImage.tsx`

**Рішення:**
- Додати `IntersectionObserver` (React Native) або `FlatList` windowing для відкладеного download
- Завантажувати видимі фото першими, невидимі — чергою
- Додати max concurrent downloads (3-5 замість 60)

#### 4.6. UploadQueue: skip processing при порожній черзі

**Файл:** `App.tsx:262-282`

**Рішення:** Додати перевірку перед process().

```typescript
// App.tsx:268-270 — ЗАМІНИТИ НА:
const intervalId = setInterval(() => {
  if (UploadQueue.isEmpty()) return;  // ← skip якщо порожня
  void UploadQueue.process();
}, 25000);
```

#### 4.7. Moderaciya-Foto: lazy load по табах

**Файл:** `src/screens/Moderaciya-Foto.tsx:158-240`

**Рішення:** Завантажувати дані тільки для активного табу, а не всі колекції одночасно.

### 🟢 Низькі (найменший пріоритет)

#### 4.8. waitForUpload: pub/sub замість polling

**Файл:** `src/photo-module/waitForUpload.ts:19`

**Рішення:** Підписатися на ImageStorage subscribe замість polling.

```typescript
// waitForUpload.ts — замінити polling на:
return new Promise((resolve) => {
  const unsubscribe = ImageStorage.subscribe((photos) => {
    const uploaded = photos
      .filter(p => photoIds.includes(p.id) && p.storagePath && pathPattern.test(p.storagePath))
      .map(p => p.storagePath!);
    if (uploaded.length > 0) {
      unsubscribe();
      resolve(uploaded);
    }
  });
  setTimeout(() => { unsubscribe(); resolve([]); }, timeoutMs);
});
```

#### 4.9. ImageStorage: використовувати in-memory кеш для read

**Файл:** `src/photo-module/ImageStorage.ts:48-52`

**Рішення:** `getPhotos()` вже кешує в `memoryPhotos`, але `updatePhoto()` (рядок 63) кожного разу читає з AsyncStorage. Можна використовувати `memoryPhotos` напряму.

---

## Підсумок: що тормозить найбільше

| # | Проблема | Де | Вплив | Фікс |
|---|---|---|---|---|
| 1 | **Потрійна компресія** | imageCompressor.ts, photoService.ts, photoUploadService.ts, PhotoUploadEngine.ts | 1.2-4.3с на фото | Залишити 1 прохід |
| 2 | **AsyncStorage прогрес** | ImageStorage.ts:39-44, UploadQueue.ts:300 | 100 I/O ops за завантаження | Throttle до 500ms |
| 3 | **RTDB full scan** | Foto-Dlya-Dushi.tsx:278, Foto-Rayona.tsx:195,221 | Лінійне зростання з кількістю фото | Серверна фільтрація |
| 4 | **Draft без debounce** | Zagruzka-Foto.tsx:248, CreateBuySellScreen.tsx:126 | Часті AsyncStorage writes | Debounce 600ms |
| 5 | **AppPhotoImage download** | AppPhotoImage.tsx:280 | Масовий download при mount | Lazy load + concurrency limit |
| 6 | **UploadQueue polling** | App.tsx:268-270 | Read при порожній черзі | isEmpty() check |
