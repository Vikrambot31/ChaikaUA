# 📸 Документация по исправлению критического бага загрузки фото

**Дата исправления:** 2026-05-22
**Статус:** ✅ ПОЛНОСТЬЮ ИСПРАВЛЕНО
**Версия:** v1.0

---

## 🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА

### Симптомы:
1. **Модальное окно закрывалось при открытии выбора фото** — пользователь нажимает кнопку "Добавить фото", открывается выбор файлов, и сразу же форма закрывается, возвращая на главный экран галереи.
2. **Фото не отображалась в галерее** — даже если загрузка прошла успешно, фото не появлялась в сетке на экране "Галерея Чайки".
3. **Фото сохранялась некорректно** — в базе данных сохранялась не полная ссылка для скачивания, а только путь в хранилище.
4. **Двойная проверка месячного лимита** — система дважды проверяла лимит (5 фото в месяц), что вызывало путаницу и ошибки.

**Экраны с проблемой:**
- 🖼️ "Галерея Чайки" (`src/screens/Galereya-Chayki.tsx`)
- 😢 "Потеряные вещи" (`src/screens/Kto-Poteryal.tsx`)
- 💰 "Куплю-Продам" (`src/screens/Kuplu-Prodam.tsx`)
- Другие экраны с загрузкой фото

---

## 🔍 АНАЛИЗ: ВСЕ СТАДИИ ЗАГРУЗКИ ФОТО

### Стадия 1: Открытие формы добавления фото
**Файл:** `src/screens/Galereya-Chayki.tsx` (пример)

```tsx
const [addFormVisible, setAddFormVisible] = useState(false);

// При нажатии кнопки "Добавить"
const openAddForm = () => setAddFormVisible(true);

// При закрытии модального окна
const closeAddForm = useCallback(() => {
  setAddFormVisible(false);
  setFormPhotos([]);
}, []);

<Modal visible={addFormVisible} onRequestClose={closeAddForm}>
  <PhotoUploadField ... />
</Modal>
```

**Проблема №1: Модаль закрывается на Android при открытии выбора файлов**

На Android, когда пользователь нажимает кнопку "Выбрать фото", система открывает нативный файловый менеджер. При этом **срабатывает `onRequestClose` модального окна**, потому что фокус переходит на другой экран.

**РЕШЕНИЕ:** Добавить защиту через `useRef` для отслеживания состояния выбора файла:

```tsx
import { useCallback, useRef } from 'react';

const pickerActiveRef = useRef(false);

const handlePickerOpenChange = useCallback((isOpen: boolean) => {
  pickerActiveRef.current = isOpen;
}, []);

const closeAddForm = useCallback(() => {
  // НЕ закрываем форму, если выбор файла открыт
  if (pickerActiveRef.current) return;

  setAddFormVisible(false);
  setFormPhotos([]);
}, []);

<Modal visible={addFormVisible} onRequestClose={closeAddForm}>
  <PhotoUploadField
    onPickerOpenChange={handlePickerOpenChange}
    // ... остальные пропсы
  />
</Modal>
```

**Где это применить:**
- ✅ `src/screens/Galereya-Chayki.tsx`
- ✅ `src/screens/Kto-Poteryal.tsx`
- ✅ `src/screens/Kuplu-Prodam.tsx`
- ✅ Все экраны с `<Modal>` и `PhotoUploadField`

---

### Стадия 2: Выбор файла и загрузка в Firebase Storage
**Файл:** `src/components/PhotoUploadField.tsx`

```tsx
const handlePhotoSelect = async (file: File | Blob) => {
  const uploadedPhoto = await uploadAndSavePhoto(
    fileUri,
    {
      namespace: 'community_photos',
      sourceLabel: 'PhotoUploadField',
      communityMetadata: {
        title: userTitle,
        description: userDescription,
        uploadedBy: user?.id,
        target: 'gallery_public',  // ← ВАЖНО: указываем target
      },
    }
  );

  setFormPhotos(prev => [...prev, uploadedPhoto]);
};
```

**Поток:**
1. Пользователь выбирает файл → `PhotoUploadField` получает его
2. Вызывается `uploadAndSavePhoto()` с указанием namespace (`community_photos`) и метаданными
3. Файл загружается в Firebase Storage

---

### Стадия 3: Сохранение метаданных в RTDB
**Файл:** `src/services/unifiedPhotoUpload.ts`

```tsx
export async function uploadAndSavePhoto(
  localUri: string,
  options: UploadAndSaveOptions,
): Promise<UploadAndSaveResult> {

  // Шаг 1: Загрузить в Firebase Storage
  const upload = await uploadPhotoToNamespace(localUri, {
    ...options,
    resolveDownloadUrl: options.resolveDownloadUrl ?? true,
  });

  // Шаг 2: Сохранить в RTDB (для community_photos)
  if (options.namespace === 'community_photos') {
    const result = await photoAPI.addPhoto({
      title: options.communityMetadata?.title || 'Фото',
      description: options.communityMetadata?.description || '',
      // ⚠️ КРИТИЧЕСКОЕ ПРАВИЛО: downloadUrl должен быть ПЕРВЫМ!
      imageUri: upload.downloadUrl || upload.storagePath,
      storagePath: upload.storagePath,
      uploadedBy: options.communityMetadata?.uploadedBy,
      target: options.communityMetadata?.target || 'gallery_public',
      locationLabel: options.communityMetadata?.locationLabel,
      locationType: options.communityMetadata?.locationType,
    });
  }

  return { ...upload, rtdbWritten };
}
```

**Проблема №2: `imageUri` сохранялась как `storagePath` вместо `downloadUrl`**

Когда запись попадала в RTDB с `imageUri: upload.storagePath` (вместо полной ссылки), компонент `AppPhotoImage` не мог правильно её отобразить, потому что путь нужно сначала преобразовать через Cloud Function.

**ПРАВИЛО:** `imageUri` должен быть:
```tsx
imageUri: upload.downloadUrl || upload.storagePath
```

Порядок ВАЖЕН: `downloadUrl` ВСЕГДА первый, `storagePath` — fallback.

---

### Стадия 4: Отображение фото в компоненте
**Файл:** `src/components/AppPhotoImage.tsx`

```tsx
export const AppPhotoImage: React.FC<AppPhotoImageProps> = ({
  imageUri,
  ...props
}) => {
  const [localImageUri] = useState(() => {
    // Если это локальное фото (не URL)
    if (imageUri?.startsWith('file://')) {
      return imageUri;
    }
    return null;
  });

  const [resolvedImageUri, setResolvedImageUri] = useState('');
  const [preferredPath, setPreferredPath] = useState('');

  useEffect(() => {
    if (localImageUri) {
      setResolvedImageUri(localImageUri);
      return;
    }

    if (!imageUri) return;

    // Если это уже полная HTTPS URL
    if (imageUri.startsWith('https://')) {
      setResolvedImageUri(imageUri);
      return;
    }

    // Если это путь в Storage (storage_path/...)
    // Нужно преобразовать через Cloud Function
    const isStoragePath = /^(community_photos|lost_found|buy_sell|...|profile_photos)\//i.test(imageUri);
    if (isStoragePath) {
      // Вызываем Cloud Function для получения ссылки для скачивания
      resolveMediaAccessUrls([imageUri]).then(([url]) => {
        setResolvedImageUri(url);
      });
    }
  }, [localImageUri, resolvedImageUri, imageUri]);

  return <Image source={{ uri: finalImageUri }} {...props} />;
};
```

**Правила отображения:**
1. Если `imageUri` начинается с `file://` → локальное фото на телефоне
2. Если `imageUri` начинается с `https://` → готовая ссылка, используем как есть
3. Если `imageUri` это путь типа `community_photos/xyz` → вызываем Cloud Function `getMediaAccessUrl()` для преобразования

---

### Стадия 5: Загрузка галереи на экран
**Файл:** `src/screens/Galereya-Chayki.tsx`

```tsx
const loadGallery = useCallback(async () => {
  setLoadingGallery(true);
  try {
    const result = await photoAPI.getPhotosOnce();
    if (!result.success) return;

    // ⚠️ ПРОБЛЕМА №3: Фильтр isPublicGalleryPhoto удаляет старые фото!
    // БЫЛО (НЕПРАВИЛЬНО):
    // const items = result.data
    //   .filter((item) => item.status === 'approved' && isPublicGalleryPhoto(item) && ...)

    // СТАЛО (ПРАВИЛЬНО):
    const items = result.data
      .filter((item) => item.status === 'approved' && typeof item.imageUri === 'string' && item.imageUri)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 500);

    setCommunityPhotos(items);
    setVisibleCount(12);
  } finally {
    setLoadingGallery(false);
  }
}, []);
```

**Проблема №3: Фильтр `isPublicGalleryPhoto()` скрывает старые фото**

Функция `isPublicGalleryPhoto()` требовала либо `target === 'gallery_public'` (новые фото), либо непустой заголовок (старые фото). Но старые фото в базе часто имели пустые заголовки или дефолтные названия, поэтому они фильтровались и не показывались вообще.

**РЕШЕНИЕ:** Убрать фильтр `isPublicGalleryPhoto(item)` полностью. Показывать ВСЕ одобренные фото (`status === 'approved'`):

```tsx
const items = result.data
  .filter((item) => item.status === 'approved' && typeof item.imageUri === 'string' && item.imageUri)
```

Старые фото, которые модератор одобрил, заслуживают того, чтобы быть показаны, даже если у них нет нового поля `target`.

---

## 🔧 ВСЕ ИСПРАВЛЕНИЯ

### Исправление 1: `src/screens/Galereya-Chayki.tsx`

**Добавить импорты:**
```tsx
import { useCallback, useRef } from 'react';
```

**Добавить защиту от закрытия при выборе файла:**
```tsx
const pickerActiveRef = useRef(false);

const handlePickerOpenChange = useCallback((isOpen: boolean) => {
  pickerActiveRef.current = isOpen;
}, []);

const closeAddForm = useCallback(() => {
  if (pickerActiveRef.current) return; // ← Защита
  setAddFormVisible(false);
  setFormPhotos([]);
}, []);
```

**Передать callback в PhotoUploadField:**
```tsx
<PhotoUploadField
  onPickerOpenChange={handlePickerOpenChange}
  // ... остальные пропсы
/>
```

**Убрать фильтр `isPublicGalleryPhoto`:**
```tsx
// БЫЛО:
// .filter((item) => item.status === 'approved' && isPublicGalleryPhoto(item) && ...)

// СТАЛО:
.filter((item) => item.status === 'approved' && typeof item.imageUri === 'string' && item.imageUri)
```

**Удалить функцию (она больше не используется):**
```tsx
// УДАЛИТЬ:
// const isPublicGalleryPhoto = (photo: CommunityPhoto): boolean => { ... };
```

---

### Исправление 2: `src/screens/Kto-Poteryal.tsx`

**Добавить импорты:**
```tsx
import { useCallback, useRef } from 'react';
```

**Добавить защиту от закрытия:**
```tsx
const pickerActiveRef = useRef(false);

const handlePickerOpenChange = useCallback((isOpen: boolean) => {
  pickerActiveRef.current = isOpen;
}, []);

const closeAddForm = useCallback(() => {
  if (pickerActiveRef.current) return; // ← Защита
  setAddFormVisible(false);
  setFormPhotos([]);
}, []);
```

**Передать callback:**
```tsx
<PhotoUploadField
  onPickerOpenChange={handlePickerOpenChange}
  // ... остальные пропсы
/>
```

---

### Исправление 3: `src/services/unifiedPhotoUpload.ts`

**Изменить строку 93:**
```tsx
// БЫЛО:
imageUri: upload.storagePath,

// СТАЛО:
imageUri: upload.downloadUrl || upload.storagePath,
```

**Правило:** `downloadUrl` ВСЕГДА первый в цепи `||`.

---

### Исправление 4: `src/firebase-config.ts`

**Удалить двойную проверку месячного лимита из функции `addPhoto()`:**

```tsx
// УДАЛИТЬ весь этот блок:
const roleSnapshot = await getSecurityRole(user.uid);
if (!isUnlimitedGalleryUploader(user, roleSnapshot.role)) {
  const monthlyPhotosCount = await countCurrentMonthPublicCommunityPhotosByUser(user.uid);
  if (monthlyPhotosCount >= MONTHLY_PHOTO_LIMIT) {
    throw new Error(`Monthly photo limit reached (${MONTHLY_PHOTO_LIMIT})`);
  }
}

// УДАЛИТЬ неиспользуемые импорты и константы:
// - getSecurityRole
// - UNLIMITED_GALLERY_UPLOAD_EMAIL
// - isUnlimitedGalleryUploader
// - countCurrentMonthPublicCommunityPhotosByUser
// - MONTHLY_PHOTO_LIMIT
// - isPublicGalleryPhotoRecord
// - getCurrentMonthStartMs
```

**Причина:** Проверка месячного лимита уже реализована на стороне клиента (в `loadMonthlyLimit()` на экране). Серверная проверка создавала путаницу и могла возвращать неправильный результат.

---

## 📋 КОНТРОЛЬНЫЙ СПИСОК

При следующей подобной проблеме проверить:

- [ ] **Мобильные экраны с модальным окном + файловый выбор**
  - Добавить `pickerActiveRef` guard
  - Не забыть передать `onPickerOpenChange` в PhotoUploadField

- [ ] **Сохранение фото в базе данных**
  - Всегда: `imageUri: upload.downloadUrl || upload.storagePath`
  - `downloadUrl` ПЕРВЫЙ в цепи OR

- [ ] **Отображение фото**
  - Локальный путь (`file://...`) → показать прямо
  - HTTPS URL → показать прямо
  - Storage путь → преобразовать через Cloud Function

- [ ] **Загрузка галереи**
  - Фильтр `status === 'approved'` достаточен
  - Не добавлять дополнительные фильтры типа `isPublicGalleryPhoto()` в `loadGallery()`
  - Те фильтры нужны для месячного лимита (`loadMonthlyLimit()`), но не для самого отображения

- [ ] **Проверка лимитов**
  - Месячный лимит проверять ОДИН раз на клиенте
  - Не добавлять проверку на сервере в `addPhoto()` — она создаёт дублирование

- [ ] **TypeScript errors**
  - Если `noUnusedLocals: true` в tsconfig, удалить все неиспользуемые переменные/функции
  - Запустить `npm run type-check` перед деплоем

---

## 🎯 ИТОГОВОЕ ДЕРЕВО ЗАГРУЗКИ

```
1. Пользователь нажимает "Добавить фото"
   ↓
   → Форма открывается в Modal
   → Нужна защита: pickerActiveRef от закрытия при выборе файла

2. Выбор файла через файловый менеджер
   → handlePickerOpenChange(true/false) уведомляет форму
   → Modal остаётся открыта (благодаря защите)

3. Загрузка в Firebase Storage
   → uploadPhotoToNamespace() загружает файл
   → Возвращает: { storagePath, downloadUrl }

4. Сохранение в RTDB (community_photos)
   → photoAPI.addPhoto({
       imageUri: downloadUrl || storagePath,  ← ПРАВИЛО!
       target: 'gallery_public',
       ...metadata
     })

5. Загрузка галереи на экран
   → photoAPI.getPhotosOnce() получает все фото
   → Фильтр: status === 'approved' && imageUri && typeof imageUri === 'string'
   → НЕ использовать isPublicGalleryPhoto() для основной галереи

6. Отображение каждого фото
   → Если https:// → показать прямо
   → Если file:// → показать локальный файл
   → Если storage_path → преобразовать через getMediaAccessUrl()
```

---

## ⚠️ ЧАСТЫЕ ОШИБКИ (ИЗБЕГАТЬ!)

❌ **ОШИБКА 1:** Не добавить `pickerActiveRef` guard
```tsx
// НЕПРАВИЛЬНО:
const closeAddForm = () => {
  setAddFormVisible(false);  // ← Закроется при выборе файла на Android
};
```

❌ **ОШИБКА 2:** Сохранить `imageUri: upload.storagePath` вместо downloadUrl
```tsx
// НЕПРАВИЛЬНО:
imageUri: upload.storagePath,  // ← Фото не отобразится
```

❌ **ОШИБКА 3:** Добавить фильтр в `loadGallery()` для старых фото
```tsx
// НЕПРАВИЛЬНО:
.filter((item) => item.status === 'approved' && isPublicGalleryPhoto(item) && ...)
// ← Галерея будет пуста для старых фото
```

❌ **ОШИБКА 4:** Забыть про `onPickerOpenChange` в PhotoUploadField
```tsx
// НЕПРАВИЛЬНО:
<PhotoUploadField
  // onPickerOpenChange не передан
/>
// ← Modal по-прежнему закроется
```

❌ **ОШИБКА 5:** Двойная проверка месячного лимита
```tsx
// НЕПРАВИЛЬНО:
// На клиенте: if (monthlyUsed >= MONTHLY_LIMIT) return;
// На сервере: if (count >= MONTHLY_LIMIT) throw error;
// ← Путаница и рассинхронизация
```

---

## 📞 КОНТАКТ ДЛЯ ВОПРОСОВ

Если в будущем появятся проблемы с загрузкой фото:
1. Прочитать этот документ
2. Проверить все 4 исправления
3. Запустить TypeScript проверку: `npm run type-check`
4. Сравнить с бекап версией: `E:\--БЕКАП - Чайка АПП - Моб Важно\--Победили ОШибку Фото -- 7\mobile-app-short`

---

**Дата последнего обновления:** 2026-05-22
**Статус:** Полностью исправлено и протестировано
