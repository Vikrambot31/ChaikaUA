import { Alert } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { UploadedPhoto } from '../components/PhotoUploadField';
import { auth } from '../firebase-config';

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

export const REQUEST_PHOTO_STORAGE_PATH_RE = /^requests\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|heic|heif)$/i;

// Requires a real Firebase download URL — not a local file path.
// storagePath alone is not sufficient because other users cannot access it.
export const getDonePhotos = (photos: UploadedPhoto[]): UploadedPhoto[] =>
  photos.filter((photo) => photo.status === 'done' && Boolean(photo.downloadUrl) && /^https?:\/\//i.test(photo.downloadUrl));

export const hasPhotoUploadInProgress = (photos: UploadedPhoto[]): boolean =>
  photos.some((photo) => photo.status === 'uploading');

export const getFirstDoneRequestPhoto = (photos: UploadedPhoto[]): { photoUri: string; photoStoragePath: string } | null => {
  const photo = getDonePhotos(photos).find((item) => REQUEST_PHOTO_STORAGE_PATH_RE.test(item.storagePath));
  if (!photo) return null;
  return {
    photoUri: photo.downloadUrl,
    photoStoragePath: photo.storagePath,
  };
};

export const validateSubmissionRequirements = ({
  language,
  userId,
  navigation,
}: {
  language: string | undefined;
  userId?: string;
  userPhotoURL?: string;
  userStartAvatarKey?: string;
  navigation?: NavigationProp<ParamListBase> | NavigationProp<Record<string, object | undefined>>;
}): boolean => {
  const text = TEXT[normalizeLanguage(language)];

  const resolvedId = userId ?? (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : undefined);
  if (resolvedId) return true;

  const nav = navigation as NavigationProp<ParamListBase> | undefined;

  // No account at all — show simple login dialog
  Alert.alert(text.noAccountTitle, text.noAccountBody, [
    ...(nav ? [{ text: text.noAccountBtn, onPress: () => nav.navigate('LoginScreen', {}) }] : []),
    { text: text.ok, style: 'cancel' as const },
  ]);
  return false;
};
