import React, { useCallback, useEffect, memo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { selectIsOsbbManager } from '../redux/slices/osbbSlice';
import { useOsbbMembership } from '../hooks/useOsbbMembership';
import { SCREEN_THEME } from '../utils/screenTheme';
import { OsbbNewsItem, subscribeOsbbNews } from '../services/osbbNews';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';
type Priority = 'urgent' | 'important' | 'info';
type NewsItem = OsbbNewsItem;

const UI_TEXT = {
  ua: {
    screenTitle: 'Новини ОСББ',
    urgentLabel: 'Терміново',
    importantLabel: 'Важливо',
    infoLabel: 'Інфо',
    showMore: 'Читати далі',
    showLess: 'Згорнути',
    addNews: 'Додати новину',
    emptyTitle: 'Новин поки немає',
    emptySubtitle: 'Правління або керуючий ще не опублікували внутрішні оголошення.',
    loadErrorTitle: 'Не вдалося завантажити новини',
    loadErrorSubtitle: 'Перевірте підключення до інтернету та спробуйте ще раз.',
  },
  ru: {
    screenTitle: 'Новости ОСББ',
    urgentLabel: 'Срочно',
    importantLabel: 'Важно',
    infoLabel: 'Инфо',
    showMore: 'Читать далее',
    showLess: 'Свернуть',
    addNews: 'Добавить новость',
    emptyTitle: 'Новостей пока нет',
    emptySubtitle: 'Правление или управляющий ещё не опубликовали внутренние объявления.',
    loadErrorTitle: 'Не удалось загрузить новости',
    loadErrorSubtitle: 'Проверьте подключение к интернету и попробуйте ещё раз.',
  },
  en: {
    screenTitle: 'OSBB News',
    urgentLabel: 'Urgent',
    importantLabel: 'Important',
    infoLabel: 'Info',
    showMore: 'Read more',
    showLess: 'Collapse',
    addNews: 'Add news',
    emptyTitle: 'No news yet',
    emptySubtitle: 'Internal building announcements have not been published yet.',
    loadErrorTitle: 'Failed to load news',
    loadErrorSubtitle: 'Check your internet connection and try again.',
  },
} as const;

interface PriorityConfig {
  color: string;
  bgColor: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}

const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  urgent: { color: '#C0392B', bgColor: '#FDEDEC', icon: 'alert-circle' },
  important: { color: '#D4AC0D', bgColor: '#FEF9E7', icon: 'alert' },
  info: { color: SCREEN_THEME.enamelBlue, bgColor: '#EBF5FB', icon: 'information-outline' },
};

const NewsCard: React.FC<{
  item: NewsItem;
  language: Lang;
  expanded: boolean;
  onToggle: () => void;
  isManager: boolean;
  onEdit: () => void;
}> = memo(({ item, language, expanded, onToggle, isManager, onEdit }) => {
  const t = UI_TEXT[language];
  const cfg = PRIORITY_CONFIG[item.priority];

  const priorityLabel =
    item.priority === 'urgent'
      ? t.urgentLabel
      : item.priority === 'important'
        ? t.importantLabel
        : t.infoLabel;

  return (
    <TouchableOpacity style={styles.newsCard} onPress={onToggle} activeOpacity={0.88}>
      {isManager ? (
        <TouchableOpacity
          style={styles.editBtn}
          onPress={onEdit}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="pencil" size={16} color={SCREEN_THEME.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.cardTopRow}>
        <View style={[styles.priorityBadge, { backgroundColor: cfg.bgColor }]}> 
          <MaterialCommunityIcons name={cfg.icon} size={13} color={cfg.color} />
          <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{priorityLabel}</Text>
        </View>
        <Text style={styles.newsDate}>{item.date}</Text>
      </View>

      <Text style={styles.newsTitle}>{item.title}</Text>
      <Text style={styles.newsBody} numberOfLines={expanded ? undefined : 2}>{item.body}</Text>

      <View style={styles.expandRow}>
        <Text style={styles.expandText}>{expanded ? t.showLess : t.showMore}</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={SCREEN_THEME.enamelBlue}
        />
      </View>
    </TouchableOpacity>
  );
}) as React.FC<{
  item: NewsItem;
  language: Lang;
  expanded: boolean;
  onToggle: () => void;
  isManager: boolean;
  onEdit: () => void;
}>;

const OsbbNovostyScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  useOsbbMembership();
  const isManager = useSelector(selectIsOsbbManager);
  const t = UI_TEXT[language];

  const [news, setNews] = useState<NewsItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    return subscribeOsbbNews(buildingId, (items) => {
      setNews(items);
      setLoading(false);
    }, {
      includePending: isManager,
      onError: () => {
        setLoading(false);
        setLoadError(true);
      },
    });
  }, [buildingId, isManager]);

  const renderItem = useCallback(({ item }: { item: NewsItem }) => (
    <NewsCard
      item={item}
      language={language}
      expanded={expandedId === item.id}
      onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
      isManager={isManager}
      onEdit={() => navigation.navigate('OsbbAddNewsScreen', { editItem: item })}
    />
  ), [expandedId, isManager, language, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={news}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.screenTitle}>{t.screenTitle}</Text>
            <View style={styles.backBtn} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={SCREEN_THEME.enamelBlue} />
            </View>
          ) : loadError ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="wifi-off" size={48} color={SCREEN_THEME.terracotta} />
              <Text style={styles.emptyTitle}>{t.loadErrorTitle}</Text>
              <Text style={styles.emptySubtitle}>{t.loadErrorSubtitle}</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={48} color={SCREEN_THEME.textSecondary} />
              <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{t.emptySubtitle}</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {isManager ? (
        <TouchableOpacity
          style={styles.addNewsFab}
          onPress={() => navigation.navigate('OsbbAddNewsScreen')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
      <VideoLoadingOverlay visible={loading} />
    </SafeAreaView>
  );
};

const CARD_BASE = {
  backgroundColor: SCREEN_THEME.paperStrong,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#E4D0AB',
  shadowColor: '#6E573B',
  shadowOpacity: 0.10,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  listContent: { padding: 16, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  backBtn: { width: 40, alignItems: 'center' },
  screenTitle: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  newsCard: { ...CARD_BASE, padding: 16 },
  editBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  addNewsFab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: SCREEN_THEME.terracotta,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SCREEN_THEME.terracottaDark,
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priorityBadgeText: { fontSize: 11, fontWeight: '900' },
  newsDate: { fontSize: 12, fontWeight: '600', color: SCREEN_THEME.textSecondary },
  newsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 22,
    marginBottom: 8,
  },
  newsBody: {
    fontSize: 14,
    fontWeight: '500',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 21,
    marginBottom: 10,
  },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandText: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.enamelBlue },
  loadingCard: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    ...CARD_BASE,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default OsbbNovostyScreen;


