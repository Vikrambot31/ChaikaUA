import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { Place, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import StarRatingModal from '../components/StarRatingModal';
import { DailyRatingUsage, RatingAggregate, UserRatingMap, canUseDailyRating, recordDailyRatingUse, replaceWeightedRating } from '../utils/monthlyRating';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';
import { buySellService, BuySellListing } from '../services/buySellService';
import { database } from '../firebase-config';

const REAL_CHAIKA_STORES: Place[] = [
  { id: 'store-real-fora', name: 'Фора', address: 'вулиця Михайла Грушевського, 12', latitude: 50.43898, longitude: 30.28264, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-domashniy', name: 'Домашній', address: 'ЖК Чайка', latitude: 50.44218, longitude: 30.2894, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-lotok', name: 'ЛОТОК', address: 'вулиця Валерія Лобановського, 29', latitude: 50.44253, longitude: 30.28861, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-avrora', name: 'Аврора', address: 'вулиця Валерія Лобановського, 30-Б', latitude: 50.44178, longitude: 30.29178, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-galya-baluvana', name: 'Галя Балувана', address: 'вулиця Валерія Лобановського, 35', latitude: 50.44213, longitude: 30.29117, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
];

const normalizeKey = (p: Place) => `${p.name.trim().toLowerCase()}|${p.address.trim().toLowerCase()}`;

const allRestaurants = chaykaPlaces.filter((p) => p.type === PlaceType.CAFE || p.type === PlaceType.RESTAURANT);
const allStores = [
  ...REAL_CHAIKA_STORES,
  ...chaykaPlaces.filter((p) => p.type === PlaceType.SHOP),
].filter((p, i, list) => list.findIndex((x) => normalizeKey(x) === normalizeKey(p)) === i);
const allSchools = chaykaPlaces.filter((p) => p.type === PlaceType.SCHOOL);
const allKindergartens = chaykaPlaces.filter((p) => p.type === PlaceType.KINDERGARTEN);
const allSalons = chaykaPlaces.filter((p) => p.type === PlaceType.SALON);

const RESTAURANT_RATINGS_KEY = '@chaika:restaurant_ratings_v1';
const RESTAURANT_VOTES_KEY = '@chaika:restaurant_rating_votes_v1';
const RESTAURANT_USER_RATINGS_KEY = '@chaika:restaurant_user_ratings_v1';
const STORE_RATINGS_KEY = '@chaika:store_ratings_v1';
const STORE_VOTES_KEY = '@chaika:store_rating_votes_v1';
const STORE_USER_RATINGS_KEY = '@chaika:store_user_ratings_v1';
const DAILY_USAGE_KEY = '@chaika:place_rating_daily_usage_v1';
const ACTIVE_SECTION_KEY = '@chaika:places_active_section_v2';

type RatingsByPlace = Record<string, RatingAggregate>;
type Lang = 'ua' | 'ru' | 'en';
type LegacyTabKey = 'cafe' | 'store' | 'other';
type SectionKey = 'schools' | 'kindergartens' | 'salons' | 'stores' | 'restaurants' | 'resident_goods' | 'resident_services';
type BusinessItem = {
  id: string;
  contactName?: string;
  categoryLabel?: string;
  subcategoryLabel?: string;
  description?: string;
  phone?: string;
  status?: string;
  createdAt?: string | number;
};

type PlacesScreenRouteParams = { tab?: LegacyTabKey; section?: SectionKey };

const parseStoredJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const UI_TEXT = {
  ua: {
    title: 'Місця Чайки',
    subtitle: 'Оберіть розділ',
    back: 'Назад',
    sections: {
      schools: 'Школи',
      kindergartens: 'Дитячі садочки',
      salons: 'Салони',
      stores: 'Магазини',
      restaurants: 'Ресторани',
      resident_goods: 'Товари жильців',
      resident_services: 'Послуги жильців',
    },
    sectionSubtitles: {
      schools: 'Школи поруч із житловим комплексом',
      kindergartens: 'Садочки для дітей у районі',
      salons: 'Салони краси та догляду',
      stores: 'Магазини та супермаркети району',
      restaurants: 'Кафе та ресторани поряд',
      resident_goods: 'Оголошення мешканців: купівля та продаж',
      resident_services: 'Послуги, які надають мешканці',
    },
    openGoods: 'Перейти до товарів жильців',
    openServices: 'Перейти до послуг жильців',
    noData: 'Поки що немає даних у цьому розділі',
    loading: 'Завантаження...',
    ratingAlready: 'Оцінку вже враховано',
    rateAgainIn: 'Повторно оцінити через',
    days: 'дн.',
    votes: 'голосів',
    ratingPrompt: 'Оцініть місце',
    ratingHint: 'Оберіть кількість зірок. Свою оцінку можна змінити.',
    ratingLimitTitle: 'Ліміт',
    ratingLimitText: 'Завтра зможете поставити ще.',
    typeLabels: {
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
  },
  ru: {
    title: 'Места Чайки',
    subtitle: 'Выберите раздел',
    back: 'Назад',
    sections: {
      schools: 'Школы',
      kindergartens: 'Детские садики',
      salons: 'Салоны',
      stores: 'Магазины',
      restaurants: 'Рестораны',
      resident_goods: 'Товары жильцов',
      resident_services: 'Услуги жильцов',
    },
    sectionSubtitles: {
      schools: 'Школы рядом с жилым комплексом',
      kindergartens: 'Детские сады в районе',
      salons: 'Салоны красоты и ухода',
      stores: 'Магазины и супермаркеты района',
      restaurants: 'Кафе и рестораны рядом',
      resident_goods: 'Объявления жителей: покупка и продажа',
      resident_services: 'Услуги, которые оказывают жители',
    },
    openGoods: 'Перейти к товарам жильцов',
    openServices: 'Перейти к услугам жильцов',
    noData: 'Пока нет данных в этом разделе',
    loading: 'Загрузка...',
    ratingAlready: 'Оценка уже учтена',
    rateAgainIn: 'Повторно оценить через',
    days: 'дн.',
    votes: 'голосов',
    ratingPrompt: 'Оцените место',
    ratingHint: 'Выберите количество звезд. Свою оценку можно изменить.',
    ratingLimitTitle: 'Лимит',
    ratingLimitText: 'Завтра сможете поставить еще.',
    typeLabels: {
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
  },
  en: {
    title: 'Chaika Places',
    subtitle: 'Choose section',
    back: 'Back',
    sections: {
      schools: 'Schools',
      kindergartens: 'Kindergartens',
      salons: 'Salons',
      stores: 'Stores',
      restaurants: 'Restaurants',
      resident_goods: 'Resident goods',
      resident_services: 'Resident services',
    },
    sectionSubtitles: {
      schools: 'Schools near the residential complex',
      kindergartens: 'Kindergartens in the district',
      salons: 'Beauty and care salons',
      stores: 'Neighborhood stores and supermarkets',
      restaurants: 'Nearby cafes and restaurants',
      resident_goods: 'Resident marketplace listings',
      resident_services: 'Services offered by residents',
    },
    openGoods: 'Open resident goods',
    openServices: 'Open resident services',
    noData: 'No data in this section yet',
    loading: 'Loading...',
    ratingAlready: 'Rating already counted',
    rateAgainIn: 'Rate again in',
    days: 'days',
    votes: 'votes',
    ratingPrompt: 'Rate this place',
    ratingHint: 'Choose the number of stars. You can change your rating.',
    ratingLimitTitle: 'Limit',
    ratingLimitText: 'You can add more ratings tomorrow.',
    typeLabels: {
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
  },
} as const;

const SECTION_META: Record<SectionKey, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; accent: string; rating: boolean }> = {
  schools: { icon: 'school-outline', accent: SCREEN_THEME.enamelBlueDark, rating: false },
  kindergartens: { icon: 'baby-face-outline', accent: '#8E5FA8', rating: false },
  salons: { icon: 'content-cut', accent: '#B35A74', rating: false },
  stores: { icon: 'storefront-outline', accent: SCREEN_THEME.enamelBlueDark, rating: true },
  restaurants: { icon: 'silverware-fork-knife', accent: SCREEN_THEME.terracottaDark, rating: true },
  resident_goods: { icon: 'shopping-outline', accent: '#C96E3E', rating: false },
  resident_services: { icon: 'handshake-outline', accent: '#2E7D32', rating: false },
};

const getRating = (place: Place, ratings: RatingsByPlace): RatingAggregate =>
  ratings[place.id] ?? { rating: place.rating || 0, votes: place.reviews || 0 };

const mapLegacyTabToSection = (tab?: LegacyTabKey): SectionKey | null => {
  if (tab === 'cafe') return 'restaurants';
  if (tab === 'store') return 'stores';
  if (tab === 'other') return 'schools';
  return null;
};

type PlaceRowProps = {
  place: Place;
  idx: number;
  section: SectionKey;
  ratings: RatingsByPlace;
  onRatePress: (place: Place) => void;
  typeLabel?: string;
  navigation: ReturnType<typeof useNavigation<NavigationProp<Record<string, object | undefined>>>>;
  votesLabel: string;
  navLock: React.MutableRefObject<boolean>;
};

const PlaceRow: React.FC<PlaceRowProps> = ({ place, idx, section, ratings, onRatePress, typeLabel, navigation, votesLabel, navLock }) => {
  const cfg = SECTION_META[section];
  const current = getRating(place, ratings);
  const rounded = Math.round(current.rating);
  const showRating = cfg.rating;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('MainTabs', { screen: 'MapTab', params: getMapFocusPlaceParams(place) }); setTimeout(() => { navLock.current = false; }, 800); }}
    >
      <View style={[styles.rank, { backgroundColor: cfg.accent }]}>
        <Text style={styles.rankText}>#{idx + 1}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color={cfg.accent} />
        </View>
        {typeLabel ? (
          <Text style={styles.address} numberOfLines={1}>{typeLabel} · {place.address}</Text>
        ) : (
          <Text style={styles.address} numberOfLines={1}>{place.address}</Text>
        )}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); openInGoogleMaps(place.name, place.address); }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}
        >
          <Text style={styles.googleLink}>Google Maps ↗</Text>
        </TouchableOpacity>
        {showRating && (
          <View style={styles.ratingLine}>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={(e) => { e.stopPropagation?.(); onRatePress(place); }} activeOpacity={0.72}>
                  <MaterialCommunityIcons
                    name={star <= rounded ? 'star' : 'star-outline'}
                    size={22}
                    color={star <= rounded ? '#FFA000' : '#D6C4A3'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingMeta}>
              {current.rating > 0 ? current.rating.toFixed(1) : '0.0'} · {current.votes} {votesLabel}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const PlacesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const route = useRoute<import('@react-navigation/native').RouteProp<Record<string, PlacesScreenRouteParams>, string>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language];

  const defaultSection: SectionKey = route.params?.section ?? mapLegacyTabToSection(route.params?.tab) ?? 'restaurants';
  const [activeSection, setActiveSection] = useState<SectionKey>(defaultSection);

  const [restaurantRatings, setRestaurantRatings] = useState<RatingsByPlace>({});
  const [restaurantUserRatings, setRestaurantUserRatings] = useState<UserRatingMap>({});
  const [storeRatings, setStoreRatings] = useState<RatingsByPlace>({});
  const [storeUserRatings, setStoreUserRatings] = useState<UserRatingMap>({});
  const [dailyUsage, setDailyUsage] = useState<DailyRatingUsage | null>(null);
  const [ratingTarget, setRatingTarget] = useState<Place | null>(null);
  const [residentGoods, setResidentGoods] = useState<BuySellListing[]>([]);
  const [residentServices, setResidentServices] = useState<BusinessItem[]>([]);
  const [residentDataLoading, setResidentDataLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [rr, rur, sr, sur, du] = await Promise.all([
          AsyncStorage.getItem(RESTAURANT_RATINGS_KEY),
          AsyncStorage.getItem(RESTAURANT_USER_RATINGS_KEY),
          AsyncStorage.getItem(STORE_RATINGS_KEY),
          AsyncStorage.getItem(STORE_USER_RATINGS_KEY),
          AsyncStorage.getItem(DAILY_USAGE_KEY),
        ]);
        setRestaurantRatings(parseStoredJson<RatingsByPlace>(rr, {}));
        setRestaurantUserRatings(parseStoredJson<UserRatingMap>(rur, {}));
        setStoreRatings(parseStoredJson<RatingsByPlace>(sr, {}));
        setStoreUserRatings(parseStoredJson<UserRatingMap>(sur, {}));
        setDailyUsage(parseStoredJson<DailyRatingUsage | null>(du, null));
      } catch {}
    };
    void load();
  }, []);

  useEffect(() => {
    let servicesLoaded = false;
    let goodsLoaded = false;
    const finishLoad = () => {
      if (servicesLoaded && goodsLoaded) {
        setResidentDataLoading(false);
      }
    };

    const unsubscribeGoods = buySellService.subscribe((items) => {
      setResidentGoods(items);
      goodsLoaded = true;
      finishLoad();
    });

    const servicesRef = ref(database, 'local_business');
    const unsubscribeServices = onValue(servicesRef, (snapshot) => {
      const raw = snapshot.val() as Record<string, Omit<BusinessItem, 'id'>> | null;
      const next = !raw
        ? []
        : Object.entries(raw)
          .map(([id, value]) => ({ ...value, id }))
          .filter((item) => item.status === 'active')
          .sort((a, b) => {
            const ta = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
            const tb = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
            return tb - ta;
          });
      setResidentServices(next);
      servicesLoaded = true;
      finishLoad();
    });

    return () => {
      unsubscribeGoods();
      unsubscribeServices();
    };
  }, []);

  useEffect(() => {
    const targetSection = route.params?.section ?? mapLegacyTabToSection(route.params?.tab);
    if (targetSection) {
      setActiveSection(targetSection);
      void AsyncStorage.setItem(ACTIVE_SECTION_KEY, targetSection);
      return;
    }

    const restoreSection = async () => {
      try {
        const saved = await AsyncStorage.getItem(ACTIVE_SECTION_KEY);
        if (saved && SECTION_META[saved as SectionKey]) {
          setActiveSection(saved as SectionKey);
        }
      } catch {}
    };
    void restoreSection();
  }, [route.params?.section, route.params?.tab]);

  const sortedRestaurants = useMemo(
    () => [...allRestaurants].sort(
      (a, b) => getRating(b, restaurantRatings).rating - getRating(a, restaurantRatings).rating || getRating(b, restaurantRatings).votes - getRating(a, restaurantRatings).votes,
    ),
    [restaurantRatings],
  );
  const sortedStores = useMemo(
    () => [...allStores].sort(
      (a, b) => getRating(b, storeRatings).rating - getRating(a, storeRatings).rating || getRating(b, storeRatings).votes - getRating(a, storeRatings).votes,
    ),
    [storeRatings],
  );

  const items = useMemo(() => {
    if (activeSection === 'schools') return allSchools;
    if (activeSection === 'kindergartens') return allKindergartens;
    if (activeSection === 'salons') return allSalons;
    if (activeSection === 'stores') return sortedStores;
    if (activeSection === 'restaurants') return sortedRestaurants;
    return [];
  }, [activeSection, sortedRestaurants, sortedStores]);

  const ratings = activeSection === 'stores' ? storeRatings : restaurantRatings;
  const userRatings = activeSection === 'stores' ? storeUserRatings : restaurantUserRatings;

  const handleRate = async (place: Place, value: number) => {
    const isRestaurant = activeSection === 'restaurants';
    const currentRatings = isRestaurant ? restaurantRatings : storeRatings;
    const currentUserRatings = isRestaurant ? restaurantUserRatings : storeUserRatings;
    const ratingsKey = isRestaurant ? RESTAURANT_RATINGS_KEY : STORE_RATINGS_KEY;
    const userRatingsKey = isRestaurant ? RESTAURANT_USER_RATINGS_KEY : STORE_USER_RATINGS_KEY;
    const legacyVotesKey = isRestaurant ? RESTAURANT_VOTES_KEY : STORE_VOTES_KEY;
    const previousValue = currentUserRatings[place.id];
    const isNewRating = !previousValue;

    if (isNewRating && !canUseDailyRating(dailyUsage)) {
      Alert.alert(text.ratingLimitTitle, text.ratingLimitText);
      return;
    }

    const nextRatings = { ...currentRatings, [place.id]: replaceWeightedRating(getRating(place, currentRatings), value, previousValue) };
    const nextUserRatings = { ...currentUserRatings, [place.id]: value };
    const nextDailyUsage = isNewRating ? recordDailyRatingUse(dailyUsage) : dailyUsage;
    if (isRestaurant) {
      setRestaurantRatings(nextRatings);
      setRestaurantUserRatings(nextUserRatings);
    } else {
      setStoreRatings(nextRatings);
      setStoreUserRatings(nextUserRatings);
    }
    if (nextDailyUsage) setDailyUsage(nextDailyUsage);
    const writes = [
      AsyncStorage.setItem(ratingsKey, JSON.stringify(nextRatings)),
      AsyncStorage.setItem(userRatingsKey, JSON.stringify(nextUserRatings)),
      AsyncStorage.removeItem(legacyVotesKey),
    ];
    if (nextDailyUsage) writes.push(AsyncStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(nextDailyUsage)));
    await Promise.all(writes);
    setRatingTarget(null);
  };

  const setSection = (section: SectionKey) => {
    setActiveSection(section);
    void AsyncStorage.setItem(ACTIVE_SECTION_KEY, section);
  };

  const renderResidentAction = () => {
    const isGoods = activeSection === 'resident_goods';
    const icon = isGoods ? 'shopping-outline' : 'handshake-outline';
    const buttonText = isGoods ? text.openGoods : text.openServices;
    const openTarget = () => {
      navigation.navigate(isGoods ? 'BuySellScreen' : 'BizznesChaikaScreen');
    };
    const residentItems = isGoods ? residentGoods : residentServices;

    return (
      <View style={styles.residentWrap}>
        <View style={styles.actionCard}>
          <MaterialCommunityIcons name={icon} size={34} color={SCREEN_THEME.textPrimary} />
          <Text style={styles.actionText}>
            {isGoods ? text.sectionSubtitles.resident_goods : text.sectionSubtitles.resident_services}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={openTarget} activeOpacity={0.82}>
            <Text style={styles.actionButtonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>

        {residentDataLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="small" color={SCREEN_THEME.terracottaDark} />
            <Text style={styles.emptyText}>{text.loading}</Text>
          </View>
        ) : residentItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{text.noData}</Text>
          </View>
        ) : isGoods ? (
          residentGoods.slice(0, 20).map((item) => (
            <View key={item.id} style={styles.residentCard}>
              <View style={styles.residentTop}>
                <MaterialCommunityIcons
                  name="package-variant-closed"
                  size={18}
                  color={SECTION_META[activeSection].accent}
                />
                <Text style={styles.residentTitle} numberOfLines={1}>
                  {item.itemName}
                </Text>
              </View>
              <Text style={styles.residentMeta} numberOfLines={1}>
                {item.category || ''} · {item.condition || ''}
              </Text>
              <Text style={styles.residentDesc} numberOfLines={2}>
                {item.description || ''}
              </Text>
            </View>
          ))
        ) : (
          residentServices.slice(0, 20).map((item) => (
            <View key={item.id} style={styles.residentCard}>
              <View style={styles.residentTop}>
                <MaterialCommunityIcons
                  name="account-hard-hat"
                  size={18}
                  color={SECTION_META[activeSection].accent}
                />
                <Text style={styles.residentTitle} numberOfLines={1}>
                  {item.contactName || 'Resident'}
                </Text>
              </View>
              <Text style={styles.residentMeta} numberOfLines={1}>
                {item.categoryLabel || ''}{item.subcategoryLabel ? ` · ${item.subcategoryLabel}` : ''}
              </Text>
              <Text style={styles.residentDesc} numberOfLines={2}>
                {item.description || ''}
              </Text>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹ {text.back}</Text>
        </TouchableOpacity>

        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
          <Text style={styles.headerMeta}>{text.sectionSubtitles[activeSection]}</Text>
        </View>

        <View style={styles.sectionRow}>
          {(Object.keys(SECTION_META) as SectionKey[]).map((section) => {
            const isActive = activeSection === section;
            const accent = SECTION_META[section].accent;
            return (
              <TouchableOpacity
                key={section}
                style={[styles.sectionChip, isActive && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setSection(section)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={SECTION_META[section].icon}
                  size={14}
                  color={isActive ? '#fff' : accent}
                />
                <Text style={[styles.sectionChipText, isActive && styles.sectionChipTextActive]}>
                  {text.sections[section]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeSection === 'resident_goods' || activeSection === 'resident_services' ? (
          renderResidentAction()
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{text.noData}</Text>
          </View>
        ) : (
          items.map((place, idx) => (
            <PlaceRow
              key={place.id}
              place={place}
              idx={idx}
              section={activeSection}
              ratings={ratings}
              onRatePress={setRatingTarget}
              typeLabel={text.typeLabels[place.type]}
              navigation={navigation}
              votesLabel={text.votes}
              navLock={navLock}
            />
          ))
        )}
      </ScrollView>

      <StarRatingModal
        visible={Boolean(ratingTarget)}
        title={ratingTarget?.name ?? text.ratingPrompt}
        subtitle={text.ratingHint}
        value={ratingTarget ? userRatings[ratingTarget.id] ?? Math.round(getRating(ratingTarget, ratings).rating) : 0}
        onSelect={(value) => { if (ratingTarget) void handleRate(ratingTarget, value); }}
        onClose={() => setRatingTarget(null)}
      />

    </SafeAreaView>
  );
};

export default PlacesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingTop: 16, paddingBottom: 100 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  backButtonText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },

  headerCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 10 },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  headerMeta: { marginTop: 8, color: SCREEN_THEME.textPrimary, textAlign: 'center', fontSize: 12, fontWeight: '700' },

  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  sectionChipText: { fontSize: 12, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  sectionChipTextActive: { color: '#fff' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  rank: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary, flex: 1 },
  address: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '700', marginBottom: 2 },
  googleLink: { fontSize: 10, color: '#4285F4', fontWeight: '600', marginBottom: 4 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  stars: { flexDirection: 'row', gap: 1 },
  ratingMeta: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '700' },

  actionCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  residentWrap: { gap: 10 },
  actionText: {
    textAlign: 'center',
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  actionButton: {
    marginTop: 6,
    backgroundColor: SCREEN_THEME.textPrimary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  residentCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 12,
    gap: 6,
  },
  residentTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  residentTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  residentMeta: { fontSize: 11, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  residentDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, lineHeight: 16 },
  emptyCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { color: SCREEN_THEME.textSecondary, fontWeight: '700' },
});

