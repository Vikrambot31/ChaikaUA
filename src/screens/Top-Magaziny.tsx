import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import MiniTabBar from '../components/MiniTabBar';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { Place, PlaceType } from '../types/app';
import StarRatingModal from '../components/StarRatingModal';
import { DailyRatingUsage, RatingAggregate, UserRatingMap, canUseDailyRating, recordDailyRatingUse, replaceWeightedRating } from '../utils/monthlyRating';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';

const REAL_CHAIKA_STORES: Place[] = [
  { id: 'store-real-fora', name: 'Фора', address: 'вулиця Михайла Грушевського, 12', latitude: 50.43898, longitude: 30.28264, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-domashniy', name: 'Домашній', address: 'ЖК Чайка', latitude: 50.44218, longitude: 30.2894, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-lotok', name: 'ЛОТОК', address: 'вулиця Валерія Лобановського, 29', latitude: 50.44253, longitude: 30.28861, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-avrora', name: 'Аврора', address: 'вулиця Валерія Лобановського, 30-Б', latitude: 50.44178, longitude: 30.29178, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
  { id: 'store-real-galya-baluvana', name: 'Галя Балувана', address: 'вулиця Валерія Лобановського, 35', latitude: 50.44213, longitude: 30.29117, type: PlaceType.SHOP, rating: 0, reviews: 0, createdAt: new Date('2026-04-22T09:00:00Z').valueOf() },
];

const normalizeStoreKey = (place: Place) => `${place.name.trim().toLowerCase()}|${place.address.trim().toLowerCase()}`;

const topStores = [
  ...REAL_CHAIKA_STORES,
  ...chaykaPlaces.filter((place) => place.type === PlaceType.SHOP),
].filter((place, index, list) => {
  const key = normalizeStoreKey(place);
  return list.findIndex((item) => normalizeStoreKey(item) === key) === index;
});

const STORAGE_KEY = '@chaika:store_ratings_v1';
const LAST_VOTE_KEY = '@chaika:store_rating_votes_v1';
const USER_RATINGS_KEY = '@chaika:store_user_ratings_v1';
const DAILY_USAGE_KEY = '@chaika:place_rating_daily_usage_v1';
type RatingsByPlace = Record<string, RatingAggregate>;
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Топ магазинів',
    subtitle: 'Популярні магазини комплексу, куди мешканці заходять найчастіше.',
    back: 'Назад',
    loading: 'Завантажуємо рейтинг магазинів...',
    empty: 'Поки що немає магазинів для відображення',
    ratingAlready: 'Оцінку вже враховано',
    rateAgainIn: 'Повторно оцінити можна через',
    days: 'дн.',
    votes: 'голосів',
    ratingPrompt: 'Оцініть місце',
    ratingHint: 'Оберіть кількість зірок. Свою оцінку можна змінити.',
    ratingLimitTitle: 'Ліміт',
    ratingLimitText: 'Завтра зможете поставити ще.',
  },
  ru: {
    title: 'Топ магазинов',
    subtitle: 'Популярные магазины комплекса, куда жители заходят чаще всего.',
    back: 'Назад',
    loading: 'Загружаем рейтинг магазинов...',
    empty: 'Пока нет магазинов для отображения',
    ratingAlready: 'Оценка уже учтена',
    rateAgainIn: 'Повторно оценить можно через',
    days: 'дн.',
    votes: 'голосов',
    ratingPrompt: 'Оцените место',
    ratingHint: 'Выберите количество звезд. Свою оценку можно изменить.',
    ratingLimitTitle: 'Лимит',
    ratingLimitText: 'Завтра сможете поставить еще.',
  },
  en: {
    title: 'Top Stores',
    subtitle: 'Most popular stores in the residential area.',
    back: 'Back',
    loading: 'Loading store ratings...',
    empty: 'No stores to display yet',
    ratingAlready: 'Rating already counted',
    rateAgainIn: 'You can rate again in',
    days: 'days',
    votes: 'votes',
    ratingPrompt: 'Rate this place',
    ratingHint: 'Choose the number of stars. You can change your rating.',
    ratingLimitTitle: 'Limit',
    ratingLimitText: 'You can add more ratings tomorrow.',
  },
} as const;

const getPlaceRating = (place: Place, ratings: RatingsByPlace): RatingAggregate => {
  return ratings[place.id] ?? { rating: place.rating || 0, votes: place.reviews || 0 };
};

const TopStoresScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [ratings, setRatings] = useState<RatingsByPlace>({});
  const [userRatings, setUserRatings] = useState<UserRatingMap>({});
  const [dailyUsage, setDailyUsage] = useState<DailyRatingUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ratingTarget, setRatingTarget] = useState<Place | null>(null);

  useEffect(() => {
    const loadRatings = async () => {
      try {
        const [rawRatings, rawUserRatings, rawDailyUsage] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(USER_RATINGS_KEY),
          AsyncStorage.getItem(DAILY_USAGE_KEY),
        ]);
        setRatings(rawRatings ? (JSON.parse(rawRatings) as RatingsByPlace) : {});
        setUserRatings(rawUserRatings ? (JSON.parse(rawUserRatings) as UserRatingMap) : {});
        setDailyUsage(rawDailyUsage ? (JSON.parse(rawDailyUsage) as DailyRatingUsage) : null);
      } catch {
        setRatings({});
        setUserRatings({});
        setDailyUsage(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadRatings();
  }, []);

  const stores = useMemo(() => {
    return [...topStores].sort((a, b) => {
      const aRating = getPlaceRating(a, ratings);
      const bRating = getPlaceRating(b, ratings);
      return bRating.rating - aRating.rating || bRating.votes - aRating.votes;
    });
  }, [ratings]);

  const handleRate = async (store: Place, value: number) => {
    const previousValue = userRatings[store.id];
    const isNewRating = !previousValue;

    if (isNewRating && !canUseDailyRating(dailyUsage)) {
      Alert.alert(text.ratingLimitTitle, text.ratingLimitText);
      return;
    }

    const nextRatings = {
      ...ratings,
      [store.id]: replaceWeightedRating(getPlaceRating(store, ratings), value, previousValue),
    };
    const nextUserRatings = { ...userRatings, [store.id]: value };
    const nextDailyUsage = isNewRating ? recordDailyRatingUse(dailyUsage) : dailyUsage;
    setRatings(nextRatings);
    setUserRatings(nextUserRatings);
    if (nextDailyUsage) setDailyUsage(nextDailyUsage);
    const writes = [
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextRatings)),
      AsyncStorage.setItem(USER_RATINGS_KEY, JSON.stringify(nextUserRatings)),
      AsyncStorage.removeItem(LAST_VOTE_KEY),
    ];
    if (nextDailyUsage) writes.push(AsyncStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(nextDailyUsage)));
    await Promise.all(writes);
    setRatingTarget(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹ {text.back}</Text>
        </TouchableOpacity>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
        </View>
        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={SCREEN_THEME.terracottaDark} />
            <Text style={styles.stateText}>{text.loading}</Text>
          </View>
        ) : null}
        {!isLoading && stores.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{text.empty}</Text>
          </View>
        ) : null}
        {stores.map((store, idx) => {
          const current = getPlaceRating(store, ratings);
          const rounded = Math.round(current.rating);
          return (
            <TouchableOpacity
              key={store.id}
              style={styles.storeCard}
              activeOpacity={0.82}
              onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab', params: getMapFocusPlaceParams(store) })}
            >
              <View style={styles.rank}><Text style={styles.rankText}>#{idx + 1}</Text></View>
              <View style={styles.info}>
                <Text style={styles.storeName} numberOfLines={2}>{store.name}</Text>
                <Text style={styles.address} numberOfLines={2}>{store.address}</Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openInGoogleMaps(store.name, store.address); }} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}>
                  <Text style={styles.googleLink}>Google Maps ↗</Text>
                </TouchableOpacity>
                <View style={styles.ratingLine}>
                  <View style={styles.starsInput}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={(e) => { e.stopPropagation?.(); setRatingTarget(store); }} activeOpacity={0.72}>
                        <MaterialCommunityIcons name={star <= rounded ? 'star' : 'star-outline'} size={24} color={star <= rounded ? '#FFA000' : '#D6C4A3'} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.ratingMeta}>{current.rating > 0 ? current.rating.toFixed(1) : '0.0'} / {current.votes} {text.votes}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <StarRatingModal
        visible={Boolean(ratingTarget)}
        title={ratingTarget?.name ?? text.ratingPrompt}
        subtitle={text.ratingHint}
        value={ratingTarget ? userRatings[ratingTarget.id] ?? Math.round(getPlaceRating(ratingTarget, ratings).rating) : 0}
        onSelect={(value) => { if (ratingTarget) void handleRate(ratingTarget, value); }}
        onClose={() => setRatingTarget(null)}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingTop: 16, paddingBottom: 108 },
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
  headerCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 30, padding: 20, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E4D0AB' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 12 },
  headerSubtitle: { marginTop: 8, color: SCREEN_THEME.textSecondary, textAlign: 'center', lineHeight: 20 },
  stateCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  storeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB' },
  rank: { width: 44, height: 44, borderRadius: 16, backgroundColor: SCREEN_THEME.enamelBlue, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: SCREEN_THEME.enamelBlueDark },
  rankText: { color: '#F6F9FF', fontWeight: '900', fontSize: 16 },
  info: { flex: 1 },
  storeName: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 4 },
  address: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '800', marginBottom: 2 },
  googleLink: { fontSize: 10, color: '#4285F4', fontWeight: '600', marginBottom: 4 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  starsInput: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  ratingMeta: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '800' },
  reviews: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '700' },
});

export default TopStoresScreen;


