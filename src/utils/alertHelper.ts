/**
 * Alert Helper with i18n support
 */

import { Alert } from 'react-native';
import { translations, Language } from '../i18n/translations';
import { getUserErrorMessage, UserErrorContext } from './userFacingErrors';

let currentLanguage: Language = 'ua';

export const setAlertLanguage = (lang: Language): void => {
  currentLanguage = lang;
};

const t = (key: keyof typeof translations.ua.errors): string => {
  return translations[currentLanguage].errors[key];
};

export const showError = (message: string): void => {
  Alert.alert(t('general').split('.')[0], message);
};

export const showSuccess = (message: string): void => {
  Alert.alert(t('success'), message);
};

export const showAlert = (title: string, message: string): void => {
  Alert.alert(title, message);
};

export const AlertHelper = {
  // Common errors
  fillAllFields: () => Alert.alert(t('general').split('.')[0], t('fillAllFields')),
  checkPhone: () => Alert.alert(t('general').split('.')[0], t('checkPhone')),
  checkName: () => Alert.alert(t('general').split('.')[0], t('checkName')),
  selectCategory: () => Alert.alert(t('general').split('.')[0], t('selectCategory')),
  selectStreet: () => Alert.alert(t('general').split('.')[0], t('selectStreet')),
  rateAllCategories: () => Alert.alert(t('general').split('.')[0], t('rateAllCategories')),

  // Success messages
  success: (message: string) => Alert.alert(t('success'), message),
  requestSent: () => Alert.alert(t('success'), t('requestSent')),
  saved: () => Alert.alert(t('success'), t('saved')),
  published: () => Alert.alert(t('success'), t('published')),
  deleted: () => Alert.alert(t('success'), t('deleted')),
  updated: () => Alert.alert(t('success'), t('updated')),

  // Failures
  saveFailed: () => Alert.alert(t('general').split('.')[0], t('saveFailed')),
  sendFailed: () => Alert.alert(t('general').split('.')[0], t('sendFailed')),
  unableToShare: () => Alert.alert(t('general').split('.')[0], t('unableToShare')),

  // Custom
  error: (message: string) => Alert.alert(t('general').split('.')[0], message),
  userError: (context: UserErrorContext = 'unknown', error?: unknown) => Alert.alert(t('general').split('.')[0], getUserErrorMessage(currentLanguage, context, error)),

  // Network errors
  network: () => Alert.alert(t('general').split('.')[0], t('network')),
  timeout: () => Alert.alert(t('general').split('.')[0], t('timeout')),
  server: () => Alert.alert(t('general').split('.')[0], t('server')),

  // i18n
  setAlertLanguage: (lang: Language) => { currentLanguage = lang; },
};

export default AlertHelper;
