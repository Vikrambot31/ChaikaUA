import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { useRoute, RouteProp } from '@react-navigation/native';
import PlaceMarker from '../components/PlaceMarker';
import PlaceDetailsPanel from './Panel-Detaley-Mesta';
import { usePlaces } from '../hooks/usePlaces';
import { AppDispatch } from '../redux/store';
import { filterByTypes } from '../redux/slices/placesSlice';
import { Place, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import { DEFAULT_REGION, SIZES } from '../utils/constants';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { chaykaBuildingPlaces } from '../services/chaykaBuildingPlaces';
import type { MapFocusPlaceParams } from '../utils/mapFocusParams';

const INITIAL_REGION: Region = {
  latitude: DEFAULT_REGION.latitude,
  longitude: DEFAULT_REGION.longitude,
  latitudeDelta: DEFAULT_REGION.latitudeDelta,
  longitudeDelta: DEFAULT_REGION.longitudeDelta,
};

const LIST_ROW_HEIGHT = 66;

const UI_TEXT = {
  ua: {
    all: 'Усі',
    search: 'Знайти місце, кафе, аптеку...',
    found: 'Знайдено місць',
    onMap: 'на карті',
    empty: 'Місця не знайдені',
    emptySub: 'Спробуйте змінити пошук або фільтри',
    buildingsUnavailable: 'Будинки вже доступні на карті.',
    loadError: 'Не вдалося завантажити місця',
    retry: 'Спробувати ще раз',
    support: 'Якщо проблема зберігається: support_chaika_ua@ukr.net',
    showMore: 'Більше',
  },
  ru: {
    all: 'Все',
    search: 'Найти место, кафе, аптеку...',
    found: 'Найдено мест',
    onMap: 'на карте',
    empty: 'Места не найдены',
    emptySub: 'Попробуйте изменить поиск или фильтры',
    buildingsUnavailable: 'Дома уже доступны на карте.',
    loadError: 'Не удалось загрузить места',
    retry: 'Попробовать снова',
    support: 'Если проблема сохраняется: support_chaika_ua@ukr.net',
    showMore: 'Больше',
  },
  en: {
    all: 'All',
    search: 'Find a place, cafe, pharmacy...',
    found: 'Places found',
    onMap: 'on map',
    empty: 'No places found',
    emptySub: 'Try adjusting search or filters',
    buildingsUnavailable: 'Buildings are already available on the map.',
    loadError: 'Failed to load places',
    retry: 'Try again',
    support: 'If the issue persists: support_chaika_ua@ukr.net',
    showMore: 'More',
  },
} as const;


const MAP_FALLBACK_TEXT = {
  ua: {
    title: 'Карта тимчасово недоступна',
    body: 'Список місць працює. Відкрийте найближче місце в Google Maps.',
    button: 'Відкрити Google Maps',
  },
  ru: {
    title: 'Карта временно недоступна',
    body: 'Список мест работает. Откройте ближайшее место в Google Maps.',
    button: 'Открыть Google Maps',
  },
  en: {
    title: 'Map is temporarily unavailable',
    body: 'The places list still works. Open the nearest place in Google Maps.',
    button: 'Open Google Maps',
  },
} as const;

const PLACE_TYPE_LABELS = {
  ua: {
    all: 'Усі',
    shop: 'Магазини',
    school: 'Школи',
    kindergarten: 'Дитсадки',
    cafe: 'Кафе',
    service: 'Послуги',
    pharmacy: 'Аптеки',
    salon: 'Салони',
    restaurant: 'Ресторани',
    building: 'Будинки',
  },
  ru: {
    all: 'Все',
    shop: 'Магазины',
    school: 'Школы',
    kindergarten: 'Детские сады',
    cafe: 'Кафе',
    service: 'Услуги',
    pharmacy: 'Аптеки',
    salon: 'Салоны',
    restaurant: 'Рестораны',
    building: 'Дома',
  },
  en: {
    all: 'All',
    shop: 'Shops',
    school: 'Schools',
    kindergarten: 'Kindergartens',
    cafe: 'Cafes',
    service: 'Services',
    pharmacy: 'Pharmacies',
    salon: 'Salons',
    restaurant: 'Restaurants',
    building: 'Buildings',
  },
} as const;

type MapScreenRouteParams = { focusBuildingId?: string } & Partial<MapFocusPlaceParams>;

type PlaceResultRowProps = {
  item: Place;
  index: number;
  lang: 'ua' | 'ru' | 'en';
  onPress: (place: Place) => void;
};

const PlaceResultRow = memo(({ item, index, lang, onPress }: PlaceResultRowProps) => {
  return (
    <TouchableOpacity style={styles.resultRow} onPress={() => onPress(item)} activeOpacity={0.86}>
      <View style={styles.resultNumber}>
        <Text style={styles.resultNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.resultTextBlock}>
        <Text style={styles.resultName}>{item.name}</Text>
        <Text style={styles.resultAddress} numberOfLines={1}>
          {item.address || PLACE_TYPE_LABELS[lang][item.type as keyof typeof PLACE_TYPE_LABELS.ua]}
        </Text>
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openInGoogleMaps(item.name, item.address); }} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}>
          <Text style={styles.googleLink}>Google Maps ↗</Text>
        </TouchableOpacity>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
    </TouchableOpacity>
  );
}, (prev, next) => prev.item === next.item && prev.index === next.index && prev.onPress === next.onPress);

const MapScreen: React.FC = () => {
  const mapRef = useRef<MapView | null>(null);
  const listRef = useRef<FlatList<Place> | null>(null);
  const focusAnimPending = useRef(false);
  const dispatch = useDispatch<AppDispatch>();
  const route = useRoute<RouteProp<Record<string, MapScreenRouteParams>, string>>();
  const focusBuildingId = route.params?.focusBuildingId;
  const focusPlaceId = route.params?.focusPlaceId;
  const { loadPlaces } = usePlaces();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const places = useSelector((state: RootState) => state.places.items);
  const error = useSelector((state: RootState) => state.places.error);
  const selectedTypes = useSelector((state: RootState) => state.places.selectedTypes);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [showAllMapPlaces, setShowAllMapPlaces] = useState(false);
  const [detailsPanelVisible, setDetailsPanelVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeSearchText, setTypeSearchText] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const mapFallbackText = MAP_FALLBACK_TEXT[language];
  const placeLabels = PLACE_TYPE_LABELS[language];
  const fallbackFocusedPlace = useMemo<Place | null>(() => {
    const lat = route.params?.focusPlaceLat;
    const lng = route.params?.focusPlaceLng;
    const type = route.params?.focusPlaceType;

    if (!focusPlaceId || typeof lat !== 'number' || typeof lng !== 'number' || !type) {
      return null;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      id: focusPlaceId,
      name: route.params?.focusPlaceName || text.found,
      address: route.params?.focusPlaceAddress || '',
      latitude: lat,
      longitude: lng,
      type,
      rating: 0,
      reviews: 0,
      createdAt: Date.now(),
    };
  }, [focusPlaceId, route.params?.focusPlaceAddress, route.params?.focusPlaceLat, route.params?.focusPlaceLng, route.params?.focusPlaceName, route.params?.focusPlaceType, text.found]);

  const filters = useMemo<Array<{ label: string; type?: PlaceType }>>(
    () => [
      { label: placeLabels.all },
      { label: placeLabels.building, type: PlaceType.BUILDING },
      { label: placeLabels.shop, type: PlaceType.SHOP },
      { label: placeLabels.school, type: PlaceType.SCHOOL },
      { label: placeLabels.kindergarten, type: PlaceType.KINDERGARTEN },
      { label: placeLabels.cafe, type: PlaceType.CAFE },
      { label: placeLabels.pharmacy, type: PlaceType.PHARMACY },
      { label: placeLabels.salon, type: PlaceType.SALON },
      { label: placeLabels.restaurant, type: PlaceType.RESTAURANT },
      { label: placeLabels.service, type: PlaceType.SERVICE },
    ],
    [language, placeLabels]
  );
  const allMapPlaces = useMemo(() => {
    const basePlaces = [...chaykaBuildingPlaces, ...places];
    if (!fallbackFocusedPlace || basePlaces.some((place) => place.id === fallbackFocusedPlace.id)) {
      return basePlaces;
    }

    return [fallbackFocusedPlace, ...basePlaces];
  }, [fallbackFocusedPlace, places]);

  useEffect(() => {
    if (!focusBuildingId) return;
    const target = chaykaBuildingPlaces.find((p) => p.id === `building-${focusBuildingId}`);
    if (!target) return;
    focusAnimPending.current = true;
    dispatch(filterByTypes([PlaceType.BUILDING]));
    setSelectedPlaceId(target.id);
    setDetailsPanelVisible(true);
    const t = setTimeout(() => {
      focusAnimPending.current = false;
      if (!mapRef.current) return;
      mapRef.current.animateToRegion(
        { latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 },
        600
      );
    }, 900);
    return () => clearTimeout(t);
  }, [focusBuildingId, dispatch, mapReady]);

  useEffect(() => {
    if (!focusPlaceId) return;
    const target = allMapPlaces.find((p) => p.id === focusPlaceId);
    if (!target) return;
    focusAnimPending.current = true;
    dispatch(filterByTypes([target.type]));
    setSelectedPlaceId(target.id);
    setDetailsPanelVisible(true);
    const t = setTimeout(() => {
      focusAnimPending.current = false;
      if (!mapRef.current) return;
      mapRef.current.animateToRegion(
        { latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 },
        600
      );
    }, 900);
    return () => clearTimeout(t);
  }, [allMapPlaces, focusPlaceId, dispatch, mapReady]);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  useEffect(() => {
    if (mapReady) {
      setMapLoadFailed(false);
      return undefined;
    }

    const timeout = setTimeout(() => {
      setMapLoadFailed(true);
    }, 6500);

    return () => clearTimeout(timeout);
  }, [mapReady]);

  const handleFilterPress = useCallback(
    (type?: PlaceType) => {
      if (!type) {
        dispatch(filterByTypes([]));
        return;
      }

      const next = selectedTypes[0] === type && selectedTypes.length === 1 ? [] : [type];
      dispatch(filterByTypes(next));
    },
    [dispatch, selectedTypes]
  );

  const activePlaces = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const typeQuery = typeSearchText.trim().toLowerCase();
    const hasSelectedTypes = selectedTypes.length > 0;
    const typeAliases: Record<string, string> = {
      building: 'дома будинки buildings',
      shop: 'магазины магазини shop shops товары',
      school: 'школы школи school schools',
      kindergarten: 'детские сады дитсадки kindergarten kindergartens дети',
      cafe: 'кафе cafe cafes еда',
      pharmacy: 'аптека аптеки pharmacy pharmacies',
      salon: 'салон салоны салони salon salons',
      restaurant: 'ресторан рестораны restaurant restaurants еда',
      service: 'услуги послуги service services сервис',
    };

    return allMapPlaces.filter((place) => {
      const matchesSearch =
        query.length === 0 ||
        place.name.toLowerCase().includes(query) ||
        place.address.toLowerCase().includes(query);
      const bucket = typeAliases[place.type] ?? '';
      const matchesTypeSearch =
        typeQuery.length === 0 ||
        bucket.includes(typeQuery) ||
        place.type.toLowerCase().includes(typeQuery);
      const matchesType = !hasSelectedTypes || selectedTypes.includes(place.type);
      return matchesSearch && matchesTypeSearch && matchesType;
    });
  }, [allMapPlaces, searchText, selectedTypes, typeSearchText]);

  const selectedPlace = useMemo(
    () => activePlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [activePlaces, selectedPlaceId]
  );

  useEffect(() => {
    if (activePlaces.length === 0) {
      setSelectedPlaceId(null);
      setDetailsPanelVisible(false);
      return;
    }

    if (!selectedPlaceId || !activePlaces.some((item) => item.id === selectedPlaceId)) {
      setSelectedPlaceId(activePlaces[0].id);
      setDetailsPanelVisible(false);
    }
  }, [activePlaces]);

  useEffect(() => {
    if (!mapRef.current || activePlaces.length === 0 || focusAnimPending.current) {
      return;
    }

    if (activePlaces.length === 1) {
      const place = activePlaces[0];
      mapRef.current.animateToRegion(
        {
          latitude: place.latitude,
          longitude: place.longitude,
          latitudeDelta: 0.001,
          longitudeDelta: 0.001,
        },
        450
      );
      return;
    }

    mapRef.current.fitToCoordinates(
      activePlaces.map((place) => ({ latitude: place.latitude, longitude: place.longitude })),
      { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: true }
    );
  }, [activePlaces]);

  useEffect(() => {
    setShowAllMapPlaces(false);
  }, [searchText, typeSearchText, selectedTypes]);

  const focusPlace = useCallback((place: Place) => {
    setSelectedPlaceId(place.id);
    setDetailsPanelVisible(true);
    mapRef.current?.animateToRegion(
      { latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 },
      450
    );
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleMarkerPress = useCallback(
    (place: Place) => {
      focusPlace(place);
      setDetailsPanelVisible(true);
    },
    [focusPlace]
  );

  const handleListItemPress = useCallback(
    (place: Place) => {
      focusPlace(place);
    },
    [focusPlace]
  );

  const mapRegion = useMemo<Region>(() => {
    if (activePlaces.length === 1) {
      const place = activePlaces[0];
      return {
        latitude: place.latitude,
        longitude: place.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
    }

    return INITIAL_REGION;
  }, [activePlaces]);

  const markers = useMemo(
    () =>
      activePlaces.map((place) => (
        <Marker
          key={place.id}
          tracksViewChanges={place.id === selectedPlace?.id}
          coordinate={{ latitude: place.latitude, longitude: place.longitude }}
          title={place.name}
          description={place.address}
          onPress={() => handleMarkerPress(place)}
        >
          <PlaceMarker place={place} selected={place.id === selectedPlace?.id} />
        </Marker>
      )),
    [activePlaces, handleMarkerPress, selectedPlace]
  );

  const renderPlaceItem = useCallback(
    ({ item, index }: { item: Place; index: number }) => (
      <PlaceResultRow item={item} index={index} lang={language} onPress={handleListItemPress} />
    ),
    [handleListItemPress]
  );

  const renderEmpty = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color="#DC2626" />
          <Text style={styles.errorTitle}>{text.loadError}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadPlaces()} activeOpacity={0.84}>
            <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>{text.retry}</Text>
          </TouchableOpacity>
          <Text style={styles.supportText}>{text.support}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="map-search-outline" size={48} color={SCREEN_THEME.textSecondary} />
        <Text style={styles.emptyText}>{text.empty}</Text>
        <Text style={styles.emptySubtext}>{text.emptySub}</Text>
      </View>
    );
  };

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.mapCard}>
          {mapLoadFailed ? (
            <View style={styles.mapFallback}>
              <MaterialCommunityIcons name="alert-outline" size={42} color={SCREEN_THEME.terracotta} />
              <Text style={styles.mapFallbackTitle}>{mapFallbackText.title}</Text>
              <Text style={styles.mapFallbackText}>{mapFallbackText.body}</Text>
              <TouchableOpacity
                style={styles.mapFallbackButton}
                onPress={() => {
                  const place = selectedPlace || activePlaces[0];
                  if (place) {
                    openInGoogleMaps(place.name, place.address);
                  }
                }}
                activeOpacity={0.84}
              >
                <Text style={styles.mapFallbackButtonText}>{mapFallbackText.button}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={mapRegion}
              showsUserLocation={false}
              showsMyLocationButton={false}
              loadingEnabled={false}
              onMapReady={() => {
                setMapReady(true);
                setMapLoadFailed(false);
              }}
            >
              {markers}
            </MapView>
          )}
        </View>

        <View style={styles.quickFiltersWrap}>
          {filters.map((filter) => {
            const active = filter.type ? selectedTypes.includes(filter.type) : selectedTypes.length === 0;
            return (
              <TouchableOpacity
                key={`quick-${filter.label}`}
                style={[styles.quickFilterChip, active && styles.quickFilterChipActive]}
                onPress={() => handleFilterPress(filter.type)}
                activeOpacity={0.85}
              >
                <Text style={[styles.quickFilterText, active && styles.quickFilterTextActive]} numberOfLines={1}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedPlace ? (
          <View style={styles.selectedBanner}>
            <TactileIcon icon="map-marker" size={42} iconSize={20} backgroundColor="#3B352E" />
            <View style={styles.bannerContent}>
              <Text style={styles.selectedBannerTitle}>{selectedPlace.name}</Text>
              <Text style={styles.selectedBannerText}>
                {PLACE_TYPE_LABELS[language][selectedPlace.type as keyof typeof PLACE_TYPE_LABELS.ua]} · {activePlaces.indexOf(selectedPlace) + 1} {text.onMap}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.resultsHeader}>
          <View style={styles.resultsHeaderLeft}>
            <TactileIcon icon="format-list-bulleted" size={38} iconSize={17} backgroundColor="#403933" />
            <Text style={styles.resultsTitle}>{text.found}</Text>
          </View>
          <View style={styles.resultsCount}>
            <Text style={styles.resultsCountText}>{activePlaces.length}</Text>
          </View>
        </View>
      </>
    ),
    [activePlaces, filters, handleFilterPress, mapFallbackText, mapLoadFailed, mapRegion, markers, selectedPlace, selectedTypes, text.found, text.onMap]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        {LIGHT_ORBS.map((orb, index) => (
          <View
            key={index}
            style={[
              styles.orb,
              {
                width: orb.size,
                height: orb.size,
                backgroundColor: orb.color,
                top: orb.top,
                left: orb.left,
                right: orb.right,
                bottom: orb.bottom,
              },
            ]}
          />
        ))}
      </View>

        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <TactileIcon icon="magnify" size={38} iconSize={17} backgroundColor="#403933" />
            <TextInput
            placeholder={text.search}
            placeholderTextColor="#9C8B6F"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFiltersVisible((value) => !value)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="tune-variant" color={SCREEN_THEME.textSecondary} size={20} />
          </TouchableOpacity>
        </View>

          <TextInput
            placeholder={
              language === 'en'
                ? 'Search by type: schools, restaurants, salons, cafes, shops, kindergartens, services'
                : language === 'ru'
                  ? 'Поиск по типу: школы, рестораны, салоны, кафе, магазины, детские сады, услуги'
                  : 'Пошук по типу: школи, ресторани, салони, кафе, магазини, дитсадки, послуги'
            }
            placeholderTextColor="#9C8B6F"
            value={typeSearchText}
            onChangeText={setTypeSearchText}
            style={styles.secondarySearchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />

          {filtersVisible ? (
            <View style={styles.filtersWrap}>
              {filters.map((filter) => {
                const active = filter.type ? selectedTypes.includes(filter.type) : selectedTypes.length === 0;
                return (
                  <TouchableOpacity
                    key={filter.label}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => handleFilterPress(filter.type)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

      <FlatList
        ref={listRef}
        data={showAllMapPlaces ? activePlaces : activePlaces.slice(0, 4)}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          !showAllMapPlaces && activePlaces.length > 4 ? (
            <TouchableOpacity style={styles.showMoreButton} activeOpacity={0.82} onPress={() => setShowAllMapPlaces(true)}>
              <Text style={styles.showMoreText}>{text.showMore}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={renderEmpty}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: LIST_ROW_HEIGHT, offset: LIST_ROW_HEIGHT * index, index })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true });
          }, 300);
        }}
        renderItem={renderPlaceItem}
      />

      <PlaceDetailsPanel
        place={selectedPlace}
        visible={detailsPanelVisible}
        onClose={() => setDetailsPanelVisible(false)}
        onOpenInApp={() => setDetailsPanelVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  backgroundOrbs: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  listContent: {
    paddingBottom: 32,
  },
  searchCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 24,
    shadowColor: '#6E573B',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  searchRow: {
    backgroundColor: '#F7EED8',
    borderRadius: 18,
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: SCREEN_THEME.textPrimary,
    fontSize: SIZES.fontRegular,
    paddingVertical: 10,
  },
  secondarySearchInput: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#F7EED8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    fontSize: SIZES.fontRegular,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
  },
  filterButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F2E3C1',
  },
  filtersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  filterChip: {
    backgroundColor: '#F5ECD7',
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracotta,
  },
  filterChipText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  mapCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    height: 340,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
    shadowColor: '#6E573B',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#FBF8FD',
  },
  mapFallbackTitle: {
    marginTop: 10,
    color: SCREEN_THEME.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  mapFallbackText: {
    marginTop: 8,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  mapFallbackButton: {
    marginTop: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  mapFallbackButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  quickFiltersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  quickFilterChip: {
    backgroundColor: '#FBF8FD',
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  quickFilterChipActive: {
    backgroundColor: SCREEN_THEME.enamelBlue,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  quickFilterText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '900',
    fontSize: 12,
  },
  quickFilterTextActive: {
    color: '#FFFFFF',
  },
  infoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.enamelBlue,
    shadowColor: '#315B72',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  infoToastText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  selectedBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#8E6548',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bannerContent: {
    flex: 1,
  },
  selectedBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  selectedBannerText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  resultsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginLeft: 10,
  },
  resultsCount: {
    backgroundColor: SCREEN_THEME.enamelBlue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resultsCountText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
  },
  resultRow: {
    minHeight: 60,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
    shadowColor: '#6E573B',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  resultNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultNumberText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultTextBlock: {
    flex: 1,
    paddingLeft: 12,
  },
  resultName: {
    color: SCREEN_THEME.textPrimary,
    fontSize: SIZES.fontRegular,
    fontWeight: '700',
  },
  resultAddress: {
    marginTop: 2,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  googleLink: {
    marginTop: 3,
    fontSize: 10,
    color: '#4285F4',
    fontWeight: '600',
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
  },
  showMoreText: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textSecondary,
  },
  emptyContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: SIZES.fontRegular,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: SCREEN_THEME.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  errorContainer: {
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: SIZES.fontRegular,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 16,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  supportText: {
    fontSize: 12,
    color: SCREEN_THEME.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default MapScreen;

