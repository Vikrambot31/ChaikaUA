import { Alert } from 'react-native';
import { firebaseChatAPI } from '../firebase-config';

type Lang = 'ua' | 'ru' | 'en';

// Accepts any React Navigation prop. The real `navigate` is a generic,
// route-typed overload that is not assignable to a plain `(string, params)`
// signature, so we widen the args to stay compatible with every caller.
type NavigationLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigate: (...args: any[]) => void;
};

const TEXT = {
  ua: {
    limitTitle: 'Ліміт на сьогодні',
    limitBody: 'Сьогодні ви вже надіслали {count} з {limit} прохань про допомогу. Нову заявку можна буде створити завтра.',
  },
  ru: {
    limitTitle: 'Лимит на сегодня',
    limitBody: 'Сегодня вы уже отправили {count} из {limit} просьб о помощи. Новую заявку можно будет создать завтра.',
  },
  en: {
    limitTitle: 'Daily limit reached',
    limitBody: 'You have already sent {count} of {limit} help requests today. You can create a new request tomorrow.',
  },
} as const;

const fillTemplate = (template: string, values: Record<string, string | number>) => (
  Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template)
);

export const openRequestFormWithLimitCheck = async (
  navigation: NavigationLike,
  language: Lang,
): Promise<boolean> => {
  const text = TEXT[language] ?? TEXT.ua;
  const result = await firebaseChatAPI.getHelpNeighborsDailyLimitStatus();

  if (!result.success) {
    // Limit check failed (network/auth/permission error) — let the user proceed.
    // The form's own addRequest enforces the daily limit server-side anyway.
    navigation.navigate('RequestFormScreen', { group: 'help_neighbors' });
    return true;
  }

  if (!result.data.allowed) {
    Alert.alert(
      text.limitTitle,
      fillTemplate(text.limitBody, {
        count: result.data.count,
        limit: result.data.limit,
      }),
    );
    return false;
  }

  navigation.navigate('RequestFormScreen', { group: 'help_neighbors' });
  return true;
};
