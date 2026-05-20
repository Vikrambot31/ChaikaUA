import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import type { RootState } from '../redux/store';
import { sportsService, SportKey, SportTodayEntry } from '../services/sportsService';

type Lang = 'ua' | 'ru' | 'en';

const SPORTS: Array<{ key: SportKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; accent: string }> = [
  { key: 'basketball', icon: 'basketball', accent: '#D9773D' },
  { key: 'football', icon: 'soccer', accent: '#4F8D5F' },
  { key: 'tennis_big', icon: 'tennis', accent: '#6B7FD7' },
  { key: 'tennis_small', icon: 'table-tennis', accent: '#A064A8' },
];

const SPORT_KEYS: SportKey[] = ['basketball', 'football', 'tennis_big', 'tennis_small'];

const UI_TEXT: Record<Lang, {
  title: string;
  subtitle: string;
  choose: string;
  inProgress: string;
  sports: Record<SportKey, string>;
  live: string;
  activeToday: (count: number) => string;
}> = {
  ua: {
    title: 'Спорт на Чайці',
    subtitle: 'Оберіть вид спорту та знайдіть сусідів для гри сьогодні',
    choose: 'Обрати',
    inProgress: 'Екран гри буде додано наступним кроком.',
    sports: {
      basketball: 'Баскетбол',
      football: 'Футбол',
      tennis_big: 'Теніс (великий)',
      tennis_small: 'Теніс (малий)',
    },
    live: 'LIVE',
    activeToday: (count: number) => `всього ${count} активних учасників на сьогодні`,
  },
  ru: {
    title: 'Спорт на Чайке',
    subtitle: 'Выберите вид спорта и найдите соседей для игры сегодня',
    choose: 'Выбрать',
    inProgress: 'Экран игры будет добавлен следующим шагом.',
    sports: {
      basketball: 'Баскетбол',
      football: 'Футбол',
      tennis_big: 'Теннис (большой)',
      tennis_small: 'Теннис (малый)',
    },
    live: 'LIVE',
    activeToday: (count: number) => `всего ${count} активных участников на сегодня`,
  },
  en: {
    title: 'Sports in Chaika',
    subtitle: 'Choose a sport and find neighbors to play with today',
    choose: 'Choose',
    inProgress: 'The sport detail screen will be added in the next step.',
    sports: {
      basketball: 'Basketball',
      football: 'Football',
      tennis_big: 'Tennis (large court)',
      tennis_small: 'Table tennis',
    },
    live: 'LIVE',
    activeToday: (count: number) => `${count} active participants today`,
  },
};

const SportNaChaykeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language];
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const [todayEntriesBySport, setTodayEntriesBySport] = useState<Record<SportKey, SportTodayEntry[]>>({
    basketball: [],
    football: [],
    tennis_big: [],
    tennis_small: [],
  });

  useEffect(() => {
    const unsubscribers = SPORT_KEYS.map((sportKey) =>
      sportsService.subscribeTodayEntries(sportKey, (entries) => {
        setTodayEntriesBySport((prev) => ({ ...prev, [sportKey]: entries }));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.2, duration: 850, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [blinkAnim]);

  const activeTodayCount = useMemo(() => {
    const uniqueIds = new Set<string>();
    SPORT_KEYS.forEach((sportKey) => {
      todayEntriesBySport[sportKey]?.forEach((entry) => {
        uniqueIds.add(entry.id);
      });
    });
    return uniqueIds.size;
  }, [todayEntriesBySport]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroImageWrap}>
            <Image source={require('../../assets/Sport.png')} style={styles.heroImage} resizeMode="contain" />
          </View>
          <View style={styles.liveLine}>
            <Animated.Text style={[styles.liveDot, { opacity: blinkAnim }]}>●</Animated.Text>
            <Text style={styles.liveText}>{text.live}</Text>
            <Text style={styles.liveCount}>{text.activeToday(activeTodayCount)}</Text>
          </View>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        <View style={styles.list}>
          {SPORTS.map((sport) => (
            <TouchableOpacity
              key={sport.key}
              style={styles.card}
              onPress={() => navigation.navigate('SportDetailScreen', { sportKey: sport.key, sportTitle: text.sports[sport.key] })}
              activeOpacity={0.86}
            >
              <View style={[styles.iconBox, { backgroundColor: sport.accent }]}>
                <MaterialCommunityIcons name={sport.icon} size={24} color="#FFFFFF" />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle}>{text.sports[sport.key]}</Text>
                <Text style={styles.cardSubtitle}>{text.choose}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 36 },
  hero: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    marginBottom: 18,
    ...SCREEN_THEME.raisedShadowStrong,
  },
  heroImageWrap: {
    width: '100%',
    height: 170,
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  heroImage: { width: '100%', height: '100%', borderRadius: 18 },
  liveLine: { flexDirection: 'row', alignItems: 'center', marginTop: -2, marginBottom: 6, flexWrap: 'wrap', justifyContent: 'center' },
  liveDot: { color: '#F3F0A0', fontSize: 12, fontWeight: '900', marginRight: 4 },
  liveText: { color: '#F3F0A0', fontSize: 11, fontWeight: '900', marginRight: 6 },
  liveCount: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  title: { marginTop: 10, fontSize: 28, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.86)', textAlign: 'center', fontWeight: '700' },
  list: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    ...SCREEN_THEME.raisedShadow,
  },
  iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTextWrap: { flex: 1, marginLeft: 12, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  cardSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textSecondary },
});

export default SportNaChaykeScreen;

