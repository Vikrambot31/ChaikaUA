import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addHelpRequest, removeHelpRequest, selectAllHelpRequests, selectCompletedRequests, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { selectAllRequests } from '../redux/slices/requestsSlice';
import { COLORS, SIZES } from '../utils/constants';
import MiniTabBar from '../components/MiniTabBar';
import ContactReasonModal from '../components/ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';
import type { AppDispatch, RootState } from '../redux/store';
import { selectUser } from '../redux/slices/authSlice';
import { createPendingModeration } from '../utils/moderation';
import { normalizePhoneText } from '../utils/textUtils';
import type { HelpRequest } from '../types/app';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { safeCallPhone } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import UserCardActionBar from '../components/UserCardActionBar';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';

type FilterType = 'all' | 'active' | 'completed' | 'today' | 'expired' | 'mine';
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    expiredLabel: 'Згоріла',
    justNow: 'Щойно',
    minAgo: 'хв тому',
    hourAgo: 'год тому',
    dayAgo: 'д тому',
    all: 'Усі',
    active: 'Активні',
    completed: 'Виконано',
    today: 'Сьогодні',
    expired: 'Минуло',
    mine: 'Мої',
    title: 'ІСТОРІЯ ДОПОМОГИ',
    subtitle: 'Усі прохання сусідів — архів допомоги',
    inFilter: 'В фільтрі',
    activeStats: 'Активних',
    searchPlaceholder: 'Пошук по імені, телефону, опису...',
    typeFilterAll: 'Усі типи',
    typeFilterLabel: 'Тип допомоги',
    details: 'Деталі',
    repeat: 'Повторити',
    delete: 'Видалити',
    createNew: 'Створити нове прохання',
    myStats: 'Мої',
    moderationPending: 'На модерації',
    moderationApproved: 'Схвалено',
    moderationRejected: 'Відхилено',
    detailsTitle: 'Деталі заявки',
    detailsType: 'Тип',
    detailsStatus: 'Статус',
    detailsCreated: 'Створено',
    detailsExpires: 'Діє до',
    detailsDescription: 'Опис',
    repeatDone: 'Заявку повторено',
    deleteConfirmTitle: 'Видалити заявку?',
    deleteConfirmBody: 'Вона зникне з історії допомоги.',
    deleteCancel: 'Скасувати',
    minShort: 'хв',
    hourShort: 'год',
    dayShort: 'д',
    emptyTitle: 'Немає прохань у цьому фільтрі',
    emptySubtitle: 'Змініть фільтр або створіть нове прохання',
  },
  ru: {
    expiredLabel: 'Сгорела',
    justNow: 'Только что',
    minAgo: 'мин назад',
    hourAgo: 'ч назад',
    dayAgo: 'д назад',
    all: 'Все',
    active: 'Активные',
    completed: 'Выполнено',
    today: 'Сегодня',
    expired: 'Прошло',
    mine: 'Мои',
    title: 'ИСТОРИЯ ПОМОЩИ',
    subtitle: 'Все просьбы соседей — архив помощи',
    inFilter: 'В фильтре',
    activeStats: 'Активных',
    searchPlaceholder: 'Поиск по имени, телефону, описанию...',
    typeFilterAll: 'Все типы',
    typeFilterLabel: 'Тип помощи',
    details: 'Детали',
    repeat: 'Повторить',
    delete: 'Удалить',
    createNew: 'Создать новую просьбу',
    myStats: 'Моих',
    moderationPending: 'На модерации',
    moderationApproved: 'Одобрено',
    moderationRejected: 'Отклонено',
    detailsTitle: 'Детали заявки',
    detailsType: 'Тип',
    detailsStatus: 'Статус',
    detailsCreated: 'Создано',
    detailsExpires: 'Действует до',
    detailsDescription: 'Описание',
    repeatDone: 'Заявка повторена',
    deleteConfirmTitle: 'Удалить заявку?',
    deleteConfirmBody: 'Она исчезнет из истории помощи.',
    deleteCancel: 'Отмена',
    minShort: 'мин',
    hourShort: 'ч',
    dayShort: 'д',
    emptyTitle: 'Нет просьб в этом фильтре',
    emptySubtitle: 'Измените фильтр или создайте новую просьбу',
  },
  en: {
    expiredLabel: 'Expired',
    justNow: 'Just now',
    minAgo: 'min ago',
    hourAgo: 'h ago',
    dayAgo: 'd ago',
    all: 'All',
    active: 'Active',
    completed: 'Completed',
    today: 'Today',
    expired: 'Expired',
    mine: 'Mine',
    title: 'HELP HISTORY',
    subtitle: 'All neighbor requests — help archive',
    inFilter: 'In filter',
    activeStats: 'Active',
    searchPlaceholder: 'Search by name, phone, description...',
    typeFilterAll: 'All types',
    typeFilterLabel: 'Help type',
    details: 'Details',
    repeat: 'Repeat',
    delete: 'Delete',
    createNew: 'Create new request',
    myStats: 'Mine',
    moderationPending: 'Pending',
    moderationApproved: 'Approved',
    moderationRejected: 'Rejected',
    detailsTitle: 'Request details',
    detailsType: 'Type',
    detailsStatus: 'Status',
    detailsCreated: 'Created',
    detailsExpires: 'Expires',
    detailsDescription: 'Description',
    repeatDone: 'Request repeated',
    deleteConfirmTitle: 'Delete request?',
    deleteConfirmBody: 'It will be removed from help history.',
    deleteCancel: 'Cancel',
    minShort: 'm',
    hourShort: 'h',
    dayShort: 'd',
    emptyTitle: 'No requests in this filter',
    emptySubtitle: 'Change filter or create a new request',
  },
} as const;

type UiText = (typeof UI_TEXT)[Lang];

const toDateSafe = (value?: Date | string | null) => {
  if (!value) return new Date(0);
  return value instanceof Date ? value : new Date(value);
};

const extractHelpType = (description: string) => {
  const match = description.match(/^\[(.*?)\]\s*/);
  return match?.[1]?.trim() || '';
};

const normalizeForSearch = (value: string) => value.trim().toLowerCase();

const formatTimeLeft = (expiresAt: Date, text: UiText, nowTs: number) => {
  const diff = expiresAt.getTime() - nowTs;
  if (diff <= 0) return text.expiredLabel;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) {
    const restHours = hours % 24;
    return `${days}${text.dayShort} ${restHours}${text.hourShort}`;
  }
  return `${hours}${text.hourShort} ${minutes}${text.minShort}`;
};

const getTimeAgo = (date: Date, text: UiText, nowTs: number): string => {
  const diffMs = nowTs - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return text.justNow;
  if (diffMins < 60) return `${diffMins} ${text.minAgo}`;
  if (diffHours < 24) return `${diffHours} ${text.hourAgo}`;
  return `${diffDays} ${text.dayAgo}`;
};

const HelpHistoryScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const [filter, setFilter] = useState<FilterType>('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());
  const user = useSelector(selectUser);
  const sourceRequests = useSelector((state: RootState) => selectAllRequests(state));

  const allRequests = useSelector((state: RootState) => selectAllHelpRequests(state)) as HelpRequest[];
  const completedRequests = useSelector((state: RootState) => selectCompletedRequests(state)) as HelpRequest[];
  const avatarByUserId = useUserAvatarMap(allRequests.map((item) => item.userId));

  useEffect(() => {
    if (sourceRequests.length === 0) return;
    dispatch(syncFromRequests(sourceRequests));
  }, [dispatch, sourceRequests]);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isOwnRequest = useCallback((request: HelpRequest) => {
    if (!user) return false;
    if (request.userId && user.id) return request.userId === user.id;
    const sameName = Boolean(normalizeForSearch(user.name || '')) && normalizeForSearch(user.name || '') === normalizeForSearch(request.name || '');
    return sameName;
  }, [user]);

  const helpTypes = useMemo(() => {
    const values = Array.from(new Set(allRequests.map((r) => extractHelpType(r.description)).filter(Boolean)));
    return values;
  }, [allRequests]);

  const filteredRequests = useMemo(() => {
    const now = new Date(nowTs);
    const query = normalizeForSearch(searchQuery);
    const baseList = (() => {
      switch (filter) {
        case 'active':
          return allRequests.filter((r) => r.isBurning && toDateSafe(r.expiresAt) > now);
        case 'completed':
          return completedRequests;
        case 'today': {
          const today = new Date(nowTs);
          today.setHours(0, 0, 0, 0);
          return allRequests.filter((r) => toDateSafe(r.createdAt) >= today);
        }
        case 'expired':
          return allRequests.filter((r) => toDateSafe(r.expiresAt) <= now);
        case 'mine':
          return allRequests.filter((r) => isOwnRequest(r));
        case 'all':
        default:
          return allRequests;
      }
    })();

    return baseList
      .filter((r) => {
        if (typeFilter && extractHelpType(r.description) !== typeFilter) return false;
        if (!query) return true;
        const haystack = `${r.name} ${r.phone} ${r.description}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => toDateSafe(b.createdAt).getTime() - toDateSafe(a.createdAt).getTime());
  }, [allRequests, completedRequests, filter, isOwnRequest, nowTs, searchQuery, typeFilter]);

  const filterOptions: { label: string; value: FilterType; count: number }[] = useMemo(() => {
    const now = new Date(nowTs);
    const today = new Date(nowTs);
    today.setHours(0, 0, 0, 0);

    return [
      { label: text.all, value: 'all', count: allRequests.length },
      { label: text.active, value: 'active', count: allRequests.filter((r) => r.isBurning && toDateSafe(r.expiresAt) > now).length },
      { label: text.completed, value: 'completed', count: completedRequests.length },
      { label: text.today, value: 'today', count: allRequests.filter((r) => toDateSafe(r.createdAt) >= today).length },
      { label: text.expired, value: 'expired', count: allRequests.filter((r) => toDateSafe(r.expiresAt) <= now).length },
      { label: text.mine, value: 'mine', count: allRequests.filter((r) => isOwnRequest(r)).length },
    ];
  }, [allRequests, completedRequests.length, isOwnRequest, nowTs, text]);

  const handleRepeat = (item: HelpRequest) => {
    const now = new Date();
    const expires = new Date();
    expires.setHours(23, 59, 59, 999);
    dispatch(
      addHelpRequest({
        ...item,
        id: `help-${Date.now()}`,
        name: user?.name || item.name,
        phone: normalizePhoneText(user?.phone || item.phone),
        createdAt: now,
        expiresAt: expires,
        isBurning: true,
        ...createPendingModeration(),
      }),
    );
    Alert.alert(text.repeatDone);
  };

  const handleDelete = (item: HelpRequest) => {
    Alert.alert(text.deleteConfirmTitle, text.deleteConfirmBody, [
      { text: text.deleteCancel, style: 'cancel' },
      {
        text: text.delete,
        style: 'destructive',
        onPress: () => dispatch(removeHelpRequest(item.id)),
      },
    ]);
  };

  const openDetails = (item: HelpRequest) => {
    const status = item.isBurning && toDateSafe(item.expiresAt) > new Date(nowTs)
      ? text.active
      : item.isBurning
        ? text.expired
        : text.completed;
    const moderation =
      item.moderationStatus === 'approved'
        ? text.moderationApproved
        : item.moderationStatus === 'rejected'
          ? text.moderationRejected
          : text.moderationPending;
    const detailItem: DetailItemData = {
      id: item.id,
      title: item.name,
      description: item.description,
      phone: item.phone,
      category: extractHelpType(item.description) || undefined,
      status: `${status} • ${moderation}`,
      userId: item.userId,
      createdAt: toDateSafe(item.createdAt).toISOString(),
      sourceType: 'help',
      sourceId: item.id,
    };

    navigation.navigate('ItemDetailScreen', { item: detailItem });
  };

  const renderHeader = useCallback(() => (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
      </View>

      <View style={styles.filterContainer}>
        {filterOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.filterButton, filter === option.value && styles.filterButtonActive]}
            onPress={() => setFilter(option.value)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === option.value && styles.filterButtonTextActive,
              ]}
            >
              {option.label}
            </Text>
            {option.count > 0 && (
              <View style={[styles.badge, filter === option.value && styles.badgeActive]}>
                <Text
                  style={[
                    styles.badgeText,
                    filter === option.value && styles.badgeTextActive,
                  ]}
                >
                  {option.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
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

      <View style={styles.typeFilterRow}>
        <Text style={styles.typeFilterLabel}>{text.typeFilterLabel}</Text>
        <ScrollToggle
          text={text.typeFilterAll}
          active={typeFilter === ''}
          onPress={() => setTypeFilter('')}
        />
        {helpTypes.map((type) => (
          <ScrollToggle
            key={type}
            text={type}
            active={typeFilter === type}
            onPress={() => setTypeFilter(type)}
          />
        ))}
      </View>

      {filteredRequests.length > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{filteredRequests.length}</Text>
            <Text style={styles.statLabel}>{text.inFilter}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {filteredRequests.filter((r) => r.isBurning).length}
            </Text>
            <Text style={styles.statLabel}>{text.activeStats}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{filteredRequests.filter((r) => isOwnRequest(r)).length}</Text>
            <Text style={styles.statLabel}>{text.myStats}</Text>
          </View>
        </View>
      )}
    </>
  ), [
    filter,
    filterOptions,
    filteredRequests,
    helpTypes,
    isOwnRequest,
    searchQuery,
    text,
    typeFilter,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <View
            style={[
              styles.requestCard,
              item.isBurning && toDateSafe(item.expiresAt) > new Date(nowTs)
                ? styles.requestCardBurning
                : styles.requestCardExpired,
            ]}
          >
            <View style={styles.requestHeader}>
              <View style={styles.userInfo}>
                <MiniUserAvatar
                  uri={(item.userId && avatarByUserId[item.userId]) || undefined}
                  name={item.name}
                  size={40}
                  borderRadius={20}
                  backgroundColor={item.isBurning && toDateSafe(item.expiresAt) > new Date(nowTs) ? '#FF6B4A' : '#A0938D'}
                />
                <View>
                  <Text style={styles.userName}>{item.name}</Text>
                </View>
              </View>

              {item.isBurning && toDateSafe(item.expiresAt) > new Date(nowTs) ? (
                <View style={styles.burningBadge}>
                  <MaterialCommunityIcons name="fire" size={16} color="#FFFFFF" />
                  <Text style={styles.burningText}>{formatTimeLeft(toDateSafe(item.expiresAt), text, nowTs)}</Text>
                </View>
              ) : item.isBurning === false ? (
                <View style={styles.completedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="#4CAF50" />
                </View>
              ) : (
                <View style={styles.expiredBadge}>
                  <MaterialCommunityIcons name="alert-circle" size={18} color="#FF9800" />
                </View>
              )}
            </View>

            {extractHelpType(item.description) ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{extractHelpType(item.description)}</Text>
              </View>
            ) : null}

            <View style={styles.moderationBadge}>
              <Text style={styles.moderationBadgeText}>
                {item.moderationStatus === 'approved'
                  ? text.moderationApproved
                  : item.moderationStatus === 'rejected'
                    ? text.moderationRejected
                    : text.moderationPending}
              </Text>
            </View>

            <Text style={styles.requestDescription}>{item.description}</Text>

            <UserCardActionBar
              avatarUri={(item.userId && avatarByUserId[item.userId]) || undefined}
              name={item.name}
              userId={item.userId}
              currentUserId={user?.id}
              language={language}
              onProfile={item.userId ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.userId as string }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
              onContact={!isOwnRequest(item) && item.userId ? () => openContactModal({ userId: item.userId as string, name: item.name || 'Unknown', sourceType: 'help', sourceId: item.id, sourceTitle: item.description?.slice(0, 60) }) : item.phone ? () => void safeCallPhone(item.phone, language) : undefined}
              contactDisabled={!item.phone && (!item.userId || isOwnRequest(item))}
              likePath="feed_likes/help_history"
              likeId={item.id}
            />

            <View style={styles.requestFooter}>
              <Text style={styles.requestTime}>
                <MaterialCommunityIcons name="clock" size={12} color={COLORS.gray} />{' '}
                {getTimeAgo(toDateSafe(item.createdAt), text, nowTs)}
              </Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openDetails(item)} activeOpacity={0.8}>
                  <Text style={styles.actionBtnText}>{text.details}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleRepeat(item)} activeOpacity={0.8}>
                  <Text style={styles.actionBtnText}>{text.repeat}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteActionBtn, !isOwnRequest(item) && styles.actionBtnDisabled]}
                  onPress={() => handleDelete(item)}
                  activeOpacity={0.8}
                  disabled={!isOwnRequest(item)}
                >
                  <Text style={[styles.actionBtnText, styles.deleteActionBtnText]}>{text.delete}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="inbox-outline" size={48} color={COLORS.gray} />
            <Text style={styles.emptyText}>{text.emptyTitle}</Text>
            <Text style={styles.emptySubtext}>{text.emptySubtitle}</Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => navigation.navigate('HelpNeighborsScreen')}
              activeOpacity={0.84}
            >
              <Text style={styles.createBtnText}>{text.createNew}</Text>
            </TouchableOpacity>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const ScrollToggle = ({
  text,
  active,
  onPress,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[styles.typeToggle, active && styles.typeToggleActive]}
    onPress={onPress}
    activeOpacity={0.82}
  >
    <Text style={[styles.typeToggleText, active && styles.typeToggleTextActive]}>{text}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.88)',
    fontSize: SIZES.fontSmall,
    lineHeight: 20,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.black,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  typeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  typeFilterLabel: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '800',
    marginRight: 2,
  },
  typeToggle: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  typeToggleActive: {
    backgroundColor: '#7A1E5C',
    borderColor: '#7A1E5C',
  },
  typeToggleText: {
    color: COLORS.black,
    fontSize: 11,
    fontWeight: '700',
  },
  typeToggleTextActive: {
    color: '#FFFFFF',
  },
  filterButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  filterButtonActive: {
    backgroundColor: '#7A1E5C',
    borderColor: '#7A1E5C',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.black,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: '#F0E7DF',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E8DDD3',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
    fontWeight: '700',
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  requestCardBurning: {
    borderLeftColor: '#FF6B4A',
  },
  requestCardExpired: {
    borderLeftColor: '#A0938D',
    opacity: 0.8,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: SIZES.fontRegular,
    fontWeight: '900',
    color: COLORS.black,
  },
  burningBadge: {
    backgroundColor: '#FF6B4A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  burningText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  completedBadge: {
    backgroundColor: '#F0F8F0',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredBadge: {
    backgroundColor: '#FFF3E0',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestDescription: {
    fontSize: SIZES.fontRegular,
    color: COLORS.black,
    lineHeight: 20,
    marginBottom: 10,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E5F5',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 6,
  },
  typeBadgeText: {
    color: '#7A1E5C',
    fontSize: 11,
    fontWeight: '800',
  },
  moderationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F0F3',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 8,
  },
  moderationBadgeText: {
    color: '#2F5969',
    fontSize: 11,
    fontWeight: '800',
  },
  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  requestTime: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    backgroundColor: '#F0E7DF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  deleteActionBtn: {
    backgroundColor: '#FFE8E4',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5B4F47',
  },
  deleteActionBtnText: {
    color: '#B13E2C',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: SIZES.fontRegular,
    fontWeight: '900',
    color: COLORS.black,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: SIZES.fontSmall,
    color: COLORS.gray,
    marginTop: 4,
    textAlign: 'center',
  },
  createBtn: {
    marginTop: 14,
    backgroundColor: '#7A1E5C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default HelpHistoryScreen;
