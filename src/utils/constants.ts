/**
 * Main constants for Chaika Life Mobile App
 */

import { Platform, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// App Name and Version
export const APP_NAME = 'Chaika Life';
export const APP_VERSION = '1.1.359';
export const APP_BUILD_DATE = '2026-05-31';
export const APP_BUILD_STAMP = '2026-05-16_13-00';
export const APP_COMMIT_HASH = 'no-git';
export const APP_BUILD_MODE = 'LOCAL_APK_PLUS_FIREBASE_DEPLOY';

// Color Palette
export const COLORS = {
  primary: '#7A1E5C',
  secondary: '#FFB300',
  accent: '#1976D2',
  background: '#F8F9FA',
  white: '#FFFFFF',
  black: '#1C1C1C',
  gray: '#9E9E9E',
  lightGray: '#E0E0E0',
  error: '#D32F2F',
  success: '#388E3C',
  warning: '#FBC02D',
};

// Typography and sizes
export const SIZES = {
  base: 8,
  fontSmall: 12,
  fontRegular: 14,
  fontMedium: 16,
  fontLarge: 18,
  fontExtraLarge: 24,
  radiusSmall: 4,
  radiusMedium: 8,
  radiusLarge: 12,
  width,
  height,
};

// Default region for maps
export const DEFAULT_REGION = {
  latitude: 50.4415,
  longitude: 30.29,
  latitudeDelta: 0.022,
  longitudeDelta: 0.022,
};

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  USER_DATA: '@user_data',
  SETTINGS: '@app_settings',
  IS_FIRST_LAUNCH: '@is_first_launch',
};

// Platform constants
export const IS_IOS = Platform.OS === 'ios';
export const IS_ANDROID = Platform.OS === 'android';
export const TAB_BAR_HEIGHT = IS_IOS ? 90 : 60;

// Content limits
export const LIMITS = {
  MAX_REQUEST_LENGTH: 130,
  MAX_REQUEST_TITLE_LENGTH: 50,
  MAX_IMAGE_UPLOAD_COUNT: 10,
  FREE_DAYS_LIMIT: 10,
};

// Place type colors
export const PLACE_TYPE_COLORS: Record<string, string> = {
  shop: '#FF4444',
  school: '#0066FF',
  cafe: '#00AA00',
  pharmacy: '#FFAA00',
  salon: '#AA00FF',
  restaurant: '#D2691E',
  building: '#315B72',
};

// Place type names
export const PLACE_TYPE_NAMES: Record<string, string> = {
  shop: 'Магазин',
  school: 'Школа',
  cafe: 'Кафе',
  pharmacy: 'Аптека',
  salon: 'Салон',
  restaurant: 'Ресторан',
  building: 'Дім',
};
