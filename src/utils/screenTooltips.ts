import { Language } from '../i18n/translations';

export type ScreenTooltipConfig = {
  storageKey: string;
  title: Record<Language, string>;
  items: Record<Language, string[]>;
};

const key = (name: string) => `@chaika:screen_tooltip:${name}:v1`;

export const BONUS_WALLET_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('bonus_wallet'),
  title: {
    ua: 'Мої фінанси та кредити',
    ru: 'Мои финансы и кредиты',
    en: 'My Finances and Credits',
  },
  items: {
    ua: [
      'Тут видно ваш баланс: бонуси довіри та промо-кредити.',
      'Нижче є історія: за що нараховано, потрачено і що зараз активно.',
    ],
    ru: [
      'Тут виден ваш баланс: бонусы доверия и промо-кредиты.',
      'Ниже есть история: за что начислено, потрачено и что сейчас активно.',
    ],
    en: [
      'Here you can see your balance: trust bonuses and promo-credits.',
      'Below is the history: what was credited, spent, and what is active now.',
    ],
  },
};

export const PROMO_CREDITS_TOPUP_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('promo_credits_topup'),
  title: {
    ua: 'Поповнення промо-кредитів',
    ru: 'Пополнение промо-кредитов',
    en: 'Promo-Credits Top-Up',
  },
  items: {
    ua: [
      'Виберіть пакет кредитів: він потрапить у заявку адміну.',
      'Кредити зараховуються після підтвердження; баланс оновиться автоматично.',
    ],
    ru: [
      'Выберите пакет кредитов: он попадет в заявку админу.',
      'Кредиты зачисляются после подтверждения; баланс обновится автоматически.',
    ],
    en: [
      'Select a credit package: it will be sent to admin for confirmation.',
      'Credits are added after approval; your balance will update automatically.',
    ],
  },
};

export const OSBB_FINANCE_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('osbb_finance'),
  title: {
    ua: 'Фінанси ОСББ',
    ru: 'Финансы ОСББ',
    en: 'OSBB Finances',
  },
  items: {
    ua: [
      'Тут видно збори, ціль, зібрану суму і залишок.',
      'Блок "хто оплатив" допомагає зрозуміти, які платежі вже враховані.',
    ],
    ru: [
      'Здесь видны сборы, цель, собранная сумма и остаток.',
      'Блок "кто оплатил" помогает понять, какие платежи уже учтены.',
    ],
    en: [
      'Here you can see the fees, goal, collected amount, and remaining balance.',
      'The "Who Paid" section helps you understand which payments have been recorded.',
    ],
  },
};

export const HELP_HISTORY_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('help_history'),
  title: {
    ua: 'Мої запити на допомогу',
    ru: 'Мои запросы помощи',
    en: 'My Help Requests',
  },
  items: {
    ua: [
      'Тут видні ваші активні, старі та відхилені запити на допомогу.',
      'Вкладка "Потрібні дії" покаже, що на перевірці, відхилено чи вже прострочено.',
    ],
    ru: [
      'Здесь видны ваши активные, старые и отклоненные запросы помощи.',
      'Вкладка "Нужны действия" покажет, что на проверке, отклонено или уже просрочено.',
    ],
    en: [
      'Here you can see your active, old, and rejected help requests.',
      'The "Action Needed" tab shows what is pending, rejected, or overdue.',
    ],
  },
};

export const MY_PHOTOS_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('my_photos'),
  title: {
    ua: 'Мої фотографії',
    ru: 'Мои фотографии',
    en: 'My Photos',
  },
  items: {
    ua: [
      'Додайте фото один раз, а потім використовуйте його в заявках і профілі.',
      'Щоб фото стало публічним, виберіть його і відправте на модерацію.',
    ],
    ru: [
      'Добавьте фото один раз, а потом используйте его в заявках и профиле.',
      'Чтобы фото стало публичным, выберите его и отправьте на модерацию.',
    ],
    en: [
      'Upload a photo once and then use it in requests and your profile.',
      'To make a photo public, select it and submit it for moderation.',
    ],
  },
};

export const BONUS_PROMOTION_PURCHASE_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('bonus_promotion_purchase'),
  title: {
    ua: 'Просування публікації',
    ru: 'Продвижение публикации',
    en: 'Post Promotion',
  },
  items: {
    ua: [
      'Виберіть, що просувати: анкету, бізнес, салон чи дитяче місце.',
      'Виберіть конкретну ціль і строк просування: ціна змінюється від 24 годин до 30 днів.',
    ],
    ru: [
      'Выберите, что продвигать: анкету, бизнес, салон или детское место.',
      'Выберите конкретную цель и срок продвижения: цена меняется от 24 часов до 30 дней.',
    ],
    en: [
      'Choose what to promote: profile, business, salon, or childcare place.',
      'Select a specific goal and promotion period: prices range from 24 hours to 30 days.',
    ],
  },
};

export const PROFILE_REQUESTS_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('profile_requests'),
  title: {
    ua: 'Хочуть зв\'язатися',
    ru: 'Хотят связаться',
    en: 'Contact Requests',
  },
  items: {
    ua: [
      'Вхідні — люди, які хочуть открити контакт з вами.',
      'Вихідні — ваші запити іншим користувачам і їхній поточний статус.',
    ],
    ru: [
      'Входящие — люди, которые хотят открыть контакт с вами.',
      'Исходящие — ваши запросы другим пользователям и их текущий статус.',
    ],
    en: [
      'Incoming — people who want to open contact with you.',
      'Outgoing — your requests to other users and their current status.',
    ],
  },
};

export const BUSINESS_CHAIKA_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('business_chaika'),
  title: {
    ua: 'Бізнес Чайки',
    ru: 'Бизнес Чайки',
    en: 'Chaika Business',
  },
  items: {
    ua: [
      'Тут жителі знаходять послуги й локальний бізнес за категоріями й пошуком.',
      'Нові публікації проходять модерацію, а потім з\'являються в спільній стрічці.',
    ],
    ru: [
      'Здесь жители находят услуги и локальный бизнес по категориям и поиску.',
      'Новые публикации проходят модерацию, а затем появляются в общей ленте.',
    ],
    en: [
      'Here residents find services and local businesses by categories and search.',
      'New posts go through moderation and then appear in the main feed.',
    ],
  },
};

export const CONTACTS_CHAIKA_TOOLTIP: ScreenTooltipConfig = {
  storageKey: key('contacts_chaika'),
  title: {
    ua: 'Контакти Чайки',
    ru: 'Контакты Чайки',
    en: 'Chaika Contacts',
  },
  items: {
    ua: [
      'Тут можна залишити анкету й знайти людей поруч за інтересами.',
      'Використовуйте фільтри й пошук, щоб швидше знайти потрібний контакт.',
    ],
    ru: [
      'Здесь можно оставить анкету и найти людей рядом по интересам.',
      'Используйте фильтры и поиск, чтобы быстрее найти подходящий контакт.',
    ],
    en: [
      'Here you can create a profile and find people nearby with similar interests.',
      'Use filters and search to quickly find the contact you\'re looking for.',
    ],
  },
};
