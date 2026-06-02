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
import { childInfoSeed, getActiveOffers } from '../services/childrenSeed';
import { ChildCategory, ChildFeature, ChildOffer, Place, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const TILE_GAP = 10;
const TILE_W = (Dimensions.get('window').width - 32 - TILE_GAP) / 2;
type CategoryKey = 'all' | ChildCategory;
type ScreenText = (typeof UI_TEXT)[Lang];

const FEATURE_PRIORITY: ChildFeature[] = ['shelter', 'food', 'english', 'speech_therapist', 'nurse', 'full_day', 'half_day', 'trial_day', 'sport'];

const UI_TEXT = {
  ua: {
    title: 'Все для дітей',
    subtitle: 'Садочки, школи, гуртки та події поруч',
    searchPlaceholder: 'Пошук: садок, школа, логопед...',
    actualTitle: 'Актуально для дітей',
    actualEmptyTitle: 'Тут зʼявляться відкриті дні та акції',
    actualEmptyText: 'Садочки, школи та гуртки зможуть показувати набори, пробні заняття й події для мешканців району.',
    categoriesTitle: 'Категорії',
    allPlacesTitle: 'Всі місця для дітей',
    eventsListTitle: 'Події та пропозиції',
    noResults: 'Нічого не знайдено. Спробуйте змінити пошук або категорію.',
    noOffers: 'Поки що немає активних подій або пропозицій.',
    details: 'Детальніше',
    call: 'Подзвонити',
    telegram: 'Telegram',
    validUntil: 'до',
    free: 'безкоштовно',
    priceFrom: 'від',
    currency: 'грн',
    priceUnknown: 'ціну уточнюйте',
    ageUnknown: 'вік уточнюйте',
    available: 'є місця',
    categories: {
      all: 'Всі',
      kindergarten: 'Садочки',
      school: 'Школи',
      development: 'Розвиток',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'Події',
    },
    categoryLabel: {
      kindergarten: 'Садочок',
      school: 'Школа',
      development: 'Розвиток',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'Подія',
    },
    features: {
      shelter: 'є укриття',
      food: 'харчування',
      english: 'англійська',
      speech_therapist: 'логопед',
      nurse: 'медсестра',
      sport: 'спорт',
      full_day: 'повний день',
      half_day: 'неповний день',
      trial_day: 'пробний день',
    },
    periods: {
      month: 'міс',
      lesson: 'заняття',
      day: 'день',
      once: 'разово',
    },
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      open_day: 'Відкритий день',
      trial_lesson: 'Пробне заняття',
      available_places: 'Є місця',
    },
  },
  ru: {
    title: 'Все для детей',
    subtitle: 'Садики, школы, кружки и события рядом',
    searchPlaceholder: 'Поиск: садик, школа, логопед...',
    actualTitle: 'Актуально для детей',
    actualEmptyTitle: 'Здесь появятся открытые дни и акции',
    actualEmptyText: 'Садики, школы и кружки смогут показывать наборы, пробные занятия и события для жителей района.',
    categoriesTitle: 'Категории',
    allPlacesTitle: 'Все места для детей',
    eventsListTitle: 'События и предложения',
    noResults: 'Ничего не найдено. Попробуйте изменить поиск или категорию.',
    noOffers: 'Пока нет активных событий или предложений.',
    details: 'Подробнее',
    call: 'Позвонить',
    telegram: 'Telegram',
    validUntil: 'до',
    free: 'бесплатно',
    priceFrom: 'от',
    currency: 'грн',
    priceUnknown: 'цену уточняйте',
    ageUnknown: 'возраст уточняйте',
    available: 'есть места',
    categories: {
      all: 'Все',
      kindergarten: 'Садики',
      school: 'Школы',
      development: 'Развитие',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'События',
    },
    categoryLabel: {
      kindergarten: 'Садик',
      school: 'Школа',
      development: 'Развитие',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'Событие',
    },
    features: {
      shelter: 'есть укрытие',
      food: 'питание',
      english: 'английский',
      speech_therapist: 'логопед',
      nurse: 'медсестра',
      sport: 'спорт',
      full_day: 'полный день',
      half_day: 'неполный день',
      trial_day: 'пробный день',
    },
    periods: {
      month: 'мес',
      lesson: 'занятие',
      day: 'день',
      once: 'разово',
    },
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      open_day: 'Открытый день',
      trial_lesson: 'Пробное занятие',
      available_places: 'Есть места',
    },
  },
  en: {
    title: 'Everything for Kids',
    subtitle: 'Kindergartens, schools, clubs and nearby events',
    searchPlaceholder: 'Search: kindergarten, school, speech therapist...',
    actualTitle: 'Relevant for kids',
    actualEmptyTitle: 'Open days and offers will appear here',
    actualEmptyText: 'Kindergartens, schools and clubs will be able to show enrollments, trial lessons and local events.',
    categoriesTitle: 'Categories',
    allPlacesTitle: 'All kids places',
    eventsListTitle: 'Events and offers',
    noResults: 'Nothing found. Try changing search or category.',
    noOffers: 'No active events or offers yet.',
    details: 'Details',
    call: 'Call',
    telegram: 'Telegram',
    validUntil: 'until',
    free: 'free',
    priceFrom: 'from',
    currency: 'UAH',
    priceUnknown: 'ask for price',
    ageUnknown: 'ask for age',
    available: 'spots available',
    categories: {
      all: 'All',
      kindergarten: 'Kindergartens',
      school: 'Schools',
      development: 'Development',
      sport: 'Sport',
      medical: 'Medical',
      event: 'Events',
    },
    categoryLabel: {
      kindergarten: 'Kindergarten',
      school: 'School',
      development: 'Development',
      sport: 'Sport',
      medical: 'Medical',
      event: 'Event',
    },
    features: {
      shelter: 'shelter',
      food: 'food',
      english: 'English',
      speech_therapist: 'speech therapist',
      nurse: 'nurse',
      sport: 'sport',
      full_day: 'full day',
      half_day: 'half day',
      trial_day: 'trial day',
    },
    periods: {
      month: 'mo',
      lesson: 'lesson',
      day: 'day',
      once: 'once',
    },
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      open_day: 'Open day',
      trial_lesson: 'Trial lesson',
      available_places: 'Spots available',
    },
  },
} as const;

const CATEGORIES: { key: CategoryKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; bg: string; iconColor: string }[] = [
  { key: 'all', icon: 'view-grid-outline', bg: '#7E9D69', iconColor: '#FFF7DE' },
  { key: 'kindergarten', icon: 'baby-face-outline', bg: '#C77A5D', iconColor: '#FFF0E6' },
  { key: 'school', icon: 'school-outline', bg: '#5F84B4', iconColor: '#F7FAFF' },
  { key: 'development', icon: 'puzzle-outline', bg: '#9BB77B', iconColor: '#F5FBEF' },
  { key: 'sport', icon: 'basketball', bg: '#E8A44A', iconColor: '#FFF8EC' },
  { key: 'medical', icon: 'medical-bag', bg: '#D87B8C', iconColor: '#FFF0F3' },
  { key: 'event', icon: 'calendar-star', bg: '#8D7AB8', iconColor: '#F3EEFF' },
];

const mergeChildInfo = (place: Place): Place => {
  const seed = childInfoSeed[place.id];
  if (!seed) return place;
  return { ...place, childInfo: seed };
};

const formatOfferDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getOfferMeta = (offer: ChildOffer, text: ScreenText) => {
  const parts: string[] = [];
  if (offer.dateFrom) parts.push(formatOfferDate(offer.dateFrom));
  if (!offer.dateFrom && offer.validUntil) parts.push(`${text.validUntil} ${formatOfferDate(offer.validUntil)}`);
  if (offer.discountPercent != null) parts.push(`-${offer.discountPercent}%`);
  if (offer.price === 0) parts.push(text.free);
  return parts.join(' · ');
};

const getChildCategory = (place: Place): ChildCategory | null => {
  if (place.childInfo?.category) return place.childInfo.category;

  const name = place.name.toLowerCase();
  if (place.type === PlaceType.KINDERGARTEN) return 'kindergarten';
  if (place.type === PlaceType.PHARMACY) return 'medical';
  if (name.includes('танц') || name.includes('dance') || name.includes('спорт')) return 'sport';
  if (name.includes('клуб') || name.includes('kids club') || name.includes('раннего развития')) return 'development';
  if (place.type === PlaceType.SCHOOL) return 'school';

  return null;
};

const getAgeLabel = (place: Place, text: ScreenText) => {
  const ageFrom = place.childInfo?.ageFrom;
  const ageTo = place.childInfo?.ageTo;
  if (typeof ageFrom === 'number' && typeof ageTo === 'number') return `${ageFrom}-${ageTo}`;
  if (typeof ageFrom === 'number') return `${ageFrom}+`;
  return text.ageUnknown;
};

const getPriceLabel = (place: Place, text: ScreenText) => {
  const price = place.childInfo?.priceFrom;
  if (!price) return text.priceUnknown;
  const period = place.childInfo?.pricePeriod ? text.periods[place.childInfo.pricePeriod] : text.periods.month;
  return `${text.priceFrom} ${price} ${text.currency}/${period}`;
};

const getFeatureBadges = (place: Place, text: ScreenText) => {
  const features = new Set(place.childInfo?.features ?? []);
  if (place.childInfo?.safety?.hasShelter) features.add('shelter');
  if (place.childInfo?.medical?.hasNurse) features.add('nurse');

  const badges: { key: string; label: string }[] = FEATURE_PRIORITY
    .filter((feature) => features.has(feature))
    .map((feature) => ({ key: feature, label: text.features[feature] }));
  if (place.childInfo?.hasAvailablePlaces) badges.unshift({ key: 'available', label: text.available });
  return badges.slice(0, 4);
};

export default function VseDlyaDeteyScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [query, setQuery] = useState('');

  const childPlaces = useMemo(() => (
    chaykaPlaces
      .map((raw) => {
        const place = mergeChildInfo(raw);
        return { place, category: getChildCategory(place) };
      })
      .filter((item): item is { place: Place; category: ChildCategory } => Boolean(item.category))
  ), []);

  const categoryCounts = useMemo(() => {
    const counts = CATEGORIES.reduce<Record<CategoryKey, number>>((acc, item) => {
      acc[item.key] = 0;
      return acc;
    }, {} as Record<CategoryKey, number>);
    counts.all = childPlaces.length;
    childPlaces.forEach(({ category }) => {
      counts[category] += 1;
    });
    counts.event = getActiveOffers().length;
    return counts;
  }, [childPlaces]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return childPlaces.filter(({ place, category }) => {
      if (activeCategory !== 'all' && category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      return `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery);
    });
  }, [activeCategory, childPlaces, query]);

  const activeOffers = useMemo(() => getActiveOffers(), []);
  const isEventsCategory = activeCategory === 'event';

  const openPlace = (place: Place) => {
    navigation.navigate('DetalDetskogoMestaScreen', { place });
  };

  const openOffer = (offer: ChildOffer) => {
    navigation.navigate('DetalDetskogoPredlozheniyaScreen', { offer });
  };

  const handleCategoryPress = (category: CategoryKey) => {
    setActiveCategory(category);
  };

  const renderOfferCard = (offer: ChildOffer, wide = false) => {
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

  const renderPlaceCard = ({ place, category }: { place: Place; category: ChildCategory }, compact = false) => {
    const featureBadges = getFeatureBadges(place, text);
    return (
      <TouchableOpacity key={place.id} style={styles.placeCard} activeOpacity={0.88} onPress={() => openPlace(place)}>
        <View style={styles.placeHeader}>
          <View style={styles.placeIconWrap}>
            <MaterialCommunityIcons
              name={category === 'kindergarten' ? 'baby-face-outline' : category === 'medical' ? 'medical-bag' : category === 'sport' ? 'basketball' : category === 'development' ? 'puzzle-outline' : 'school-outline'}
              size={24}
              color={SCREEN_THEME.enamelBlueDark}
            />
          </View>
          <View style={styles.placeTitleBlock}>
            <Text style={styles.placeTitle} numberOfLines={2}>{place.name}</Text>
            <Text style={styles.placeMeta} numberOfLines={1}>{text.categoryLabel[category]} · {getAgeLabel(place, text)} · {getPriceLabel(place, text)}</Text>
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

        {!compact ? (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.primaryAction} onPress={() => openPlace(place)} activeOpacity={0.85}>
              <Text style={styles.primaryActionText}>{text.details}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
              <MaterialCommunityIcons name="calendar-star" size={24} color="#FFFFFF" />
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
                onPress={() => handleCategoryPress(category.key)}
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
          <Text style={styles.sectionTitle}>{isEventsCategory ? text.eventsListTitle : text.allPlacesTitle}</Text>
          <Text style={styles.resultCount}>{isEventsCategory ? activeOffers.length : filteredPlaces.length}</Text>
        </View>

        {isEventsCategory ? (
          activeOffers.length > 0 ? (
            <View style={styles.cardList}>
              {activeOffers.map((offer) => renderOfferCard(offer, true))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-remove-outline" size={34} color={SCREEN_THEME.textMuted} />
              <Text style={styles.emptyText}>{text.noOffers}</Text>
            </View>
          )
        ) : filteredPlaces.length > 0 ? (
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
    backgroundColor: SCREEN_THEME.terracotta,
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
    backgroundColor: '#EAF0F8',
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
    backgroundColor: SCREEN_THEME.terracotta,
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
