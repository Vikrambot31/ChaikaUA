import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { firebaseChatAPI } from '../firebase-config';
import { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import {
  ChatRequestLike,
  filterChatRequests,
  getChatRequestTimestamp,
  normalizeChatRequests,
} from '../utils/chatRequests';
import TactileIcon from '../components/TactileIcon';
import { FeatureRatingBanner } from '../components/FeatureRatingBanner';
import TactileCard from '../components/TactileCard';
import TactileInput from '../components/TactileInput';
import TactileButton from '../components/TactileButton';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { getUserErrorMessage, showUserError } from '../utils/userFacingErrors';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone } from '../utils/communicationActions';
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';
import AppPhotoImage from '../components/AppPhotoImage';
import FeedLikeButton from '../components/FeedLikeButton';
import { normalizeLanguage } from '../redux/slices/languageSlice';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { requireAuthForDetails } from '../utils/authGuard';
import GuestRegisterBanner from '../components/GuestRegisterBanner';
import { useGuestGuard } from '../hooks/useGuestGuard';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';

type ChatRequest = ChatRequestLike;

type ChatNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'Онлайн чат заявок',
    search: 'Пошук заявок...',
    empty: 'Нових заявок поки немає',
    add: 'Додати заявку',
    noDescription: 'Без опису',
    loadFailed: 'Не вдалося завантажити заявки.',
    retry: 'Спробувати ще раз',
    loadMore: 'Завантажити ще',
    requestsCount: 'заявок',
    timeMinute: 'хв',
    timeHour: 'год',
    timeDay: 'дн',
    allLabel: 'Всі',
    categories: [
      { id: 'repair', label: 'Ремонт', icon: 'wrench-outline' },
      { id: 'medical', label: 'Медична', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Прибирання', icon: 'broom' },
      { id: 'delivery', label: 'Доставка', icon: 'package-variant' },
      { id: 'legal', label: 'Юрист', icon: 'scale-balance' },
      { id: 'care', label: 'Догляд', icon: 'heart-outline' },
      { id: 'tech', label: 'Техніка', icon: 'laptop' },
      { id: 'electricity', label: 'Світло', icon: 'transmission-tower' },
      { id: 'moving', label: 'Переїзд', icon: 'truck-outline' },
      { id: 'other', label: 'Інше', icon: 'dots-horizontal' },
    ],
  },
  ru: {
    title: 'Онлайн чат заявок',
    search: 'Поиск заявок...',
    empty: 'Новых заявок пока нет',
    add: 'Добавить заявку',
    noDescription: 'Без описания',
    loadFailed: 'Не удалось загрузить заявки.',
    retry: 'Повторить',
    loadMore: 'Загрузить ещё',
    requestsCount: 'заявок',
    timeMinute: 'мин',
    timeHour: 'ч',
    timeDay: 'дн',
    allLabel: 'Все',
    categories: [
      { id: 'repair', label: 'Ремонт', icon: 'wrench-outline' },
      { id: 'medical', label: 'Медицина', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Уборка', icon: 'broom' },
      { id: 'delivery', label: 'Доставка', icon: 'package-variant' },
      { id: 'legal', label: 'Юрист', icon: 'scale-balance' },
      { id: 'care', label: 'Уход', icon: 'heart-outline' },
      { id: 'tech', label: 'Техника', icon: 'laptop' },
      { id: 'electricity', label: 'Свет', icon: 'transmission-tower' },
      { id: 'moving', label: 'Переезд', icon: 'truck-outline' },
      { id: 'other', label: 'Другое', icon: 'dots-horizontal' },
    ],
  },
  en: {
    title: 'Online request chat',
    search: 'Search requests...',
    empty: 'No new requests yet',
    add: 'Add request',
    noDescription: 'No description',
    loadFailed: 'Failed to load requests.',
    retry: 'Try again',
    loadMore: 'Load more',
    requestsCount: 'requests',
    timeMinute: 'min',
    timeHour: 'h',
    timeDay: 'd',
    allLabel: 'All',
    categories: [
      { id: 'repair', label: 'Repair', icon: 'wrench-outline' },
      { id: 'medical', label: 'Medical', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Cleaning', icon: 'broom' },
      { id: 'delivery', label: 'Delivery', icon: 'package-variant' },
      { id: 'legal', label: 'Legal', icon: 'scale-balance' },
      { id: 'care', label: 'Care', icon: 'heart-outline' },
      { id: 'tech', label: 'Tech', icon: 'laptop' },
      { id: 'electricity', label: 'Power', icon: 'transmission-tower' },
      { id: 'moving', label: 'Moving', icon: 'truck-outline' },
      { id: 'other', label: 'Other', icon: 'dots-horizontal' },
    ],
  },
} as const;

const PAGE_SIZE = 20;
const CATEGORY_STORAGE_KEY = 'online-chat:selected-category';

const TOPIC_LABELS = {
  ua: {
    going_shopping: 'Фудшеринг',
    ride_share: 'Підвезу',
    need_ride: 'Потрібна машина',
    parking_help: 'Паркування',
    parcel_delivery: 'Доставка',
    plumbing: 'Сантехніка',
    electrical: 'Електрика',
    locks_doors: 'Замки і двері',
    windows_balconies: 'Вікна і балкони',
    home_appliances: 'Побутова техніка',
    furniture: 'Меблі',
    small_repair: 'Дрібний ремонт',
    cleaning: 'Прибирання',
    trash_removal: 'Вивіз речей',
    laundry: 'Прання',
    plants: 'Рослини',
    childcare: 'Допомога дітям',
    elderly_help: 'Допомога літнім',
    psychological_support: 'Психологічна підтримка',
    medical_consultation: 'Медична консультація',
    medicine: 'Ліки',
    dog_walking: 'Вигул собаки',
    pet_care: 'Догляд за тваринами',
    found_pet: 'Знайдено тварину',
    lost_pet: 'Шукають тварину',
    free_items: 'Віддам безкоштовно',
    borrow_tool: 'Позичити інструмент',
    item_exchange: 'Обмін речами',
    lost_item: 'Загублена річ',
    found_item: 'Знайдена річ',
    elevator: 'Ліфт',
    noise: 'Шум',
    parking_blocked: 'Паркування',
    yard_trash: 'Двір / сміття',
    yard_lighting: 'Освітлення',
    power_on: 'Світло є',
    power_off: 'Світла нема',
    management_request: 'Звернення до управи',
    tutoring: 'Репетитор',
    job_search: 'Пошук роботи',
    sports_company: 'Спорт',
    creative_club: 'Творчий гурток',
    master_services: 'Майстер',
    legal_consultation: 'Юридична консультація',
    documents: 'Документи',
    problem: 'Проблеми ЖК',
    contacts: 'Контакти',
    buy_sell: 'Куплю / продам',
    lost_found: 'Загублено / знайдено',
    help_neighbors: 'Допомога',
    transport: 'Транспорт',
    repair: 'Ремонт',
    care: 'Турбота',
    pets: 'Тварини',
    foodsharing: 'Фудшеринг',
    other: 'Заявка',
  },
  ru: {
    going_shopping: 'Фудшеринг',
    ride_share: 'Подвезу',
    need_ride: 'Нужна машина',
    parking_help: 'Парковка',
    parcel_delivery: 'Доставка',
    plumbing: 'Сантехника',
    electrical: 'Электрика',
    locks_doors: 'Замки и двери',
    windows_balconies: 'Окна и балконы',
    home_appliances: 'Бытовая техника',
    furniture: 'Мебель',
    small_repair: 'Мелкий ремонт',
    cleaning: 'Уборка',
    trash_removal: 'Вывоз вещей',
    laundry: 'Стирка',
    plants: 'Растения',
    childcare: 'Помощь детям',
    elderly_help: 'Помощь пожилым',
    psychological_support: 'Психологическая поддержка',
    medical_consultation: 'Медицинская консультация',
    medicine: 'Лекарства',
    dog_walking: 'Выгул собаки',
    pet_care: 'Уход за животными',
    found_pet: 'Найдено животное',
    lost_pet: 'Ищут животное',
    free_items: 'Отдам бесплатно',
    borrow_tool: 'Одолжить инструмент',
    item_exchange: 'Обмен вещами',
    lost_item: 'Потерянная вещь',
    found_item: 'Найденная вещь',
    elevator: 'Лифт',
    noise: 'Шум',
    parking_blocked: 'Парковка',
    yard_trash: 'Двор / мусор',
    yard_lighting: 'Освещение',
    power_on: 'Свет есть',
    power_off: 'Света нет',
    management_request: 'Обращение в управление',
    tutoring: 'Репетитор',
    job_search: 'Поиск работы',
    sports_company: 'Спорт',
    creative_club: 'Творческий кружок',
    master_services: 'Мастер',
    legal_consultation: 'Юридическая консультация',
    documents: 'Документы',
    problem: 'Проблемы ЖК',
    contacts: 'Контакты',
    buy_sell: 'Куплю / продам',
    lost_found: 'Потеряно / найдено',
    help_neighbors: 'Помощь',
    transport: 'Транспорт',
    repair: 'Ремонт',
    care: 'Забота',
    pets: 'Животные',
    foodsharing: 'Фудшеринг',
    other: 'Заявка',
  },
  en: {
    going_shopping: 'Foodsharing',
    ride_share: 'Ride offer',
    need_ride: 'Need a ride',
    parking_help: 'Parking',
    parcel_delivery: 'Delivery',
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    locks_doors: 'Locks and doors',
    windows_balconies: 'Windows',
    home_appliances: 'Appliances',
    furniture: 'Furniture',
    small_repair: 'Small repair',
    cleaning: 'Cleaning',
    trash_removal: 'Trash removal',
    laundry: 'Laundry',
    plants: 'Plants',
    childcare: 'Childcare',
    elderly_help: 'Elderly help',
    psychological_support: 'Support',
    medical_consultation: 'Medical advice',
    medicine: 'Medicine',
    dog_walking: 'Dog walking',
    pet_care: 'Pet care',
    found_pet: 'Found pet',
    lost_pet: 'Lost pet',
    free_items: 'Free items',
    borrow_tool: 'Borrow a tool',
    item_exchange: 'Item exchange',
    lost_item: 'Lost item',
    found_item: 'Found item',
    elevator: 'Elevator',
    noise: 'Noise',
    parking_blocked: 'Parking',
    yard_trash: 'Yard / trash',
    yard_lighting: 'Yard lighting',
    power_on: 'Power on',
    power_off: 'Power off',
    management_request: 'Management request',
    tutoring: 'Tutoring',
    job_search: 'Job search',
    sports_company: 'Sport',
    creative_club: 'Creative club',
    master_services: 'Master services',
    legal_consultation: 'Legal advice',
    documents: 'Documents',
    problem: 'Building issue',
    contacts: 'Contacts',
    buy_sell: 'Buy / sell',
    lost_found: 'Lost / found',
    help_neighbors: 'Help',
    transport: 'Transport',
    repair: 'Repair',
    care: 'Care',
    pets: 'Pets',
    foodsharing: 'Foodsharing',
    other: 'Request',
  },
} as const;

const normalizeTopicKey = (value?: string | null) =>
  String(value || '').trim().toLowerCase();

const TOPIC_ALIASES: Record<string, keyof typeof TOPIC_LABELS.ua> = {
  shopping: 'going_shopping',
  delivery_shopping: 'going_shopping',
  grocery: 'going_shopping',
  groceries: 'going_shopping',
  food_sharing: 'going_shopping',
  foodshare: 'going_shopping',
};

const resolveTopicKey = (value?: string | null): keyof typeof TOPIC_LABELS.ua | 'other' => {
  const normalized = normalizeTopicKey(value);
  if (!normalized) return 'other';
  if (normalized in TOPIC_ALIASES) return TOPIC_ALIASES[normalized];
  if (normalized in TOPIC_LABELS.ua) return normalized as keyof typeof TOPIC_LABELS.ua;
  return 'other';
};

const formatTopicLabel = (key: string, language: keyof typeof TOPIC_LABELS) => {
  const labels = TOPIC_LABELS[language] ?? TOPIC_LABELS.ua;
  const topicKey = resolveTopicKey(key);
  return labels[topicKey] ?? TOPIC_LABELS.ua[topicKey] ?? TOPIC_LABELS.ua.other;
};

const TECHNICAL_DESCRIPTION_PREFIXES = new Set(['text', 'description', 'desc', 'category', 'subcategory', 'group', 'topic']);

const isKnownTopicKey = (key?: string | null) => {
  const normalized = normalizeTopicKey(key);
  if (!normalized) return false;
  return normalized in TOPIC_ALIASES || normalized in TOPIC_LABELS.ua;
};

const stripChatDescriptionPrefix = (value: string) => {
  const raw = value.trim();
  const bracketMatch = raw.match(/^\[([^\]]+)]\s*(.*)$/);
  if (!bracketMatch) return raw;

  const prefixKey = normalizeTopicKey(bracketMatch[1]);
  const rest = (bracketMatch[2] || '').trim();
  const shouldStripPrefix = TECHNICAL_DESCRIPTION_PREFIXES.has(prefixKey) || isKnownTopicKey(prefixKey);

  return shouldStripPrefix ? rest : raw;
};

const splitChatTopic = (item: ChatRequest, language: keyof typeof TOPIC_LABELS) => {
  const rawText = String(item.description || item.text || '').trim();
  const bracketMatch = rawText.match(/^\[([^\]]+)]\s*(.*)$/);
  const explicitTopic = isKnownTopicKey(bracketMatch?.[1]) ? bracketMatch?.[1]?.trim() : undefined;
  const cleanDescription = stripChatDescriptionPrefix(rawText);
  const topicKey = resolveTopicKey(item.subcategory || item.category || item.group || explicitTopic);
  return {
    topic: formatTopicLabel(topicKey, language),
    description: cleanDescription,
  };
};

const isProblemChatRequest = (item: ChatRequest) =>
  item.category === 'problem' || item.group === 'problems';

const isLostFoundChatRequest = (item: ChatRequest) =>
  item.category === 'lost_found' || item.group === 'lost_found';

const getProblemTitle = (item: ChatRequest, fallback: string) =>
  String(item.sourceTitle || item.description || item.text || fallback).trim();

const getProblemAddressParts = (item: ChatRequest) => {
  const building = String(item.building || '').trim();
  const [street, ...rest] = building.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    street: street || building,
    house: rest.join(', '),
  };
};

const getLostFoundType = (item: ChatRequest): 'lost' | 'found' =>
  item.sourceType === 'found' || item.subcategory === 'found' ? 'found' : 'lost';

const getLostFoundTypeLabel = (type: 'lost' | 'found', language: keyof typeof TOPIC_LABELS) => {
  if (language === 'en') return type === 'lost' ? 'Lost' : 'Found';
  if (language === 'ru') return type === 'lost' ? 'Потеряно' : 'Найдено';
  return type === 'lost' ? 'Загублено' : 'Знайдено';
};

const getLostFoundItemLabel = (item: ChatRequest, language: keyof typeof TOPIC_LABELS) =>
  String(item.sourceCategory || item.sourceTitle || formatTopicLabel(item.subcategory || 'lost_found', language)).trim();

const getLostFoundDescription = (item: ChatRequest) => {
  const direct = String(item.sourceDescription || '').trim();
  if (direct) return direct;
  return stripChatDescriptionPrefix(String(item.description || item.text || '').trim());
};

const OnlineChatScreen = () => {
  const navigation = useNavigation<ChatNavigation>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => normalizeLanguage(state.language?.current)) as 'ua' | 'ru' | 'en';
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { guard: guestGuard, bannerVisible: guestBannerVisible, hideBanner: hideGuestBanner } = useGuestGuard();
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const currentUserAvatarUri = pickUserAvatarUri(currentUser);
  const hasCurrentUserAvatar = Boolean(currentUserAvatarUri);
  const avatarRequiredText = language === 'en'
    ? {
        title: 'Avatar required',
        body: 'Add a profile photo before creating a request in chat.',
        action: 'Open profile',
      }
    : language === 'ru'
      ? {
          title: 'Нужна аватарка',
          body: 'Добавьте фото профиля перед созданием заявки в чате.',
          action: 'Открыть профиль',
        }
      : {
          title: 'Потрібна аватарка',
          body: 'Додайте фото профілю перед створенням заявки в чаті.',
          action: 'Відкрити профіль',
        };
  const deleteText = language === 'en'
    ? {
        action: 'Delete',
        title: 'Delete request?',
        body: 'It will disappear from the requests chat for everyone.',
        error: 'Failed to delete request.',
        cancel: 'Cancel',
      }
    : language === 'ru'
      ? {
          action: 'Удалить',
          title: 'Удалить заявку?',
          body: 'Она исчезнет из чата заявок для всех.',
          error: 'Не удалось удалить заявку.',
          cancel: 'Отмена',
        }
      : {
          action: 'Видалити',
          title: 'Видалити заявку?',
          body: 'Вона зникне з чату заявок для всіх.',
          error: 'Не вдалося видалити заявку.',
          cancel: 'Скасувати',
        };
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<ChatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addRequestNavLock = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const avatarByUserId = useUserAvatarMap(requests.map((item) => item.userId));
  const [actionModal, setActionModal] = useState<{ visible: boolean; userId: string; userName: string }>({ visible: false, userId: '', userName: '' });

  const loadRequests = async (cursorBefore: number | null = null) => {
    const result = await firebaseChatAPI.getRequestsPaginated({
      limit: PAGE_SIZE + 1,
      cursorBefore,
    });
    if (!result.success) {
      setLoadError(getUserErrorMessage(language, 'load', result.error));
      return false;
    }
    const normalized = normalizeChatRequests(result.data as ChatRequest[])
      .filter((r) => !r.status || r.status === 'approved');
    const page = normalized.slice(0, PAGE_SIZE);
    const oldestTimestamp = page.length > 0 ? getChatRequestTimestamp(page[page.length - 1]) : null;

    setRequests((prev) => {
      if (!cursorBefore) return page;
      const seen = new Set(prev.map((item) => item.id));
      return [...prev, ...page.filter((item) => !seen.has(item.id))];
    });
    setNextCursor(oldestTimestamp);
    setHasMore(normalized.length > PAGE_SIZE && oldestTimestamp !== null);
    setLoadError(null);
    return true;
  };

  // Store loadFailed text in ref so the timeout callback always uses the current value
  // without needing it in the dependency array (which would re-fetch on every language change)
  const loadFailedRef = useRef(text.loadFailed);
  useEffect(() => { loadFailedRef.current = text.loadFailed; }, [text.loadFailed]);

  const hasInitialLoadRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      setLoading(false);
      setLoadError(loadFailedRef.current);
    }, 8000);

    void loadRequests().finally(() => {
      clearTimeout(timeout);
      setLoading(false);
      hasInitialLoadRef.current = true;
    });

    return () => {
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch approved requests when navigating back to this screen
  // (e.g., after moderator rejected items on the moderation screen)
  useFocusEffect(
    useCallback(() => {
      if (hasInitialLoadRef.current) {
        setNextCursor(null);
        setHasMore(true);
        void loadRequests();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    setNextCursor(null);
    await loadRequests();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || loading || refreshing || !hasMore) return;

    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await loadRequests(nextCursor);
    } catch {
      // loadRequests handles its own errors internally
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setFilteredRequests(filterChatRequests(requests, debouncedSearch, selectedCategory));
  }, [requests, debouncedSearch, selectedCategory]);

  useEffect(() => {
    let active = true;
    const loadCategory = async () => {
      try {
        const savedCategory = await AsyncStorage.getItem(CATEGORY_STORAGE_KEY);
        if (active && savedCategory) {
          const exists = text.categories.some((category) => category.id === savedCategory);
          setSelectedCategory(exists ? savedCategory : null);
        }
      } catch {
        // ignore storage errors for optional UX preference
      }
    };

    void loadCategory();
    return () => {
      active = false;
    };
  }, [text.categories]);

  useEffect(() => {
    const persistCategory = async () => {
      try {
        if (selectedCategory) {
          await AsyncStorage.setItem(CATEGORY_STORAGE_KEY, selectedCategory);
        } else {
          await AsyncStorage.removeItem(CATEGORY_STORAGE_KEY);
        }
      } catch {
        // ignore storage errors for optional UX preference
      }
    };
    void persistCategory();
  }, [selectedCategory]);

  // Clear pending debounce on unmount to avoid state update on unmounted component
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setIsCategoryMenuOpen(false);
  };

  const isOwnRequest = (item: ChatRequest) => {
    if (!currentUser?.id) return false;
    return Boolean(item.userId) && item.userId === currentUser.id;
  };

  const handleDeleteRequest = useCallback(async (requestId: string) => {
    setDeleteBusyId(requestId);
    try {
      const result = await firebaseChatAPI.deleteRequest(requestId);
      if (!result.success) {
        showUserError(language, 'delete', result.error || deleteText.error);
        return;
      }
      setRequests((prev) => prev.filter((item) => item.id !== requestId));
    } catch (error) {
      showUserError(language, 'delete', error);
    } finally {
      setDeleteBusyId(null);
    }
  }, [deleteText.error, language]);

  const handleViewProfile = useCallback((userId: string) => {
    if (!requireAuthForDetails({ userId: currentUser?.id, navigation, language })) return;
    setActionModal({ visible: false, userId: '', userName: '' });
    navigation.navigate('ViewUserProfile', { userId });
  }, [currentUser?.id, language, navigation]);

  const handleContact = useCallback((userId: string, name: string) => {
    if (!requireAuthForDetails({ userId: currentUser?.id, navigation, language })) return;
    setActionModal({ visible: false, userId: '', userName: '' });
    openContactModal({ userId, name, photoURL: avatarByUserId[userId] || undefined, sourceType: 'help' });
  }, [avatarByUserId, currentUser?.id, language, navigation, openContactModal]);

  const handleDelete = (requestId: string) => {
    Alert.alert(deleteText.title, deleteText.body, [
      { text: deleteText.cancel, style: 'cancel' },
      {
        text: deleteText.action,
        style: 'destructive',
        onPress: () => { void handleDeleteRequest(requestId); },
      },
    ]);
  };

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff <= 0) return `0 ${text.timeMinute}`;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return `${minutes} ${text.timeMinute}`;
    if (hours < 24) return `${hours} ${text.timeHour}`;
    return `${days} ${text.timeDay}`;
  };

  const counterText = useMemo(
    () => `${filteredRequests.length} ${text.requestsCount}`,
    [filteredRequests.length, text.requestsCount]
  );

  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    text.categories.forEach((category) => {
      map[category.id] = category.label;
    });
    return map;
  }, [text.categories]);

  const selectedCategoryLabel = selectedCategory
    ? (categoryLabelMap[selectedCategory] ?? text.allLabel)
    : text.allLabel;

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        {LIGHT_ORBS.map((orb, index) => (
          <View
            key={index}
            style={[
              styles.orb,
              {
                width: orb.size,
                height: orb.size,
                backgroundColor: orb.color,
                top: orb.top,
                left: orb.left,
                right: orb.right,
                bottom: orb.bottom,
              },
            ]}
          />
        ))}
      </View>

      <TactileCard elevated style={styles.headerCard} pressable={false}>
        <Text style={styles.headerTitle}>{text.title}</Text>
      </TactileCard>

      {loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={styles.loader} />
      ) : loadError ? (
        <TactileCard elevated={false} style={styles.emptyState} pressable={false}>
          <TactileIcon icon="alert-circle-outline" size={54} iconSize={26} backgroundColor="#403933" />
          <Text style={styles.emptyStateText}>{loadError}</Text>
          <TactileButton
            title={text.retry}
            onPress={() => void handleRefresh()}
            variant="secondary"
            style={styles.retryButton}
          />
        </TactileCard>
      ) : filteredRequests.length === 0 ? (
        <TactileCard elevated={false} style={styles.emptyState} pressable={false}>
          <TactileIcon icon="message-text-outline" size={54} iconSize={26} backgroundColor="#403933" />
          <Text style={styles.emptyStateText}>{text.empty}</Text>
        </TactileCard>
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={SCREEN_THEME.terracotta}
            />
          }
          ListHeaderComponent={
            <View>
              <TactileCard elevated={false} style={styles.searchCard} pressable={false}>
                <TactileIcon icon="magnify" size={38} iconSize={17} backgroundColor="#403933" />
                <View style={styles.searchInputWrap}>
                  <TactileInput
                    placeholder={text.search}
                    value={searchText}
                    onChangeText={handleSearch}
                    style={{ borderWidth: 0, backgroundColor: 'transparent', marginBottom: 0 }}
                  />
                </View>
              </TactileCard>

              <View style={styles.filterWrap}>
                <TouchableOpacity
                  style={styles.categoryPickerButton}
                  onPress={() => { setIsCategoryMenuOpen(true); }}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons name="view-grid-outline" size={14} color={SCREEN_THEME.textSecondary} style={styles.filterIcon} />
                  <Text style={styles.filterButtonText}>{selectedCategoryLabel}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color={SCREEN_THEME.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.counter}>{counterText}</Text>
            </View>
          }
          ListFooterComponent={
            <>
              {!loading && !loadError && filteredRequests.length > 0 && hasMore ? (
                <TactileButton
                  title={loadingMore ? '...' : text.loadMore}
                  onPress={() => void handleLoadMore()}
                  variant="secondary"
                  disabled={loadingMore}
                  style={styles.loadMoreButton}
                />
              ) : null}
              <FeatureRatingBanner screenId="chat" />
            </>
          }
          renderItem={({ item }) => {
            const timestamp = getChatRequestTimestamp(item) || Date.now();
            const { topic, description } = splitChatTopic(item, language);
            const timeAgo = getTimeAgo(timestamp);
            const own = isOwnRequest(item);
            const hasPhoto = Boolean(item.photoUri || item.photoStoragePath);
            const avatarUri = item.userId
              ? ((item.userId && avatarByUserId[item.userId]) || pickUserAvatarUri(item))
              : '';
            const canContact = !own && Boolean(item.userId);

            if (isProblemChatRequest(item)) {
              const title = getProblemTitle(item, description || topic);
              const address = getProblemAddressParts(item);

              return (
                <View style={[styles.problemChatCard, !hasPhoto && styles.problemChatCardNoPhoto]}>
                  <TouchableOpacity
                    style={[styles.problemChatTopRow, !hasPhoto && styles.problemChatTopRowNoPhoto]}
                    onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('RequestDetail', { request: item }); setTimeout(() => { navLock.current = false; }, 800); }}
                    activeOpacity={0.86}
                  >
                    {hasPhoto ? (
                      <View style={styles.problemChatVisualWrap}>
                        <AppPhotoImage
                          uri={item.photoUri}
                          storagePath={item.photoStoragePath}
                          style={styles.problemChatPhoto}
                          resizeMode="cover"
                          debugLabel={`OnlineChatProblem:${item.id}`}
                          showDebugInfo={false}
                        />
                      </View>
                    ) : null}

                    <View style={[styles.problemChatCopy, !hasPhoto && styles.problemChatCopyNoPhoto]}>
                      <View style={styles.problemChatTitleBox}>
                        <Text style={styles.problemChatTitle} numberOfLines={2}>{title}</Text>
                      </View>
                      <View style={styles.problemChatAddressRow}>
                        {!!address.street && <Text style={styles.problemChatAddressStreet} numberOfLines={1}>{address.street}</Text>}
                        {!!address.house && <Text style={styles.problemChatAddressHouse} numberOfLines={1}>{address.house}</Text>}
                      </View>
                      <View style={styles.problemChatMetaRow}>
                        <Text style={styles.problemChatMetaText} numberOfLines={1}>{topic} - {timeAgo}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.problemChatActionsRow}>
                    <View style={styles.problemChatActionsInner}>
                      <MiniUserAvatar uri={avatarUri} name={item.name || ''} size={42} borderRadius={14} backgroundColor="#6A8BA5" />
                      <TouchableOpacity
                        style={[styles.problemChatActionPill, styles.problemChatProfilePill, !item.userId && styles.problemChatActionPillDisabled]}
                        onPress={(event) => { event.stopPropagation(); if (!item.userId || navLock.current || !requireAuthForDetails({ userId: currentUser?.id, navigation, language })) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.userId }); setTimeout(() => { navLock.current = false; }, 800); }}
                        disabled={!item.userId}
                        activeOpacity={item.userId ? 0.78 : 1}
                      >
                        <MaterialCommunityIcons name="badge-account-horizontal-outline" size={15} color="#7A1E5C" />
                        <Text style={styles.problemChatActionText} numberOfLines={1}>{language === 'en' ? 'Profile' : language === 'ru' ? 'Профиль' : 'Профіль'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.problemChatActionPill, styles.problemChatContactPill, (!item.userId && !item.phone) && styles.problemChatActionPillDisabled]}
                        onPress={(event) => {
                          event.stopPropagation();
                          if (!requireAuthForDetails({ userId: currentUser?.id, navigation, language })) return;
                          if (item.userId && !own) {
                            openContactModal({ userId: item.userId, name: item.name ?? 'Unknown', photoURL: avatarUri || undefined, sourceType: 'help', sourceId: item.id, sourceTitle: title });
                            return;
                          }
                          if (item.phone) void safeCallPhone(item.phone, language);
                        }}
                        disabled={!item.userId && !item.phone}
                        activeOpacity={item.userId || item.phone ? 0.78 : 1}
                      >
                        <MaterialCommunityIcons name="message-text-outline" size={15} color="#FFFFFF" />
                        <Text style={[styles.problemChatActionText, styles.problemChatContactText]} numberOfLines={1}>{language === 'en' ? 'Contact' : language === 'ru' ? 'Связаться' : "Зв'язатися"}</Text>
                      </TouchableOpacity>
                      <FeedLikeButton
                        currentUserId={currentUser?.id}
                        likePath="feed_likes/requests"
                        likeId={item.id}
                        style={styles.problemChatLikeBtn}
                      />
                    </View>
                  </View>
                </View>
              );
            }

            if (isLostFoundChatRequest(item)) {
              const lostFoundType = getLostFoundType(item);
              const itemLabel = getLostFoundItemLabel(item, language);
              const itemDescription = getLostFoundDescription(item);

              const cardContent = (
                <View style={styles.lostFoundChatCopy}>
                  <View style={styles.lostFoundChatTopRow}>
                    <Text
                      style={[styles.lostFoundTypeBadge, lostFoundType === 'lost' ? styles.lostFoundLostBadge : styles.lostFoundFoundBadge]}
                      numberOfLines={1}
                    >
                      {getLostFoundTypeLabel(lostFoundType, language)}
                    </Text>
                    <View style={styles.lostFoundDateRow}>
                      <Text style={styles.lostFoundDateText}>{timeAgo}</Text>
                      <MaterialCommunityIcons name="check-circle" size={15} color={SCREEN_THEME.woodGreenDark} />
                    </View>
                  </View>

                  <View style={styles.lostFoundTitleBox}>
                    <Text style={styles.lostFoundTitle} numberOfLines={2}>{itemLabel}</Text>
                    {!!itemDescription && (
                      <Text style={styles.lostFoundDescription} numberOfLines={2}>{itemDescription}</Text>
                    )}
                  </View>

                  <View style={styles.lostFoundBottomRow}>
                    <View style={styles.lostFoundPersonRow}>
                      <MiniUserAvatar uri={avatarUri} name={item.name || ''} size={28} borderRadius={10} backgroundColor="#6A8BA5" />
                      <Text style={styles.lostFoundMeta} numberOfLines={1}>{item.name || 'Chaika'}</Text>
                    </View>
                    <FeedLikeButton
                      currentUserId={currentUser?.id}
                      likePath="feed_likes/lost_found"
                      likeId={item.sourceItemId || item.id}
                      style={styles.lostFoundLikeAction}
                    />
                    {item.phone ? (
                      <TouchableOpacity style={styles.lostFoundIconAction} onPress={(event) => { event.stopPropagation(); if (requireAuthForDetails({ userId: currentUser?.id, navigation, language })) void safeCallPhone(item.phone as string, language); }} activeOpacity={0.75}>
                        <TactileIcon icon="phone-outline" size={34} iconSize={14} backgroundColor="#403933" />
                      </TouchableOpacity>
                    ) : null}
                    {!own && item.userId ? (
                      <TouchableOpacity
                        style={styles.lostFoundIconAction}
                        onPress={(event) => {
                          event.stopPropagation();
                          openContactModal({ userId: item.userId as string, name: item.name || 'Chaika', photoURL: avatarUri || undefined, sourceType: 'help', sourceId: item.sourceItemId || item.id, sourceTitle: itemLabel });
                        }}
                        activeOpacity={0.75}
                      >
                        <TactileIcon icon="account-arrow-right-outline" size={34} iconSize={14} backgroundColor="#7A1E5C" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );

              if (hasPhoto) {
                return (
                  <TouchableOpacity
                    style={styles.lostFoundChatCard}
                    onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('RequestDetail', { request: item }); setTimeout(() => { navLock.current = false; }, 800); }}
                    activeOpacity={0.86}
                  >
                    <View style={styles.lostFoundVisualWrap}>
                      <AppPhotoImage
                        uri={item.photoUri}
                        storagePath={item.photoStoragePath}
                        style={styles.lostFoundPhoto}
                        resizeMode="contain"
                        debugLabel={`OnlineChatLostFound:${item.id}`}
                        showDebugInfo={false}
                      />

                    </View>
                    {cardContent}
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  style={[styles.lostFoundChatCard, styles.lostFoundChatCardNoPhoto]}
                  onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('RequestDetail', { request: item }); setTimeout(() => { navLock.current = false; }, 800); }}
                  activeOpacity={0.86}
                >
                  {cardContent}
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                style={[styles.chatCard, hasPhoto && styles.chatCardWithPhoto]}
                onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('RequestDetail', { request: item }); setTimeout(() => { navLock.current = false; }, 800); }}
                activeOpacity={0.88}
              >
                <View style={hasPhoto ? styles.chatMediaRow : styles.chatCardTop}>
                  {hasPhoto ? (
                    <View style={styles.chatPhotoWrap}>
                      <AppPhotoImage
                        uri={item.photoUri}
                        storagePath={item.photoStoragePath}
                        style={styles.chatCardPhoto}
                        resizeMode="cover"
                        debugLabel={`OnlineChatCard:${item.id}`}
                        showDebugInfo={false}
                      />
                    </View>
                  ) : avatarUri ? (
                    <MiniUserAvatar
                      uri={avatarUri}
                      name={item.name}
                      size={56}
                      borderRadius={14}
                      backgroundColor="#6A8BA5"
                    />
                  ) : (
                    <View style={styles.botAvatar}>
                      <MaterialCommunityIcons name="robot-outline" size={28} color="#FFF9EE" />
                    </View>
                  )}
                  <View style={styles.chatCardRight}>
                    {/* Name row */}
                    <View style={styles.chatNameRow}>
                      <Text style={styles.chatName} numberOfLines={1}>{item.name?.trim() || '—'}</Text>
                      <View style={styles.chatCategoryBadge}>
                        <Text style={styles.chatCategoryText} numberOfLines={1}>{topic}</Text>
                      </View>
                      <View style={styles.chatDateBadge}>
                        <Text style={styles.chatDateText}>{timeAgo}</Text>
                      </View>
                    </View>
                    {/* Description box */}
                    <View style={styles.chatDescBox}>
                      <Text style={styles.chatDescText} numberOfLines={2}>
                        {description || text.noDescription}
                      </Text>
                    </View>
                  </View>
                </View>

                {(item.phone || own || canContact) ? (
                  <View style={styles.chatActionsRow}>
                  {item.phone ? (
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={(event) => { event.stopPropagation(); if (requireAuthForDetails({ userId: currentUser?.id, navigation, language })) void safeCallPhone(item.phone as string, language); }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="phone-outline" size={13} color={SCREEN_THEME.woodGreenDark} />
                      <Text style={styles.chatActionBtnText} numberOfLines={1}>
                        {language === 'ua' ? 'Подзвонити' : language === 'ru' ? 'Позвонить' : 'Call'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {!own && item.userId ? (
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={(event) => { event.stopPropagation(); setActionModal({ visible: true, userId: item.userId as string, userName: item.name ?? '' }); }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="badge-account-outline" size={13} color={SCREEN_THEME.woodGreenDark} />
                      <Text style={styles.chatActionBtnText} numberOfLines={1}>
                        {language === 'ua' ? 'Профіль' : language === 'ru' ? 'Профиль' : 'Profile'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {!own && item.userId ? (
                    <TouchableOpacity
                      style={styles.chatActionBtnAccent}
                      onPress={(event) => { event.stopPropagation(); openContactModal({ userId: item.userId as string, name: item.name ?? 'Unknown', sourceType: 'help', sourceId: item.id, sourceTitle: (item.text ?? '').slice(0, 60) }); }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="arrow-right-circle-outline" size={13} color="#fff" />
                      <Text style={styles.chatActionBtnAccentText} numberOfLines={1}>
                        {language === 'ua' ? "Зв'язатись" : language === 'ru' ? 'Связаться' : 'Contact'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {own ? (
                    <TouchableOpacity
                      style={styles.chatActionBtnDelete}
                      onPress={(event) => { event.stopPropagation(); handleDelete(item.id); }}
                      disabled={deleteBusyId === item.id}
                      activeOpacity={0.8}
                    >
                      {deleteBusyId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="trash-can-outline" size={13} color="#fff" />
                          <Text style={styles.chatActionBtnDeleteText}>{deleteText.action}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <FeedLikeButton
                    currentUserId={currentUser?.id}
                    likePath="feed_likes/requests"
                    likeId={item.id}
                    style={styles.chatActionLikeBtn}
                  />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={isCategoryMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCategoryMenuOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsCategoryMenuOpen(false)}>
          <Pressable style={[styles.categoryModalCard, styles.categoryMenu]} onPress={() => undefined}>
            <TouchableOpacity
              style={[styles.categoryMenuItem, selectedCategory === null && styles.categoryMenuItemActive]}
              onPress={() => handleCategorySelect(null)}
              activeOpacity={0.84}
            >
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={14}
                color={selectedCategory === null ? SCREEN_THEME.textPrimary : SCREEN_THEME.textSecondary}
                style={styles.filterIcon}
              />
              <Text style={[styles.categoryMenuItemText, selectedCategory === null && styles.categoryMenuItemTextActive]}>
                {text.allLabel}
              </Text>
              {selectedCategory === null ? (
                <MaterialCommunityIcons name="check" size={16} color={SCREEN_THEME.textPrimary} style={styles.checkIcon} />
              ) : null}
            </TouchableOpacity>

            {text.categories.map((category) => {
              const active = selectedCategory === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryMenuItem, active && styles.categoryMenuItemActive]}
                  onPress={() => handleCategorySelect(category.id)}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons
                    name={category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                    size={14}
                    color={active ? SCREEN_THEME.textPrimary : SCREEN_THEME.textSecondary}
                    style={styles.filterIcon}
                  />
                  <Text style={[styles.categoryMenuItemText, active && styles.categoryMenuItemTextActive]}>
                    {category.label}
                  </Text>
                  {active ? (
                    <MaterialCommunityIcons name="check" size={16} color={SCREEN_THEME.textPrimary} style={styles.checkIcon} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <TactileButton
        title={text.add}
        onPress={guestGuard(() => {
          if (addRequestNavLock.current) return;
          if (!hasCurrentUserAvatar) {
            Alert.alert(avatarRequiredText.title, avatarRequiredText.body, [
              { text: avatarRequiredText.action, onPress: () => navigation.navigate('EditProfileScreen') },
              { text: language === 'en' ? 'Cancel' : language === 'ru' ? 'Отмена' : 'Скасувати', style: 'cancel' },
            ]);
            return;
          }
          addRequestNavLock.current = true;
          void openRequestFormWithLimitCheck(navigation, language)
            .finally(() => { setTimeout(() => { addRequestNavLock.current = false; }, 800); });
        })}
        variant="primary"
        style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 14 }}
        icon={<MaterialCommunityIcons name="plus-circle-outline" size={20} color="#FFFFFF" />}
      />
      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal({ visible: false, userId: '', userName: '' })}
      >
        <View style={styles.actionOverlay}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionPrimaryBtn} onPress={() => handleViewProfile(actionModal.userId)} activeOpacity={0.86}>
              <MaterialCommunityIcons name="account-box-outline" size={18} color="#fff" />
              <Text style={styles.actionPrimaryText}>{language === 'ru' ? 'Просмотреть профиль' : language === 'en' ? 'View profile' : 'Переглянути профіль'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondaryBtn} onPress={() => handleContact(actionModal.userId, actionModal.userName)} activeOpacity={0.86}>
              <MaterialCommunityIcons name="arrow-right-circle-outline" size={18} color={SCREEN_THEME.textPrimary} />
              <Text style={styles.actionSecondaryText}>{language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатись"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancelBtn} onPress={() => setActionModal({ visible: false, userId: '', userName: '' })} activeOpacity={0.8}>
              <Text style={styles.actionCancelText}>{language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <GuestRegisterBanner visible={guestBannerVisible} onClose={hideGuestBanner} />
      <VideoLoadingOverlay visible={loading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    padding: 18,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginTop: 10,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  content: { flex: 1, paddingHorizontal: 16 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInputWrap: { flex: 1, marginLeft: 10 },
  filterWrap: { marginBottom: 10 },
  categoryPickerButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: SCREEN_THEME.cardCream,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryMenu: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: SCREEN_THEME.cardCream,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(36,30,24,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  categoryModalCard: {
    maxHeight: '72%',
  },
  categoryMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderStrong,
  },
  categoryMenuItemActive: {
    backgroundColor: '#E8DFCF',
  },
  categoryMenuItemText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryMenuItemTextActive: {
    color: SCREEN_THEME.textPrimary,
  },
  checkIcon: { marginLeft: 'auto' },
  filterIcon: { marginRight: 5 },
  filterButtonText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  counter: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 10, marginLeft: 4 },
  loader: { marginTop: 40 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 18,
  },
  emptyStateText: { marginTop: 12, fontSize: 15, fontWeight: '700', color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  retryButton: { marginTop: 14, minWidth: 160 },
  loadMoreButton: { marginTop: 6, marginBottom: 8 },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  requestContent: { flex: 1, marginRight: 12 },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B65A48',
    marginLeft: 8,
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 4,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  requestMeta: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '600' },
  phoneAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  actionPrimaryBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  actionSecondaryBtn: {
    backgroundColor: '#F7F3EE',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  actionSecondaryText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  actionCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Chat card (ProfileRequests-style) ──────────────────────────────────────
  problemChatCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  problemChatCardNoPhoto: { padding: 12 },
  problemChatTopRow: { flexDirection: 'row', gap: 8 },
  problemChatTopRowNoPhoto: { flexDirection: 'column' },
  problemChatVisualWrap: {
    position: 'relative',
    width: '40%',
    minWidth: 118,
    maxWidth: 132,
    flexShrink: 0,
  },
  problemChatPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: '#F0E8D8',
  },
  problemChatCopy: { flex: 1, minWidth: 0 },
  problemChatCopyNoPhoto: { width: '100%' },
  problemChatTitleBox: {
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#7A1E5C',
    minHeight: 52,
    justifyContent: 'center',
  },
  problemChatTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', color: '#fff' },
  problemChatAddressRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 22,
  },
  problemChatAddressStreet: {
    color: '#4E4237',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    minWidth: 0,
  },
  problemChatAddressHouse: {
    color: '#4E4237',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
    maxWidth: 58,
  },
  problemChatMetaRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center' },
  problemChatMetaText: { color: '#77695A', fontSize: 12, fontWeight: '800' },
  problemChatActionsRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
  },
  problemChatActionsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'space-between',
  },
  problemChatActionPill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D4B9A8',
    backgroundColor: '#FFF8EA',
    flexShrink: 1,
  },
  problemChatProfilePill: { flex: 1.2, minWidth: 0 },
  problemChatContactPill: {
    flex: 0.9,
    minWidth: 0,
    backgroundColor: '#8F1238',
    borderColor: '#8F1238',
  },
  problemChatActionPillDisabled: { opacity: 0.45 },
  problemChatActionText: {
    color: '#7A1E5C',
    fontSize: 11,
    fontWeight: '900',
    flexShrink: 1,
  },
  problemChatContactText: { color: '#FFFFFF' },
  problemChatLikeBtn: { minWidth: 54, minHeight: 36, flexShrink: 0 },
  lostFoundChatCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 8,
    marginBottom: 10,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  lostFoundChatCardNoPhoto: { flexDirection: 'column' },
  lostFoundVisualWrap: {
    position: 'relative',
    width: '38%',
    minWidth: 118,
    maxWidth: 132,
    flexShrink: 0,
  },
  lostFoundPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: '#F0E8D8',
  },

  lostFoundChatCopy: { flex: 1, justifyContent: 'space-between', minWidth: 0 },
  lostFoundChatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 5,
  },
  lostFoundTypeBadge: {
    maxWidth: '66%',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  lostFoundFoundBadge: {
    color: SCREEN_THEME.woodGreenDark,
    backgroundColor: 'rgba(155, 183, 123, 0.20)',
  },
  lostFoundLostBadge: {
    color: SCREEN_THEME.terracottaDark,
    backgroundColor: 'rgba(199, 122, 93, 0.16)',
  },
  lostFoundDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  lostFoundDateText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  lostFoundTitleBox: {
    borderWidth: 1.5,
    borderColor: '#1E1A17',
    borderRadius: 16,
    backgroundColor: '#FFF8EA',
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 52,
    justifyContent: 'center',
  },
  lostFoundTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  lostFoundDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: '#fff',
    fontWeight: '800',
    marginTop: 4,
    backgroundColor: '#7A1E5C',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  lostFoundBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 5,
  },
  lostFoundPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 42,
  },
  lostFoundMeta: {
    flex: 1,
    fontSize: 13,
    lineHeight: 16,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
  },
  lostFoundLikeAction: { minWidth: 44, minHeight: 34, paddingHorizontal: 8 },
  lostFoundIconAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 2,
    shadowColor: '#A08060',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chatCardWithPhoto: {
    padding: 8,
  },
  chatCardTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  chatMediaRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
    marginBottom: 8,
  },
  chatPhotoWrap: {
    width: '38%',
    minWidth: 118,
    maxWidth: 136,
    flexShrink: 0,
  },
  chatCardPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#F0E8D8',
  },
  botAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A8BA5',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  chatCardRight: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  chatName: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  chatCategoryBadge: {
    backgroundColor: '#DCECCF',
    borderWidth: 1,
    borderColor: '#B8D69E',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
    maxWidth: '42%',
  },
  chatCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#466833',
  },
  chatDateBadge: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
    flexShrink: 0,
  },
  chatDateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3D5D87',
  },
  chatDescBox: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#7A1E5C',
  },
  chatDescText: {
    fontSize: 13,
    color: '#fff',
    lineHeight: 18,
    fontWeight: '800',
  },
  chatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#C8D8C0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'transparent',
    flexShrink: 1,
  },
  chatActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.woodGreenDark,
    flexShrink: 1,
  },
  chatActionBtnAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#7A1E5C',
    flexShrink: 1,
  },
  chatActionBtnAccentText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    flexShrink: 1,
  },
  chatActionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#B65A48',
    marginLeft: 'auto' as const,
  },
  chatActionBtnDeleteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  chatActionLikeBtn: {
    marginLeft: 'auto' as const,
    flexShrink: 0,
  },
});

export default OnlineChatScreen;
