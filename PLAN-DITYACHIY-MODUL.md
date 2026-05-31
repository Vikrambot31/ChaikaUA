# План розробки — Екран "Все для дітей" (Children Hub)

## Аналіз поточного стану

**Що є зараз:**
- Школи (9) та садочки (10) існують як прості `Place` — тільки назва, адреса, координати
- **Немає** цін, описів, фото, віку, програми, робочих годин, телефонів
- **Немає** подій, акцій, промо-функціоналу
- **Немає** рейтингів для шкіл/садків (`rating: false`)
- Немає жодного дитячого екрану або централізованих перекладів
- Два паралельних джерела даних (статичний `chaykaPlacesData.ts` + API/Redux)

**Джерела:**
- `src/types/app.ts` — `PlaceType.SCHOOL`, `PlaceType.KINDERGARTEN`
- `src/services/chaykaPlacesData.ts` — статичні дані (9 шкіл, 10 садків)
- `src/screens/Mesta-Chayki.tsx` — секційний екран із розділами шкіл/садків
- `src/screens/Spisok-Mest.tsx` — список місць з фільтрами
- `src/screens/Panel-Detaley-Mesta.tsx` — простий модал деталей місця

---

## Концепція екрану "Все для дітей" / Children Hub

Новий **хаб** (не таб, щоб не перевантажувати навігацію), присвячений дітям та дитячим послугам у районі Чайка.

---

## 1. Структура екрану

```
┌─────────────────────────────────────┐
│  🔍 Пошук по дитячих закладах       │
├─────────────────────────────────────┤
│  [Дитсадки] [Школи] [Спорт] [Медицина]│
│  [Розвиток] [Безпека] [Мероприятия] │
│  [Акції] [Новинки]                  │ ← категорії-чіпси
├─────────────────────────────────────┤
│  ⭐ ПРЕМІУМ-пропозиції (карусель)   │ ← REVENUE #1
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │Садочок│ │Школа │ │Центр │         │
│  │   -20%│ │  без │ │розвит│         │
│  │       │ │  кошт│ │  ку  │         │
│  └─────┘ └─────┘ └─────┘           │
├─────────────────────────────────────┤
│  🎯 Актуальні акції та пропозиції    │ ← REVENUE #2
│  ┌─────────────────────────────────┐│
│  │ 🏫 Садочок "Сонечко"           ││
│  │ 🔥 Знижка 30% на вступ до       ││
│  │    31 травня                    ││
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  📅 Найближчі заходи               │ ← REVENUE #3
│  • 01.06 - День захисту дітей       │
│  • 05.06 - Відкритий урок          │
│  • 10.06 - Спортивне свято         │
├─────────────────────────────────────┤
│  🆕 Новинки (нові заклади/послуги) │
├─────────────────────────────────────┤
│  🗺️ Карта дитячих місць поруч      │
└─────────────────────────────────────┘
```

---

## 2. Ключові функції та кнопки

| Функція | Опис | Користь для мешканця |
|---|---|---|
| **Категорії** | Чіпси-фільтри (садки, школи, спорт, медицина, безпека, розвиток, івенти, акції) | Швидкий доступ до потрібного |
| **Преміум-карусель** | Платні виділені картки закладів | Бачить найкращі пропозиції |
| **Акції** | Стрічка знижок та спецпропозицій | Економія на освіті/розвитку |
| **Календар подій** | Список найближчих дитячих заходів | Планування дозвілля |
| **Карта** | Всі дитячі місця на карті | Який садок/школа найближче |
| **Детальна сторінка** | Фото, опис, ціни, вікові групи, програма, відгуки, контакти | Вся інформація в одному місці |
| **Фільтри** | За віком дитини, типом, ціною, рейтингом, відстанню | Точний підбір |
| **Вибране** | Збереження улюблених закладів | Швидке порівняння |
| **Замовлення дзвінка** | Запит на зворотній зв'язок від закладу | Зручний контакт |
| **Відгуки та рейтинг** | Оцінки батьків | Довіра до закладу |

---

## 3. Модель даних (розширення Place)

```typescript
// Нові типи для дитячого модуля
interface ChildrenPlace extends Place {
  ageFrom: number;
  ageTo: number;
  description: string;
  curriculum: string[];
  photos: string[];
  priceRange: { min: number; max: number; period: 'month' | 'year' | 'once' };
  workingHours: string;
  phone: string;
  website: string;
  socialLinks: { instagram?: string; facebook?: string; telegram?: string };
  features: string[];
  safety: SafetyInfo;
  medical: MedicalInfo;

  // Комерційні поля
  isPromoted: boolean;
  promotionExpiresAt: number;
  subscriptionTier: 'free' | 'basic' | 'premium' | 'vip';
}

interface SafetyInfo {
  hasVideoSurveillance: boolean;
  hasSecurityGuard: boolean;
  hasFireSafety: boolean;
  hasShelter: boolean;
  accessControl: 'free' | 'intercom' | 'card' | 'biometric';
}

interface MedicalInfo {
  hasNurse: boolean;
  hasDoctor: boolean;
  nearbyHospital: string;
  emergencyProtocol: boolean;
  hasAllergyManagement: boolean;
}

// Події та акції
interface ChildrenEvent {
  id: string;
  placeId: string;
  title: string;
  description: string;
  dateFrom: number;
  dateTo: number;
  time: string;
  ageGroup: string;
  price?: number;
  isFree: boolean;
  type: 'event' | 'promotion' | 'open_day' | 'workshop' | 'sport' | 'holiday';
  photos: string[];
  isPremium: boolean;
}

interface Promotion {
  id: string;
  placeId: string;
  title: string;
  description: string;
  discountPercent?: number;
  discountAmount?: number;
  validFrom: number;
  validTo: number;
  isPremium: boolean;
  featured: boolean;
}
```

---

## 4. Монетизація (Revenue Model)

| # | Джерело доходу | Опис | Ціна (орієнтовно) |
|---|---|---|---|
| 1 | **Преміум-розміщення** | Карусель "Рекомендуємо" на головній екрану | 500-1500 грн/міс |
| 2 | **Платні акції** | Стрічка акцій з позначкою "🔥" | 300-800 грн/акція |
| 3 | **Розширений профіль** | Фото, відео, відгуки, програма | 200-500 грн/міс |
| 4 | **Підписка для закладів** | Пакети: Basic / Premium / VIP | 300/1000/2500 грн/міс |
| 5 | **Лідогенерація** | Кнопка "Замовити дзвінок" (pay-per-lead) | 20-50 грн/лід |
| 6 | **Тематичні банери** | Медицина, спорт, безпека | 1000-3000 грн/міс |
| 7 | **Партнерські публікації** | Огляди/статті про заклади | 500-2000 грн/публікація |

---

## 5. План розробки (Roadmap)

### ФАЗА 1 — Фундамент (1-2 тижні)
- Розширення TypeScript типів:
  - `ChildrenPlace`, `SafetyInfo`, `MedicalInfo`
  - `ChildrenEvent`, `Promotion`
  - `childrenSubscriptionTier` enum
  - Поновлення `PlaceType` (CLUB, DEVELOPMENT, SPORT, MEDICAL)
- Firebase Realtime Database — нові вузли:
  - `/children_places/{id}`
  - `/children_events/{id}`
  - `/children_promotions/{id}`
  - `/children_subscriptions/{placeId}`
- Redux slices:
  - `childrenPlacesSlice.ts`
  - `childrenEventsSlice.ts`
  - `childrenPromotionsSlice.ts`
- Сервіси (Firebase API):
  - `childrenPlacesService.ts`
  - `childrenEventsService.ts`
  - `childrenPromotionsService.ts`
- Хуки:
  - `useChildrenPlaces.ts`
  - `useChildrenEvents.ts`
  - `useChildrenPromotions.ts`

### ФАЗА 2 — Екран "Все для дітей" (1-2 тижні)
- Створення екрану:
  - `Dityachiy-Modul.tsx` (або `ChildrenScreen.tsx`)
  - Реєстрація у `RootNavigator.tsx`
  - Додавання до Hub-екрану (`Mistsa-i-Lyudi-Hub.tsx`) або нового хабу
- Компоненти:
  - `children/ChildrenCategoryChips.tsx` — категорії
  - `children/PromotedCarousel.tsx` — преміум-карусель
  - `children/EventCard.tsx` — картка події
  - `children/PromotionCard.tsx` — картка акції
  - `children/ChildrenPlaceCard.tsx` — розширена картка
  - `children/AgeFilter.tsx` — фільтр за віком
- Екран категорії:
  - `ChildrenCategoryScreen.tsx` — всі заклади категорії
  - Фільтри (вік, ціна, рейтинг, відстань)
- Детальна сторінка закладу:
  - `ChildrenPlaceDetailScreen.tsx`
  - Галерея фото (swiper)
  - Вкладки: Про заклад / Програми / Ціни / Відгуки
  - Карта
  - Кнопки: Зателефонувати / Замовити дзвінок / Сайт / Написати

### ФАЗА 3 — Події та акції (1 тиждень)
- `ChildrenEventsScreen.tsx` — календар/стрічка подій
- `ChildrenEventDetailScreen.tsx` — деталі події
- Додавання події (для закладів)
- `ChildrenPromotionsScreen.tsx` — всі акції
- `ChildrenPromotionDetailScreen.tsx` — деталі акції

### ФАЗА 4 — Карта та геолокація (3-5 днів)
- Дитячі місця на головній карті (фільтр)
- `ChildrenMapScreen.tsx` — окрема карта
- Кластеризація маркерів

### ФАЗА 5 — Вибране та взаємодія (3-5 днів)
- Favorites — збереження в Redux persist
- Порівняння закладів (опціонально)
- Запит на дзвінок/контакт (лідогенерація)
- Система відгуків (обмежена — тільки верифіковані батьки)

### ФАЗА 6 — Кабінет закладу (2-3 тижні) — REVENUE ENGINE
- `OwnerDashboardScreen.tsx`:
  - Статистика (перегляди, кліки, ліди)
  - Керування профілем (редагування)
  - Додавання/редагування подій
  - Додавання/редагування акцій
  - Завантаження фото
  - Відповіді на відгуки
  - Оформлення підписки
  - Аналітика ефективності
- Firebase Functions:
  - `createChildrenPromotion`
  - `activateChildrenSubscription`
  - `trackChildrenLead`

### ФАЗА 7 — Адмін-панель (веб) (1-2 тижні)
- Модерація закладів
- Модерація подій/акцій
- Керування підписками
- Фінансова звітність

### ФАЗА 8 — i18n (1-2 дні)
- Додати всі переклади до `translations.ts`:
  - "Діти", "Садочки", "Школи", ...
  - "Акції", "Події", "Знижки", ...
  - Вікові групи, типи занять

---

## 6. UI/UX дизайн-концепція

**Кольорова гама (дитяча тема):**
- Основний: теплий жовто-помаранчевий `#FFB347` або м'ятний `#7EC8E3`
- Акцент: рожевий `#FF6B9D` або бірюзовий `#48C9B0`
- Існуючі кольори з `SCREEN_THEME` (linenOlive, woodGreen) також підходять

**Іконки (MaterialCommunityIcons):**
| Секція | Іконка |
|---|---|
| Садочки | `baby-face-outline` / `human-male-board` |
| Школи | `school-outline` |
| Спорт | `basketball` / `soccer` |
| Медицина | `medical-bag` / `hospital-box-outline` |
| Безпека | `shield-check` |
| Розвиток | `brain` / `puzzle` |
| Події | `calendar-star` |
| Акції | `sale` / `brightness-percent` |
| Новинки | `new-box` |

**Анімації:**
- Дитячі іконки "стрибають" при скролі (spring animation)
- Карусель з авто-прокруткою
- Lottie-анімації для порожніх станів

---

## 7. Які файли змінити

**Існуючі файли для модифікації:**
| Файл | Зміни |
|---|---|
| `src/types/app.ts` | Додати `ChildrenPlace`, `SafetyInfo`, `MedicalInfo`, `ChildrenEvent`, `Promotion` |
| `src/redux/store.ts` | Додати нові slices |
| `src/navigation/RootNavigator.tsx` | Додати нові екрани |
| `src/i18n/translations.ts` | Додати всі переклади (діти, садочки, школи, акції, події тощо) |
| `src/utils/screenTheme.ts` | Можливо, додати дитячі кольори |
| `firebase.rules.json` | Правила для нових вузлів |
| `Mistsa-i-Lyudi-Hub.tsx` | Додати картку "Все для дітей" |

**Нові файли (структура `src/children/`):**

```
src/children/
├── screens/
│   ├── Dityachiy-Modul.tsx          # Головний хаб
│   ├── ChildrenCategoryScreen.tsx   # Екран категорії
│   ├── ChildrenPlaceDetailScreen.tsx # Деталі закладу
│   ├── ChildrenEventsScreen.tsx     # Стрічка подій
│   ├── ChildrenEventDetailScreen.tsx # Деталі події
│   ├── ChildrenPromotionsScreen.tsx # Стрічка акцій
│   ├── ChildrenMapScreen.tsx        # Карта
│   └── OwnerDashboardScreen.tsx     # Кабінет закладу
├── components/
│   ├── ChildrenCategoryChips.tsx
│   ├── PromotedCarousel.tsx
│   ├── EventCard.tsx
│   ├── PromotionCard.tsx
│   ├── ChildrenPlaceCard.tsx
│   └── AgeFilter.tsx
├── services/
│   ├── childrenPlacesService.ts
│   ├── childrenEventsService.ts
│   └── childrenPromotionsService.ts
├── redux/
│   ├── childrenPlacesSlice.ts
│   ├── childrenEventsSlice.ts
│   └── childrenPromotionsSlice.ts
└── hooks/
    ├── useChildrenPlaces.ts
    ├── useChildrenEvents.ts
    └── useChildrenPromotions.ts
```

---

## 8. Рекомендація щодо навігації

**НЕ додавати 6-й таб** — буде перевантажено.

**Кращі варіанти:**
1. У `Mistsa-i-Lyudi-Hub.tsx` додати 5-ту картку **"Все для дітей"** з іконкою `toy-brick` / `heart`
2. Або створити окремий `Dityachiy-Hub.tsx` як повноцінний хаб з усіма категоріями
3. Або додати велику кнопку на головний екран `Glavny-Ekran.tsx`

---

## 9. Що НЕ змінювати (згідно AGENTS.md)

- `admin-panel/src/services/authService.ts`
- `admin-panel/src/firebase/firebase.ts`
- `firebase.rules.json` (без погодження)
- Система авторизації та ролей
- `VITE_ADMIN_SERVICE_EMAIL` поведінка

---

## 10. Потенційні ризики

- Статичні дані `chaykaPlacesData.ts` дублюються з API — потрібна міграція
- Модерація контенту від закладів потребує адмін-панелі
- Заповнення контентом (садочки/школи мають самі додавати інформацію)
- Безпека дітей — відгуки мають проходити модерацію
