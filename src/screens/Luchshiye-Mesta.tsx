import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { Place as AppPlace, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import { COLORS } from '../utils/constants';
import { useAppTheme } from '../hooks/useAppTheme';
import MiniTabBar from '../components/MiniTabBar';
import { usePlaces } from '../hooks/usePlaces';
import { selectPlacesLoading } from '../redux/slices/placesSlice';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';

type AppNavigation = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
type TabType = 'cafe' | 'store' | 'people';

const UI_TEXT = {
  ua: {
    headerTitle: 'Топ місця і люди',
    tabCafe: 'Кафе',
    tabStore: 'Магазини',
    peopleLabel: 'ЛЮДИ ЧАЙКИ',
    peopleSub: 'Активні мешканці',
  },
  ru: {
    headerTitle: 'Топ места и люди',
    tabCafe: 'Кафе',
    tabStore: 'Магазины',
    peopleLabel: 'ЛЮДИ ЧАЙКИ',
    peopleSub: 'Активные жители',
  },
  en: {
    headerTitle: 'Top Places & People',
    tabCafe: 'Cafes',
    tabStore: 'Stores',
    peopleLabel: 'CHAIKA PEOPLE',
    peopleSub: 'Active residents',
  },
} as const;

const TopPlacesScreen: React.FC = () => {
  const navigation = useNavigation<AppNavigation>();
  const { loadPlaces } = usePlaces();
  const places = useSelector((state: RootState) => state.places.items);
  const loading = useSelector((state: RootState) => selectPlacesLoading(state));
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const { colors } = useAppTheme();
  const [selectedType, setSelectedType] = useState<TabType>('cafe');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  const cafeData = useMemo(
    () =>
      places
        .filter((p) => p.type === PlaceType.CAFE || p.type === PlaceType.RESTAURANT)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)),
    [places],
  );

  const storeData = useMemo(
    () =>
      places
        .filter((p) => p.type === PlaceType.SHOP || p.type === PlaceType.PHARMACY || p.type === PlaceType.SALON)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)),
    [places],
  );

  const data = selectedType === 'cafe' ? cafeData : selectedType === 'store' ? storeData : [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPlaces(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadPlaces]);

  const getIconForType = (type: PlaceType): string => {
    switch (type) {
      case PlaceType.CAFE: return 'coffee';
      case PlaceType.RESTAURANT: return 'silverware-fork-knife';
      case PlaceType.SHOP: return 'store';
      case PlaceType.PHARMACY: return 'medical-bag';
      case PlaceType.SALON: return 'content-cut';
      default: return 'map-marker';
    }
  };

  const renderPlace = useCallback(({ item }: { item: AppPlace }) => (
    <TouchableOpacity
      style={styles.placeCard}
      activeOpacity={0.85}
      onPress={() => {
        navigation.navigate('PlaceDetailsPanel', { place: item });
      }}
    >
      <View style={styles.placeIcon}>
        <MaterialCommunityIcons
          name={getIconForType(item.type) as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          size={32}
          color={COLORS.primary}
        />
      </View>

      <View style={styles.placeInfo}>
        <Text style={styles.placeName}>{item.name}</Text>
        <Text style={styles.placeAddress} numberOfLines={1}>
          {item.address}
        </Text>
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openInGoogleMaps(item.name, item.address); }} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}>
          <Text style={styles.googleLink}>Google Maps ↗</Text>
        </TouchableOpacity>

        <View style={styles.ratingContainer}>
          <MaterialCommunityIcons name="star" size={16} color="#FFB800" />
          <Text style={styles.ratingText}>{(item.rating || 0).toFixed(1)}</Text>
          {item.reviews ? (
            <Text style={styles.reviewsText}>({item.reviews})</Text>
          ) : null}
        </View>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.gray} />
    </TouchableOpacity>
  ), [navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedType === 'cafe' && styles.tabActive]}
          onPress={() => setSelectedType('cafe')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="coffee"
            size={20}
            color={selectedType === 'cafe' ? '#FFFFFF' : COLORS.gray}
          />
          <Text style={[styles.tabText, selectedType === 'cafe' && styles.tabTextActive]}>
            {text.tabCafe}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedType === 'store' && styles.tabActive]}
          onPress={() => setSelectedType('store')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="store"
            size={20}
            color={selectedType === 'store' ? '#FFFFFF' : COLORS.gray}
          />
          <Text style={[styles.tabText, selectedType === 'store' && styles.tabTextActive]}>
            {text.tabStore}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderPlace}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        scrollIndicatorInsets={{ right: 1 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={loading ? <ActivityIndicator size="small" color={COLORS.primary} style={styles.listLoader} /> : null}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={styles.skeletonCard}>
                  <View style={styles.skeletonIcon} />
                  <View style={styles.skeletonTextBlock}>
                    <View style={styles.skeletonTitle} />
                    <View style={styles.skeletonLine} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="map-search-outline" size={30} color={COLORS.gray} />
              <Text style={styles.emptyText}>Поки немає даних у цій категорії</Text>
            </View>
          )
        }
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.peopleButton}
            onPress={() => navigation.navigate('TopGirlsBoysScreen')}
            activeOpacity={0.8}
          >
            <View style={styles.peopleButtonGloss} />
            <MaterialCommunityIcons name="account-multiple" size={32} color="rgba(255,255,255,0.95)" />
            <Text style={styles.peopleButtonLabel}>{text.peopleLabel}</Text>
            <Text style={styles.peopleButtonSub}>{text.peopleSub}</Text>
          </TouchableOpacity>
        }
      />
      <MiniTabBar />
      <VideoLoadingOverlay visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  header: {
    height: 60,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  backButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DDD3',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F7F3EE',
    gap: 6,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    paddingBottom: 110,
  },
  listLoader: {
    marginTop: 8,
  },
  skeletonWrap: {
    gap: 10,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  skeletonIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#EFE7DF',
    marginRight: 12,
  },
  skeletonTextBlock: {
    flex: 1,
  },
  skeletonTitle: {
    height: 14,
    width: '56%',
    borderRadius: 7,
    backgroundColor: '#EFE7DF',
  },
  skeletonLine: {
    height: 11,
    marginTop: 8,
    width: '82%',
    borderRadius: 7,
    backgroundColor: '#EFE7DF',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
    textAlign: 'center',
  },
  placeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  placeIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#F7F3EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  placeAddress: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  googleLink: { fontSize: 10, color: '#4285F4', fontWeight: '600', marginTop: 2 },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFB800',
  },
  reviewsText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  peopleButton: {
    backgroundColor: '#7A1E5C',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 5 },
    shadowColor: '#5A1545',
    elevation: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.25)',
    overflow: 'hidden',
    position: 'relative',
  },
  peopleButtonGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  peopleButtonLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  peopleButtonSub: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default TopPlacesScreen;

