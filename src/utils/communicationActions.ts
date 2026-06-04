import { Alert, Linking } from 'react-native';

export type CommunicationLanguage = 'ua' | 'ru' | 'en';

const TEXT = {
  ua: {
    errorTitle: 'Не вдалося відкрити',
    invalidPhone: 'Номер телефону недоступний.',
    invalidUrl: 'Посилання недоступне.',
    noPhoneApp: 'На цьому пристрої немає застосунку для дзвінків.',
    noViber: 'Viber не встановлено або недоступний.',
    noUrlApp: 'Не вдалося відкрити посилання на цьому пристрої.',
  },
  ru: {
    errorTitle: 'Не удалось открыть',
    invalidPhone: 'Номер телефона недоступен.',
    invalidUrl: 'Ссылка недоступна.',
    noPhoneApp: 'На этом устройстве нет приложения для звонков.',
    noViber: 'Viber не установлен или недоступен.',
    noUrlApp: 'Не удалось открыть ссылку на этом устройстве.',
  },
  en: {
    errorTitle: 'Could not open',
    invalidPhone: 'Phone number is unavailable.',
    invalidUrl: 'Link is unavailable.',
    noPhoneApp: 'No calling app is available on this device.',
    noViber: 'Viber is not installed or unavailable.',
    noUrlApp: 'Could not open this link on this device.',
  },
} as const;

export function normalizePhoneForUrl(phone?: string | null): string {
  return (phone ?? '').replace(/[^\d+]/g, '').trim();
}

function toTelegramAppUrl(url: string): string | null {
  const clean = url.trim();
  const match = clean.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]+)/i);
  if (!match?.[1]) return null;
  return `tg://resolve?domain=${match[1]}`;
}

function showCommunicationError(language: CommunicationLanguage, message: string): void {
  Alert.alert(TEXT[language].errorTitle, message);
}

export async function safeOpenURL(
  url?: string | null,
  language: CommunicationLanguage = 'ua',
  unavailableMessage: string = TEXT[language].noUrlApp,
): Promise<boolean> {
  const cleanUrl = (url ?? '').trim();
  if (!cleanUrl) {
    showCommunicationError(language, TEXT[language].invalidUrl);
    return false;
  }

  try {
    if (/^https?:\/\//i.test(cleanUrl)) {
      await Linking.openURL(cleanUrl);
      return true;
    }

    const supported = await Linking.canOpenURL(cleanUrl);
    if (!supported) {
      showCommunicationError(language, unavailableMessage);
      return false;
    }
    await Linking.openURL(cleanUrl);
    return true;
  } catch {
    showCommunicationError(language, unavailableMessage);
    return false;
  }
}

export async function safeCallPhone(phone?: string | null, language: CommunicationLanguage = 'ua'): Promise<boolean> {
  const safePhone = normalizePhoneForUrl(phone);
  if (!safePhone) {
    showCommunicationError(language, TEXT[language].invalidPhone);
    return false;
  }
  return safeOpenURL(`tel:${safePhone}`, language, TEXT[language].noPhoneApp);
}

export async function safeOpenViber(phone?: string | null, language: CommunicationLanguage = 'ua'): Promise<boolean> {
  const safePhone = normalizePhoneForUrl(phone);
  if (!safePhone) {
    showCommunicationError(language, TEXT[language].invalidPhone);
    return false;
  }
  return safeOpenURL(`viber://chat?number=${encodeURIComponent(safePhone)}`, language, TEXT[language].noViber);
}

export async function safeOpenExternalUrl(url?: string | null, language: CommunicationLanguage = 'ua'): Promise<boolean> {
  const cleanUrl = (url ?? '').trim();
  if (!cleanUrl) {
    showCommunicationError(language, TEXT[language].invalidUrl);
    return false;
  }

  const telegramAppUrl = toTelegramAppUrl(cleanUrl);
  if (telegramAppUrl) {
    try {
      const canOpenTelegram = await Linking.canOpenURL(telegramAppUrl);
      if (canOpenTelegram) {
        await Linking.openURL(telegramAppUrl);
        return true;
      }
    } catch {
      // ignore and fallback to browser URL below
    }
  }

  return safeOpenURL(cleanUrl, language, TEXT[language].noUrlApp);
}

export async function safeOpenMaps(url?: string | null, language: CommunicationLanguage = 'ua'): Promise<boolean> {
  return safeOpenExternalUrl(url, language);
}
