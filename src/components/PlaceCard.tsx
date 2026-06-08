import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { Place, PlaceType } from '../types/app';
import { SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import TactileIcon from './TactileIcon';
import TactileCard from './TactileCard';
import { SCREEN_W } from '../utils/webDimensions';

interface PlaceCardProps {
  place: Place;
  onPress: () => void;
}

const CARD_WIDTH = SCREEN_W - 32;

const TYPE_COLORS: Record<PlaceType, string> = {
  [PlaceType.SHOP]: SCREEN_THEME.terracotta,
  [PlaceType.SCHOOL]: SCREEN_THEME.enamelBlue,
  [PlaceType.KINDERGARTEN]: '#4F8D5F',
  [PlaceType.CAFE]: SCREEN_THEME.woodGreen,
  [PlaceType.SERVICE]: '#5E6FA8',
  [PlaceType.PHARMACY]: '#C79C47',
  [PlaceType.SALON]: '#8A7AB1',
  [PlaceType.RESTAURANT]: '#B8713E',
  [PlaceType.BUILDING]: '#315B72',
};

const TYPE_NAMES: Record<'ua' | 'ru' | 'en', Record<PlaceType, string>> = {
  ua: {
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
  ru: {
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
  en: {
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
};

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

const PlaceCard: React.FC<PlaceCardProps> = ({ place, onPress }) => {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en');
  const typeColor = TYPE_COLORS[place.type];
  const typeName = TYPE_NAMES[language][place.type];

  return (
    <TactileCard onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <TactileIcon
          icon={TYPE_ICONS[place.type]}
          size={46}
          iconSize={22}
          backgroundColor={typeColor}
          tint="#FFF7E8"
        />
        <View style={styles.titleBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {place.name}
          </Text>
          <View
            style={[
              styles.typeLabel,
              { backgroundColor: `${typeColor}22`, borderColor: `${typeColor}55` },
            ]}
          >
            <Text style={[styles.typeText, { color: typeColor }]} numberOfLines={1}>{typeName}</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.address} numberOfLines={2}>
          {place.address || typeName}
        </Text>

        <View style={styles.footer}>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingStar}>★</Text>
            <Text style={styles.ratingValue}>{(place.rating || 0).toFixed(1)}</Text>
            <Text style={styles.reviews}>({place.reviews})</Text>
          </View>
          {place.workingHours ? (
            <Text style={styles.hours} numberOfLines={1}>
              {place.workingHours}
            </Text>
          ) : null}
        </View>
      </View>
    </TactileCard>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
    marginLeft: 11,
  },
  typeLabel: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    maxWidth: '100%',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  content: {
    paddingTop: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  address: {
    fontSize: 13,
    color: SCREEN_THEME.textSecondary,
    marginBottom: 9,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    minHeight: 27,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(199, 156, 71, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(199, 156, 71, 0.25)',
  },
  ratingStar: {
    fontSize: 14,
    color: '#C79C47',
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#AA7410',
    marginLeft: 3,
  },
  reviews: {
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    marginLeft: 4,
  },
  hours: {
    fontSize: 12,
    color: SCREEN_THEME.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
    fontWeight: '700',
    lineHeight: 16,
  },
});

export default React.memo(PlaceCard);
