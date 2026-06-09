// Маппінг screenId -> локалізовані назви для системи оцінки функцій
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

export type FeatureScreenId = keyof typeof FEATURE_SCREEN_MAP;

export const getScreenLabel = (screenId: string, lang: 'ua' | 'ru' | 'en'): string => {
  const entry = FEATURE_SCREEN_MAP[screenId as FeatureScreenId];
  return entry?.[lang] ?? screenId;
};
