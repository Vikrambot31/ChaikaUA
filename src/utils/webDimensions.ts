import { Dimensions, Platform } from 'react-native';

/** Max phone container width used for web preview */
const WEB_MAX_WIDTH = 430;
/** Max phone container height used for web preview */
const WEB_MAX_HEIGHT = 932;

const raw = Dimensions.get('window');

export const SCREEN_W: number = Platform.OS === 'web'
  ? Math.min(raw.width, WEB_MAX_WIDTH)
  : raw.width;

export const SCREEN_H: number = Platform.OS === 'web'
  ? Math.min(raw.height, WEB_MAX_HEIGHT)
  : raw.height;
