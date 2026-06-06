import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { get, onValue, ref } from 'firebase/database';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { ContactReason, ProfileViewRequest, ViewRequestContext, ViewRequestStatus, profilePermissionService } from '../services/profilePermissionService';
import {
  PROFILE_REQUEST_CONTEXT_KEYS,
  getProfileRequestContextLabel,
  getProfileRequestStatusLabel,
} from '../utils/profileRequestMeta';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { database } from '../firebase-config';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import UserCardActionBar from '../components/UserCardActionBar';
import ScreenTooltip from '../components/ScreenTooltip';
import { PROFILE_REQUESTS_TOOLTIP } from '../utils/screenTooltips';
import useSoftToast from '../hooks/useSoftToast';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';

type Lang = 'ua' | 'ru' | 'en';
type RequestsTab = 'incoming' | 'outgoing' | 'history';

const SEEN_KEY = '@chaika:outgoing_seen_contacts_v1';

const OUTGOING_STATUS: Record<string, Record<Lang, string>> = {
  pending:          { ua: 'Очікує відповіді',  ru: 'Ожидает ответа',    en: 'Awaiting response' },
  approved_contact: { ua: 'Контакт відкрито',  ru: 'Контакт открыт',   en: 'Contact open'      },
  approved:         { ua: 'Прийнято',           ru: 'Принято',           en: 'Accepted'          },
  denied:           { ua: 'Поки без відповіді', ru: 'Пока без ответа',  en: 'No response yet'   },
};

const PENDING_HINT: Record<Lang, string> = {
  ua: "Коли з'явиться значок телефону — користувач готовий з вами зв'язатися",
  ru: 'Когда появится значок телефона — пользователь готов с вами связаться',
  en: 'When a phone icon appears — the user is ready to contact you',
};

const ELAPSED_LABELS: Record<Lang, { min: string; hour: string; day: string; waiting: string }> = {
  ua: { min: 'хв', hour: 'год', day: 'дн', waiting: 'в очікуванні' },
  ru: { min: 'мин', hour: 'ч', day: 'дн', waiting: 'в ожидании' },
  en: { min: 'min', hour: 'h', day: 'd', waiting: 'waiting' },
};

const VIEWED_LABELS: Record<Lang, { seen: string; notSeen: string }> = {
  ua: { seen: 'Переглянуто', notSeen: 'Ще не бачив' },
  ru: { seen: 'Просмотрено', notSeen: 'Ещё не видел' },
  en: { seen: 'Viewed', notSeen: 'Not seen yet' },
};

const formatElapsed = (isoDate: string, lang: Lang): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const l = ELAPSED_LABELS[lang];
  if (diff < 0) return `0 ${l.min} ${l.waiting}`;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} ${l.min} ${l.waiting}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${l.hour} ${l.waiting}`;
  const days = Math.floor(hours / 24);
  return `${days} ${l.day} ${l.waiting}`;
};

type StatusFilter = 'all' | ViewRequestStatus;
type ContextFilter = 'all' | 'lyudi' | 'help' | 'sport' | 'buysell' | 'job';

const ACCENT = '#7A1E5C';

const getProfileRequestSourceLabel = (
  sourceType: string | undefined,
  context: ViewRequestContext,
  language: Lang,
  fallback: string,
): string => {
  const rawSource = sourceType?.trim();
  const sourceKey = rawSource && PROFILE_REQUEST_CONTEXT_KEYS.includes(rawSource as ViewRequestContext)
    ? rawSource
    : context;
  const label = getProfileRequestContextLabel(sourceKey, language).trim();
  return label || fallback;
};

const UI = {
  ua: {
    title: "Хочуть зв'язатись",
    tabIncoming: 'Вхідні',
    tabOutgoing: 'Вихідні',
    tabHistory: 'Історія',
    empty: 'Немає нових запитів',
    emptyOutgoing: 'Ви ще нікому не надсилали запити',
    emptyHistory: 'Історія запитів порожня',
    emptyHint: 'Тут з\'являться люди, які хочуть зв\'язатися з вами.',
    emptyHintOutgoing: 'Тут буде список профілів, яким ви надсилали запит на контакт.',
    emptyHintHistory: 'Тут буде видно усі ваші вхідні запити та їхні статуси.',
    notReady: 'Розділ буде доступний на наступному кроці.',
    filterStatus: 'Статус',
    filterContext: 'Розділ',
    filterAll: 'Усі',
    showHidden: 'Показати приховані',
    restore: 'Повернути',
    hide: 'Сховати',
    clearHistory: 'Очистити всю історію контактів',
    clearConfirmTitle: 'Очистити історію?',
    clearConfirmBody: 'Усі запити контактів будуть приховані з цього екрана.',
    clearConfirmYes: 'Так',
    clearConfirmNo: 'Ні',
    openSource: 'Відкрити джерело',
    sharedContact: 'Контакт',
    copy: 'Скопіювати',
    copyHintTitle: 'Копіювання',
    copyHintBody: 'Затримайте номер, щоб скопіювати його в буфер обміну.',
    approve: 'Дозволити',
    deny: 'Відхилити',
    topicLabel: 'Тема:',
    foundContactLabel: 'Знайшов ваш контакт:',
    transitionScreenLabel: 'Перейшов з екрана:',
    notSpecified: 'не вказано',
    contactOpened: 'Контакт відкрито',
    contactOpenedByTopic: 'Контакт відкрито по темі:',
    requestDenied: 'Запит відхилено',
    approveAgainTitle: 'Схвалити контакт?',
    approveAgainBody: 'Цей запит було відхилено. Хочете відкрити контакт для цього користувача?',
    approveAgainYes: 'Так, схвалити',
    approveSuccess: 'Контакт відкрито',
    denySuccess: 'Запит відхилено',
    errTitle: 'Помилка',
    errBody: 'Не вдалося відповісти. Спробуйте ще раз.',
    loadErrBody: 'Не вдалося завантажити запити. Перевірте інтернет і спробуйте ще раз.',
    authErrBody: 'Не вдалося підключити гостьову сесію. Перевірте інтернет і відкрийте розділ ще раз.',
    sourceBoxTitle: 'Джерело:',
    call: 'Подзвонити',
    callUnavailable: 'Немає телефону',
    viber: 'Viber',
    viberUnavailable: 'Немає Viber',
    reasonLabel: 'Причина:',
    sourceLabel: 'Розділ:',
    profileUnavailable: 'Профіль користувача недоступний',
    reasons: {
      acquaintance: 'Просто знайомство',
      by_listing: 'По оголошенню / заявці',
      by_services: 'По темі послуг',
      by_issue: 'По проблемі',
    },
  },
  ru: {
    title: 'Хотят связаться',
    tabIncoming: 'Входящие',
    tabOutgoing: 'Исходящие',
    tabHistory: 'История',
    empty: 'Нет новых запросов',
    emptyOutgoing: 'Вы еще никому не отправляли запросы',
    emptyHistory: 'История запросов пуста',
    emptyHint: 'Здесь появятся люди, которые хотят связаться с вами.',
    emptyHintOutgoing: 'Здесь будет список профилей, которым вы отправляли запрос на контакт.',
    emptyHintHistory: 'Здесь будут все входящие запросы и их статусы.',
    notReady: 'Раздел появится на следующем шаге.',
    filterStatus: 'Статус',
    filterContext: 'Раздел',
    filterAll: 'Все',
    showHidden: 'Показать скрытые',
    restore: 'Вернуть',
    hide: 'Скрыть',
    clearHistory: 'Очистить всю историю контактов',
    clearConfirmTitle: 'Очистить историю?',
    clearConfirmBody: 'Все запросы контактов будут скрыты с этого экрана.',
    clearConfirmYes: 'Да',
    clearConfirmNo: 'Нет',
    openSource: 'Открыть источник',
    sharedContact: 'Контакт',
    copy: 'Копировать',
    copyHintTitle: 'Копирование',
    copyHintBody: 'Зажмите номер, чтобы скопировать его в буфер обмена.',
    approve: 'Разрешить',
    deny: 'Отклонить',
    topicLabel: 'Тема:',
    foundContactLabel: 'Нашел ваш контакт:',
    transitionScreenLabel: 'Перешел с экрана:',
    notSpecified: 'не указано',
    contactOpened: 'Контакт открыт',
    contactOpenedByTopic: 'Контакт открыт по теме:',
    requestDenied: 'Запит відхилено',
    approveAgainTitle: 'Одобрить контакт?',
    approveAgainBody: 'Этот запрос был отклонен. Хотите открыть контакт для этого пользователя?',
    approveAgainYes: 'Да, одобрить',
    approveSuccess: 'Контакт открыт',
    denySuccess: 'Запит відхилено',
    errTitle: 'Ошибка',
    errBody: 'Не удалось ответить. Попробуйте снова.',
    loadErrBody: 'Не удалось загрузить запросы. Проверьте интернет и попробуйте снова.',
    authErrBody: 'Не удалось подключить гостевую сессию. Проверьте интернет и откройте раздел еще раз.',
    sourceBoxTitle: 'Источник:',
    call: 'Позвонить',
    callUnavailable: 'Нет телефона',
    viber: 'Viber',
    viberUnavailable: 'Нет Viber',
    reasonLabel: 'Причина:',
    sourceLabel: 'Раздел:',
    profileUnavailable: 'Профиль пользователя недоступен',
    reasons: {
      acquaintance: 'Просто знакомство',
      by_listing: 'По объявлению / заявке',
      by_services: 'По теме услуг',
      by_issue: 'По проблеме',
    },
  },
  en: {
    title: 'Contact requests',
    tabIncoming: 'Incoming',
    tabOutgoing: 'Outgoing',
    tabHistory: 'History',
    empty: 'No new requests',
    emptyOutgoing: 'You have not sent any requests yet',
    emptyHistory: 'No request history yet',
    emptyHint: 'People who want to contact you will appear here.',
    emptyHintOutgoing: 'Profiles you requested contact access to will appear here.',
    emptyHintHistory: 'All incoming requests and their statuses will appear here.',
    notReady: 'This section will be available in the next step.',
    filterStatus: 'Status',
    filterContext: 'Section',
    filterAll: 'All',
    showHidden: 'Show hidden',
    restore: 'Restore',
    hide: 'Hide',
    clearHistory: 'Clear all contact history',
    clearConfirmTitle: 'Clear history?',
    clearConfirmBody: 'All contact requests will be hidden from this screen.',
    clearConfirmYes: 'Yes',
    clearConfirmNo: 'No',
    openSource: 'Open source',
    sharedContact: 'Contact',
    copy: 'Copy',
    copyHintTitle: 'Copy',
    copyHintBody: 'Press and hold the number to copy it.',
    approve: 'Allow',
    deny: 'Deny',
    topicLabel: 'Topic:',
    foundContactLabel: 'Found your contact:',
    transitionScreenLabel: 'Opened from screen:',
    notSpecified: 'not specified',
    contactOpened: 'Contact open',
    contactOpenedByTopic: 'Contact opened for topic:',
    requestDenied: 'Запит відхилено',
    approveAgainTitle: 'Approve contact?',
    approveAgainBody: 'This request was denied. Do you want to open contact for this user?',
    approveAgainYes: 'Yes, approve',
    approveSuccess: 'Contact open',
    denySuccess: 'Запит відхилено',
    errTitle: 'Error',
    errBody: 'Failed to respond. Please try again.',
    loadErrBody: 'Failed to load requests. Check your internet connection and try again.',
    authErrBody: 'Failed to start the guest session. Check your internet connection and open this section again.',
    sourceBoxTitle: 'Source:',
    call: 'Call',
    callUnavailable: 'No phone',
    viber: 'Viber',
    viberUnavailable: 'No Viber',
    reasonLabel: 'Reason:',
    sourceLabel: 'Section:',
    profileUnavailable: 'User profile is unavailable',
    reasons: {
      acquaintance: 'Just getting acquainted',
      by_listing: 'About a listing / request',
      by_services: 'About services',
      by_issue: 'About a problem',
    },
  },
};

const normalizeIncomingRequests = (
  data: Record<string, Partial<ProfileViewRequest>> | null | undefined,
  includeHistory: boolean,
): ProfileViewRequest[] => {
  if (!data) return [];
  return Object.entries(data)
    .map(([requesterId, value]) => ({
      requesterId: typeof value.requesterId === 'string' && value.requesterId.trim() ? value.requesterId : requesterId,
      requesterUserId: typeof value.requesterUserId === 'string' ? value.requesterUserId : (typeof value.requesterId === 'string' ? value.requesterId : requesterId),
      requesterName: typeof value.requesterName === 'string' && value.requesterName.trim() ? value.requesterName : 'Unknown user',
      requesterPhotoURL: typeof value.requesterPhotoURL === 'string' ? value.requesterPhotoURL : '',
      requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : new Date(0).toISOString(),
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
      context: (value.context as ProfileViewRequest['context']) ?? 'lyudi',
      status: (value.status as ProfileViewRequest['status']) ?? 'pending',
      sharedContact: typeof value.sharedContact === 'string' ? value.sharedContact : '',
      reason: value.reason as ContactReason | undefined,
      sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
      sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
      requesterPhone: typeof value.requesterPhone === 'string' ? value.requesterPhone : undefined,
      targetPhone: typeof value.targetPhone === 'string' ? value.targetPhone : undefined,
      viewedAt: typeof value.viewedAt === 'string' ? value.viewedAt : undefined,
    }))
    .filter((r) => Boolean(r.requesterId) && (includeHistory || r.status === 'pending'))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
};

const normalizeOutgoingRequests = (
  data: Record<string, Partial<ProfileViewRequest>> | null | undefined,
  userId: string,
): ProfileViewRequest[] => {
  if (!data) return [];
  return Object.entries(data)
    .map(([targetUserId, value]) => ({
      requesterId: typeof value.requesterId === 'string' && value.requesterId.trim() ? value.requesterId : userId,
      requesterUserId: typeof value.requesterUserId === 'string' ? value.requesterUserId : userId,
      requesterName: typeof value.requesterName === 'string' && value.requesterName.trim() ? value.requesterName : 'Unknown user',
      requesterPhotoURL: typeof value.requesterPhotoURL === 'string' ? value.requesterPhotoURL : '',
      targetUserId,
      targetName: typeof value.targetName === 'string' ? value.targetName : '',
      targetPhotoURL: typeof value.targetPhotoURL === 'string' ? value.targetPhotoURL : '',
      requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : new Date(0).toISOString(),
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
      context: (value.context as ProfileViewRequest['context']) ?? 'lyudi',
      status: (value.status as ProfileViewRequest['status']) ?? 'pending',
      sharedContact: typeof value.sharedContact === 'string' ? value.sharedContact : '',
      reason: value.reason as ContactReason | undefined,
      sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
      sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
      requesterPhone: typeof value.requesterPhone === 'string' ? value.requesterPhone : undefined,
      targetPhone: typeof value.targetPhone === 'string' ? value.targetPhone : undefined,
      viewedAt: typeof value.viewedAt === 'string' ? value.viewedAt : undefined,
    }))
    .filter((r) => Boolean(r.targetUserId))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
};

export default function ProfileRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navLock = useRef(false);
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const toast = useSoftToast();
  const t = UI[language];
  const [sessionUserId, setSessionUserId] = useState(user?.id ?? '');
  const [sessionResolved, setSessionResolved] = useState(Boolean(user?.id));
  const currentUserId = user?.id || sessionUserId || '';
  const [requests, setRequests] = useState<ProfileViewRequest[]>([]);
  const requestUserIds = requests.flatMap((r) => [r.requesterId, r.targetUserId].filter(Boolean) as string[]);
  const avatarByUserId = useUserAvatarMap(requestUserIds);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RequestsTab>('incoming');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Record<string, boolean>>({});
  const [incomingPhones, setIncomingPhones] = useState<Record<string, string>>({});
  const [incomingAges, setIncomingAges] = useState<Record<string, string>>({});
  const [incomingVotes, setIncomingVotes] = useState<Record<string, number>>({});
  const [seenContacts, setSeenContacts] = useState<Record<string, boolean>>({});
  const [clearingHistory, setClearingHistory] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);

  const loadIncomingPhones = useCallback(async (incoming: ProfileViewRequest[]) => {
    const uniqueRequesterIds = Array.from(new Set(incoming.map((item) => item.requesterId).filter(Boolean)));
    if (uniqueRequesterIds.length === 0) {
      setIncomingPhones({});
      setIncomingAges({});
      setIncomingVotes({});
      return;
    }
    try { await ensureFirebaseAuth(); } catch { /* proceed anyway */ }
    const pairs = await Promise.all(
      uniqueRequesterIds.map(async (requesterId) => {
        try {
          const [phoneSnap, ageSnap, votesSnap] = await Promise.all([
            get(ref(database, `users/${requesterId}/phone`)),
            get(ref(database, `users/${requesterId}/age`)),
            get(ref(database, `users/${requesterId}/ratingVotes`)),
          ]);
          const rawPhone = phoneSnap.val();
          const rawAge = ageSnap.val();
          const rawVotes = votesSnap.val();
          const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
          const age = rawAge !== null && rawAge !== undefined ? String(rawAge).trim() : '';
          const votes = typeof rawVotes === 'number' ? rawVotes : 0;
          return [requesterId, phone, age, votes] as const;
        } catch {
          return [requesterId, '', '', 0] as const;
        }
      })
    );
    setIncomingPhones(
      pairs.reduce<Record<string, string>>((acc, [requesterId, phone]) => {
        if (phone) acc[requesterId] = phone;
        return acc;
      }, {})
    );
    setIncomingAges(
      pairs.reduce<Record<string, string>>((acc, [requesterId, , age]) => {
        if (age) acc[requesterId] = age;
        return acc;
      }, {})
    );
    setIncomingVotes(
      pairs.reduce<Record<string, number>>((acc, [requesterId, , , votes]) => {
        acc[requesterId] = votes;
        return acc;
      }, {})
    );
  }, []);

  useEffect(() => {
    if (user?.id) {
      setSessionUserId('');
      setSessionResolved(true);
      return;
    }

    setSessionResolved(false);
    setSessionUserId('');
    setSessionResolved(true);
  }, [user?.id]);

  useEffect(() => {
    if (!sessionResolved) {
      setLoading(true);
      return;
    }
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [hidden, incomingRequests, outgoingRequests, historyRequests] = await Promise.all([
          profilePermissionService.getHiddenRequestKeys(currentUserId),
          profilePermissionService.getAllRequests(currentUserId),
          profilePermissionService.getOutgoingRequests(currentUserId),
          profilePermissionService.getAllRequestsWithHistory(currentUserId),
        ]);
        if (cancelled) return;
        setHiddenKeys(hidden);
        // Входящие показывают все статусы (pending + approved + denied)
        if (historyRequests.length > 0 || incomingRequests.length > 0) {
          setActiveTab('incoming');
          setRequests(historyRequests);
          await loadIncomingPhones(historyRequests);
          // Mark pending incoming requests as viewed by this user
          const pendingWithoutView = incomingRequests.filter((r) => r.status === 'pending' && !r.viewedAt);
          if (pendingWithoutView.length > 0) {
            void profilePermissionService.markIncomingAsViewed(currentUserId, pendingWithoutView.map((r) => r.requesterId));
          }
        } else if (outgoingRequests.length > 0) {
          setActiveTab('outgoing');
          setRequests(outgoingRequests);
        } else {
          setActiveTab('incoming');
          setRequests([]);
        }
        setTabInitialized(true);
      } catch (err) {
        if (!cancelled) {
          Alert.alert(t.errTitle, t.loadErrBody);
          setTabInitialized(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, loadIncomingPhones, navigation, sessionResolved, t.errTitle, t.loadErrBody]);

  useEffect(() => {
    if (!tabInitialized || !currentUserId) return undefined;

    setLoading(true);
    const path = activeTab === 'outgoing'
      ? `outgoingProfileRequestsByUser/${currentUserId}`
      : `profileViewRequests/${currentUserId}`;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void ensureFirebaseAuth().then(() => {
      if (cancelled) return;

      unsubscribe = onValue(ref(database, path), async (snap) => {
        try {
          const hidden = await profilePermissionService.getHiddenRequestKeys(currentUserId);
          const raw = snap.exists() ? (snap.val() as Record<string, Partial<ProfileViewRequest>>) : null;
          const nextRequests = activeTab === 'outgoing'
            ? normalizeOutgoingRequests(raw, currentUserId)
            : normalizeIncomingRequests(raw, true);

          setHiddenKeys(hidden);
          if (activeTab === 'incoming') {
            await loadIncomingPhones(nextRequests);
          }
          setRequests(nextRequests);
        } catch {
          Alert.alert(t.errTitle, t.loadErrBody);
        } finally {
          setLoading(false);
        }
      }, () => {
        // onValue error — just show error, don't redirect
        Alert.alert(t.errTitle, t.loadErrBody);
        setLoading(false);
      });
    }).catch(() => {
      if (!cancelled) {
        Alert.alert(t.errTitle, t.loadErrBody);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeTab, currentUserId, loadIncomingPhones, t.errBody, t.errTitle, tabInitialized]);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        if (raw) setSeenContacts(JSON.parse(raw) as Record<string, boolean>);
      } catch { /* ignore */ }
    })();
  }, []);

  const markSeen = useCallback(async (key: string) => {
    setSeenContacts((prev) => {
      const next = { ...prev, [key]: true };
      void AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const sanitizeFirebaseKey = (key: string) => key.replace(/[.#$[\]]/g, '_');

  const formatTimeShort = (iso: string) => {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}, ${hours}:${mins}`;
  };

  const filteredRequests = requests.filter((item) => {
    const targetUserId = activeTab === 'outgoing' ? (item.targetUserId ?? '') : currentUserId;
    const hiddenKey = profilePermissionService.requestKey(targetUserId, item.requesterId);
    const isHidden = Boolean(hiddenKeys[hiddenKey]);
    if (activeTab === 'incoming') return !isHidden;
    if (activeTab === 'history' && !isHidden) return false;
    if (activeTab === 'outgoing' && !showHidden && isHidden) return false;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (contextFilter !== 'all' && item.context !== contextFilter) return false;
    return true;
  });

  const clearContactHistory = useCallback(async () => {
    if (!currentUserId || clearingHistory) return;
    setClearingHistory(true);
    try {
      const [incoming, outgoing, history] = await Promise.all([
        profilePermissionService.getAllRequests(currentUserId),
        profilePermissionService.getOutgoingRequests(currentUserId),
        profilePermissionService.getAllRequestsWithHistory(currentUserId),
      ]);

      const archiveTargets = new Map<string, { targetUserId: string; requesterId: string }>();
      [...incoming, ...history].forEach((item) => {
        const targetUserId = currentUserId;
        const requesterId = item.requesterId;
        if (!requesterId) return;
        archiveTargets.set(profilePermissionService.requestKey(targetUserId, requesterId), { targetUserId, requesterId });
      });
      outgoing.forEach((item) => {
        const targetUserId = item.targetUserId ?? '';
        if (!targetUserId) return;
        const requesterId = currentUserId;
        archiveTargets.set(profilePermissionService.requestKey(targetUserId, requesterId), { targetUserId, requesterId });
      });

      await Promise.all(
        Array.from(archiveTargets.values()).map((entry) =>
          profilePermissionService.hideRequestForUser(currentUserId, entry.targetUserId, entry.requesterId),
        ),
      );
      setHiddenKeys((prev) => {
        const next = { ...prev };
        archiveTargets.forEach((_, key) => { next[key] = true; });
        return next;
      });
    } catch {
      Alert.alert(t.errTitle, t.errBody);
    } finally {
      setClearingHistory(false);
    }
  }, [activeTab, clearingHistory, currentUserId, t.errBody, t.errTitle]);

  const confirmClearContactHistory = useCallback(() => {
    Alert.alert(t.clearConfirmTitle, t.clearConfirmBody, [
      { text: t.clearConfirmNo, style: 'cancel' },
      { text: t.clearConfirmYes, style: 'destructive', onPress: () => { void clearContactHistory(); } },
    ]);
  }, [clearContactHistory, t.clearConfirmBody, t.clearConfirmNo, t.clearConfirmTitle, t.clearConfirmYes]);

  const handleRespondToIncoming = useCallback(async (requesterId: string, approved: boolean) => {
    if (!currentUserId || !requesterId || respondingRequestId) return;
    setRespondingRequestId(requesterId);
    try {
      await profilePermissionService.respondToRequest(currentUserId, requesterId, approved);
      // Оставаться на текущей вкладке — обновить статус карточки на месте
      setRequests((prev) => prev.map((item) =>
        item.requesterId === requesterId
          ? { ...item, status: approved ? 'approved' : 'denied' }
          : item,
      ));
      toast.showSuccess(approved ? t.approveSuccess : t.denySuccess);
    } catch {
      Alert.alert(t.errTitle, t.errBody);
    } finally {
      setRespondingRequestId(null);
    }
  }, [currentUserId, respondingRequestId, t.approveSuccess, t.denySuccess, t.errBody, t.errTitle, toast]);

  const confirmApproveDeniedRequest = useCallback((requesterId: string) => {
    if (!requesterId || respondingRequestId) return;
    Alert.alert(t.approveAgainTitle, t.approveAgainBody, [
      { text: t.clearConfirmNo, style: 'cancel' },
      { text: t.approveAgainYes, onPress: () => { void handleRespondToIncoming(requesterId, true); } },
    ]);
  }, [handleRespondToIncoming, respondingRequestId, t.approveAgainBody, t.approveAgainTitle, t.approveAgainYes, t.clearConfirmNo]);

  const handleCall = async (phoneRaw?: string) => {
    await safeCallPhone(phoneRaw, language);
  };

  const handleViber = async (phoneRaw?: string) => {
    await safeOpenViber(phoneRaw, language);
  };

  if (!currentUserId) {
    const authTitle = language === 'en'
      ? 'Registration required'
      : language === 'ru'
        ? '\u041d\u0443\u0436\u043d\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f'
        : '\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044f';
    const authBody = language === 'en'
      ? 'Sign in to view and respond to contact requests.'
      : language === 'ru'
        ? '\u0412\u043e\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0432\u0438\u0434\u0435\u0442\u044c \u0438 \u043e\u0431\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441\u044b \u043d\u0430 \u043a\u043e\u043d\u0442\u0430\u043a\u0442.'
        : '\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044c, \u0449\u043e\u0431 \u0431\u0430\u0447\u0438\u0442\u0438 \u0442\u0430 \u043e\u0431\u0440\u043e\u0431\u043b\u044f\u0442\u0438 \u0437\u0430\u043f\u0438\u0442\u0438 \u043d\u0430 \u043a\u043e\u043d\u0442\u0430\u043a\u0442.';
    const authButton = language === 'en'
      ? 'Sign in / Register'
      : language === 'ru'
        ? '\u0412\u043e\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f'
        : '\u0423\u0432\u0456\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0432\u0430\u0442\u0438\u0441\u044c';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.authGate}>
          <MaterialCommunityIcons name="lock-outline" size={42} color={ACCENT} />
          <Text style={styles.authGateTitle}>{authTitle}</Text>
          <Text style={styles.authGateText}>{authBody}</Text>
          <TouchableOpacity
            style={styles.authGateButton}
            onPress={() => navigation.navigate('LoginScreen')}
            activeOpacity={0.86}
          >
            <Text style={styles.authGateButtonText}>{authButton}</Text>
          </TouchableOpacity>
        </View>
        <MiniTabBar />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={PROFILE_REQUESTS_TOOLTIP.storageKey}
        title={PROFILE_REQUESTS_TOOLTIP.title}
        items={PROFILE_REQUESTS_TOOLTIP.items}
        accentColor={ACCENT}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'incoming' && styles.tabBtnActive]}
          onPress={() => setActiveTab('incoming')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'incoming' && styles.tabBtnTextActive]}>{t.tabIncoming}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'outgoing' && styles.tabBtnActive]}
          onPress={() => setActiveTab('outgoing')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'outgoing' && styles.tabBtnTextActive]}>{t.tabOutgoing}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>{t.tabHistory}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.clearHistoryBtn, clearingHistory && styles.clearHistoryBtnDisabled]}
        onPress={confirmClearContactHistory}
        disabled={clearingHistory}
        activeOpacity={0.85}
      >
        {clearingHistory ? (
          <ActivityIndicator size="small" color="#A73737" />
        ) : (
          <MaterialCommunityIcons name="delete-sweep-outline" size={18} color="#A73737" />
        )}
        <Text style={styles.clearHistoryText}>{t.clearHistory}</Text>
      </TouchableOpacity>

      {activeTab !== 'incoming' ? (
        <View style={styles.filtersBlock}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t.filterStatus}</Text>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]} onPress={() => setStatusFilter('all')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>{t.filterAll}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]} onPress={() => setStatusFilter('pending')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('pending', language)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'approved' && styles.filterChipActive]} onPress={() => setStatusFilter('approved')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'approved' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('approved', language)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'denied' && styles.filterChipActive]} onPress={() => setStatusFilter('denied')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'denied' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('denied', language)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t.filterContext}</Text>
            <TouchableOpacity style={[styles.filterChip, contextFilter === 'all' && styles.filterChipActive]} onPress={() => setContextFilter('all')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, contextFilter === 'all' && styles.filterChipTextActive]}>{t.filterAll}</Text>
            </TouchableOpacity>
            {PROFILE_REQUEST_CONTEXT_KEYS.map((key) => (
              <TouchableOpacity key={key} style={[styles.filterChip, contextFilter === key && styles.filterChipActive]} onPress={() => setContextFilter(key)} activeOpacity={0.85}>
                <Text style={[styles.filterChipText, contextFilter === key && styles.filterChipTextActive]}>{getProfileRequestContextLabel(key, language)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.filterRow}>
            <TouchableOpacity style={[styles.filterChip, showHidden && styles.filterChipActive]} onPress={() => setShowHidden((prev) => !prev)} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, showHidden && styles.filterChipTextActive]}>{t.showHidden}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : filteredRequests.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="bell-check-outline" size={52} color="#C0A898" />
          <Text style={styles.emptyText}>
            {activeTab === 'history' ? t.emptyHistory : activeTab === 'outgoing' ? t.emptyOutgoing : t.empty}
          </Text>
          <Text style={styles.emptyHint}>
            {activeTab === 'history' ? t.emptyHintHistory : activeTab === 'outgoing' ? t.emptyHintOutgoing : t.emptyHint}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => `${item.requesterId}_${item.requestedAt}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (activeTab === 'incoming') {
              const phone = item.status === 'approved' ? (item.requesterPhone?.trim() || incomingPhones[item.requesterId]) : undefined;
              const age = incomingAges[item.requesterId];
              const votes = incomingVotes[item.requesterId] ?? 0;
              const reasonText = item.reason ? t.reasons[item.reason as ContactReason] : null;
              const descriptionText = reasonText || item.sourceTitle || (age ? age : null);
              const isResponding = respondingRequestId === item.requesterId;
              const topicText = reasonText || item.sourceTitle?.trim() || t.notSpecified;
              const foundContactText = item.sourceTitle?.trim() || getProfileRequestContextLabel(item.context, language) || t.notSpecified;
              const transitionScreenText = getProfileRequestSourceLabel(item.sourceType, item.context, language, t.notSpecified);
              const votesLabel = language === 'en' ? 'votes' : language === 'ru' ? 'голосов' : 'голосів';
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => confirmApproveDeniedRequest(item.requesterId)}
                  disabled={item.status !== 'denied' || Boolean(respondingRequestId)}
                  activeOpacity={0.86}
                >
                  {/* Top: avatar + info */}
                  <View style={styles.cardIncoming}>
                    {(item.requesterPhotoURL || avatarByUserId[item.requesterId]) ? (
                      <AppPhotoImage
                        uri={item.requesterPhotoURL || avatarByUserId[item.requesterId]}
                        style={styles.avatarMedium}
                        resizeMode="cover"
                        debugLabel={`ProfileRequest:incoming:${item.requesterId}`}
                      />
                    ) : (
                      <MiniUserAvatar
                        name={item.requesterName}
                        size={56}
                        borderRadius={14}
                        backgroundColor="#6A8BA5"
                      />
                    )}

                    <View style={styles.incomingRight}>
                      {/* Name row */}
                      <View style={styles.incomingNameRow}>
                        <Text style={styles.incomingName} numberOfLines={1}>{item.requesterName}</Text>
                        <View style={styles.incomingNameSep} />
                        <Text style={styles.incomingVotesText}>{votes} {votesLabel}</Text>
                        <View style={styles.incomingDateBadge}>
                          <Text style={styles.incomingDateText}>{formatTimeShort(item.requestedAt)}</Text>
                        </View>
                      </View>

                      {/* Description box */}
                      {descriptionText ? (
                        <View style={styles.descriptionBox}>
                          <Text style={styles.descriptionText} numberOfLines={2}>{descriptionText}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.requestMetaBox}>
                    <View style={styles.requestMetaRow}>
                      <Text style={styles.requestMetaLabel}>{t.topicLabel}</Text>
                      <Text style={styles.requestMetaValue}>{topicText}</Text>
                    </View>
                    <View style={styles.requestMetaRow}>
                      <Text style={styles.requestMetaLabel}>{t.foundContactLabel}</Text>
                      <Text style={styles.requestMetaValue}>{foundContactText}</Text>
                    </View>
                    <View style={styles.requestMetaRow}>
                      <Text style={styles.requestMetaLabel}>{t.transitionScreenLabel}</Text>
                      <Text style={styles.requestMetaValue}>{transitionScreenText}</Text>
                    </View>
                  </View>

                  {item.status === 'pending' ? (
                    <View style={styles.responseActionsRow}>
                      <TouchableOpacity
                        style={[styles.responseBtn, styles.responseBtnApprove, isResponding && styles.responseBtnDisabled]}
                        onPress={() => { void handleRespondToIncoming(item.requesterId, true); }}
                        disabled={isResponding || Boolean(respondingRequestId)}
                        activeOpacity={0.85}
                      >
                        {isResponding ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <MaterialCommunityIcons name="check" size={18} color="#fff" />
                        )}
                        <Text style={styles.responseBtnText}>{t.approve}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.responseBtn, styles.responseBtnDeny, isResponding && styles.responseBtnDisabled]}
                        onPress={() => { void handleRespondToIncoming(item.requesterId, false); }}
                        disabled={isResponding || Boolean(respondingRequestId)}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="close" size={18} color="#A73737" />
                        <Text style={styles.responseBtnDenyText}>{t.deny}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={[
                      styles.responseStatusBox,
                      item.status === 'approved' ? styles.responseStatusApproved : styles.responseStatusDenied,
                    ]}>
                      <View style={styles.responseStatusTitleRow}>
                        <MaterialCommunityIcons
                          name={item.status === 'approved' ? 'check-circle' : 'close-circle-outline'}
                          size={18}
                          color={item.status === 'approved' ? '#2D7A46' : '#A73737'}
                        />
                        <Text style={[
                          styles.responseStatusTitle,
                          item.status === 'denied' && styles.responseStatusDeniedTitle,
                        ]}>
                          {item.status === 'approved' ? t.contactOpened : t.requestDenied}
                        </Text>
                      </View>
                      <Text style={styles.responseStatusTopic}>
                        {item.status === 'approved' ? t.contactOpenedByTopic : t.topicLabel} {topicText}
                      </Text>
                      {item.status === 'denied' ? (
                        <Text style={styles.responseStatusHint}>{t.approveAgainBody}</Text>
                      ) : null}
                    </View>
                  )}

                  <UserCardActionBar
                    avatarUri={item.requesterPhotoURL || avatarByUserId[item.requesterId] || ''}
                    name={item.requesterName}
                    userId={item.requesterId}
                    currentUserId={currentUserId}
                    language={language}
                    onProfile={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.requesterId }); setTimeout(() => { navLock.current = false; }, 800); }}
                    onContact={phone ? () => void handleCall(phone) : undefined}
                    contactDisabled={!phone}
                    likePath="feed_likes/profile_requests"
                    likeId={`${item.requesterId}_${sanitizeFirebaseKey(item.requestedAt)}`}
                  />
                </TouchableOpacity>
              );
            }

            const isOutgoing = activeTab === 'outgoing';
            const photo = isOutgoing
              ? (item.targetPhotoURL || avatarByUserId[item.targetUserId ?? ''] || '')
              : (item.requesterPhotoURL || avatarByUserId[item.requesterId] || '');
            const displayName = isOutgoing
              ? (item.targetName?.trim() || item.targetUserId || 'Unknown user')
              : item.requesterName;
            const displayId = isOutgoing ? (item.targetUserId ?? '') : item.requesterId;
            const phone = item.sharedContact;
            const hasContact = item.status === 'approved' && !!phone;
            const seenKey = `${item.requesterId}_${item.targetUserId ?? ''}_${item.requestedAt}`;
            const isSeen = seenContacts[seenKey] ?? false;
            const showBlink = isOutgoing && hasContact && !isSeen;

            const outgoingStatusKey = hasContact ? 'approved_contact' : item.status;
            const outgoingStatusLabel = OUTGOING_STATUS[outgoingStatusKey]?.[language] ?? outgoingStatusKey;
            const outgoingStatusBgStyle = hasContact
              ? styles.outgoingStatusContact
              : item.status === 'approved'
                ? styles.outgoingStatusApproved
                : item.status === 'denied'
                  ? styles.outgoingStatusDenied
                  : styles.outgoingStatusPending;

            // Elapsed time and viewed status (for outgoing pending cards)
            const elapsedText = item.status === 'pending' ? formatElapsed(item.requestedAt, language) : null;
            const viewedLabel = VIEWED_LABELS[language];
            const isViewedByTarget = Boolean(item.viewedAt);

            const descText: string | null = item.status === 'pending'
              ? PENDING_HINT[language]
              : (item.reason ? t.reasons[item.reason as ContactReason] : item.sourceTitle ?? null);
            const reasonText = item.reason ? t.reasons[item.reason as ContactReason] : null;
            const topicText = reasonText || item.sourceTitle?.trim() || t.notSpecified;
            const foundContactText = item.sourceTitle?.trim() || getProfileRequestContextLabel(item.context, language) || t.notSpecified;
            const transitionScreenText = getProfileRequestSourceLabel(item.sourceType, item.context, language, t.notSpecified);
            const statusIcon = item.status === 'approved'
              ? 'check-circle'
              : item.status === 'denied'
                ? 'close-circle-outline'
                : 'clock-outline';
            const statusIconColor = item.status === 'approved'
              ? '#2D7A46'
              : item.status === 'denied'
                ? '#A73737'
                : '#8A6D2A';

            const callLabel = language === 'en' ? 'Call' : language === 'ru' ? 'Позвонить' : 'Подзвонити';
            return (
              <View style={[styles.card, !isOutgoing && item.status === 'denied' && styles.cardDimmed]}>
                {/* Top: avatar + info */}
                <View style={styles.cardIncoming}>
                  {photo ? (
                    <AppPhotoImage
                      uri={photo}
                      style={styles.avatarMedium}
                      resizeMode="cover"
                      debugLabel={`ProfileRequest:${isOutgoing ? 'out' : 'hist'}:${displayId}`}
                    />
                  ) : (
                    <MiniUserAvatar
                      name={displayName}
                      size={56}
                      borderRadius={14}
                      backgroundColor="#6A8BA5"
                    />
                  )}

                  <View style={styles.incomingRight}>
                    {/* Name row */}
                    <View style={styles.incomingNameRow}>
                      <Text style={styles.incomingName} numberOfLines={1}>{displayName}</Text>
                      <View style={[styles.outgoingStatusBadge, outgoingStatusBgStyle]}>
                        <Text style={styles.outgoingStatusText}>{outgoingStatusLabel}</Text>
                      </View>
                      <View style={styles.incomingDateBadge}>
                        <Text style={styles.incomingDateText}>{formatTimeShort(item.requestedAt)}</Text>
                      </View>
                    </View>

                    {/* Elapsed time + viewed indicator (outgoing pending only) */}
                    {isOutgoing && item.status === 'pending' ? (
                      <View style={styles.outgoingMetaRow}>
                        {elapsedText ? (
                          <View style={styles.elapsedBadge}>
                            <MaterialCommunityIcons name="clock-outline" size={12} color="#8A7A6E" />
                            <Text style={styles.elapsedText}>{elapsedText}</Text>
                          </View>
                        ) : null}
                        <View style={[styles.viewedBadge, isViewedByTarget ? styles.viewedBadgeSeen : styles.viewedBadgeUnseen]}>
                          <MaterialCommunityIcons
                            name={isViewedByTarget ? 'eye-check' : 'eye-off-outline'}
                            size={12}
                            color={isViewedByTarget ? '#2D7A46' : '#A09080'}
                          />
                          <Text style={[styles.viewedText, isViewedByTarget && styles.viewedTextSeen]}>
                            {isViewedByTarget ? viewedLabel.seen : viewedLabel.notSeen}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Description / hint */}
                    {descText ? (
                      <View style={styles.descriptionBox}>
                        <Text style={[styles.descriptionText, item.status === 'pending' && styles.descriptionHint]} numberOfLines={2}>
                          {descText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.requestMetaBox}>
                  <View style={styles.requestMetaRow}>
                    <Text style={styles.requestMetaLabel}>{t.topicLabel}</Text>
                    <Text style={styles.requestMetaValue}>{topicText}</Text>
                  </View>
                  <View style={styles.requestMetaRow}>
                    <Text style={styles.requestMetaLabel}>{t.foundContactLabel}</Text>
                    <Text style={styles.requestMetaValue}>{foundContactText}</Text>
                  </View>
                  <View style={styles.requestMetaRow}>
                    <Text style={styles.requestMetaLabel}>{t.transitionScreenLabel}</Text>
                    <Text style={styles.requestMetaValue}>{transitionScreenText}</Text>
                  </View>
                </View>

                <View style={[
                  styles.responseStatusBox,
                  item.status === 'approved'
                    ? styles.responseStatusApproved
                    : item.status === 'denied'
                      ? styles.responseStatusDenied
                      : styles.responseStatusPending,
                ]}>
                  <View style={styles.responseStatusTitleRow}>
                    <MaterialCommunityIcons name={statusIcon} size={18} color={statusIconColor} />
                    <Text style={[
                      styles.responseStatusTitle,
                      item.status === 'denied' && styles.responseStatusDeniedTitle,
                      item.status === 'pending' && styles.responseStatusPendingTitle,
                    ]}>
                      {outgoingStatusLabel}
                    </Text>
                  </View>
                  <Text style={styles.responseStatusTopic}>
                    {item.status === 'approved' ? t.contactOpenedByTopic : t.topicLabel} {topicText}
                  </Text>
                  {item.status === 'pending' ? (
                    <Text style={styles.responseStatusHint}>
                      {isViewedByTarget ? viewedLabel.seen : viewedLabel.notSeen}
                    </Text>
                  ) : null}
                </View>

                <UserCardActionBar
                  avatarUri={photo || ''}
                  name={displayName}
                  userId={displayId}
                  currentUserId={currentUserId}
                  language={language}
                  onProfile={displayId ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: displayId }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
                  onContact={phone ? () => {
                    if (showBlink) void markSeen(seenKey);
                    Alert.alert(
                      language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатися",
                      phone,
                      [
                        { text: callLabel, onPress: () => void handleCall(phone) },
                        { text: 'Viber', onPress: () => void handleViber(phone) },
                        { text: language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати', style: 'cancel' },
                      ]
                    );
                  } : undefined}
                  contactDisabled={!phone}
                  likePath="feed_likes/profile_requests"
                  likeId={`${displayId}_${sanitizeFirebaseKey(item.requestedAt)}`}
                />
              </View>
            );
          }}
        />
      )}
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  header: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#EFE3D3',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  tabBtnActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7A6D64',
  },
  tabBtnTextActive: {
    color: '#fff',
  },
  clearHistoryBtn: {
    marginHorizontal: 12,
    marginTop: 2,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7B6AE',
    backgroundColor: '#FFF1EF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  clearHistoryBtnDisabled: {
    opacity: 0.65,
  },
  clearHistoryText: {
    color: '#A73737',
    fontSize: 13,
    fontWeight: '900',
  },
  filtersBlock: { paddingHorizontal: 12, paddingBottom: 4, gap: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '800', color: '#6A5C54', marginRight: 2 },
  filterChip: {
    backgroundColor: '#F1E5D6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#6A5C54' },
  filterChipTextActive: { color: '#fff' },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  authGateTitle: {
    color: '#2D2520',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  authGateText: {
    color: '#7A6D64',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  authGateButton: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  authGateButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyText: { color: '#4A3D37', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyHint: { color: '#7A6D64', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  list: { padding: 14, paddingBottom: 100 },
  card: {
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    padding: 8,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTop: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  topLeft: { justifyContent: 'flex-start', paddingTop: 1 },
  avatar: { width: 26, height: 26, borderRadius: 9 },
  avatarFallback: { backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '900' },
  info: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { flex: 1, fontSize: 13, fontWeight: '800', color: '#2D2520' },
  phoneInlineAction: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#403933',
  },
  viberInlineAction: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7360F2',
  },
  phoneInlineActionDisabled: {
    opacity: 0.45,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#DDEAF0',
    color: '#3D5D87',
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPending: { backgroundColor: '#F0E8D8' },
  statusApproved: { backgroundColor: '#F5E8B8' },
  statusDenied: { backgroundColor: '#FBE1DE' },
  statusBadgeText: { fontSize: 10, fontWeight: '800', color: '#5B4D45' },
  listingAbout: { fontSize: 11, color: '#7A6D64', lineHeight: 14 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D6E3E',
  },
  phoneTextEmpty: {
    color: '#B0A090',
    fontWeight: '600',
  },
  // Incoming card — redesigned layout
  cardIncoming: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  avatarMedium: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  incomingRight: {
    flex: 1,
    gap: 5,
  },
  incomingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  incomingName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D2520',
    flexShrink: 1,
  },
  incomingNameSep: {
    width: 1,
    height: 12,
    backgroundColor: '#C8BAB0',
  },
  incomingVotesText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6D64',
    flexShrink: 0,
  },
  incomingDateBadge: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
  },
  incomingDateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3D5D87',
  },
  descriptionBox: {
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: ACCENT,
    minHeight: 42,
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 19,
    fontWeight: '900',
  },
  requestMetaBox: {
    borderWidth: 1,
    borderColor: '#E4D0AB',
    borderRadius: 8,
    backgroundColor: '#FFF9F1',
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 4,
    marginBottom: 7,
  },
  requestMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  requestMetaLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4A3D37',
    minWidth: 104,
  },
  requestMetaValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6D64',
    lineHeight: 15,
  },
  responseActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 7,
  },
  responseBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  responseBtnApprove: {
    backgroundColor: '#2D7A46',
  },
  responseBtnDeny: {
    backgroundColor: '#FFF1EF',
    borderWidth: 1,
    borderColor: '#E7B6AE',
  },
  responseBtnDisabled: {
    opacity: 0.65,
  },
  responseBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  responseBtnDenyText: {
    color: '#A73737',
    fontSize: 13,
    fontWeight: '900',
  },
  responseStatusBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    marginBottom: 7,
  },
  responseStatusApproved: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A8D5B5',
  },
  responseStatusDenied: {
    backgroundColor: '#FFF1EF',
    borderColor: '#E7B6AE',
  },
  responseStatusPending: {
    backgroundColor: '#FFF7E3',
    borderColor: '#E6C982',
  },
  responseStatusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responseStatusTitle: {
    color: '#2D7A46',
    fontSize: 13,
    fontWeight: '900',
  },
  responseStatusDeniedTitle: {
    color: '#A73737',
  },
  responseStatusPendingTitle: {
    color: '#8A6D2A',
  },
  responseStatusTopic: {
    color: '#4A3D37',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  responseStatusHint: {
    color: '#7A6D64',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  incomingActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtnOutlined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D4B9A8',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  actionBtnOutlinedDisabled: {
    opacity: 0.45,
  },
  actionBtnOutlinedText: {
    fontSize: 11,
    fontWeight: '800',
    color: ACCENT,
  },
  actionBtnDisabledText: {
    color: '#B0A090',
  },
  actionBtnViber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#7360F2',
  },
  actionBtnViberDisabled: {
    backgroundColor: '#CCBEB2',
  },
  actionBtnViberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  actionBtnHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C47F61',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto' as const,
  },
  // Outgoing / history card extras
  cardDimmed: {
    opacity: 0.65,
  },
  outgoingStatusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  outgoingStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3D4A3D',
  },
  outgoingStatusPending: {
    backgroundColor: '#F5F0E8',
    borderColor: '#E4D0AB',
  },
  outgoingStatusApproved: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A8D5B5',
  },
  outgoingStatusContact: {
    backgroundColor: '#D4EDDA',
    borderColor: '#7EC89A',
  },
  outgoingStatusDenied: {
    backgroundColor: '#EEEBE7',
    borderColor: '#D4C5B8',
  },
  descriptionHint: {
    color: '#F8EAF4',
    fontStyle: 'normal',
  },
  outgoingMetaRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  elapsedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F0E8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  elapsedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A7A6E',
  },
  viewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewedBadgeSeen: {
    backgroundColor: '#E8F5E9',
  },
  viewedBadgeUnseen: {
    backgroundColor: '#F5F0E8',
  },
  viewedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A09080',
  },
  viewedTextSeen: {
    color: '#2D7A46',
  },
  // Blinking phone button
  blinkPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#C47F61',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  blinkPhoneBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
