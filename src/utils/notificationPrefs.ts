import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIF_PREFS_KEY = '@chaika:notification_prefs';

export interface NotificationPrefs {
  requests: boolean;
  chat: boolean;
  osbb: boolean;
  electricity: boolean;
  general: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  requests: true,
  chat: true,
  osbb: true,
  electricity: true,
  general: true,
};

export const loadNotificationPrefs = async (): Promise<NotificationPrefs> => {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) {
      return DEFAULT_NOTIFICATION_PREFS;
    }

    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(JSON.parse(raw) as Partial<NotificationPrefs>),
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
};

export const saveNotificationPrefs = async (prefs: NotificationPrefs): Promise<void> => {
  await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
};

export const resolveNotificationCategory = (message: any): keyof NotificationPrefs => {
  const raw = String(
    message?.data?.category ||
    message?.data?.type ||
    message?.notification?.android?.channelId ||
    ''
  ).toLowerCase();

  if (raw.includes('request') || raw.includes('help')) return 'requests';
  if (raw.includes('chat') || raw.includes('message')) return 'chat';
  if (raw.includes('osbb') || raw.includes('vote') || raw.includes('news') || raw.includes('collection')) return 'osbb';
  if (raw.includes('electric')) return 'electricity';
  return 'general';
};
