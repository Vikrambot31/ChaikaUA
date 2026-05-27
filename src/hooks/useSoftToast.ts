import Toast from 'react-native-toast-message';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { normalizeLanguage } from '../redux/slices/languageSlice';

type SoftToastType = 'success' | 'error' | 'info' | 'warning';
type LocalizedText = Partial<Record<'ua' | 'ru' | 'en', string>>;

const DEFAULT_TITLE = {
  success: { ua: 'Готово', ru: 'Готово', en: 'Done' },
  error: { ua: 'Щось пішло не так', ru: 'Что-то пошло не так', en: 'Something went wrong' },
  info: { ua: 'Підказка', ru: 'Подсказка', en: 'Hint' },
  warning: { ua: 'Зверніть увагу', ru: 'Обратите внимание', en: 'Please check' },
} as const;

const resolveText = (value: LocalizedText | string | undefined, language: 'ua' | 'ru' | 'en'): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value[language] ?? value.ua ?? value.en ?? value.ru;
};

export function useSoftToast() {
  const language = useSelector((state: RootState) => normalizeLanguage(state.language?.current));

  const show = (type: SoftToastType, title?: LocalizedText | string, message?: LocalizedText | string) => {
    Toast.show({
      type,
      position: 'bottom',
      visibilityTime: type === 'error' ? 5500 : 4000,
      text1: resolveText(title, language) ?? DEFAULT_TITLE[type][language],
      text2: resolveText(message, language),
    });
  };

  return {
    language,
    showSuccess: (title?: LocalizedText | string, message?: LocalizedText | string) => show('success', title, message),
    showError: (title?: LocalizedText | string, message?: LocalizedText | string) => show('error', title, message),
    showInfo: (title?: LocalizedText | string, message?: LocalizedText | string) => show('info', title, message),
    showWarning: (title?: LocalizedText | string, message?: LocalizedText | string) => show('warning', title, message),
  };
}

export default useSoftToast;
