import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  Platform,
} from 'react-native';

const OFFER_PLACEHOLDER = require('../../assets/_zaglushka-lenta.webp');
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ref, get } from 'firebase/database';
import { subscribeBiznesPlusPlaces } from '../services/bonusService';
import { database } from '../firebase-core';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getFoodPlaces, getActiveFoodOffers, foodInfoSeed } from '../services/foodSeed';
import { logFoodEvent } from '../services/foodAnalytics';
import { foodTopService, type FoodTopListing } from '../services/foodTopService';
import { FoodCategory, FoodOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';
import AppPhotoImage from '../components/AppPhotoImage';
import { FeatureRatingBanner } from '../components/FeatureRatingBanner';
import PhotoUploadField, { type UploadedPhoto } from '../components/PhotoUploadField';
import UploadedPhotosGrid from '../components/UploadedPhotosGrid';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { getLanguageValidationError } from '../utils/contentLanguageGuard';
import { showUserError } from '../utils/userFacingErrors';
import FeedLikeButton from '../components/FeedLikeButton';
import { toggleFavorite, getFavorites, type FavoriteSource } from '../services/favoritesService';
import { useSoftToast } from '../hooks/useSoftToast';
import { selectUserId } from '../redux/selectors';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;
type ScreenMode = 'home' | 'eat';
type EatFilter = 'all' | 'pizza' | 'cafe' | 'restaurant';

const UI_TEXT = {
  ua: {
    title: 'Їжа на Чайці',
    subtitle: 'Поїсти, купити продукти, знайти акції',
    searchPlaceholder: 'Пошук: піца, кафе, магазин...',
    whatNeeded: 'Що потрібно?',
    eatNow: 'Поїсти зараз',
    eatNowDesc: 'Піца, кафе, ресторани поруч',
    shopping: 'Покупки на тиждень',
    shoppingDesc: 'Готовий список продуктів з галочками',
    offers: 'Акції поруч',
    offersDesc: 'Знижки кафе та магазинів',
    recommended: 'Рекомендуємо поруч',
    offersSection: 'Акції поруч',
    noOffers: 'Поки що немає активних акцій.',
    noPlaces: 'Нічого не знайдено.',
    back: 'Назад',
    call: 'Подзвонити',
    route: 'Маршрут',
    telegram: 'Telegram',
    open: 'Відчинено',
    openUntil: 'до',
    closed: 'Зачинено',
    hoursUnknown: 'Години уточнити',
    partner: 'Партнер',
    delivery: 'Доставка',
    validUntil: 'до',
    topFoodTitle: 'Топ заклади',
    addTop: 'Додати в топ',
    addTopFormTitle: 'Картка для топу',
    topNameLabel: 'Назва',
    topNamePlaceholder: 'Наприклад: піца, кава, обід...',
    topDescriptionLabel: 'Опис',
    topDescriptionPlaceholder: 'Коротко: що саме смачного, де замовити або чим цікаво.',
    topPhotoLabel: 'Фото',
    topSubmit: 'Надіслати на модерацію',
    topSuccessTitle: 'Готово',
    topSuccessMsg: 'Картку надіслано на модерацію. Після перевірки вона зʼявиться в топі.',
    topFillError: 'Додайте назву, опис і фото.',
    topPhotoUploading: 'Дочекайтесь завершення завантаження фото.',
    topPhotoError: 'Фото не завантажилось. Видаліть його або спробуйте ще раз.',
    topPhotoRequired: 'Додайте фото для картки.',
    businessTitle: 'Ваш бізнес на Чайці?',
    businessDesc: 'Додайте заклад у топ без нових правил доступу.',
    businessButton: 'Додати заклад',
    offerBadge: 'Акція',
    offerAlertTitle: 'Акція поруч',
    offerAlertRoute: 'Маршрут',
    share: 'Поділитися',
    favoriteAdded: 'Додано в обране',
    favoriteRemoved: 'Видалено з обраного',
    showMore: 'Більше',
    errorTitle: 'Помилка',
    ok: 'OK',
    filters: {
      all: 'Всі',
      pizza: 'Піца',
      cafe: 'Кафе',
      restaurant: 'Ресторани',
    },
  },
  ru: {
    title: 'Еда на Чайке',
    subtitle: 'Поесть, купить продукты, найти акции',
    searchPlaceholder: 'Поиск: пицца, кафе, магазин...',
    whatNeeded: 'Что нужно?',
    eatNow: 'Поесть сейчас',
    eatNowDesc: 'Пицца, кафе, рестораны рядом',
    shopping: 'Покупки на неделю',
    shoppingDesc: 'Готовый список продуктов с галочками',
    offers: 'Акции рядом',
    offersDesc: 'Скидки кафе и магазинов',
    recommended: 'Рекомендуем рядом',
    offersSection: 'Акции рядом',
    noOffers: 'Пока нет активных акций.',
    noPlaces: 'Ничего не найдено.',
    back: 'Назад',
    call: 'Позвонить',
    route: 'Маршрут',
    telegram: 'Telegram',
    open: 'Открыто',
    openUntil: 'до',
    closed: 'Закрыто',
    hoursUnknown: 'Часы уточнить',
    partner: 'Партнёр',
    delivery: 'Доставка',
    validUntil: 'до',
    topFoodTitle: 'Топ заведения',
    addTop: 'Добавить в топ',
    addTopFormTitle: 'Карточка для топа',
    topNameLabel: 'Название',
    topNamePlaceholder: 'Например: пицца, кофе, обед...',
    topDescriptionLabel: 'Описание',
    topDescriptionPlaceholder: 'Коротко: что вкусного, где заказать или чем интересно.',
    topPhotoLabel: 'Фото',
    topSubmit: 'Отправить на модерацию',
    topSuccessTitle: 'Готово',
    topSuccessMsg: 'Карточка отправлена на модерацию. После проверки она появится в топе.',
    topFillError: 'Добавьте название, описание и фото.',
    topPhotoUploading: 'Дождитесь завершения загрузки фото.',
    topPhotoError: 'Фото не загрузилось. Удалите его или попробуйте ещё раз.',
    topPhotoRequired: 'Добавьте фото для карточки.',
    businessTitle: 'Ваш бизнес на Чайке?',
    businessDesc: 'Добавьте заведение в топ без новых правил доступа.',
    businessButton: 'Добавить заведение',
    offerBadge: 'Акция',
    offerAlertTitle: 'Акция рядом',
    offerAlertRoute: 'Маршрут',
    share: 'Поделиться',
    favoriteAdded: 'Добавлено в избранное',
    favoriteRemoved: 'Удалено из избранного',
    showMore: 'Больше',
    errorTitle: 'Ошибка',
    ok: 'OK',
    filters: {
      all: 'Все',
      pizza: 'Пицца',
      cafe: 'Кафе',
      restaurant: 'Рестораны',
    },
  },
  en: {
    title: 'Food at Chaika',
    subtitle: 'Eat, shop for groceries, find deals',
    searchPlaceholder: 'Search: pizza, cafe, shop...',
    whatNeeded: 'What do you need?',
    eatNow: 'Eat now',
    eatNowDesc: 'Pizza, cafes, restaurants nearby',
    shopping: 'Weekly shopping',
    shoppingDesc: 'Ready-made grocery list with checkboxes',
    offers: 'Deals nearby',
    offersDesc: 'Cafe and shop discounts',
    recommended: 'Recommended nearby',
    offersSection: 'Deals nearby',
    noOffers: 'No active deals yet.',
    noPlaces: 'Nothing found.',
    back: 'Back',
    call: 'Call',
    route: 'Route',
    telegram: 'Telegram',
    open: 'Open',
    openUntil: 'until',
    closed: 'Closed',
    hoursUnknown: 'Check hours',
    partner: 'Partner',
    delivery: 'Delivery',
    validUntil: 'until',
    topFoodTitle: 'Top places',
    addTop: 'Add to top',
    addTopFormTitle: 'Top card',
    topNameLabel: 'Name',
    topNamePlaceholder: 'For example: pizza, coffee, lunch...',
    topDescriptionLabel: 'Description',
    topDescriptionPlaceholder: 'Shortly: what is tasty, where to order, or why it is interesting.',
    topPhotoLabel: 'Photo',
    topSubmit: 'Send to moderation',
    topSuccessTitle: 'Done',
    topSuccessMsg: 'The card was sent to moderation. After review it will appear in the top.',
    topFillError: 'Add a name, description, and photo.',
    topPhotoUploading: 'Wait until the photo upload finishes.',
    topPhotoError: 'The photo did not upload. Remove it or try again.',
    topPhotoRequired: 'Add a photo for the card.',
    businessTitle: 'Your business at Chaika?',
    businessDesc: 'Add your place to the top without new access rules.',
    businessButton: 'Add place',
    offerBadge: 'Deal',
    offerAlertTitle: 'Deal nearby',
    offerAlertRoute: 'Route',
    share: 'Share',
    favoriteAdded: 'Added to favorites',
    favoriteRemoved: 'Removed from favorites',
    showMore: 'More',
    errorTitle: 'Error',
    ok: 'OK',
    filters: {
      all: 'All',
      pizza: 'Pizza',
      cafe: 'Cafe',
      restaurant: 'Restaurants',
    },
  },
} as const;

const FOOD_FAVORITE_SOURCE: FavoriteSource = 'food';

const EAT_FILTERS: { key: EatFilter; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'all', icon: 'view-grid-outline' },
  { key: 'pizza', icon: 'pizza' },
  { key: 'cafe', icon: 'coffee' },
  { key: 'restaurant', icon: 'silverware-fork-knife' },
];

// --- Helpers ---

/** Parse "09:00-22:00" format. Returns { isOpen, closingTime } or null if unparseable. */
function parseWorkingHours(workingHours?: string): { isOpen: boolean; closingTime: string } | null {
  if (!workingHours) return null;
  const match = workingHours.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const openH = parseInt(match[1], 10);
  const openM = parseInt(match[2], 10);
  const closeH = parseInt(match[3], 10);
  const closeM = parseInt(match[4], 10);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  const closingTime = `${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}`;

  return { isOpen, closingTime };
}

function getPlaceFoodCategory(place: Place): FoodCategory | null {
  const info = foodInfoSeed[place.id];
  return info?.category ?? null;
}

function matchesEatFilter(place: Place, filter: EatFilter): boolean {
  if (filter === 'all') return true;
  const info = foodInfoSeed[place.id];
  if (!info) return false;
  if (filter === 'pizza') return info.subCategory === 'pizza';
  if (filter === 'cafe') return info.category === 'cafe';
  if (filter === 'restaurant') return info.category === 'restaurant';
  return false;
}

function openPhone(phone?: string) {
  const safePhone = phone?.trim();
  if (!safePhone) return;
  Linking.openURL(`tel:${safePhone}`);
}


function openTelegram(telegram?: string) {
  const handle = telegram?.trim().replace('@', '').replace('https://t.me/', '');
  if (!handle) return;
  Linking.openURL(`https://t.me/${handle}`);
}

const formatOfferDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Component ---

export default function EdaNaChaykeScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.email === 'vikramsave@ukr.net';
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const currentUserId = useSelector(selectUserId);
  const [mode, setMode] = useState<ScreenMode>('home');
  const [claimPlaceIds, setClaimPlaceIds] = useState<Set<string>>(new Set());
  const [eatFilter, setEatFilter] = useState<EatFilter>('all');
  const [query, setQuery] = useState('');
  const [topListings, setTopListings] = useState<FoodTopListing[]>([]);
  const [topListingsReady, setTopListingsReady] = useState(false);
  const [topFormVisible, setTopFormVisible] = useState(false);
  const [topTitle, setTopTitle] = useState('');
  const [topDescription, setTopDescription] = useState('');
  const [topPhotos, setTopPhotos] = useState<UploadedPhoto[]>([]);
  const [topSubmitting, setTopSubmitting] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [biznesPlusIds, setBiznesPlusIds] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const offersSectionY = useRef(0);
  const { showSuccess } = useSoftToast();
  const [showAllEatPlaces, setShowAllEatPlaces] = useState(false);

  useEffect(() => {
    logFoodEvent('food_open_screen');
  }, []);

  useEffect(() => {
    return subscribeBiznesPlusPlaces('food', setBiznesPlusIds);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const snap = await get(ref(database, 'business_plus_claims'));
        if (!snap.exists()) return;
        const ids = new Set<string>();
        snap.forEach((child) => {
          if (child.val()?.status === 'pending') ids.add(child.key!);
        });
        setClaimPlaceIds(ids);
      } catch { /* ignore */ }
    })();
  }, [isAdmin]);

  useEffect(() => {
    getFavorites(FOOD_FAVORITE_SOURCE).then((items) => {
      setFavoriteIds(new Set(items.map((item) => item.id)));
    });
  }, []);

  useEffect(() => foodTopService.subscribe((items) => {
    setTopListings(items);
    setTopListingsReady(true);
  }, user?.id), [user?.id]);

  const allFoodPlaces = useMemo(() => getFoodPlaces(chaykaPlaces), []);

  const activeOffers = useMemo(() => getActiveFoodOffers(chaykaPlaces), []);
  const offerPlaceIds = useMemo(() => new Set(activeOffers.map((offer) => offer.placeId)), [activeOffers]);

  // Eat mode: filtered by category + search
  const eatPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allFoodPlaces
      .filter((place) => {
        // exclude grocery from eat mode
        const cat = getPlaceFoodCategory(place);
        if (cat === 'grocery') return false;
        if (!matchesEatFilter(place, eatFilter)) return false;
        if (!normalizedQuery) return true;
        return `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aPlus = biznesPlusIds.indexOf(a.id);
        const bPlus = biznesPlusIds.indexOf(b.id);
        if (aPlus !== -1 || bPlus !== -1) {
          if (aPlus === -1) return 1;
          if (bPlus === -1) return -1;
          return aPlus - bPlus;
        }
        return 0;
      });
  }, [allFoodPlaces, biznesPlusIds, eatFilter, query]);

  // Home mode: recommended (non-grocery, max 4)
  const recommendedPlaces = useMemo(() => {
    return allFoodPlaces
      .filter((p) => getPlaceFoodCategory(p) !== 'grocery')
      .filter((p) => !offerPlaceIds.has(p.id))
      .slice(0, 3);
  }, [allFoodPlaces, offerPlaceIds]);

  // Home mode: offers with places
  const offersWithPlaces = useMemo(() => {
    return activeOffers.map((offer) => ({
      offer,
      place: allFoodPlaces.find((p) => p.id === offer.placeId),
    }));
  }, [activeOffers, allFoodPlaces]);

  // Home mode: search across all food places
  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return null;
    return allFoodPlaces.filter((place) =>
      `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery),
    );
  }, [allFoodPlaces, query]);

  const visibleTopListings = useMemo(() => topListings.slice(0, 10), [topListings]);
  const hasTopUploadingPhotos = topPhotos.some((photo) => photo.status === 'uploading');
  const hasTopPhotoErrors = topPhotos.some((photo) => photo.status === 'error');

  const resetTopForm = useCallback(() => {
    setTopTitle('');
    setTopDescription('');
    setTopPhotos([]);
  }, []);

  const handleOpenTopForm = useCallback(() => {
    if (!validateSubmissionRequirements({ language, userId: user?.id, navigation })) return;
    setTopFormVisible(true);
  }, [language, navigation, user?.id]);

  const handleSubmitTop = useCallback(async () => {
    if (!validateSubmissionRequirements({ language, userId: user?.id, navigation })) return;
    const trimmedTitle = topTitle.trim();
    const trimmedDescription = topDescription.trim();
    if (!trimmedTitle || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.topFillError);
      return;
    }
    const langError = getLanguageValidationError(`${trimmedTitle} ${trimmedDescription}`, language);
    if (langError) {
      Alert.alert(text.errorTitle, langError);
      return;
    }
    if (hasTopUploadingPhotos) {
      Alert.alert(text.errorTitle, text.topPhotoUploading);
      return;
    }
    if (hasTopPhotoErrors) {
      Alert.alert(text.errorTitle, text.topPhotoError);
      return;
    }
    const donePhotos = getDonePhotos(topPhotos);
    if (donePhotos.length === 0) {
      Alert.alert(text.errorTitle, text.topPhotoRequired);
      return;
    }

    setTopSubmitting(true);
    try {
      const firstPhoto = donePhotos[0];
      const createdAt = new Date().toISOString();
      await foodTopService.add({
        title: trimmedTitle,
        description: trimmedDescription,
        photoUri: firstPhoto.downloadUrl,
        photoStoragePath: firstPhoto.storagePath,
        photoId: firstPhoto.photoId,
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt,
        createdAt,
        userId: user?.id || '',
        language,
      });
      Alert.alert(text.topSuccessTitle, text.topSuccessMsg, [
        { text: text.ok, onPress: () => { resetTopForm(); setTopFormVisible(false); } },
      ]);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setTopSubmitting(false);
    }
  }, [
    hasTopPhotoErrors,
    hasTopUploadingPhotos,
    language,
    navigation,
    resetTopForm,
    text.errorTitle,
    text.ok,
    text.topFillError,
    text.topPhotoError,
    text.topPhotoRequired,
    text.topPhotoUploading,
    text.topSuccessMsg,
    text.topSuccessTitle,
    topDescription,
    topPhotos,
    topTitle,
    user?.id,
  ]);

  const handleSharePlace = useCallback(async (place: Place) => {
    try {
      await Share.share({ message: `${place.name}\n${place.address}` });
    } catch { /* user cancelled */ }
  }, []);

  const handleToggleFavorite = useCallback(async (placeId: string) => {
    const added = await toggleFavorite(placeId, FOOD_FAVORITE_SOURCE);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (added) next.add(placeId); else next.delete(placeId);
      return next;
    });
    showSuccess(added ? text.favoriteAdded : text.favoriteRemoved);
  }, [showSuccess, text.favoriteAdded, text.favoriteRemoved]);

  const handleBack = useCallback(() => {
    if (mode === 'eat') {
      setMode('home');
      setEatFilter('all');
      setQuery('');
    } else {
      navigation.goBack();
    }
  }, [mode, navigation]);

  const handleEatNow = useCallback(() => {
    logFoodEvent('food_select_category', { category: 'eat_now' });
    setMode('eat');
    setQuery('');
  }, []);

  const handleShopping = useCallback(() => {
    navigation.navigate('SpisokPokupokScreen');
  }, [navigation]);

  const handleOffersScroll = useCallback(() => {
    logFoodEvent('food_open_offer', { category: 'offers' });
    scrollRef.current?.scrollTo({ y: Math.max(offersSectionY.current - 8, 0), animated: true });
  }, []);

  const handleCallPlace = useCallback((place: Place) => {
    if (!place.phone) return;
    logFoodEvent('food_call_place', { placeId: place.id });
    openPhone(place.phone);
  }, []);

  const handleRoutePlace = useCallback((place: Place) => {
    logFoodEvent('food_route_place', { placeId: place.id });
    navigation.navigate('MainTabs', {
      screen: 'MapTab',
      params: getMapFocusPlaceParams(place),
    });
  }, [navigation]);

  const handleTelegramPlace = useCallback((place: Place, telegram?: string) => {
    if (!telegram) return;
    logFoodEvent('food_open_telegram', { placeId: place.id });
    openTelegram(telegram);
  }, []);

  const handleOpenPlaceDetail = useCallback((place: Place) => {
    const parsed = parseWorkingHours(place.workingHours);
    logFoodEvent('food_open_place', { placeId: place.id });
    navigation.navigate('ItemDetailScreen', {
      item: {
        id: place.id,
        title: place.name,
        address: place.address,
        phone: place.phone,
        status: parsed
          ? parsed.isOpen
            ? `${text.open} ${text.openUntil} ${parsed.closingTime}`
            : text.closed
          : text.hoursUnknown,
        sourceType: 'place',
        sourceId: place.id,
      },
      feedScreen: 'food',
    });
  }, [navigation, text.closed, text.hoursUnknown, text.open, text.openUntil]);

  // --- Render helpers ---

  const renderStatusBadge = (place: Place) => {
    const parsed = parseWorkingHours(place.workingHours);
    if (!parsed) {
      return (
        <View style={[styles.statusBadge, styles.statusUnknown]}>
          <Text style={styles.statusUnknownText}>{text.hoursUnknown}</Text>
        </View>
      );
    }
    if (parsed.isOpen) {
      return (
        <View style={[styles.statusBadge, styles.statusOpen]}>
          <Text style={styles.statusOpenText}>{text.open} {text.openUntil} {parsed.closingTime}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, styles.statusClosed]}>
        <Text style={styles.statusClosedText}>{text.closed}</Text>
      </View>
    );
  };

  const renderTopFoodCard = (item: FoodTopListing) => {
    const isPending = item.moderationStatus !== 'approved';
    return (
      <TouchableOpacity
        key={`food-top-${item.id}`}
        style={styles.topFoodItem}
        activeOpacity={0.84}
        onPress={() => {
          navigation.navigate('ItemDetailScreen', {
            item: {
              id: item.id,
              title: item.title,
              description: item.description,
              photoUri: item.photoUri,
              photoStoragePath: item.photoStoragePath,
              status: isPending ? text.topSubmit : text.topFoodTitle,
              sourceType: 'food_top',
              sourceId: item.id,
            },
          });
        }}
      >
        <AppPhotoImage
          uri={item.photoUri}
          storagePath={item.photoStoragePath}
          style={styles.topFoodPhoto}
          resizeMode="cover"
          debugLabel={`FoodTop:${item.id}`}
        />
        <Text style={styles.topFoodName} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
        <Text style={styles.topFoodMeta} numberOfLines={1} ellipsizeMode="tail">
          {isPending ? text.topSubmit : item.description}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTopFoodForm = () => (
    <Modal visible={topFormVisible} transparent animationType="slide" onRequestClose={() => setTopFormVisible(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setTopFormVisible(false)} />
        <View style={styles.sheetWrapper}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{text.addTopFormTitle}</Text>
              <TouchableOpacity onPress={() => setTopFormVisible(false)} style={styles.sheetCloseBtn} activeOpacity={0.75}>
                <MaterialCommunityIcons name="close" size={18} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
              style={styles.sheetScroll}
            >
              <Text style={styles.formLabel}>{text.topNameLabel}</Text>
              <TextInput
                value={topTitle}
                onChangeText={setTopTitle}
                placeholder={text.topNamePlaceholder}
                placeholderTextColor="#A0938D"
                style={styles.input}
                maxLength={70}
              />

              <Text style={styles.formLabel}>{text.topDescriptionLabel}</Text>
              <TextInput
                value={topDescription}
                onChangeText={setTopDescription}
                placeholder={text.topDescriptionPlaceholder}
                placeholderTextColor="#A0938D"
                style={[styles.input, styles.textarea]}
                multiline
                maxLength={220}
              />

              {user?.id ? (
                <>
                  <Text style={styles.formLabel}>{text.topPhotoLabel}</Text>
                  <PhotoUploadField
                    uid={user.id}
                    userName={user.name || user.email || user.id}
                    maxPhotos={1}
                    storagePath="food_top_listings"
                    onPhotosChange={setTopPhotos}
                    metadata={{ sourceScreen: 'Eda-Na-Chayke', sourceScreenLabel: text.addTop }}
                  />
                  <UploadedPhotosGrid />
                </>
              ) : null}

              <TouchableOpacity
                style={[styles.submitBtn, (topSubmitting || hasTopUploadingPhotos) && styles.submitBtnDisabled]}
                onPress={handleSubmitTop}
                activeOpacity={0.86}
                disabled={topSubmitting || hasTopUploadingPhotos}
              >
                {topSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>{hasTopUploadingPhotos ? text.topPhotoUploading : text.topSubmit}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderPlaceCard = (place: Place) => {
    const info = foodInfoSeed[place.id];
    const hasTelegram = !!(info?.telegram);
    const hasPhone = !!place.phone;
    const isPartner = false; // MVP: no paid places yet
    const hasDelivery = !!info?.deliveryAvailable;
    const isFav = favoriteIds.has(place.id);
    const hasClaim = isAdmin && claimPlaceIds.has(place.id);

    return (
      <TouchableOpacity
        key={place.id}
        style={[styles.placeCard, hasClaim && styles.placeCardClaimed]}
        activeOpacity={0.88}
        onPress={() => handleOpenPlaceDetail(place)}
      >
        <View style={styles.placeHeader}>
          <View style={styles.placeTitleBlock}>
            <Text style={styles.placeTitle} numberOfLines={2}>{place.name}</Text>
            <View style={styles.placeMetaRow}>
              {renderStatusBadge(place)}
              {isPartner && (
                <View style={styles.partnerBadge}>
                  <Text style={styles.partnerBadgeText}>{text.partner}</Text>
                </View>
              )}
              {hasDelivery && (
                <View style={styles.deliveryBadge}>
                  <Text style={styles.deliveryBadgeText}>{text.delivery}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.addressRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color={SCREEN_THEME.textMuted} />
          <Text style={styles.addressText} numberOfLines={1}>{place.address}</Text>
        </View>

        <View style={styles.cardActions}>
          {hasPhone && (
            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation?.();
                handleCallPlace(place);
              }}
            >
              <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{text.call}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            activeOpacity={0.85}
            onPress={(event) => {
              event.stopPropagation?.();
              handleRoutePlace(place);
            }}
          >
            <MaterialCommunityIcons name="map-marker-radius" size={16} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={styles.actionButtonSecondaryText}>{text.route}</Text>
          </TouchableOpacity>
          {hasTelegram && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonTelegram]}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation?.();
                handleTelegramPlace(place, info?.telegram);
              }}
            >
              <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{text.telegram}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.cardActionsRight}>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => { e.stopPropagation?.(); void handleSharePlace(place); }}
              activeOpacity={0.7}
              accessibilityLabel={text.share}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
            <FeedLikeButton
              currentUserId={currentUserId}
              likePath="feed_likes/food"
              likeId={place.id}
            />
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(e) => { e.stopPropagation?.(); void handleToggleFavorite(place.id); }}
              activeOpacity={0.7}
              accessibilityLabel={isFav ? text.favoriteRemoved : text.favoriteAdded}
            >
              <MaterialCommunityIcons
                name={isFav ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={isFav ? SCREEN_THEME.terracotta : SCREEN_THEME.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAddPlaceButton = () => (
    <TouchableOpacity style={styles.addPlaceButton} activeOpacity={0.88} onPress={handleOpenTopForm}>
      <MaterialCommunityIcons name="store-plus" size={16} color="#FFFFFF" />
      <Text style={styles.addPlaceBtnText}>{text.businessButton}</Text>
    </TouchableOpacity>
  );

  const renderOfferCard = (offer: FoodOffer, place?: Place) => {
    const dateStr = offer.validUntil ? `${text.validUntil} ${formatOfferDate(offer.validUntil)}` : '';
    const placeName = place?.name;
    return (
      <TouchableOpacity
        key={offer.id}
        style={styles.offerCard}
        activeOpacity={0.86}
        onPress={() => {
          logFoodEvent('food_open_offer', { placeId: offer.placeId });
          Alert.alert(
            text.offerAlertTitle,
            `${offer.title}\n\n${offer.shortText}${placeName ? `\n\n${placeName}` : ''}`,
            [
              ...(place ? [{ text: text.offerAlertRoute, onPress: () => handleRoutePlace(place) }] : []),
              { text: text.ok, style: 'cancel' as const },
            ],
          );
        }}
      >
        <View style={styles.offerRow}>
          <Image
            source={OFFER_PLACEHOLDER}
            style={styles.offerVisual}
            resizeMode="cover"
          />
          <View style={styles.offerTextBlock}>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeText}>{text.offerBadge}</Text>
            </View>
            <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
            <Text style={styles.offerShortText} numberOfLines={2}>{offer.shortText}</Text>
            <View style={styles.offerFooterRow}>
              {dateStr ? <Text style={styles.offerMeta}>{dateStr}</Text> : null}
              {placeName ? <Text style={styles.offerPlaceName} numberOfLines={1}>{placeName}</Text> : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCTA = (
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'],
    title: string,
    desc: string,
    color: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity style={styles.ctaButton} activeOpacity={0.88} onPress={onPress}>
      <View style={[styles.ctaIcon, { backgroundColor: color }]}>
        <MaterialCommunityIcons name={icon} size={28} color="#FFFFFF" />
      </View>
      <View style={styles.ctaTextBlock}>
        <Text style={styles.ctaTitle}>{title}</Text>
        <Text style={styles.ctaDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={SCREEN_THEME.textMuted} />
    </TouchableOpacity>
  );

  // --- EAT MODE ---
  if (mode === 'eat') {
    return (
      <SafeAreaView style={styles.container}>
        {renderTopFoodForm()}
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, styles.contentWithAddBar]} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.hero}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
            </TouchableOpacity>
            <View style={styles.heroTextBlock}>
              <Text style={styles.title}>{text.eatNow}</Text>
              <Text style={styles.subtitle}>{text.eatNowDesc}</Text>
            </View>
          </View>

          {/* Search */}
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={22} color={SCREEN_THEME.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={text.searchPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={styles.searchInput}
            />
          </View>

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {EAT_FILTERS.map((filter) => {
              const isActive = eatFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => {
                    logFoodEvent('food_select_category', { category: filter.key });
                    setEatFilter(filter.key);
                    setShowAllEatPlaces(false);
                  }}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons
                    name={filter.icon}
                    size={18}
                    color={isActive ? '#FFFFFF' : SCREEN_THEME.enamelBlueDark}
                  />
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {text.filters[filter.key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!topListingsReady ? (
            <ActivityIndicator size="small" color={SCREEN_THEME.accentGold} style={{ marginVertical: 8 }} />
          ) : visibleTopListings.length > 0 ? (
            <View style={styles.topFoodSection}>
              <Text style={styles.topFoodTitle}>{text.topFoodTitle}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topFoodScroll}>
                {visibleTopListings.map((item) => renderTopFoodCard(item))}
              </ScrollView>
            </View>
          ) : null}

          {/* Place list */}
          <>
            <FlatList
              scrollEnabled={false}
              data={showAllEatPlaces ? eatPlaces : eatPlaces.slice(0, 4)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => renderPlaceCard(item)}
              contentContainerStyle={eatPlaces.length > 0 ? styles.cardList : undefined}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
                  <Text style={styles.emptyText}>{text.noPlaces}</Text>
                </View>
              }
            />
            {!showAllEatPlaces && eatPlaces.length > 4 ? (
              <TouchableOpacity
                style={styles.showMoreButton}
                activeOpacity={0.82}
                onPress={() => setShowAllEatPlaces(true)}
              >
                <Text style={styles.showMoreText}>{text.showMore}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={SCREEN_THEME.terracottaDark} />
              </TouchableOpacity>
            ) : null}
          </>
        </ScrollView>
        <View style={styles.addTopBar}>
          <TouchableOpacity style={styles.addTopButton} onPress={handleOpenTopForm} activeOpacity={0.88}>
            <MaterialCommunityIcons name="plus-circle" size={20} color="#FFFFFF" />
            <Text style={styles.addTopButtonText}>{text.addTop}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- HOME MODE ---
  return (
    <SafeAreaView style={styles.container}>
      {renderTopFoodForm()}
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={22} color={SCREEN_THEME.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={text.searchPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            style={styles.searchInput}
          />
        </View>

        {/* Search results */}
        {searchResults != null ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{text.recommended}</Text>
              <Text style={styles.resultCount}>{searchResults.length}</Text>
            </View>
            {searchResults.length > 0 ? (
              <View style={styles.cardList}>
                {searchResults.map((place) => renderPlaceCard(place))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
                <Text style={styles.emptyText}>{text.noPlaces}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* CTA buttons */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{text.whatNeeded}</Text>
            </View>

            {renderCTA('pizza', text.eatNow, text.eatNowDesc, '#E07B39', handleEatNow)}
            {renderCTA('cart', text.shopping, text.shoppingDesc, SCREEN_THEME.enamelBlueDark, handleShopping)}
            {renderCTA('fire', text.offers, text.offersDesc, '#C0392B', handleOffersScroll)}
            {renderAddPlaceButton()}

            {/* Recommended nearby */}
            {recommendedPlaces.length > 0 && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: 10 }]}>
                  <Text style={styles.sectionTitle}>{text.recommended}</Text>
                </View>
                <View style={styles.cardList}>
                  {recommendedPlaces.map((place) => renderPlaceCard(place))}
                </View>
              </>
            )}

            <View onLayout={(event) => { offersSectionY.current = event.nativeEvent.layout.y; }}>
              {/* Offers */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{text.offersSection}</Text>
              </View>
              {offersWithPlaces.length > 0 ? (
                <View style={styles.cardList}>
                  {offersWithPlaces.map(({ offer, place }) =>
                    renderOfferCard(offer, place),
                  )}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="tag-off-outline" size={34} color={SCREEN_THEME.textMuted} />
                  <Text style={styles.emptyText}>{text.noOffers}</Text>
                </View>
              )}
            </View>
          </>
        )}

        <FeatureRatingBanner screenId="eda" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  content: {
    padding: 16,
    paddingBottom: 34,
  },
  contentWithAddBar: {
    paddingBottom: 96,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
    marginRight: 12,
  },
  heroTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  resultCount: {
    minWidth: 30,
    textAlign: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: SCREEN_THEME.accentCream,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '900',
  },

  // CTA
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  ctaIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  ctaTextBlock: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  ctaDesc: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 17,
  },
  addPlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2E7D5B',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  addPlaceBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  // Category chips (eat mode)
  categoryList: {
    paddingBottom: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  categoryChipText: {
    marginLeft: 6,
    fontSize: 13,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },

  // Top food
  topFoodSection: {
    marginBottom: 16,
  },
  topFoodTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 8,
  },
  topFoodScroll: {
    paddingHorizontal: 4,
    paddingBottom: 4,
    gap: 12,
  },
  topFoodItem: {
    width: 118,
    borderRadius: 14,
    padding: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  topFoodPhoto: {
    width: '100%',
    height: 76,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    marginBottom: 7,
  },
  topFoodName: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    width: '100%',
    textAlign: 'left',
  },
  topFoodMeta: {
    fontSize: 10,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    width: '100%',
    textAlign: 'left',
    marginTop: 3,
  },

  // Add top sheet
  addTopBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 22 : 14,
    backgroundColor: 'rgba(250, 244, 230, 0.96)',
    borderTopWidth: 1,
    borderTopColor: SCREEN_THEME.borderSoft,
  },
  addTopButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#E07B39',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...SCREEN_THEME.raisedShadow,
  },
  addTopButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D9C69E',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  formLabel: {
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    fontWeight: '700',
  },
  textarea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#E07B39',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  // Place card
  cardList: {
    gap: 10,
    marginBottom: 18,
  },
  placeCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  placeCardClaimed: {
    borderColor: '#F9C400',
    borderWidth: 2,
    backgroundColor: '#FFFDE7',
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  placeTitleBlock: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  placeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },

  // Status badges
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusOpen: {
    backgroundColor: '#E8F5E9',
  },
  statusOpenText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2E7D32',
  },
  statusClosed: {
    backgroundColor: '#FFEBEE',
  },
  statusClosedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C62828',
  },
  statusUnknown: {
    backgroundColor: '#F5F5F5',
  },
  statusUnknownText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9E9E9E',
  },
  partnerBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: SCREEN_THEME.accentCream,
  },
  partnerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: SCREEN_THEME.accentGold,
  },
  deliveryBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E3F2FD',
  },
  deliveryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addressText: {
    flex: 1,
    marginLeft: 5,
    color: SCREEN_THEME.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    gap: 5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  actionButtonSecondary: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  actionButtonSecondaryText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontWeight: '900',
    fontSize: 13,
  },
  actionButtonTelegram: {
    backgroundColor: '#2AABEE',
  },

  // Offers
  offerCard: {
    backgroundColor: '#FFF8EA',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8BE68',
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  offerVisual: {
    width: 62,
    height: 62,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 12,
  },
  offerTextBlock: {
    flex: 1,
  },
  offerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#C0392B',
    marginBottom: 6,
  },
  offerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 18,
  },
  offerShortText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 16,
  },
  offerMeta: {
    marginTop: 0,
    marginRight: 8,
    fontSize: 12,
    fontWeight: '900',
    color: SCREEN_THEME.terracotta,
  },
  offerPlaceName: {
    flex: 1,
    marginTop: 0,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
  offerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingVertical: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  showMoreText: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.terracottaDark,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 18,
  },
  emptyText: {
    marginTop: 10,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
  },
});
