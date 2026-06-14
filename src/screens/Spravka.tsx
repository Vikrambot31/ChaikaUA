import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { APP_VERSION } from '../utils/constants';
import { useAppTheme } from '../hooks/useAppTheme';

interface LangState {
  language?: { current?: string };
}

const UI_TEXT = {
  ua: {
    headerTitle: 'Довідка та допомога',
    headerSubtitle: 'Відповіді на часті запитання про застосунок Chaika Life',
    faqTitle: 'Часті запитання',
    contactTitle: "Зв'язок з підтримкою",
    historyBtn: 'Історія запитів про допомогу',
    aboutBtn: 'Про застосунок',
    aboutTitle: 'Про застосунок',
    aboutMsg: `Chaika Life v${APP_VERSION}\n\nДовідник місць та допомога між сусідами`,
    faqItems: [
      { id: '1', icon: 'map-outline', question: 'Як користуватися картою?', answer: 'Відкрийте вкладку карти, оберіть потрібну категорію місць і натискайте на маркери, щоб бачити подробиці.' },
      { id: '2', icon: 'clipboard-list-outline', question: 'Як створити нову заявку?', answer: "Перейдіть до розділу заявок, заповніть форму та надішліть її. Після цього заявка з'явиться у списку." },
      { id: '3', icon: 'storefront-outline', question: 'Де знайти магазини та кафе?', answer: 'Використовуйте фільтри за категоріями на карті або у списку місць.' },
      { id: '4', icon: 'filter-variant', question: 'Як шукати місця?', answer: 'Використовуйте рядок пошуку та фільтри за категоріями на екранах карти і списку місць.' },
    ],
  },
  ru: {
    headerTitle: 'Справка и помощь',
    headerSubtitle: 'Ответы на частые вопросы о приложении Chaika Life',
    faqTitle: 'Часто задаваемые вопросы',
    contactTitle: 'Связь с поддержкой',
    historyBtn: 'История запросов о помощи',
    aboutBtn: 'О приложении',
    aboutTitle: 'О приложении',
    aboutMsg: `Chaika Life v${APP_VERSION}\n\nСправочник мест и помощь между соседями`,
    faqItems: [
      { id: '1', icon: 'map-outline', question: 'Как использовать карту?', answer: 'Откройте вкладку карты, выберите нужную категорию мест и нажимайте на маркеры, чтобы видеть подробности.' },
      { id: '2', icon: 'clipboard-list-outline', question: 'Как создать новую заявку?', answer: 'Перейдите в раздел заявок, заполните форму и отправьте ее. После этого заявка появится в списке.' },
      { id: '3', icon: 'storefront-outline', question: 'Где найти магазины и кафе?', answer: 'Используйте фильтры по категориям на карте или в списке мест.' },
      { id: '4', icon: 'filter-variant', question: 'Как искать места?', answer: 'Используйте строку поиска и фильтры по категориям на экранах карты и списка мест.' },
    ],
  },
  en: {
    headerTitle: 'Help & Support',
    headerSubtitle: 'Answers to frequently asked questions about Chaika Life',
    faqTitle: 'Frequently asked questions',
    contactTitle: 'Contact support',
    historyBtn: 'Help request history',
    aboutBtn: 'About the app',
    aboutTitle: 'About',
    aboutMsg: `Chaika Life v${APP_VERSION}\n\nPlace guide and neighbor help`,
    faqItems: [
      { id: '1', icon: 'map-outline', question: 'How do I use the map?', answer: 'Open the map tab, select the desired category and tap markers to see details.' },
      { id: '2', icon: 'clipboard-list-outline', question: 'How do I create a new request?', answer: 'Go to the requests section, fill in the form and submit it. The request will then appear in the list.' },
      { id: '3', icon: 'storefront-outline', question: 'Where can I find shops and cafes?', answer: 'Use the category filters on the map or in the places list.' },
      { id: '4', icon: 'filter-variant', question: 'How do I search for places?', answer: 'Use the search bar and category filters on the map and places list screens.' },
    ],
  },
} as const;

const HelpScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: LangState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const { colors, isDark } = useAppTheme();
  const text = UI_TEXT[language];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={[styles.headerTitle, { color: isDark ? '#F5E8F0' : undefined }]}>{text.headerTitle}</Text>
          <Text style={styles.headerSubtitle}>{text.headerSubtitle}</Text>
        </View>

        <View style={styles.faqCard}>
          <Text style={styles.faqTitle}>{text.faqTitle}</Text>

          {text.faqItems.map((item, index) => (
            <View key={item.id}>
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
                activeOpacity={0.8}
              >
                <TactileIcon
                  icon={item.icon as React.ComponentProps<typeof TactileIcon>['icon']}
                  size={40}
                  iconSize={18}
                  backgroundColor={SCREEN_THEME.terracotta}
                />
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Text style={styles.chevron}>{expandedId === item.id ? '-' : '+'}</Text>
              </TouchableOpacity>

              {expandedId === item.id && (
                <View style={styles.answerContainer}>
                  <Text style={styles.answerText}>{item.answer}</Text>
                </View>
              )}

              {index < text.faqItems.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>{text.contactTitle}</Text>
          <Text style={styles.contactValue}>support_chaika_ua@ukr.net</Text>
        </View>

        <TouchableOpacity
          style={[styles.infoButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('HelpHistoryScreen')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>{text.historyBtn}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => Alert.alert(text.aboutTitle, text.aboutMsg)}
          activeOpacity={0.85}
        >
          <Text style={styles.infoButtonText}>{text.aboutBtn}</Text>
        </TouchableOpacity>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingTop: 24, paddingBottom: 32 },
  headerCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 28, padding: 18, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E4D0AB' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8 },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  faqCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  faqTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 12 },
  faqItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  faqQuestion: { flex: 1, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  chevron: { fontSize: 22, color: SCREEN_THEME.terracottaDark, fontWeight: '700' },
  answerContainer: { backgroundColor: '#F7F3EE', borderRadius: 16, padding: 12, marginVertical: 8, marginLeft: 50 },
  answerText: { color: SCREEN_THEME.textPrimary, lineHeight: 20 },
  divider: { height: 1, backgroundColor: '#E8DDD3', marginVertical: 4 },
  contactCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  contactTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 8 },
  contactValue: { color: SCREEN_THEME.textSecondary, marginTop: 4 },
  infoButton: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#FFF8EB', borderWidth: 1, borderColor: '#E4D0AB', marginBottom: 10 },
  infoButtonText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButtonText: { color: SCREEN_THEME.textPrimary, fontWeight: '800' },
});

export default HelpScreen;

