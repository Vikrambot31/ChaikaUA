import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Place, PlaceType } from '../types/app';
import TactileIcon from '../components/TactileIcon';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';

interface PlaceDetailsPanelProps {
  place?: Place | null;
  visible?: boolean;
  onClose?: () => void;
  onOpenInApp?: () => void;
}

type PlaceDetailsRoute = RouteProp<Record<string, { place?: Place } | undefined>, string>;

const UI_TEXT = {
  ua: {
    typeNames: {
      [PlaceType.SHOP]: 'Магазин',
      [PlaceType.SCHOOL]: 'Школа',
      [PlaceType.KINDERGARTEN]: 'Дитсадок',
      [PlaceType.CAFE]: 'Кафе',
      [PlaceType.SERVICE]: 'Послуга',
      [PlaceType.PHARMACY]: 'Аптека',
      [PlaceType.SALON]: 'Салон',
      [PlaceType.RESTAURANT]: 'Ресторан',
      [PlaceType.BUILDING]: 'Будинок',
    },
    openInApp: 'Відкрити в застосунку',
    openInGoogle: 'Відкрити в Google',
    chooseAction: 'Відкрити в Google чи відкрити у додатку на карті?',
  },
  ru: {
    typeNames: {
      [PlaceType.SHOP]: 'Магазин',
      [PlaceType.SCHOOL]: 'Школа',
      [PlaceType.KINDERGARTEN]: 'Детский сад',
      [PlaceType.CAFE]: 'Кафе',
      [PlaceType.SERVICE]: 'Услуга',
      [PlaceType.PHARMACY]: 'Аптека',
      [PlaceType.SALON]: 'Салон',
      [PlaceType.RESTAURANT]: 'Ресторан',
      [PlaceType.BUILDING]: 'Дом',
    },
    openInApp: 'Открыть в приложении',
    openInGoogle: 'Открыть в Google',
    chooseAction: 'Открыть в Google или открыть в приложении на карте?',
  },
  en: {
    typeNames: {
      [PlaceType.SHOP]: 'Shop',
      [PlaceType.SCHOOL]: 'School',
      [PlaceType.KINDERGARTEN]: 'Kindergarten',
      [PlaceType.CAFE]: 'Cafe',
      [PlaceType.SERVICE]: 'Service',
      [PlaceType.PHARMACY]: 'Pharmacy',
      [PlaceType.SALON]: 'Salon',
      [PlaceType.RESTAURANT]: 'Restaurant',
      [PlaceType.BUILDING]: 'Building',
    },
    openInApp: 'Open in app',
    openInGoogle: 'Open in Google',
    chooseAction: 'Open in Google or open in app map?',
  },
} as const;

const TYPE_ICONS: Record<PlaceType, React.ComponentProps<typeof TactileIcon>['icon']> = {
  [PlaceType.SHOP]: 'storefront-outline',
  [PlaceType.SCHOOL]: 'school-outline',
  [PlaceType.KINDERGARTEN]: 'human-male-board',
  [PlaceType.CAFE]: 'coffee-outline',
  [PlaceType.SERVICE]: 'tools',
  [PlaceType.PHARMACY]: 'medical-bag',
  [PlaceType.SALON]: 'content-cut',
  [PlaceType.RESTAURANT]: 'silverware-fork-knife',
  [PlaceType.BUILDING]: 'home-city-outline',
};

const PlaceDetailsPanel: React.FC<PlaceDetailsPanelProps> = ({ place, visible, onClose, onOpenInApp }) => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<PlaceDetailsRoute>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const resolvedPlace = place ?? route.params?.place ?? null;
  const resolvedVisible = visible ?? Boolean(resolvedPlace);
  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  if (!resolvedVisible || !resolvedPlace) return null;

  const handleOpenInGoogle = () => openInGoogleMaps(resolvedPlace.name, resolvedPlace.address);
  const handleOpenInApp = () => {
    if (onOpenInApp) {
      onOpenInApp();
      return;
    }
    navigation.navigate('MainTabs', { screen: 'MapTab', params: getMapFocusPlaceParams(resolvedPlace) });
    if (onClose) {
      onClose();
    }
  };

  return (
    <Modal visible={resolvedVisible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <TactileIcon icon={TYPE_ICONS[resolvedPlace.type]} size={42} iconSize={18} backgroundColor="#3B352E" />
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>{resolvedPlace.name}</Text>
              <Text style={styles.type}>{text.typeNames[resolvedPlace.type]}</Text>
            </View>
          </View>
          <Text style={styles.address} numberOfLines={2}>{resolvedPlace.address}</Text>
          <Text style={styles.question}>{text.chooseAction}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.ghostButton} onPress={handleOpenInApp} activeOpacity={0.85}>
              <Text style={styles.ghostText}>{text.openInApp}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mainButton} onPress={handleOpenInGoogle} activeOpacity={0.85}>
              <Text style={styles.mainText}>{text.openInGoogle}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  titleBlock: { marginLeft: 10, flex: 1 },
  title: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  type: { marginTop: 2, color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '800' },
  address: { marginTop: 8, color: SCREEN_THEME.textSecondary, lineHeight: 18 },
  question: { marginTop: 10, color: SCREEN_THEME.textSecondary, fontSize: 13 },
  actions: { marginTop: 12, flexDirection: 'row', gap: 10 },
  mainButton: {
    flex: 1,
    backgroundColor: SCREEN_THEME.terracottaDark,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostButton: {
    flex: 1,
    backgroundColor: '#8D7AB8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  mainText: { color: '#fff', fontWeight: '800' },
  ghostText: { color: SCREEN_THEME.terracottaDark, fontWeight: '700' },
});

export default PlaceDetailsPanel;
