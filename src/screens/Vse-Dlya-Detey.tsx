import React, { useMemo, useState } from 'react';
import {
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
    recommendedTitle: 'Є місця / Рекомендуємо поруч',
    allPlacesTitle: 'Всі місця для дітей',
    eventsListTitle: 'Події та пропозиції',
    noResults: 'Нічого не знайдено. Спробуйте змінити пошук або категорію.',
    noOffers: 'Поки що немає активних подій або пропозицій.',
    showPlaces: 'Розгорнути / показати місця',
    hidePlaces: 'Згорнути місця',
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
    recommendedTitle: 'Есть места / Рекомендуем рядом',
    allPlacesTitle: 'Все места для детей',
    eventsListTitle: 'События и предложения',
    noResults: 'Ничего не найдено. Попробуйте изменить поиск или категорию.',
    noOffers: 'Пока нет активных событий или предложений.',
    showPlaces: 'Развернуть / показать места',
    hidePlaces: 'Свернуть места',
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
    recommendedTitle: 'Available spots / Nearby picks',
    allPlacesTitle: 'All kids places',
    eventsListTitle: 'Events and offers',
    noResults: 'Nothing found. Try changing search or category.',
    noOffers: 'No active events or offers yet.',
    showPlaces: 'Expand / show places',
    hidePlaces: 'Collapse places',
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

const CATEGORIES: { key: CategoryKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'all', icon: 'view-grid-outline' },
  { key: 'kindergarten', icon: 'baby-face-outline' },
  { key: 'school', icon: 'school-outline' },
  { key: 'development', icon: 'puzzle-outline' },
  { key: 'sport', icon: 'basketball' },
  { key: 'medical', icon: 'medical-bag' },
  { key: 'event', icon: 'calendar-star' },
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

const getFeatureLabels = (place: Place, text: ScreenText) => {
  const features = new Set(place.childInfo?.features ?? []);
  if (place.childInfo?.safety?.hasShelter) features.add('shelter');
  if (place.childInfo?.medical?.hasNurse) features.add('nurse');

  const labels: string[] = FEATURE_PRIORITY.filter((feature) => features.has(feature)).map((feature) => text.features[feature]);
  if (place.childInfo?.hasAvailablePlaces) labels.unshift(text.available);
  return labels.slice(0, 4);
};

export default function VseDlyaDeteyScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [query, setQuery] = useState('');
  const [isRecommendedExpanded, setIsRecommendedExpanded] = useState(false);
  const [isAllPlacesExpanded, setIsAllPlacesExpanded] = useState(false);

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

  const recommendedPlaces = useMemo(() => filteredPlaces.slice(0, 4), [filteredPlaces]);

  const activeOffers = useMemo(() => getActiveOffers(), []);
  const isEventsCategory = activeCategory === 'event';

  const openPlace = (place: Place) => {
    navigation.navigate('DetalDetskogoMestaScreen', { place });
  };

  const openOffer = (offer: ChildOffer) => {
    navigation.navigate('DetalDetskogoPredlozheniyaScreen', { offer });
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
    const featureLabels = getFeatureLabels(place, text);
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

        {featureLabels.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureLabels.map((label) => (
              <View key={label} style={styles.badge}>
                <Text style={styles.badgeText}>{label}</Text>
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

  const renderExpandButton = (expanded: boolean, onPress: () => void) => (
    <TouchableOpacity style={styles.expandButton} activeOpacity={0.86} onPress={onPress}>
      <Text style={styles.expandButtonText}>{expanded ? text.hidePlaces : text.showPlaces}</Text>
      <MaterialCommunityIcons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={22}
        color={SCREEN_THEME.enamelBlueDark}
      />
    </TouchableOpacity>
  );

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {CATEGORIES.map((category) => {
            const isActive = activeCategory === category.key;
            return (
              <TouchableOpacity
                key={category.key}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                onPress={() => setActiveCategory(category.key)}
                activeOpacity={0.84}
              >
                <MaterialCommunityIcons
                  name={category.icon}
                  size={18}
                  color={isActive ? '#FFFFFF' : SCREEN_THEME.enamelBlueDark}
                />
                <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                  {text.categories[category.key]}
                </Text>
                <Text style={[styles.categoryCount, isActive && styles.categoryCountActive]}>{categoryCounts[category.key]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!isEventsCategory && recommendedPlaces.length > 0 ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{text.recommendedTitle}</Text>
            </View>
            {renderExpandButton(isRecommendedExpanded, () => setIsRecommendedExpanded((current) => !current))}
            {isRecommendedExpanded ? (
              <View style={styles.cardList}>
                {recommendedPlaces.map((item) => renderPlaceCard(item, true))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{isEventsCategory ? text.eventsListTitle : text.allPlacesTitle}</Text>
          <Text style={styles.resultCount}>{isEventsCategory ? activeOffers.length : filteredPlaces.length}</Text>
        </View>

        {!isEventsCategory && filteredPlaces.length > 0 ? (
          renderExpandButton(isAllPlacesExpanded, () => setIsAllPlacesExpanded((current) => !current))
        ) : null}

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
        ) : filteredPlaces.length > 0 && isAllPlacesExpanded ? (
          <View style={styles.cardList}>
            {filteredPlaces.map((item) => renderPlaceCard(item))}
          </View>
        ) : filteredPlaces.length > 0 ? null : (
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
  categoryList: {
    paddingBottom: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  categoryChipText: {
    marginLeft: 6,
    fontSize: 13,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  categoryCount: {
    marginLeft: 7,
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    fontWeight: '900',
  },
  categoryCountActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 12,
  },
  expandButtonText: {
    flex: 1,
    color: SCREEN_THEME.enamelBlueDark,
    fontSize: 15,
    fontWeight: '900',
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
