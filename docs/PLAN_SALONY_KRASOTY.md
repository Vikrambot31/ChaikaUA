# Техническое задание: Экран "Салоны Красоты"

> **Цель:** Создать экран "Салоны Красоты" по образцу экрана "Все для детей" (`Vse-Dlya-Detey.tsx`) с идентичной структурой, функциональностью и визуалом. Добавить кнопку входа на экран "Чайка бонус плюс" (`Chaika-Bonus-Plus.tsx`) — **над кнопкой "Поиск работы"**.

---

## Этап 1 — Типы данных и интерфейсы

**Файл:** `src/types/app.ts`

### 1.1. Создать тип `BeautyCategory`

По аналогии с `ChildCategory` (строка 79), определить категории салонов:

```typescript
export type BeautyCategory =
  | 'hair'           // Парикмахерские / стрижки
  | 'nails'          // Маникюр / педикюр
  | 'cosmetology'    // Косметология
  | 'massage'        // Массаж
  | 'barbershop'     // Барбершоп
  | 'spa';           // SPA и уход за телом
```

### 1.2. Создать тип `BeautyFeature`

По аналогии с `ChildFeature` (строка 87), определить фичи/бейджи салонов:

```typescript
export type BeautyFeature =
  | 'home_visit'        // Выезд на дом
  | 'online_booking'    // Онлайн запись
  | 'kids_friendly'     // Детские стрижки
  | 'men'               // Мужские услуги
  | 'women'             // Женские услуги
  | 'parking'           // Есть парковка
  | 'certificate'       // Сертификаты в подарок
  | 'discount_first';   // Скидка на первый визит
```

### 1.3. Создать интерфейс `BeautyInfo`

По аналогии с `ChildInfo` (строка 115):

```typescript
export interface BeautyInfo {
  category: BeautyCategory;
  priceFrom?: number;
  pricePeriod?: 'service' | 'hour' | 'session';
  hasAvailablePlots?: boolean;        // Есть свободные окошки
  workingHours?: string;              // "Пн-Пт 09:00-20:00"
  shortDescription?: string;
  fullDescription?: string;
  telegram?: string;
  instagram?: string;
  photos?: string[];
  features?: BeautyFeature[];
  rating?: number;                    // 1-5
  masterName?: string;                // Имя мастера (для частников)
}
```

### 1.4. Создать интерфейс `BeautyOffer`

По аналогии с `ChildOffer` (строка 132):

```typescript
export interface BeautyOffer {
  id: string;
  placeId: string;
  type: 'promotion' | 'event' | 'new_master' | 'discount' | 'available_slots';
  title: string;
  shortText: string;
  fullText?: string;
  dateFrom?: number;
  dateTo?: number;
  validUntil?: number;
  price?: number;
  discountPercent?: number;
  isFeatured?: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### Чек-лист этапа 1:
- [ ] Добавить `BeautyCategory` в `src/types/app.ts`
- [ ] Добавить `BeautyFeature` в `src/types/app.ts`
- [ ] Добавить `BeautyInfo` в `src/types/app.ts`
- [ ] Добавить `BeautyOffer` в `src/types/app.ts`
- [ ] Убедиться что все типы экспортируются (`export`)

---

## Этап 2 — Данные (Seed) и сервисный слой

**Файл:** `src/services/beautySeed.ts` (новый файл)

### 2.1. Создать файл `beautySeed.ts`

По образцу `src/services/childrenSeed.ts`:

```typescript
import { BeautyInfo, BeautyOffer } from '../types/app';
import { Place } from '../types/app';

// Данные салонов — привязка к существующим Place по id
export const beautyInfoSeed: Record<string, BeautyInfo> = {
  // Заполнить реальными данными салонов из ЖК Чайка
  'place_id_example': {
    category: 'hair',
    priceFrom: 300,
    pricePeriod: 'service',
    shortDescription: 'Стрижки та укладки для всієї родини',
    features: ['women', 'men', 'kids_friendly', 'online_booking'],
    workingHours: 'Пн-Сб 09:00-20:00',
  },
};

// Акции и спецпредложения салонов
export const beautyOffersSeed: BeautyOffer[] = [];

// Функция слияния Place + BeautyInfo (аналог getChildrenPlaces)
export function getBeautyPlaces(places: Place[]): (Place & { beautyInfo?: BeautyInfo })[] {
  return places
    .filter(p => beautyInfoSeed[p.id])
    .map(p => ({ ...p, beautyInfo: beautyInfoSeed[p.id] }));
}

// Проверка активности оффера
export function isBeautyOfferActive(offer: BeautyOffer, now = Date.now()): boolean {
  if (!offer.isActive) return false;
  if (offer.validUntil && now > offer.validUntil) return false;
  if (offer.dateTo && now > offer.dateTo) return false;
  return true;
}

// Получить активные офферы для конкретного места
export function getActiveBeautyOffers(placeId: string, now = Date.now()): BeautyOffer[] {
  return beautyOffersSeed.filter(o => o.placeId === placeId && isBeautyOfferActive(o, now));
}
```

### 2.2. Наполнить данными

- Определить реальные салоны/мастеров в ЖК Чайка
- Привязать каждый к существующему `Place` из `chaykaPlacesData.ts` по `id`
- Если Place нет — добавить новые места в `chaykaPlacesData.ts`

### Чек-лист этапа 2:
- [ ] Создать `src/services/beautySeed.ts`
- [ ] Реализовать `beautyInfoSeed` с данными салонов
- [ ] Реализовать `beautyOffersSeed` с акциями (если есть)
- [ ] Реализовать `getBeautyPlaces()`, `isBeautyOfferActive()`, `getActiveBeautyOffers()`
- [ ] Добавить недостающие Places в `chaykaPlacesData.ts` (если нужно)

---

## Этап 3 — Экраны (UI компоненты)

### 3.1. Главный экран `Salony-Krasoty.tsx`

**Файл:** `src/screens/Salony-Krasoty.tsx` (новый файл)

Полная копия структуры `Vse-Dlya-Detey.tsx` с адаптацией под салоны:

#### Секция UI_TEXT (3 языка: ua, ru, en)

| Ключ | UA | RU | EN |
|------|----|----|-----|
| title | Салони краси | Салоны красоты | Beauty salons |
| searchPlaceholder | Пошук салону... | Поиск салона... | Search salon... |
| categoryAll | Всі | Все | All |
| categoryHair | Перукарні | Парикмахерские | Hair salons |
| categoryNails | Нігті | Ногти | Nails |
| categoryCosmetology | Косметологія | Косметология | Cosmetology |
| categoryMassage | Масаж | Массаж | Massage |
| categoryBarbershop | Барбершоп | Барбершоп | Barbershop |
| categorySpa | SPA | SPA | SPA |
| sectionOffers | Актуальні пропозиції | Актуальные предложения | Current offers |
| sectionPlaces | Всі салони | Все салоны | All salons |
| emptyTitle | Поки немає салонів | Пока нет салонов | No salons yet |
| emptySubtitle | Скоро тут з'являться | Скоро тут появятся | Coming soon |
| btnDetails | Детальніше | Подробнее | Details |

#### Структура компонента (порядок секций):

1. **Hero** — кнопка "назад", поиск (реальный фильтр по имени/адресу)
2. **Актуальные предложения** — горизонтальная карусель офферов (`FlatList horizontal`)
3. **Категории** — сетка 2 колонки, тайлы с цветами:
   - hair → `#C77A5D`
   - nails → `#D4668E`
   - cosmetology → `#7B6EB1`
   - massage → `#4F8D5F`
   - barbershop → `#4D7892`
   - spa → `#00897B`
4. **Список салонов** — карточки мест (фильтруются по категории и поиску)
5. **Empty state** — если нет результатов

#### Карточка салона (аналог карточки детского места):

```
┌─────────────────────────────────────────┐
│ [Icon 46x46]  Название салона           │
│               категория · от 300 грн    │
│               📍 Адрес                  │
│               [badge] [badge] [badge]   │
│                              [Детальніше]│
└─────────────────────────────────────────┘
```

- Иконка: цветной круг `TactileIcon` с иконкой категории
- Мета: категория · цена
- Адрес с `MaterialCommunityIcons` `map-marker`
- Feature-бейджи (макс. 4 видимых)
- Кнопка "Детальніше" → навигация на `DetalSalonaScreen`

#### Feature бейджи — иконки и приоритет:

```typescript
const BEAUTY_FEATURE_PRIORITY: BeautyFeature[] = [
  'home_visit', 'online_booking', 'kids_friendly', 'women', 'men',
  'parking', 'certificate', 'discount_first'
];

const FEATURE_ICONS: Record<BeautyFeature, string> = {
  home_visit: 'home-outline',
  online_booking: 'calendar-check-outline',
  kids_friendly: 'baby-face-outline',
  women: 'face-woman-outline',
  men: 'face-man-outline',
  parking: 'parking',
  certificate: 'gift-outline',
  discount_first: 'percent-outline',
};
```

#### Стили:

- Полностью копировать из `Vse-Dlya-Detey.tsx`
- `TILE_W = (Dimensions.get('window').width - 32 - 10) / 2`
- Цвета из `SCREEN_THEME`
- Тени `raisedShadow`

---

### 3.2. Экран деталей салона `Detal-Salona.tsx`

**Файл:** `src/screens/Detal-Salona.tsx` (новый файл)

По образцу `Detal-Detskogo-Mesta.tsx`:

#### Секции экрана:

1. **Шапка** — название, категория, рейтинг (звёзды)
2. **Фото-галерея** — горизонтальный скролл фотографий
3. **Описание** — `fullDescription`
4. **Услуги и цены** — список feature-бейджей с развёрнутым описанием
5. **Режим работы** — `workingHours`
6. **Активные акции** — список офферов этого салона
7. **Действия:**
   - Позвонить (кнопка `Linking.openURL('tel:...')`)
   - Telegram (кнопка `Linking.openURL('https://t.me/...')`)
   - Instagram (кнопка `Linking.openURL('https://instagram.com/...')`)
   - Маршрут (Google Maps навигация по координатам)

#### UI_TEXT: 3 языка (ua, ru, en) — аналог `Detal-Detskogo-Mesta.tsx`

---

### 3.3. Экран деталей предложения `Detal-Predlozheniya-Salona.tsx`

**Файл:** `src/screens/Detal-Predlozheniya-Salona.tsx` (новый файл)

По образцу `Detal-Detskogo-Predlozheniya.tsx`:

#### Секции экрана:

1. Тип предложения (акция / скидка / новый мастер / свободные окошки)
2. Заголовок и описание
3. Даты действия
4. Цена / скидка
5. Действия: позвонить, Telegram, маршрут, открыть карточку салона

### Чек-лист этапа 3:
- [ ] Создать `src/screens/Salony-Krasoty.tsx` — главный экран
- [ ] Реализовать UI_TEXT (ua/ru/en) для главного экрана
- [ ] Реализовать поиск (фильтр по имени/адресу)
- [ ] Реализовать категории (сетка 2 колонки)
- [ ] Реализовать карусель офферов
- [ ] Реализовать карточки салонов с бейджами
- [ ] Реализовать empty state
- [ ] Создать `src/screens/Detal-Salona.tsx` — детальная карточка
- [ ] Реализовать секции: фото, описание, услуги, часы, акции, действия
- [ ] Создать `src/screens/Detal-Predlozheniya-Salona.tsx` — детали оффера
- [ ] Проверить визуальное соответствие экрану "Все для детей"

---

## Этап 4 — Навигация и роутинг

**Файл:** `src/navigation/RootNavigator.tsx`

### 4.1. Добавить типы параметров экранов

В `StackParamList` (около строки 161) добавить:

```typescript
SalonyKrasotyScreen: undefined;
DetalSalonaScreen: { place: Place };
DetalPredlozheniyaSalonaScreen: { offer: BeautyOffer };
```

### 4.2. Зарегистрировать экраны

В секции `Stack.Screen` (около строки 841) добавить:

```tsx
<Stack.Screen name="SalonyKrasotyScreen" component={SalonyKrasotyScreen} />
<Stack.Screen name="DetalSalonaScreen" component={DetalSalonaScreen} />
<Stack.Screen name="DetalPredlozheniyaSalonaScreen" component={DetalPredlozheniyaSalonaScreen} />
```

### 4.3. Добавить deep linking

В секции `linking.config` (около строки 246) добавить:

```typescript
SalonyKrasotyScreen: 'screen/beauty',
DetalSalonaScreen: 'screen/beauty/place',
DetalPredlozheniyaSalonaScreen: 'screen/beauty/offer',
```

### 4.4. Добавить в route file map

В секции `routeFileMap` (около строки 315) добавить:

```typescript
SalonyKrasotyScreen: 'Salony-Krasoty.tsx',
DetalSalonaScreen: 'Detal-Salona.tsx',
DetalPredlozheniyaSalonaScreen: 'Detal-Predlozheniya-Salona.tsx',
```

### 4.5. Импортировать компоненты

В начало файла добавить импорты:

```typescript
import SalonyKrasotyScreen from '../screens/Salony-Krasoty';
import DetalSalonaScreen from '../screens/Detal-Salona';
import DetalPredlozheniyaSalonaScreen from '../screens/Detal-Predlozheniya-Salona';
```

### Чек-лист этапа 4:
- [ ] Добавить 3 экрана в `StackParamList`
- [ ] Зарегистрировать 3 `Stack.Screen`
- [ ] Настроить deep linking для 3 экранов
- [ ] Добавить в `routeFileMap`
- [ ] Добавить импорты экранов
- [ ] Проверить навигацию вперед/назад

---

## Этап 5 — Кнопка на экране "Чайка бонус плюс"

**Файл:** `src/screens/Chaika-Bonus-Plus.tsx`

### 5.1. Добавить кнопку "Салони краси" в секцию `market`

Во всех трёх языках (ua, ru, en) добавить новый элемент **между "Все для дітей" и "Пошук роботи"**.

#### Позиция: `market[2]` (индекс 2 — после "Все для дітей", перед "Пошук роботи")

**UA** (строка 47-48, вставить между ними):
```typescript
{ label: 'Салони краси', desc: 'Перукарні, манікюр, косметологія', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
```

**RU** (строка 70-71, вставить между ними):
```typescript
{ label: 'Салоны красоты', desc: 'Парикмахерские, маникюр, косметология', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
```

**EN** (строка 93-94, вставить между ними):
```typescript
{ label: 'Beauty salons', desc: 'Hair, nails, cosmetology', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
```

#### Параметры кнопки:

| Параметр | Значение |
|----------|----------|
| screen | `SalonyKrasotyScreen` |
| icon | `content-cut` (ножницы — MaterialCommunityIcons) |
| accent | `#D4668E` (розовый) |

### 5.2. Итоговый порядок кнопок в секции Market:

```
1. Їжа на Чайці          🟡 #FFD400
2. Все для дітей          🟤 #C77A5D
3. Салони краси     ← NEW 🩷 #D4668E
4. Пошук роботи           🔵 #4D7892
5. Куплю / продам         🟠 #C96E3E
6. Послуги та бізнес      🟢 #6E7F47
```

### Чек-лист этапа 5:
- [ ] Добавить элемент в `market[]` для `ua` — после "Все для дітей", перед "Пошук роботи"
- [ ] Добавить элемент в `market[]` для `ru` — аналогичная позиция
- [ ] Добавить элемент в `market[]` для `en` — аналогичная позиция
- [ ] Проверить что иконка `content-cut` отображается корректно
- [ ] Проверить навигацию по нажатию кнопки
- [ ] Проверить визуальное соответствие остальным кнопкам

---

## Сводная таблица новых файлов

| # | Файл | Тип | Описание |
|---|------|-----|----------|
| 1 | `src/types/app.ts` | изменение | +4 типа/интерфейса |
| 2 | `src/services/beautySeed.ts` | новый | Данные + сервисные функции |
| 3 | `src/screens/Salony-Krasoty.tsx` | новый | Главный экран салонов |
| 4 | `src/screens/Detal-Salona.tsx` | новый | Детальная карточка салона |
| 5 | `src/screens/Detal-Predlozheniya-Salona.tsx` | новый | Детали акции/оффера |
| 6 | `src/navigation/RootNavigator.tsx` | изменение | +3 экрана, deep links |
| 7 | `src/screens/Chaika-Bonus-Plus.tsx` | изменение | +1 кнопка (3 языка) |

## Сводная таблица зависимостей

```
Chaika-Bonus-Plus.tsx
  └── кнопка "Салони краси" → SalonyKrasotyScreen
       ├── категории → фильтр салонов
       ├── карточка салона → DetalSalonaScreen
       │    ├── позвонить / telegram / instagram / маршрут
       │    └── активные акции → DetalPredlozheniyaSalonaScreen
       └── карусель офферов → DetalPredlozheniyaSalonaScreen
            └── открыть карточку салона → DetalSalonaScreen

beautySeed.ts ← типы из app.ts
  └── привязка к chaykaPlacesData.ts (Place[])
```

## Порядок реализации

```
Этап 1 (типы)  →  Этап 2 (данные)  →  Этап 3 (экраны UI)
                                            ↓
                                      Этап 4 (навигация)  →  Этап 5 (кнопка)
```

> **Этапы 1-2** можно делать параллельно с проектированием UI.
> **Этап 5** зависит от этапа 4 (экран должен быть зарегистрирован в навигации до добавления кнопки).
