import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import ScreenTooltip from '../components/ScreenTooltip';
// HintBadge + useTrainingMode removed — unused after header refactor
import { HELP_HISTORY_TOOLTIP } from '../utils/screenTooltips';
import { COLORS, SIZES } from '../utils/constants';
import { removeHelpRequest, selectAllHelpRequests, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { selectAllRequests } from '../redux/slices/requestsSlice';
import { selectUser } from '../redux/slices/authSlice';
import type { AppDispatch, RootState } from '../redux/store';
import type { DetailItemData } from '../utils/detailViewTypes';
import type { HelpRequest } from '../types/app';
import { normalizePhoneText } from '../utils/textUtils';
import { requireAuthForDetails } from '../utils/authGuard';
import { useAppTheme } from '../hooks/useAppTheme';

type Lang = 'ua' | 'ru' | 'en';
type TabKey = 'active' | 'attention' | 'history';

const UI_TEXT = {
  ua: {
    title: 'Мої запити допомоги',
    subtitle: 'Статус, повтор і архів ваших звернень без зайвих дій.',
    active: 'Активні',
    attention: 'Потрібна дія',
    history: 'Історія',
    searchPlaceholder: 'Пошук за текстом, типом або телефоном...',
    total: 'Усього',
    published: 'Опубліковано',
    pending: 'На перевірці',
    rejected: 'Відхилено',
    expired: 'Прострочено',
    closed: 'Закрито',
    noReason: 'Причину не вказано. Перевірте текст і фото перед повторною відправкою.',
    details: 'Деталі',
    repeat: 'Повторити',
    fixAndRepeat: 'Виправити',
    hide: 'Сховати',
    create: 'Створити запит',
    hideTitle: 'Сховати з історії?',
    hideBody: 'Запит буде прибрано тільки з цього списку на вашому пристрої.',
    cancel: 'Скасувати',
    hiddenTitle: 'Готово',
    hiddenBody: 'Запит сховано з історії.',
    emptyTitle: 'Тут поки немає запитів',
    emptyBody: 'Коли ви створите запит допомоги, він зʼявиться тут зі статусом.',
    repeatHint: 'Відкриємо форму з вашим попереднім текстом. Після перевірки запит знову зʼявиться у сусідів.',
    confirm: 'Продовжити',
    minAgo: 'хв тому',
    hourAgo: 'год тому',
    dayAgo: 'д тому',
    justNow: 'щойно',
  },
  ru: {
    title: 'Мои запросы помощи',
    subtitle: 'Статус, повтор и архив ваших обращений без лишних действий.',
    active: 'Активные',
    attention: 'Нужны действия',
    history: 'История',
    searchPlaceholder: 'Поиск по тексту, типу или телефону...',
    total: 'Всего',
    published: 'Опубликовано',
    pending: 'На проверке',
    rejected: 'Отклонено',
    expired: 'Просрочено',
    closed: 'Закрыто',
    noReason: 'Причина не указана. Проверьте текст и фото перед повторной отправкой.',
    details: 'Детали',
    repeat: 'Повторить',
    fixAndRepeat: 'Исправить',
    hide: 'Скрыть',
    create: 'Создать запрос',
    hideTitle: 'Скрыть из истории?',
    hideBody: 'Запрос будет убран только из этого списка на вашем устройстве.',
    cancel: 'Отмена',
    hiddenTitle: 'Готово',
    hiddenBody: 'Запрос скрыт из истории.',
    emptyTitle: 'Здесь пока нет запросов',
    emptyBody: 'Когда вы создадите запрос помощи, он появится здесь со статусом.',
    repeatHint: 'Откроем форму с вашим прошлым текстом. После проверки запрос снова появится у соседей.',
    confirm: 'Продолжить',
    minAgo: 'мин назад',
    hourAgo: 'ч назад',
    dayAgo: 'д назад',
    justNow: 'только что',
  },
  en: {
    title: 'My help requests',
    subtitle: 'Status, repeat, and archive for your help requests.',
    active: 'Active',
    attention: 'Needs action',
    history: 'History',
    searchPlaceholder: 'Search by text, type, or phone...',
    total: 'Total',
    published: 'Published',
    pending: 'Checking',
    rejected: 'Rejected',
    expired: 'Expired',
    closed: 'Closed',
    noReason: 'No reason was provided. Check text and photo before submitting again.',
    details: 'Details',
    repeat: 'Repeat',
    fixAndRepeat: 'Fix',
    hide: 'Hide',
    create: 'Create request',
    hideTitle: 'Hide from history?',
    hideBody: 'This request will be removed only from this list on your device.',
    cancel: 'Cancel',
    hiddenTitle: 'Done',
    hiddenBody: 'Request hidden from history.',
    emptyTitle: 'No requests yet',
    emptyBody: 'When you create a help request, it will appear here with its status.',
    repeatHint: 'We will open the form with your previous text. After review, the request will appear for neighbors again.',
    confirm: 'Continue',
    minAgo: 'min ago',
    hourAgo: 'h ago',
    dayAgo: 'd ago',
    justNow: 'just now',
  },
} as const;

const toDateSafe = (value?: Date | string | number | null) => {
  if (!value) return new Date(0);
  return value instanceof Date ? value : new Date(value);
};

const normalizeForSearch = (value: string) => value.trim().toLowerCase();

const getAgeLabel = (date: Date, text: (typeof UI_TEXT)[Lang], nowTs: number) => {
  const diffMs = Math.max(0, nowTs - date.getTime());
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return text.justNow;
  if (mins < 60) return `${mins} ${text.minAgo}`;
  if (hours < 24) return `${hours} ${text.hourAgo}`;
  return `${days} ${text.dayAgo}`;
};

const getHelpType = (request: HelpRequest) => {
  const fromCategory = request.subcategory || request.category || '';
  if (fromCategory) return fromCategory;
  const match = request.description.match(/^\[(.*?)\]\s*/);
  return match?.[1]?.trim() || '';
};

const isExpired = (request: HelpRequest, nowTs: number) => toDateSafe(request.expiresAt).getTime() <= nowTs;

const getStatusKey = (request: HelpRequest, nowTs: number): 'pending' | 'published' | 'rejected' | 'expired' | 'closed' => {
  if (request.moderationStatus === 'rejected') return 'rejected';
  if (request.moderationStatus === 'pending') return 'pending';
  if (isExpired(request, nowTs)) return 'expired';
  if (!request.isBurning) return 'closed';
  return 'published';
};

const HelpHistoryScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { colors } = useAppTheme();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const user = useSelector(selectUser);
  const sourceRequests = useSelector((state: RootState) => selectAllRequests(state));
  const allRequests = useSelector((state: RootState) => selectAllHelpRequests(state)) as HelpRequest[];
  const [tab, setTab] = useState<TabKey>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (sourceRequests.length > 0) {
      dispatch(syncFromRequests(sourceRequests));
    }
  }, [dispatch, sourceRequests]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isOwnRequest = useCallback((request: HelpRequest) => {
    if (!user) return false;
    if (request.userId && user.id) return request.userId === user.id;
    return Boolean(user.name && request.name) && normalizeForSearch(user.name) === normalizeForSearch(request.name);
  }, [user]);

  const ownRequests = useMemo(
    () => allRequests.filter((request) => isOwnRequest(request)),
    [allRequests, isOwnRequest],
  );

  const stats = useMemo(() => {
    const pending = ownRequests.filter((request) => getStatusKey(request, nowTs) === 'pending').length;
    const rejected = ownRequests.filter((request) => getStatusKey(request, nowTs) === 'rejected').length;
    const active = ownRequests.filter((request) => getStatusKey(request, nowTs) === 'published').length;
    const expired = ownRequests.filter((request) => getStatusKey(request, nowTs) === 'expired').length;
    return { total: ownRequests.length, active, pending, rejected, expired };
  }, [nowTs, ownRequests]);

  const tabOptions = useMemo(() => [
    { key: 'active' as const, label: text.active, count: stats.active },
    { key: 'attention' as const, label: text.attention, count: stats.pending + stats.rejected + stats.expired },
    { key: 'history' as const, label: text.history, count: stats.total },
  ], [stats, text]);

  const filteredRequests = useMemo(() => {
    const query = normalizeForSearch(searchQuery);
    return ownRequests
      .filter((request) => {
        const status = getStatusKey(request, nowTs);
        if (tab === 'active') return status === 'published';
        if (tab === 'attention') return status === 'pending' || status === 'rejected' || status === 'expired';
        return true;
      })
      .filter((request) => {
        if (!query) return true;
        const haystack = `${request.name} ${request.phone} ${request.description} ${getHelpType(request)}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => toDateSafe(b.createdAt).getTime() - toDateSafe(a.createdAt).getTime());
  }, [nowTs, ownRequests, searchQuery, tab]);

  const openRepeatForm = (item: HelpRequest) => {
    Alert.alert(text.repeat, text.repeatHint, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.confirm,
        onPress: () => navigation.navigate('HelpRequestScreen', {
          prefill: {
            description: item.description,
            phone: normalizePhoneText(user?.phone || item.phone || ''),
            name: user?.name || item.name,
            helpType: item.subcategory || '',
          },
        }),
      },
    ]);
  };

  const hideFromHistory = (item: HelpRequest) => {
    Alert.alert(text.hideTitle, text.hideBody, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.hide,
        style: 'destructive',
        onPress: () => {
          dispatch(removeHelpRequest(item.id));
          Alert.alert(text.hiddenTitle, text.hiddenBody);
        },
      },
    ]);
  };

  const openDetails = (item: HelpRequest) => {
    if (!requireAuthForDetails({ userId: user?.id, navigation, language })) return;
    const detailItem: DetailItemData = {
      id: item.id,
      title: item.name,
      description: item.description,
      phone: item.phone,
      category: getHelpType(item) || undefined,
      status: text[getStatusKey(item, nowTs)],
      userId: item.userId,
      createdAt: toDateSafe(item.createdAt).toISOString(),
      sourceType: 'help',
      sourceId: item.id,
      photoUri: item.photoUri,
      photoStoragePath: item.photoStoragePath,
    };
    navigation.navigate('ItemDetailScreen', { item: detailItem });
  };

  const renderHeader = () => (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
      </View>

      <View style={styles.summaryCard}>
        <SummaryItem label={text.total} value={stats.total} />
        <SummaryItem label={text.published} value={stats.active} />
        <SummaryItem label={text.pending} value={stats.pending} />
        <SummaryItem label={text.rejected} value={stats.rejected} warning />
      </View>

      <View style={styles.tabsRow}>
        {tabOptions.map((option) => {
          const active = tab === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setTab(option.key)}
              activeOpacity={0.84}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{option.label}</Text>
              <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{option.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchCard}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLORS.gray} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={text.searchPlaceholder}
          placeholderTextColor={COLORS.gray}
          style={styles.searchInput}
        />
      </View>
    </>
  );

  const renderRequest = ({ item }: { item: HelpRequest }) => {
    const statusKey = getStatusKey(item, nowTs);
    const type = getHelpType(item);
    const reason = item.rejectionReason || item.moderationReason;
    const isRejected = statusKey === 'rejected';

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestTop}>
          <View style={styles.requestTitleWrap}>
            <Text style={styles.requestTitle}>{type || text.title}</Text>
            <Text style={styles.requestMeta}>{getAgeLabel(toDateSafe(item.createdAt), text, nowTs)}</Text>
          </View>
          <StatusPill label={text[statusKey]} status={statusKey} />
        </View>

        <Text style={styles.requestDescription}>{item.description}</Text>

        {isRejected ? (
          <View style={styles.reasonBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#9A4B23" />
            <Text style={styles.reasonText}>{reason?.trim() || text.noReason}</Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => openDetails(item)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="text-box-search-outline" size={16} color="#5B4F47" />
            <Text style={styles.secondaryActionText}>{text.details}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryAction} onPress={() => openRepeatForm(item)} activeOpacity={0.86}>
            <MaterialCommunityIcons name={isRejected ? 'pencil-outline' : 'repeat'} size={16} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>{isRejected ? text.fixAndRepeat : text.repeat}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconAction} onPress={() => hideFromHistory(item)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="archive-arrow-down-outline" size={18} color="#B13E2C" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <ScreenTooltip
        storageKey={HELP_HISTORY_TOOLTIP.storageKey}
        title={HELP_HISTORY_TOOLTIP.title}
        items={HELP_HISTORY_TOOLTIP.items}
        language={language}
        accentColor={COLORS.primary}
      />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        renderItem={renderRequest}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="hand-heart-outline" size={48} color={COLORS.gray} />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{text.emptyBody}</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('HelpRequestScreen')}
              activeOpacity={0.86}
            >
              <Text style={styles.createButtonText}>{text.create}</Text>
            </TouchableOpacity>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const SummaryItem = ({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) => (
  <View style={styles.summaryItem}>
    <Text style={[styles.summaryValue, warning && styles.summaryValueWarning]}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>
);

const StatusPill = ({ label, status }: { label: string; status: ReturnType<typeof getStatusKey> }) => (
  <View style={[styles.statusPill, styles[`status_${status}`]]}>
    <Text style={[styles.statusText, status === 'published' && styles.statusTextLight]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 34,
  },
  headerCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: SIZES.fontSmall,
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    marginBottom: 12,
    paddingVertical: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  summaryValue: {
    color: '#7A1E5C',
    fontSize: 20,
    fontWeight: '900',
  },
  summaryValueWarning: {
    color: '#B13E2C',
  },
  summaryLabel: {
    color: COLORS.gray,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: '#7A1E5C',
    borderColor: '#7A1E5C',
  },
  tabText: {
    color: COLORS.black,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E7DF',
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  tabBadgeText: {
    color: '#7A1E5C',
    fontSize: 10,
    fontWeight: '900',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    paddingHorizontal: 12,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.black,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 0,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    padding: 14,
    marginBottom: 10,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  requestTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  requestTitle: {
    color: COLORS.black,
    fontSize: 15,
    fontWeight: '900',
  },
  requestMeta: {
    color: COLORS.gray,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  status_published: {
    backgroundColor: '#5F7B4D',
    borderColor: '#5F7B4D',
  },
  status_pending: {
    backgroundColor: '#FFF3CD',
    borderColor: '#F0C96B',
  },
  status_rejected: {
    backgroundColor: '#FFE8E4',
    borderColor: '#F2B4A8',
  },
  status_expired: {
    backgroundColor: '#F0E7DF',
    borderColor: '#D7C5B5',
  },
  status_closed: {
    backgroundColor: '#E8F0F3',
    borderColor: '#BCD2DA',
  },
  statusText: {
    color: '#5B4F47',
    fontSize: 11,
    fontWeight: '900',
  },
  statusTextLight: {
    color: '#FFFFFF',
  },
  requestDescription: {
    color: COLORS.black,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  reasonBox: {
    flexDirection: 'row',
    gap: 7,
    backgroundColor: '#FFF4E8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F2D0AE',
    padding: 10,
    marginBottom: 10,
  },
  reasonText: {
    flex: 1,
    color: '#7A4A2A',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#F0E7DF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryActionText: {
    color: '#5B4F47',
    fontSize: 12,
    fontWeight: '900',
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#7d0e59',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFE8E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 42,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyBody: {
    color: COLORS.gray,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  createButton: {
    marginTop: 14,
    backgroundColor: '#7d0e59',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});

export default HelpHistoryScreen;
