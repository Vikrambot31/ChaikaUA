import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { UploadedPhoto } from '../components/PhotoUploadField';

type AppLanguage = 'ua' | 'ru' | 'en';

const TEXT = {
  ua: {
    title: 'Потрібен акаунт і аватар',
    body: 'Для повноцінної роботи потрібен профіль з аватаром. Можна завантажити своє фото або швидко вибрати тимчасовий аватар.',
    uploadOwn: 'Своє фото',
    chooseAvatar: 'Тимчасовий аватар',
    signIn: 'Реєстрація',
    ok: 'OK',
    photoLabel: 'Фото або аватар профілю',
  },
  ru: {
    title: 'Нужен аккаунт и аватар',
    body: 'Для полноценной работы нужен профиль с аватаром. Можно загрузить своё фото или быстро выбрать временный аватар.',
    uploadOwn: 'Своё фото',
    chooseAvatar: 'Временный аватар',
    signIn: 'Регистрация',
    ok: 'OK',
    photoLabel: 'Фото или аватар профиля',
  },
  en: {
    title: 'Account and avatar required',
    body: 'To use all features, create a profile with an avatar. You can upload your own photo or choose a temporary avatar.',
    uploadOwn: 'Own photo',
    chooseAvatar: 'Temporary avatar',
    signIn: 'Register',
    ok: 'OK',
    photoLabel: 'Profile photo or avatar',
  },
} as const;

const normalizeLanguage = (language: string | undefined): AppLanguage => {
  if (language === 'ru' || language === 'en') return language;
  return 'ua';
};

export const getRequiredPhotoLabel = (language: string | undefined): string =>
  TEXT[normalizeLanguage(language)].photoLabel;

export const getDonePhotos = (photos: UploadedPhoto[]): UploadedPhoto[] =>
  photos.filter((photo) => photo.status === 'done' && Boolean(photo.downloadUrl || photo.storagePath));

export const validateSubmissionRequirements = ({
  language,
  userId,
  userPhotoURL,
  navigation,
}: {
  language: string | undefined;
  userId?: string;
  userPhotoURL?: string;
  photos?: UploadedPhoto[];
  navigation?: NavigationProp<ParamListBase> | NavigationProp<Record<string, object | undefined>>;
}): boolean => {
  const text = TEXT[normalizeLanguage(language)];
  const hasAvatar = Boolean(userPhotoURL?.trim());

  if (userId && hasAvatar) return true;
  const nav = navigation as NavigationProp<ParamListBase> | undefined;
  const routeState = nav?.getState?.();
  const currentRoute = routeState?.routes?.[routeState.index ?? routeState.routes.length - 1];

  Alert.alert(text.title, text.body, [
    ...(nav
      ? [
          {
            text: text.uploadOwn,
            onPress: () => {
              if (userId) {
                nav.navigate('MyPhotosScreen');
                return;
              }
              nav.navigate('LoginScreen', {
                redirectTo: 'MyPhotosScreen',
                redirectMode: 'auth',
              });
            },
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
