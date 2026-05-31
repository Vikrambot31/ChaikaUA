import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, ref } from 'firebase/database';
import RequestItem from '../components/RequestItem';
import ModerationPhotoCard, { type ModerationPhoto } from '../components/ModerationPhotoCard';
import { deleteRequest } from '../redux/slices/requestsSlice';
import { selectUser } from '../redux/slices/authSlice';
import { Request } from '../types/app';
import { COLORS, SIZES } from '../utils/constants';
import { SkeletonList } from '../components/SkeletonLoader';
import MiniTabBar from '../components/MiniTabBar';
import type { AppDispatch, RootState } from '../redux/store';
import { database, firebaseChatAPI, photoAPI } from '../firebase-config';
import { isModeratorUser } from '../firebase-auth-session';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { resolveUserAvatarMap } from '../utils/userAvatar';
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';

type RequestsNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;
type AppLanguage = 'ua' | 'ru' | 'en';
type RequestStatusFilter = 'all' | 'approved' | 'pending' | 'rejected';
type RequestsPageResult = { success: boolean; data?: Request[]; error?: string };

const isRequestsPageResult = (value: unknown): value is RequestsPageResult =>
  Boolean(value && typeof value === 'object' && 'success' in value);

const UI_TEXT = {
  ua: {
    emptyRequests: 'Немає заявок',
    headerTitle: 'ЗАЯВКИ СУСІДІВ',
    headerSubtitle: 'Усі актуальні запити мешканців в одному місці',
    totalRequests: 'Всього заявок',
    approved: 'Схвалено',
    moderatorMode: 'Режим модерації',
    moderatorText: 'Доступні дії: схвалити, відхилити, видалити.',
    myRequests: 'Мої заявки',
    createRequest: 'Створити нову заявку',
    loadingError: 'Помилка завантаження',
    retry: 'Повторити',
    approveBtn: 'Схвалити',
    rejectBtn: 'Відхилити',
    deleteBtn: 'Видалити',
    emptySub: "Список оновиться, коли з'являться нові заявки.",
    deleteTitle: 'Видалення',
    deleteBody: 'Видалити назавжди?',
    cancel: 'Скасувати',
    actionFailed: 'Дію не вдалося виконати',
  },
  ru: {
    emptyRequests: 'Нет заявок',
    headerTitle: 'ЗАЯВКИ СОСЕДЕЙ',
    headerSubtitle: 'Все актуальные запросы жителей в одном месте',
    totalRequests: 'Всего заявок',
    approved: 'Одобрено',
    moderatorMode: 'Режим модерации',
    moderatorText: 'Доступные действия: одобрить, отклонить, удалить.',
    myRequests: 'Мои заявки',
    createRequest: 'Создать новую заявку',
    loadingError: 'Ошибка загрузки',
    retry: 'Повторить',
    approveBtn: 'Одобрить',
    rejectBtn: 'Отклонить',
    deleteBtn: 'Удалить',
    emptySub: 'Список обновится, когда появятся новые заявки.',
    deleteTitle: 'Удаление',
    deleteBody: 'Удалить навсегда?',
    cancel: 'Отмена',
    actionFailed: 'Действие не выполнено',
  },
  en: {
    emptyRequests: 'No requests',
    headerTitle: 'NEIGHBOR REQUESTS',
    headerSubtitle: 'All resident requests in one place',
    totalRequests: 'Total requests',
    approved: 'Approved',
    moderatorMode: 'Moderation mode',
    moderatorText: 'Available actions: approve, reject, delete.',
    myRequests: 'My requests',
    createRequest: 'Create new request',
    loadingError: 'Loading error',
    retry: 'Retry',
    approveBtn: 'Approve',
    rejectBtn: 'Reject',
    deleteBtn: 'Delete',
    emptySub: 'The list will update when new requests appear.',
    deleteTitle: 'Delete',
    deleteBody: 'Delete permanently?',
    cancel: 'Cancel',
    actionFailed: 'Action could not be completed',
  },
} as const;

const PHOTO_SOURCE_SCREENS = ['FotoRayonaScreen', 'SoulPhotosScreen'] as const;

type FeedRow =
  | { kind: 'request'; key: string; sortKey: number; request: Request }
  | { kind: 'photo'; key: string; sortKey: number; photo: ModerationPhoto };

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const toStr = (value: unknown): string => (typeof value === 'string' ? value : '');
const PAGE_SIZE = 20;

const RequestsScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<RequestsNavigation>();
  const navLock = useRef(false);
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const insets = useSafeAreaInsets();
  const text = UI_TEXT[language];
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<ModerationPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>('all');
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});

  const loadPage = useCallback(
    async (cursorBefore: number | null, append: boolean) => {
      const result = await firebaseChatAPI.getRequestsPaginated({
        limit: PAGE_SIZE + 1,
        cursorBefore,
      });
      if (!isRequestsPageResult(result)) {
        setError(text.loadingError);
        return false;
      }
      if (!result.success || !result.data) {
        setError((!result.success && 'error' in result ? result.error : undefined) ?? text.loadingError);
        return false;
      }

      const pageItems = result.data as Request[];
      const normalized = pageItems
        .map((item) => ({
          ...item,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : new Date(item.createdAt).getTime(),
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      const page = normalized.slice(0, PAGE_SIZE);
      const oldest = page.length > 0 ? page[page.length - 1].timestamp : null;

      setRequests((prev) => {
        if (!append) return page;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...page.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(oldest);
      setHasMore(normalized.length > PAGE_SIZE && oldest !== null);
      setError(null);
      return true;
    },
    [text.loadingError],
  );

  const loadPendingPhotos = useCallback(async () => {
    const snapshot = await get(ref(database, 'community_photos'));
    if (!snapshot.exists()) {
      setPendingPhotos([]);
      return;
    }
    const value = snapshot.val() as Record<string, Record<string, unknown>>;
    const sources = new Set<string>(PHOTO_SOURCE_SCREENS);
    const items = Object.entries(value)
      .map<ModerationPhoto | null>(([id, raw]) => {
        if (!raw || typeof raw !== 'object') return null;
        const sourceScreen = toStr(raw.sourceScreen);
        if (!sources.has(sourceScreen)) return null;
        const status = toStr(raw.status) || 'pending';
        if (status !== 'pending') return null;
        return {
          id,
          uri: toStr(raw.thumbnailUrl) || toStr(raw.imageUri) || undefined,
          storagePath: toStr(raw.storagePath) || undefined,
          title: toStr(raw.title) || undefined,
          description: toStr(raw.description) || undefined,
          userName: toStr(raw.userName) || toStr(raw.uploadedBy) || undefined,
          sourceScreen,
          createdAt: toNumber(raw.createdAt) || toNumber(raw.uploadedAt),
          status: 'pending',
        };
      })
      .filter((item): item is ModerationPhoto => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
    setPendingPhotos(items);
  }, []);

  useEffect(() => {
    let active = true;
    let mounted = true;

    isModeratorUser()
      .then((allowed) => {
        if (mounted) {
          setIsModerator(allowed);
          if (allowed) {
            void loadPendingPhotos().catch(() => {});
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setIsModerator(false);
        }
      });

    setLoading(true);
    void loadPage(null, false).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      active = false;
    };
  }, [user?.id, user?.email, loadPage, loadPendingPhotos]);

  useEffect(() => {
    const userIds = Array.from(new Set(requests.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;
    let cancelled = false;
    void resolveUserAvatarMap(database, userIds).then((resolved) => {
      if (cancelled) return;
      setAvatarByUserId((prev) => ({ ...prev, ...resolved }));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [requests]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadPage(null, false),
        isModerator ? loadPendingPhotos() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [isModerator, loadPage, loadPendingPhotos]);

  const handleLoadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);
    await loadPage(nextCursor, true);
    setLoadingMore(false);
  }, [hasMore, loadPage, loading, loadingMore, nextCursor]);

  const moderate = useCallback(
    async (requestId: string, status: 'approved' | 'rejected') => {
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(requestId);
      try {
        const result = await firebaseChatAPI.moderateRequest(requestId, status);
        if (result.success) {
          await handleRefresh();
        }
      } finally {
        setModerationBusyId(null);
      }
    },
    [handleRefresh, moderationBusyId],
  );

  const removeRequest = useCallback(
    async (requestId: string) => {
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(requestId);
      try {
        await dispatch(deleteRequest(requestId)).unwrap();
        setRequests((prev) => prev.filter((item) => item.id !== requestId));
      } finally {
        setModerationBusyId(null);
      }
    },
    [dispatch, moderationBusyId],
  );

  const moderatePhoto = useCallback(
    async (photoId: string, status: 'approved' | 'rejected') => {
      const busyId = `photo:${photoId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        const result = await photoAPI.moderatePhoto(photoId, status);
        if (result.success) {
          setPendingPhotos((prev) => prev.filter((item) => item.id !== photoId));
        } else {
          Alert.alert(text.loadingError, result.error ?? text.actionFailed);
        }
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deletePhoto = useCallback(
    (photoId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `photo:${photoId}`;
            setModerationBusyId(busyId);
            void photoAPI.deletePhoto(photoId)
              .then((result) => {
                if (result.success) {
                  setPendingPhotos((prev) => prev.filter((item) => item.id !== photoId));
                } else {
                  Alert.alert(text.loadingError, result.error ?? text.actionFailed);
                }
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const sortedRequests = useMemo(() => {
    const resolveStatus = (item: Request): RequestStatusFilter => {
      if (item.status === 'approved' || item.status === 'pending' || item.status === 'rejected') {
        return item.status;
      }
      return item.isApproved ? 'approved' : 'pending';
    };

    return [...requests]
      .filter((item) => statusFilter === 'all' || resolveStatus(item) === statusFilter)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [requests, statusFilter]);

  const feedRows = useMemo<FeedRow[]>(() => {
    const requestRows: FeedRow[] = sortedRequests.map((request) => ({
      kind: 'request',
      key: `request:${request.id}`,
      sortKey: request.createdAt,
      request,
    }));

    const photoRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingPhotos.map((photo) => ({
          kind: 'photo',
          key: `photo:${photo.id}`,
          sortKey: photo.createdAt,
          photo,
        }))
      : [];

    return [...requestRows, ...photoRows].sort((a, b) => b.sortKey - a.sortKey);
  }, [isModerator, pendingPhotos, sortedRequests, statusFilter]);

  const emptyMessage = error ?? text.emptyRequests;

  const renderHeader = () => (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        <Text style={styles.headerSubtitle}>{text.headerSubtitle}</Text>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{text.totalRequests}</Text>
          <Text style={styles.statValue}>{sortedRequests.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>{text.approved}</Text>
          <Text style={styles.statValue}>{sortedRequests.filter((r) => r.isApproved).length}</Text>
        </View>
      </View>

      {isModerator ? (
        <View style={styles.moderatorCard}>
          <Text style={styles.moderatorTitle}>{text.moderatorMode}</Text>
          <Text style={styles.moderatorText}>{text.moderatorText}</Text>
        </View>
      ) : null}

      <View style={styles.actionsHeaderRow}>
        <TouchableOpacity
          style={[styles.createButton, styles.secondaryHeaderButton]}
          onPress={() => navigation.navigate('MyRequestsScreen')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="clipboard-account-outline" size={22} color={COLORS.primary} />
          <Text style={[styles.createButtonText, styles.secondaryHeaderButtonText]}>{text.myRequests}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => { void openRequestFormWithLimitCheck(navigation, language); }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          <Text style={styles.createButtonText}>{text.createRequest}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statusFilterRow}>
        {[
          { value: 'all' as const, label: language === 'ru' ? 'Все' : language === 'en' ? 'All' : 'Всі' },
          { value: 'approved' as const, label: language === 'ru' ? 'Одобрено' : language === 'en' ? 'Approved' : 'Схвалено' },
          { value: 'pending' as const, label: language === 'ru' ? 'Ожидает' : language === 'en' ? 'Pending' : 'Очікує' },
          { value: 'rejected' as const, label: language === 'ru' ? 'Отклонено' : language === 'en' ? 'Rejected' : 'Відхилено' },
        ].map((statusItem) => (
          <TouchableOpacity
            key={statusItem.value}
            style={[styles.statusChip, statusFilter === statusItem.value && styles.statusChipActive]}
            onPress={() => setStatusFilter(statusItem.value)}
            activeOpacity={0.84}
          >
            <Text style={[styles.statusChipText, statusFilter === statusItem.value && styles.statusChipTextActive]}>
              {statusItem.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <SkeletonList count={5} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <MaterialCommunityIcons name="alert-circle" size={28} color="#DC2626" />
          <Text style={styles.errorTitle}>{text.loadingError}</Text>
          <Text style={styles.errorDescription}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void handleRefresh()} activeOpacity={0.85}>
            <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>{text.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const renderItem = useCallback(({ item }: { item: FeedRow }) => {
    if (item.kind === 'photo') {
      return (
        <ModerationPhotoCard
          photo={item.photo}
          onApprove={() => void moderatePhoto(item.photo.id, 'approved')}
          onReject={() => void moderatePhoto(item.photo.id, 'rejected')}
          onDelete={() => deletePhoto(item.photo.id)}
          busy={moderationBusyId === `photo:${item.photo.id}`}
          language={language}
        />
      );
    }

    const request = item.request;
    const isOwn = Boolean(request.userId && request.userId === user?.id);
    const isOther = Boolean(request.userId && request.userId !== user?.id);
    return (
      <RequestItem
        request={request}
        avatarUri={(request.userId && avatarByUserId[request.userId]) || undefined}
        currentUserId={user?.id}
        isOwn={isOwn}
        onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('RequestDetail', { request }); setTimeout(() => { navLock.current = false; }, 800); }}
        onDelete={isOwn ? () => void removeRequest(request.id) : undefined}
        onProfile={isOther ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: request.userId as string }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
        onContact={isOther ? () => openContactModal({ userId: request.userId as string, name: request.name ?? 'Unknown', sourceType: 'help', sourceId: request.id, sourceTitle: request.description?.slice(0, 60) }) : undefined}
        onApprove={isModerator ? () => void moderate(request.id, 'approved') : undefined}
        onReject={isModerator ? () => void moderate(request.id, 'rejected') : undefined}
        onModDelete={isModerator ? () => void removeRequest(request.id) : undefined}
        isModerator={isModerator}
        moderationBusy={moderationBusyId === request.id}
        language={language}
      />
    );
  }, [avatarByUserId, deletePhoto, isModerator, language, moderate, moderatePhoto, moderationBusyId, navigation, openContactModal, removeRequest, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={feedRows}
        keyExtractor={(item: FeedRow) => item.key}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        contentContainerStyle={styles.listContent}
        contentInset={{ bottom: Math.max(insets.bottom, 10) + 92 }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="inbox-multiple" size={48} color={COLORS.gray} />
            <Text style={styles.emptyText}>{emptyMessage}</Text>
            <Text style={styles.emptySubtext}>{text.emptySub}</Text>
          </View>
        ) : null}
        onEndReachedThreshold={0.35}
        onEndReached={() => void handleLoadMore()}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
      {!loading && hasMore ? (
        <View style={[styles.loadMoreWrap, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void handleLoadMore()} activeOpacity={0.85} disabled={loadingMore}>
            <MaterialCommunityIcons name={loadingMore ? 'timer-sand' : 'chevron-down'} size={18} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>{loadingMore ? '...' : text.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <MiniTabBar />
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  headerCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 20,
    padding: 18,
    margin: 16,
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
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: SIZES.fontSmall, color: COLORS.gray, fontWeight: '700' },
  statValue: { fontSize: 28, fontWeight: '900', color: COLORS.primary, marginTop: 4 },
  divider: { width: 1, height: 40, backgroundColor: '#E8DDD3' },
  moderatorCard: {
    backgroundColor: '#E8F1FF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  moderatorTitle: { fontSize: 14, fontWeight: '800', color: '#1E3A8A' },
  moderatorText: { fontSize: 12, color: '#334155', marginTop: 4 },
  actionsHeaderRow: {
    gap: 10,
    marginBottom: 12,
  },
  statusFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  statusChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD3',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusChipActive: {
    backgroundColor: '#7A1E5C',
    borderColor: '#7A1E5C',
  },
  statusChipText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: '700',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  secondaryHeaderButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  createButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: SIZES.fontRegular },
  secondaryHeaderButtonText: { color: COLORS.primary },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 18 },
  loadingContainer: { marginVertical: 16 },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  errorTitle: { fontSize: 16, fontWeight: '900', color: '#1F2937', marginTop: 8 },
  errorDescription: { fontSize: 13, color: '#6B7280', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    backgroundColor: '#7A1E5C',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  loadMoreWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: SIZES.fontRegular, fontWeight: '900', color: COLORS.black, marginTop: 12 },
  emptySubtext: { fontSize: SIZES.fontSmall, color: COLORS.gray, marginTop: 4 },
});

export default RequestsScreen;
