import Toast from 'react-native-toast-message';
import { ref, get } from 'firebase/database';
import { database } from '../firebase-core';
import { logClientError } from './errorLogger';

type YellowListEntry = {
  active?: boolean;
  bannedUntil?: number;
  reason?: string;
};

const TEXT = {
  ua: {
    title: 'Публікації тимчасово на паузі',
    body: (date: string, reason?: string) =>
      `Можна читати стрічку й користуватися іншими розділами. Нові публікації доступні після ${date}.${reason ? ` Причина: ${reason}` : ''}`,
  },
  ru: {
    title: 'Публикации временно на паузе',
    body: (date: string, reason?: string) =>
      `Можно читать ленту и пользоваться другими разделами. Новые публикации доступны после ${date}.${reason ? ` Причина: ${reason}` : ''}`,
  },
  en: {
    title: 'Posting is temporarily paused',
    body: (date: string, reason?: string) =>
      `You can still read the feed and use other sections. New posts are available after ${date}.${reason ? ` Reason: ${reason}` : ''}`,
  },
} as const;

type AppLanguage = 'ua' | 'ru' | 'en';

const normalizeLanguage = (language: string | undefined): AppLanguage => {
  if (language === 'ru' || language === 'en') return language;
  return 'ua';
};

const formatRestrictionDate = (timestamp: number, language: AppLanguage): string => {
  const locale = language === 'ua' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US';
  return new Date(timestamp).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeReason = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const reason = value.trim().replace(/\s+/g, ' ').slice(0, 140);
  return reason || undefined;
};

/**
 * Проверяет, есть ли пользователь в жёлтом списке.
 * Если да — показывает мягкое уведомление и возвращает true (публикация ограничена).
 * Если нет или бан истёк — возвращает false (можно отправлять).
 */
export async function checkYellowList(uid: string | undefined, language?: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await get(ref(database, `yellow_list/${uid}`));
    if (!snap.exists()) return false;
    const entry = snap.val() as YellowListEntry;
    const bannedUntil = typeof entry.bannedUntil === 'number' ? entry.bannedUntil : 0;
    if (!(entry.active !== false && bannedUntil > Date.now())) return false;

    const normalizedLanguage = normalizeLanguage(language);
    const text = TEXT[normalizedLanguage];
    const date = formatRestrictionDate(bannedUntil, normalizedLanguage);
    Toast.show({
      type: 'warning',
      text1: text.title,
      text2: text.body(date, normalizeReason(entry.reason)),
      visibilityTime: 6500,
      position: 'top',
    });
    return true;
  } catch (error) {
    void logClientError('yellowListCheck.checkYellowList', error, { uid });
    return false;
  }
}
