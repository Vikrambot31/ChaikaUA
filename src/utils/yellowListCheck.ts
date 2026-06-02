import { Alert } from 'react-native';
import { ref, get } from 'firebase/database';
import { database } from '../firebase-core';
import { logClientError } from './errorLogger';

type YellowListEntry = {
  active?: boolean;
  bannedUntil?: number;
};

const TEXT = {
  ua: {
    title: 'Тимчасове обмеження',
    body: (date: string) => `Ваші заявки тимчасово обмежені до ${date}. Ви можете читати стрічку та використовувати інші функції.`,
    ok: 'Зрозуміло',
  },
  ru: {
    title: 'Временное ограничение',
    body: (date: string) => `Ваши заявки временно ограничены до ${date}. Вы можете читать ленту и использовать другие функции.`,
    ok: 'Понятно',
  },
  en: {
    title: 'Temporary restriction',
    body: (date: string) => `Your submissions are temporarily restricted until ${date}. You can still read the feed and use other features.`,
    ok: 'OK',
  },
} as const;

type AppLanguage = 'ua' | 'ru' | 'en';

const normalizeLanguage = (language: string | undefined): AppLanguage => {
  if (language === 'ru' || language === 'en') return language;
  return 'ua';
};

/**
 * Проверяет, есть ли пользователь в жёлтом списке.
 * Если да — показывает Alert и возвращает true (заблокирован).
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

    const text = TEXT[normalizeLanguage(language)];
    const date = new Date(bannedUntil).toLocaleDateString();
    Alert.alert(text.title, text.body(date), [{ text: text.ok, style: 'cancel' }]);
    return true;
  } catch (error) {
    void logClientError('yellowListCheck.checkYellowList', error, { uid });
    throw error;
  }
}
