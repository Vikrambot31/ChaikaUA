import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
};

const SLIDES_UA: Slide[] = [
  {
    id: '1',
    icon: 'home-city-outline',
    iconColor: '#4F8D7A',
    title: 'Ласкаво просимо до Chaika Life',
    subtitle: 'Застосунок для мешканців Chaika Life. Все що потрібно - в одному місці.',
  },
  {
    id: '2',
    icon: 'lightning-bolt-outline',
    iconColor: '#C79C47',
    title: 'Актуальна інформація',
    subtitle: 'Статус світла, важливі новини та оголошення - завжди під рукою.',
  },
  {
    id: '3',
    icon: 'account-multiple-outline',
    iconColor: '#7B6EB1',
    title: 'Спільнота сусідів',
    subtitle: 'Знайомтесь із сусідами, допомагайте одне одному, купуйте та продавайте.',
  },
  {
    id: '4',
    icon: 'map-marker-multiple-outline',
    iconColor: '#5B83C4',
    title: 'Місця та карта',
    subtitle: 'Кафе, магазини, аптеки поруч. Всі місця Chaika Life на зручній карті.',
  },
];

const SLIDES_RU: Slide[] = [
  {
    id: '1',
    icon: 'home-city-outline',
    iconColor: '#4F8D7A',
    title: 'Добро пожаловать в Chaika Life',
    subtitle: 'Приложение для жителей Chaika Life. Всё необходимое - в одном месте.',
  },
  {
    id: '2',
    icon: 'lightning-bolt-outline',
    iconColor: '#C79C47',
    title: 'Актуальная информация',
    subtitle: 'Статус света, важные новости и объявления - всегда под рукой.',
  },
  {
    id: '3',
    icon: 'account-multiple-outline',
    iconColor: '#7B6EB1',
    title: 'Сообщество соседей',
    subtitle: 'Знакомьтесь с соседями, помогайте друг другу, покупайте и продавайте.',
  },
  {
    id: '4',
    icon: 'map-marker-multiple-outline',
    iconColor: '#5B83C4',
    title: 'Места и карта',
    subtitle: 'Кафе, магазины, аптеки рядом. Все места Chaika Life на удобной карте.',
  },
];

const SLIDES_EN: Slide[] = [
  {
    id: '1',
    icon: 'home-city-outline',
    iconColor: '#4F8D7A',
    title: 'Welcome to Chaika Life',
    subtitle: 'The app for Chaika Life residents. Everything you need - in one place.',
  },
  {
    id: '2',
    icon: 'lightning-bolt-outline',
    iconColor: '#C79C47',
    title: 'Live updates',
    subtitle: 'Power status, important news and announcements - always at hand.',
  },
  {
    id: '3',
    icon: 'account-multiple-outline',
    iconColor: '#7B6EB1',
    title: 'Neighbour community',
    subtitle: 'Meet neighbours, help each other, buy and sell within the community.',
  },
  {
    id: '4',
    icon: 'map-marker-multiple-outline',
    iconColor: '#5B83C4',
    title: 'Places & map',
    subtitle: 'Cafes, stores, pharmacies nearby. All Chaika Life places on a handy map.',
  },
];

const BUTTON_LABELS = {
  ua: { next: 'Далі', done: 'Почати' },
  ru: { next: 'Далее', done: 'Начать' },
  en: { next: 'Next', done: 'Get started' },
};

type Props = {
  language?: 'ua' | 'ru' | 'en';
  onDone: () => void;
};

const OnboardingSlides: React.FC<Props> = ({ language = 'ua', onDone }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList<Slide>>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const slides = language === 'ru' ? SLIDES_RU : language === 'en' ? SLIDES_EN : SLIDES_UA;
  const labels = BUTTON_LABELS[language];
  const isLast = activeIndex === slides.length - 1;

  const goTo = (index: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    flatRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (isLast) {
      onDone();
    } else {
      goTo(activeIndex + 1);
    }
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <Animated.View style={[styles.slideInner, { opacity: fadeAnim }]}>
        <View style={[styles.iconCircle, { backgroundColor: item.iconColor }]}>
          <MaterialCommunityIcons name={item.icon} size={52} color="#fff" />
        </View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
      </Animated.View>
    </View>
  );

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <FlatList
          ref={flatRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={styles.flatList}
        />

        <View style={styles.dots}>
          {slides.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} activeOpacity={0.7}>
              <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.84}>
          <Text style={styles.btnText}>{isLast ? labels.done : labels.next}</Text>
          <MaterialCommunityIcons
            name={isLast ? 'check' : 'arrow-right'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={onDone} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 24, 16, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modal: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 28,
    overflow: 'hidden',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  flatList: {
    width: SCREEN_WIDTH - 40,
  },
  slide: {
    width: SCREEN_WIDTH - 40,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 10,
    alignItems: 'center',
  },
  slideInner: { alignItems: 'center' },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  slideSubtitle: {
    fontSize: 15,
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D9C69E',
  },
  dotActive: {
    width: 22,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  btn: {
    marginHorizontal: 24,
    height: 52,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  skipBtn: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  skipText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default OnboardingSlides;



