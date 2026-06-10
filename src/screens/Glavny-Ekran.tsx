import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import MainMenuModal from '../components/MainMenuModal';
import OnboardingSlides from '../components/OnboardingSlides';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { getChaikaActivity, getLevelName } from '../utils/chaikaLevels';
import { useTranslation } from '../i18n/useTranslation';
import { selectTodayReports } from '../redux/slices/electricitySlice';
import { syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { normalizeLanguage } from '../redux/slices/languageSlice';
import { firebaseChatAPI } from '../firebase-config';
import { safeOpenExternalUrl } from '../utils/communicationActions';
import { safeNavigate } from '../utils/safeNavigation';
import type { Request as AppRequest } from '../types/app';
import { logClientError } from '../utils/errorLogger';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';

const ONBOARDING_KEY = '@chaika:onboarding_done';
const INTRO_VIDEO_KEY = '@chaika:intro_video_shown';

const MAX_FEED_ITEMS = 5;

const SCREEN_W = Platform.OS === 'web'
  ? Math.min(Dimensions.get('window').width, 430)
  : Dimensions.get('window').width;
const IS_NARROW_SCREEN = SCREEN_W < 360;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_CELL_W = Math.floor((SCREEN_W - GRID_HORIZONTAL_PADDING * 2) / 2) - 4;
const BTN_ASPECT = 138 / 150;
// On web reduce button artwork size so 4 buttons + rest of content fit on screen
const BTN_SCALE = Platform.OS === 'web' ? 0.58 : (IS_NARROW_SCREEN ? 0.79 : 0.85);
const BTN_W = Math.round(GRID_CELL_W * BTN_SCALE);
const BTN_H = Math.round(BTN_W * BTN_ASPECT);
const PANEL2_H = Math.round((SCREEN_W - GRID_HORIZONTAL_PADDING * 2) * 1080 / 713);
const PANEL2_IMAGE = require('../../assets/WEBP-version/Panel2.webp');

type HomeButtonConfig = {
  artwork: ImageSourcePropType;
  labelKey: keyof typeof import('../i18n/translations').translations.ua.mainScreen;
  screen?: string;
  tab?: string;
};

type TopInfoItem = {
  id: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  titleKey: keyof typeof import('../i18n/translations').translations.ua.mainScreen;
  subtitleKey: keyof typeof import('../i18n/translations').translations.ua.mainScreen;
  screen?: string;
  params?: object;
  tab?: string;
  url?: string;
};

type LiveFeedItem = {
  id: string;
  createdAt: number;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  avatarUri?: string;
  typeLabel: string;
  name?: string;
  text: string;
  screen: string;
  urgent?: boolean;
};

const FEED_UI = {
  ua: {
    liveTitle: 'Активність зараз',
    live: '● Live',
    help: 'Потрібна допомога',
    request: 'Запит',
    news: 'Новини',
    photo: 'Фото додано',
    contact: 'Читати ->',
    noActivity: 'Активність сусідів зʼявиться тут',
    electricityLabel: 'Світло',
    powerOn: 'Світло є 🟢',
    powerOff: 'Нема світла 🔴',
    genericActivity: 'Активність мешканців',
  },
  ru: {
    liveTitle: 'Активность сейчас',
    live: '● Live',
    help: 'Нужна помощь',
    request: 'Запрос',
    news: 'Новости',
    photo: 'Добавлено фото',
    contact: 'Читать ->',
    noActivity: 'Активность соседей появится здесь',
    electricityLabel: 'Свет',
    powerOn: 'Свет есть 🟢',
    powerOff: 'Нет света 🔴',
    genericActivity: 'Активность жителей',
  },
  en: {
    liveTitle: 'Activity now',
    live: '● Live',
    help: 'Help needed',
    request: 'Request',
    news: 'News',
    photo: 'Photo added',
    contact: 'Read ->',
    noActivity: 'Neighbor activity will appear here',
    electricityLabel: 'Electricity',
    powerOn: 'Power on ?',
    powerOff: 'Power off ?',
    genericActivity: 'Resident activity',
  },
} as const;
const FEED_ACTIVITY_LABELS = {
  ua: {
    problem: 'Проблема ЖК',
    electricity: 'Статус світла',
    lostFound: 'Загублено або знайдено',
    foundPet: 'Знайдено тварину',
    lostPet: 'Шукають тварину',
    foundItem: 'Знайдено річ',
    lostItem: 'Загублена річ',
    buySell: 'Куплю / Продам',
    contacts: 'Контакти Чайки',
    jobSearch: 'Пошук роботи',
    help: 'Потрібна допомога',
    transport: 'Транспорт і поїздки',
    repair: 'Ремонт і інструменти',
    household: 'Дім і прибирання',
    care: 'Турбота і підтримка',
    pets: 'Тварини',
    exchange: 'Обмін і речі',
    foodsharing: 'Фудшеринг',
    education: 'Освіта і послуги',
  },
  ru: {
    problem: 'Проблема ЖК',
    electricity: 'Статус света',
    lostFound: 'Потеряно или найдено',
    foundPet: 'Найдено животное',
    lostPet: 'Ищут животное',
    foundItem: 'Найдена вещь',
    lostItem: 'Потеряна вещь',
    buySell: 'Куплю / Продам',
    contacts: 'Контакты Чайки',
    jobSearch: 'Поиск работы',
    help: 'Нужна помощь',
    transport: 'Транспорт и поездки',
    repair: 'Ремонт и инструменты',
    household: 'Дом и уборка',
    care: 'Забота и поддержка',
    pets: 'Животные',
    exchange: 'Обмен и вещи',
    foodsharing: 'Фудшеринг',
    education: 'Образование и услуги',
  },
  en: {
    problem: 'Building issue',
    electricity: 'Electricity status',
    lostFound: 'Lost and found',
    foundPet: 'Found pet',
    lostPet: 'Lost pet',
    foundItem: 'Found item',
    lostItem: 'Lost item',
    buySell: 'Buy / sell',
    contacts: 'Chaika Contacts',
    jobSearch: 'Job search',
    help: 'Help needed',
    transport: 'Transport and rides',
    repair: 'Repair and tools',
    household: 'Home and cleaning',
    care: 'Care and support',
    pets: 'Pets',
    exchange: 'Exchange and items',
    foodsharing: 'Foodsharing',
    education: 'Education and services',
  },
} as const;
type AppLanguage = keyof typeof FEED_UI;

const FEED_SUBCATEGORY_LABELS: Record<string, { ua: string; ru: string; en: string }> = {
  found_pet: { ua: 'Знайдено тварину', ru: 'Найдено животное', en: 'Found pet' },
  lost_pet: { ua: 'Шукають тварину', ru: 'Ищут животное', en: 'Lost pet' },
  found_item: { ua: 'Знайдено річ', ru: 'Найдена вещь', en: 'Found item' },
  lost_item: { ua: 'Загублена річ', ru: 'Потеряна вещь', en: 'Lost item' },
  childcare: { ua: 'Допомога з дітьми', ru: 'Помощь с детьми', en: 'Childcare help' },
  electrical: { ua: 'Електрика', ru: 'Электрика', en: 'Electrical help' },
  plumbing: { ua: 'Сантехніка', ru: 'Сантехника', en: 'Plumbing' },
  dog_walking: { ua: 'Вигул собаки', ru: 'Выгул собаки', en: 'Dog walking' },
  pet_care: { ua: 'Догляд за твариною', ru: 'Уход за животным', en: 'Pet care' },
  ride_share: { ua: 'Підвезу', ru: 'Подвезу', en: 'Ride share' },
  need_ride: { ua: 'Потрібна машина', ru: 'Нужна машина', en: 'Need a ride' },
  parking_help: { ua: 'Допомога з паркуванням', ru: 'Помощь с парковкой', en: 'Parking help' },
  parcel_delivery: { ua: 'Доставка речей', ru: 'Доставка вещей', en: 'Parcel delivery' },
  cleaning: { ua: 'Прибирання', ru: 'Уборка', en: 'Cleaning' },
  medicine: { ua: 'Ліки', ru: 'Лекарства', en: 'Medicine' },
  medical_consultation: { ua: 'Медична консультація', ru: 'Медицинская консультация', en: 'Medical consultation' },
  elderly_help: { ua: 'Допомога літнім', ru: 'Помощь пожилым', en: 'Elderly help' },
  psychological_support: { ua: 'Психологічна підтримка', ru: 'Психологическая поддержка', en: 'Psychological support' },
  free_items: { ua: 'Віддам безкоштовно', ru: 'Отдам бесплатно', en: 'Free items' },
  borrow_tool: { ua: 'Позичити інструмент', ru: 'Одолжить инструмент', en: 'Borrow tool' },
  item_exchange: { ua: 'Обмін речами', ru: 'Обмен вещами', en: 'Item exchange' },
  noise: { ua: 'Шум від сусідів', ru: 'Шум от соседей', en: 'Noise from neighbors' },
  elevator: { ua: 'Проблема з ліфтом', ru: 'Проблема с лифтом', en: 'Elevator issue' },
  parking_blocked: { ua: 'Парковка перекрита', ru: 'Парковка перекрыта', en: 'Blocked parking' },
  yard_trash: { ua: 'Сміття у дворі', ru: 'Мусор во дворе', en: 'Yard trash' },
  yard_lighting: { ua: 'Освітлення у дворі', ru: 'Освещение во дворе', en: 'Yard lighting' },
  management_request: { ua: 'Звернення до управи', ru: 'Обращение в управу', en: 'Management request' },
  tutoring: { ua: 'Репетиторство', ru: 'Репетиторство', en: 'Tutoring' },
  job_search: { ua: 'Пошук роботи', ru: 'Поиск работы', en: 'Job search' },
  sports_company: { ua: 'Спортивна компанія', ru: 'Спортивная компания', en: 'Sports company' },
  creative_club: { ua: 'Творчий гурток', ru: 'Творческий клуб', en: 'Creative club' },
  master_services: { ua: 'Послуги майстра', ru: 'Услуги мастера', en: 'Personal services' },
  legal_consultation: { ua: 'Юридична консультація', ru: 'Юридическая консультация', en: 'Legal consultation' },
  documents: { ua: 'Документи і довідки', ru: 'Документы и справки', en: 'Documents and certificates' },
};

const stripFeedPrefix = (value: string): string =>
  value
    .replace(/^\[[^[\]]+\]\s*/u, '')
    .replace(/^[\s\-•:]+/u, '')
    .trim();

const looksLikeBrokenEncoding = (value: string): boolean =>
  /\u0420\u00a0.|\u0421\u040e.|\u0420\u0406\u0402|\u0420\u201a|\u0420\u0403|\u0421\u2014|\u043f\u0457\u0455\u0405/u.test(value);

const looksTechnical = (value: string): boolean =>
  /^\[[a-z0-9_]+\]$/iu.test(value.trim()) || /\b[a-z]+_[a-z0-9_]+\b/iu.test(value);

const normalizeFeedText = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const stripped = stripFeedPrefix(raw);
  if (!stripped) return '';
  if (looksLikeBrokenEncoding(stripped)) return '';
  return stripped;
};

const pickAvatarUri = (value: unknown): string | undefined => pickUserAvatarUri(value) || undefined;

const getRequestTypeLabel = (req: AppRequest, language: AppLanguage): string => {
  const labels = FEED_ACTIVITY_LABELS[language] ?? FEED_ACTIVITY_LABELS.ua;
  const subcategory = String(req.subcategory || '').toLowerCase();
  const category = String(req.category || '').toLowerCase();
  const group = String(req.group || '').toLowerCase();

  if (FEED_SUBCATEGORY_LABELS[subcategory]) {
    return FEED_SUBCATEGORY_LABELS[subcategory][language];
  }
  if (category === 'problem' || group === 'problems' || group === 'building_issues') return labels.problem;
  if (category === 'electricity') return labels.electricity;
  if (category === 'buy_sell' || group === 'buy_sell' || group === 'exchange') return labels.buySell;
  if (category === 'contacts' || group === 'contacts') return labels.contacts;
  if (category === 'job_search' || group === 'jobs' || group === 'education_services') return labels.jobSearch;
  if (category === 'lost_found' || group === 'lost_found') return labels.lostFound;
  if (group === 'transport') return labels.transport;
  if (group === 'repair') return labels.repair;
  if (group === 'household') return labels.household;
  if (group === 'care') return labels.care;
  if (group === 'pets') return labels.pets;
  if (group === 'exchange') return labels.exchange;
  if (group === 'foodsharing') return labels.foodsharing;
  if (group === 'help_neighbors' || group === 'help') return labels.help;
  return (FEED_UI[language] ?? FEED_UI.ua).request;
};

const getRequestPreviewText = (req: AppRequest, language: AppLanguage): string => {
  const labels = FEED_ACTIVITY_LABELS[language] ?? FEED_ACTIVITY_LABELS.ua;
  const rawText = normalizeFeedText(req.description || req.text || '');
  const category = String(req.category || '').toLowerCase();
  const group = String(req.group || '').toLowerCase();
  const subcategory = String(req.subcategory || '').toLowerCase();
  const building = String(req.building || '').trim();

  if (rawText && !looksTechnical(rawText)) {
    return rawText.slice(0, 48);
  }

  if (FEED_SUBCATEGORY_LABELS[subcategory]) {
    return FEED_SUBCATEGORY_LABELS[subcategory][language];
  }
  if (category === 'problem' || group === 'problems' || group === 'building_issues') {
    return building ? `${labels.problem} • ${building}` : labels.problem;
  }
  if (category === 'buy_sell' || group === 'buy_sell' || group === 'exchange') return labels.buySell;
  if (category === 'contacts' || group === 'contacts') return labels.contacts;
  if (category === 'job_search' || group === 'jobs' || group === 'education_services') return labels.jobSearch;
  if (category === 'lost_found' || group === 'lost_found') {
    if (subcategory === 'found') return labels.foundItem;
    if (subcategory === 'lost') return labels.lostItem;
    return labels.lostFound;
  }
  if (group === 'transport') return labels.transport;
  if (group === 'repair') return labels.repair;
  if (group === 'household') return labels.household;
  if (group === 'care') return labels.care;
  if (group === 'pets') return labels.pets;
  if (group === 'foodsharing') return labels.foodsharing;
  if (group === 'help_neighbors' || group === 'help') return labels.help;
  return (FEED_UI[language] ?? FEED_UI.ua).genericActivity;
};

const getRequestTargetScreen = (req: AppRequest): string => {
  const category = String(req.category || '').toLowerCase();
  const group = String(req.group || '').toLowerCase();
  const subcategory = String(req.subcategory || '').toLowerCase();
  const haystack = [category, group, subcategory].filter(Boolean).join(' ');

  if (haystack.includes('electricity')) return 'ElectricityStatusScreen';
  if (haystack.includes('problem') || haystack.includes('building_issues')) return 'ChaikaProblemsScreen';
  if (haystack.includes('lost_found') || haystack.includes('found_') || haystack.includes('lost_')) return 'LostAndFoundScreen';
  if (haystack.includes('buy_sell') || haystack.includes('exchange')) return 'BuySellScreen';
  if (haystack.includes('contacts')) return 'KontaktiChaikyScreen';
  if (haystack.includes('job_search') || haystack.includes('jobs') || haystack.includes('tutoring') || haystack.includes('education_services') || haystack.includes('education')) {
    return 'JobSearchScreen';
  }
  if (haystack.includes('help_neighbors') || haystack.includes('help')) return 'HelpNeighborsScreen';

  return 'OnlineChatTab';
};

type FeedVisual = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  iconBg: string;
  iconBorder: string;
};

type FeedBadge = {
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
};

const DEFAULT_FEED_VISUAL: FeedVisual = {
  icon: 'clipboard-text-outline',
  iconColor: SCREEN_THEME.terracottaDark,
  iconBg: 'rgba(199, 122, 93, 0.14)',
  iconBorder: 'rgba(199, 122, 93, 0.20)',
};

const getFeedVisual = (params: {
  category?: string;
  group?: string;
  subcategory?: string;
  urgent?: boolean;
}): FeedVisual => {
  const haystack = [
    params.category,
    params.group,
    params.subcategory,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (params.urgent) {
    return {
      icon: 'fire-circle',
      iconColor: '#B3472E',
      iconBg: 'rgba(199, 122, 93, 0.18)',
      iconBorder: 'rgba(199, 122, 93, 0.26)',
    };
  }

  if (haystack.includes('electricity')) {
    return {
      icon: 'lightning-bolt',
      iconColor: '#B07A1A',
      iconBg: 'rgba(216, 175, 89, 0.18)',
      iconBorder: 'rgba(216, 175, 89, 0.28)',
    };
  }

  if (haystack.includes('problem') || haystack.includes('building_issues')) {
    return {
      icon: 'home-alert-outline',
      iconColor: '#A14F3A',
      iconBg: 'rgba(199, 122, 93, 0.18)',
      iconBorder: 'rgba(199, 122, 93, 0.28)',
    };
  }

  if (haystack.includes('lost_found') || haystack.includes('found_pet') || haystack.includes('lost_pet') || haystack.includes('found_item') || haystack.includes('lost_item')) {
    return {
      icon: 'paw-outline',
      iconColor: '#6F8754',
      iconBg: 'rgba(155, 183, 123, 0.18)',
      iconBorder: 'rgba(120, 145, 91, 0.28)',
    };
  }

  if (haystack.includes('contacts')) {
    return {
      icon: 'account-group-outline',
      iconColor: '#5E7B9A',
      iconBg: 'rgba(94, 123, 154, 0.14)',
      iconBorder: 'rgba(94, 123, 154, 0.24)',
    };
  }

  if (haystack.includes('buy_sell') || haystack.includes('exchange')) {
    return {
      icon: 'shopping-outline',
      iconColor: '#8E6241',
      iconBg: 'rgba(199, 122, 93, 0.14)',
      iconBorder: 'rgba(199, 122, 93, 0.24)',
    };
  }

  if (haystack.includes('job_search') || haystack.includes('jobs') || haystack.includes('tutoring') || haystack.includes('education_services')) {
    return {
      icon: 'briefcase-search-outline',
      iconColor: '#4E6E9A',
      iconBg: 'rgba(95, 132, 180, 0.14)',
      iconBorder: 'rgba(95, 132, 180, 0.24)',
    };
  }

  if (haystack.includes('transport') || haystack.includes('ride_share') || haystack.includes('need_ride') || haystack.includes('parking')) {
    return {
      icon: 'car-outline',
      iconColor: '#4E6E9A',
      iconBg: 'rgba(95, 132, 180, 0.14)',
      iconBorder: 'rgba(95, 132, 180, 0.24)',
    };
  }

  if (haystack.includes('repair') || haystack.includes('electrical') || haystack.includes('plumbing') || haystack.includes('furniture') || haystack.includes('small_repair')) {
    return {
      icon: 'tools',
      iconColor: '#6E7F47',
      iconBg: 'rgba(155, 183, 123, 0.18)',
      iconBorder: 'rgba(120, 145, 91, 0.28)',
    };
  }

  if (haystack.includes('care') || haystack.includes('childcare') || haystack.includes('elderly_help') || haystack.includes('medical')) {
    return {
      icon: 'account-heart-outline',
      iconColor: '#A14F3A',
      iconBg: 'rgba(199, 122, 93, 0.16)',
      iconBorder: 'rgba(199, 122, 93, 0.24)',
    };
  }

  if (haystack.includes('pets')) {
    return {
      icon: 'dog-side',
      iconColor: '#6F8754',
      iconBg: 'rgba(155, 183, 123, 0.18)',
      iconBorder: 'rgba(120, 145, 91, 0.28)',
    };
  }

  if (haystack.includes('foodsharing')) {
    return {
      icon: 'food-apple-outline',
      iconColor: '#8E6241',
      iconBg: 'rgba(216, 175, 89, 0.16)',
      iconBorder: 'rgba(216, 175, 89, 0.24)',
    };
  }

  return DEFAULT_FEED_VISUAL;
};

const getFeedBadge = (params: {
  category?: string;
  group?: string;
  subcategory?: string;
  urgent?: boolean;
}): FeedBadge => {
  const haystack = [params.category, params.group, params.subcategory]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (params.urgent || haystack.includes('help') || haystack.includes('help_neighbors')) {
    return { badge: '🆘', badgeBg: 'rgba(199, 122, 93, 0.20)', badgeColor: '#9E3B25' };
  }
  if (haystack.includes('building_issues') || haystack.includes('problem') || haystack.includes('electricity')) {
    return { badge: '⚡', badgeBg: 'rgba(216, 175, 89, 0.20)', badgeColor: '#A86E13' };
  }
  if (haystack.includes('contacts')) {
    return { badge: '❤️', badgeBg: 'rgba(199, 122, 93, 0.16)', badgeColor: '#A14F3A' };
  }
  if (haystack.includes('buy_sell') || haystack.includes('exchange') || haystack.includes('foodsharing')) {
    return { badge: '⭐', badgeBg: 'rgba(216, 175, 89, 0.20)', badgeColor: '#8E6241' };
  }
  if (haystack.includes('lost_found') || haystack.includes('pets') || haystack.includes('found_pet') || haystack.includes('lost_pet')) {
    return { badge: '🐾', badgeBg: 'rgba(155, 183, 123, 0.20)', badgeColor: '#6F8754' };
  }
  if (haystack.includes('job_search') || haystack.includes('jobs') || haystack.includes('tutoring') || haystack.includes('education_services') || haystack.includes('education')) {
    return { badge: '💼', badgeBg: 'rgba(95, 132, 180, 0.18)', badgeColor: '#4E6E9A' };
  }

  return {};
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  const [liveRequests, setLiveRequests] = useState<AppRequest[]>([]);
  const [videoNaturalH, setVideoNaturalH] = useState(Math.round((SCREEN_W - 32) * 9 / 16));
  // Start visible if video already shown (not first launch); animate in after video ends
  const feedFadeAnim = useRef(new Animated.Value(1)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const newsGlowAnim = useRef(new Animated.Value(0.78)).current;
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const appRequests = useSelector((state: RootState) => state.requests?.items ?? []);
  const approvedRequests = useSelector((state: RootState) => state.requests?.approved ?? []);
  const helpRequests = useSelector((state: RootState) => state.helpRequests?.items ?? []);
  const electricityReports = useSelector(selectTodayReports);
  const { t } = useTranslation();
  const language = useSelector((state: RootState) => normalizeLanguage(state.language?.current));
  const feedText = FEED_UI[language] ?? FEED_UI.ua;
  const avatarByUserId = useUserAvatarMap([
    ...helpRequests.map((item: { userId?: string }) => item.userId),
    ...liveRequests.map((item) => item.userId),
  ]);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (!val) setShowOnboarding(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_VIDEO_KEY).then((val) => {
      if (!val) {
        setShowIntroVideo(true);
        // Pre-set opacity to 0 so it fades in after video ends
        feedFadeAnim.setValue(0);
      }
    }).catch(() => {});
  }, [feedFadeAnim]);

  useEffect(() => {
    const unsubscribe = firebaseChatAPI.getRequests((requests) => {
      setLiveRequests(requests);
      dispatch(syncFromRequests(requests));
    });
    return unsubscribe;
  }, [dispatch]);

  const handleVideoFinish = () => {
    void AsyncStorage.setItem(INTRO_VIDEO_KEY, '1').catch((error) => {
      void logClientError('home.intro_video', error);
    });
    setShowIntroVideo(false);
    Animated.timing(feedFadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  };

  // Build live feed from real Redux data (newest first, max 5)
  const liveFeedItems = React.useMemo(() => {
    const items: LiveFeedItem[] = [];

    for (const hr of helpRequests) {
      const previewText = normalizeFeedText(hr.description) || feedText.help;
      const timeRemaining = new Date(hr.expiresAt).getTime() - Date.now();
      const isUrgent = hr.isBurning && timeRemaining < 4 * 60 * 60 * 1000;
      const visual = getFeedVisual({ category: 'help', group: 'help', urgent: isUrgent });
      const badge = getFeedBadge({ category: 'help', group: 'help', urgent: isUrgent });
      items.push({
        id: `help-${hr.id}`,
        createdAt: new Date(hr.createdAt).getTime(),
        icon: visual.icon,
        iconColor: visual.iconColor,
        iconBg: visual.iconBg,
        iconBorder: visual.iconBorder,
        badge: badge.badge,
        badgeBg: badge.badgeBg,
        badgeColor: badge.badgeColor,
        avatarUri: (hr.userId && avatarByUserId[hr.userId]) || pickAvatarUri(hr),
        typeLabel: feedText.help,
        name: hr.name,
        text: previewText.slice(0, 72),
        screen: 'HelpNeighborsScreen',
        urgent: isUrgent,
      });
    }

    for (const req of liveRequests) {
      if (!req.isApproved) continue;
      if (req.group === 'help_neighbors' || req.category === 'help') continue;
      const visual = getFeedVisual({
        category: req.category,
        group: req.group,
        subcategory: req.subcategory,
      });
      const badge = getFeedBadge({
        category: req.category,
        group: req.group,
        subcategory: req.subcategory,
      });
      items.push({
        id: `req-${req.id}`,
        createdAt: req.createdAt,
        icon: visual.icon,
        iconColor: visual.iconColor,
        iconBg: visual.iconBg,
        iconBorder: visual.iconBorder,
        badge: badge.badge,
        badgeBg: badge.badgeBg,
        badgeColor: badge.badgeColor,
        avatarUri: (req.userId && avatarByUserId[req.userId]) || pickAvatarUri({ userPhotoURL: req.userPhotoURL, startAvatarKey: req.startAvatarKey }),
        typeLabel: getRequestTypeLabel(req, language),
        name: req.name,
        text: getRequestPreviewText(req, language),
        screen: getRequestTargetScreen(req),
      });
    }

    for (const report of electricityReports) {
      const visual = getFeedVisual({ category: 'electricity' });
      const badge = getFeedBadge({ category: 'electricity' });
      items.push({
        id: `elec-${report.id}`,
        createdAt: report.createdAt instanceof Date ? report.createdAt.getTime() : Number(report.createdAt),
        icon: report.status === 'on' ? 'lightning-bolt' : 'flash-off',
        iconColor: report.status === 'on' ? visual.iconColor : SCREEN_THEME.enamelBlueDark,
        iconBg: report.status === 'on' ? visual.iconBg : 'rgba(95, 132, 180, 0.14)',
        iconBorder: report.status === 'on' ? visual.iconBorder : 'rgba(95, 132, 180, 0.24)',
        badge: badge.badge,
        badgeBg: badge.badgeBg,
        badgeColor: badge.badgeColor,
        avatarUri: pickAvatarUri(report),
        typeLabel: feedText.electricityLabel,
        text: `${report.status === 'on' ? feedText.powerOn : feedText.powerOff} • ${report.buildingId}`.slice(0, 72),
        screen: 'ElectricityStatusScreen',
      });
    }

    // Sort by createdAt timestamp, newest first
    items.sort((a, b) => b.createdAt - a.createdAt);

    return items.slice(0, MAX_FEED_ITEMS);
  }, [avatarByUserId, helpRequests, liveRequests, electricityReports, feedText, language]);

  const handleOnboardingDone = () => {
    setShowOnboarding(false);
    void AsyncStorage.setItem(ONBOARDING_KEY, '1');
    navigation.navigate('ProfileSetupScreen');
  };

  const BUTTONS: HomeButtonConfig[] = [
    { labelKey: 'mapButton', tab: 'MapTab', artwork: require('../../assets/WEBP-version/2-map.webp') },
    { labelKey: 'helpNeighbors', screen: 'HelpNeighborsScreen', artwork: require('../../assets/WEBP-version/1-help.webp') },
    { labelKey: 'homeProblems', screen: 'ChaikaProblemsScreen', artwork: require('../../assets/WEBP-version/3-broken.webp') },
    { labelKey: 'services', screen: 'ServicesHubScreen', artwork: require('../../assets/WEBP-version/4-people.webp') },
  ];

  const TOP_INFO: TopInfoItem[] = [
    { id: 'food', icon: 'food-fork-drink', titleKey: 'foodHub', subtitleKey: 'foodHubSub', screen: 'EdaNaChaykeScreen' },
    { id: 'kids', icon: 'baby-face-outline', titleKey: 'kidsHub', subtitleKey: 'kidsHubSub', screen: 'VseDlyaDeteyScreen' },
    { id: 'coffee-dating', icon: 'coffee-outline', titleKey: 'coffeeDating', subtitleKey: 'coffeeDatingSub', screen: 'KontaktiChaikyScreen' },
    { id: 'news', icon: 'newspaper-variant-outline', titleKey: 'importantNews', subtitleKey: 'importantNewsSub', screen: 'ImportantNewsScreen' },
    { id: 'telegram', icon: 'send-circle-outline', titleKey: 'telegramGroup', subtitleKey: 'telegramGroupSub', url: 'https://t.me/Chaika_ua_APP' },
    { id: 'problem', icon: 'home-alert-outline', titleKey: 'tellProblem', subtitleKey: 'tellProblemSub', screen: 'ChaikaProblemsScreen' },
    { id: 'lost', icon: 'magnify', titleKey: 'whoLost', subtitleKey: 'whoLostSub', screen: 'LostAndFoundScreen' },
  ];
  const activity = React.useMemo(() => {
    return getChaikaActivity({
      registeredAt: user?.registeredAt,
      daysUsed: user?.daysUsed,
      requestCount: appRequests.length + helpRequests.length,
      reviewCount: approvedRequests.length,
      likeCount: 0,
    });
  }, [appRequests.length, approvedRequests.length, helpRequests.length, user?.daysUsed, user?.registeredAt]);

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.25, duration: 1600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [blinkAnim]);

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(newsGlowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(newsGlowAnim, { toValue: 0.78, duration: 2200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [newsGlowAnim]);

  const openItem = (item: HomeButtonConfig | TopInfoItem) => {
    if ('url' in item && item.url) {
      void safeOpenExternalUrl(item.url, language);
      return;
    }
    if (item.tab) {
      safeNavigate(navigation, 'MainTabs', { screen: item.tab });
      return;
    }
    if (item.screen) safeNavigate(navigation, item.screen, (item as TopInfoItem).params);
  };

  const panelBodyHeight = Math.max(videoNaturalH, 190);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={SCREEN_THEME.appBg} />
      {showOnboarding && <OnboardingSlides language={language} onDone={handleOnboardingDone} />}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn} activeOpacity={0.72}>
            <View style={styles.menuLines}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLineShort} />
            </View>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.brandTitle}>{t.mainScreen.brandTitle}</Text>
            <Text style={styles.brandBeta}>(beta версія)</Text>
            <Text style={styles.brandSubtitle}>{t.mainScreen.brandSubtitle}</Text>
          </View>

          <View style={styles.logoWrap}>
            <Image source={require('../../assets/WEBP-version/Logo-Chaika-LIFE.webp')} style={styles.logoImg} resizeMode="contain" />
          </View>
        </View>

        <TouchableOpacity
          style={styles.homeLevelWrap}
          onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
          activeOpacity={0.78}
        >
          <Text style={styles.homeLevelText}>
            {t.mainScreen.yourLevel} {activity.currentLevel.level} ({getLevelName(activity.currentLevel, language).toLowerCase()})
          </Text>
          <View style={styles.homeLevelTrack}>
            <View style={[styles.homeLevelFill, { width: `${activity.progress}%` }]} />
          </View>
        </TouchableOpacity>

        <View style={styles.grid}>
          {BUTTONS.map((cfg, index) => (
            <TouchableOpacity
              key={`${cfg.labelKey}-${index}`}
              style={styles.gridBtn}
              onPress={() => openItem(cfg)}
              activeOpacity={0.9}
            >
              <View style={[styles.btnShadow, { width: BTN_W, height: BTN_H }]}>
                <Image source={cfg.artwork} style={{ width: BTN_W, height: BTN_H }} resizeMode="contain" />
              </View>
              <Text style={styles.gridBtnLabel} numberOfLines={2}>{t.mainScreen[cfg.labelKey]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.panel1WoodFrame}>
          {showIntroVideo ? (
            <View style={[styles.panel1Shadow, { height: panelBodyHeight }]}> 
              <Video
                source={require('../../assets/chaika-panel-1_bVC1Ke1v.mp4')}
                style={{ width: SCREEN_W - 48, height: panelBodyHeight }}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping={false}
                isMuted
                useNativeControls={false}
                onReadyForDisplay={(e) => {
                  const { width, height } = e.naturalSize;
                  if (width && height) {
                    setVideoNaturalH(Math.round((SCREEN_W - 48) * height / width));
                  }
                }}
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded && status.didJustFinish) {
                    handleVideoFinish();
                  }
                }}
              />
            </View>
          ) : (
            <Animated.View style={[styles.panel1Feed, { opacity: feedFadeAnim, minHeight: panelBodyHeight }]}> 
              <View style={styles.feedHeader}>
                <Text style={styles.feedTitle} numberOfLines={1}>
                  {feedText.liveTitle}
                </Text>
                <Animated.Text style={[styles.feedLiveBadge, { opacity: blinkAnim }]} numberOfLines={1}>
                  {feedText.live}
                </Animated.Text>
              </View>
              {liveFeedItems.length === 0 ? (
                <View style={styles.feedEmpty}>
                  <MaterialCommunityIcons name="bell-outline" size={22} color={SCREEN_THEME.textMuted} />
                  <Text style={styles.feedEmptyText}>{feedText.noActivity}</Text>
                </View>
              ) : (
                liveFeedItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.feedRow, item.urgent && styles.feedRowUrgent]}
                    onPress={() => navigation.navigate(item.screen)}
                    activeOpacity={0.78}
                  >
                    {item.name || item.avatarUri ? (
                      <MiniUserAvatar
                        uri={item.avatarUri || ''}
                        name={item.name}
                        size={34}
                        borderRadius={11}
                        backgroundColor="#6A8BA5"
                      />
                    ) : (
                      <View style={[styles.feedAvatarFallback, { backgroundColor: item.iconBg, borderColor: item.iconBorder }]}>
                        <MaterialCommunityIcons name={item.icon} size={15} color={item.iconColor} />
                      </View>
                    )}
                    <View style={styles.feedTextWrap}>
                      <View style={styles.feedMetaRow}>
                        <Text style={styles.feedTypeLabel} numberOfLines={1}>
                          {item.typeLabel}
                        </Text>
                        {!!item.name && <Text style={styles.feedName} numberOfLines={1}>• {item.name}</Text>}
                      </View>
                      <Text style={styles.feedItemText} numberOfLines={2}>{item.text}</Text>
                    </View>
                    {item.badge ? (
                      <View style={[styles.feedBadge, { backgroundColor: item.badgeBg || item.iconBg }]}>
                        <Text style={[styles.feedBadgeText, { color: item.badgeColor || item.iconColor }]}>{item.badge}</Text>
                      </View>
                    ) : (
                      <Text style={styles.feedArrow}>›</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </Animated.View>
          )}
        </View>

        <View style={styles.panel2Stage}>
          <TouchableOpacity style={styles.panel2Shadow} onPress={() => navigation.navigate('ServicesHubScreen')} activeOpacity={0.9}>
            <Image source={PANEL2_IMAGE} style={styles.panel2Img} resizeMode="cover" />
          </TouchableOpacity>

          <View style={styles.chatListWrap}>
            <ScrollView
              style={styles.chatMirrorCard}
              contentContainerStyle={styles.chatMirrorContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={styles.chatMirrorHeader}>
                <Text style={styles.chatMirrorTitle}>{t.mainScreen.topInfoTitle}</Text>
                <Animated.Text style={[styles.chatMirrorLive, { opacity: blinkAnim }]}>{t.mainScreen.live}</Animated.Text>
              </View>
              {TOP_INFO.map((item) => (
                <TouchableOpacity key={item.id} style={styles.chatMirrorRow} onPress={() => openItem(item)} activeOpacity={0.75}>
                  <View style={styles.chatMirrorIconBox}>
                    <MaterialCommunityIcons name={item.icon} size={18} color="#fff" />
                  </View>
                  <View style={styles.chatMirrorInfo}>
                    {item.id === 'news' ? (
                      <Animated.Text
                        style={[styles.chatMirrorName, styles.newsAttentionText, { opacity: newsGlowAnim }]}
                        numberOfLines={1}
                      >
                        {t.mainScreen[item.titleKey]}
                      </Animated.Text>
                    ) : (
                      <Text style={[styles.chatMirrorName, item.id === 'business' && styles.newsAttentionText]} numberOfLines={1}>{t.mainScreen[item.titleKey]}</Text>
                    )}
                    <Text style={styles.chatMirrorText} numberOfLines={1}>{t.mainScreen[item.subtitleKey]}</Text>
                  </View>
                  <Text style={styles.chatMirrorTime}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.panel2FrameOverlay} pointerEvents="none">
            <Image source={PANEL2_IMAGE} style={styles.panel2Img} resizeMode="cover" />
          </View>
        </View>
      </ScrollView>

      <MainMenuModal visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.cardCream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  menuLines: { width: 26, gap: 4 },
  menuLine: { height: 3, borderRadius: 2, backgroundColor: SCREEN_THEME.woodGreenDark },
  menuLineShort: { width: 18, height: 3, borderRadius: 2, backgroundColor: SCREEN_THEME.woodGreenDark },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  brandTitle: {
    fontSize: IS_NARROW_SCREEN ? 20 : 22,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
    lineHeight: 26,
  },
  brandBeta: {
    fontSize: IS_NARROW_SCREEN ? 10 : 11,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: -1,
  },
  brandSubtitle: {
    fontSize: IS_NARROW_SCREEN ? 13 : 14,
    lineHeight: 18,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  homeLevelWrap: {
    alignSelf: 'center',
    width: Math.min(210, SCREEN_W - 120),
    marginTop: -4,
    marginBottom: 5,
    alignItems: 'center',
  },
  homeLevelText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  homeLevelTrack: {
    width: '100%',
    height: 3,
    borderRadius: 999,
    backgroundColor: '#E4D0AB',
    overflow: 'hidden',
    marginTop: 3,
  },
  homeLevelFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.woodGreenDark,
  },
  logoWrap: { width: IS_NARROW_SCREEN ? 56 : 64, height: IS_NARROW_SCREEN ? 56 : 64, backgroundColor: 'transparent' },
  logoImg: { width: IS_NARROW_SCREEN ? 56 : 64, height: IS_NARROW_SCREEN ? 56 : 64 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridBtn: { width: '48%', alignItems: 'center', marginBottom: 10 },
  btnShadow: { backgroundColor: 'transparent' },
  gridBtnLabel: {
    marginTop: 6,
    color: '#241A11',
    fontSize: IS_NARROW_SCREEN ? 14 : 15,
    lineHeight: IS_NARROW_SCREEN ? 17 : 19,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  panel1WoodFrame: {
    width: SCREEN_W - 32,
    marginBottom: 8,
    backgroundColor: SCREEN_THEME.woodGrainDark,
    borderRadius: 20,
    padding: 6,
    shadowColor: '#3B2008',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: SCREEN_THEME.woodGrainLight,
  },
  panel1Shadow: {
    width: SCREEN_W - 48,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderRadius: 14,
  },
  panel1Overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    zIndex: 3,
  },
  panel1Text: {
    fontSize: IS_NARROW_SCREEN ? 17 : 19,
    lineHeight: IS_NARROW_SCREEN ? 21 : 23,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.82)',
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 6,
    textAlign: 'center',
  },
  panel1Feed: {
    width: SCREEN_W - 48,
    backgroundColor: SCREEN_THEME.lightCardStrong,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 190,
    borderWidth: 1,
    borderColor: SCREEN_THEME.glassBorder,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 5,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  feedTitle: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontSize: IS_NARROW_SCREEN ? 14 : 16,
    lineHeight: IS_NARROW_SCREEN ? 18 : 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    letterSpacing: 0.1,
  },
  feedLiveBadge: {
    flexShrink: 0,
    alignSelf: 'center',
    fontSize: IS_NARROW_SCREEN ? 12 : 14,
    lineHeight: IS_NARROW_SCREEN ? 16 : 18,
    fontWeight: '900',
    color: SCREEN_THEME.woodGreenDark,
    backgroundColor: 'rgba(122, 167, 112, 0.12)',
    borderRadius: 999,
    paddingHorizontal: IS_NARROW_SCREEN ? 7 : 9,
    paddingVertical: 4,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  feedRowUrgent: {
    backgroundColor: 'rgba(199, 122, 93, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 5,
  },
  feedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: SCREEN_THEME.glassBorder,
    marginTop: 2,
  },
  feedAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: SCREEN_THEME.glassBorder,
    marginTop: 2,
  },
  feedTextWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  feedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedTypeLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: SCREEN_THEME.textSecondary,
    letterSpacing: 0.25,
    flexShrink: 1,
  },
  feedName: {
    maxWidth: 92,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textMuted,
    flexShrink: 0,
  },
  feedItemText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginTop: 1,
  },
  feedArrow: {
    fontSize: 15,
    fontWeight: '800',
    color: SCREEN_THEME.terracottaDark,
    flexShrink: 0,
    lineHeight: 30,
  },
  feedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
    marginTop: 1,
  },
  feedBadgeText: {
    fontSize: 14,
    lineHeight: 18,
  },
  feedEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  feedEmptyText: {
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    textAlign: 'center',
  },
  panel2Stage: {
    alignSelf: 'stretch',
    height: PANEL2_H,
    overflow: 'hidden',
    position: 'relative',
  },
  panel2Shadow: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 1,
  },
  panel2Img: { width: '100%', height: PANEL2_H },
  panel2FrameOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: PANEL2_H,
    zIndex: 5,
  },
  chatListWrap: {
    position: 'absolute',
    top: Math.round(PANEL2_H * 0.055),
    bottom: Math.round(PANEL2_H * 0.075),
    left: IS_NARROW_SCREEN ? 22 : 30,
    right: IS_NARROW_SCREEN ? 22 : 30,
    zIndex: 4,
    overflow: 'hidden',
  },
  chatMirrorCard: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(22, 16, 10, 0.72)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chatMirrorContent: {
    paddingTop: 8,
    paddingLeft: 12,
    paddingRight: 8,
    paddingBottom: 10,
  },
  chatMirrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 42,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  chatMirrorTitle: { fontSize: IS_NARROW_SCREEN ? 15 : 16, fontWeight: '900', color: '#fff', textAlign: 'center' },
  chatMirrorLive: { fontSize: IS_NARROW_SCREEN ? 11 : 12, fontWeight: '800', color: '#7FFF9A', textAlign: 'center' },
  chatMirrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 8,
  },
  chatMirrorIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatMirrorInfo: { flex: 1 },
  chatMirrorName: { fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.94)' },
  newsAttentionText: { color: '#FFF4B0' },
  chatMirrorText: { fontSize: 11, color: 'rgba(255,255,255,0.62)', marginTop: 1 },
  chatMirrorTime: { fontSize: 22, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },
});

export default HomeScreen;
