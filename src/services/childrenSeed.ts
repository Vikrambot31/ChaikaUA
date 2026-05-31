import { ChildInfo, ChildOffer, Place } from '../types/app';

/**
 * Временные seed-данные для раздела "Все для детей" (MVP, Этап 1).
 *
 * НЕ создаём отдельный источник мест и НЕ трогаем chaykaPlacesData.ts.
 * Здесь хранится только дополнительный слой `childInfo` (по id места) и
 * список предложений `childOffers`. Реальные места берутся из существующего
 * каталога, а этот слой накладывается поверх через getChildrenPlaces().
 *
 * Когда заклады начнут вноситься через Firebase, этот файл заменяется
 * сервисом, а интерфейс (getChildrenPlaces / getActiveOffers) остаётся прежним.
 */

// childInfo по id существующего места из chaykaPlacesData.ts
export const childInfoSeed: Record<string, ChildInfo> = {
  // Unique Kids — приватний садочок щасливих дітей
  'place-133': {
    category: 'kindergarten',
    ageFrom: 2,
    ageTo: 6,
    priceFrom: 9000,
    pricePeriod: 'month',
    hasAvailablePlaces: true,
    schedule: 'Пн–Пт, 08:00–19:00',
    shortDescription: 'Приватний садочок з повним днем, харчуванням та англійською.',
    telegram: undefined,
    features: ['shelter', 'food', 'english', 'full_day', 'nurse'],
    safety: {
      hasShelter: true,
      hasSecurityGuard: true,
      hasVideoSurveillance: true,
      hasClosedTerritory: true,
      hasAccessControl: true,
      hasFireSafety: true,
    },
    medical: {
      hasNurse: true,
      hasFirstAid: true,
      hasAllergySupport: true,
    },
  },

  // BimbiJoy
  'place-128': {
    category: 'kindergarten',
    ageFrom: 1.5,
    ageTo: 5,
    priceFrom: 8500,
    pricePeriod: 'month',
    hasAvailablePlaces: false,
    schedule: 'Пн–Пт, 08:30–18:30',
    shortDescription: 'Сімейний садочок з невеликими групами та харчуванням.',
    features: ['shelter', 'food', 'half_day', 'full_day'],
    safety: {
      hasShelter: true,
      hasClosedTerritory: true,
      hasFireSafety: true,
    },
    medical: {
      hasFirstAid: true,
    },
  },

  // Monte Dino
  'place-131': {
    category: 'kindergarten',
    ageFrom: 2,
    ageTo: 6,
    priceFrom: 9500,
    pricePeriod: 'month',
    hasAvailablePlaces: true,
    schedule: 'Пн–Пт, 08:00–19:00',
    shortDescription: 'Монтессорі-простір з акцентом на самостійність дитини.',
    features: ['shelter', 'food', 'english', 'full_day', 'trial_day'],
    safety: {
      hasShelter: true,
      hasVideoSurveillance: true,
      hasClosedTerritory: true,
      hasFireSafety: true,
    },
    medical: {
      hasNurse: true,
      hasFirstAid: true,
    },
  },

  // "MASIKI" — детский клуб раннего развития
  'place-127': {
    category: 'development',
    ageFrom: 1,
    ageTo: 7,
    priceFrom: 350,
    pricePeriod: 'lesson',
    hasAvailablePlaces: true,
    schedule: 'Пн–Сб, заняття за розкладом',
    shortDescription: 'Раннє розвитку, логопед, підготовка до школи.',
    features: ['speech_therapist', 'english', 'trial_day'],
    safety: {
      hasShelter: true,
      hasClosedTerritory: true,
    },
  },

  // Unique School — інноваційна школа (0-9 класи)
  'place-135': {
    category: 'school',
    ageFrom: 6,
    ageTo: 15,
    priceFrom: 18000,
    pricePeriod: 'month',
    hasAvailablePlaces: true,
    schedule: 'Пн–Пт, 08:30–17:00',
    shortDescription: 'Інноваційна школа з англійською та сучасною програмою.',
    features: ['shelter', 'food', 'english', 'full_day', 'nurse'],
    safety: {
      hasShelter: true,
      hasSecurityGuard: true,
      hasVideoSurveillance: true,
      hasClosedTerritory: true,
      hasAccessControl: true,
      hasFireSafety: true,
    },
    medical: {
      hasNurse: true,
      hasFirstAid: true,
    },
  },

  // Клуб спортивного бального танцю Victory Dance Academy
  'place-141': {
    category: 'sport',
    ageFrom: 4,
    ageTo: 16,
    priceFrom: 300,
    pricePeriod: 'lesson',
    hasAvailablePlaces: true,
    schedule: 'Вт, Чт, Сб — групові заняття',
    shortDescription: 'Спортивні бальні танці для дітей, набір у групи.',
    features: ['sport', 'trial_day'],
    safety: {
      hasShelter: true,
      hasClosedTerritory: true,
    },
  },
};

// Предложения / мероприятия (акции, дни открытых дверей, пробные занятия)
export const childOffersSeed: ChildOffer[] = [
  {
    id: 'offer-1',
    placeId: 'place-133',
    type: 'open_day',
    title: 'День відкритих дверей',
    shortText: 'Екскурсія садочком та знайомство з вихователями',
    fullText:
      'Запрошуємо батьків на день відкритих дверей: покажемо групи, укриття, кухню та розкажемо про програму.',
    dateFrom: new Date('2026-06-05T10:00:00Z').valueOf(),
    validUntil: new Date('2026-06-05T23:59:59Z').valueOf(),
    ageFrom: 2,
    ageTo: 6,
    isFeatured: true,
    isActive: true,
    createdAt: new Date('2026-05-25T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-05-25T09:00:00Z').valueOf(),
  },
  {
    id: 'offer-2',
    placeId: 'place-131',
    type: 'promotion',
    title: 'Знижка 20% на перший місяць',
    shortText: 'Для нових вихованців при оформленні до 30 червня',
    discountPercent: 20,
    validUntil: new Date('2026-06-30T23:59:59Z').valueOf(),
    ageFrom: 2,
    ageTo: 6,
    isFeatured: true,
    isActive: true,
    createdAt: new Date('2026-05-20T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-05-20T09:00:00Z').valueOf(),
  },
  {
    id: 'offer-3',
    placeId: 'place-127',
    type: 'trial_lesson',
    title: 'Безкоштовне пробне заняття',
    shortText: 'Раннє розвитку та підготовка до школи',
    price: 0,
    validUntil: new Date('2026-06-15T23:59:59Z').valueOf(),
    ageFrom: 1,
    ageTo: 7,
    isActive: true,
    createdAt: new Date('2026-05-22T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-05-22T09:00:00Z').valueOf(),
  },
  {
    id: 'offer-4',
    placeId: 'place-141',
    type: 'available_places',
    title: 'Набір у групи бальних танців',
    shortText: 'Є вільні місця у групах 4–7 та 8–12 років',
    validUntil: new Date('2026-06-20T23:59:59Z').valueOf(),
    ageFrom: 4,
    ageTo: 16,
    isActive: true,
    createdAt: new Date('2026-05-18T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-05-18T09:00:00Z').valueOf(),
  },
  {
    id: 'offer-5',
    placeId: 'place-135',
    type: 'open_day',
    title: 'Презентація школи',
    shortText: 'Знайомство з програмою 0–9 класів',
    dateFrom: new Date('2026-06-08T11:00:00Z').valueOf(),
    validUntil: new Date('2026-06-08T23:59:59Z').valueOf(),
    ageFrom: 6,
    ageTo: 15,
    isActive: true,
    createdAt: new Date('2026-05-24T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-05-24T09:00:00Z').valueOf(),
  },
];

/**
 * Накладывает childInfo на существующие места и возвращает только те,
 * у которых есть детская информация.
 */
export function getChildrenPlaces(places: Place[]): Place[] {
  return places.reduce<Place[]>((acc, place) => {
    const info = childInfoSeed[place.id];
    if (info) {
      acc.push({ ...place, childInfo: info });
    }
    return acc;
  }, []);
}

/**
 * Активно ли предложение на момент now: флаг isActive и срок validUntil не истёк.
 */
export function isOfferActive(offer: ChildOffer, now: number = Date.now()): boolean {
  if (!offer.isActive) {
    return false;
  }
  if (offer.validUntil != null && offer.validUntil < now) {
    return false;
  }
  return true;
}

/**
 * Возвращает активные предложения. Если передан placeId — только для этого места.
 */
export function getActiveOffers(placeId?: string, now: number = Date.now()): ChildOffer[] {
  return childOffersSeed.filter(
    (offer) =>
      isOfferActive(offer, now) && (placeId == null || offer.placeId === placeId),
  );
}
