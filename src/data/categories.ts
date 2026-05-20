export interface Subcategory {
  label: string;
  value: string;
}

export interface CategoryGroup {
  label: string;
  value: string;
  subcategories: Subcategory[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: '🛒 ФУДШЕРИНГ',
    value: 'foodsharing',
    subcategories: [{ label: 'Іду в магазин — хто хоче замовити?', value: 'going_shopping' }],
  },
  {
    label: '🚗 ТРАНСПОРТ І ПОЇЗДКИ',
    value: 'transport',
    subcategories: [
      { label: 'Їду — хто зі мною? (підвезу)', value: 'ride_share' },
      { label: 'Потрібна машина / таксі', value: 'need_ride' },
      { label: 'Допомога з паркуванням', value: 'parking_help' },
      { label: 'Доставка посилки / речей', value: 'parcel_delivery' },
    ],
  },
  {
    label: '🔧 РЕМОНТ І ТЕХНІКА',
    value: 'repair',
    subcategories: [
      { label: 'Сантехніка', value: 'plumbing' },
      { label: 'Електрика', value: 'electrical' },
      { label: 'Замки і двері', value: 'locks_doors' },
      { label: 'Вікна і балкони', value: 'windows_balconies' },
      { label: 'Побутова техніка', value: 'home_appliances' },
      { label: 'Меблі (зібрати / розібрати)', value: 'furniture' },
      { label: 'Дрібний ремонт', value: 'small_repair' },
    ],
  },
  {
    label: '🏠 ПОБУТ І ПРИБИРАННЯ',
    value: 'household',
    subcategories: [
      { label: 'Прибирання', value: 'cleaning' },
      { label: 'Вивіз речей / сміття', value: 'trash_removal' },
      { label: 'Хімчистка і прання', value: 'laundry' },
      { label: 'Рослини (полити / доглянути)', value: 'plants' },
    ],
  },
  {
    label: '👨‍👩‍👧 ТУРБОТА І ДОПОМОГА',
    value: 'care',
    subcategories: [
      { label: 'Допомога дітям / няня', value: 'childcare' },
      { label: 'Допомога літнім', value: 'elderly_help' },
      { label: 'Психологічна підтримка', value: 'psychological_support' },
      { label: 'Медична консультація', value: 'medical_consultation' },
      { label: 'Ліки (позичити / передати)', value: 'medicine' },
    ],
  },
  {
    label: '🐾 ТВАРИНИ',
    value: 'pets',
    subcategories: [
      { label: 'Виходити собаку', value: 'dog_walking' },
      { label: 'Нагодувати / доглянути', value: 'pet_care' },
      { label: 'Знайшов тварину', value: 'found_pet' },
      { label: 'Шукаю тварину', value: 'lost_pet' },
    ],
  },
  {
    label: '📦 ОБМІН І РЕЧІ',
    value: 'exchange',
    subcategories: [
      { label: 'Віддам безкоштовно', value: 'free_items' },
      { label: 'Позичити інструмент', value: 'borrow_tool' },
      { label: 'Обмін речами', value: 'item_exchange' },
      { label: 'Загублено', value: 'lost_item' },
      { label: 'Знайдено', value: 'found_item' },
    ],
  },
  {
    label: '🏗️ ПРОБЛЕМИ ЖК',
    value: 'building_issues',
    subcategories: [
      { label: 'Шум від сусідів', value: 'noise' },
      { label: 'Проблема з ліфтом', value: 'elevator' },
      { label: 'Парковка / перегороджений проїзд', value: 'parking_blocked' },
      { label: 'Смітник / двір', value: 'yard_trash' },
      { label: 'Освітлення у дворі', value: 'yard_lighting' },
      { label: 'Звернення до управи', value: 'management_request' },
    ],
  },
  {
    label: '🎓 НАВЧАННЯ І ПОСЛУГИ',
    value: 'education_services',
    subcategories: [
      { label: 'Репетитор / навчання', value: 'tutoring' },
      { label: 'Пошук роботи', value: 'job_search' },
      { label: 'Спортивна компанія', value: 'sports_company' },
      { label: 'Творчий гурток', value: 'creative_club' },
      { label: 'Майстер (стрижка / фото / масаж)', value: 'master_services' },
      { label: 'Юридична консультація', value: 'legal_consultation' },
      { label: 'Документи та довідки', value: 'documents' },
    ],
  },
];

export const CHAIKA_STORES = [
  { label: 'АТБ', value: 'atb' },
  { label: 'Сільпо', value: 'silpo' },
  { label: 'Новус', value: 'novus' },
  { label: 'Фора', value: 'fora' },
  { label: 'Рукавичка', value: 'rukavychka' },
  { label: 'Велика Кишеня', value: 'velyka_kyshenia' },
  { label: 'Аптека АНЦ', value: 'pharmacy_anc' },
  { label: 'Аптека Подорожник', value: 'pharmacy_podorozhnyk' },
  { label: 'Епіцентр', value: 'epicenter' },
  { label: 'METRO', value: 'metro' },
  { label: 'Нова Пошта (відділення)', value: 'nova_poshta' },
  { label: 'Укрпошта', value: 'ukrposhta' },
  { label: 'Інший магазин', value: 'other_store' },
];

export const TIME_SLOTS = [
  { label: 'Зараз (виходжу за 15-30 хв)', value: 'now' },
  { label: 'Через ~1 годину', value: '1h' },
  { label: 'Через ~2 години', value: '2h' },
  { label: 'Сьогодні вдень 12:00–15:00', value: 'today_noon' },
  { label: 'Сьогодні ввечері 18:00–21:00', value: 'today_evening' },
  { label: 'Завтра вранці 9:00–12:00', value: 'tomorrow_morning' },
  { label: 'Завтра вдень 12:00–16:00', value: 'tomorrow_noon' },
];

export const SPECIAL = {
  FOODSHARING: 'going_shopping',
  RIDE_SHARE: 'ride_share',
} as const;

export const getSubcategories = (groupValue: string): Subcategory[] =>
  CATEGORY_GROUPS.find((group) => group.value === groupValue)?.subcategories ?? [];

export const getGroupLabel = (groupValue: string): string =>
  CATEGORY_GROUPS.find((group) => group.value === groupValue)?.label ?? groupValue;

export const getSubcategoryLabel = (groupValue: string, subValue: string): string =>
  getSubcategories(groupValue).find((subcategory) => subcategory.value === subValue)?.label ?? subValue;

export const getStoreLabel = (storeValue: string): string =>
  CHAIKA_STORES.find((store) => store.value === storeValue)?.label ?? storeValue;

export const getTimeLabel = (timeValue: string): string =>
  TIME_SLOTS.find((slot) => slot.value === timeValue)?.label ?? timeValue;

interface BuildRequestTextParams {
  groupValue: string;
  subValue: string;
  store?: string;
  timeSlot?: string;
  destination?: string;
}

export const buildRequestText = ({
  groupValue,
  subValue,
  store,
  timeSlot,
  destination,
}: BuildRequestTextParams): string => {
  if (subValue === SPECIAL.FOODSHARING) {
    const storeLabel = store ? getStoreLabel(store) : '—';
    const timeLabel = timeSlot ? getTimeLabel(timeSlot) : '—';
    return `Йду в ${storeLabel} о ${timeLabel}`;
  }

  if (subValue === SPECIAL.RIDE_SHARE) {
    const normalizedDestination = destination?.trim();
    const destinationLabel = normalizedDestination && normalizedDestination.length > 0 ? normalizedDestination : '—';
    const timeLabel = timeSlot ? getTimeLabel(timeSlot) : '—';
    return `Їду в ${destinationLabel} о ${timeLabel}`;
  }

  return getSubcategoryLabel(groupValue, subValue);
};
