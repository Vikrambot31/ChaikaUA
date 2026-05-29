import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { UploadedPhoto } from '../components/PhotoUploadField';

type AppLanguage = 'ua' | 'ru' | 'en';

const TEXT = {
  ua: {
    title: 'Потрібен аватар',
    body: 'Для надсилання прохання потрібен профіль з аватаром. Завантажте своє фото або оберіть тимчасовий аватар.',
    uploadOwn: 'Своє фото',
    chooseAvatar: 'Тимчасовий аватар',
    ok: 'OK',
    photoLabel: 'Фото або аватар профілю',
    noAccountTitle: 'Потрібна реєстрація',
    noAccountBody: 'Щоб надіслати прохання про допомогу, увійдіть або зареєструйтесь.',
    noAccountBtn: 'Увійти / Зареєструватись',
  },
  ru: {
    title: 'Нужен аватар',
    body: 'Для отправки просьбы нужен профиль с аватаром. Загрузите своё фото или выберите временный аватар.',
    uploadOwn: 'Своё фото',
    chooseAvatar: 'Временный аватар',
    ok: 'OK',
    photoLabel: 'Фото или аватар профиля',
    noAccountTitle: 'Нужна регистрация',
    noAccountBody: 'Чтобы отправить просьбу о помощи, войдите или зарегистрируйтесь.',
    noAccountBtn: 'Войти / Зарегистрироваться',
  },
  en: {
    title: 'Avatar required',
    body: 'To send a request, your profile needs an avatar. Upload your own photo or choose a temporary one.',
    uploadOwn: 'Own photo',
    chooseAvatar: 'Temporary avatar',
    ok: 'OK',
    photoLabel: 'Profile photo or avatar',
    noAccountTitle: 'Registration required',
    noAccountBody: 'To send a help request, sign in or register.',
    noAccountBtn: 'Sign in / Register',
  },
} as const;

const normalizeLanguage = (language: string | undefined): AppLanguage => {
  if (language === 'ru' || language === 'en') return language;
  return 'ua';
};

export const getRequiredPhotoLabel = (language: string | undefined): string =>
  TEXT[normalizeLanguage(language)].photoLabel;

// Requires a real Firebase download URL — not a local file path.
// storagePath alone is not sufficient because other users cannot access it.
export const getDonePhotos = (photos: UploadedPhoto[]): UploadedPhoto[] =>
  photos.filter((photo) => photo.status === 'done' && Boolean(photo.downloadUrl) && /^https?:\/\//i.test(photo.downloadUrl));

export const validateSubmissionRequirements = ({
  language,
  userId,
  userPhotoURL,
  userStartAvatarKey,
  navigation,
}: {
  language: string | undefined;
  userId?: string;
  userPhotoURL?: string;
  userStartAvatarKey?: string;
  navigation?: NavigationProp<ParamListBase> | NavigationProp<Record<string, object | undefined>>;
}): boolean => {
  const text = TEXT[normalizeLanguage(language)];
  const hasAvatar = Boolean(userPhotoURL?.trim()) || Boolean(userStartAvatarKey?.trim());

  if (userId && hasAvatar) return true;

  const nav = navigation as NavigationProp<ParamListBase> | undefined;

  // No account at all — show simple login dialog
  if (!userId) {
    Alert.alert(text.noAccountTitle, text.noAccountBody, [
      ...(nav ? [{ text: text.noAccountBtn, onPress: () => nav.navigate('LoginScreen', {}) }] : []),
      { text: text.ok, style: 'cancel' as const },
    ]);
    return false;
  }

  // Has account but no avatar — show avatar options
  const routeState = nav?.getState?.();
  const currentRoute = routeState?.routes?.[routeState.index ?? routeState.routes.length - 1];

  Alert.alert(text.title, text.body, [
    ...(nav
      ? [
          {
            text: text.uploadOwn,
            onPress: () => nav.navigate('MyPhotosScreen'),
          },
          {
            text: text.chooseAvatar,
            onPress: () =>
              nav.navigate('StartAvatarPickerScreen', {
                redirectTo: currentRoute?.name,
                redirectParams: currentRoute?.params,
              }),
          },
        ]
      : []),
    { text: text.ok },
  ]);
  return false;
};
