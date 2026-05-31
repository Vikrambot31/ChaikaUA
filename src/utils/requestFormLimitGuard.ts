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
    checkFailedTitle: 'Не вдалося перевірити ліміт',
    checkFailedBody: 'Потрібен інтернет, щоб перевірити денний ліміт перед створенням заявки. Спробуйте ще раз.',
  },
  ru: {
    limitTitle: 'Лимит на сегодня',
    limitBody: 'Сегодня вы уже отправили {count} из {limit} просьб о помощи. Новую заявку можно будет создать завтра.',
    checkFailedTitle: 'Не удалось проверить лимит',
    checkFailedBody: 'Нужен интернет, чтобы проверить дневной лимит перед созданием заявки. Попробуйте ещё раз.',
  },
  en: {
    limitTitle: 'Daily limit reached',
    limitBody: 'You have already sent {count} of {limit} help requests today. You can create a new request tomorrow.',
    checkFailedTitle: 'Could not check the limit',
    checkFailedBody: 'Internet is needed to check the daily limit before creating a request. Try again.',
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
    Alert.alert(text.checkFailedTitle, text.checkFailedBody);
    return false;
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
