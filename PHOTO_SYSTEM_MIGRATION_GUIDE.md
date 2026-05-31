# Техническое задание: Миграция системы загрузки фото на новую схему

**Версия:** 2.1
**Дата:** 2026-05-31
**Статус:** Утверждено

---

## ГЛАВНОЕ ПРАВИЛО

> **Перед тем как что-то делать — открой и прочитай `src/screens/Foto-Dlya-Dushi.tsx`.**
>
> Это единственный источник правды. Всё что написано в этом гайде — просто пересказ того, что там реализовано. Если гайд противоречит файлу — доверяй файлу.
>
> Все типы, логика, структура RTDB, принцип дедупликации, SoulTile, PhotoUploadField с metadata — всё это нужно брать оттуда напрямую и копировать без изменений, заменяя только `SCREEN_ID`, `STORAGE_PATH`, тексты и `sourceFeature`.

---

## 0. Перед началом

### 0.1 Тип задачи

**ЗАМЕНА** (на экране уже есть старая фото-система) → выполняй раздел 2, затем раздел 3.

**ДОБАВЛЕНИЕ** (на экране нет никакой фото-системы) → только раздел 3, раздел 2 пропускай.

### 0.2 Тип рендеринга экрана

| Тип экрана | Как рендерить сетку | Когда использовать |
|---|---|---|
| **Форма (ScrollView)** | Ручные ряды `<View style={{ flexDirection: 'row' }}>` | Экран с полями + submit |
| **Галерея (FlatList)** | FlatList с `numColumns={3}` | Экран — только фото |

**Почему нельзя FlatList внутри ScrollView:** React Native запрещает вложение двух прокручиваемых компонентов — FlatList не будет скроллиться внутри ScrollView.

**Этот гайд описывает вариант "Форма (ScrollView)".** Референс: `Forma-Zayavki.tsx`.

### 0.3 Что нужно знать про SCREEN_ID

Каждый экран получает уникальный `SCREEN_ID`. Это строка — ключ фильтрации в Firebase:

```
metadata.sourceScreen = SCREEN_ID
         ↓  (PhotoUploadField записывает в RTDB)
community_photos/{id}/sourceScreen = SCREEN_ID
         ↓  (Firebase query при загрузке)
orderByChild('sourceScreen').equalTo(SCREEN_ID)
         ↓
Показываем только фото этого экрана
```

**Если поставить одинаковый SCREEN_ID на двух экранах — они будут показывать одни и те же фото. Это может быть намеренно или быть багом. Следи за уникальностью.**

---

## 1. Параметры для конкретного экрана

**Заполни это перед началом работы:**

```
Название файла:     src/screens/_____________.tsx
SCREEN_ID:          '____________________'       (CamelCase, уникальный)
STORAGE_PATH:       '____________________'       (snake_case, папка в Storage)
sourceFeature:      '____________________'       (snake_case, напр. 'soul_photos_upload')
debugLabel prefix:  '____________________'       (напр. 'SoulPhoto', 'RequestPhoto')
logClientError tag: '____________________'       (напр. 'SoulPhotosScreen')
Заголовок секции:
  ua: '____________________'
  ru: '____________________'
  en: '____________________'
Текст "нет фото":
  ua: '____________________'
  ru: '____________________'
  en: '____________________'
```

**Готовые примеры:**

| Экран | SCREEN_ID | STORAGE_PATH | sourceFeature |
|---|---|---|---|
| Forma-Zayavki | `RequestFormScreen` | `community_photos` | `request_form_photo_upload` |
| Foto-Dlya-Dushi | `SoulPhotosScreen` | `community_photos` | `soul_photos_upload` |

---

## 2. Что удалять (только при ЗАМЕНЕ, полностью, без следов)

### 2.1 Импорты
```tsx
// УДАЛИТЬ:
import { getDonePhotos } from '../utils/submissionRequirements';
```

### 2.2 Тип FieldKey — убрать 'photos'
```tsx
// ДО:
type FieldKey = 'name' | 'phone' | 'helpType' | 'description' | 'photos';
// ПОСЛЕ:
type FieldKey = 'name' | 'phone' | 'helpType' | 'description';
```

### 2.3 State
```tsx
// УДАЛИТЬ:
const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
```

### 2.4 Вычисления
```tsx
// УДАЛИТЬ:
const donePhotos = useMemo(() => getDonePhotos(photos), [photos]);
const photosHaveError = photos.some((photo) => photo.status === 'error');
const photosUploading = photos.some((photo) => photo.status === 'uploading');
const photosReady = !photosHaveError && !photosUploading;
```

### 2.5 Ветка photos в fieldStates useMemo
```tsx
// УДАЛИТЬ эту ветку из return fieldStates:
const photosState: FieldState = photosHaveError
  ? { tone: 'error', message: t.photoUploadError }
  : photosUploading
    ? { tone: 'warning', message: t.photoUploadWait }
    : donePhotos.length > 0
      ? { tone: 'valid', message: t.photoReady }
      : { tone: 'idle', message: t.photoHint };
// И удалить: photos: photosState,
```

### 2.6 touched — убрать photos
```tsx
// В useState инициализации УДАЛИТЬ строку:
photos: false,
```

### 2.7 Валидация и данные в submit()
```tsx
// УДАЛИТЬ проверки в submit():
if (photosHaveError) {
  Alert.alert(t.errorTitle, t.photoError);
  return;
}
if (photosUploading) {
  Alert.alert(t.errorTitle, t.photoUploading);
  return;
}

// УДАЛИТЬ вычисление photoPayload:
const firstPhoto = donePhotos[0];
const photoPayload = firstPhoto ? { photoUri: firstPhoto.downloadUrl, photoStoragePath: firstPhoto.storagePath } : {};

// УДАЛИТЬ spread из firebaseChatAPI.addRequest():
...photoPayload,
```

### 2.8 Сброс после успеха
```tsx
// В блоке после Alert.alert(t.successTitle...) УДАЛИТЬ:
setPhotos([]);
```

### 2.9 Запись photos в touched (в markTouched-вызовах из PhotoUploadField)
```tsx
// Найти и удалить вызов типа:
if (nextPhotos.length > 0) markTouched('photos');
```

### 2.10 Чеклист — убрать photos
```tsx
// УДАЛИТЬ из массива checklist:
{ key: 'photos' as FieldKey, label: t.photo, state: fieldStates.photos, optional: true },
```

### 2.11 bannerState — убрать ветку bannerPhoto
```tsx
// УДАЛИТЬ условие:
if (requiredDone === 4 && !photosReady) {
  return { tone: fieldStates.photos.tone, message: t.bannerPhoto };
}
```

### 2.12 Текстовые ключи в TEXT_BY_LANG (во всех 3 языках)
```tsx
// УДАЛИТЬ из ua/ru/en:
photo: '...',
photoUploading: '...',
photoError: '...',
photoHint: '...',
photoReady: '...',
photoUploadWait: '...',
photoUploadError: '...',
bannerPhoto: '...',
```

### 2.13 JSX — старая фото-секция
```tsx
// УДАЛИТЬ весь блок:
<FieldHeader label={t.photo} state={fieldStates.photos} />
{hasUserId ? (
  <PhotoUploadField uid={user?.id ?? ''} ... onBeforePickerOpen={saveDraft} />
) : (
  <TouchableOpacity style={styles.authNotice} ...>
    ...
  </TouchableOpacity>
)}
<FieldMessage state={fieldStates.photos} />
```

### 2.14 Функция saveDraft (если использовалась только в onBeforePickerOpen)
```tsx
// УДАЛИТЬ если нигде больше не нужна:
const saveDraft = async () => {
  await AsyncStorage.setItem(...).catch(() => undefined);
};
```

### 2.15 Стили старой фото-секции
```tsx
// УДАЛИТЬ:
authNotice: { ... },
authNoticeText: { ... },
```

---

## 3. Что добавлять

> **Порядок важен.** Добавляй сверху вниз — сначала вне компонента, потом внутри.

### 3.1 Импорты

**Место:** верхушка файла, рядом с существующими.

```tsx
// Добавить memo, useCallback в React (если их ещё нет):
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

// Добавить useWindowDimensions в react-native (если нет):
import { ..., useWindowDimensions } from 'react-native';

// Новые импорты Firebase:
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database';
import { database } from '../firebase-core';

// Новые компоненты:
import AppPhotoImage from '../components/AppPhotoImage';

// Новые утилиты:
import { logClientError } from '../utils/errorLogger';
```

### 3.2 Типы

**Место:** сразу после импортов, рядом с другими типами.

```tsx
type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending';
  local?: boolean;
  uploading?: boolean;
  progress?: number;
};

type RawPhoto = {
  imageUri?: unknown;
  thumbnailUrl?: unknown;
  storagePath?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
  sourceScreen?: unknown;
  uid?: unknown;
  userId?: unknown;
};
```

### 3.3 Константы

**Место:** сразу после типов, рядом с другими `const`.

```tsx
// ⚠️ ЗАМЕНИТЬ значения под конкретный экран (см. раздел 1):
const SCREEN_ID = 'RequestFormScreen';
const STORAGE_PATH = 'community_photos';
const MAX_ITEMS = 60;
const NUM_COLUMNS = 3;
const GRID_GAP = 7;
```

### 3.4 PHOTO_UI_TEXT

**Место:** сразу после констант, отдельным блоком.

> ❌ **Поля "адреса місця" и "опис до 5 слів" — НЕ ДОБАВЛЯЕМ.**
> Из визуала нужны только две кнопки: "вибрати фото" и "відправити на модерацію".

```tsx
const PHOTO_UI_TEXT = {
  ua: {
    sectionTitle: 'Фото до заявки',   // ⚠️ заменить под экран
    pending: 'на модерації',
    upload: (p: number) => `завантаження ${p}%`,
    login: 'Увійдіться, щоб додати фото',
    send: 'Відправити на модерацію',
    sending: 'Фото вже на модерації',
    empty: 'Поки немає фото до заявок', // ⚠️ заменить под экран
  },
  ru: {
    sectionTitle: 'Фото к заявке',     // ⚠️ заменить под экран
    pending: 'на модерации',
    upload: (p: number) => `загрузка ${p}%`,
    login: 'Войдите, чтобы добавить фото',
    send: 'Отправить на модерацию',
    sending: 'Фото уже на модерации',
    empty: 'Пока нет фото к заявкам',  // ⚠️ заменить под экран
  },
  en: {
    sectionTitle: 'Photos for the request', // ⚠️ заменить под экран
    pending: 'in moderation',
    upload: (p: number) => `uploading ${p}%`,
    login: 'Sign in to add a photo',
    send: 'Submit for moderation',
    sending: 'Photo is in moderation',
    empty: 'No photos yet',             // ⚠️ заменить под экран
  },
} as const;
```

### 3.5 Вспомогательные функции

**Место:** до компонента, рядом с другими функциями-утилитами.

```tsx
const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const timestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const clampProgress = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};
```

> ❌ `limitWords` — НЕ ДОБАВЛЯЕМ (использовалась только для поля описания, которое не нужно).

### 3.6 SoulTile компонент

**Место:** до компонента экрана, после helper-функций.

```tsx
// ⚠️ В debugLabel заменить 'RequestPhoto' на имя экрана (см. раздел 1)
const SoulTile = memo(function SoulTile({
  item,
  size,
  pendingLabel,
  uploadLabel,
}: {
  item: SoulPhoto;
  size: number;
  pendingLabel: string;
  uploadLabel: (p: number) => string;
}) {
  const progress = clampProgress(item.progress ?? (item.uploading ? 0 : 100));
  const pending = item.status === 'pending';

  return (
    <View style={[styles.tile, pending ? styles.pendingTile : styles.approvedTile, { width: size, height: size }]}>
      {item.uri ? (
        <AppPhotoImage
          uri={item.uri}
          storagePath={item.storagePath}
          style={styles.tileImage}
          resizeMode="cover"
          debugLabel={`RequestPhoto:${item.id}`}  // ⚠️ заменить префикс
          showDebugInfo={false}
        />
      ) : (
        <View style={styles.grayExample} />
      )}

      {item.uploading ? (
        <View style={styles.uploadLayer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(7, progress)}%` }]} />
          </View>
          <Text style={styles.progressText}>{uploadLabel(progress)}</Text>
        </View>
      ) : null}

      {pending && !item.uploading ? (
        <View style={styles.pendingLabel}>
          <Text style={styles.pendingText}>{pendingLabel}</Text>
        </View>
      ) : null}
    </View>
  );
});
```

### 3.7 State в компоненте

**Место:** внутри компонента, рядом с другими `useState`.

```tsx
const [remotePhotos, setRemotePhotos] = useState<SoulPhoto[]>([]);
const [pickedPhotos, setPickedPhotos] = useState<Record<string, UploadedPhoto>>({});
const [photoLoading, setPhotoLoading] = useState(true);
```

> ❌ `photoDescription` и `photoAddress` — НЕ ДОБАВЛЯЕМ. Поля адреса и описания не нужны.

### 3.8 useWindowDimensions

**Место:** первая строка внутри компонента (до useState).

```tsx
const { width } = useWindowDimensions();
```

### 3.9 Переменная pt

**Место:** рядом с переменной `t` (объект текстов).

```tsx
const pt = PHOTO_UI_TEXT[language] ?? PHOTO_UI_TEXT.ua;
```

### 3.10 Firebase listener (useEffect)

**Место:** внутри компонента, после других `useEffect`.

```tsx
// ⚠️ Заменить 'RequestFormScreen.loadPhotos' и 'RequestFormScreen.firebase'
//    на имя своего экрана (см. раздел 1)
useEffect(() => {
  const photosQuery = query(
    ref(database, 'community_photos'),
    orderByChild('sourceScreen'),
    equalTo(SCREEN_ID),
  );
  const unsubscribe = onValue(
    photosQuery,
    (snapshot) => {
      try {
        const value = snapshot.val() as unknown;
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          setRemotePhotos([]);
          setPhotoLoading(false);
          return;
        }

        const currentUid = user?.id ?? '';
        const items = Object.entries(value as Record<string, unknown>)
          .map<SoulPhoto | null>(([id, raw]) => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
            const photo = raw as RawPhoto;
            const status = clean(photo.status);
            const owner = clean(photo.uid) || clean(photo.userId);
            const isApproved = status === 'approved';
            const isOwnPending = status === 'pending' && Boolean(currentUid) && owner === currentUid;
            if (!isApproved && !isOwnPending) return null;
            return {
              id,
              uri: clean(photo.thumbnailUrl) || clean(photo.imageUri),
              storagePath: clean(photo.storagePath),
              createdAt: timestamp(photo.createdAt) || timestamp(photo.uploadedAt),
              status: isApproved ? 'approved' : 'pending',
            };
          })
          .filter((item): item is SoulPhoto => item !== null)
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
          .slice(0, MAX_ITEMS);

        setRemotePhotos(items);
        setPhotoLoading(false);
      } catch (error) {
        void logClientError('RequestFormScreen.loadPhotos', error); // ⚠️ заменить
        setRemotePhotos([]);
        setPhotoLoading(false);
      }
    },
    (error) => {
      void logClientError('RequestFormScreen.firebase', error); // ⚠️ заменить
      setRemotePhotos([]);
      setPhotoLoading(false);
    },
  );

  return unsubscribe;
}, [user?.id]);
```

### 3.11 handlePhotosChange (useCallback)

**Место:** внутри компонента, после useEffect.

```tsx
const handlePhotosChange = useCallback((photos: UploadedPhoto[]) => {
  setPickedPhotos((current) => {
    const next = { ...current };
    for (const photo of photos) {
      if (photo.status === 'error') {
        delete next[photo.photoId];
      } else {
        next[photo.photoId] = photo;
      }
    }
    return next;
  });
}, []);
```

### 3.12 Мемо: data (объединение локальных + remote)

**Место:** внутри компонента, рядом с другими `useMemo`.

```tsx
const data = useMemo<SoulPhoto[]>(() => {
  const remotePaths = new Set(remotePhotos.map((photo) => photo.storagePath).filter(Boolean));
  const local = Object.values(pickedPhotos)
    .filter((photo) => !photo.storagePath || !remotePaths.has(photo.storagePath))
    .map<SoulPhoto>((photo) => ({
      id: photo.photoId,
      uri: photo.localUri || photo.thumbUri || photo.downloadUrl,
      storagePath: photo.storagePath,
      createdAt: Number.MAX_SAFE_INTEGER,
      status: 'pending',
      local: true,
      uploading: photo.status === 'uploading',
      progress: photo.progress,
    }));

  return [...local, ...remotePhotos].slice(0, MAX_ITEMS);
}, [pickedPhotos, remotePhotos]);
```

### 3.13 Вычисления UI

**Место:** после useMemo data, до JSX.

```tsx
const pendingCount = data.filter((photo) => photo.status === 'pending').length;
const hasUploadedLocal = Object.values(pickedPhotos).some((photo) => photo.status === 'done');

const gridPadding = 12;
const tileSize = useMemo(
  () => Math.floor((width - 32 - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
  [width],
);

const photoRows = useMemo(() => {
  const rows: SoulPhoto[][] = [];
  for (let i = 0; i < data.length; i += NUM_COLUMNS) {
    rows.push(data.slice(i, i + NUM_COLUMNS));
  }
  return rows;
}, [data]);
```

### 3.14 JSX — фото-секция

**Место:** в ScrollView, ПОСЛЕ `formCard` (или в конце контентного блока), ПЕРЕД закрывающим `</ScrollView>`.

> **Важно:** если `formCard` не имеет `marginBottom`, добавь `marginBottom: 14` чтобы была отбивка.

```tsx
<View style={styles.photoCard}>
  <Text style={styles.photoSectionTitle}>{pt.sectionTitle}</Text>

  {photoRows.length > 0 ? (
    photoRows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.photoRow}>
        {row.map((item) => (
          <SoulTile
            key={item.id}
            item={item}
            size={tileSize}
            pendingLabel={pt.pending}
            uploadLabel={pt.upload}
          />
        ))}
      </View>
    ))
  ) : (
    <View style={styles.photoEmpty}>
      {photoLoading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
      ) : (
        <>
          <MaterialCommunityIcons name="image-outline" size={38} color="#8D735A" />
          <Text style={styles.photoEmptyText}>{pt.empty}</Text>
        </>
      )}
    </View>
  )}

  {/* ❌ НЕ ДОБАВЛЯТЬ поля адреса и описания — только две кнопки ниже */}

  <View style={styles.uploadPanel}>
    {user ? (
      <View style={styles.realPickerWrap}>
        <PhotoUploadField
          uid={user.id}
          userName={user.name ?? user.email ?? ''}
          maxPhotos={1}
          storagePath={STORAGE_PATH}
          onPhotosChange={handlePhotosChange}
          hideSelectedPreview
          metadata={{
            title: pt.sectionTitle,
            sourceScreen: SCREEN_ID,
            sourceScreenLabel: pt.sectionTitle,
            sourceFeature: 'request_form_photo_upload', // ⚠️ заменить (см. раздел 1)
          }}
        />
      </View>
    ) : (
      <TouchableOpacity
        style={styles.loginButton}
        onPress={() => navigation.navigate('LoginScreen', {})}
        activeOpacity={0.82}
      >
        <MaterialCommunityIcons name="login" size={19} color="#fff" />
        <Text style={styles.actionText}>{pt.login}</Text>
      </TouchableOpacity>
    )}

    <TouchableOpacity
      style={[styles.photoSubmitButton, !hasUploadedLocal && styles.photoSubmitButtonDisabled]}
      disabled
      activeOpacity={0.86}
    >
      <Text style={styles.photoSubmitText}>
        {hasUploadedLocal || pendingCount > 0 ? pt.sending : pt.send}
      </Text>
    </TouchableOpacity>
  </View>
</View>
```

### 3.15 Стили

**Место:** в `StyleSheet.create`, в конце.

```tsx
photoCard: {
  borderRadius: 24,
  padding: 12,
  backgroundColor: '#FFF8EA',
  borderWidth: 1,
  borderColor: '#E4D0AB',
  gap: 8,
},
photoSectionTitle: {
  color: '#453321',
  fontSize: 18,
  fontWeight: '900',
  textAlign: 'center',
  marginBottom: 6,
},
photoRow: {
  flexDirection: 'row',
  gap: GRID_GAP,
  marginBottom: GRID_GAP,
},
tile: {
  borderRadius: 8,
  overflow: 'hidden',
  backgroundColor: '#858584',
},
approvedTile: {
  borderWidth: 1,
  borderColor: '#6F766B',
},
pendingTile: {
  borderWidth: 2,
  borderColor: '#22B14C',
},
tileImage: { width: '100%', height: '100%' },
grayExample: { width: '100%', height: '100%', backgroundColor: '#858584' },
uploadLayer: {
  position: 'absolute',
  left: 6,
  right: 6,
  bottom: 6,
  padding: 6,
  borderRadius: 8,
  backgroundColor: 'rgba(255,255,255,0.92)',
},
progressTrack: {
  height: 9,
  borderRadius: 999,
  overflow: 'hidden',
  backgroundColor: '#E5E0D2',
},
progressFill: {
  height: '100%',
  borderRadius: 999,
  backgroundColor: '#22B14C',
},
progressText: {
  marginTop: 4,
  color: '#21A347',
  fontSize: 12,
  fontWeight: '900',
  textAlign: 'center',
},
pendingLabel: {
  position: 'absolute',
  left: 5,
  right: 5,
  bottom: 5,
  minHeight: 24,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255,255,255,0.92)',
},
pendingText: {
  color: '#77746E',
  fontSize: 11,
  fontWeight: '900',
  textAlign: 'center',
},
photoEmpty: {
  minHeight: 120,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
},
photoEmptyText: {
  color: '#75684F',
  fontSize: 14,
  fontWeight: '900',
  textAlign: 'center',
},
// ❌ НЕ ДОБАВЛЯТЬ: descriptionRow, descriptionIcon, descriptionFields,
//    descriptionTitle, photoInput — они для полей адреса/описания, которые не нужны.

uploadPanel: {
  marginTop: 4,
  gap: 10,
},
realPickerWrap: {
  overflow: 'hidden',
},
loginButton: {
  minHeight: 52,
  borderRadius: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: '#C97959',
},
actionText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '900',
},
photoSubmitButton: {
  minHeight: 52,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#8FA77A',
},
photoSubmitButtonDisabled: { opacity: 0.66 },
photoSubmitText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '900',
  textAlign: 'center',
},
```

---

## 4. Чек-лист (порядок выполнения)

### Подготовка
- [ ] Заполнить таблицу параметров (раздел 1)
- [ ] Определить тип: ЗАМЕНА или ДОБАВЛЕНИЕ

### Вне компонента (сверху файла)
- [ ] Добавить импорты (3.1)
- [ ] Добавить типы SoulPhoto, RawPhoto (3.2)
- [ ] Добавить константы SCREEN_ID, STORAGE_PATH, etc. (3.3)
- [ ] Добавить PHOTO_UI_TEXT с заполненными текстами (3.4)
- [ ] Добавить функции clean, timestamp, clampProgress, limitWords (3.5)
- [ ] Добавить SoulTile компонент, заменить debugLabel (3.6)

### Внутри компонента
- [ ] Добавить useWindowDimensions (3.8)
- [ ] Добавить state (remotePhotos, pickedPhotos, photoDescription, photoAddress, photoLoading) (3.7)
- [ ] Добавить `const pt = ...` (3.9)
- [ ] Добавить Firebase listener useEffect, заменить logClientError строки (3.10)
- [ ] Добавить handlePhotosChange (3.11)
- [ ] Добавить useMemo data (3.12)
- [ ] Добавить вычисления UI (pendingCount, tileSize, photoRows) (3.13)

### Удаление старого (только ЗАМЕНА)
- [ ] Пройти пункты 2.1 — 2.15 сверху вниз

### JSX и стили
- [ ] Убедиться что formCard имеет marginBottom: 14
- [ ] Добавить фото-секцию JSX (3.14), заменить sourceFeature
- [ ] Добавить стили (3.15)

### Финальная проверка
- [ ] Запустить `npm run type-check` → 0 ошибок
- [ ] Проверить что SCREEN_ID уникален и не совпадает с другими экранами
- [ ] Протестировать: загрузить фото → проверить что появляется в сетке со статусом "на модерації"
- [ ] Протестировать: залогиниться/разлогиниться → кнопка должна меняться на "Увійдіться"

---

## 5. Частые ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| TypeScript TS6133 (unused variable) | Остался `saveDraft` или `photos` | Удалить (раздел 2.14, 2.3) |
| Фото не появляются в сетке | Неверный SCREEN_ID или нет поля в RTDB | Проверить SCREEN_ID совпадает с metadata.sourceScreen |
| Сетка не скроллится | FlatList внутри ScrollView | Использовать ручные ряды (текущий подход) |
| Тайлы перекрываются | Неверный tileSize | Проверить формулу: width - 32 (контент) - 24 (карточка) - 14 (гапы) |
| Фото дублируются | Дедупликация не работает | Проверить что storagePath заполнен в UploadedPhoto |
| `logClientError` не найден | Нет импорта | Добавить `import { logClientError } from '../utils/errorLogger'` |

---

## 6. Референсные файлы

| Приоритет | Файл | Роль |
|---|---|---|
| **1 — ГЛАВНЫЙ** | `src/screens/Foto-Dlya-Dushi.tsx` | Источник правды. Читай первым, копируй отсюда |
| 2 — пример | `src/screens/Forma-Zayavki.tsx` | Готовый пример применения в ScrollView-форме |

**Если что-то непонятно в гайде → открой `Foto-Dlya-Dushi.tsx` и смотри как там сделано.**

---

## 7. КРИТИЧЕСКИЙ УРОК: Как починили Форма-Заявки (2026-05-31)

> Экран не отображал превью фото после выбора из галереи. Проблема существовала ~месяц. Ниже — точные причины и как их диагностировать на других экранах.

### 7.1 Три причины поломки (по приоритету)

**Причина 1 — `onBeforePickerOpen` блокировал пикер**

```jsx
// ❌ СЛОМАНО — saveDraft вызывался внутри openPicker ДО открытия камеры
<RequestPhotoUploadField
  onBeforePickerOpen={saveDraft}   // ← это блокировало/прерывало поток
/>
```

`PhotoUploadField.openPicker()` делает `await onBeforePickerOpen?.()` без try/catch. Если колбэк бросает исключение или зависает — `Alert` с камерой/галереей **никогда не открывается**, либо состояние компонента разрушается до того, как фото добавляется в `selected`.

```jsx
// ✅ ПРАВИЛЬНО — автосохранение через debounced useEffect, не через колбэк
useEffect(() => {
  const timer = setTimeout(() => {
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({...})).catch(() => undefined);
  }, 600);
  return () => clearTimeout(timer);
}, [description, helpType, name, phone]);

// Поле без onBeforePickerOpen:
<RequestPhotoUploadField
  uid={user.id}
  userName={user?.name ?? ''}
  maxPhotos={1}
  onPhotosChange={setFormPhotos}
/>
```

---

**Причина 2 — `withGuard` обёртка на экране (только Форма-Заявки имела её)**

```jsx
// ❌ СЛОМАНО — только RequestFormScreen был обёрнут, ChaikaProblemsScreen — нет
<Stack.Screen name="RequestFormScreen" component={withGuard(RequestFormScreen, 'auth')} />
<Stack.Screen name="ChaikaProblemsScreen" component={ChaikaProblemsScreen} />
```

`GuardedScreen` подписывается на `isAuthenticated` / `isBootstrapped` из Redux. При возврате из нативной галереи Firebase `onAuthStateChanged` пересинхронизирует токен — это вызывает ре-рендер GuardedScreen с новым `children` элементом, что при определённых условиях уничтожает внутренний `selected` state компонента.

```jsx
// ✅ ПРАВИЛЬНО — убрать withGuard, экран сам управляет авторизацией через {user ? ...}
<Stack.Screen name="RequestFormScreen" component={RequestFormScreen} />
```

Форма-Заявки уже проверяет авторизацию: `{user?.id ? <PhotoField/> : null}` и `validateSubmissionRequirements()` на submit. Guard избыточен.

---

**Причина 3 — `key={photoResetKey}` создавал ненужный сброс**

```jsx
// ❌ СЛОМАНО — key привязан к useState, менялся при каждом submit
<RequestPhotoUploadField key={photoResetKey} ... />
```

`key` на компоненте = **принудительный ремонт**. Меняется key → теряется весь внутренний state (`selected`, прогресс). Рабочий экран Проблемы-Чайки не имел `key` вообще.

```jsx
// ✅ ПРАВИЛЬНО — без key. После успешного submit экран закрывается (goBack),
// поэтому сброс state происходит автоматически при размонтировании.
<RequestPhotoUploadField
  uid={user.id}
  userName={user?.name ?? ''}
  maxPhotos={1}
  onPhotosChange={setFormPhotos}
/>
```

---

### 7.2 Диагностический чеклист для других экранов

Если на экране фото не появляются в сетке после выбора — проверь по порядку:

| # | Что проверить | Где смотреть |
|---|---|---|
| 1 | Есть ли `onBeforePickerOpen` на `RequestPhotoUploadField` / `PhotoUploadField`? | JSX экрана |
| 2 | Обёрнут ли экран в `withGuard(...)` в `RootNavigator.tsx`? | `src/navigation/RootNavigator.tsx` |
| 3 | Есть ли `key={...}` на поле с фото? Меняется ли этот key? | JSX экрана |
| 4 | Гейтинг `{user?.id ? ...}` — может ли `user.id` быть `undefined`? | Redux user object |
| 5 | Пересобрано ли приложение после правок? (native app — Metro reload обязателен) | — |

### 7.3 Эталон — точный JSX для экрана с формой (ScrollView)

```jsx
// Копируй это для любого нового экрана с RequestPhotoUploadField:
{user?.id ? (
  <RequestPhotoUploadField
    uid={user.id}
    userName={user?.name ?? ''}
    maxPhotos={1}
    onPhotosChange={setFormPhotos}
  />
) : null}
```

Референс (рабочий, проверен на устройстве): `src/screens/Problemy-Chayki.tsx` строки 710–716.
