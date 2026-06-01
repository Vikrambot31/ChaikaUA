import { FoodInfo, FoodOffer, ShoppingItem, Place } from '../types/app';

/**
 * Seed-данные для раздела "Еда на Чайке" (MVP, Этап 1).
 *
 * НЕ создаём отдельный источник мест — используем существующий chaykaPlaces.
 * Здесь хранится дополнительный слой foodInfo (по id места),
 * список акций foodOffers и базовый список покупок.
 */

// foodInfo по id существующего места из chaykaPlacesData.ts
export const foodInfoSeed: Record<string, FoodInfo> = {
  // --- Пиццерии ---

  // Pizza Testo
  'place-90': {
    category: 'pizza',
    subCategory: 'pizza',
    deliveryAvailable: true,
  },

  // Pizza Чайка
  'place-91': {
    category: 'pizza',
    subCategory: 'pizza',
    deliveryAvailable: true,
  },

  // --- Кафе ---

  // Family cafe Day & Night
  'place-16': {
    category: 'cafe',
    deliveryAvailable: false,
  },

  // OBRIY cafe&bakery
  'place-18': {
    category: 'cafe',
    subCategory: 'bakery',
    deliveryAvailable: false,
  },

  // Brooklyn
  'place-13': {
    category: 'cafe',
    deliveryAvailable: false,
  },

  // ANMI SOUL
  'place-11': {
    category: 'cafe',
    subCategory: 'coffee',
    deliveryAvailable: false,
  },

  // Чайкава
  'place-14': {
    category: 'cafe',
    subCategory: 'coffee',
    deliveryAvailable: false,
  },

  // Кав'ярня-кондитерська "Гамак"
  'place-25': {
    category: 'cafe',
    subCategory: 'coffee',
    deliveryAvailable: false,
  },

  // --- Рестораны ---

  // Чайка Livingston
  'place-29': {
    category: 'restaurant',
    deliveryAvailable: false,
  },

  // Champions Eats
  'place-85': {
    category: 'restaurant',
    deliveryAvailable: true,
  },

  // Хінкальня Кувшин
  'place-87': {
    category: 'restaurant',
    deliveryAvailable: false,
  },

  // Пательня
  'place-89': {
    category: 'restaurant',
    deliveryAvailable: true,
  },

  // TheKitchen5
  'place-94': {
    category: 'restaurant',
    deliveryAvailable: false,
  },

  // --- Продуктовые магазины ---

  // Фора
  'place-38': {
    category: 'grocery',
    subCategory: 'grocery',
    deliveryAvailable: false,
  },

  // NOVUS
  'place-45': {
    category: 'grocery',
    subCategory: 'grocery',
    deliveryAvailable: false,
  },

  // Butcher HOUSE (мясо)
  'place-36': {
    category: 'grocery',
    subCategory: 'grocery',
    deliveryAvailable: false,
  },
};

// Тестовые акции
export const foodOffersSeed: FoodOffer[] = [
  {
    id: 'food-offer-1',
    placeId: 'place-91', // Pizza Чайка
    title: 'Знижка -20% на піцу',
    shortText: 'До 21:00 щодня — будь-яка піца зі знижкою 20%',
    validUntil: undefined, // бессрочная
    isActive: true,
    createdAt: new Date('2026-06-01').valueOf(),
  },
  {
    id: 'food-offer-2',
    placeId: 'place-89', // Пательня
    title: 'Бізнес-ланч 189 грн',
    shortText: 'Салат + основна страва + напій, Пн–Пт 12:00–15:00',
    validUntil: new Date('2026-07-01').valueOf(),
    isActive: true,
    createdAt: new Date('2026-06-01').valueOf(),
  },
  {
    id: 'food-offer-3',
    placeId: 'place-85', // Champions Eats
    title: 'Безкоштовна доставка по Чайці',
    shortText: 'Від замовлення 300 грн — доставка 0 грн',
    validUntil: undefined, // бессрочная
    isActive: true,
    createdAt: new Date('2026-06-01').valueOf(),
  },
];

export type FoodSeedValidationIssue = {
  placeId: string;
  field: 'place' | 'phone' | 'workingHours' | 'coordinates' | 'pizzaSubCategory' | 'offerPlace';
  message: string;
};

export type FoodSeedValidationResult = {
  totalPlaces: number;
  groceryPlaces: number;
  pizzaPlaces: number;
  activeOffers: number;
  issues: FoodSeedValidationIssue[];
  isLaunchReady: boolean;
};

const isValidCoordinate = (place: Place): boolean => (
  Number.isFinite(place.latitude)
  && Number.isFinite(place.longitude)
  && place.latitude >= 50.40
  && place.latitude <= 50.48
  && place.longitude >= 30.25
  && place.longitude <= 30.34
);

/**
 * Проверяет готовность seed-данных к запуску раздела.
 * Не блокирует UI, используется как ручная pre-release проверка этапа 6.
 */
export function validateFoodSeedData(places: Place[], now: number = Date.now()): FoodSeedValidationResult {
  const issues: FoodSeedValidationIssue[] = [];
  const placesById = new Map(places.map((place) => [place.id, place]));
  const foodPlaceIds = Object.keys(foodInfoSeed);

  foodPlaceIds.forEach((placeId) => {
    const place = placesById.get(placeId);
    const info = foodInfoSeed[placeId];

    if (!place) {
      issues.push({ placeId, field: 'place', message: 'Место отсутствует в chaykaPlaces.' });
      return;
    }

    if (!place.phone?.trim()) {
      issues.push({ placeId, field: 'phone', message: 'Нет телефона. Для релиза карточка должна иметь быстрый звонок.' });
    }

    if (!place.workingHours?.trim()) {
      issues.push({ placeId, field: 'workingHours', message: 'Нет графика работы в формате "09:00-22:00".' });
    }

    if (!isValidCoordinate(place)) {
      issues.push({ placeId, field: 'coordinates', message: 'Координаты выглядят вне ожидаемой зоны Чайки.' });
    }

    if (info.category === 'pizza' && info.subCategory !== 'pizza') {
      issues.push({ placeId, field: 'pizzaSubCategory', message: 'Пиццерия должна иметь subCategory: "pizza".' });
    }
  });

  foodOffersSeed.forEach((offer) => {
    if (!placesById.has(offer.placeId)) {
      issues.push({ placeId: offer.placeId, field: 'offerPlace', message: `Акция ${offer.id} ссылается на несуществующее место.` });
    }
  });

  const foodPlaces = getFoodPlaces(places);
  const groceryPlaces = foodPlaces.filter((place) => foodInfoSeed[place.id]?.category === 'grocery').length;
  const pizzaPlaces = foodPlaces.filter((place) => foodInfoSeed[place.id]?.subCategory === 'pizza').length;
  const activeOffers = getActiveFoodOffers(places, undefined, now).length;

  return {
    totalPlaces: foodPlaces.length,
    groceryPlaces,
    pizzaPlaces,
    activeOffers,
    issues,
    isLaunchReady:
      foodPlaces.length >= 10
      && groceryPlaces >= 2
      && activeOffers >= 2
      && issues.length === 0,
  };
}

// Базовый список покупок на неделю
export const defaultShoppingList: ShoppingItem[] = [
  // Молочные продукты
  { id: 'sh-1',  name: 'Молоко',          category: 'dairy',     icon: 'cup',                  isChecked: false, isHidden: false, sortOrder: 1 },
  { id: 'sh-2',  name: 'Кефір',           category: 'dairy',     icon: 'cup-outline',          isChecked: false, isHidden: false, sortOrder: 2 },
  { id: 'sh-3',  name: 'Йогурт',          category: 'dairy',     icon: 'cupcake',              isChecked: false, isHidden: false, sortOrder: 3 },
  { id: 'sh-4',  name: 'Сметана',         category: 'dairy',     icon: 'bowl-mix',             isChecked: false, isHidden: false, sortOrder: 4 },
  { id: 'sh-5',  name: 'Сир твердий',     category: 'dairy',     icon: 'cheese',               isChecked: false, isHidden: false, sortOrder: 5 },
  { id: 'sh-6',  name: 'Сир кисломолочний', category: 'dairy',   icon: 'cheese',               isChecked: false, isHidden: false, sortOrder: 6 },
  { id: 'sh-7',  name: 'Масло вершкове',   category: 'dairy',    icon: 'butter',               isChecked: false, isHidden: false, sortOrder: 7 },
  { id: 'sh-8',  name: 'Яйця',           category: 'dairy',     icon: 'egg',                  isChecked: false, isHidden: false, sortOrder: 8 },
  { id: 'sh-9',  name: 'Вершки',          category: 'dairy',     icon: 'cup-water',            isChecked: false, isHidden: false, sortOrder: 9 },

  // Хлеб и выпечка
  { id: 'sh-10', name: 'Хліб білий',      category: 'bread',     icon: 'bread-slice',          isChecked: false, isHidden: false, sortOrder: 10 },
  { id: 'sh-11', name: 'Хліб чорний',     category: 'bread',     icon: 'bread-slice-outline',  isChecked: false, isHidden: false, sortOrder: 11 },
  { id: 'sh-12', name: 'Батон',           category: 'bread',     icon: 'baguette',             isChecked: false, isHidden: false, sortOrder: 12 },
  { id: 'sh-13', name: 'Лаваш',           category: 'bread',     icon: 'food-croissant',       isChecked: false, isHidden: false, sortOrder: 13 },
  { id: 'sh-14', name: 'Хлібці',          category: 'bread',     icon: 'food-variant',         isChecked: false, isHidden: false, sortOrder: 14 },
  { id: 'sh-15', name: 'Булочки',         category: 'bread',     icon: 'muffin',               isChecked: false, isHidden: false, sortOrder: 15 },

  // Мясо и рыба
  { id: 'sh-16', name: 'Куряче філе',     category: 'meat_fish', icon: 'food-drumstick',       isChecked: false, isHidden: false, sortOrder: 16 },
  { id: 'sh-17', name: 'Свинина',         category: 'meat_fish', icon: 'food-steak',           isChecked: false, isHidden: false, sortOrder: 17 },
  { id: 'sh-18', name: 'Фарш',            category: 'meat_fish', icon: 'food-steak',           isChecked: false, isHidden: false, sortOrder: 18 },
  { id: 'sh-19', name: 'Ковбаса варена',  category: 'meat_fish', icon: 'sausage',              isChecked: false, isHidden: false, sortOrder: 19 },
  { id: 'sh-20', name: 'Ковбаса копчена', category: 'meat_fish', icon: 'sausage',              isChecked: false, isHidden: false, sortOrder: 20 },
  { id: 'sh-21', name: 'Сосиски',         category: 'meat_fish', icon: 'sausage',              isChecked: false, isHidden: false, sortOrder: 21 },
  { id: 'sh-22', name: 'Риба',            category: 'meat_fish', icon: 'fish',                 isChecked: false, isHidden: false, sortOrder: 22 },
  { id: 'sh-23', name: 'Рибні консерви',  category: 'meat_fish', icon: 'food-can',             isChecked: false, isHidden: false, sortOrder: 23 },

  // Овощи и фрукты
  { id: 'sh-24', name: 'Картопля',        category: 'vegetables', icon: 'food-apple',          isChecked: false, isHidden: false, sortOrder: 24 },
  { id: 'sh-25', name: 'Цибуля',          category: 'vegetables', icon: 'food-apple-outline',  isChecked: false, isHidden: false, sortOrder: 25 },
  { id: 'sh-26', name: 'Морква',          category: 'vegetables', icon: 'carrot',              isChecked: false, isHidden: false, sortOrder: 26 },
  { id: 'sh-27', name: 'Капуста',         category: 'vegetables', icon: 'leaf',                isChecked: false, isHidden: false, sortOrder: 27 },
  { id: 'sh-28', name: 'Огірки',          category: 'vegetables', icon: 'fruit-watermelon',    isChecked: false, isHidden: false, sortOrder: 28 },
  { id: 'sh-29', name: 'Помідори',        category: 'vegetables', icon: 'food-apple',          isChecked: false, isHidden: false, sortOrder: 29 },
  { id: 'sh-30', name: 'Перець',          category: 'vegetables', icon: 'chili-mild',          isChecked: false, isHidden: false, sortOrder: 30 },
  { id: 'sh-31', name: 'Зелень',          category: 'vegetables', icon: 'sprout',              isChecked: false, isHidden: false, sortOrder: 31 },
  { id: 'sh-32', name: 'Часник',          category: 'vegetables', icon: 'garlic',              isChecked: false, isHidden: false, sortOrder: 32 },
  { id: 'sh-33', name: 'Гриби',           category: 'vegetables', icon: 'mushroom',            isChecked: false, isHidden: false, sortOrder: 33 },

  // Крупы и макароны
  { id: 'sh-34', name: 'Гречка',          category: 'groats',    icon: 'grain',                isChecked: false, isHidden: false, sortOrder: 34 },
  { id: 'sh-35', name: 'Рис',             category: 'groats',    icon: 'rice',                 isChecked: false, isHidden: false, sortOrder: 35 },
  { id: 'sh-36', name: 'Макарони',        category: 'groats',    icon: 'pasta',                isChecked: false, isHidden: false, sortOrder: 36 },
  { id: 'sh-37', name: 'Вівсянка',        category: 'groats',    icon: 'bowl-mix-outline',     isChecked: false, isHidden: false, sortOrder: 37 },
  { id: 'sh-38', name: 'Борошно',         category: 'groats',    icon: 'sack',                 isChecked: false, isHidden: false, sortOrder: 38 },
  { id: 'sh-39', name: 'Олія соняшникова', category: 'groats',   icon: 'bottle-tonic',         isChecked: false, isHidden: false, sortOrder: 39 },
  { id: 'sh-40', name: 'Цукор',           category: 'groats',    icon: 'cube-outline',         isChecked: false, isHidden: false, sortOrder: 40 },
  { id: 'sh-41', name: 'Сіль',            category: 'groats',    icon: 'shaker',               isChecked: false, isHidden: false, sortOrder: 41 },

  // Соусы и специи
  { id: 'sh-42', name: 'Кетчуп',          category: 'sauces',    icon: 'bottle-soda-classic',  isChecked: false, isHidden: false, sortOrder: 42 },
  { id: 'sh-43', name: 'Майонез',         category: 'sauces',    icon: 'bottle-soda-classic-outline', isChecked: false, isHidden: false, sortOrder: 43 },
  { id: 'sh-44', name: 'Гірчиця',         category: 'sauces',    icon: 'bottle-tonic-skull',   isChecked: false, isHidden: false, sortOrder: 44 },
  { id: 'sh-45', name: 'Соєвий соус',     category: 'sauces',    icon: 'bottle-wine',          isChecked: false, isHidden: false, sortOrder: 45 },

  // Напитки
  { id: 'sh-46', name: 'Вода',            category: 'drinks',    icon: 'water',                isChecked: false, isHidden: false, sortOrder: 46 },
  { id: 'sh-47', name: 'Сік',             category: 'drinks',    icon: 'cup-water',            isChecked: false, isHidden: false, sortOrder: 47 },
  { id: 'sh-48', name: 'Чай',             category: 'drinks',    icon: 'tea',                  isChecked: false, isHidden: false, sortOrder: 48 },
  { id: 'sh-49', name: 'Кава',            category: 'drinks',    icon: 'coffee',               isChecked: false, isHidden: false, sortOrder: 49 },
  { id: 'sh-50', name: 'Компот/узвар',    category: 'drinks',    icon: 'fruit-grapes',         isChecked: false, isHidden: false, sortOrder: 50 },

  // Снеки и сладости
  { id: 'sh-51', name: 'Печиво',          category: 'snacks',    icon: 'cookie',               isChecked: false, isHidden: false, sortOrder: 51 },
  { id: 'sh-52', name: 'Шоколад',         category: 'snacks',    icon: 'candy',                isChecked: false, isHidden: false, sortOrder: 52 },
  { id: 'sh-53', name: 'Цукерки',         category: 'snacks',    icon: 'candy-outline',        isChecked: false, isHidden: false, sortOrder: 53 },
  { id: 'sh-54', name: 'Чіпси',           category: 'snacks',    icon: 'food-variant',         isChecked: false, isHidden: false, sortOrder: 54 },
  { id: 'sh-55', name: 'Сушки/пряники',   category: 'snacks',    icon: 'pretzel',              isChecked: false, isHidden: false, sortOrder: 55 },
  { id: 'sh-56', name: 'Горіхи',          category: 'snacks',    icon: 'peanut',               isChecked: false, isHidden: false, sortOrder: 56 },
];

// --- Экспортируемые функции ---

/**
 * Возвращает все места, для которых есть foodInfo.
 * Накладывает foodInfoSeed поверх существующих мест из chaykaPlaces.
 */
export function getFoodPlaces(places: Place[]): Place[] {
  return places
    .filter((p) => foodInfoSeed[p.id] != null)
    .map((p) => ({ ...p, foodInfo: foodInfoSeed[p.id] }));
}

/**
 * Проверяет, активна ли акция на указанный момент.
 * validUntil === undefined — бессрочная акция.
 */
export function isFoodOfferActive(offer: FoodOffer, now?: number): boolean {
  if (!offer.isActive) return false;
  if (offer.validUntil == null) return true;
  const currentTime = now ?? Date.now();
  return currentTime <= offer.validUntil;
}

/**
 * Возвращает активные акции. Молча отбрасывает акции с несуществующим placeId.
 * Если placeId указан — фильтрует по нему.
 */
export function getActiveFoodOffers(
  places: Place[],
  placeId?: string,
  now?: number,
): FoodOffer[] {
  const placeIds = new Set(places.map((p) => p.id));

  return foodOffersSeed.filter((offer) => {
    // отбрасываем акции с несуществующим placeId
    if (!placeIds.has(offer.placeId)) return false;
    // фильтр по конкретному месту
    if (placeId != null && offer.placeId !== placeId) return false;
    return isFoodOfferActive(offer, now);
  });
}

/**
 * Возвращает копию базового списка покупок.
 */
export function getDefaultShoppingList(): ShoppingItem[] {
  return defaultShoppingList.map((item) => ({ ...item }));
}
