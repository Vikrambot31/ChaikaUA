export type AppLang = 'ua' | 'ru' | 'en';

const LATIN_WORD_RE = /\b[A-Za-z]{2,}\b/u;
const CYRILLIC_WORD_RE = /[\p{Script=Cyrillic}]{2,}/u;

export const normalizeAppLang = (value: unknown, fallback: AppLang = 'ua'): AppLang => (
  value === 'ua' || value === 'ru' || value === 'en' ? value : fallback
);

export const getLanguageValidationError = (
  text: string,
  language: AppLang,
  context?: 'job_listings' | 'general',
): string | null => {
  // Allow mixed languages in job listings (IT terms are unavoidable)
  if (context === 'job_listings') {
    return null;
  }

  const hasLatinWord = LATIN_WORD_RE.test(text);
  const hasCyrillicWord = CYRILLIC_WORD_RE.test(text);

  if ((language === 'ua' || language === 'ru') && hasLatinWord) {
    return language === 'ua'
      ? 'У заявці знайдено англійські слова. Будь ласка, напишіть текст мовою застосунку.'
      : 'В заявке найдены английские слова. Пожалуйста, напишите текст на языке приложения.';
  }

  if (language === 'en' && hasCyrillicWord) {
    return 'The request contains non-English words. Please write it in the app language.';
  }

  return null;
};

export const assertTextMatchesLanguage = (
  text: string,
  language: AppLang,
): void => {
  const validationError = getLanguageValidationError(text, language);
  if (validationError) {
    throw new Error(validationError);
  }
};
