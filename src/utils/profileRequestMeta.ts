import type { ViewRequestContext, ViewRequestStatus } from '../services/profilePermissionService';

type Lang = 'ua' | 'ru' | 'en';

export const PROFILE_REQUEST_CONTEXT_KEYS: readonly ViewRequestContext[] = [
  'lyudi',
  'help',
  'sport',
  'buysell',
  'job',
] as const;

const CONTEXT_LABELS: Record<ViewRequestContext, Record<Lang, string>> = {
  lyudi: { ua: 'Люди Чайки', ru: 'Люди Чайки', en: 'People' },
  help: { ua: 'Запити допомоги', ru: 'Запросы помощи', en: 'Help requests' },
  sport: { ua: 'Спорт', ru: 'Спорт', en: 'Sport' },
  buysell: { ua: 'Купи/Продай', ru: 'Купи/Продай', en: 'Buy/Sell' },
  job: { ua: 'Робота', ru: 'Работа', en: 'Jobs' },
};

const STATUS_LABELS: Record<ViewRequestStatus, Record<Lang, string>> = {
  pending: { ua: 'Очікує', ru: 'Ожидает', en: 'Pending' },
  approved: { ua: 'Дозволено', ru: 'Разрешено', en: 'Allowed' },
  denied: { ua: 'Відхилено', ru: 'Отклонено', en: 'Denied' },
};

export const getProfileRequestContextLabel = (
  context: ViewRequestContext | string,
  language: Lang,
): string => {
  if (context in CONTEXT_LABELS) {
    return CONTEXT_LABELS[context as ViewRequestContext][language];
  }
  return context;
};

export const getProfileRequestStatusLabel = (
  status: ViewRequestStatus,
  language: Lang,
): string => STATUS_LABELS[status][language];

