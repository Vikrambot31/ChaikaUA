import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Language } from '../../i18n/translations';

export interface LanguageState {
  current: Language;
}

const VALID_LANGUAGES: Language[] = ['ua', 'ru', 'en'];

export function normalizeLanguage(value: unknown): Language {
  if (typeof value === 'string' && (VALID_LANGUAGES as string[]).includes(value)) {
    return value as Language;
  }
  return 'ua';
}

const initialState: LanguageState = {
  current: 'ua',
};

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    setLanguage: (state, action: PayloadAction<Language>) => {
      state.current = normalizeLanguage(action.payload);
    },
  },
});

export const { setLanguage } = languageSlice.actions;
export default languageSlice.reducer;
