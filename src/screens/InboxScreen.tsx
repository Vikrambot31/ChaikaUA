import React, { useCallback, useEffect } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { useInboxNotifications, type InboxItem } from '../hooks/useInboxNotifications';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Lang = 'ua' | 'ru' | 'en';

const UI: Record<Lang, {
  title: string;
  empty: string;
  emptyHint: string;
  contactRequest: string;
  reasons: Record<string, string>;
  contexts: Record<string, string>;
  timeAgo: { min: string; hour: string; day: string; now: string };
}> = {
  ua: {
    title: 'Вам повідомлення',
    empty: 'Немає нових повідомлень',
    emptyHint: 'Тут з\'являться повідомлення від сусідів, які хочуть зв\'язатися з вами.',
    contactRequest: 'Хоче зв\'язатися',
    reasons: {
      acquaintance: 'Знайомство',
      by_listing: 'По оголошенню',
      by_services: 'По послугах',
      by_issue: 'По проблемі',
    },
    contexts: {
      lyudi: 'Люди Чайки',
      help: 'Допомога',
      sport: 'Спорт',
      buysell: 'Купи/Продай',
      job: 'Робота',
    },
    timeAgo: { min: 'хв', hour: 'год', day: 'дн', now: 'щойно' },
  },
  ru: {
    title: 'Вам сообщение',
    empty: 'Нет новых сообщений',
    emptyHint: 'Здесь появятся сообщения от соседей, которые хотят связаться с вами.',
    contactRequest: 'Хочет связаться',
    reasons: {
      acquaintance: 'Знакомство',
      by_listing: 'По объявлению',
      by_services: 'По услугам',
      by_issue: 'По проблеме',
    },
    contexts: {
      lyudi: 'Люди Чайки',
      help: 'Помощь',
      sport: 'Спорт',
      buysell: 'Купи/Продай',
      job: 'Работа',
    },
    timeAgo: { min: 'мин', hour: 'ч', day: 'дн', now: 'сейчас' },
  },
  en: {
    title: 'Your Messages',
    empty: 'No new messages',
    emptyHint: 'Messages from neighbors who want to contact you will appear here.',
    contactRequest: 'Wants to connect',
    reasons: {
      acquaintance: 'Getting acquainted',
      by_listing: 'About listing',
      by_services: 'About services',
      by_issue: 'About a problem',
    },
    contexts: {
      lyudi: 'People',
      help: 'Help',
      sport: 'Sport',
      buysell: 'Buy/Sell',
      job: 'Jobs',
    },
    timeAgo: { min: 'min', hour: 'h', day: 'd', now: 'now' },
  },
};

const formatTimeAgo = (timestamp: number, labels: { min: string; hour: string; day: string; now: string }): string => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return labels.now;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} ${labels.min}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${labels.hour}`;
  const days = Math.floor(hours / 24);
  return `${days} ${labels.day}`;
};

const ACCENT = SCREEN_THEME.terracotta;

const InboxScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors, isDark } = useAppTheme();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const t = UI[language] || UI.ua;
  const { items, markAllSeen } = useInboxNotifications();

  // Mark all as seen when screen opens
  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  const handleItemPress = useCallback((_item: InboxItem) => {
    // Navigate to ProfileRequestsScreen to see full contact request details
    navigation.navigate('ProfileRequestsScreen');
  }, [navigation]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: InboxItem }) => {
    const reasonLabel = item.reason ? (t.reasons[item.reason] || '') : '';
    const contextLabel = t.contexts[item.context] || '';
    const timeLabel = formatTimeAgo(item.timestamp, t.timeAgo);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: isDark ? colors.cardBg : SCREEN_THEME.paperStrong, borderColor: isDark ? colors.uiBorder : SCREEN_THEME.borderSoft }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={styles.avatarWrap}>
            <MiniUserAvatar
              uri={item.requesterPhotoURL}
              name={item.requesterName}
              size={44}
              borderRadius={16}
            />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardName, { color: isDark ? colors.textPrimary : SCREEN_THEME.textPrimary }]} numberOfLines={1}>
                {item.requesterName || '—'}
              </Text>
              <Text style={[styles.cardTime, { color: isDark ? colors.textMuted : SCREEN_THEME.textMuted }]}>
                {timeLabel}
              </Text>
            </View>
            <Text style={[styles.cardSubtitle, { color: ACCENT }]} numberOfLines={1}>
              {t.contactRequest}
            </Text>
            <View style={styles.tagsRow}>
              {contextLabel ? (
                <View style={[styles.tag, { backgroundColor: isDark ? 'rgba(122,37,81,0.15)' : 'rgba(122,37,81,0.08)' }]}>
                  <MaterialCommunityIcons name="map-marker-outline" size={11} color={ACCENT} />
                  <Text style={[styles.tagText, { color: ACCENT }]}>{contextLabel}</Text>
                </View>
              ) : null}
              {reasonLabel ? (
                <View style={[styles.tag, { backgroundColor: isDark ? 'rgba(126,157,105,0.15)' : 'rgba(126,157,105,0.08)' }]}>
                  <MaterialCommunityIcons name="comment-text-outline" size={11} color={SCREEN_THEME.woodGreenDark} />
                  <Text style={[styles.tagText, { color: SCREEN_THEME.woodGreenDark }]}>{reasonLabel}</Text>
                </View>
              ) : null}
              {item.sourceTitle ? (
                <Text style={[styles.sourceText, { color: isDark ? colors.textMuted : SCREEN_THEME.textSecondary }]} numberOfLines={1}>
                  {item.sourceTitle}
                </Text>
              ) : null}
            </View>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={isDark ? colors.textMuted : SCREEN_THEME.textMuted}
            style={styles.chevron}
          />
        </View>
      </TouchableOpacity>
    );
  }, [t, isDark, colors, handleItemPress]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyWrap}>
      <MaterialCommunityIcons name="email-open-outline" size={52} color={SCREEN_THEME.textMuted} style={styles.emptyIcon} />
      <Text style={[styles.emptyTitle, { color: isDark ? colors.textPrimary : SCREEN_THEME.textPrimary }]}>{t.empty}</Text>
      <Text style={[styles.emptyHint, { color: isDark ? colors.textMuted : SCREEN_THEME.textSecondary }]}>{t.emptyHint}</Text>
    </View>
  ), [t, isDark, colors]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? colors.appBg : SCREEN_THEME.appBg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.paper : SCREEN_THEME.paper, borderBottomColor: isDark ? colors.uiBorder : SCREEN_THEME.uiBorder }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={ACCENT} />
        </TouchableOpacity>
        <MaterialCommunityIcons name="email-outline" size={20} color={ACCENT} style={styles.headerIcon} />
        <Text style={[styles.headerTitle, { color: isDark ? colors.textPrimary : SCREEN_THEME.textPrimary }]}>{t.title}</Text>
        {items.length > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{items.length}</Text>
          </View>
        )}
      </View>

      {/* Message List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, items.length === 0 && styles.listContentEmpty]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: SCREEN_THEME.paper,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.uiBorder,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(122,37,81,0.08)',
    marginRight: 10,
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    flex: 1,
  },
  headerBadge: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 30,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  avatarWrap: {
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
    color: SCREEN_THEME.textMuted,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
    marginBottom: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 10,
    fontWeight: '500',
    color: SCREEN_THEME.textSecondary,
    maxWidth: 140,
  },
  chevron: {
    marginLeft: 4,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 14,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: '400',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default InboxScreen;
