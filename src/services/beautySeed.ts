import { BeautyInfo, BeautyOffer, Place } from '../types/app';

/**
 * Seed-данные для раздела "Салони краси" (MVP).
 *
 * Структура полностью повторяет childrenSeed.ts:
 * — beautyInfoSeed хранит дополнительный слой по id существующего Place
 * — beautyOffersSeed хранит акции / спецпредложения
 * — getBeautyPlaces() накладывает beautyInfo на Place[]
 */

// beautyInfo по id существующего места из chaykaPlacesData.ts
export const beautyInfoSeed: Record<string, BeautyInfo> = {
  // ART BEAUTY CLUB
  'place-101': {
    category: 'hair',
    priceFrom: 400,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Повний спектр послуг: стрижки, фарбування, укладки.',
    features: ['women', 'men', 'online_booking'],
  },

  // IRA BEAUTY
  'place-102': {
    category: 'hair',
    priceFrom: 350,
    pricePeriod: 'service',
    workingHours: 'Пн-Пт 10:00-19:00, Сб 10:00-17:00',
    shortDescription: 'Перукарня та догляд за волоссям.',
    features: ['women', 'online_booking'],
  },

  // Майстерня Краси
  'place-103': {
    category: 'hair',
    priceFrom: 300,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Стрижки, фарбування, догляд для всієї родини.',
    features: ['women', 'men', 'kids_friendly'],
  },

  // MiA Open Beauty Space
  'place-104': {
    category: 'cosmetology',
    priceFrom: 500,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 10:00-20:00',
    shortDescription: 'Косметологія, чистки, пілінги, апаратні процедури.',
    features: ['women', 'online_booking', 'certificate'],
  },

  // Milla massage
  'place-105': {
    category: 'massage',
    priceFrom: 600,
    pricePeriod: 'session',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Масаж: класичний, лімфодренажний, спортивний.',
    features: ['women', 'men', 'home_visit', 'online_booking'],
  },

  // Nadin_Cosmetologist
  'place-106': {
    category: 'cosmetology',
    priceFrom: 500,
    pricePeriod: 'service',
    workingHours: 'За записом',
    shortDescription: 'Косметологія, лазерна епіляція, апаратний масаж.',
    masterName: 'Надін',
    features: ['women', 'online_booking'],
  },

  // Q.SALON
  'place-107': {
    category: 'hair',
    priceFrom: 450,
    pricePeriod: 'service',
    workingHours: 'Пн-Нд 09:00-21:00',
    shortDescription: 'Салон повного циклу: стрижки, манікюр, косметологія.',
    features: ['women', 'men', 'online_booking', 'parking'],
  },

  // Shyk
  'place-108': {
    category: 'hair',
    priceFrom: 350,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Салон краси з широким спектром послуг.',
    features: ['women', 'men'],
  },

  // siri_nails_brows
  'place-111': {
    category: 'nails',
    priceFrom: 400,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 10:00-19:00',
    shortDescription: 'Манікюр, педикюр, брови.',
    features: ['women', 'online_booking'],
  },

  // Барбершоп RESORA
  'place-112': {
    category: 'barbershop',
    priceFrom: 350,
    pricePeriod: 'service',
    workingHours: 'Пн-Нд 10:00-21:00',
    shortDescription: 'Чоловічі стрижки, борода, догляд.',
    features: ['men', 'online_booking', 'parking'],
  },

  // Кабинет косметологии dr_natalia_chayka
  'place-115': {
    category: 'cosmetology',
    priceFrom: 600,
    pricePeriod: 'service',
    workingHours: 'За записом',
    shortDescription: 'Косметологія, інʼєкції, догляд за шкірою.',
    masterName: 'Наталія',
    instagram: 'dr_natalia_chayka',
    features: ['women', 'online_booking'],
  },

  // Косметолог Елена Тетерева
  'place-116': {
    category: 'cosmetology',
    priceFrom: 500,
    pricePeriod: 'service',
    workingHours: 'За записом',
    shortDescription: 'Косметологічні послуги, догляд за обличчям.',
    masterName: 'Олена Тетерева',
    features: ['women', 'online_booking', 'home_visit'],
  },

  // Мастерская красоты "Ногтевых дел мастер"
  'place-117': {
    category: 'nails',
    priceFrom: 350,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-19:00',
    shortDescription: 'Манікюр, педикюр, нарощування нігтів акрилом та гелем.',
    features: ['women', 'online_booking'],
  },

  // Нарощування вій
  'place-118': {
    category: 'cosmetology',
    priceFrom: 500,
    pricePeriod: 'service',
    workingHours: 'За записом',
    shortDescription: 'Нарощування та ламінування вій.',
    features: ['women'],
  },

  // Нарощування вій @yana_lashess__
  'place-119': {
    category: 'cosmetology',
    priceFrom: 450,
    pricePeriod: 'service',
    workingHours: 'За записом',
    shortDescription: 'Нарощування вій, ламінування.',
    masterName: 'Яна',
    instagram: 'yana_lashess__',
    features: ['women', 'online_booking', 'home_visit'],
  },

  // Салон краси "White"
  'place-120': {
    category: 'hair',
    priceFrom: 400,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Перукарські послуги, манікюр, педикюр.',
    features: ['women', 'men', 'kids_friendly', 'online_booking'],
  },

  // Салон краси "Монро"
  'place-121': {
    category: 'hair',
    priceFrom: 350,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-20:00',
    shortDescription: 'Повний спектр перукарських послуг.',
    features: ['women', 'men', 'online_booking'],
  },

  // Салон красоты Абажур
  'place-122': {
    category: 'hair',
    priceFrom: 400,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 10:00-20:00',
    shortDescription: 'Стрижки, фарбування, укладки, манікюр.',
    features: ['women', 'men', 'online_booking', 'certificate'],
  },

  // Силуэт Салон Красоты ООО
  'place-123': {
    category: 'hair',
    priceFrom: 300,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 09:00-19:00',
    shortDescription: 'Доступні перукарські послуги для всієї родини.',
    features: ['women', 'men', 'kids_friendly'],
  },

  // Студия ногтевой эстетики "E.LIT nail space"
  'place-124': {
    category: 'nails',
    priceFrom: 450,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 10:00-20:00',
    shortDescription: 'Манікюр, педикюр, нейл-арт, нарощування.',
    features: ['women', 'online_booking', 'certificate'],
  },

  // Студія лазерної епіляції Gold Skin
  'place-125': {
    category: 'cosmetology',
    priceFrom: 400,
    pricePeriod: 'service',
    workingHours: 'Пн-Сб 10:00-20:00',
    shortDescription: 'Лазерна епіляція, догляд за шкірою.',
    features: ['women', 'men', 'online_booking', 'discount_first'],
  },

  // Lucky Spa Family Club
  'place-43': {
    category: 'spa',
    priceFrom: 800,
    pricePeriod: 'session',
    workingHours: 'Пн-Нд 09:00-21:00',
    shortDescription: 'SPA для всієї родини: масаж, сауна, басейн.',
    features: ['women', 'men', 'kids_friendly', 'parking', 'online_booking'],
  },
};

// Акции и спецпредложения салонов
export const beautyOffersSeed: BeautyOffer[] = [
  {
    id: 'beauty-offer-1',
    placeId: 'place-125',
    type: 'discount',
    title: 'Знижка 30% на перший візит',
    shortText: 'Лазерна епіляція будь-якої зони зі знижкою для нових клієнтів',
    discountPercent: 30,
    validUntil: new Date('2026-06-30T23:59:59Z').valueOf(),
    isFeatured: true,
    isActive: true,
    createdAt: new Date('2026-06-01T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-06-01T09:00:00Z').valueOf(),
  },
  {
    id: 'beauty-offer-2',
    placeId: 'place-112',
    type: 'promotion',
    title: 'Стрижка + борода = 500 грн',
    shortText: 'Комбо-пропозиція для чоловіків',
    price: 500,
    validUntil: new Date('2026-06-20T23:59:59Z').valueOf(),
    isFeatured: true,
    isActive: true,
    createdAt: new Date('2026-06-01T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-06-01T09:00:00Z').valueOf(),
  },
  {
    id: 'beauty-offer-3',
    placeId: 'place-43',
    type: 'promotion',
    title: 'Сімейний день у SPA',
    shortText: 'Знижка 20% на всі послуги по неділях',
    discountPercent: 20,
    validUntil: new Date('2026-07-31T23:59:59Z').valueOf(),
    isActive: true,
    createdAt: new Date('2026-06-02T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-06-02T09:00:00Z').valueOf(),
  },
  {
    id: 'beauty-offer-4',
    placeId: 'place-104',
    type: 'new_master',
    title: 'Новий косметолог у MiA',
    shortText: 'Безкоштовна консультація з новим майстром до кінця червня',
    price: 0,
    validUntil: new Date('2026-06-30T23:59:59Z').valueOf(),
    isActive: true,
    createdAt: new Date('2026-06-03T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-06-03T09:00:00Z').valueOf(),
  },
  {
    id: 'beauty-offer-5',
    placeId: 'place-107',
    type: 'available_slots',
    title: 'Є вільні вікна на цей тиждень',
    shortText: 'Стрижка, фарбування, манікюр — запишіться онлайн',
    validUntil: new Date('2026-06-10T23:59:59Z').valueOf(),
    isActive: true,
    createdAt: new Date('2026-06-03T09:00:00Z').valueOf(),
    updatedAt: new Date('2026-06-03T09:00:00Z').valueOf(),
  },
];

/**
 * Накладывает beautyInfo на существующие места и возвращает только те,
 * у которых есть данные салона.
 */
export function getBeautyPlaces(places: Place[]): Place[] {
  return places.reduce<Place[]>((acc, place) => {
    const info = beautyInfoSeed[place.id];
    if (info) {
      acc.push({ ...place, beautyInfo: info });
    }
    return acc;
  }, []);
}

/**
 * Активно ли предложение на момент now: флаг isActive и срок validUntil не истёк.
 */
export function isBeautyOfferActive(offer: BeautyOffer, now: number = Date.now()): boolean {
  if (!offer.isActive) return false;
  if (offer.validUntil != null && offer.validUntil < now) return false;
  return true;
}

/**
 * Возвращает активные предложения. Если передан placeId — только для этого места.
 */
export function getActiveBeautyOffers(placeId?: string, now: number = Date.now()): BeautyOffer[] {
  return beautyOffersSeed.filter(
    (offer) =>
      isBeautyOfferActive(offer, now) && (placeId == null || offer.placeId === placeId),
  );
}
