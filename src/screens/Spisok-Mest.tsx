import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import FilterButton from '../components/FilterButton';
import PlaceCard from '../components/PlaceCard';
import PlaceDetailsPanel from './Panel-Detaley-Mesta';
import { usePlaces } from '../hooks/usePlaces';
import {
  clearFilters,
  filterBySearch,
  filterByTypes,
  selectFilteredPlaces,
  selectPlacesError,
  selectPlacesLoading,
} from '../redux/slices/placesSlice';
import { Place, PlaceType } from '../types/app';
import { COLORS, SIZES } from '../utils/constants';
import MiniTabBar from '../components/MiniTabBar';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';

const FILTER_TYPES: PlaceType[] = [
  PlaceType.SHOP,
  PlaceType.SCHOOL,
  PlaceType.KINDERGARTEN,
  PlaceType.CAFE,
  PlaceType.RESTAURANT,
  PlaceType.SERVICE,
  PlaceType.PHARMACY,
  PlaceType.SALON,
];

const UI_TEXT = {
  ua: {
    filterLabels: {
      [PlaceType.BUILDING]: 'Будинки',
      [PlaceType.SHOP]: 'Магазини',
      [PlaceType.SCHOOL]: 'Школи',
      [PlaceType.KINDERGARTEN]: 'Дитсадки',
      [PlaceType.CAFE]: 'Кафе',
      [PlaceType.SERVICE]: 'Приватні послуги',
      [PlaceType.PHARMACY]: 'Аптеки',
      [PlaceType.SALON]: 'Салони',
      [PlaceType.RESTAURANT]: 'Ресторани',
    },
    loading: 'Завантаження...',
    noPlaces: 'Місця не знайдено',
    headerTitle: 'Список місць',
    headerSubtitle: 'Магазини, кафе, школи та інші місця Чайки в одному каталозі',
    foundPlaces: 'Знайдено місць',
    reset: 'Скинути',
    search: 'Пошук',
    searchPlaceholder: 'Пошук за категорією: їжа, діти, салони, послуги',
    typeSearchPlaceholder: 'Пошук по типу місця: школи, ресторани, салони, кафе, магазини, дитсадки, приватні послуги, товари',
    categories: 'Категорії',
  },
  ru: {
    filterLabels: {
      [PlaceType.BUILDING]: 'Дома',
      [PlaceType.SHOP]: 'Магазины',
      [PlaceType.SCHOOL]: 'Школы',
      [PlaceType.KINDERGARTEN]: 'Детские сады',
      [PlaceType.CAFE]: 'Кафе',
      [PlaceType.SERVICE]: 'Частные услуги',
      [PlaceType.PHARMACY]: 'Аптеки',
      [PlaceType.SALON]: 'Салоны',
      [PlaceType.RESTAURANT]: 'Рестораны',
    },
    loading: 'Загрузка...',
    noPlaces: 'Места не найдены',
    headerTitle: 'Список мест',
    headerSubtitle: 'Магазины, кафе, школы и другие места Чайки в одном каталоге',
    foundPlaces: 'Найдено мест',
    reset: 'Сбросить',
    search: 'Поиск',
    searchPlaceholder: 'Поиск по категории: еда, дети, салоны, услуги',
    typeSearchPlaceholder: 'Поиск по типу мест: школы, рестораны, салоны, кафе, магазины, детские сады, частные услуги, товары',
    categories: 'Категории',
  },
  en: {
    filterLabels: {
      [PlaceType.BUILDING]: 'Buildings',
      [PlaceType.SHOP]: 'Shops',
      [PlaceType.SCHOOL]: 'Schools',
      [PlaceType.KINDERGARTEN]: 'Kindergartens',
      [PlaceType.CAFE]: 'Cafes',
      [PlaceType.SERVICE]: 'Private services',
      [PlaceType.PHARMACY]: 'Pharmacies',
      [PlaceType.SALON]: 'Salons',
      [PlaceType.RESTAURANT]: 'Restaurants',
    },
    loading: 'Loading...',
    noPlaces: 'No places found',
    headerTitle: 'Places list',
    headerSubtitle: 'Shops, cafes, schools, and other Chaika Life places in one directory',
    foundPlaces: 'Places found',
    reset: 'Reset',
    search: 'Search',
    searchPlaceholder: 'Search by category: food, kids, salons, services',
    typeSearchPlaceholder: 'Search by type: schools, restaurants, salons, cafes, shops, kindergartens, services, goods',
    categories: 'Categories',
  },
} as const;

const ListScreen: React.FC = () => {
  const dispatch = useDispatch();
  const { loadPlaces } = usePlaces();
  const places = useSelector((state: RootState) => selectFilteredPlaces(state));
  const loading = useSelector((state: RootState) => selectPlacesLoading(state));
  const error = useSelector((state: RootState) => selectPlacesError(state));
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const [search, setSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<PlaceType[]>(FILTER_TYPES);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  useEffect(() => {
    dispatch(filterBySearch(search));
  }, [dispatch, search]);

  useEffect(() => {
    dispatch(filterByTypes(selectedTypes));
  }, [dispatch, selectedTypes]);

  const handleToggleType = useCallback((type: PlaceType) => {
    setSelectedTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setSelectedTypes(FILTER_TYPES);
    dispatch(clearFilters());
  }, [dispatch]);

  const handleRefresh = useCallback(async () => {
    await loadPlaces(true);
    dispatch(filterBySearch(search));
    dispatch(filterByTypes(selectedTypes));
  }, [dispatch, loadPlaces, search, selectedTypes]);

  const emptyMessage = useMemo(() => {
    if (error) return error;
    if (loading) return text.loading;
    return text.noPlaces;
  }, [error, loading, text.loading, text.noPlaces]);

  const visiblePlaces = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();
    if (!query) return places;
    const typeAliases: Record<string, string> = {
      shop: 'магазин товары',
      school: 'школы школа',
      kindergarten: 'детские сады детский сад дети',
      cafe: 'кафе',
      restaurant: 'рестораны ресторан',
      salon: 'салоны салон',
      service: 'частные услуги услуги сервис',
      pharmacy: 'аптеки аптека',
    };
    return places.filter((place) => {
      const bucket = typeAliases[place.type] ?? '';
      return bucket.includes(query) || place.type.includes(query);
    });
  }, [places, typeSearch]);

  const showSkeleton = loading && visiblePlaces.length === 0;
  const renderPlace = useCallback(
    ({ item }: { item: Place }) => <PlaceCard place={item} onPress={() => setSelectedPlace(item)} />,
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        <Text style={styles.headerSubtitle}>
          {text.headerSubtitle}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>{text.foundPlaces}</Text>
          <Text style={styles.summaryValue}>{places.length}</Text>
        </View>
        <View style={styles.summaryAction}>
          <TactileIcon icon="close-circle-outline" size={42} iconSize={20} backgroundColor={SCREEN_THEME.terracotta} />
          <Text style={styles.summaryActionText} onPress={handleClearFilters}>
            {text.reset}
          </Text>
        </View>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchHeader}>
          <TactileIcon icon="magnify" size={40} iconSize={18} backgroundColor="#403933" />
          <Text style={styles.searchLabel}>{text.search}</Text>
        </View>
        <TextInput
          placeholder={text.searchPlaceholder}
          placeholderTextColor="#A0938D"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <TextInput
          placeholder={text.typeSearchPlaceholder}
          placeholderTextColor="#A0938D"
          value={typeSearch}
          onChangeText={setTypeSearch}
          style={[styles.searchInput, styles.typeSearchInput]}
        />
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.filtersHeader}>
          <TactileIcon icon="filter-variant" size={40} iconSize={18} backgroundColor="#403933" />
          <Text style={styles.filtersTitle}>{text.categories}</Text>
        </View>
        <View style={styles.filterButtons}>
          {FILTER_TYPES.map((type) => (
            <FilterButton
              key={type}
              type={type}
              label={text.filterLabels[type]}
              isSelected={selectedTypes.includes(type)}
              onPress={() => handleToggleType(type)}
            />
          ))}
        </View>
      </View>

      {loading ? <ActivityIndicator size="small" color={COLORS.primary} style={styles.loading} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {showSkeleton ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonCard}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={visiblePlaces}
        keyExtractor={(item: Place) => item.id}
        renderItem={renderPlace}
        style={styles.listView}
        contentContainerStyle={visiblePlaces.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyStateWrap}>
            <TactileIcon icon="map-search-outline" size={54} iconSize={24} backgroundColor="#EBD9B8" />
            <Text style={styles.emptyText}>{emptyMessage}</Text>
            <Pressable style={styles.emptyAction} onPress={handleClearFilters}>
              <Text style={styles.emptyActionText}>{text.reset}</Text>
            </Pressable>
          </View>
        }
        scrollEnabled
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
      />

      <PlaceDetailsPanel
        place={selectedPlace}
        visible={selectedPlace !== null}
        onClose={() => setSelectedPlace(null)}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  headerCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 28,
    padding: 18,
    margin: 16,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#6E573B',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginTop: 8,
  },
  headerSubtitle: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: SIZES.fontSmall,
    lineHeight: 20,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#6E573B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: SIZES.fontSmall,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '900',
    color: SCREEN_THEME.terracottaDark,
    marginTop: 4,
  },
  summaryAction: {
    alignItems: 'center',
  },
  summaryActionText: {
    marginTop: 6,
    color: SCREEN_THEME.terracottaDark,
    fontWeight: '800',
    fontSize: 12,
  },
  searchCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#6E573B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginLeft: 10,
  },
  searchInput: {
    borderRadius: 18,
    backgroundColor: '#F7EED8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    fontSize: SIZES.fontRegular,
    borderWidth: 1,
    borderColor: '#E1CFAB',
  },
  typeSearchInput: {
    marginTop: 10,
  },
  filtersCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#6E573B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  filtersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginLeft: 10,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  list: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    paddingBottom: 90,
  },
  listView: {
    flex: 1,
  },
  emptyList: {
    paddingHorizontal: 16,
    paddingVertical: 44,
    alignItems: 'center',
    paddingBottom: 120,
  },
  emptyStateWrap: {
    alignItems: 'center',
    width: '100%',
  },
  emptyText: {
    fontSize: SIZES.fontRegular,
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  emptyAction: {
    marginTop: 14,
    backgroundColor: '#F7EAD0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1CFAB',
  },
  emptyActionText: {
    color: SCREEN_THEME.terracottaDark,
    fontWeight: '800',
    fontSize: 13,
  },
  loading: {
    marginBottom: 8,
  },
  skeletonList: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  skeletonCard: {
    backgroundColor: '#F5E7CA',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 14,
    marginBottom: 10,
  },
  skeletonTitle: {
    height: 18,
    width: '54%',
    borderRadius: 8,
    backgroundColor: '#E6D5B5',
  },
  skeletonLine: {
    height: 12,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: '#E6D5B5',
  },
  skeletonLineShort: {
    width: '72%',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    padding: 16,
    fontSize: SIZES.fontRegular,
  },
});

export default ListScreen;


