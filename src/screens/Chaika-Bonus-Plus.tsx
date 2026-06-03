import React from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { safeNavigate } from '../utils/safeNavigation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { RootState } from '../redux/store';

type BonusItem = {
  label: string;
  desc: string;
  screen: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
};

type SectionedItems = {
  headerTitle: string;
  sectionFrequent: string;
  sectionCommunity: string;
  sectionMarket: string;
  frequent: BonusItem[];
  community: BonusItem[];
  market: BonusItem[];
};

const UI_TEXT: Record<'ua' | 'ru' | 'en', SectionedItems> = {
  ua: {
    headerTitle: 'Сервіси',
    sectionFrequent: 'Щодня',
    sectionCommunity: 'Спільнота',
    sectionMarket: 'Оголошення',
    frequent: [
      { label: 'Світло і повідомлення', desc: 'Що пишуть сусіди у будинку', screen: 'ElectricityStatusScreen', icon: 'lightning-bolt-outline', accent: '#C79C47' },
      { label: 'Місця Чайки', desc: 'Кафе, магазини та послуги поруч', screen: 'PlacesScreen', icon: 'map-marker-multiple', accent: '#00897B' },
      { label: 'Фото району', desc: 'Галерея фотографій ЖК Чайка', screen: 'FotoRayonaScreen', icon: 'image-plus', accent: '#5C6BC0' },
    ] as BonusItem[],
    community: [
      { label: 'Люди Чайки', desc: 'Мешканці та спільнота', screen: 'TopGirlsBoysScreen', icon: 'account-multiple-outline', accent: '#7B6EB1' },
      { label: 'Контакти Чайки', desc: 'Знайдіть людей поруч для спілкування', screen: 'KontaktiChaikyScreen', icon: 'account-heart-outline', accent: '#6A8BA5' },
      { label: 'Спорт на Чайці', desc: 'Баскетбол, футбол і теніс з сусідами', screen: 'SportNaChaykeScreen', icon: 'run-fast', accent: '#4F8D5F' },
    ] as BonusItem[],
    market: [
      { label: 'Їжа на Чайці', desc: 'Поїсти, продукти, акції поруч', screen: 'EdaNaChaykeScreen', icon: 'food-fork-drink', accent: '#FFD400' },
      { label: 'Все для дітей', desc: 'Садочки, школи, гуртки та події', screen: 'VseDlyaDeteyScreen', icon: 'baby-face-outline', accent: '#C77A5D' },
      { label: 'Бізнес на Чайці', desc: 'Розмістіть свій бізнес для мешканців', screen: 'BizznesChaikaScreen', icon: 'store-plus-outline', accent: '#6E7F47' },
      { label: 'Салони краси', desc: 'Перукарні, манікюр, косметологія', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
      { label: 'Пошук роботи', desc: 'Вакансії та резюме', screen: 'JobSearchScreen', icon: 'briefcase-search-outline', accent: '#4D7892' },
      { label: 'Куплю / продам', desc: 'Оголошення мешканців', screen: 'BuySellScreen', icon: 'shopping-outline', accent: '#C96E3E' },
      { label: 'Послуги та бізнес на Чайці', desc: 'Компанії та послуги у ЖК', screen: 'ZhkBusinessListScreen', icon: 'storefront-outline', accent: '#6E7F47' },
    ] as BonusItem[],
  },
  ru: {
    headerTitle: 'Сервисы',
    sectionFrequent: 'Каждый день',
    sectionCommunity: 'Сообщество',
    sectionMarket: 'Объявления',
    frequent: [
      { label: 'Есть ли СВЕТ?', desc: 'Что пишут соседи в доме', screen: 'ElectricityStatusScreen', icon: 'lightning-bolt-outline', accent: '#C79C47' },
      { label: 'Места Чайки', desc: 'Кафе, магазины и сервисы рядом', screen: 'PlacesScreen', icon: 'map-marker-multiple', accent: '#00897B' },
      { label: 'Фото района', desc: 'Галерея фотографий ЖК Чайка', screen: 'FotoRayonaScreen', icon: 'image-plus', accent: '#5C6BC0' },
    ] as BonusItem[],
    community: [
      { label: 'Люди Чайки', desc: 'Жители и сообщество', screen: 'TopGirlsBoysScreen', icon: 'account-multiple-outline', accent: '#7B6EB1' },
      { label: 'Контакты Чайки', desc: 'Найдите людей рядом для общения', screen: 'KontaktiChaikyScreen', icon: 'account-heart-outline', accent: '#6A8BA5' },
      { label: 'Спорт на Чайке', desc: 'Баскетбол, футбол и теннис с соседями', screen: 'SportNaChaykeScreen', icon: 'run-fast', accent: '#4F8D5F' },
    ] as BonusItem[],
    market: [
      { label: 'Еда на Чайке', desc: 'Поесть, продукты, акции рядом', screen: 'EdaNaChaykeScreen', icon: 'food-fork-drink', accent: '#FFD400' },
      { label: 'Все для детей', desc: 'Садики, школы, кружки и события', screen: 'VseDlyaDeteyScreen', icon: 'baby-face-outline', accent: '#C77A5D' },
      { label: 'Бизнес на Чайке', desc: 'Разместить свой бизнес для жителей', screen: 'BizznesChaikaScreen', icon: 'store-plus-outline', accent: '#6E7F47' },
      { label: 'Салоны красоты', desc: 'Парикмахерские, маникюр, косметология', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
      { label: 'Поиск работы', desc: 'Вакансии и резюме', screen: 'JobSearchScreen', icon: 'briefcase-search-outline', accent: '#4D7892' },
      { label: 'Куплю / продам', desc: 'Объявления жителей', screen: 'BuySellScreen', icon: 'shopping-outline', accent: '#C96E3E' },
      { label: 'Услуги и Бизнес на Чайке', desc: 'Компании и услуги в ЖК', screen: 'ZhkBusinessListScreen', icon: 'storefront-outline', accent: '#6E7F47' },
    ] as BonusItem[],
  },
  en: {
    headerTitle: 'Services',
    sectionFrequent: 'Daily use',
    sectionCommunity: 'Community',
    sectionMarket: 'Listings',
    frequent: [
      { label: 'Power reports', desc: 'Neighbor updates by building', screen: 'ElectricityStatusScreen', icon: 'lightning-bolt-outline', accent: '#C79C47' },
      { label: 'Chaika places', desc: 'Cafes, stores, and local services nearby', screen: 'PlacesScreen', icon: 'map-marker-multiple', accent: '#00897B' },
      { label: 'District Photos', desc: 'Photo gallery of Chaika neighborhood', screen: 'FotoRayonaScreen', icon: 'image-plus', accent: '#5C6BC0' },
    ] as BonusItem[],
    community: [
      { label: 'Chaika Life people', desc: 'Residents and community', screen: 'TopGirlsBoysScreen', icon: 'account-multiple-outline', accent: '#7B6EB1' },
      { label: 'Chaika Contacts', desc: 'Find people nearby to connect with', screen: 'KontaktiChaikyScreen', icon: 'account-heart-outline', accent: '#6A8BA5' },
      { label: 'Sports in Chaika', desc: 'Basketball, football, and tennis with neighbors', screen: 'SportNaChaykeScreen', icon: 'run-fast', accent: '#4F8D5F' },
    ] as BonusItem[],
    market: [
      { label: 'Food at Chaika', desc: 'Eat, groceries, deals nearby', screen: 'EdaNaChaykeScreen', icon: 'food-fork-drink', accent: '#FFD400' },
      { label: 'Everything for Kids', desc: 'Kindergartens, schools, clubs and events', screen: 'VseDlyaDeteyScreen', icon: 'baby-face-outline', accent: '#C77A5D' },
      { label: 'Business at Chaika', desc: 'Place your business for residents', screen: 'BizznesChaikaScreen', icon: 'store-plus-outline', accent: '#6E7F47' },
      { label: 'Beauty salons', desc: 'Hair, nails, cosmetology', screen: 'SalonyKrasotyScreen', icon: 'content-cut', accent: '#D4668E' },
      { label: 'Job search', desc: 'Vacancies and resumes', screen: 'JobSearchScreen', icon: 'briefcase-search-outline', accent: '#4D7892' },
      { label: 'Buy / sell', desc: 'Resident marketplace', screen: 'BuySellScreen', icon: 'shopping-outline', accent: '#C96E3E' },
      { label: 'Services and Business in Chaika', desc: 'Companies and services in the complex', screen: 'ZhkBusinessListScreen', icon: 'storefront-outline', accent: '#6E7F47' },
    ] as BonusItem[],
  },
};

const ChaikaBonusPlusScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const soulPhotosItem: BonusItem = language === 'ru'
    ? { label: 'Фото для Души', desc: 'Отдельная галерея теплых фото от жителей', screen: 'SoulPhotosScreen', icon: 'tag-heart-outline', accent: '#C97959' }
    : language === 'en'
      ? { label: 'Photos for the Soul', desc: 'A separate warm photo gallery from residents', screen: 'SoulPhotosScreen', icon: 'tag-heart-outline', accent: '#C97959' }
      : { label: 'Фото для душі', desc: 'Особлива галерея теплих фото від мешканців', screen: 'SoulPhotosScreen', icon: 'tag-heart-outline', accent: '#C97959' };

  const renderItem = (item: BonusItem) => {
    const isFoodHub = item.screen === 'EdaNaChaykeScreen';

    return (
      <TouchableOpacity
        key={item.screen}
        style={[styles.card, isFoodHub && styles.foodCard]}
        onPress={() => safeNavigate(navigation, item.screen)}
        activeOpacity={0.86}
      >
        <TactileIcon
          icon={item.icon}
          size={46}
          iconSize={21}
          backgroundColor={isFoodHub ? '#C89000' : item.accent}
          tint={isFoodHub ? '#FFF8CF' : undefined}
        />
        <View style={styles.copy}>
          <Text style={[styles.label, isFoodHub && styles.foodText]}>{item.label}</Text>
          <Text style={[styles.desc, isFoodHub && styles.foodDesc]}>{item.desc}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={isFoodHub ? '#4A3300' : SCREEN_THEME.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../../assets/WEBP-version/Service.webp')} style={styles.headerImage} resizeMode="cover" />
        <Text style={styles.pageTitle}>{text.headerTitle}</Text>

        <Text style={styles.sectionLabel}>{text.sectionMarket}</Text>
        <View style={styles.list}>{text.market.map(renderItem)}</View>

        <Text style={styles.sectionLabel}>{text.sectionCommunity}</Text>
        <View style={styles.list}>{text.community.map(renderItem)}</View>

        <Text style={styles.sectionLabel}>{text.sectionFrequent}</Text>
        <View style={styles.list}>{[soulPhotosItem, ...text.frequent].map(renderItem)}</View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 42, height: 42, borderRadius: 16, backgroundColor: SCREEN_THEME.paperStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E4D0AB' },
  headerSpacer: { flex: 1 },
  content: { paddingBottom: 110 },
  headerImage: { width: '100%', height: 200, marginBottom: 12 },
  pageTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 20, textAlign: 'center', paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 18,
    paddingHorizontal: 16,
  },
  list: { gap: 10, paddingHorizontal: 16 },
  card: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadow,
  },
  foodCard: {
    backgroundColor: '#FFD400',
    borderColor: '#F0B800',
  },
  copy: { flex: 1, marginLeft: 12, marginRight: 8 },
  label: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  foodText: { color: '#3A2800' },
  desc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 3, fontWeight: '600' },
  foodDesc: { color: '#5C4200' },
});

export default ChaikaBonusPlusScreen;
