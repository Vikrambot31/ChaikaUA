import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { beautyInfoSeed, getActiveBeautyOffers } from '../services/beautySeed';
import { BeautyCategory, BeautyFeature, BeautyOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const TILE_GAP = 10;
const TILE_W = (Dimensions.get('window').width - 32 - TILE_GAP) / 2;
type CategoryKey = 'all' | BeautyCategory;
type ScreenText = (typeof UI_TEXT)[Lang];

const FEATURE_PRIORITY: BeautyFeature[] = [
  'home_visit', 'online_booking', 'kids_friendly', 'women', 'men',
  'parking', 'certificate', 'discount_first',
];

const FEATURE_ICONS: Record<BeautyFeature, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  home_visit: 'home-outline',
  online_booking: 'calendar-check-outline',
  kids_friendly: 'baby-face-outline',
  women: 'face-woman-outline',
  men: 'face-man-outline',
  parking: 'parking',
  certificate: 'gift-outline',
  discount_first: 'percent-outline',
};

const UI_TEXT = {
  ua: {
    title: 'Салони краси',
    subtitle: 'Перукарні, манікюр, косметологія поруч',
    searchPlaceholder: 'Пошук салону...',
    actualTitle: 'Актуальні пропозиції',
    actualEmptyTitle: 'Тут зʼявляться акції та знижки',
    actualEmptyText: 'Салони зможуть показувати свої акції, нових майстрів та вільні вікна для мешканців району.',
    categoriesTitle: 'Категорії',
    allPlacesTitle: 'Всі салони',
    noResults: 'Нічого не знайдено. Спробуйте змінити пошук або категорію.',
    noOffers: 'Поки що немає активних пропозицій.',
    details: 'Детальніше',
    validUntil: 'до',
    free: 'безкоштовно',
    priceFrom: 'від',
    currency: 'грн',
    priceUnknown: 'ціну уточнюйте',
    hasSlots: 'є вільні вікна',
    categories: {
      all: 'Всі',
      hair: 'Перукарні',
      nails: 'Нігті',
      cosmetology: 'Косметологія',
      massage: 'Масаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Перукарня',
      nails: 'Нігті',
      cosmetology: 'Косметологія',
      massage: 'Масаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'виїзд додому',
      online_booking: 'онлайн запис',
      kids_friendly: 'дитячі стрижки',
      women: 'жіночі послуги',
      men: 'чоловічі послуги',
      parking: 'парковка',
      certificate: 'сертифікати',
      discount_first: 'знижка новим',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'послуга',
      hour: 'год',
      session: 'сеанс',
    },
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      new_master: 'Новий майстер',
      discount: 'Знижка',
      available_slots: 'Є вікна',
    },
  },
  ru: {
    title: 'Салоны красоты',
    subtitle: 'Парикмахерские, маникюр, косметология рядом',
    searchPlaceholder: 'Поиск салона...',
    actualTitle: 'Актуальные предложения',
    actualEmptyTitle: 'Здесь появятся акции и скидки',
    actualEmptyText: 'Салоны смогут показывать свои акции, новых мастеров и свободные окна для жителей района.',
    categoriesTitle: 'Категории',
    allPlacesTitle: 'Все салоны',
    noResults: 'Ничего не найдено. Попробуйте изменить поиск или категорию.',
    noOffers: 'Пока нет активных предложений.',
    details: 'Подробнее',
    validUntil: 'до',
    free: 'бесплатно',
    priceFrom: 'от',
    currency: 'грн',
    priceUnknown: 'цену уточняйте',
    hasSlots: 'есть свободные окна',
    categories: {
      all: 'Все',
      hair: 'Парикмахерские',
      nails: 'Ногти',
      cosmetology: 'Косметология',
      massage: 'Массаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Парикмахерская',
      nails: 'Ногти',
      cosmetology: 'Косметология',
      massage: 'Массаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'выезд на дом',
      online_booking: 'онлайн запись',
      kids_friendly: 'детские стрижки',
      women: 'женские услуги',
      men: 'мужские услуги',
      parking: 'парковка',
      certificate: 'сертификаты',
      discount_first: 'скидка новым',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'услуга',
      hour: 'час',
      session: 'сеанс',
    },
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      new_master: 'Новый мастер',
      discount: 'Скидка',
      available_slots: 'Есть окна',
    },
  },
  en: {
    title: 'Beauty salons',
    subtitle: 'Hair, nails, cosmetology nearby',
    searchPlaceholder: 'Search salon...',
    actualTitle: 'Current offers',
    actualEmptyTitle: 'Deals and discounts will appear here',
    actualEmptyText: 'Salons will be able to show their promotions, new masters and available slots for local residents.',
    categoriesTitle: 'Categories',
    allPlacesTitle: 'All salons',
    noResults: 'Nothing found. Try changing search or category.',
    noOffers: 'No active offers yet.',
    details: 'Details',
    validUntil: 'until',
    free: 'free',
    priceFrom: 'from',
    currency: 'UAH',
    priceUnknown: 'ask for price',
    hasSlots: 'slots available',
    categories: {
      all: 'All',
      hair: 'Hair salons',
      nails: 'Nails',
      cosmetology: 'Cosmetology',
      massage: 'Massage',
      barbershop: 'Barbershop',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Hair salon',
      nails: 'Nails',
      cosmetology: 'Cosmetology',
      massage: 'Massage',
      barbershop: 'Barbershop',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'home visit',
      online_booking: 'online booking',
      kids_friendly: 'kids friendly',
      women: 'women',
      men: 'men',
      parking: 'parking',
      certificate: 'gift cards',
      discount_first: 'first visit discount',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'service',
      hour: 'hr',
      session: 'session',
    },
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      new_master: 'New master',
      discount: 'Discount',
      available_slots: 'Slots available',
    },
  },
} as const;

const CATEGORIES: { key: CategoryKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; bg: string; iconColor: string }[] = [
  { key: 'all', icon: 'view-grid-outline', bg: '#7E9D69', iconColor: '#FFF7DE' },
  { key: 'hair', icon: 'content-cut', bg: '#C77A5D', iconColor: '#FFF0E6' },
  { key: 'nails', icon: 'hand-back-right-outline', bg: '#D4668E', iconColor: '#FFF0F5' },
  { key: 'cosmetology', icon: 'face-woman-shimmer', bg: '#7B6EB1', iconColor: '#F3EEFF' },
  { key: 'massage', icon: 'hand-heart-outline', bg: '#4F8D5F', iconColor: '#F0FBF2' },
  { key: 'barbershop', icon: 'face-man-outline', bg: '#4D7892', iconColor: '#EEF5FA' },
  { key: 'spa', icon: 'spa-outline', bg: '#00897B', iconColor: '#E0F7F4' },
];

const mergeBeautyInfo = (place: Place): Place => {
  const seed = beautyInfoSeed[place.id];
  if (!seed) return place;
  return { ...place, beautyInfo: seed };
};

const formatOfferDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getOfferMeta = (offer: BeautyOffer, text: ScreenText) => {
  const parts: string[] = [];
  if (offer.validUntil) parts.push(`${text.validUntil} ${formatOfferDate(offer.validUntil)}`);
  if (offer.discountPercent != null) parts.push(`-${offer.discountPercent}%`);
  if (offer.price === 0) parts.push(text.free);
  return parts.join(' · ');
};

const getPriceLabel = (place: Place, text: ScreenText) => {
  const price = place.beautyInfo?.priceFrom;
  if (!price) return text.priceUnknown;
  const period = place.beautyInfo?.pricePeriod ? text.periods[place.beautyInfo.pricePeriod] : text.periods.service;
  return `${text.priceFrom} ${price} ${text.currency}/${period}`;
};

const getFeatureBadges = (place: Place, text: ScreenText) => {
  const features = new Set(place.beautyInfo?.features ?? []);
  const badges: { key: string; label: string }[] = FEATURE_PRIORITY
    .filter((feature) => features.has(feature))
    .map((feature) => ({ key: feature, label: text.features[feature] }));
  if (place.beautyInfo?.hasAvailableSlots) badges.unshift({ key: 'slots', label: text.hasSlots });
  return badges.slice(0, 4);
};

const getCategoryIcon = (category: BeautyCategory): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
  const map: Record<BeautyCategory, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    hair: 'content-cut',
    nails: 'hand-back-right-outline',
    cosmetology: 'face-woman-shimmer',
    massage: 'hand-heart-outline',
    barbershop: 'face-man-outline',
    spa: 'spa-outline',
  };
  return map[category];
};

export default function SalonyKrasotyScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [query, setQuery] = useState('');

  const beautyPlaces = useMemo(() => (
    chaykaPlaces
      .map((raw) => {
        const place = mergeBeautyInfo(raw);
        const category = place.beautyInfo?.category ?? null;
        return { place, category };
      })
      .filter((item): item is { place: Place; category: BeautyCategory } => Boolean(item.category))
  ), []);

  const categoryCounts = useMemo(() => {
    const counts = CATEGORIES.reduce<Record<CategoryKey, number>>((acc, item) => {
      acc[item.key] = 0;
      return acc;
    }, {} as Record<CategoryKey, number>);
    counts.all = beautyPlaces.length;
    beautyPlaces.forEach(({ category }) => {
      counts[category] += 1;
    });
    return counts;
  }, [beautyPlaces]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return beautyPlaces.filter(({ place, category }) => {
      if (activeCategory !== 'all' && category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      return `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery);
    });
  }, [activeCategory, beautyPlaces, query]);

  const activeOffers = useMemo(() => getActiveBeautyOffers(), []);

  const openPlace = (place: Place) => {
    navigation.navigate('DetalSalonaScreen', { place });
  };

  const openOffer = (offer: BeautyOffer) => {
    navigation.navigate('DetalPredlozheniyaSalonaScreen', { offer });
  };

  const renderOfferCard = (offer: BeautyOffer, wide = false) => {
    const offerPlace = chaykaPlaces.find((p) => p.id === offer.placeId);
    const offerMeta = getOfferMeta(offer, text);
    return (
      <TouchableOpacity
        key={offer.id}
        style={[styles.offerCard, wide && styles.offerCardWide]}
        activeOpacity={0.88}
        onPress={() => openOffer(offer)}
      >
        <View style={styles.offerBadge}>
          <Text style={styles.offerBadgeText}>{text.offerTypes[offer.type]}</Text>
        </View>
        <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
        <Text style={styles.offerShortText} numberOfLines={wide ? 3 : 2}>{offer.shortText}</Text>
        {offerMeta ? <Text style={styles.offerMeta} numberOfLines={1}>{offerMeta}</Text> : null}
        {offerPlace ? <Text style={styles.offerPlaceName} numberOfLines={1}>{offerPlace.name}</Text> : null}
      </TouchableOpacity>
    );
  };

  const renderPlaceCard = ({ place, category }: { place: Place; category: BeautyCategory }) => {
    const featureBadges = getFeatureBadges(place, text);
    return (
      <TouchableOpacity key={place.id} style={styles.placeCard} activeOpacity={0.88} onPress={() => openPlace(place)}>
        <View style={styles.placeHeader}>
          <View style={styles.placeIconWrap}>
            <MaterialCommunityIcons
              name={getCategoryIcon(category)}
              size={24}
              color={SCREEN_THEME.enamelBlueDark}
            />
          </View>
          <View style={styles.placeTitleBlock}>
            <Text style={styles.placeTitle} numberOfLines={2}>{place.name}</Text>
            <Text style={styles.placeMeta} numberOfLines={1}>{text.categoryLabel[category]} · {getPriceLabel(place, text)}</Text>
          </View>
        </View>

        <View style={styles.addressRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color={SCREEN_THEME.textMuted} />
          <Text style={styles.addressText} numberOfLines={1}>{place.address}</Text>
        </View>

        {featureBadges.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureBadges.map((badge) => (
              <View key={badge.key} style={styles.badge}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => openPlace(place)} activeOpacity={0.85}>
            <Text style={styles.primaryActionText}>{text.details}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={22} color={SCREEN_THEME.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={text.searchPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{text.actualTitle}</Text>
        </View>
        {activeOffers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offersRow}>
            {activeOffers.map((offer) => renderOfferCard(offer))}
          </ScrollView>
        ) : (
          <View style={styles.actualCard}>
            <View style={styles.actualIcon}>
              <MaterialCommunityIcons name="content-cut" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.actualTextBlock}>
              <Text style={styles.actualTitle}>{text.actualEmptyTitle}</Text>
              <Text style={styles.actualText}>{text.actualEmptyText}</Text>
            </View>
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{text.categoriesTitle}</Text>
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category, index) => {
            const isActive = activeCategory === category.key;
            const isRightCol = index % 2 === 1;
            return (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.categoryTile,
                  { backgroundColor: category.bg },
                  isRightCol && styles.categoryTileRight,
                  isActive && styles.categoryTileActive,
                ]}
                onPress={() => setActiveCategory(category.key)}
                activeOpacity={0.82}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View pointerEvents="none" style={styles.categoryTileIconWrap}>
                  <MaterialCommunityIcons
                    name={category.icon}
                    size={34}
                    color={category.iconColor}
                  />
                </View>
                <Text style={styles.categoryTileText}>
                  {text.categories[category.key]}
                </Text>
                <View pointerEvents="none" style={styles.categoryTileCountBadge}>
                  <Text style={styles.categoryTileCount}>{categoryCounts[category.key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{text.allPlacesTitle}</Text>
          <Text style={styles.resultCount}>{filteredPlaces.length}</Text>
        </View>

        {filteredPlaces.length > 0 ? (
          <View style={styles.cardList}>
            {filteredPlaces.map((item) => renderPlaceCard(item))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
            <Text style={styles.emptyText}>{text.noResults}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  content: {
    padding: 16,
    paddingBottom: 34,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
    marginRight: 12,
  },
  heroTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  resultCount: {
    minWidth: 30,
    textAlign: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: SCREEN_THEME.accentCream,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '900',
  },
  actualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7E3',
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  actualIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4668E',
    marginRight: 12,
  },
  actualTextBlock: {
    flex: 1,
  },
  actualTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  actualText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  categoryTile: {
    width: TILE_W,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 8,
    minHeight: 96,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 1, height: 4 },
    elevation: 5,
    marginBottom: TILE_GAP,
  },
  categoryTileRight: {
    marginLeft: TILE_GAP,
  },
  categoryTileActive: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shadowOpacity: 0.36,
    shadowRadius: 10,
    elevation: 8,
  },
  categoryTileIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
  },
  categoryTileText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  categoryTileCountBadge: {
    marginTop: 6,
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  categoryTileCount: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardList: {
    gap: 10,
    marginBottom: 18,
  },
  placeCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8EEF3',
    marginRight: 12,
  },
  placeTitleBlock: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  placeMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addressText: {
    flex: 1,
    marginLeft: 5,
    color: SCREEN_THEME.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: SCREEN_THEME.accentCream,
  },
  badgeText: {
    fontSize: 11,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  primaryAction: {
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  emptyText: {
    marginTop: 10,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
  },
  offersRow: {
    paddingBottom: 16,
    gap: 10,
  },
  offerCard: {
    width: 220,
    backgroundColor: '#FFF7E3',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  offerCardWide: {
    width: '100%',
  },
  offerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#D4668E',
    marginBottom: 6,
  },
  offerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 18,
  },
  offerShortText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 16,
  },
  offerMeta: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: SCREEN_THEME.terracottaDark,
  },
  offerPlaceName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
});
