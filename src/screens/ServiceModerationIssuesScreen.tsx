import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

type IssueItem = {
  section: string;
  sectionLabel: string;
  summary: string;
  explanation: string;
  technicalDetails?: string;
};

type RouteParams = {
  issues?: IssueItem[];
  updatedAt?: string | null;
};

const COPY = {
  ua: {
    title: 'Проблеми завантаження',
    subtitle: 'Список розділів, які не вдалося отримати повністю',
    back: 'Назад',
    empty: 'Зараз немає зафіксованих проблем завантаження.',
    reason: 'Що сталося',
    explanation: 'Пояснення',
    technical: 'Технічна деталь',
    updatedAt: 'Оновлено',
  },
  ru: {
    title: 'Проблемы загрузки',
    subtitle: 'Список разделов, которые не удалось получить полностью',
    back: 'Назад',
    empty: 'Сейчас нет зафиксированных проблем загрузки.',
    reason: 'Что произошло',
    explanation: 'Пояснение',
    technical: 'Техническая деталь',
    updatedAt: 'Обновлено',
  },
  en: {
    title: 'Loading Issues',
    subtitle: 'Sections that could not be loaded completely',
    back: 'Back',
    empty: 'There are no recorded loading issues right now.',
    reason: 'What happened',
    explanation: 'Explanation',
    technical: 'Technical detail',
    updatedAt: 'Updated',
  },
} as const;

const ServiceModerationIssuesScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ru') as Lang);
  const text = COPY[language];
  const params = (route.params as RouteParams | undefined) ?? {};
  const issues = params.issues ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.82}>
          <Text style={styles.backButtonText}>{text.back}</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
          {params.updatedAt ? <Text style={styles.updatedAt}>{text.updatedAt}: {params.updatedAt}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {issues.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{text.empty}</Text>
            </View>
          ) : (
            issues.map((issue, index) => (
              <View key={`${issue.section}-${index}`} style={styles.card}>
                <Text style={styles.sectionLabel}>{issue.sectionLabel}</Text>
                <Text style={styles.metaLabel}>{text.reason}</Text>
                <Text style={styles.summary}>{issue.summary}</Text>
                <Text style={styles.metaLabel}>{text.explanation}</Text>
                <Text style={styles.explanation}>{issue.explanation}</Text>
                {issue.technicalDetails ? (
                  <>
                    <Text style={styles.metaLabel}>{text.technical}</Text>
                    <Text style={styles.technical}>{issue.technicalDetails}</Text>
                  </>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg, paddingHorizontal: 16, paddingTop: 12 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EADFCF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
  },
  backButtonText: { color: '#4B3527', fontSize: 13, fontWeight: '900' },
  hero: {
    backgroundColor: '#7A1E5C',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.84)', fontSize: 13, lineHeight: 18, marginTop: 6 },
  updatedAt: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', marginTop: 8 },
  scrollContent: { paddingBottom: 32 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5D7CB',
  },
  emptyText: { color: '#6E6157', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6D9CF',
  },
  sectionLabel: { color: '#2A211B', fontSize: 18, fontWeight: '900', marginBottom: 10 },
  metaLabel: { color: '#7A1E5C', fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase' },
  summary: { color: '#3A2A20', fontSize: 15, fontWeight: '800', marginTop: 4, lineHeight: 20 },
  explanation: { color: '#5E534C', fontSize: 14, marginTop: 4, lineHeight: 20 },
  technical: {
    color: '#7A3D2E',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
    backgroundColor: '#F9EFE8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export default ServiceModerationIssuesScreen;


