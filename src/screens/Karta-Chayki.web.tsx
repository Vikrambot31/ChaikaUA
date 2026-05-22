import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PlaceCard from '../components/PlaceCard';
import PlaceDetailsPanel from './Panel-Detaley-Mesta';
import { COLORS, SIZES } from '../utils/constants';
import { Place, PlaceType } from '../types/app';
import { RootState } from '../redux/store';
import { chaykaBuildingPlaces } from '../services/chaykaBuildingPlaces';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    filters: {
      all: 'Усі',
      building: 'Будинки',
      cafe: 'Кафе',
      pharmacy: 'Аптеки',
      school: 'Школи',
      shop: 'Магазини',
      salon: 'Салони',
      restaurant: 'Ресторани',
    },
    headerTitle: 'ІНТЕРАКТИВНА КАРТА',
    headerSubtitle: 'Усі місця ЖК Чайка у веб-версії застосунку',
    placesOnMap: 'Місць на карті',
    avgRating: 'Середній рейтинг',
    infoTitle: 'Веб-версія карти',
    infoText: 'На мобільних пристроях використовується інтерактивна карта з повною підтримкою GPS і навігації. У веб-версії місця відсортовані за рейтингом для зручного перегляду.',
    allPlaces: 'Усі місця',
    noPlaces: 'Місця не знайдено',
  },
  ru: {
    filters: {
      all: 'Все',
      building: 'Дома',
      cafe: 'Кафе',
      pharmacy: 'Аптеки',
      school: 'Школы',
      shop: 'Магазины',
      salon: 'Салоны',
      restaurant: 'Рестораны',
    },
    headerTitle: 'ИНТЕРАКТИВНАЯ КАРТА',
    headerSubtitle: 'Все места ЖК Чайка в веб-версии приложения',
    placesOnMap: 'Мест на карте',
    avgRating: 'Средний рейтинг',
    infoTitle: 'Веб-версия карты',
    infoText: 'На мобильных устройствах используется интерактивная карта с полной поддержкой GPS и навигации. В веб-версии места отсортированы по рейтингу для удобного просмотра.',
    allPlaces: 'Все места',
    noPlaces: 'Места не найдены',
  },
  en: {
    filters: {
      all: 'All',
      building: 'Buildings',
      cafe: 'Cafes',
      pharmacy: 'Pharmacies',
      school: 'Schools',
      shop: 'Shops',
      salon: 'Salons',
      restaurant: 'Restaurants',
    },
    headerTitle: 'INTERACTIVE MAP',
    headerSubtitle: 'All Chaika Life places in web app view',
    placesOnMap: 'Places on map',
    avgRating: 'Average rating',
    infoTitle: 'Web map view',
    infoText: 'Mobile devices use a fully interactive map with GPS and navigation. In web mode, places are sorted by rating for quick browsing.',
    allPlaces: 'All places',
    noPlaces: 'No places found',
  },
} as const;

const MapScreen: React.FC = () => {
  const places = useSelector((state: RootState) => state.places.items);
  const error = useSelector((state: RootState) => state.places.error);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [selectedType, setSelectedType] = useState<PlaceType | undefined>();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const FILTERS: Array<{ label: string; type?: PlaceType }> = [
    { label: text.filters.all },
    { label: text.filters.building, type: PlaceType.BUILDING },
    { label: text.filters.cafe, type: PlaceType.CAFE },
    { label: text.filters.pharmacy, type: PlaceType.PHARMACY },
    { label: text.filters.school, type: PlaceType.SCHOOL },
    { label: text.filters.shop, type: PlaceType.SHOP },
    { label: text.filters.salon, type: PlaceType.SALON },
    { label: text.filters.restaurant, type: PlaceType.RESTAURANT },
  ];

  const sortedPlaces = useMemo(() => {
    const allPlaces = [...chaykaBuildingPlaces, ...places];
    return allPlaces
      .filter((place) => (selectedType ? place.type === selectedType : true))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  }, [places, selectedType]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.headerTitle}</Text>
          <Text style={styles.headerSubtitle}>
            {text.headerSubtitle}
          </Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statBlock}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons name="map-marker-multiple" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{sortedPlaces.length}</Text>
            <Text style={styles.statLabel}>{text.placesOnMap}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBlock}>
            <View style={styles.statIcon}>
              <MaterialCommunityIcons name="star" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>
              {sortedPlaces.length > 0
                ? (
                    sortedPlaces.reduce((sum, place) => sum + place.rating, 0) / sortedPlaces.length
                  ).toFixed(1)
                : '0.0'}
            </Text>
            <Text style={styles.statLabel}>{text.avgRating}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons name="information" size={20} color={COLORS.primary} />
            <Text style={styles.infoTitle}>{text.infoTitle}</Text>
          </View>
          <Text style={styles.infoText}>
            {text.infoText}
          </Text>
        </View>

        <View style={styles.headerCard2}>
          <Text style={styles.headerTitle2}>{text.allPlaces}</Text>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((filter) => {
            const active = selectedType === filter.type || (!selectedType && !filter.type);
            return (
              <TouchableOpacity
                key={filter.label}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedType(filter.type)}
                activeOpacity={0.82}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : sortedPlaces.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-search" size={48} color={COLORS.gray} />
            <Text style={styles.emptyText}>{text.noPlaces}</Text>
          </View>
        ) : (
          sortedPlaces.map((place) => <PlaceCard key={place.id} place={place} onPress={() => setSelectedPlace(place)} />)
        )}
      </ScrollView>
      <PlaceDetailsPanel
        place={selectedPlace}
        visible={selectedPlace !== null}
        onClose={() => setSelectedPlace(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontSize: SIZES.fontSmall,
    lineHeight: 20,
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: SIZES.fontSmall,
    color: COLORS.gray,
    fontWeight: '700',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: '#E8DDD3',
    marginHorizontal: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.black,
    marginLeft: 8,
  },
  infoText: {
    fontSize: SIZES.fontSmall,
    color: COLORS.gray,
    lineHeight: 20,
  },
  headerCard2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 14,
  },
  headerTitle2: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.black,
    marginLeft: 8,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.gray,
    fontWeight: '900',
    fontSize: 12,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    padding: 16,
    fontSize: SIZES.fontRegular,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: SIZES.fontRegular,
    fontWeight: '900',
    color: COLORS.black,
    marginTop: 12,
  },
});

export default MapScreen;





