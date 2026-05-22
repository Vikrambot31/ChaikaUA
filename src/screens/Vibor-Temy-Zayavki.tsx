import React from 'react';
import { Dimensions, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { safeNavigate } from '../utils/safeNavigation';
import { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';

type TopicItem = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  desc: string;
  screen: string;
  accent: string;
};

const UI_TEXT = {
  ua: {
    quickLabel: 'Чат заявок',
    quickDesc: 'Відкрити живий список заявок',
    topics: [
      { label: 'Допомога сусідам', desc: 'Термінові запити від мешканців - тільки сьогодні', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'Нова заявка', desc: 'Категорія, деталі або терміново - одна форма', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Хто загубив?', desc: 'Загублені та знайдені речі мешканців', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Проблеми ЖК', desc: 'Повідомити про проблему в ЖК', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Рейтинг будинків', desc: 'Оцінка якості від мешканців', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
  ru: {
    quickLabel: 'Чат заявок',
    quickDesc: 'Открыть живой список заявок',
    topics: [
      { label: 'Помощь соседям', desc: 'Срочные запросы жителей - только сегодня', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'Новая заявка', desc: 'Категория, детали или срочно - одна форма', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Кто потерял?', desc: 'Потерянные и найденные вещи жителей', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Проблемы ЖК', desc: 'Сообщить о проблеме в ЖК', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Рейтинг домов', desc: 'Оценка качества от жителей', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
  en: {
    quickLabel: 'Requests chat',
    quickDesc: 'Open live request list',
    topics: [
      { label: 'Neighbor Help', desc: 'Urgent requests from residents - today only', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'New Request', desc: 'Category, details, or urgent - one form', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Who lost it?', desc: 'Lost and found items from residents', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Building Issues', desc: 'Report an issue in the complex', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Building Rating', desc: 'Service quality score by residents', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
} as const;

const SCREEN_W = Dimensions.get('window').width;

const RequestTopicScreen: React.FC = () => {
  const navigation =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../../assets/WEBP-version/Operator.webp')} style={styles.headerImage} resizeMode="cover" />

        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => safeNavigate(navigation, 'OnlineChatTab')}
            activeOpacity={0.86}
          >
            <TactileIcon icon="message-outline" size={46} iconSize={21} backgroundColor={SCREEN_THEME.enamelBlue} />
            <View style={styles.quickCopy}>
              <Text style={styles.quickLabel}>{text.quickLabel}</Text>
              <Text style={styles.quickDesc}>{text.quickDesc}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.topicsGrid}>
          {text.topics.map((topic) => (
            <TouchableOpacity
              key={topic.screen}
              style={styles.topicCard}
              onPress={() => safeNavigate(navigation, topic.screen)}
              activeOpacity={0.86}
            >
              <View style={styles.topicGloss} />
              <View style={styles.topicRow}>
                <TactileIcon icon={topic.icon} size={46} iconSize={21} backgroundColor={topic.accent} />
                <View style={styles.topicCopy}>
                  <Text style={styles.topicLabel}>{topic.label}</Text>
                  <Text style={styles.topicDesc}>{topic.desc}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingBottom: 32 },
  headerImage: {
    width: SCREEN_W,
    height: Math.round(SCREEN_W * 0.42),
    marginLeft: -16,
    marginRight: -16,
    marginBottom: 18,
  },
  topicsGrid: { gap: 10 },
  quickGrid: { gap: 10, marginBottom: 14 },
  quickCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadow,
  },
  quickCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  quickLabel: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  quickDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 3, fontWeight: '600' },
  topicCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    ...SCREEN_THEME.raisedShadow,
    overflow: 'hidden',
  },
  topicGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.10)' },
  topicRow: { flexDirection: 'row', alignItems: 'center' },
  topicCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  topicLabel: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  topicDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 3, fontWeight: '600' },
});

export default RequestTopicScreen;

