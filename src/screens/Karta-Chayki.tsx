import { Platform } from 'react-native';
import MapScreenNative from './Karta-Chayki.native';
import MapScreenWeb from './Karta-Chayki.web';

const MapScreen = Platform.OS === 'web' ? MapScreenWeb : MapScreenNative;

export default MapScreen;
