import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, SafeAreaView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import { SCREEN_THEME } from '../utils/screenTheme';
import {
  loadChaykaNewsFeedDetailed,
  subscribeChaykaNewsFeedRealtime,
  type ChaykaNewsFeedResult,
} from '../services/chaykaNewsService';
import type { RootState } from '../redux/store';
import { safeOpenExternalUrl } from '../utils/communicationActions';

type AppLanguage = 'ua' | 'ru' | 'en';
type FeedItem = Awaited<ReturnType<typeof loadChaykaNewsFeedDetailed>>['items'][number];
type NewsText = typeof UI_TEXT[keyof typeof UI_TEXT];

const LIVE_COUNT = 4;
const PAST_COUNT = 10;

const UI_TEXT = {
  ua: {
    headerTitle: 'Новини Чайки',
    actionProblem: 'Повідомити про проблему',
    actionHelp: 'Відкрити допомогу',
    badgeChaika: 'Чайка',
    sourcePrefix: 'Джерело',
    loadError: 'Не вдалося завантажити стрічку. Перевірте інтернет або спробуйте пізніше.',
    heroLoadingTitle: 'Завантажуємо стрічку',
    heroErrorTitle: 'Стрічка тимчасово недоступна',
    heroMainTitle: 'Головне по району',
    heroEmptyTitle: 'Новин поки немає',
    heroLoadingText: 'Підтягуємо публікації з єдиної стрічки Chaika Life.',
    heroCacheText: "Показуємо останню збережену стрічку. Нові пости підтягнуться після відновлення зв'язку.",
    heroMainText: 'Тут зібрані загальні новини Чайки, включно з дублями публікацій із зовнішнього каналу.',
    heroEmptyText: "Тут буде окрема загальна стрічка району, не пов'язана з внутрішніми новинами ОСББ.",
    stateUpdating: 'Оновлюємо новини',
    stateNoConnection: "Немає зв'язку зі стрічкою",
    retry: 'Спробувати ще раз',
    fromCache: 'З кешу',
    pastNews: 'Минулі новини',
    hidePastNews: 'Сховати минулі новини',
    liveLabel: 'Живий ефір',
    share: 'Поділитися',
  },
  ru: {
    headerTitle: 'Новости Чайки',
    actionProblem: 'Сообщить о проблеме',
    actionHelp: 'Открыть помощь',
    badgeChaika: 'Чайка',
    sourcePrefix: 'Источник',
    loadError: 'Не удалось загрузить ленту. Проверьте интернет или попробуйте позже.',
    heroLoadingTitle: 'Загружаем ленту',
    heroErrorTitle: 'Лента временно недоступна',
    heroMainTitle: 'Главное по району',
    heroEmptyTitle: 'Новостей пока нет',
    heroLoadingText: 'Подтягиваем публикации из единой ленты Chaika Life.',
    heroCacheText: 'Показываем последнюю сохранённую ленту. Новые посты подтянутся после восстановления связи.',
    heroMainText: 'Здесь собраны общие новости Чайки, включая дубли публикаций из внешнего канала.',
    heroEmptyText: 'Здесь будет отдельная общая лента района, не связанная с внутренними новостями ОСББ.',
    stateUpdating: 'Обновляем новости',
    stateNoConnection: 'Нет связи с лентой',
    retry: 'Попробовать ещё раз',
    fromCache: 'Из кэша',
    pastNews: 'Прошлые новости',
    hidePastNews: 'Скрыть прошлые новости',
    liveLabel: 'Прямой эфир',
    share: 'Поделиться',
  },
  en: {
    headerTitle: 'Chaika Life News',
    actionProblem: 'Report a problem',
    actionHelp: 'Open help',
    badgeChaika: 'Chaika',
    sourcePrefix: 'Source',
    loadError: 'Unable to load the feed. Check your internet connection and try again later.',
    heroLoadingTitle: 'Loading feed',
    heroErrorTitle: 'Feed is temporarily unavailable',
    heroMainTitle: 'Key district updates',
    heroEmptyTitle: 'No news yet',
    heroLoadingText: 'We are pulling posts from the unified Chaika Life feed.',
    heroCacheText: 'Showing the latest cached feed. New posts will appear once the connection is restored.',
    heroMainText: 'This is the shared Chaika Life district feed, including reposts from the external channel.',
    heroEmptyText: 'This area will show the general district feed, separate from internal OSBB news.',
    stateUpdating: 'Updating news',
    stateNoConnection: 'No connection to feed',
    retry: 'Try again',
    fromCache: 'Cached',
    pastNews: 'Past news',
    hidePastNews: 'Hide past news',
    liveLabel: 'Live feed',
    share: 'Share',
  },
} as const;

const NewsCard: React.FC<{ item: FeedItem; text: NewsText; language: AppLanguage }> = ({ item, text, language }) => {
  const openSource = () => {
    if (item.sourceUrl) {
      void safeOpenExternalUrl(item.sourceUrl, language);
    }
  };

  const shareItem = () => {
    const message = [item.title, item.body, item.sourceUrl].filter(Boolean).join('\n\n');
    void Share.share({ title: item.title, message });
  };

  return (
    <View style={styles.newsCard}>
      <View style={styles.newsTopRow}>
        <View style={styles.newsBadge}>
          <MaterialCommunityIcons name="newspaper-variant-outline" size={12} color="#fff" />
          <Text style={styles.newsBadgeText}>{text.badgeChaika}</Text>
        </View>
        <Text style={styles.newsDate}>{item.date}</Text>
      </View>

      <Text style={styles.newsTitle}>{item.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.aiChip}>
          <MaterialCommunityIcons name="robot-outline" size={12} color="#fff" />
          <Text style={styles.aiChipText}>AI</Text>
        </View>
        <TouchableOpacity onPress={openSource} activeOpacity={item.sourceUrl ? 0.72 : 1} disabled={!item.sourceUrl} style={styles.sourceLink}>
          <Text style={[styles.sourceText, item.sourceUrl ? styles.sourceTextLinked : null]} numberOfLines={1}>
            {text.sourcePrefix}: {item.sourceName}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.newsBody}>{item.body}</Text>
      <TouchableOpacity style={styles.shareButton} onPress={shareItem} activeOpacity={0.78}>
        <MaterialCommunityIcons name="share-variant-outline" size={16} color={SCREEN_THEME.enamelBlue} />
        <Text style={styles.shareButtonText}>{text.share}</Text>
      </TouchableOpacity>
    </View>
  );
};

const ImportantNewsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const text = UI_TEXT[language];
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const liveItems = useMemo(() => items.slice(0, LIVE_COUNT), [items]);
  const pastItems = useMemo(() => items.slice(LIVE_COUNT, LIVE_COUNT + PAST_COUNT), [items]);

  const actions = useMemo(
    () => [
      { title: text.actionProblem, icon: 'home-alert-outline' as const, screen: 'ChaikaProblemsScreen' },
      { title: text.actionHelp, icon: 'hand-heart-outline' as const, tab: 'HelpTab' },
    ],
    [text.actionHelp, text.actionProblem],
  );

  const applyFeedResult = useCallback((result: ChaykaNewsFeedResult) => {
    setItems(result.items);
    setErrorText(result.status === 'unavailable' ? text.loadError : null);
  }, [text.loadError]);

  const loadFeed = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorText(null);

    try {
      const result = await loadChaykaNewsFeedDetailed();
      applyFeedResult(result);
    } catch {
      setItems([]);
      setErrorText(text.loadError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyFeedResult, text.loadError]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeChaykaNewsFeedRealtime(
      (result) => {
        applyFeedResult(result);
        setLoading(false);
      },
      () => {
        setErrorText(text.loadError);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [applyFeedResult, text.loadError]);

  const openItem = (item: typeof actions[number]) => {
    if ('tab' in item && item.tab) {
      navigation.navigate('MainTabs', { screen: item.tab });
      return;
    }
    if ('screen' in item && item.screen) {
      navigation.navigate(item.screen);
    }
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator color={SCREEN_THEME.woodGreenDark} />
          <Text style={styles.stateTitle}>{text.stateUpdating}</Text>
        </View>
      );
    }

    if (errorText) {
      return (
        <View style={styles.stateCard}>
          <MaterialCommunityIcons name="wifi-alert" size={38} color={SCREEN_THEME.terracotta} />
          <Text style={styles.stateTitle}>{text.stateNoConnection}</Text>
          <Text style={styles.stateText}>{errorText}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadFeed()} activeOpacity={0.82}>
            <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryButtonText}>{text.retry}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={liveItems}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void loadFeed(true)}
        ListHeaderComponent={(
          <>
            <Text style={styles.screenTitle}>{text.headerTitle}</Text>
            <View style={styles.coverWrap}>
              <Image source={require('../../assets/NOVOSTI.png')} style={styles.coverImage} resizeMode="cover" />
            </View>
          </>
        )}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => <NewsCard item={item} text={text} language={language} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={(
          <View>
            {pastItems.length > 0 && (
              <>
                <TouchableOpacity style={styles.pastToggle} onPress={() => setShowPast((v) => !v)} activeOpacity={0.82}>
                  <MaterialCommunityIcons name={showPast ? 'chevron-up' : 'chevron-down'} size={20} color={SCREEN_THEME.enamelBlue} />
                  <Text style={styles.pastToggleText}>{showPast ? text.hidePastNews : text.pastNews}</Text>
                </TouchableOpacity>
                {showPast && pastItems.map((item) => (
                  <View key={item.id} style={{ marginBottom: 10 }}>
                    <NewsCard item={item} text={text} language={language} />
                  </View>
                ))}
              </>
            )}
            <View style={styles.actionsBlock}>
              {actions.map((item) => (
                <TouchableOpacity key={item.title} style={styles.card} onPress={() => openItem(item)} activeOpacity={0.84}>
                  <View style={styles.iconBox}>
                    <MaterialCommunityIcons name={item.icon} size={24} color="#fff" />
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={25} color={SCREEN_THEME.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />

      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 92 },
  screenTitle: { color: SCREEN_THEME.textPrimary, fontSize: 26, fontWeight: '900', marginBottom: 12 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginBottom: 4 },
  pastToggleText: { color: SCREEN_THEME.enamelBlue, fontSize: 15, fontWeight: '800' },
  coverWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    ...SCREEN_THEME.raisedShadow,
  },
  coverImage: { width: '100%', height: 188 },
  newsCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 14,
  },
  newsTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  newsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SCREEN_THEME.enamelBlue,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  newsBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  newsDate: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700' },
  newsTitle: { color: SCREEN_THEME.textPrimary, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 8, flexWrap: 'wrap' },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.terracotta,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiChipText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  sourceLink: { flexShrink: 1 },
  sourceText: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  sourceTextLinked: { color: SCREEN_THEME.enamelBlue, textDecorationLine: 'underline' },
  newsBody: { color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  shareButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(79, 131, 186, 0.1)', borderWidth: 1, borderColor: 'rgba(79, 131, 186, 0.24)' },
  shareButtonText: { color: SCREEN_THEME.enamelBlue, fontSize: 12, fontWeight: '900' },
  stateCard: {
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 18,
    marginBottom: 12,
  },
  stateTitle: { color: SCREEN_THEME.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  stateText: { color: SCREEN_THEME.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  actionsBlock: { marginTop: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, borderWidth: 1, borderColor: '#E4D0AB', padding: 13, marginBottom: 10 },
  iconBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: SCREEN_THEME.terracotta, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardTitle: { flex: 1, color: SCREEN_THEME.textPrimary, fontSize: 16, fontWeight: '900' },
});

export default ImportantNewsScreen;






