import { useSelector } from 'react-redux';
import { translations, Language } from './translations';
import { RootState } from '../redux/store';
import { normalizeLanguage } from '../redux/slices/languageSlice';

export const useTranslation = () => {
  const language: Language = useSelector((state: RootState) => normalizeLanguage(state.language?.current));
  return { t: translations[language], language };
};
