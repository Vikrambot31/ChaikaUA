import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { get, limitToFirst, query, ref, remove, update } from 'firebase/database';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import { auth, communityUsersAPI, database, firebaseChatAPI } from '../firebase-config';
import type { RootState } from '../redux/store';
import type { CommunityPhoto, ProblemResolutionStatus } from '../types/app';
import { buySellService, BuySellListing } from '../services/buySellService';
import { contactsService, ContactListing } from '../services/contactsService';
import { jobService, JobListing } from '../services/jobService';
import { lostFoundService, LostFoundItem } from '../services/lostFoundService';
import { appSuggestionsService, type AppSuggestion } from '../services/appSuggestionsService';
import { moderateOsbbNews, OsbbNewsItem } from '../services/osbbNews';
import {
  deleteCommunityUser,
  deleteOsbbNewsItem,
} from '../services/serviceModeration';
import { logClientError, logClientEvent, safeLogError } from '../utils/errorLogger';
import { isSafePromiseTimeoutError, safePromiseTimeout } from '../utils/safePromiseTimeout';
import { SCREEN_THEME } from '../utils/screenTheme';

type Tab =
  | 'requests'
  | 'suggestions'
  | 'photos'
  | 'buysell'
  | 'contacts'
  | 'business'
  | 'biznesChaika'
  | 'jobs'
  | 'lostfound'
  | 'osbbnews'
  | 'osbbvotes'
  | 'osbbtopics'
  | 'osbbcollections'
  | 'users';
type Lang = 'ua' | 'ru' | 'en';
type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;

type ModerationRequest = {
  id: string;
  name?: string;
  text?: string;
  phone?: string;
  category?: string;
  status?: string;
  resolutionStatus?: ProblemResolutionStatus;
};

type LocalBusinessItem = {
  id: string;
  contactName?: string;
  phone?: string;
  categoryLabel?: string;
  subcategoryLabel?: string;
  description?: string;
  status?: string;
  moderationReason?: string;
  moderatedAt?: string;
};

type BiznesChaikaItem = {
  id: string;
  itemName?: string;
  description?: string;
  price?: string;
  phone?: string;
  category?: string;
  condition?: string;
  contactName?: string;
  moderationStatus?: string;
  submittedForModerationAt?: string;
};

type ModerationOsbbNews = OsbbNewsItem & {
  buildingId: string;
};

type NestedModerationItem = {
  id: string;
  buildingId: string;
  title?: string;
  question?: string;
  description?: string;
  paymentUrl?: string;
  moderationStatus?: string;
};

type CommunityMember = {
  id: string;
  name: string;
  phone?: string;
  building?: string;
  houseNumber?: string;
  registeredAt?: string;
};

const isPublicGalleryPhoto = (photo: CommunityPhoto): boolean => {
  const title = typeof photo.title === 'string' ? photo.title.trim() : '';
  const isLegacyPersonalDefault = title === 'Photo' || title === 'Р¤РѕС‚Рѕ';
  return photo.target === 'gallery_public' && !isLegacyPersonalDefault;
};

type FailedSectionIssue = {
  section: Tab;
  sectionLabel: string;
  summary: string;
  explanation: string;
  technicalDetails?: string;
};

const SECTION_TIMEOUT_MS = 12000;
const LOAD_ALL_EMERGENCY_TIMEOUT_MS = 16000;

const TABS: { key: Tab; label: Record<Lang, string> }[] = [
  { key: 'requests', label: { ua: 'Заявки', ru: 'Заявки', en: 'Requests' } },
  { key: 'suggestions', label: { ua: 'Чого не вистачає', ru: 'Чего не хватает', en: 'What is missing' } },
  { key: 'photos', label: { ua: 'Фото', ru: 'Фото', en: 'Photos' } },
  { key: 'buysell', label: { ua: 'Оголошення', ru: 'Объявления', en: 'Buy/Sell' } },
  { key: 'contacts', label: { ua: 'Контакти', ru: 'Контакты', en: 'Contacts' } },
  { key: 'business', label: { ua: 'Business', ru: 'Business', en: 'Business' } },
  { key: 'biznesChaika', label: { ua: 'Бізнес Чайка', ru: 'Бизнес Чайка', en: 'Biz Chaika' } },
  { key: 'jobs', label: { ua: 'Робота', ru: 'Работа', en: 'Jobs' } },
  { key: 'lostfound', label: { ua: 'Знахідки', ru: 'Потери', en: 'Lost/Found' } },
  { key: 'osbbnews', label: { ua: 'Новини', ru: 'Новости', en: 'News' } },
  { key: 'osbbvotes', label: { ua: 'OSBB votes', ru: 'OSBB votes', en: 'OSBB votes' } },
  { key: 'osbbtopics', label: { ua: 'OSBB topics', ru: 'OSBB topics', en: 'OSBB topics' } },
  { key: 'osbbcollections', label: { ua: 'OSBB collections', ru: 'OSBB collections', en: 'OSBB collections' } },
  { key: 'users', label: { ua: 'Користувачі', ru: 'Пользователи', en: 'Users' } },
];

const flattenNestedModeration = (raw: unknown): NestedModerationItem[] => {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  return Object.entries(raw as Record<string, Record<string, Record<string, unknown>>>).flatMap(([buildingId, itemsById]) =>
    Object.entries(itemsById || {}).map(([id, value]) => ({
      ...(value as Omit<NestedModerationItem, 'id' | 'buildingId'>),
      id,
      buildingId,
      moderationStatus: typeof value?.moderationStatus === 'string' ? value.moderationStatus : 'pending',
    })),
  );
};

const getSectionLabel = (section: Tab, language: Lang): string =>
  TABS.find((item) => item.key === section)?.label[language] ?? section;

const getTechnicalDetails = (reason: unknown): string | undefined => {
  if (isSafePromiseTimeoutError(reason)) {
    return `Timeout after ${Math.round(reason.timeoutMs / 1000)} sec`;
  }
  if (reason instanceof Error) {
    return reason.message || reason.name;
  }
  if (typeof reason === 'string') {
    return reason;
  }
  if (reason && typeof reason === 'object' && 'message' in reason && typeof (reason as { message?: unknown }).message === 'string') {
    return (reason as { message: string }).message;
  }
  return undefined;
};

const buildFailedSectionIssue = (section: Tab, reason: unknown, language: Lang): FailedSectionIssue => {
  const technicalDetails = getTechnicalDetails(reason);
  const detail = (technicalDetails ?? '').toLowerCase();
  const errors = SECTION_ERRORS[language];

  let picked: { summary: string; explanation: string };
  if (isSafePromiseTimeoutError(reason)) {
    picked = errors.timeout;
  } else if (detail.includes('permission') || detail.includes('denied') || detail.includes('unauthorized')) {
    picked = errors.permission;
  } else if (detail.includes('network') || detail.includes('internet') || detail.includes('fetch') || detail.includes('offline')) {
    picked = errors.network;
  } else if (detail.includes('unavailable')) {
    picked = errors.unavailable;
  } else {
    picked = errors.generic;
  }

  return {
    section,
    sectionLabel: getSectionLabel(section, language),
    summary: picked.summary,
    explanation: picked.explanation,
    technicalDetails,
  };
};

const COPY = {
  ua: {
    title: 'Сервісний екран модерації',
    subtitle: 'Повний контроль заявок, фото, новин і користувачів',
    accessGranted: 'Доступ підтверджено',
    accessPending: 'Очікується підтвердження email',
    accessDenied: 'Помилка',
    systemStatusHint: '',
    accessGrantedHint: '',
    accessPendingHint: '',
    accessDeniedHint: '',
    verifyHint: '',
    sendVerify: '',
    verificationFailed: '',
    refreshAccess: '',
    actionFailed: 'Не вдалося виконати дію модерації.',
    retryLoad: 'Оновити',
    viewIssues: 'Переглянути',
    loading: 'Завантаження...',
    noItems: 'Поки порожньо',
    partialLoad: 'Не всі розділи вдалося завантажити. Спробуйте оновити.',
    partialLoadHint: 'Відкрийте список, щоб побачити проблемні розділи та пояснення.',
    author: 'Автор',
    phone: 'Телефон',
    status: 'Статус',
    category: 'Категорія',
    approve: 'Схвалити',
    reject: 'Відхилити',
    delete: 'Видалити',
    deleteUser: 'Видалити користувача',
    building: 'Будинок',
    age: 'Вік',
    type: 'Тип',
    price: 'Ціна',
    workType: 'Тип роботи',
    pending: 'Очікує',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    serviceOwner: 'Власник сервісу',
    tools: 'Інструменти модерації',
    summary: 'Усі типи користувацького контенту зібрані в одному сервісному вікні.',
    suggestionsTitle: 'Пропозиції користувачів',
    suggestionsHint: 'Окремий розділ ідей для розвитку застосунку.',
    confirmApproveTitle: 'Підтвердити схвалення',
    confirmApproveMessage: 'Опублікувати цей матеріал?',
    confirmRejectTitle: 'Підтвердити відхилення',
    confirmRejectMessage: 'Відхилити цей матеріал і залишити його прихованим?',
    confirmDeleteTitle: 'Підтвердити видалення',
    confirmDeleteMessage: 'Запис буде видалено без швидкого відновлення.',
    confirmDeleteUserTitle: 'Видалити користувача',
    confirmDeleteUserMessage: 'Профіль буде повністю видалено із застосунку.',
    cancel: 'Скасувати',
    confirm: 'Підтвердити',
    updatedAt: 'Оновлено',
    searchPlaceholder: 'Пошук по імені, телефону, тексту...',
    approveAllPending: 'Схвалити всі очікуючі',
    suspicious: 'підозрілих',
    security: 'Безпека',
    server: 'Сервер',
    authDiagnostic: 'Діагностика Auth',
    runtimeMonitor: 'Монітор помилок',
    userErrors: 'Помилки користувачів',
    appVersion: 'Версія APP',
    securityHint: '',
  },
  ru: {
    title: 'Сервисный экран модерации',
    subtitle: 'Полный контроль заявок, фото, новостей и пользователей',
    accessGranted: 'Доступ подтвержден',
    accessPending: 'Ожидается подтверждение email',
    accessDenied: 'Ошибка',
    systemStatusHint: 'Статус системы показывает, открыт ли сейчас режим модерации.',
    accessGrantedHint: 'Почта подтверждена, все инструменты модерации активны.',
    accessPendingHint: 'Нужно подтвердить email, чтобы открыть действия модератора.',
    accessDeniedHint: '',
    verifyHint: '',
    sendVerify: '',
    verificationFailed: '',
    refreshAccess: '',
    actionFailed: 'Не удалось выполнить действие модерации.',
    retryLoad: 'Обновить',
    viewIssues: 'Просмотреть',
    loading: 'Загрузка...',
    noItems: 'Пока пусто',
    partialLoad: 'Не все разделы удалось загрузить. Попробуйте обновить.',
    partialLoadHint: 'Откройте список, чтобы увидеть проблемные разделы и пояснение причины.',
    author: 'Автор',
    phone: 'Телефон',
    status: 'Статус',
    category: 'Категория',
    approve: 'Одобрить',
    reject: 'Отклонить',
    delete: 'Удалить',
    deleteUser: 'Удалить пользователя',
    building: 'Дом',
    age: 'Возраст',
    type: 'Тип',
    price: 'Цена',
    workType: 'Тип работы',
    pending: 'Ожидает',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    serviceOwner: 'Владелец сервиса',
    tools: 'Инструменты модерации',
    summary: 'Все типы пользовательского контента собраны в одном сервисном окне.',
    suggestionsTitle: 'Предложения пользователей',
    suggestionsHint: 'Отдельный раздел идей для развития приложения.',
    confirmApproveTitle: 'Подтвердить одобрение',
    confirmApproveMessage: 'Опубликовать этот материал?',
    confirmRejectTitle: 'Подтвердить отклонение',
    confirmRejectMessage: 'Отклонить этот материал и оставить его скрытым?',
    confirmDeleteTitle: 'Подтвердить удаление',
    confirmDeleteMessage: 'Запись будет удалена без быстрого восстановления.',
    confirmDeleteUserTitle: 'Удалить пользователя',
    confirmDeleteUserMessage: 'Профиль будет полностью удален из приложения.',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    updatedAt: 'Обновлено',
    searchPlaceholder: 'Поиск по имени, телефону, тексту...',
    approveAllPending: 'Одобрить все ожидающие',
    suspicious: 'подозрительных',
    security: 'Безопасность',
    server: 'Сервер',
    authDiagnostic: 'Диагностика Auth',
    runtimeMonitor: 'Монитор ошибок',
    userErrors: 'Ошибки пользователей',
    appVersion: 'Версия APP',
    securityHint: 'Переход к экрану контроля безопасности и ограничений.',
  },
  en: {
    title: 'Service Moderation Console',
    subtitle: 'Full control of requests, photos, news, and users',
    accessGranted: 'Access confirmed',
    accessPending: 'Email confirmation pending',
    accessDenied: 'Error',
    systemStatusHint: '',
    accessGrantedHint: '',
    accessPendingHint: '',
    accessDeniedHint: '',
    verifyHint: '',
    sendVerify: '',
    verificationFailed: '',
    refreshAccess: '',
    actionFailed: 'Could not complete the moderation action.',
    retryLoad: 'Refresh',
    viewIssues: 'View',
    loading: 'Loading...',
    noItems: 'Nothing yet',
    partialLoad: 'Some sections could not be loaded. Please refresh.',
    partialLoadHint: 'Open the list to review affected sections and the reason.',
    author: 'Author',
    phone: 'Phone',
    status: 'Status',
    category: 'Category',
    approve: 'Approve',
    reject: 'Reject',
    delete: 'Delete',
    deleteUser: 'Delete user',
    building: 'Building',
    age: 'Age',
    type: 'Type',
    price: 'Price',
    workType: 'Work type',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    serviceOwner: 'Service owner',
    tools: 'Moderation tools',
    summary: 'All user-generated content is collected in one service console.',
    suggestionsTitle: 'User suggestions',
    suggestionsHint: 'A separate section for app improvement ideas.',
    confirmApproveTitle: 'Confirm approval',
    confirmApproveMessage: 'Publish this item?',
    confirmRejectTitle: 'Confirm rejection',
    confirmRejectMessage: 'Reject this item and keep it hidden?',
    confirmDeleteTitle: 'Confirm deletion',
    confirmDeleteMessage: 'This permanently removes the record without quick recovery.',
    confirmDeleteUserTitle: 'Delete user',
    confirmDeleteUserMessage: 'The profile will be permanently removed from the app.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    updatedAt: 'Updated',
    searchPlaceholder: 'Search by name, phone, text...',
    approveAllPending: 'Approve all pending',
    suspicious: 'suspicious',
    security: 'Security',
    server: 'Server',
    authDiagnostic: 'Auth Diagnostic',
    runtimeMonitor: 'Error monitor',
    userErrors: 'User errors',
    appVersion: 'App Version',
    securityHint: '',
  },
} as const;

const SECTION_ERRORS = {
  ua: {
    timeout:     { summary: 'Час очікування вичерпано',         explanation: 'Розділ відповідає надто довго. Зазвичай це повʼязано з повільною мережею або перевантаженням Firebase.' },
    permission:  { summary: 'Не вдалося завантажити дані',      explanation: 'Застосунок не зміг прочитати цей розділ. Найчастіше — проблема з правами доступу або правилами Firebase.' },
    network:     { summary: 'Проблема мережі',                  explanation: 'Дані не вдалося отримати з мережі. Можливо, тимчасовий обрив інтернету або нестабільна відповідь сервера.' },
    unavailable: { summary: 'Джерело розділу недоступне',       explanation: 'Розділ повернув порожню або неочікувану відповідь. Зазвичай це тимчасовий збій або неповна структура в базі.' },
    generic:     { summary: 'Помилка завантаження розділу',     explanation: 'Розділ не вдалося завантажити повністю. Причина може бути в мережі, правах доступу або тимчасовій помилці.' },
  },
  ru: {
    timeout:     { summary: 'Истекло время ожидания',           explanation: 'Раздел отвечает слишком долго. Обычно это связано с медленной сетью, перегрузкой Firebase или тяжелой выборкой данных.' },
    permission:  { summary: 'Не удалось загрузить данные',      explanation: 'Приложение не смогло прочитать этот раздел. Чаще всего причина в правах доступа или в правилах Firebase для этой ветки.' },
    network:     { summary: 'Проблема сети',                    explanation: 'Данные не удалось получить из сети. Это может быть временный обрыв интернета или нестабильный ответ сервера.' },
    unavailable: { summary: 'Источник раздела недоступен',      explanation: 'Раздел вернул пустой или неожиданный ответ. Обычно это означает временный сбой данных или неполную структуру в базе.' },
    generic:     { summary: 'Ошибка загрузки раздела',          explanation: 'Раздел не удалось загрузить полностью. Причина может быть в сети, правах доступа или во временной ошибке чтения данных.' },
  },
  en: {
    timeout:     { summary: 'Request timed out',                explanation: 'This section took too long to respond. Usually caused by a slow network, Firebase overload or heavy data query.' },
    permission:  { summary: 'Failed to load data',              explanation: 'The app could not read this section. Most often caused by access rights or Firebase rules for this branch.' },
    network:     { summary: 'Network problem',                  explanation: 'Data could not be fetched from the network. This may be a temporary internet outage or unstable server response.' },
    unavailable: { summary: 'Section source unavailable',       explanation: 'The section returned an empty or unexpected response. Usually indicates a temporary data issue or incomplete DB structure.' },
    generic:     { summary: 'Section failed to load',           explanation: 'The section could not be fully loaded. The cause may be network, access rights or a temporary read error.' },
  },
} as const;

function createSectionTimeoutPromise<T>(section: Tab, promise: Promise<T>): Promise<T> {
  return safePromiseTimeout(promise, SECTION_TIMEOUT_MS, `serviceModeration:${section}`);
}

const ServiceModerationScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = COPY[language];

  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<ModerationRequest[]>([]);
  const [suggestions, setSuggestions] = useState<AppSuggestion[]>([]);
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [buysell, setBuysell] = useState<BuySellListing[]>([]);
  const [contacts, setContacts] = useState<ContactListing[]>([]);
  const [business, setBusiness] = useState<LocalBusinessItem[]>([]);
  const [biznesChaika, setBiznesChaika] = useState<BiznesChaikaItem[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [lostfound, setLostfound] = useState<LostFoundItem[]>([]);
  const [osbbNews, setOsbbNews] = useState<ModerationOsbbNews[]>([]);
  const [osbbVotes, setOsbbVotes] = useState<NestedModerationItem[]>([]);
  const [osbbTopics, setOsbbTopics] = useState<NestedModerationItem[]>([]);
  const [osbbCollections, setOsbbCollections] = useState<NestedModerationItem[]>([]);
  const [users, setUsers] = useState<CommunityMember[]>([]);
  const [failedSectionIssues, setFailedSectionIssues] = useState<FailedSectionIssue[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ item: LocalBusinessItem } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const mountedRef = useRef(true);

  // Скидати пошук і фільтр при переключенні вкладки
  useEffect(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setStatusFilter('pending');
  }, [activeTab]);

  // Debounce пошуку 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Фільтрує будь-який масив об'єктів за пошуковим запитом і статусом.
  const filterItems = useCallback(<T extends object>(items: T[]): T[] => {
    let result = items;
    if (statusFilter !== 'all') {
      result = result.filter((item) => {
        const s = (item as Record<string, unknown>);
        const st = (s.moderationStatus ?? s.status ?? 'pending') as string;
        if (statusFilter === 'approved') return st === 'approved' || st === 'active';
        return st === statusFilter;
      });
    }
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return result;
    return result.filter((item) =>
      Object.values(item).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)),
    );
  }, [debouncedQuery, statusFilter]);

  // Підраховує pending/approved/rejected для поточної вкладки
  const tabStats = useMemo(() => {
    const dataMap: Partial<Record<Tab, Array<{ moderationStatus?: string; status?: string }>>> = {
      requests: requests as Array<{ status?: string }>,
      suggestions,
      photos: photos as Array<{ moderationStatus?: string }>,
      buysell: buysell as Array<{ moderationStatus?: string }>,
      contacts: contacts as Array<{ moderationStatus?: string }>,
      business: business as Array<{ status?: string }>,
      biznesChaika: biznesChaika as Array<{ moderationStatus?: string }>,
      jobs, lostfound,
      osbbnews: osbbNews as Array<{ moderationStatus?: string }>,
      osbbvotes: osbbVotes, osbbtopics: osbbTopics, osbbcollections: osbbCollections,
      users: users as Array<{ moderationStatus?: string; status?: string }>,
    };
    const items = dataMap[activeTab] ?? [];
    const getStatus = (i: { moderationStatus?: string; status?: string }) =>
      i.moderationStatus ?? i.status ?? 'pending';
    return {
      pending: items.filter((i) => getStatus(i) === 'pending').length,
      approved: items.filter((i) => getStatus(i) === 'approved' || getStatus(i) === 'active').length,
      rejected: items.filter((i) => getStatus(i) === 'rejected').length,
    };
  }, [activeTab, requests, suggestions, photos, buysell, contacts, business, biznesChaika, jobs, lostfound, osbbNews, osbbVotes, osbbTopics, osbbCollections]);

  // Кількість підозрілих номерів (3+ записів з одного телефону по всіх розділах)
  const suspiciousPhones = useMemo(() => {
    const counts: Record<string, number> = {};
    const addPhone = (phone?: string) => {
      if (phone) counts[phone] = (counts[phone] ?? 0) + 1;
    };
    requests.forEach((r) => addPhone(r.phone));
    buysell.forEach((r) => addPhone(r.phone));
    contacts.forEach((r) => addPhone(r.phone));
    jobs.forEach((r) => addPhone(r.phone));
    lostfound.forEach((r) => addPhone(r.phone));
    return new Set(Object.entries(counts).filter(([, count]) => count >= 3).map(([phone]) => phone));
  }, [requests, buysell, contacts, jobs, lostfound]);

  const suspiciousCount = useMemo(() => {
    return suspiciousPhones.size;
  }, [suspiciousPhones]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const confirmAction = useCallback((title: string, message: string) => new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: text.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: text.confirm, style: 'destructive', onPress: () => resolve(true) },
    ]);
  }), [text.cancel, text.confirm]);

  const loadAll = useCallback(async () => {
    if (mountedRef.current) {
      setRefreshing(true);
      setFailedSectionIssues([]);
    }

    try {
      const startedAt = Date.now();
      const [
        reqRes,
        suggestionRes,
        photoRes,
        buysellSnap,
        contactsSnap,
        businessSnap,
        biznesChaikaSnap,
        jobsSnap,
        lostSnap,
        osbbNewsSnap,
        osbbVotesSnap,
        osbbTopicsSnap,
        osbbCollectionsSnap,
        usersRes,
      ] = await safePromiseTimeout(
        Promise.allSettled([
          createSectionTimeoutPromise('requests', firebaseChatAPI.getRequestsPaginated({ limit: 300 })),
          createSectionTimeoutPromise('suggestions', appSuggestionsService.getSuggestionsOnce()),
          createSectionTimeoutPromise('photos', get(query(ref(database, 'community_photos'), limitToFirst(200)))),
          createSectionTimeoutPromise('buysell', get(query(ref(database, 'buy_sell_listings'), limitToFirst(200)))),
          createSectionTimeoutPromise('contacts', get(query(ref(database, 'contacts_listings'), limitToFirst(200)))),
          createSectionTimeoutPromise('business', get(query(ref(database, 'local_business'), limitToFirst(200)))),
          createSectionTimeoutPromise('biznesChaika', get(query(ref(database, 'biznes_chaika_listings'), limitToFirst(200)))),
          createSectionTimeoutPromise('jobs', get(query(ref(database, 'job_listings'), limitToFirst(200)))),
          createSectionTimeoutPromise('lostfound', get(query(ref(database, 'lost_found'), limitToFirst(200)))),
          createSectionTimeoutPromise('osbbnews', get(query(ref(database, 'osbb_news'), limitToFirst(200)))),
          createSectionTimeoutPromise('osbbvotes', get(query(ref(database, 'osbb_votes'), limitToFirst(200)))),
          createSectionTimeoutPromise('osbbtopics', get(query(ref(database, 'osbb_house_topics'), limitToFirst(200)))),
          createSectionTimeoutPromise('osbbcollections', get(query(ref(database, 'osbb_collections'), limitToFirst(200)))),
          createSectionTimeoutPromise('users', communityUsersAPI.getUsersOnce()),
        ]),
        LOAD_ALL_EMERGENCY_TIMEOUT_MS,
        'serviceModeration:loadAll',
      );

      const warnings: FailedSectionIssue[] = [];

      const pushWarning = (section: Tab, reason: unknown) => {
        warnings.push(buildFailedSectionIssue(section, reason, language));
        if (isSafePromiseTimeoutError(reason)) {
          void logClientError('ServiceModerationScreen.loadAll.timeout', reason, {
            section,
            timeout_ms: reason.timeoutMs,
          });
          return;
        }
        void logClientError('ServiceModerationScreen.loadAll.sectionFailed', reason, {
          section,
        });
      };

      if (reqRes.status === 'fulfilled' && reqRes.value.success && reqRes.value.data) {
        const nextRequests = reqRes.value.data.map((item) => ({
          id: item.id,
          name: item.name,
          text: item.text ?? item.description,
          phone: item.phone,
          category: item.category,
          status: item.status ?? (item.isApproved ? 'approved' : 'pending'),
          resolutionStatus: item.resolutionStatus,
        }));
        if (mountedRef.current) {
          setRequests(nextRequests);
        }
      } else {
        pushWarning('requests', reqRes.status === 'rejected' ? reqRes.reason : 'requests_unavailable');
      }

      if (suggestionRes.status === 'fulfilled') {
        if (mountedRef.current) {
          setSuggestions(suggestionRes.value);
        }
      } else {
        pushWarning('suggestions', suggestionRes.status === 'rejected' ? suggestionRes.reason : 'suggestions_unavailable');
      }

      if (photoRes.status === 'fulfilled' && photoRes.value.exists()) {
        const raw = photoRes.value.val() as Record<string, Record<string, unknown>>;
        const nextPhotos: CommunityPhoto[] = Object.entries(raw).map(([id, value]) => ({
          id,
          title: typeof value.title === 'string' ? value.title : '',
          description: typeof value.description === 'string' ? value.description : '',
          imageUri: typeof value.imageUri === 'string' ? value.imageUri : '',
          storagePath: typeof value.storagePath === 'string' ? value.storagePath : undefined,
          uploadedBy: typeof value.uploadedBy === 'string' ? value.uploadedBy : '',
          createdAt: new Date(typeof value.uploadedAt === 'number' ? value.uploadedAt : 0),
          status: (value.status === 'approved' || value.status === 'rejected' ? value.status : 'pending') as 'pending' | 'approved' | 'rejected',
          target: (value.target === 'my_photos' ? 'my_photos' : 'gallery_public') as CommunityPhoto['target'],
          likes: 0,
          moderationReason: typeof value.moderationReason === 'string' ? value.moderationReason : undefined,
        })).filter(isPublicGalleryPhoto);
        if (mountedRef.current) {
          setPhotos(nextPhotos);
        }
      } else if (photoRes.status === 'fulfilled') {
        if (mountedRef.current) {
          setPhotos([]);
        }
      } else {
        pushWarning('photos', photoRes.status === 'rejected' ? photoRes.reason : 'photos_unavailable');
      }

      if (buysellSnap.status === 'fulfilled' && buysellSnap.value.exists()) {
        const raw = buysellSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextBuySell = Object.entries(raw).map(([id, value]) => ({ ...(value as Omit<BuySellListing, 'id'>), id }));
        if (mountedRef.current) {
          setBuysell(nextBuySell);
        }
      } else if (buysellSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setBuysell([]);
        }
      } else if (buysellSnap.status === 'rejected') {
        pushWarning('buysell', buysellSnap.reason);
      }

      if (contactsSnap.status === 'fulfilled' && contactsSnap.value.exists()) {
        const raw = contactsSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextContacts = Object.entries(raw).map(([id, value]) => ({ ...(value as Omit<ContactListing, 'id'>), id }));
        if (mountedRef.current) {
          setContacts(nextContacts);
        }
      } else if (contactsSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setContacts([]);
        }
      } else if (contactsSnap.status === 'rejected') {
        pushWarning('contacts', contactsSnap.reason);
      }

      if (businessSnap.status === 'fulfilled' && businessSnap.value.exists()) {
        const raw = businessSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextBusiness = Object.entries(raw).map(([id, value]) => ({
          ...(value as Omit<LocalBusinessItem, 'id'>),
          id,
          status: typeof value.status === 'string' ? value.status : 'pending',
        }));
        if (mountedRef.current) {
          setBusiness(nextBusiness);
        }
      } else if (businessSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setBusiness([]);
        }
      } else if (businessSnap.status === 'rejected') {
        pushWarning('business', businessSnap.reason);
      }

      if (biznesChaikaSnap.status === 'fulfilled' && biznesChaikaSnap.value.exists()) {
        const raw = biznesChaikaSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextBiznesChaika = Object.entries(raw).map(([id, value]) => ({
          ...(value as Omit<BiznesChaikaItem, 'id'>),
          id,
          moderationStatus: typeof value.moderationStatus === 'string' ? value.moderationStatus : 'pending',
        }));
        if (mountedRef.current) {
          setBiznesChaika(nextBiznesChaika);
        }
      } else if (biznesChaikaSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setBiznesChaika([]);
        }
      } else if (biznesChaikaSnap.status === 'rejected') {
        pushWarning('biznesChaika', biznesChaikaSnap.reason);
      }

      if (jobsSnap.status === 'fulfilled' && jobsSnap.value.exists()) {
        const raw = jobsSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextJobs = Object.entries(raw).map(([id, value]) => ({ ...(value as Omit<JobListing, 'id'>), id }));
        if (mountedRef.current) {
          setJobs(nextJobs);
        }
      } else if (jobsSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setJobs([]);
        }
      } else if (jobsSnap.status === 'rejected') {
        pushWarning('jobs', jobsSnap.reason);
      }

      if (lostSnap.status === 'fulfilled' && lostSnap.value.exists()) {
        const raw = lostSnap.value.val() as Record<string, Record<string, unknown>>;
        const nextLostFound = Object.entries(raw).map(([id, value]) => ({ ...(value as Omit<LostFoundItem, 'id'>), id }));
        if (mountedRef.current) {
          setLostfound(nextLostFound);
        }
      } else if (lostSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setLostfound([]);
        }
      } else if (lostSnap.status === 'rejected') {
        pushWarning('lostfound', lostSnap.reason);
      }

      if (osbbNewsSnap.status === 'fulfilled' && osbbNewsSnap.value.exists()) {
        const raw = osbbNewsSnap.value.val() as Record<string, Record<string, Record<string, unknown>>>;
        const nextNews = Object.entries(raw).flatMap(([buildingId, newsById]) =>
          Object.entries(newsById || {}).map(([id, value]) => ({
            ...(value as Omit<ModerationOsbbNews, 'id' | 'buildingId'>),
            id,
            buildingId,
          })),
        );
        if (mountedRef.current) {
          setOsbbNews(nextNews);
        }
      } else if (osbbNewsSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setOsbbNews([]);
        }
      } else if (osbbNewsSnap.status === 'rejected') {
        pushWarning('osbbnews', osbbNewsSnap.reason);
      }

      if (osbbVotesSnap.status === 'fulfilled' && osbbVotesSnap.value.exists()) {
        if (mountedRef.current) {
          setOsbbVotes(flattenNestedModeration(osbbVotesSnap.value.val()));
        }
      } else if (osbbVotesSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setOsbbVotes([]);
        }
      } else if (osbbVotesSnap.status === 'rejected') {
        pushWarning('osbbvotes', osbbVotesSnap.reason);
      }

      if (osbbTopicsSnap.status === 'fulfilled' && osbbTopicsSnap.value.exists()) {
        if (mountedRef.current) {
          setOsbbTopics(flattenNestedModeration(osbbTopicsSnap.value.val()));
        }
      } else if (osbbTopicsSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setOsbbTopics([]);
        }
      } else if (osbbTopicsSnap.status === 'rejected') {
        pushWarning('osbbtopics', osbbTopicsSnap.reason);
      }

      if (osbbCollectionsSnap.status === 'fulfilled' && osbbCollectionsSnap.value.exists()) {
        if (mountedRef.current) {
          setOsbbCollections(flattenNestedModeration(osbbCollectionsSnap.value.val()));
        }
      } else if (osbbCollectionsSnap.status === 'fulfilled') {
        if (mountedRef.current) {
          setOsbbCollections([]);
        }
      } else if (osbbCollectionsSnap.status === 'rejected') {
        pushWarning('osbbcollections', osbbCollectionsSnap.reason);
      }

      if (usersRes.status === 'fulfilled' && usersRes.value.success && usersRes.value.data) {
        const nextUsers = usersRes.value.data.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          building: item.building,
          houseNumber: item.houseNumber,
          registeredAt: item.registeredAt,
        }));
        if (mountedRef.current) {
          setUsers(nextUsers);
        }
      } else {
        pushWarning('users', usersRes.status === 'rejected' ? usersRes.reason : 'users_unavailable');
      }

      if (mountedRef.current) {
        setLastUpdatedAt(new Date().toLocaleString(language === 'en' ? 'en-US' : language === 'ua' ? 'uk-UA' : 'ru-RU'));
        setFailedSectionIssues(warnings);
        setInitialLoaded(true);
      }
      void logClientEvent('service_moderation_load_complete', {
        duration_ms: Date.now() - startedAt,
        failed_sections: warnings.map((item) => item.section),
      });
    } catch (error) {
      void logClientError('ServiceModerationScreen.loadAll.emergencyTimeout', error, {
        timeout_ms: LOAD_ALL_EMERGENCY_TIMEOUT_MS,
      });
      if (mountedRef.current) {
        setFailedSectionIssues((current) => {
          const nextIssues = TABS.map((item) => buildFailedSectionIssue(item.key, error, language));
          const merged = new Map<Tab, FailedSectionIssue>();
          [...current, ...nextIssues].forEach((issue) => {
            merged.set(issue.section, issue);
          });
          return Array.from(merged.values());
        });
      }
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [language]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const statusLabel = useCallback((status?: string) => {
    if (status === 'approved' || status === 'active') return text.approved;
    if (status === 'rejected') return text.rejected;
    return text.pending;
  }, [text.approved, text.pending, text.rejected]);

  const resolutionLabel = useCallback((status?: ProblemResolutionStatus) => {
    if (status === 'in_progress') return language === 'en' ? 'In progress' : language === 'ru' ? 'В работе' : 'В роботі';
    if (status === 'resolved') return language === 'en' ? 'Resolved' : language === 'ru' ? 'Решено' : 'Вирішено';
    if (status === 'rejected') return language === 'en' ? 'Declined' : language === 'ru' ? 'Отклонено' : 'Відхилено';
    return language === 'en' ? 'New' : language === 'ru' ? 'Новая' : 'Нова';
  }, [language]);

  const updateProblemResolution = useCallback(async (id: string, status: ProblemResolutionStatus) => {
    const now = Date.now();
    await update(ref(database, `requests/${id}`), {
      resolutionStatus: status,
      resolutionStatusUpdatedAt: now,
      resolvedAt: status === 'resolved' ? now : null,
    });
  }, []);

  // Схвалити всі pending заявки разом
  const handleBulkApprovePending = useCallback(() => {
    const pending = requests.filter((r) => !r.status || r.status === 'pending');
    if (!pending.length) return;
    Alert.alert(
      text.approveAllPending,
      `${pending.length} ${text.pending}?`,
      [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.confirm,
          onPress: () => {
            void (async () => {
              let failedCount = 0;
              for (const item of pending) {
                const result = await firebaseChatAPI.moderateRequest(item.id, 'approved');
                if (!result.success) {
                  failedCount += 1;
                }
              }
              if (failedCount > 0) {
                Alert.alert(text.actionFailed, `${failedCount} ${text.pending} failed to approve.`);
              }
              void loadAll();
            })();
          },
        },
      ],
    );
  }, [loadAll, requests, text]);

  // Bulk approve для будь-якої вкладки
  const handleBulkApproveTab = useCallback(() => {
    const getTabPendingIds = (): string[] => {
      const isPending = (s?: string) => !s || s === 'pending';
      switch (activeTab) {
        case 'photos': return photos.filter((i) => isPending(i.status)).map((i) => i.id);
        case 'buysell': return buysell.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        case 'contacts': return contacts.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        case 'jobs': return jobs.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        case 'lostfound': return lostfound.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        case 'suggestions': return suggestions.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        case 'biznesChaika': return biznesChaika.filter((i) => isPending(i.moderationStatus)).map((i) => i.id);
        default: return [];
      }
    };
    const pendingIds = getTabPendingIds();
    if (!pendingIds.length) return;
    Alert.alert(
      text.approveAllPending,
      `${pendingIds.length} ${text.pending}?`,
      [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.confirm,
          onPress: () => {
            void (async () => {
              for (const id of pendingIds) {
                applyOptimisticStatus(activeTab, id, 'approved');
              }
              try {
                const updates: Record<string, unknown> = {};
                if (activeTab === 'photos') {
                  pendingIds.forEach((id) => { updates[`community_photos/${id}/status`] = 'approved'; updates[`community_photos/${id}/moderatedAt`] = Date.now(); });
                  await update(ref(database), updates);
                } else if (activeTab === 'suggestions') {
                  for (const id of pendingIds) await appSuggestionsService.moderateSuggestion(id, 'approved');
                } else if (activeTab === 'buysell') {
                  for (const id of pendingIds) await buySellService.moderate(id, 'approved');
                } else if (activeTab === 'contacts') {
                  for (const id of pendingIds) await contactsService.moderate(id, 'approved');
                } else if (activeTab === 'jobs') {
                  for (const id of pendingIds) await jobService.moderate(id, 'approved');
                } else if (activeTab === 'lostfound') {
                  for (const id of pendingIds) await lostFoundService.moderate(id, 'approved');
                } else if (activeTab === 'biznesChaika') {
                  for (const id of pendingIds) await moderateBiznesChaika(id, 'approved');
                }
              } catch {
                void loadAll();
              }
            })();
          },
        },
      ],
    );
  }, [activeTab, applyOptimisticStatus, biznesChaika, buysell, contacts, jobs, loadAll, lostfound, moderateBiznesChaika, photos, suggestions, text]);

  // Оновлює статус одного елемента в потрібному масиві без перезавантаження всього
  const applyOptimisticStatus = useCallback((tab: Tab, id: string, status: string) => {
    const patch = <T extends { id: string }>(arr: T[], key: 'status' | 'moderationStatus') =>
      arr.map((item) => item.id === id ? { ...item, [key]: status } : item);
    switch (tab) {
      case 'requests': setRequests((p) => patch(p, 'status')); break;
      case 'suggestions': setSuggestions((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'photos': setPhotos((p) => patch(p, 'status') as typeof p); break;
      case 'buysell': setBuysell((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'contacts': setContacts((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'business': setBusiness((p) => patch(p, 'status')); break;
      case 'biznesChaika': setBiznesChaika((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'jobs': setJobs((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'lostfound': setLostfound((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'osbbnews': setOsbbNews((p) => patch(p, 'moderationStatus') as typeof p); break;
      case 'osbbvotes': setOsbbVotes((p) => patch(p, 'moderationStatus')); break;
      case 'osbbtopics': setOsbbTopics((p) => patch(p, 'moderationStatus')); break;
      case 'osbbcollections': setOsbbCollections((p) => patch(p, 'moderationStatus')); break;
      default: break;
    }
  }, []);

  const runAction = useCallback(async (
    id: string,
    action: () => Promise<void>,
    options?: { confirmTitle?: string; confirmMessage?: string; optimisticStatus?: string },
  ) => {
    if (busyId) return;

    if (options?.confirmTitle && options?.confirmMessage) {
      const confirmed = await confirmAction(options.confirmTitle, options.confirmMessage);
      if (!confirmed) {
        return;
      }
    }

    if (mountedRef.current) {
      setBusyId(id);
      if (options?.optimisticStatus) {
        applyOptimisticStatus(activeTab, id, options.optimisticStatus);
      }
    }

    try {
      await action();
      // Повна перезагрузка тільки при видаленні (не при зміні статусу)
      if (!options?.optimisticStatus) {
        await loadAll();
      }
    } catch (error) {
      // Відкат оптимістичного оновлення при помилці
      if (options?.optimisticStatus) {
        await loadAll();
      }
      safeLogError('ServiceModerationScreen.runAction', error, {
        itemId: id,
      });
      const msg = error instanceof Error ? error.message : text.actionFailed;
      Alert.alert(text.actionFailed, msg);
    } finally {
      if (mountedRef.current) {
        setBusyId(null);
      }
    }
  }, [activeTab, applyOptimisticStatus, busyId, confirmAction, loadAll, text.actionFailed]);

  const moderateNested = useCallback(async (path: string, item: NestedModerationItem, status: 'approved' | 'rejected') => {
    await update(ref(database, `${path}/${item.buildingId}/${item.id}`), {
      moderationStatus: status,
      moderatedAt: new Date().toISOString(),
    });
  }, []);

  const deleteNested = useCallback(async (path: string, item: NestedModerationItem) => {
    await remove(ref(database, `${path}/${item.buildingId}/${item.id}`));
  }, []);

  const moderateBusiness = useCallback(async (id: string, status: 'active' | 'rejected', moderationReason = '') => {
    await update(ref(database, `local_business/${id}`), {
      status,
      moderatedAt: new Date().toISOString(),
      moderatedBy: auth.currentUser?.uid ?? 'service_owner',
      moderationReason: status === 'rejected' ? moderationReason.trim() || 'Needs changes before publication' : null,
    });
  }, []);

  const rejectBusinessWithReason = useCallback((item: LocalBusinessItem) => {
    setRejectReason('');
    setRejectModal({ item });
  }, []);

  const handleRejectModalConfirm = useCallback(() => {
    if (!rejectModal) return;
    const { item } = rejectModal;
    setRejectModal(null);
    void runAction(item.id, () => moderateBusiness(item.id, 'rejected', rejectReason.trim() || 'Rejected by moderator'), {});
  }, [rejectModal, rejectReason, runAction, moderateBusiness]);

  const moderateBiznesChaika = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    await update(ref(database, `biznes_chaika_listings/${id}`), {
      moderationStatus: status,
      moderatedAt: new Date().toISOString(),
      moderatedBy: auth.currentUser?.uid ?? 'service_owner',
    });
  }, []);

  const counts = useMemo<Record<Tab, number>>(() => ({
    requests: requests.length,
    suggestions: suggestions.length,
    photos: photos.length,
    buysell: buysell.length,
    contacts: contacts.length,
    business: business.length,
    biznesChaika: biznesChaika.length,
    jobs: jobs.length,
    lostfound: lostfound.length,
    osbbnews: osbbNews.length,
    osbbvotes: osbbVotes.length,
    osbbtopics: osbbTopics.length,
    osbbcollections: osbbCollections.length,
    users: users.length,
  }), [business.length, biznesChaika.length, buysell.length, contacts.length, jobs.length, lostfound.length, osbbCollections.length, osbbNews.length, osbbTopics.length, osbbVotes.length, photos.length, requests.length, suggestions.length, users.length]);

  const ActionButton = ({
    id,
    label,
    tone,
    onPress,
  }: {
    id: string;
    label: string;
    tone: 'approve' | 'reject' | 'delete' | 'neutral';
    onPress: () => void;
    allowWhenLocked?: boolean;
  }) => {
    const buttonHint = language === 'ru'
      ? (() => {
          if (tone === 'approve') return 'Публикует материал и делает его активным.';
          if (tone === 'reject') return 'Отклоняет материал и оставляет его скрытым.';
          if (tone === 'delete') return 'Удаляет запись без быстрого восстановления.';
          return 'Служебное действие для текущего раздела.';
        })()
      : null;

    return (
      <View style={styles.actionWrap}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            tone === 'approve' && styles.approveBtn,
            tone === 'reject' && styles.rejectBtn,
            tone === 'delete' && styles.deleteBtn,
            tone === 'neutral' && styles.neutralBtn,
          ]}
          onPress={onPress}
          disabled={busyId === id}
          activeOpacity={0.85}
        >
          {busyId === id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionBtnText}>{label}</Text>}
        </TouchableOpacity>
        {buttonHint ? <Text style={styles.actionHint}>{buttonHint}</Text> : null}
      </View>
    );
  };

  const renderRequests = () => (
    <FlatList
      data={filterItems(requests)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListHeaderComponent={suspiciousCount > 0 ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>{text.suspicious}</Text>
          <Text style={styles.noticeText}>Показано заявки, у яких один і той самий контакт повторюється 3+ рази.</Text>
        </View>
      ) : null}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        (() => {
          const phone = item.phone ?? '';
          const isSuspicious = Boolean(phone) && suspiciousPhones.has(phone);
          return (
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={3}>{item.text || '—'}</Text>
          <Text style={styles.cardMeta}>{text.author}: {item.name || '—'}</Text>
          {item.category ? <Text style={styles.cardMeta}>{text.category}: {item.category}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          {isSuspicious ? <Text style={styles.suspiciousBadge}>⚠ {text.suspicious}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.status)}</Text>
          {item.category === 'problem' && item.status === 'approved' ? (
            <>
              <Text style={styles.cardMeta}>
                {language === 'en' ? 'Problem status' : language === 'ru' ? 'Статус решения' : 'Статус вирішення'}: {resolutionLabel(item.resolutionStatus)}
              </Text>
              <View style={styles.actions}>
                <ActionButton
                  id={item.id}
                  label={language === 'en' ? 'In work' : language === 'ru' ? 'В работу' : 'В роботу'}
                  tone="neutral"
                  onPress={() => void runAction(item.id, () => updateProblemResolution(item.id, 'in_progress'))}
                />
                <ActionButton
                  id={item.id}
                  label={language === 'en' ? 'Resolved' : language === 'ru' ? 'Решено' : 'Вирішено'}
                  tone="approve"
                  onPress={() => void runAction(item.id, () => updateProblemResolution(item.id, 'resolved'))}
                />
                <ActionButton
                  id={item.id}
                  label={language === 'en' ? 'Declined' : language === 'ru' ? 'Отклонено' : 'Відхилено'}
                  tone="reject"
                  onPress={() => void runAction(item.id, () => updateProblemResolution(item.id, 'rejected'))}
                />
              </View>
            </>
          ) : null}
          <View style={styles.actions}>
            {item.status !== 'approved' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id, async () => {
                  const result = await firebaseChatAPI.moderateRequest(item.id, 'approved');
                  if (!result.success) throw new Error(result.error);
                }, { confirmTitle: text.confirmApproveTitle, confirmMessage: text.confirmApproveMessage, optimisticStatus: 'approved' })}
              />
            ) : null}
            {item.status !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => void runAction(item.id, async () => {
                  const result = await firebaseChatAPI.moderateRequest(item.id, 'rejected');
                  if (!result.success) throw new Error(result.error);
                }, { confirmTitle: text.confirmRejectTitle, confirmMessage: text.confirmRejectMessage, optimisticStatus: 'rejected' })}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id, async () => {
                const result = await firebaseChatAPI.deleteRequest(item.id);
                if (!result.success) throw new Error(result.error);
              }, { confirmTitle: text.confirmDeleteTitle, confirmMessage: text.confirmDeleteMessage })}
            />
          </View>
        </View>
          );
        })()
      )}
    />
  );

  const renderSuggestions = () => (
    <FlatList
      data={filterItems(suggestions)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListHeaderComponent={(
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>{text.suggestionsTitle}</Text>
          <Text style={styles.noticeText}>{text.suggestionsHint}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={4}>{item.text || '—'}</Text>
          <Text style={styles.cardMeta}>{language === 'ua' ? 'Автор ідеї' : language === 'ru' ? 'Автор идеи' : 'Idea author'}: {item.name || '—'}</Text>
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            {item.moderationStatus !== 'approved' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id, async () => {
                  await appSuggestionsService.moderateSuggestion(item.id, 'approved');
                }, { confirmTitle: text.confirmApproveTitle, confirmMessage: text.confirmApproveMessage })}
              />
            ) : null}
            {item.moderationStatus !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => void runAction(item.id, async () => {
                  await appSuggestionsService.moderateSuggestion(item.id, 'rejected');
                }, { confirmTitle: text.confirmRejectTitle, confirmMessage: text.confirmRejectMessage })}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id, async () => {
                await appSuggestionsService.deleteSuggestion(item.id);
              }, { confirmTitle: text.confirmDeleteTitle, confirmMessage: text.confirmDeleteMessage })}
            />
          </View>
        </View>
      )}
    />
  );

  const renderPhotos = () => (
    <FlatList
      data={filterItems(photos)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <AppPhotoImage
            uri={item.storagePath ? '' : (typeof item.imageUri === 'string' ? item.imageUri : '')}
            storagePath={item.storagePath}
            style={styles.photoThumb}
            resizeMode="cover"
            debugLabel={`ServiceModeration:photo:${item.id}`}
          />
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>{text.author}: {item.uploadedBy}</Text>
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.status)}</Text>
          <View style={styles.actions}>
            {item.status !== 'approved' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id,
                  () => update(ref(database, `community_photos/${item.id}`), { status: 'approved', moderatedAt: Date.now() }),
                  { confirmTitle: text.confirmApproveTitle, confirmMessage: text.confirmApproveMessage, optimisticStatus: 'approved' })}
              />
            ) : null}
            {item.status !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => void runAction(item.id,
                  () => update(ref(database, `community_photos/${item.id}`), { status: 'rejected', moderatedAt: Date.now() }),
                  { confirmTitle: text.confirmRejectTitle, confirmMessage: text.confirmRejectMessage, optimisticStatus: 'rejected' })}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id,
                () => remove(ref(database, `community_photos/${item.id}`)),
                { confirmTitle: text.confirmDeleteTitle, confirmMessage: text.confirmDeleteMessage })}
            />
          </View>
        </View>
      )}
    />
  );

  const renderModeratedList = <T extends { id: string; moderationStatus?: string }>(
    data: T[],
    body: (item: T) => React.ReactNode,
    approve: (id: string) => Promise<void>,
    reject: (id: string) => Promise<void>,
    destroy: (id: string) => Promise<void>,
  ) => (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {body(item)}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            {item.moderationStatus !== 'approved' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id, () => approve(item.id), {
                  confirmTitle: text.confirmApproveTitle,
                  confirmMessage: text.confirmApproveMessage,
                  optimisticStatus: 'approved',
                })}
              />
            ) : null}
            {item.moderationStatus !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => void runAction(item.id, () => reject(item.id), {
                  confirmTitle: text.confirmRejectTitle,
                  confirmMessage: text.confirmRejectMessage,
                  optimisticStatus: 'rejected',
                })}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id, () => destroy(item.id), {
                confirmTitle: text.confirmDeleteTitle,
                confirmMessage: text.confirmDeleteMessage,
              })}
            />
          </View>
        </View>
      )}
    />
  );

  const renderBusiness = () => (
    <FlatList
      data={filterItems(business)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.contactName || '-'}</Text>
          {item.categoryLabel ? <Text style={styles.cardMeta}>{text.category}: {item.categoryLabel}</Text> : null}
          {item.subcategoryLabel ? <Text style={styles.cardMeta}>{text.type}: {item.subcategoryLabel}</Text> : null}
          {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.status)}</Text>
          {item.moderatedAt ? <Text style={styles.cardMeta}>Updated: {item.moderatedAt}</Text> : null}
          {item.moderationReason ? <Text style={styles.cardMeta}>Reason: {item.moderationReason}</Text> : null}
          <View style={styles.actions}>
            {item.status !== 'active' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id, () => moderateBusiness(item.id, 'active'), {
                  confirmTitle: text.confirmApproveTitle,
                  confirmMessage: text.confirmApproveMessage,
                })}
              />
            ) : null}
            {item.status !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => rejectBusinessWithReason(item)}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id, () => remove(ref(database, `local_business/${item.id}`)), {
                confirmTitle: text.confirmDeleteTitle,
                confirmMessage: text.confirmDeleteMessage,
              })}
            />
          </View>
        </View>
      )}
    />
  );

  const renderNestedModeration = (data: NestedModerationItem[], path: string) => (
    <FlatList
      data={filterItems(data)}
      keyExtractor={(item) => `${item.buildingId}:${item.id}`}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title || item.question || item.description || '-'}</Text>
          <Text style={styles.cardMeta}>{text.building}: {item.buildingId}</Text>
          {item.question ? <Text style={styles.cardMeta}>{item.question}</Text> : null}
          {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
          {item.paymentUrl ? <Text style={styles.cardMeta}>{item.paymentUrl}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            {item.moderationStatus !== 'approved' ? (
              <ActionButton
                id={item.id}
                label={text.approve}
                tone="approve"
                onPress={() => void runAction(item.id, () => moderateNested(path, item, 'approved'), {
                  confirmTitle: text.confirmApproveTitle,
                  confirmMessage: text.confirmApproveMessage,
                })}
              />
            ) : null}
            {item.moderationStatus !== 'rejected' ? (
              <ActionButton
                id={item.id}
                label={text.reject}
                tone="reject"
                onPress={() => void runAction(item.id, () => moderateNested(path, item, 'rejected'), {
                  confirmTitle: text.confirmRejectTitle,
                  confirmMessage: text.confirmRejectMessage,
                })}
              />
            ) : null}
            <ActionButton
              id={item.id}
              label={text.delete}
              tone="delete"
              onPress={() => void runAction(item.id, () => deleteNested(path, item), {
                confirmTitle: text.confirmDeleteTitle,
                confirmMessage: text.confirmDeleteMessage,
              })}
            />
          </View>
        </View>
      )}
    />
  );

  const renderUsers = () => (
    <FlatList
      data={filterItems(users)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListHeaderComponent={<View style={styles.noteCard}><Text style={styles.noteTitle}>{text.tools}</Text></View>}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => {
        const isOwner = auth.currentUser?.uid === item.id;

        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name || '—'}</Text>
            {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            {(item.building || item.houseNumber) ? (
              <Text style={styles.cardMeta}>{text.building}: {[item.building, item.houseNumber].filter(Boolean).join(' ')}</Text>
            ) : null}
            {isOwner ? <Text style={styles.ownerBadge}>{text.serviceOwner}</Text> : null}
            <View style={styles.actions}>
              {!isOwner ? (
                <ActionButton
                  id={item.id}
                  label={text.deleteUser}
                  tone="delete"
                  onPress={() => void runAction(item.id, async () => {
                    await deleteCommunityUser({ id: item.id, name: item.name, phone: item.phone });
                  }, { confirmTitle: text.confirmDeleteUserTitle, confirmMessage: text.confirmDeleteUserMessage })}
                />
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'requests':
        return renderRequests();
      case 'suggestions':
        return renderSuggestions();
      case 'photos':
        return renderPhotos();
      case 'buysell':
        return renderModeratedList(
          filterItems(buysell),
          (item) => (
            <>
              <Text style={styles.cardTitle}>{item.itemName || '—'}</Text>
              <Text style={styles.cardMeta}>{text.category}: {item.category}</Text>
              {item.price ? <Text style={styles.cardMeta}>{text.price}: {item.price}</Text> : null}
              {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            </>
          ),
          (id) => buySellService.moderate(id, 'approved'),
          (id) => buySellService.moderate(id, 'rejected'),
          (id) => buySellService.remove(id),
        );
      case 'contacts':
        return renderModeratedList(
          filterItems(contacts),
          (item) => (
            <>
              <Text style={styles.cardTitle}>{item.itemName || '—'}</Text>
              <Text style={styles.cardMeta}>{text.category}: {item.category}</Text>
              {item.price ? <Text style={styles.cardMeta}>{text.price}: {item.price}</Text> : null}
              {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            </>
          ),
          (id) => contactsService.moderate(id, 'approved'),
          (id) => contactsService.moderate(id, 'rejected'),
          (id) => contactsService.remove(id),
        );
      case 'business':
        return renderBusiness();
      case 'biznesChaika':
        return renderModeratedList(
          filterItems(biznesChaika),
          (item) => (
            <>
              <Text style={styles.cardTitle}>{item.itemName || item.contactName || '—'}</Text>
              {item.category ? <Text style={styles.cardMeta}>{text.category}: {item.category}</Text> : null}
              {item.description ? <Text style={styles.cardMeta}>{item.description}</Text> : null}
              {item.price ? <Text style={styles.cardMeta}>{text.price}: {item.price}</Text> : null}
              {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            </>
          ),
          (id) => moderateBiznesChaika(id, 'approved'),
          (id) => moderateBiznesChaika(id, 'rejected'),
          (id) => remove(ref(database, `biznes_chaika_listings/${id}`)),
        );
      case 'jobs':
        return renderModeratedList(
          filterItems(jobs),
          (item) => (
            <>
              <Text style={styles.cardTitle}>{item.name || '—'}</Text>
              <Text style={styles.cardMeta}>{text.workType}: {item.workType}</Text>
              {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            </>
          ),
          (id) => jobService.moderate(id, 'approved'),
          (id) => jobService.moderate(id, 'rejected'),
          (id) => jobService.remove(id),
        );
      case 'lostfound':
        return renderModeratedList(
          filterItems(lostfound),
          (item) => (
            <>
              <Text style={styles.cardTitle}>{item.name || '—'}</Text>
              <Text style={styles.cardMeta}>{text.type}: {item.type}</Text>
              {item.category ? <Text style={styles.cardMeta}>{text.category}: {item.category}</Text> : null}
              {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
            </>
          ),
          (id) => lostFoundService.moderate(id, 'approved'),
          (id) => lostFoundService.moderate(id, 'rejected'),
          (id) => lostFoundService.remove(id),
        );
      case 'osbbnews':
        return (
          <FlatList
            data={filterItems(osbbNews)}
            keyExtractor={(item) => `${item.buildingId}:${item.id}`}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
            ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.title || '—'}</Text>
                <Text style={styles.cardMeta}>{text.category}: {item.buildingId}</Text>
                <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
                <View style={styles.actions}>
                  {item.moderationStatus !== 'approved' ? (
                    <ActionButton
                      id={item.id}
                      label={text.approve}
                      tone="approve"
                      onPress={() => void runAction(item.id, () => moderateOsbbNews(item.buildingId, item.id, 'approved'), {
                        confirmTitle: text.confirmApproveTitle,
                        confirmMessage: text.confirmApproveMessage,
                      })}
                    />
                  ) : null}
                  {item.moderationStatus !== 'rejected' ? (
                    <ActionButton
                      id={item.id}
                      label={text.reject}
                      tone="reject"
                      onPress={() => void runAction(item.id, () => moderateOsbbNews(item.buildingId, item.id, 'rejected'), {
                        confirmTitle: text.confirmRejectTitle,
                        confirmMessage: text.confirmRejectMessage,
                      })}
                    />
                  ) : null}
                  <ActionButton
                    id={item.id}
                    label={text.delete}
                    tone="delete"
                    onPress={() => void runAction(item.id, () => deleteOsbbNewsItem(item.buildingId, item.id), {
                      confirmTitle: text.confirmDeleteTitle,
                      confirmMessage: text.confirmDeleteMessage,
                    })}
                  />
                </View>
              </View>
            )}
          />
        );
      case 'osbbvotes':
        return renderNestedModeration(osbbVotes, 'osbb_votes');
      case 'osbbtopics':
        return renderNestedModeration(osbbTopics, 'osbb_house_topics');
      case 'osbbcollections':
        return renderNestedModeration(osbbCollections, 'osbb_collections');
      case 'users':
        return renderUsers();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setHeaderExpanded((v) => !v)} activeOpacity={0.95}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerToggle}>{headerExpanded ? '▲' : '▼'}</Text>
        </View>
        {!headerExpanded ? (
          <Text style={styles.headerCollapsedHint}>
            {lastUpdatedAt ? `${text.updatedAt}: ${lastUpdatedAt}` : text.loading}
            {failedSectionIssues.length > 0 ? '  ⚠' : ''}
          </Text>
        ) : (
          <>
            {lastUpdatedAt ? <Text style={styles.summaryMeta}>{text.updatedAt}: {lastUpdatedAt}</Text> : null}
            <View style={styles.securityRow}>
              <View style={styles.securityWrap}>
                <TouchableOpacity
                  style={styles.securityButton}
                  onPress={() => navigation.navigate('SecurityControlScreen')}
                  activeOpacity={0.82}
                >
                  <Text style={styles.securityButtonText}>{text.security}</Text>
                </TouchableOpacity>
                {language === 'ru' ? <Text style={styles.actionHint}>{text.securityHint}</Text> : null}
              </View>
              <View style={styles.securityWrap}>
                <TouchableOpacity
                  style={styles.securityButton}
                  onPress={() => navigation.navigate('ServerStatusScreen')}
                  activeOpacity={0.82}
                >
                  <Text style={styles.securityButtonText}>{text.server}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.securityWrap}>
                <TouchableOpacity
                  style={styles.securityButton}
                  onPress={() => navigation.navigate('AuthDiagnosticScreen')}
                  activeOpacity={0.82}
                >
                  <Text style={styles.securityButtonText}>{text.authDiagnostic}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.securityWrap}>
                <TouchableOpacity
                  style={styles.securityButton}
                  onPress={() => navigation.navigate('AdminRuntimeMonitorScreen')}
                  activeOpacity={0.82}
                >
                  <Text style={styles.securityButtonText}>{text.runtimeMonitor}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.securityWrap}>
                <TouchableOpacity
                  style={[styles.securityButton, styles.securityButtonUserErrors]}
                  onPress={() => navigation.navigate('AdminUserErrorsScreen')}
                  activeOpacity={0.82}
                >
                  <Text style={styles.securityButtonText}>{text.userErrors}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {failedSectionIssues.length > 0 ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{text.partialLoad}</Text>
                <Text style={styles.noticeSubtext}>{text.partialLoadHint}</Text>
                <Text style={styles.noticeFailedList}>
                  {failedSectionIssues.map((item) => item.sectionLabel).join(' · ')}
                </Text>
                <View style={styles.noticeActions}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('ServiceModerationIssuesScreen', {
                      issues: failedSectionIssues,
                      updatedAt: lastUpdatedAt,
                    })}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.noticeLink}>{text.viewIssues}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void loadAll()} activeOpacity={0.82}>
                    <Text style={styles.noticeLink}>{text.retryLoad}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        )}
      </TouchableOpacity>

      <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const count = counts[tab.key];
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                    {tab.label[language]}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder={text.searchPlaceholder}
              placeholderTextColor="rgba(122,30,92,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity style={styles.searchClearBtn} onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => {
              const label = f === 'all'
                ? (language === 'en' ? 'All' : language === 'ru' ? 'Все' : 'Всі')
                : f === 'pending' ? text.pending
                : f === 'approved' ? text.approved
                : text.rejected;
              const count = f === 'all'
                ? (tabStats.pending + tabStats.approved + tabStats.rejected)
                : tabStats[f];
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, statusFilter === f && styles.filterBtnActive]}
                  onPress={() => setStatusFilter(f)}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.filterBtnText, statusFilter === f && styles.filterBtnTextActive]}>
                    {label}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.statsRow}>
            {tabStats.approved > 0 ? (
              <View style={[styles.statChip, styles.statChipApproved]}>
                <Text style={styles.statChipText}>{tabStats.approved} {text.approved}</Text>
              </View>
            ) : null}
            {tabStats.rejected > 0 ? (
              <View style={[styles.statChip, styles.statChipRejected]}>
                <Text style={styles.statChipText}>{tabStats.rejected} {text.rejected}</Text>
              </View>
            ) : null}
            {activeTab === 'requests' && suspiciousCount > 0 ? (
              <View style={[styles.statChip, styles.statChipSuspicious]}>
                <Text style={styles.statChipText}>⚠ {suspiciousCount} {text.suspicious}</Text>
              </View>
            ) : null}
            {activeTab === 'requests' && tabStats.pending > 0 ? (
              <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkApprovePending} activeOpacity={0.82}>
                <Text style={styles.bulkBtnText}>{text.approveAllPending}</Text>
              </TouchableOpacity>
            ) : null}
            {activeTab !== 'requests' && activeTab !== 'users' && activeTab !== 'osbbnews' && activeTab !== 'osbbvotes' && activeTab !== 'osbbtopics' && activeTab !== 'osbbcollections' && tabStats.pending > 0 ? (
              <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkApproveTab} activeOpacity={0.82}>
                <Text style={styles.bulkBtnText}>{text.approveAllPending}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.content}>
            {refreshing && !initialLoaded ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#7A1E5C" />
                <Text style={styles.loadingText}>{text.loading}</Text>
              </View>
            ) : renderContent()}
          </View>

          <MiniTabBar />
      </>

      <Modal
        visible={rejectModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{text.confirmRejectTitle}</Text>
            <Text style={styles.modalMessage}>{text.confirmRejectMessage}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={language === 'en' ? 'Reason (optional)' : language === 'ru' ? 'Причина (необязательно)' : 'Причина (необов\'язково)'}
              placeholderTextColor="#aaa"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRejectModal(null)} activeOpacity={0.82}>
                <Text style={styles.modalCancelText}>{text.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleRejectModalConfirm} activeOpacity={0.82}>
                <Text style={styles.modalConfirmText}>{text.confirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg, paddingTop: 10 },
  header: { backgroundColor: '#7A1E5C', borderRadius: 16, padding: 12, marginHorizontal: 14, marginBottom: 8 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', flex: 1 },
  headerToggle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginLeft: 8 },
  headerCollapsedHint: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 4 },
  headerSub: { color: 'rgba(255,255,255,0.82)', marginTop: 4, fontSize: 13 },
  modeBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  modeBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  modeBadgeView: { backgroundColor: 'rgba(0,0,0,0.2)' },
  modeBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  summaryText: { color: 'rgba(255,255,255,0.82)', marginTop: 10, fontSize: 12, lineHeight: 18 },
  modeHintText: { color: 'rgba(255,255,255,0.82)', marginTop: 6, fontSize: 11, lineHeight: 15 },
  summaryMeta: { color: 'rgba(255,255,255,0.74)', marginTop: 8, fontSize: 11, fontWeight: '700' },
  securityRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
  securityWrap: { alignSelf: 'flex-start' },
  securityButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  securityButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  securityButtonUserErrors: { backgroundColor: 'rgba(199,122,93,0.55)' },
  noticeBox: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    padding: 10,
  },
  noticeText: { color: '#fff', fontSize: 12, lineHeight: 18 },
  noticeSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 11, lineHeight: 16, marginTop: 4 },
  noticeFailedList: { color: 'rgba(255,255,180,0.9)', fontSize: 11, fontWeight: '700', marginTop: 4, lineHeight: 16 },
  noticeActions: { flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' },
  noticeLink: { color: '#FFF3B0', fontSize: 12, fontWeight: '900', marginTop: 8 },
  tabScroll: { flexGrow: 0, marginBottom: 4 },
  tabRow: { paddingHorizontal: 14, gap: 8 },
  tabBtn: { borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#EFE6DC' },
  tabBtnActive: { backgroundColor: '#7A1E5C' },
  tabBtnText: { color: '#5A2C2C', fontWeight: '800', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
  content: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  noteCard: {
    backgroundColor: '#F6EDE4',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E1C8B4',
  },
  noteTitle: { fontSize: 15, fontWeight: '900', color: '#4A3326', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 4 },
  cardMeta: { fontSize: 13, color: '#7D736B', marginTop: 2 },
  ownerBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#EEE2FF',
    color: '#6C47A6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '900',
    fontSize: 12,
  },
  photoThumb: { width: '100%', height: 160, borderRadius: 12, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionWrap: { maxWidth: 220 },
  actionBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center', minWidth: 96 },
  approveBtn: { backgroundColor: '#2E8B57' },
  rejectBtn: { backgroundColor: '#9C3F2B' },
  deleteBtn: { backgroundColor: '#6B1F1F' },
  neutralBtn: { backgroundColor: '#4B5D73' },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  actionHint: { marginTop: 4, fontSize: 10, lineHeight: 13, color: '#7D736B', maxWidth: 220 },
  empty: { textAlign: 'center', color: '#7D736B', fontWeight: '700', marginTop: 40 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6E6157', fontWeight: '700' },
  searchRow: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: '#F5EDF9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(122,30,92,0.15)',
  },
  searchClearBtn: {
    marginLeft: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(122,30,92,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchClearText: { fontSize: 13, color: '#7A1E5C', fontWeight: '800' },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  statChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statChipPending: { backgroundColor: '#FFF3CD' },
  statChipApproved: { backgroundColor: '#D4EDDA' },
  statChipRejected: { backgroundColor: '#F8D7DA' },
  statChipSuspicious: { backgroundColor: '#FFE5CC' },
  statChipText: { fontSize: 12, fontWeight: '700', color: '#35261C' },
  suspiciousBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FFE5CC',
    color: '#8A4A00',
    fontSize: 11,
    fontWeight: '800',
  },
  bulkBtn: {
    backgroundColor: '#2E8B57',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bulkBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  filterScroll: { flexGrow: 0, marginBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 6 },
  filterBtn: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#EFE6DC' },
  filterBtnActive: { backgroundColor: '#7A1E5C' },
  filterBtnText: { fontSize: 12, fontWeight: '800', color: '#5A2C2C' },
  filterBtnTextActive: { color: '#fff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: '#1A1A1A', marginBottom: 6 },
  modalMessage: { fontSize: 13, color: '#7D736B', marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(122,30,92,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#EFE6DC' },
  modalCancelText: { fontWeight: '800', color: '#5A2C2C', fontSize: 14 },
  modalConfirmBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#9C3F2B' },
  modalConfirmText: { fontWeight: '800', color: '#fff', fontSize: 14 },
});

export default ServiceModerationScreen;


