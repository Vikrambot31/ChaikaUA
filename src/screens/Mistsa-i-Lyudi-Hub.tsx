import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { RootState } from '../redux/store';

type AppNavigation = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;

interface HubCard {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  screen?: string;
  tab?: string;
}

const UI_TEXT = {
  ua: {
    headerTitle: 'Місця і люди',
    welcomeTitle: 'Досліджуй Чайку',
    welcomeText: 'Знайди найкращі місця, познайомся з сусідами та дізнайся більше про наш ЖК',
    cards: [
      { id: '1', title: 'Топ місця', subtitle: 'Кращі кафе та магазини', icon: 'star', color: '#7A1E5C', screen: 'TopPlacesScreen' },
      { id: '2', title: 'Місця Чайки', subtitle: 'Кафе, магазини, школи та салони', icon: 'map-marker-multiple', color: '#00897B', screen: 'PlacesScreen' },
      { id: '4', title: 'Все для дітей', subtitle: 'Садочки, школи, гуртки та події', icon: 'baby-face-outline', color: '#C77A5D', screen: 'VseDlyaDeteyScreen' },
      { id: '3', title: 'Карта Чайки', subtitle: 'Всі місця на карті', icon: 'map-search', color: '#3B7EA1', tab: 'MapTab' },
      { id: '5', title: 'Люди Чайки', subtitle: 'Активні мешканці', icon: 'account-multiple', color: '#E53935', screen: 'TopGirlsBoysScreen' },
    ] as HubCard[],
  },
  ru: {
    headerTitle: 'Места и люди',
    welcomeTitle: 'Исследуй Чайку',
    welcomeText: 'Найди лучшие места, познакомься с соседями и узнай больше о нашем ЖК',
    cards: [
      { id: '1', title: 'Топ места', subtitle: 'Лучшие кафе и магазины', icon: 'star', color: '#7A1E5C', screen: 'TopPlacesScreen' },
      { id: '2', title: 'Места Чайки', subtitle: 'Кафе, магазины, школы и салоны', icon: 'map-marker-multiple', color: '#00897B', screen: 'PlacesScreen' },
      { id: '4', title: 'Все для детей', subtitle: 'Садики, школы, кружки и события', icon: 'baby-face-outline', color: '#C77A5D', screen: 'VseDlyaDeteyScreen' },
      { id: '3', title: 'Карта Чайки', subtitle: 'Все места на карте', icon: 'map-search', color: '#3B7EA1', tab: 'MapTab' },
      { id: '5', title: 'Люди Чайки', subtitle: 'Активные жители', icon: 'account-multiple', color: '#E53935', screen: 'TopGirlsBoysScreen' },
    ] as HubCard[],
  },
  en: {
    headerTitle: 'Places & People',
    welcomeTitle: 'Explore Chaika Life',
    welcomeText: 'Find top places, meet neighbors, and discover more about our community',
    cards: [
      { id: '1', title: 'Top places', subtitle: 'Best cafes and stores', icon: 'star', color: '#7A1E5C', screen: 'TopPlacesScreen' },
      { id: '2', title: 'Chaika Life places', subtitle: 'Cafes, stores, schools, salons, and more', icon: 'map-marker-multiple', color: '#00897B', screen: 'PlacesScreen' },
      { id: '4', title: 'Everything for Kids', subtitle: 'Kindergartens, schools, clubs and events', icon: 'baby-face-outline', color: '#C77A5D', screen: 'VseDlyaDeteyScreen' },
      { id: '3', title: 'Chaika Life map', subtitle: 'Open all places on the map', icon: 'map-search', color: '#3B7EA1', tab: 'MapTab' },
      { id: '5', title: 'Chaika Life people', subtitle: 'Active residents', icon: 'account-multiple', color: '#E53935', screen: 'TopGirlsBoysScreen' },
    ] as HubCard[],
  },
} as const;

const PlacesAndPeopleHub: React.FC = () => {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];

  const handleOpenCard = (card: HubCard) => {
    if (card.tab) {
      navigation.navigate('MainTabs', { screen: card.tab });
      return;
    }
    if (card.screen) {
      navigation.navigate(card.screen);
    }
  };

  const renderCard = (card: HubCard) => (
    <TouchableOpacity
      key={card.id}
      style={[styles.card, { backgroundColor: card.color }]}
      onPress={() => handleOpenCard(card)}
      activeOpacity={0.85}
    >
      <View style={styles.cardGloss} />
      <MaterialCommunityIcons
        name={card.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={48}
        color="rgba(255,255,255,0.95)"
      />
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
      <View style={styles.cardArrow}>
        <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>{text.welcomeTitle}</Text>
          <Text style={styles.welcomeText}>
            {text.welcomeText}
          </Text>
        </View>

        <View style={styles.grid}>
          {text.cards.map(renderCard)}
        </View>
      </ScrollView>
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
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: 12,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  grid: {
    gap: 14,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  cardGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  cardArrow: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
});

export default PlacesAndPeopleHub;
