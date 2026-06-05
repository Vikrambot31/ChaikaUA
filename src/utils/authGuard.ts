import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

type AppLanguage = 'ua' | 'ru' | 'en';

const TEXT = {
  ua: {
    title: '\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044f',
    body: '\u0429\u043e\u0431 \u0432\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0434\u0435\u0442\u0430\u043b\u0456, \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0438 \u0442\u0430 \u043f\u0440\u043e\u0444\u0456\u043b\u044c, \u0443\u0432\u0456\u0439\u0434\u0456\u0442\u044c \u0430\u0431\u043e \u0437\u0430\u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0439\u0442\u0435\u0441\u044c.',
    login: '\u0423\u0432\u0456\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0432\u0430\u0442\u0438\u0441\u044c',
    cancel: 'OK',
  },
  ru: {
    title: '\u041d\u0443\u0436\u043d\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f',
    body: '\u0427\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0434\u0435\u0442\u0430\u043b\u0438, \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b \u0438 \u043f\u0440\u043e\u0444\u0438\u043b\u044c, \u0432\u043e\u0439\u0434\u0438\u0442\u0435 \u0438\u043b\u0438 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u0443\u0439\u0442\u0435\u0441\u044c.',
    login: '\u0412\u043e\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f',
    cancel: 'OK',
  },
  en: {
    title: 'Registration required',
    body: 'Sign in or register to open details, contacts, and profiles.',
    login: 'Sign in / Register',
    cancel: 'OK',
  },
} as const;

const normalizeLanguage = (language: string | undefined): AppLanguage => {
  if (language === 'ru' || language === 'en') return language;
  return 'ua';
};

export const requireAuthForDetails = ({
  userId,
  navigation,
  language,
}: {
  userId?: string | null;
  navigation?: NavigationProp<ParamListBase> | NavigationProp<Record<string, object | undefined>>;
  language?: string;
}): boolean => {
  if (userId) return true;

  const text = TEXT[normalizeLanguage(language)];
  const nav = navigation as NavigationProp<ParamListBase> | undefined;

  Alert.alert(text.title, text.body, [
    ...(nav ? [{ text: text.login, onPress: () => nav.navigate('LoginScreen', {}) }] : []),
    { text: text.cancel, style: 'cancel' as const },
  ]);

  return false;
};
