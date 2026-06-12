import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, ref, remove, update } from 'firebase/database';
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
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { lostFoundService } from '../services/lostFoundService';
import { buySellService } from '../services/buySellService';
import { contactsService } from '../services/contactsService';
import { appSuggestionsService } from '../services/appSuggestionsService';
import type { DetailItemData } from '../utils/detailViewTypes';

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
    loadMore: 'Завантажити ще',
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
    loadMore: 'Загрузить ещё',
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
    loadMore: 'Load more',
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

const PHOTO_SOURCE_SCREENS = ['FotoRayonaScreen', 'SoulPhotosScreen', 'PhotoUploadScreen'] as const;

type FeedRow =
  | { kind: 'request'; key: string; sortKey: number; request: Request }
  | { kind: 'photo'; key: string; sortKey: number; photo: ModerationPhoto }
  | { kind: 'lostFound'; key: string; sortKey: number; item: ModerationPhoto }
  | { kind: 'buySell'; key: string; sortKey: number; item: ModerationPhoto }
  | { kind: 'contacts'; key: string; sortKey: number; item: ModerationPhoto }
  | { kind: 'localBusiness'; key: string; sortKey: number; item: ModerationPhoto }
  | { kind: 'biznesChaika'; key: string; sortKey: number; item: ModerationPhoto }
  | { kind: 'appSuggestion'; key: string; sortKey: number; item: ModerationPhoto };

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const toStr = (value: unknown): string => (typeof value === 'string' ? value : '');
const toTimestamp = (value: unknown): number => {
  const numeric = toNumber(value);
  if (numeric > 0) return numeric;
  const parsed = Date.parse(toStr(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const PAGE_SIZE = 20;

const SOURCE_DETAIL_TYPES: Record<string, string> = {
  FotoRayonaScreen: 'photo',
  SoulPhotosScreen: 'photo',
  PhotoUploadScreen: 'photo',
  LostFoundScreen: 'lostfound',
  BuySellScreen: 'buysell',
  ContactsScreen: 'lyudi',
  LocalBusinessScreen: 'buysell',
  AppSuggestionScreen: 'help',
};

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
  const [pendingLostFound, setPendingLostFound] = useState<ModerationPhoto[]>([]);
  const [pendingBuySell, setPendingBuySell] = useState<ModerationPhoto[]>([]);
  const [pendingContacts, setPendingContacts] = useState<ModerationPhoto[]>([]);
  const [pendingLocalBusiness, setPendingLocalBusiness] = useState<ModerationPhoto[]>([]);
  const [pendingBiznesChaika, setPendingBiznesChaika] = useState<ModerationPhoto[]>([]);
  const [pendingAppSuggestions, setPendingAppSuggestions] = useState<ModerationPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>('all');
  const avatarByUserId = useUserAvatarMap(requests.map((item) => item.userId));

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
    try {
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
            userId: toStr(raw.userId) || toStr(raw.uploadedById) || undefined,
            phone: toStr(raw.phone) || undefined,
            category: toStr(raw.category) || undefined,
            address: toStr(raw.address) || toStr(raw.location) || undefined,
            sourceScreen,
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.uploadedAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingPhotos(items);
    } catch (e) {
      console.error('[loadPendingPhotos]', e);
    }
  }, []);

  const loadPendingLostFound = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'lost_found'));
      if (!snapshot.exists()) {
        setPendingLostFound([]);
        return;
      }

      const typeLabels = {
        lost: language === 'ru' ? 'Потеряно' : language === 'en' ? 'Lost' : 'Загублено',
        found: language === 'ru' ? 'Найдено' : language === 'en' ? 'Found' : 'Знайдено',
      } as const;

      const value = snapshot.val() as Record<string, Record<string, unknown>>;
      const items = Object.entries(value)
        .map<ModerationPhoto | null>(([id, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const status = toStr(raw.moderationStatus) || 'pending';
          if (status !== 'pending') return null;
          const type = toStr(raw.type) === 'lost' ? 'lost' : 'found';
          const category = toStr(raw.category);
          const description = toStr(raw.description);
          const summary = [typeLabels[type], category, description].filter(Boolean).join(' • ');
          return {
            id,
            uri: toStr(raw.photoUri) || undefined,
            storagePath: toStr(raw.photoStoragePath) || undefined,
            title: toStr(raw.name) || category || typeLabels[type],
            description: summary,
            userName: toStr(raw.name) || undefined,
            userId: toStr(raw.userId) || undefined,
            phone: toStr(raw.phone) || undefined,
            category: typeLabels[type],
            address: toStr(raw.address) || toStr(raw.location) || undefined,
            sourceScreen: 'LostFoundScreen',
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.submittedForModerationAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingLostFound(items);
    } catch (e) {
      console.error('[loadPendingLostFound]', e);
    }
  }, [language]);

  const loadPendingBuySell = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'buy_sell_listings'));
      if (!snapshot.exists()) {
        setPendingBuySell([]);
        return;
      }

      const typeLabels = {
        buy: language === 'ru' ? 'Куплю' : language === 'en' ? 'Buy' : 'Куплю',
        sell: language === 'ru' ? 'Продам' : language === 'en' ? 'Sell' : 'Продам',
      } as const;

      const value = snapshot.val() as Record<string, Record<string, unknown>>;
      const items = Object.entries(value)
        .map<ModerationPhoto | null>(([id, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const status = toStr(raw.moderationStatus) || 'pending';
          if (status !== 'pending') return null;
          const listingType = toStr(raw.listingType) === 'buy' ? 'buy' : 'sell';
          const itemName = toStr(raw.itemName);
          const price = toStr(raw.price);
          const description = toStr(raw.description);
          const summary = [typeLabels[listingType], toStr(raw.category), price, description].filter(Boolean).join(' • ');
          return {
            id,
            uri: toStr(raw.photoUri) || undefined,
            storagePath: toStr(raw.photoStoragePath) || undefined,
            title: itemName || typeLabels[listingType],
            description: summary,
            userName: itemName || undefined,
            userId: toStr(raw.userId) || undefined,
            phone: toStr(raw.phone) || undefined,
            category: toStr(raw.category) || typeLabels[listingType],
            price: price ? `${price} грн` : undefined,
            sourceScreen: 'BuySellScreen',
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.submittedForModerationAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingBuySell(items);
    } catch (e) {
      console.error('[loadPendingBuySell]', e);
    }
  }, [language]);

  const loadPendingContacts = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'contacts_listings'));
      if (!snapshot.exists()) {
        setPendingContacts([]);
        return;
      }

      const value = snapshot.val() as Record<string, Record<string, unknown>>;
      const items = Object.entries(value)
        .map<ModerationPhoto | null>(([id, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const status = toStr(raw.moderationStatus) || 'pending';
          if (status !== 'pending') return null;
          const itemName = toStr(raw.itemName);
          const price = toStr(raw.price);
          const description = toStr(raw.description);
          const summary = [toStr(raw.category), toStr(raw.condition), price, description].filter(Boolean).join(' • ');
          return {
            id,
            uri: toStr(raw.photoUri) || undefined,
            storagePath: toStr(raw.photoStoragePath) || undefined,
            title: itemName || (language === 'ru' ? 'Контакт' : language === 'en' ? 'Contact' : 'Контакт'),
            description: summary,
            userName: itemName || undefined,
            userId: toStr(raw.userId) || undefined,
            phone: raw.showPhone === false ? undefined : toStr(raw.phone) || undefined,
            category: toStr(raw.category) || toStr(raw.condition) || undefined,
            price: price || undefined,
            sourceScreen: 'ContactsScreen',
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.submittedForModerationAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingContacts(items);
    } catch (e) {
      console.error('[loadPendingContacts]', e);
    }
  }, [language]);

  const loadPendingLocalBusiness = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'local_business'));
      if (!snapshot.exists()) {
        setPendingLocalBusiness([]);
        return;
      }

      const value = snapshot.val() as Record<string, Record<string, unknown>>;
      const items = Object.entries(value)
        .map<ModerationPhoto | null>(([id, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const status = toStr(raw.status) || 'pending';
          if (status !== 'pending') return null;
          const contactName = toStr(raw.contactName);
          const category = toStr(raw.categoryLabel) || toStr(raw.categoryKey);
          const subcategory = toStr(raw.subcategoryLabel) || toStr(raw.subcategoryKey);
          const priceMin = toNumber(raw.priceMin);
          const priceMax = toNumber(raw.priceMax);
          const priceText = priceMin || priceMax ? [priceMin ? `${priceMin}` : '', priceMax ? `${priceMax}` : ''].filter(Boolean).join('-') : '';
          const description = toStr(raw.description);
          const summary = [category, subcategory, priceText, description].filter(Boolean).join(' • ');
          return {
            id,
            uri: toStr(raw.photoUri) || undefined,
            storagePath: toStr(raw.photoStoragePath) || undefined,
            title: contactName || subcategory || (language === 'ru' ? 'Бизнес/услуга' : language === 'en' ? 'Business/service' : 'Бізнес/послуга'),
            description: summary,
            userName: contactName || undefined,
            userId: toStr(raw.userId) || undefined,
            phone: toStr(raw.phone) || undefined,
            category: category || subcategory || undefined,
            price: priceText || undefined,
            address: toStr(raw.address) || toStr(raw.serviceArea) || undefined,
            sourceScreen: 'LocalBusinessScreen',
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.submittedForModerationAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingLocalBusiness(items);
    } catch (e) {
      console.error('[loadPendingLocalBusiness]', e);
    }
  }, [language]);

  const loadPendingBiznesChaika = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'biznes_chaika_listings'));
      if (!snapshot.exists()) {
        setPendingBiznesChaika([]);
        return;
      }

      const value = snapshot.val() as Record<string, Record<string, unknown>>;
      const items = Object.entries(value)
        .map<ModerationPhoto | null>(([id, raw]) => {
          if (!raw || typeof raw !== 'object') return null;
          const status = toStr(raw.moderationStatus) || 'pending';
          if (status !== 'pending') return null;
          const itemName = toStr(raw.itemName);
          const contactName = toStr(raw.contactName);
          const price = toStr(raw.price);
          const description = toStr(raw.description);
          const summary = [toStr(raw.category), price, description].filter(Boolean).join(' • ');
          return {
            id,
            uri: toStr(raw.photoUri) || undefined,
            storagePath: toStr(raw.photoStoragePath) || undefined,
            title: itemName || contactName || (language === 'ru' ? 'Бизнес Чайка' : language === 'en' ? 'Biz Chaika' : 'Бізнес Чайка'),
            description: summary,
            userName: contactName || undefined,
            userId: toStr(raw.userId) || undefined,
            phone: toStr(raw.phone) || undefined,
            category: toStr(raw.category) || undefined,
            price: price || undefined,
            sourceScreen: 'BizznesChaikaScreen',
            createdAt: toTimestamp(raw.createdAt) || toTimestamp(raw.submittedForModerationAt),
            status: 'pending',
          };
        })
        .filter((item): item is ModerationPhoto => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingBiznesChaika(items);
    } catch (e) {
      console.error('[loadPendingBiznesChaika]', e);
    }
  }, [language]);

  const loadPendingAppSuggestions = useCallback(async () => {
    const items = (await appSuggestionsService.getSuggestionsOnce())
      .filter((item) => item.moderationStatus === 'pending')
      .map<ModerationPhoto>((item) => ({
        id: item.id,
        title: language === 'ru' ? 'Предложение по приложению' : language === 'en' ? 'App suggestion' : 'Пропозиція щодо додатку',
        description: item.text,
        userName: item.name || undefined,
        userId: item.userId || undefined,
        phone: item.phone || undefined,
        sourceScreen: 'AppSuggestionScreen',
        createdAt: toTimestamp(item.createdAt) || toTimestamp(item.submittedForModerationAt),
        status: 'pending',
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    setPendingAppSuggestions(items);
  }, [language]);

  useEffect(() => {
    let active = true;
    let mounted = true;

    isModeratorUser()
      .then((allowed) => {
        if (mounted) {
          setIsModerator(allowed);
          if (allowed) {
            void loadPendingPhotos().catch(() => {});
            void loadPendingLostFound().catch(() => {});
            void loadPendingBuySell().catch(() => {});
            void loadPendingContacts().catch(() => {});
            void loadPendingLocalBusiness().catch(() => {});
            void loadPendingBiznesChaika().catch(() => {});
            void loadPendingAppSuggestions().catch(() => {});
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
  }, [user?.id, user?.email, loadPage, loadPendingPhotos, loadPendingLostFound, loadPendingBuySell, loadPendingContacts, loadPendingLocalBusiness, loadPendingBiznesChaika, loadPendingAppSuggestions]);

  // When a non-'all' filter is selected, load all remaining pages so filter works on complete data
  const loadAllRequests = useCallback(async () => {
    let cursor: number | null = null;
    let accumulated: Request[] = [];
    let iterations = 0;
    const MAX_ITERATIONS = 50; // safety cap (~1000 items)

    setLoadingMore(true);
    try {
      while (iterations < MAX_ITERATIONS) {
        const result = await firebaseChatAPI.getRequestsPaginated({ limit: PAGE_SIZE + 1, cursorBefore: cursor });
        if (!isRequestsPageResult(result) || !result.success || !result.data) break;
        const pageItems = (result.data as Request[])
          .map((item) => ({
            ...item,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : new Date(item.createdAt).getTime(),
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        const page = pageItems.slice(0, PAGE_SIZE);
        accumulated = [...accumulated, ...page];
        const moreAvailable = pageItems.length > PAGE_SIZE && page.length > 0;
        cursor = moreAvailable ? (page[page.length - 1].timestamp ?? null) : null;
        if (!moreAvailable || cursor === null) break;
        iterations++;
      }
      if (accumulated.length > 0) {
        setRequests(accumulated);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, []);

  // When user applies a non-'all' filter, load all pages so filter works on complete data
  useEffect(() => {
    if (statusFilter !== 'all' && hasMore && !loading && !loadingMore) {
      void loadAllRequests();
    }
  }, [statusFilter, hasMore, loading, loadingMore, loadAllRequests]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadPage(null, false),
        isModerator ? loadPendingPhotos() : Promise.resolve(),
        isModerator ? loadPendingLostFound() : Promise.resolve(),
        isModerator ? loadPendingBuySell() : Promise.resolve(),
        isModerator ? loadPendingContacts() : Promise.resolve(),
        isModerator ? loadPendingLocalBusiness() : Promise.resolve(),
        isModerator ? loadPendingBiznesChaika() : Promise.resolve(),
        isModerator ? loadPendingAppSuggestions() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [isModerator, loadPage, loadPendingPhotos, loadPendingLostFound, loadPendingBuySell, loadPendingContacts, loadPendingLocalBusiness, loadPendingBiznesChaika, loadPendingAppSuggestions]);

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

  const moderateLostFound = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `lost_found:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await lostFoundService.moderate(itemId, status);
        setPendingLostFound((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteLostFound = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `lost_found:${itemId}`;
            setModerationBusyId(busyId);
            void remove(ref(database, `lost_found/${itemId}`))
              .then(() => setPendingLostFound((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const moderateBuySell = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `buy_sell:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await buySellService.moderate(itemId, status);
        setPendingBuySell((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteBuySell = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `buy_sell:${itemId}`;
            setModerationBusyId(busyId);
            void remove(ref(database, `buy_sell_listings/${itemId}`))
              .then(() => setPendingBuySell((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const moderateContacts = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `contacts:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await contactsService.moderate(itemId, status);
        setPendingContacts((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteContacts = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `contacts:${itemId}`;
            setModerationBusyId(busyId);
            void remove(ref(database, `contacts_listings/${itemId}`))
              .then(() => setPendingContacts((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const moderateLocalBusiness = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `local_business:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await update(ref(database, `local_business/${itemId}`), {
          status: status === 'approved' ? 'active' : 'rejected',
          moderatedAt: new Date().toISOString(),
          moderationReason: status === 'rejected' ? 'default_rejected' : null,
          rejectionReason: status === 'rejected' ? 'default_rejected' : null,
        });
        setPendingLocalBusiness((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteLocalBusiness = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `local_business:${itemId}`;
            setModerationBusyId(busyId);
            void remove(ref(database, `local_business/${itemId}`))
              .then(() => setPendingLocalBusiness((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const moderateBiznesChaika = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `biznes_chaika:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await update(ref(database, `biznes_chaika_listings/${itemId}`), {
          moderationStatus: status,
          moderatedAt: new Date().toISOString(),
        });
        setPendingBiznesChaika((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteBiznesChaika = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `biznes_chaika:${itemId}`;
            setModerationBusyId(busyId);
            void remove(ref(database, `biznes_chaika_listings/${itemId}`))
              .then(() => setPendingBiznesChaika((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const moderateAppSuggestion = useCallback(
    async (itemId: string, status: 'approved' | 'rejected') => {
      const busyId = `app_suggestion:${itemId}`;
      if (moderationBusyId) {
        return;
      }

      setModerationBusyId(busyId);
      try {
        await appSuggestionsService.moderateSuggestion(itemId, status);
        setPendingAppSuggestions((prev) => prev.filter((item) => item.id !== itemId));
      } catch (errorValue) {
        Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
      } finally {
        setModerationBusyId(null);
      }
    },
    [moderationBusyId, text.actionFailed, text.loadingError],
  );

  const deleteAppSuggestion = useCallback(
    (itemId: string) => {
      if (moderationBusyId) {
        return;
      }

      Alert.alert(text.deleteTitle, text.deleteBody, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.deleteBtn,
          style: 'destructive',
          onPress: () => {
            const busyId = `app_suggestion:${itemId}`;
            setModerationBusyId(busyId);
            void appSuggestionsService.deleteSuggestion(itemId)
              .then(() => setPendingAppSuggestions((prev) => prev.filter((item) => item.id !== itemId)))
              .catch((errorValue: unknown) => {
                Alert.alert(text.loadingError, errorValue instanceof Error ? errorValue.message : text.actionFailed);
              })
              .finally(() => setModerationBusyId(null));
          },
        },
      ]);
    },
    [moderationBusyId, text.actionFailed, text.cancel, text.deleteBody, text.deleteBtn, text.deleteTitle, text.loadingError],
  );

  const openModerationItemDetail = useCallback((item: ModerationPhoto) => {
    if (navLock.current) return;
    navLock.current = true;

    if (item.sourceScreen === 'ContactsScreen' && item.userId) {
      navigation.navigate('ViewUserProfile', { userId: item.userId });
      setTimeout(() => {
        navLock.current = false;
      }, 800);
      return;
    }

    const detailItem: DetailItemData = {
      id: item.id,
      title: item.title?.trim() || item.userName?.trim() || item.sourceScreen,
      description: item.description,
      photoUri: item.uri,
      photoStoragePath: item.storagePath,
      phone: item.phone,
      category: item.category,
      price: item.price,
      address: item.address,
      status: item.status,
      userId: item.userId,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
      sourceType: SOURCE_DETAIL_TYPES[item.sourceScreen] ?? 'help',
      sourceId: item.id,
    };

    navigation.navigate('ItemDetailScreen', { item: detailItem });
    setTimeout(() => {
      navLock.current = false;
    }, 800);
  }, [navigation]);

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

    const lostFoundRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingLostFound.map((item) => ({
          kind: 'lostFound',
          key: `lost_found:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    const buySellRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingBuySell.map((item) => ({
          kind: 'buySell',
          key: `buy_sell:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    const contactsRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingContacts.map((item) => ({
          kind: 'contacts',
          key: `contacts:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    const localBusinessRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingLocalBusiness.map((item) => ({
          kind: 'localBusiness',
          key: `local_business:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    const biznesChaikaRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingBiznesChaika.map((item) => ({
          kind: 'biznesChaika',
          key: `biznes_chaika:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    const appSuggestionRows: FeedRow[] = isModerator && (statusFilter === 'all' || statusFilter === 'pending')
      ? pendingAppSuggestions.map((item) => ({
          kind: 'appSuggestion',
          key: `app_suggestion:${item.id}`,
          sortKey: item.createdAt,
          item,
        }))
      : [];

    return [...requestRows, ...photoRows, ...lostFoundRows, ...buySellRows, ...contactsRows, ...localBusinessRows, ...biznesChaikaRows, ...appSuggestionRows].sort((a, b) => b.sortKey - a.sortKey);
  }, [isModerator, pendingAppSuggestions, pendingBiznesChaika, pendingBuySell, pendingContacts, pendingLocalBusiness, pendingLostFound, pendingPhotos, sortedRequests, statusFilter]);

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
          <Text style={styles.statValue}>{feedRows.length}</Text>
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
          onPress={() => openModerationItemDetail(item.photo)}
          busy={moderationBusyId === `photo:${item.photo.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'lostFound') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateLostFound(item.item.id, 'approved')}
          onReject={() => void moderateLostFound(item.item.id, 'rejected')}
          onDelete={() => deleteLostFound(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `lost_found:${item.item.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'buySell') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateBuySell(item.item.id, 'approved')}
          onReject={() => void moderateBuySell(item.item.id, 'rejected')}
          onDelete={() => deleteBuySell(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `buy_sell:${item.item.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'contacts') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateContacts(item.item.id, 'approved')}
          onReject={() => void moderateContacts(item.item.id, 'rejected')}
          onDelete={() => deleteContacts(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `contacts:${item.item.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'localBusiness') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateLocalBusiness(item.item.id, 'approved')}
          onReject={() => void moderateLocalBusiness(item.item.id, 'rejected')}
          onDelete={() => deleteLocalBusiness(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `local_business:${item.item.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'biznesChaika') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateBiznesChaika(item.item.id, 'approved')}
          onReject={() => void moderateBiznesChaika(item.item.id, 'rejected')}
          onDelete={() => deleteBiznesChaika(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `biznes_chaika:${item.item.id}`}
          language={language}
        />
      );
    }

    if (item.kind === 'appSuggestion') {
      return (
        <ModerationPhotoCard
          photo={item.item}
          onApprove={() => void moderateAppSuggestion(item.item.id, 'approved')}
          onReject={() => void moderateAppSuggestion(item.item.id, 'rejected')}
          onDelete={() => deleteAppSuggestion(item.item.id)}
          onPress={() => openModerationItemDetail(item.item)}
          busy={moderationBusyId === `app_suggestion:${item.item.id}`}
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
  }, [avatarByUserId, deleteAppSuggestion, deleteBuySell, deleteContacts, deleteLocalBusiness, deleteLostFound, deletePhoto, isModerator, language, moderate, moderateAppSuggestion, moderateBuySell, moderateContacts, moderateLocalBusiness, moderateLostFound, moderatePhoto, moderationBusyId, navigation, openContactModal, openModerationItemDetail, removeRequest, user?.id]);

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
            <Text style={styles.retryBtnText}>{loadingMore ? '...' : text.loadMore}</Text>
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
    backgroundColor: '#7d0e59',
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
  createButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: SIZES.fontRegular },
  secondaryHeaderButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.primary },
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
