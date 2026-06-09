import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const OFFER_PLACEHOLDER = require('../../assets/_zaglushka-lenta.webp');
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ref, get } from 'firebase/database';
import { database } from '../firebase-core';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { CHILDREN_SCREEN_BLACKLIST, childInfoSeed, getActiveOffers } from '../services/childrenSeed';
import { ChildCategory, ChildFeature, ChildOffer, Place, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { subscribeActiveBonusPromotions, subscribeBiznesPlusPlaces, type BonusPromotion } from '../services/bonusService';
import { safeCallPhone, safeOpenExternalUrl } from '../utils/communicationActions';
import { selectUserId } from '../redux/selectors';
import FeedLikeButton from '../components/FeedLikeButton';
import { FeatureRatingBanner } from '../components/FeatureRatingBanner';
import { toggleFavorite, getFavorites, type FavoriteSource } from '../services/favoritesService';
import { useSoftToast } from '../hooks/useSoftToast';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const TILE_GAP = 10;
type CategoryKey = 'all' | ChildCategory;
type ScreenText = (typeof UI_TEXT)[Lang];

const FEATURE_PRIORITY: ChildFeature[] = ['shelter', 'food', 'english', 'speech_therapist', 'nurse', 'full_day', 'half_day', 'trial_day', 'sport'];

const FAVORITE_SOURCE: FavoriteSource = 'kids';

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
    route: 'Маршрут',
    call: 'Подзвонити',
    telegram: 'Telegram',
    validUntil: 'до',
    free: 'безкоштовно',
    priceFrom: 'від',
    currency: 'грн',
    priceUnknown: 'ціну уточнюйте',
    ageUnknown: 'вік уточнюйте',
    available: 'є місця',
    share: 'Поділитися',
    openMap: 'Відкрити на карті',
    favoriteAdded: 'Додано в обране',
    favoriteRemoved: 'Видалено з обраного',
    filtersTitle: 'Фільтри',
    filterShelter: 'Укриття',
    filterEnglish: 'Англійська',
    filterAge: 'Вік',
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
    ageRanges: {
      '0-3': '0-3 р.',
      '3-6': '3-6 р.',
      '6-10': '6-10 р.',
      '10+': '10+ р.',
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
    route: 'Маршрут',
    call: 'Позвонить',
    telegram: 'Telegram',
    validUntil: 'до',
    free: 'бесплатно',
    priceFrom: 'от',
    currency: 'грн',
    priceUnknown: 'цену уточняйте',
    ageUnknown: 'возраст уточняйте',
    available: 'есть места',
    share: 'Поделиться',
    openMap: 'Открыть на карте',
    favoriteAdded: 'Добавлено в избранное',
    favoriteRemoved: 'Удалено из избранного',
    filtersTitle: 'Фильтры',
    filterShelter: 'Укрытие',
    filterEnglish: 'Английский',
    filterAge: 'Возраст',
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
    ageRanges: {
      '0-3': '0-3 г.',
      '3-6': '3-6 л.',
      '6-10': '6-10 л.',
      '10+': '10+ л.',
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
    route: 'Route',
    call: 'Call',
    telegram: 'Telegram',
    validUntil: 'until',
    free: 'free',
    priceFrom: 'from',
    currency: 'UAH',
    priceUnknown: 'ask for price',
    ageUnknown: 'ask for age',
    available: 'spots available',
    share: 'Share',
    openMap: 'Open on map',
    favoriteAdded: 'Added to favorites',
    favoriteRemoved: 'Removed from favorites',
    filtersTitle: 'Filters',
    filterShelter: 'Shelter',
    filterEnglish: 'English',
    filterAge: 'Age',
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
    ageRanges: {
      '0-3': '0-3 y.',
      '3-6': '3-6 y.',
      '6-10': '6-10 y.',
      '10+': '10+ y.',
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

type AgeRangeKey = '0-3' | '3-6' | '6-10' | '10+';

const AGE_RANGES: { key: AgeRangeKey; from: number; to: number }[] = [
  { key: '0-3', from: 0, to: 3 },
  { key: '3-6', from: 3, to: 6 },
  { key: '6-10', from: 6, to: 10 },
  { key: '10+', from: 10, to: 99 },
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

const hasFeature = (place: Place, feature: ChildFeature): boolean => {
  const features = new Set(place.childInfo?.features ?? []);
  if (feature === 'shelter' && place.childInfo?.safety?.hasShelter) return true;
  return features.has(feature);
};

const matchesAgeRange = (place: Place, range: { from: number; to: number }): boolean => {
  const ageFrom = place.childInfo?.ageFrom;
  const ageTo = place.childInfo?.ageTo;
  if (typeof ageFrom !== 'number') return false;
  const placeAgeTo = typeof ageTo === 'number' ? ageTo : ageFrom;
  return placeAgeTo >= range.from && ageFrom <= range.to;
};

export default function VseDlyaDeteyScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const currentUserId = useSelector(selectUserId);
  const currentUserEmail = useSelector((state: RootState) => state.auth.user?.email);
  const isAdmin = currentUserEmail === 'vikramsave@ukr.net';
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [claimPlaceIds, setClaimPlaceIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [activePromotions, setActivePromotions] = useState<BonusPromotion[]>([]);
  const [biznesPlusIds, setBiznesPlusIds] = useState<string[]>([]);
  const [filterShelter, setFilterShelter] = useState(false);
  const [filterEnglish, setFilterEnglish] = useState(false);
  const [filterAge, setFilterAge] = useState<AgeRangeKey | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const resultsAnchorY = useRef(0);
  const { showSuccess } = useSoftToast();

  useEffect(() => {
    return subscribeActiveBonusPromotions('kids', setActivePromotions);
  }, []);

  useEffect(() => {
    return subscribeBiznesPlusPlaces('kids', setBiznesPlusIds);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const snap = await get(ref(database, 'business_plus_claims'));
        if (!snap.exists()) return;
        const ids = new Set<string>();
        snap.forEach((child) => {
          if (child.val()?.status === 'pending') ids.add(child.key!);
        });
        setClaimPlaceIds(ids);
      } catch { /* ignore */ }
    })();
  }, [isAdmin]);

  useEffect(() => {
    getFavorites(FAVORITE_SOURCE).then((items) => {
      setFavoriteIds(new Set(items.map((item) => item.id)));
    });
  }, []);

  const childPlaces = useMemo(() => (
    chaykaPlaces
      .filter((raw) => !CHILDREN_SCREEN_BLACKLIST.has(raw.id))
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
    const promotedPlaceIds = new Map(
      activePromotions
        .filter((promotion) => promotion.targetType === 'kids_place')
        .map((promotion, index) => [promotion.targetId, index]),
    );
    const selectedAgeRange = filterAge ? AGE_RANGES.find((r) => r.key === filterAge) : null;

    return childPlaces
      .filter(({ place, category }) => {
        if (activeCategory !== 'all' && category !== activeCategory) return false;
        if (normalizedQuery && !`${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery)) return false;
        if (filterShelter && !hasFeature(place, 'shelter')) return false;
        if (filterEnglish && !hasFeature(place, 'english')) return false;
        if (selectedAgeRange && !matchesAgeRange(place, selectedAgeRange)) return false;
        return true;
      })
      .sort((a, b) => {
        const aPlus = biznesPlusIds.indexOf(a.place.id);
        const bPlus = biznesPlusIds.indexOf(b.place.id);
        if (aPlus !== -1 || bPlus !== -1) {
          if (aPlus === -1) return 1;
          if (bPlus === -1) return -1;
          return aPlus - bPlus;
        }
        const aPromoted = promotedPlaceIds.get(a.place.id);
        const bPromoted = promotedPlaceIds.get(b.place.id);
        if (aPromoted !== undefined || bPromoted !== undefined) {
          if (aPromoted === undefined) return 1;
          if (bPromoted === undefined) return -1;
          return aPromoted - bPromoted;
        }
        return 0;
      });
  }, [activeCategory, activePromotions, biznesPlusIds, childPlaces, query, filterShelter, filterEnglish, filterAge]);

  const activeOffers = useMemo(() => {
    const promotedEventIds = new Map(
      activePromotions
        .filter((promotion) => promotion.targetType === 'kids_event')
        .map((promotion, index) => [promotion.targetId, index]),
    );
    return [...getActiveOffers()].sort((a, b) => {
      const aPromoted = promotedEventIds.get(a.id);
      const bPromoted = promotedEventIds.get(b.id);
      if (aPromoted !== undefined || bPromoted !== undefined) {
        if (aPromoted === undefined) return 1;
        if (bPromoted === undefined) return -1;
        return aPromoted - bPromoted;
      }
      return 0;
    });
  }, [activePromotions]);
  const isEventsCategory = activeCategory === 'event';
  const hasActiveFilters = filterShelter || filterEnglish || filterAge !== null;

  const openPlace = (place: Place) => {
    navigation.navigate('DetalDetskogoMestaScreen', { place });
  };

  const openOffer = (offer: ChildOffer) => {
    navigation.navigate('DetalDetskogoPredlozheniyaScreen', { offer });
  };

  const handleCategoryPress = (category: CategoryKey) => {
    setActiveCategory(category);
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(resultsAnchorY.current - 10, 0),
        animated: true,
      });
    }, 80);
  };

  const handleSharePlace = async (place: Place, category: ChildCategory) => {
    try {
      await Share.share({
        message: `${place.name} (${text.categoryLabel[category]})\n${place.address}`,
      });
    } catch {
      // user cancelled — silent
    }
  };

  const handleShareOffer = async (offer: ChildOffer) => {
    const offerPlace = chaykaPlaces.find((p) => p.id === offer.placeId);
    const meta = getOfferMeta(offer, text);
    try {
      await Share.share({
        message: `${offer.title}${offerPlace ? `\n${offerPlace.name}` : ''}${meta ? `\n${meta}` : ''}`,
      });
    } catch {
      // user cancelled — silent
    }
  };

  const handleToggleFavorite = async (placeId: string) => {
    const added = await toggleFavorite(placeId, FAVORITE_SOURCE);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (added) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
    showSuccess(added ? text.favoriteAdded : text.favoriteRemoved);
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
        <Image
          source={OFFER_PLACEHOLDER}
          style={[styles.offerImage, wide && styles.offerImageWide]}
          resizeMode="cover"
        />
        <View style={styles.offerCardBody}>
          <View style={styles.offerTopRow}>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeText}>{text.offerTypes[offer.type]}</Text>
            </View>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => { e.stopPropagation(); void handleShareOffer(offer); }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          </View>
          {offerPlace ? <Text style={styles.offerPlaceName} numberOfLines={1}>{offerPlace.name}</Text> : null}
          <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
          <Text style={styles.offerShortText} numberOfLines={wide ? 3 : 2}>{offer.shortText}</Text>
          {offerMeta ? <Text style={styles.offerMeta} numberOfLines={1}>{offerMeta}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlaceCard = ({ place, category }: { place: Place; category: ChildCategory }) => {
    const featureBadges = getFeatureBadges(place, text);
    const hasPhone = Boolean(place.phone);
    const hasTelegram = Boolean(place.childInfo?.telegram);
    const isFav = favoriteIds.has(place.id);
    const hasClaim = isAdmin && claimPlaceIds.has(place.id);

    return (
      <TouchableOpacity key={place.id} style={[styles.placeCard, hasClaim && styles.placeCardClaimed]} activeOpacity={0.88} onPress={() => openPlace(place)}>
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

        {featureBadges.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureBadges.map((badge) => (
              <View key={badge.key} style={styles.badge}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Action row: details, route, contacts, share, like, favorite */}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => openPlace(place)} activeOpacity={0.85}>
            <Text style={styles.primaryActionText}>{text.details}</Text>
          </TouchableOpacity>

          {hasPhone ? (
            <TouchableOpacity
              style={styles.contactAction}
              onPress={(e) => { e.stopPropagation(); void safeCallPhone(place.phone, language); }}
              activeOpacity={0.82}
              accessibilityLabel={text.call}
            >
              <MaterialCommunityIcons name="phone-outline" size={16} color="#fff" />
              <Text style={styles.contactActionText}>{text.call}</Text>
            </TouchableOpacity>
          ) : null}

          {hasTelegram ? (
            <TouchableOpacity
              style={[styles.contactAction, styles.telegramAction]}
              onPress={(e) => { e.stopPropagation(); void safeOpenExternalUrl(`https://t.me/${place.childInfo!.telegram}`, language); }}
              activeOpacity={0.82}
              accessibilityLabel={text.telegram}
            >
              <MaterialCommunityIcons name="send" size={14} color="#fff" />
            </TouchableOpacity>
          ) : null}

          <View style={styles.cardActionsRight}>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => { e.stopPropagation(); void handleSharePlace(place, category); }}
              activeOpacity={0.7}
              accessibilityLabel={text.share}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>

            <FeedLikeButton
              currentUserId={currentUserId}
              likePath="feed_likes/kids"
              likeId={place.id}
            />

            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => { e.stopPropagation(); void handleToggleFavorite(place.id); }}
              activeOpacity={0.7}
              accessibilityLabel={isFav ? text.favoriteRemoved : text.favoriteAdded}
            >
              <MaterialCommunityIcons
                name={isFav ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={isFav ? SCREEN_THEME.terracotta : SCREEN_THEME.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        {/* Filter chips */}
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, filterShelter && styles.chipActive]}
            onPress={() => setFilterShelter((v) => !v)}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="shield-check-outline" size={14} color={filterShelter ? '#fff' : SCREEN_THEME.textSecondary} />
            <Text style={[styles.chipText, filterShelter && styles.chipTextActive]}>{text.filterShelter}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, filterEnglish && styles.chipActive]}
            onPress={() => setFilterEnglish((v) => !v)}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="translate" size={14} color={filterEnglish ? '#fff' : SCREEN_THEME.textSecondary} />
            <Text style={[styles.chipText, filterEnglish && styles.chipTextActive]}>{text.filterEnglish}</Text>
          </TouchableOpacity>

          {AGE_RANGES.map((range) => (
            <TouchableOpacity
              key={range.key}
              style={[styles.chip, filterAge === range.key && styles.chipActive]}
              onPress={() => setFilterAge((v) => v === range.key ? null : range.key)}
              activeOpacity={0.82}
            >
              <Text style={[styles.chipText, filterAge === range.key && styles.chipTextActive]}>
                {text.ageRanges[range.key]}
              </Text>
            </TouchableOpacity>
          ))}

          {hasActiveFilters ? (
            <TouchableOpacity
              style={styles.chipClear}
              onPress={() => { setFilterShelter(false); setFilterEnglish(false); setFilterAge(null); }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={SCREEN_THEME.textMuted} />
            </TouchableOpacity>
          ) : null}
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
          {CATEGORIES.map((category) => {
            const isActive = activeCategory === category.key;
            return (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.categoryTile,
                  { backgroundColor: category.bg },
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
                    size={24}
                    color={category.iconColor}
                  />
                </View>
                <Text style={styles.categoryTileText} numberOfLines={1}>{text.categories[category.key]}</Text>
                <View pointerEvents="none" style={styles.categoryTileCountBadge}>
                  <Text style={styles.categoryTileCount}>{categoryCounts[category.key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={styles.resultsBlock}
          onLayout={(event) => {
            resultsAnchorY.current = event.nativeEvent.layout.y;
          }}
        >
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
        </View>

        <FeatureRatingBanner screenId="deti" />
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
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  // Filter chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  chipActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  chipClear: {
    justifyContent: 'center',
    paddingHorizontal: 4,
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
    gap: TILE_GAP,
    marginBottom: 6,
  },
  categoryTile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 1, height: 4 },
    elevation: 5,
  },
  categoryTileActive: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shadowOpacity: 0.36,
    shadowRadius: 10,
    elevation: 8,
  },
  categoryTileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 12,
  },
  categoryTileText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  categoryTileCountBadge: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  categoryTileCount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultsBlock: {
    marginTop: 2,
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
  placeCardClaimed: {
    borderColor: '#F9C400',
    borderWidth: 2,
    backgroundColor: '#FFFDE7',
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
  addressLink: {
    color: SCREEN_THEME.enamelBlueDark,
    textDecorationLine: 'underline',
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
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
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
  routeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.accentCream,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  routeActionText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontWeight: '800',
    fontSize: 13,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#5C7A5C',
  },
  contactActionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  telegramAction: {
    backgroundColor: '#3390EC',
    paddingHorizontal: 10,
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  offerCardWide: {
    width: '100%',
  },
  offerImage: {
    width: '100%',
    height: 110,
  },
  offerImageWide: {
    height: 160,
  },
  offerCardBody: {
    padding: 12,
  },
  offerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  offerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: SCREEN_THEME.terracotta,
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
    marginBottom: 3,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
});
