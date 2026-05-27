export interface Subcategory {
  label: string;
  value: string;
}

export interface CategoryGroup {
  label: string;
  value: string;
  subcategories: Subcategory[];
}

/** Supported UI languages. */
export type AppLanguage = 'ua' | 'ru' | 'en';

/**
 * Multilingual display labels for every CATEGORY_GROUPS group and subcategory.
 * Keys are the `.value` fields used as DB keys — never change those.
 * The `ua` values match the existing Ukrainian labels in CATEGORY_GROUPS.
 */
export const CATEGORY_LABELS: Record<string, { ua: string; ru: string; en: string }> = {
  // ── Group labels ────────────────────────────────────────────────────────────
  foodsharing:        { ua: '🛒 ФУДШЕРИНГ',              ru: 'Фудшеринг',              en: 'Foodsharing' },
  transport:          { ua: '🚗 ТРАНСПОРТ І ПОЇЗДКИ',    ru: 'Транспорт и поездки',    en: 'Transport & Trips' },
  repair:             { ua: '🔧 РЕМОНТ І ТЕХНІКА',       ru: 'Ремонт и техника',       en: 'Repair & Tech' },
  household:          { ua: '🏠 ПОБУТ І ПРИБИРАННЯ',     ru: 'Быт и уборка',           en: 'Household & Cleaning' },
  care:               { ua: '👨‍👩‍👧 ТУРБОТА І ДОПОМОГА',    ru: 'Забота и помощь',        en: 'Care & Help' },
  pets:               { ua: '🐾 ТВАРИНИ',                ru: 'Животные',               en: 'Pets' },
  exchange:           { ua: '📦 ОБМІН І РЕЧІ',           ru: 'Обмен и вещи',           en: 'Exchange & Items' },
  building_issues:    { ua: '🏗️ ПРОБЛЕМИ ЖК',           ru: 'Проблемы ЖК',            en: 'Building Issues' },
  education_services: { ua: '🎓 НАВЧАННЯ І ПОСЛУГИ',     ru: 'Обучение и услуги',      en: 'Education & Services' },

  // ── Subcategory labels ──────────────────────────────────────────────────────
  // foodsharing
  going_shopping:        { ua: 'Іду в магазин — хто хоче замовити?', ru: 'Иду в магазин — кто хочет заказать?', en: 'Going shopping — anyone want to order?' },

  // transport
  ride_share:            { ua: 'Їду — хто зі мною? (підвезу)',        ru: 'Еду — кто со мной? (подвезу)',         en: 'Going somewhere — need a ride?' },
  need_ride:             { ua: 'Потрібна машина / таксі',              ru: 'Нужна машина / такси',                 en: 'Need a car / taxi' },
  parking_help:          { ua: 'Допомога з паркуванням',               ru: 'Помощь с парковкой',                   en: 'Parking help' },
  parcel_delivery:       { ua: 'Доставка посилки / речей',             ru: 'Доставка посылки / вещей',             en: 'Parcel / item delivery' },

  // repair
  plumbing:              { ua: 'Сантехніка',                           ru: 'Сантехника',                           en: 'Plumbing' },
  electrical:            { ua: 'Електрика',                            ru: 'Электрика',                            en: 'Electrical' },
  locks_doors:           { ua: 'Замки і двері',                        ru: 'Замки и двери',                        en: 'Locks & doors' },
  windows_balconies:     { ua: 'Вікна і балкони',                      ru: 'Окна и балконы',                       en: 'Windows & balconies' },
  home_appliances:       { ua: 'Побутова техніка',                     ru: 'Бытовая техника',                      en: 'Home appliances' },
  furniture:             { ua: 'Меблі (зібрати / розібрати)',           ru: 'Мебель (собрать / разобрать)',          en: 'Furniture (assemble / disassemble)' },
  small_repair:          { ua: 'Дрібний ремонт',                       ru: 'Мелкий ремонт',                        en: 'Small repair' },

  // household
  cleaning:              { ua: 'Прибирання',                           ru: 'Уборка',                               en: 'Cleaning' },
  trash_removal:         { ua: 'Вивіз речей / сміття',                 ru: 'Вывоз вещей / мусора',                 en: 'Trash / items removal' },
  laundry:               { ua: 'Хімчистка і прання',                   ru: 'Химчистка и стирка',                   en: 'Dry cleaning & laundry' },
  plants:                { ua: 'Рослини (полити / доглянути)',          ru: 'Растения (полить / ухаживать)',         en: 'Plants (water / care)' },

  // care
  childcare:             { ua: 'Допомога дітям / няня',                ru: 'Помощь детям / няня',                  en: 'Childcare / babysitter' },
  elderly_help:          { ua: 'Допомога літнім',                      ru: 'Помощь пожилым',                       en: 'Elderly help' },
  psychological_support: { ua: 'Психологічна підтримка',               ru: 'Психологическая поддержка',            en: 'Psychological support' },
  medical_consultation:  { ua: 'Медична консультація',                  ru: 'Медицинская консультация',             en: 'Medical consultation' },
  medicine:              { ua: 'Ліки (позичити / передати)',            ru: 'Лекарства (одолжить / передать)',       en: 'Medicine (borrow / pass on)' },

  // pets
  dog_walking:           { ua: 'Виходити собаку',                      ru: 'Выгулять собаку',                      en: 'Dog walking' },
  pet_care:              { ua: 'Нагодувати / доглянути',                ru: 'Покормить / ухаживать',                en: 'Feed / care for pet' },
  found_pet:             { ua: 'Знайшов тварину',                      ru: 'Нашёл животное',                       en: 'Found a pet' },
  lost_pet:              { ua: 'Шукаю тварину',                        ru: 'Ищу животное',                         en: 'Lost a pet' },

  // exchange
  free_items:            { ua: 'Віддам безкоштовно',                   ru: 'Отдам бесплатно',                      en: 'Free items' },
  borrow_tool:           { ua: 'Позичити інструмент',                  ru: 'Одолжить инструмент',                  en: 'Borrow a tool' },
  item_exchange:         { ua: 'Обмін речами',                         ru: 'Обмен вещами',                         en: 'Item exchange' },
  lost_item:             { ua: 'Загублено',                            ru: 'Потеряно',                             en: 'Lost item' },
  found_item:            { ua: 'Знайдено',                             ru: 'Найдено',                              en: 'Found item' },

  // building_issues
  noise:                 { ua: 'Шум від сусідів',                      ru: 'Шум от соседей',                       en: 'Noise from neighbours' },
  elevator:              { ua: 'Проблема з ліфтом',                    ru: 'Проблема с лифтом',                    en: 'Elevator issue' },
  parking_blocked:       { ua: 'Парковка / перегороджений проїзд',     ru: 'Парковка / перегороженный проезд',     en: 'Parking / blocked passage' },
  yard_trash:            { ua: 'Смітник / двір',                       ru: 'Мусор / двор',                         en: 'Yard / trash' },
  yard_lighting:         { ua: 'Освітлення у дворі',                   ru: 'Освещение во дворе',                   en: 'Yard lighting' },
  management_request:    { ua: 'Звернення до управи',                  ru: 'Обращение в управление',               en: 'Management request' },

  // education_services
  tutoring:              { ua: 'Репетитор / навчання',                 ru: 'Репетитор / обучение',                 en: 'Tutoring / lessons' },
  job_search:            { ua: 'Пошук роботи',                        ru: 'Поиск работы',                         en: 'Job search' },
  sports_company:        { ua: 'Спортивна компанія',                   ru: 'Спортивная компания',                  en: 'Sports partner' },
  creative_club:         { ua: 'Творчий гурток',                      ru: 'Творческий кружок',                    en: 'Creative club' },
  master_services:       { ua: 'Майстер (стрижка / фото / масаж)',     ru: 'Мастер (стрижка / фото / массаж)',     en: 'Master (haircut / photo / massage)' },
  legal_consultation:    { ua: 'Юридична консультація',                ru: 'Юридическая консультация',             en: 'Legal consultation' },
  documents:             { ua: 'Документи та довідки',                 ru: 'Документы и справки',                  en: 'Documents & certificates' },
};

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

/**
 * Returns the localized display label for a category group.
 * Falls back to the Ukrainian label (from CATEGORY_GROUPS) if no entry in CATEGORY_LABELS.
 */
export const getCategoryGroupLabel = (groupValue: string, lang: AppLanguage): string => {
  const entry = CATEGORY_LABELS[groupValue];
  if (entry) return entry[lang];
  // Fallback: original label from CATEGORY_GROUPS (Ukrainian)
  return getGroupLabel(groupValue);
};

/**
 * Returns the localized display label for a subcategory.
 * Falls back to the Ukrainian label (from CATEGORY_GROUPS) if no entry in CATEGORY_LABELS.
 */
export const getSubcategoryLabelLocalized = (
  groupValue: string,
  subValue: string,
  lang: AppLanguage,
): string => {
  const entry = CATEGORY_LABELS[subValue];
  if (entry) return entry[lang];
  // Fallback: original label from CATEGORY_GROUPS (Ukrainian)
  return getSubcategoryLabel(groupValue, subValue);
};

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
  void store;
  void timeSlot;
  void destination;

  return getSubcategoryLabel(groupValue, subValue);
};
