# ПЛАН: Система оцінки функцій додатку Chaika Life

> Дата: 2026-06-09
> Статус: Чернетка
> Оцінка: 3-4 дні роботи

---

## Ціль

Дати власнику додатку реальну картину: які функції подобаються жителям, які дратують, і що покращувати першочергово. Дані збираються через мобільний додаток, аналітика — в адмін-панелі.

---

## Що вже є в проєкті (використовуємо повторно)

| Компонент | Файл | Що беремо |
|---|---|---|
| Зірковий рейтинг (UI) | `src/components/StarRatingModal.tsx` | Готовий 5-зірковий компонент, стилі, анімація |
| Логіка агрегації | `src/utils/monthlyRating.ts` | `addWeightedRating`, `replaceWeightedRating`, `canRateNow`, `RATING_COOLDOWN_MS` (30 днів) |
| Firebase API патерн | `src/firebase-config.ts` | Namespace-об'єкти, `ApiResult<T>`, `ensureFirebaseAuth()` |
| Адмін-панель роутинг | `admin-panel/src/App.tsx` | Hash-роутинг, `AdminPageKey`, `VALID_PAGES`, `renderPage()` |
| Кольори/розміри | `src/utils/constants.ts` | `COLORS.success`, `COLORS.warning`, `COLORS.error` |

---

## Архітектура рішення

### Firebase RTDB — структура даних

```
/feature_ratings/{screenId}/{userId}
  ├── rating: number (1-5)
  ├── comment: string | null
  ├── platform: "android" | "ios"
  ├── appVersion: string
  └── createdAt: number (timestamp)

/feature_ratings_summary/{screenId}
  ├── avgRating: number
  ├── totalVotes: number
  ├── monthlyAvg: number
  ├── monthlyVotes: number
  └── lastUpdated: number (timestamp)
```

**Чому `{userId}` як ключ, а не `{pushId}`:**
- `userId` як ключ = 1 запис на користувача на екран. Фізично неможливо поставити оцінку двічі — другий запис просто перезаписує перший
- `canRate()` = просто `data.exists()` → один read без сканування списку
- Firebase Rules тривіальні: `"$userId": { ".write": "$userId === auth.uid" }`
- Усуває race condition: два паралельних write на один ключ — виграє останній, не втрачається ні один запис
- userId не передається в тіло запису (зайве поле) — він вже є в ключі

**Чому двоярусна структура:**
- Адмін-панель читає ТІЛЬКИ `/feature_ratings_summary` — 1 запит, без сканування тисяч записів
- Коментарі завантажуються окремо по кліку на конкретний екран
- Summary оновлюється при кожній новій оцінці через multi-path update

**firebase.json — обов'язково додати індекс:**
```json
{
  "database": {
    "rules": ".read rules...",
    "indexes": {
      "feature_ratings": {
        "$screenId": {
          ".indexOn": ["createdAt"]
        }
      }
    }
  }
}
```
Без індексу `orderByChild('createdAt')` при 5000+ записів — повне сканування вузла (2-3 сек).

### Маппінг екранів (FEATURE_SCREEN_MAP)

```typescript
// src/utils/featureScreenMap.ts

// as const дозволяє отримати точні типи ключів
export const FEATURE_SCREEN_MAP = {
  'eda':           { ua: 'Їжа на Чайці',       ru: 'Еда на Чайке',       en: 'Food on Chaika' },
  'obyavleniya':   { ua: 'Оголошення',          ru: 'Объявления',          en: 'Announcements' },
  'deti':          { ua: 'Все для дітей',        ru: 'Всё для детей',       en: 'Everything for Kids' },
  'biznes':        { ua: 'Бізнес на Чайці',      ru: 'Бизнес на Чайке',     en: 'Business on Chaika' },
  'chat':          { ua: 'Онлайн чат',           ru: 'Онлайн чат',          en: 'Online Chat' },
  'novosti':       { ua: 'Новини Чайки',         ru: 'Новости Чайки',       en: 'Chaika News' },
  'salony':        { ua: 'Салони краси',          ru: 'Салоны красоты',      en: 'Beauty Salons' },
  'sport':         { ua: 'Спорт на Чайці',       ru: 'Спорт на Чайке',      en: 'Sports on Chaika' },
  'foto':          { ua: 'Фото району',          ru: 'Фото района',         en: 'District Photos' },
  'kuplu_prodam':  { ua: 'Куплю-Продам',         ru: 'Куплю-Продам',        en: 'Buy-Sell' },
  'karta':         { ua: 'Карта Чайки',          ru: 'Карта Чайки',         en: 'Chaika Map' },
  'osbb':          { ua: 'ОСББ',                 ru: 'ОСМД',                en: 'HOA' },
} as const;

// FeatureScreenId виводиться автоматично з ключів мапи
// TypeScript видасть помилку компіляції якщо передати невідомий screenId
export type FeatureScreenId = keyof typeof FEATURE_SCREEN_MAP;
```

---

## Етапи реалізації

---

### ЕТАП 1: Інфраструктура (Firebase + типи)

**Тривалість:** 2-3 години

#### 1.1 Тип `FeatureRating`

**Файл:** `src/types/app.ts` (або де зберігаються типи)

```typescript
// Ключі screenId — типізовані, не просто string
export type FeatureScreenId = keyof typeof FEATURE_SCREEN_MAP;

export type FeatureRating = {
  // userId НЕ зберігається в тілі — він є ключем вузла в RTDB
  screenId: FeatureScreenId;
  rating: number;       // 1-5
  comment: string | null;
  platform: 'android' | 'ios';
  appVersion: string;
  createdAt: number;
};

export type FeatureRatingSummary = {
  avgRating: number;
  totalVotes: number;
  monthlyAvg: number;
  monthlyVotes: number;
  lastUpdated: number;
};
```

#### 1.2 API в `firebase-config.ts`

**Файл:** `src/firebase-config.ts`

Додати namespace `featureRatingAPI` за існуючим патерном:

```typescript
export const featureRatingAPI = {

  /** Перевірити чи можна оцінити (1 раз на місяць на екран) */
  async canRate(screenId: FeatureScreenId): Promise<ApiResult<boolean>> {
    // ensureFirebaseAuth() → отримати uid
    // get /feature_ratings/{screenId}/{uid}
    // data.exists() → перевірити createdAt >= monthStart
    // Простий read одного вузла, без сканування
  },

  /** Відправити оцінку + оновити summary */
  async submitRating(screenId: FeatureScreenId, rating: number, comment?: string): Promise<ApiResult<void>> {
    // 1. ensureFirebaseAuth() → отримати uid
    // 2. Multi-path update (один атомарний запит):
    //    {
    //      [`feature_ratings/${screenId}/${uid}`]: { rating, comment, platform, appVersion, createdAt },
    //      [`feature_ratings_summary/${screenId}`]: recalculated summary
    //    }
    // 3. Для recalc: прочитати summary → replaceWeightedRating() якщо раніше вже оцінював
    //    АБО addWeightedRating() якщо перша оцінка
    // Примітка: multi-path update в RTDB гарантує що або обидва поля оновляться, або жодне
  },

  /** Отримати summary всіх екранів (для адмін-панелі) */
  async getAllSummaries(): Promise<ApiResult<Record<string, FeatureRatingSummary>>> {
    // get /feature_ratings_summary
  },

  /** Отримати останні коментарі для екрану (для адмін-панелі) */
  async getComments(screenId: string, limit?: number): Promise<ApiResult<FeatureRating[]>> {
    // query /feature_ratings/{screenId}, orderByChild('createdAt'), limitToLast(limit || 20)
  },
};
```

#### 1.3 Маппінг екранів

**Новий файл:** `src/utils/featureScreenMap.ts`

Константа `FEATURE_SCREEN_MAP` (див. вище) + хелпер:
```typescript
export const getScreenLabel = (screenId: string, lang: 'ua' | 'ru' | 'en'): string => {
  return FEATURE_SCREEN_MAP[screenId]?.[lang] ?? screenId;
};
```

---

### ЕТАП 2: Мобільний компонент оцінки

**Тривалість:** 3-4 години

#### 2.1 Компонент `FeatureRatingBanner`

**Новий файл:** `src/components/FeatureRatingBanner.tsx`

**Поведінка:**
- Inline-банер (НЕ модалка) внизу ScrollView екрану
- Показує 5 зірок в одну лінію + текст "Оцініть цей розділ"
- При натисканні зірки — розгортається поле коментаря + кнопка "Відправити"
- Після відправки — "Дякуємо!" на 2 сек → зникає

**Коли показувати:**
- Лічильник відвідувань екрану в AsyncStorage: `@chaika:screen_visits_{screenId}`
- Показувати банер після **3-го відвідування** за місяць
- Після відправки оцінки — не показувати 30 днів (використати існуючий `RATING_COOLDOWN_MS`)

**Props:**
```typescript
type FeatureRatingBannerProps = {
  screenId: FeatureScreenId;   // типізований — помилка компіляції при неправильному ID
};
```

Компонент сам:
- Визначає мову з Redux (`state.language.current`)
- Визначає userId з Redux (`state.auth.user`)
- Перевіряє canRate через `featureRatingAPI.canRate()`
- Трекає відвідування через AsyncStorage

#### 2.2 Інтеграція в екрани (Етап 1 — 5 екранів)

| Екран | Файл | screenId |
|---|---|---|
| Їжа на Чайці | `src/screens/Eda-Na-Chayke.tsx` | `eda` |
| Оголошення | `src/screens/Obyavleniya.tsx` | `obyavleniya` |
| Все для дітей | `src/screens/Vse-Dlya-Detey.tsx` | `deti` |
| Бізнес на Чайці | `src/screens/Bizznes-Chaika.tsx` | `biznes` |
| Онлайн чат | `src/screens/Onlayn-Chat.tsx` | `chat` |

**Що міняти в кожному екрані:**
```tsx
import { FeatureRatingBanner } from '../components/FeatureRatingBanner';

// В кінці ScrollView, перед закриваючим тегом:
<FeatureRatingBanner screenId="eda" />
```

Одна стрічка коду на екран. Вся логіка всередині компонента.

---

### ЕТАП 3: Адмін-панель — сторінка аналітики

**Тривалість:** 4-6 годин

#### 3.1 Нова сторінка `FeatureRatingsPage`

**Новий файл:** `admin-panel/src/pages/FeatureRatingsPage.tsx`

**Структура екрану:**

```
┌─────────────────────────────────────────────────┐
│  Оцінка функцій додатку                        │
│                                                 │
│  Загалом оцінок: 234   Середня: ⭐ 4.1          │
│  За останні 30 днів: 67 нових                   │
│                                                 │
│  [7 днів] [30 днів] [90 днів] [Все]   Фільтри  │
│                                                 │
│  ┌──────────────┬───────┬───────┬───────┬─────┐ │
│  │ Функція      │ Оцінка│ Голосі│ Тренд │  ⬤  │ │
│  ├──────────────┼───────┼───────┼───────┼─────┤ │
│  │ Їжа на Чайці │ 4.3   │ 45    │ +0.2↑ │ 🟢  │ │
│  │ Оголошення   │ 3.8   │ 32    │ -0.1↓ │ 🟡  │ │
│  │ Онлайн чат   │ 3.2   │ 28    │ +0.4↑ │ 🔴  │ │
│  │ Бізнес       │ 4.5   │ 18    │  0.0  │ 🟢  │ │
│  │ Все для дітей│ 4.1   │ 22    │ +0.1↑ │ 🟢  │ │
│  └──────────────┴───────┴───────┴───────┴─────┘ │
│                                                 │
│  ── Клік по рядку → ──                          │
│                                                 │
│  Останні коментарі: Їжа на Чайці               │
│  ┌─────────────────────────────────────────────┐│
│  │ ⭐⭐⭐⭐⭐ "Дуже зручно!" — 2026-06-08     ││
│  │ ⭐⭐⭐   "Додайте фільтр" — 2026-06-07    ││
│  │ ⭐⭐     "Не працює пошук" — 2026-06-05   ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Кольорова індикація (CSS):**
- `🟢` avgRating >= 4.0 → `#388E3C` (COLORS.success)
- `🟡` avgRating >= 3.5 && < 4.0 → `#FBC02D` (COLORS.warning)
- `🔴` avgRating < 3.5 → `#D32F2F` (COLORS.error)

#### 3.2 Реєстрація в роутингу

**Файл:** `admin-panel/src/App.tsx`

Зміни:
1. Додати `'feature_ratings'` в `AdminPageKey` (у `AppShell.tsx`)
2. Додати в `VALID_PAGES`
3. Додати в `PAGE_NAMES`: `feature_ratings: 'Оцінка функцій'`
4. Додати в `renderPage()`: `if (activePage === 'feature_ratings') return <FeatureRatingsPage />;`

#### 3.3 Сервіс для адмін-панелі

**Новий файл:** `admin-panel/src/services/featureRatingsService.ts`

```typescript
// Читає /feature_ratings_summary — для таблиці
export async function fetchAllSummaries(): Promise<Record<string, FeatureRatingSummary>>

// Читає /feature_ratings/{screenId} — для коментарів
export async function fetchComments(screenId: string, limit?: number): Promise<FeatureRating[]>
```

---

### ЕТАП 4: Розширення (ВІДКЛАДЕНО — після MVP)

Це НЕ робиться зараз. Список для майбутнього:

| Фіча | Коли робити |
|---|---|
| Графіки Recharts (по днях/місяцях) | Коли буде 500+ оцінок |
| Фільтр Android/iOS | Коли є 100+ оцінок з кожної платформи |
| Експорт CSV | За запитом |
| Розширення на всі 50+ екранів | Після тестування на 5 |
| Push-нагадування "оцініть додаток" | Ніколи (дратує) |
| NLP аналіз коментарів | Коли буде 1000+ коментарів |

---

## Файли для створення/зміни

### Нові файли (4)

| Файл | Опис |
|---|---|
| `src/utils/featureScreenMap.ts` | Маппінг screenId → назви (ua/ru/en) |
| `src/components/FeatureRatingBanner.tsx` | Inline-банер оцінки для екранів |
| `admin-panel/src/pages/FeatureRatingsPage.tsx` | Сторінка аналітики |
| `admin-panel/src/services/featureRatingsService.ts` | Сервіс читання даних |

### Зміни в існуючих файлах (8)

| Файл | Що змінюється |
|---|---|
| `src/firebase-config.ts` | + `featureRatingAPI` namespace |
| `src/screens/Eda-Na-Chayke.tsx` | + `<FeatureRatingBanner screenId="eda" />` |
| `src/screens/Obyavleniya.tsx` | + `<FeatureRatingBanner screenId="obyavleniya" />` |
| `src/screens/Vse-Dlya-Detey.tsx` | + `<FeatureRatingBanner screenId="deti" />` |
| `src/screens/Bizznes-Chaika.tsx` | + `<FeatureRatingBanner screenId="biznes" />` |
| `src/screens/Onlayn-Chat.tsx` | + `<FeatureRatingBanner screenId="chat" />` |
| `admin-panel/src/App.tsx` | + роутинг `feature_ratings` |
| `admin-panel/src/components/AppShell.tsx` | + `feature_ratings` в `AdminPageKey` |

---

## Обмеження та захист

| Правило | Реалізація |
|---|---|
| 1 оцінка на екран на місяць | `featureRatingAPI.canRate()` перевіряє `createdAt >= monthStart` |
| Тільки авторизовані | `ensureFirebaseAuth()` в API |
| Без накрутки | userId зберігається, перевірка серверна |
| Не дратувати користувача | Банер тільки після 3+ відвідувань, зникає на 30 днів |
| Коментар необов'язковий | `comment: string | null` |

---

## Залежності

- Нових npm-пакетів **НЕ ПОТРІБНО**
- Використовуються тільки існуючі: React Native, Firebase RTDB, AsyncStorage, Expo
- Адмін-панель: React + існуючі стилі

---

## Порядок виконання

```
Етап 1 (2-3 год) ──→ Етап 2 (3-4 год) ──→ Етап 3 (4-6 год)
  Firebase API          Мобільний банер       Адмін-панель
  Типи                  Інтеграція 5 екранів  Таблиця + коментарі
  Маппінг екранів
```

Етапи 1 і 3 можна робити паралельно (різні кодові бази).
Етап 2 залежить від Етапу 1 (потрібен API).
