import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import TactileIcon from '../components/TactileIcon';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { PlaceType } from '../types/app';
import { RootState } from '../redux/store';

const UI_TEXT = {
  ua: {
    back: 'Назад',
    headerTitle: 'Цікаві місця',
    headerSubtitle: 'Реальні місця з карти Чайки.',
    openOnMap: 'Відкрити на карті',
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
    back: 'Назад',
    headerTitle: 'Интересные места',
    headerSubtitle: 'Реальные места с карты Чайки.',
    openOnMap: 'Открыть на карте',
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
    back: 'Back',
    headerTitle: 'Interesting Places',
    headerSubtitle: 'Real places from the Chaika Life map.',
    openOnMap: 'Open on map',
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

export default function InterestingPlacesScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];

  const places = useMemo(
    () => chaykaPlaces.filter((place) => [PlaceType.SCHOOL, PlaceType.SALON, PlaceType.RESTAURANT, PlaceType.CAFE].includes(place.type)),
    [],
  );

  return (
    <SafeAreaView style={styles.container}>
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
          <Text style={styles.headerTitle}>{text.headerTitle}</Text>
          <Text style={styles.headerSubtitle}>{text.headerSubtitle}</Text>
        </View>

        <TouchableOpacity style={styles.mapButton} onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab' })} activeOpacity={0.86}>
          <MaterialCommunityIcons name="map-search-outline" size={24} color="#fff" />
          <Text style={styles.mapButtonText}>{text.openOnMap}</Text>
        </TouchableOpacity>

        {places.map((place) => (
          <TouchableOpacity
            key={place.id}
            style={styles.itemCard}
            activeOpacity={0.82}
            onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab', params: getMapFocusPlaceParams(place) })}
          >
            <TactileIcon icon="map-marker-outline" size={50} iconSize={22} backgroundColor={SCREEN_THEME.terracottaDark} tint="#FFF3CE" />
            <View style={styles.info}>
              <Text style={styles.name}>{place.name}</Text>
              <Text style={styles.desc}>{text.typeLabels[place.type]} · {place.address}</Text>
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openInGoogleMaps(place.name, place.address); }} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}>
                <Text style={styles.googleLink}>Google Maps ↗</Text>
              </TouchableOpacity>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingTop: 16, paddingBottom: 110 },
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
  mapButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 14, backgroundColor: SCREEN_THEME.woodGreenDark, marginBottom: 14 },
  mapButtonText: { color: '#fff', fontWeight: '900' },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB', gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  desc: { fontSize: 13, color: SCREEN_THEME.textSecondary, fontWeight: '700', marginTop: 4, lineHeight: 18 },
  googleLink: { fontSize: 10, color: '#4285F4', fontWeight: '600', marginTop: 3 },
});
