import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const OFFER_PLACEHOLDER = require('../../assets/_zaglushka-lenta.webp');
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ref, get } from 'firebase/database';
import { database } from '../firebase-core';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { beautyInfoSeed, getActiveBeautyOffers } from '../services/beautySeed';
import { BeautyCategory, BeautyFeature, BeautyOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { subscribeActiveBonusPromotions, subscribeBiznesPlusPlaces, type BonusPromotion } from '../services/bonusService';
import UserCardActionBar from '../components/UserCardActionBar';
import { toggleFavorite, getFavorites, type FavoriteSource } from '../services/favoritesService';
import { useSoftToast } from '../hooks/useSoftToast';
import PhotoUploadField, { type UploadedPhoto } from '../components/PhotoUploadField';
import UploadedPhotosGrid from '../components/UploadedPhotosGrid';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { getLanguageValidationError } from '../utils/contentLanguageGuard';
import { showUserError } from '../utils/userFacingErrors';
import { beautyTopService } from '../services/beautyTopService';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const TILE_GAP = 10;
const FAVORITE_SOURCE: FavoriteSource = 'beauty';
type CategoryKey = 'all' | BeautyCategory;
type ScreenText = (typeof UI_TEXT)[Lang];

const FEATURE_PRIORITY: BeautyFeature[] = [
  'home_visit', 'online_booking', 'kids_friendly', 'women', 'men',
  'parking', 'certificate', 'discount_first',
];

const UI_TEXT = {
  ua: {
    title: 'Салони краси',
    subtitle: 'Перукарні, манікюр, косметологія поруч',
    searchPlaceholder: 'Пошук салону...',
    actualTitle: 'Актуальні пропозиції',
    actualEmptyTitle: 'Тут зʼявляться акції та знижки',
    actualEmptyText: 'Салони зможуть показувати свої акції, нових майстрів та вільні вікна для мешканців району.',
    addOffer: 'Додати акцію',
    addPlace: 'Додати місце',
    showMore: 'Більше',
    businessOwner: 'Ви власник салону?',
    categoriesTitle: 'Категорії',
    allPlacesTitle: 'Всі салони',
    noResults: 'Нічого не знайдено. Спробуйте змінити пошук або категорію.',
    noOffers: 'Поки що немає активних пропозицій.',
    details: 'Обрати послугу',
    route: 'Маршрут',
    share: 'Поділитись',
    validUntil: 'до',
    free: 'безкоштовно',
    priceFrom: 'від',
    currency: 'грн',
    priceUnknown: 'ціну уточнюйте',
    hasSlots: 'є вільні вікна',
    favoriteAdded: 'Додано в обране',
    favoriteRemoved: 'Видалено з обраного',
    addPlaceFormTitle: 'Додати салон / майстра',
    formNameLabel: 'Назва',
    formNamePlaceholder: 'Назва салону або імʼя майстра',
    formDescriptionLabel: 'Опис',
    formDescriptionPlaceholder: 'Коротко опишіть послуги, графік, контакти',
    formPhotoLabel: 'Фото',
    formSubmit: 'Надіслати на модерацію',
    formSuccessTitle: 'Готово',
    formSuccessMsg: 'Заявку надіслано на модерацію. Після перевірки місце зʼявиться у списку.',
    formFillError: 'Додайте назву, опис і фото.',
    formPhotoUploading: 'Дочекайтесь завершення завантаження фото.',
    formPhotoError: 'Фото не завантажилось. Видаліть його або спробуйте ще раз.',
    formPhotoRequired: 'Додайте фото.',
    errorTitle: 'Помилка',
    ok: 'OK',
    categories: {
      all: 'Всі',
      hair: 'Перукарні',
      nails: 'Нігті',
      cosmetology: 'Косметологія',
      massage: 'Масаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Перукарня',
      nails: 'Нігті',
      cosmetology: 'Косметологія',
      massage: 'Масаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'виїзд додому',
      online_booking: 'онлайн запис',
      kids_friendly: 'дитячі стрижки',
      women: 'жіночі послуги',
      men: 'чоловічі послуги',
      parking: 'парковка',
      certificate: 'сертифікати',
      discount_first: 'знижка новим',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'послуга',
      hour: 'год',
      session: 'сеанс',
    },
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      new_master: 'Новий майстер',
      discount: 'Знижка',
      available_slots: 'Є вікна',
    },
  },
  ru: {
    title: 'Салоны красоты',
    subtitle: 'Парикмахерские, маникюр, косметология рядом',
    searchPlaceholder: 'Поиск салона...',
    actualTitle: 'Актуальные предложения',
    actualEmptyTitle: 'Здесь появятся акции и скидки',
    actualEmptyText: 'Салоны смогут показывать свои акции, новых мастеров и свободные окна для жителей района.',
    addOffer: 'Добавить акцию',
    addPlace: 'Добавить место',
    showMore: 'Больше',
    businessOwner: 'Вы владелец салона?',
    categoriesTitle: 'Категории',
    allPlacesTitle: 'Все салоны',
    noResults: 'Ничего не найдено. Попробуйте изменить поиск или категорию.',
    noOffers: 'Пока нет активных предложений.',
    details: 'Выбрать услугу',
    route: 'Маршрут',
    share: 'Поделиться',
    validUntil: 'до',
    free: 'бесплатно',
    priceFrom: 'от',
    currency: 'грн',
    priceUnknown: 'цену уточняйте',
    hasSlots: 'есть свободные окна',
    favoriteAdded: 'Добавлено в избранное',
    favoriteRemoved: 'Удалено из избранного',
    addPlaceFormTitle: 'Добавить салон / мастера',
    formNameLabel: 'Название',
    formNamePlaceholder: 'Название салона или имя мастера',
    formDescriptionLabel: 'Описание',
    formDescriptionPlaceholder: 'Кратко опишите услуги, график, контакты',
    formPhotoLabel: 'Фото',
    formSubmit: 'Отправить на модерацию',
    formSuccessTitle: 'Готово',
    formSuccessMsg: 'Заявка отправлена на модерацию. После проверки место появится в списке.',
    formFillError: 'Добавьте название, описание и фото.',
    formPhotoUploading: 'Дождитесь завершения загрузки фото.',
    formPhotoError: 'Фото не загрузилось. Удалите его или попробуйте ещё раз.',
    formPhotoRequired: 'Добавьте фото.',
    errorTitle: 'Ошибка',
    ok: 'OK',
    categories: {
      all: 'Все',
      hair: 'Парикмахерские',
      nails: 'Ногти',
      cosmetology: 'Косметология',
      massage: 'Массаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Парикмахерская',
      nails: 'Ногти',
      cosmetology: 'Косметология',
      massage: 'Массаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'выезд на дом',
      online_booking: 'онлайн запись',
      kids_friendly: 'детские стрижки',
      women: 'женские услуги',
      men: 'мужские услуги',
      parking: 'парковка',
      certificate: 'сертификаты',
      discount_first: 'скидка новым',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'услуга',
      hour: 'час',
      session: 'сеанс',
    },
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      new_master: 'Новый мастер',
      discount: 'Скидка',
      available_slots: 'Есть окна',
    },
  },
  en: {
    title: 'Beauty salons',
    subtitle: 'Hair, nails, cosmetology nearby',
    searchPlaceholder: 'Search salon...',
    actualTitle: 'Current offers',
    actualEmptyTitle: 'Deals and discounts will appear here',
    actualEmptyText: 'Salons will be able to show their promotions, new masters and available slots for local residents.',
    addOffer: 'Add promotion',
    addPlace: 'Add place',
    showMore: 'More',
    businessOwner: 'Salon owner?',
    categoriesTitle: 'Categories',
    allPlacesTitle: 'All salons',
    noResults: 'Nothing found. Try changing search or category.',
    noOffers: 'No active offers yet.',
    details: 'Choose service',
    route: 'Route',
    share: 'Share',
    validUntil: 'until',
    free: 'free',
    priceFrom: 'from',
    currency: 'UAH',
    priceUnknown: 'ask for price',
    hasSlots: 'slots available',
    favoriteAdded: 'Added to favorites',
    favoriteRemoved: 'Removed from favorites',
    addPlaceFormTitle: 'Add salon / master',
    formNameLabel: 'Name',
    formNamePlaceholder: 'Salon name or master name',
    formDescriptionLabel: 'Description',
    formDescriptionPlaceholder: 'Briefly describe services, schedule, contacts',
    formPhotoLabel: 'Photo',
    formSubmit: 'Send to moderation',
    formSuccessTitle: 'Done',
    formSuccessMsg: 'The request was sent to moderation. After review the place will appear in the list.',
    formFillError: 'Add a name, description, and photo.',
    formPhotoUploading: 'Wait until the photo upload finishes.',
    formPhotoError: 'The photo did not upload. Remove it or try again.',
    formPhotoRequired: 'Add a photo.',
    errorTitle: 'Error',
    ok: 'OK',
    categories: {
      all: 'All',
      hair: 'Hair salons',
      nails: 'Nails',
      cosmetology: 'Cosmetology',
      massage: 'Massage',
      barbershop: 'Barbershop',
      spa: 'SPA',
    } as Record<CategoryKey, string>,
    categoryLabel: {
      hair: 'Hair salon',
      nails: 'Nails',
      cosmetology: 'Cosmetology',
      massage: 'Massage',
      barbershop: 'Barbershop',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'home visit',
      online_booking: 'online booking',
      kids_friendly: 'kids friendly',
      women: 'women',
      men: 'men',
      parking: 'parking',
      certificate: 'gift cards',
      discount_first: 'first visit discount',
    } as Record<BeautyFeature, string>,
    periods: {
      service: 'service',
      hour: 'hr',
      session: 'session',
    },
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      new_master: 'New master',
      discount: 'Discount',
      available_slots: 'Slots available',
    },
  },
} as const;

const CATEGORIES: { key: CategoryKey; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; bg: string; iconColor: string }[] = [
  { key: 'all', icon: 'view-grid-outline', bg: '#7E9D69', iconColor: '#FFF7DE' },
  { key: 'hair', icon: 'content-cut', bg: '#C77A5D', iconColor: '#FFF0E6' },
  { key: 'nails', icon: 'hand-back-right-outline', bg: '#D4668E', iconColor: '#FFF0F5' },
  { key: 'cosmetology', icon: 'face-woman-shimmer', bg: '#7B6EB1', iconColor: '#F3EEFF' },
  { key: 'massage', icon: 'hand-heart-outline', bg: '#4F8D5F', iconColor: '#F0FBF2' },
  { key: 'barbershop', icon: 'face-man-outline', bg: '#4D7892', iconColor: '#EEF5FA' },
  { key: 'spa', icon: 'spa-outline', bg: '#00897B', iconColor: '#E0F7F4' },
];

const mergeBeautyInfo = (place: Place): Place => {
  const seed = beautyInfoSeed[place.id];
  if (!seed) return place;
  return { ...place, beautyInfo: seed };
};

const formatOfferDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getOfferMeta = (offer: BeautyOffer, text: ScreenText) => {
  const parts: string[] = [];
  if (offer.validUntil) parts.push(`${text.validUntil} ${formatOfferDate(offer.validUntil)}`);
  if (offer.discountPercent != null) parts.push(`-${offer.discountPercent}%`);
  if (offer.price === 0) parts.push(text.free);
  return parts.join(' · ');
};

const getPriceLabel = (place: Place, text: ScreenText) => {
  const price = place.beautyInfo?.priceFrom;
  if (!price) return text.priceUnknown;
  const period = place.beautyInfo?.pricePeriod ? text.periods[place.beautyInfo.pricePeriod] : text.periods.service;
  return `${text.priceFrom} ${price} ${text.currency}/${period}`;
};

const getFeatureBadges = (place: Place, text: ScreenText) => {
  const features = new Set(place.beautyInfo?.features ?? []);
  const badges: { key: string; label: string }[] = FEATURE_PRIORITY
    .filter((feature) => features.has(feature))
    .map((feature) => ({ key: feature, label: text.features[feature] }));
  if (place.beautyInfo?.hasAvailableSlots) badges.unshift({ key: 'slots', label: text.hasSlots });
  return badges.slice(0, 4);
};

const getCategoryIcon = (category: BeautyCategory): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
  const map: Record<BeautyCategory, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    hair: 'content-cut',
    nails: 'hand-back-right-outline',
    cosmetology: 'face-woman-shimmer',
    massage: 'hand-heart-outline',
    barbershop: 'face-man-outline',
    spa: 'spa-outline',
  };
  return map[category];
};

export default function SalonyKrasotyScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const user = useSelector((state: RootState) => state.auth.user);
  const currentUserEmail = user?.email;
  const currentUserId = user?.id;
  const isAdmin = currentUserEmail === 'vikramsave@ukr.net';
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [claimPlaceIds, setClaimPlaceIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [activePromotions, setActivePromotions] = useState<BonusPromotion[]>([]);
  const [biznesPlusIds, setBiznesPlusIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const resultsAnchorY = useRef(0);
  const { showSuccess } = useSoftToast();
  const [showAllPlaces, setShowAllPlaces] = useState(false);

  // --- Add-place form state ---
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const hasFormUploadingPhotos = formPhotos.some((p) => p.status === 'uploading');
  const hasFormPhotoErrors = formPhotos.some((p) => p.status === 'error');

  useEffect(() => {
    return subscribeActiveBonusPromotions('beauty', setActivePromotions);
  }, []);

  useEffect(() => {
    return subscribeBiznesPlusPlaces('beauty', setBiznesPlusIds);
  }, []);

  useEffect(() => {
    void getFavorites(FAVORITE_SOURCE).then((items) => {
      setFavoriteIds(new Set(items.map((item) => item.id)));
    });
  }, []);

  const handleToggleFavorite = async (placeId: string) => {
    const added = await toggleFavorite(placeId, FAVORITE_SOURCE);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (added) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
    showSuccess(added ? text.favoriteAdded : text.favoriteRemoved);
  };

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

  const beautyPlaces = useMemo(() => (
    chaykaPlaces
      .map((raw) => {
        const place = mergeBeautyInfo(raw);
        const category = place.beautyInfo?.category ?? null;
        return { place, category };
      })
      .filter((item): item is { place: Place; category: BeautyCategory } => Boolean(item.category))
  ), []);

  const categoryCounts = useMemo(() => {
    const counts = CATEGORIES.reduce<Record<CategoryKey, number>>((acc, item) => {
      acc[item.key] = 0;
      return acc;
    }, {} as Record<CategoryKey, number>);
    counts.all = beautyPlaces.length;
    beautyPlaces.forEach(({ category }) => {
      counts[category] += 1;
    });
    return counts;
  }, [beautyPlaces]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const promotedSalonIds = new Map(
      activePromotions
        .filter((promotion) => promotion.targetType === 'beauty_salon')
        .map((promotion, index) => [promotion.targetId, index]),
    );
    return beautyPlaces
      .filter(({ place, category }) => {
        if (activeCategory !== 'all' && category !== activeCategory) return false;
        if (!normalizedQuery) return true;
        return `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aPlus = biznesPlusIds.indexOf(a.place.id);
        const bPlus = biznesPlusIds.indexOf(b.place.id);
        if (aPlus !== -1 || bPlus !== -1) {
          if (aPlus === -1) return 1;
          if (bPlus === -1) return -1;
          return aPlus - bPlus;
        }
        const aPromoted = promotedSalonIds.get(a.place.id);
        const bPromoted = promotedSalonIds.get(b.place.id);
        if (aPromoted !== undefined || bPromoted !== undefined) {
          if (aPromoted === undefined) return 1;
          if (bPromoted === undefined) return -1;
          return aPromoted - bPromoted;
        }
        return 0;
      });
  }, [activeCategory, activePromotions, biznesPlusIds, beautyPlaces, query]);

  const activeOffers = useMemo(() => {
    const promotedOfferIds = new Map(
      activePromotions
        .filter((promotion) => promotion.targetType === 'beauty_promo')
        .map((promotion, index) => [promotion.targetId, index]),
    );
    return [...getActiveBeautyOffers()].sort((a, b) => {
      const aPromoted = promotedOfferIds.get(a.id);
      const bPromoted = promotedOfferIds.get(b.id);
      if (aPromoted !== undefined || bPromoted !== undefined) {
        if (aPromoted === undefined) return 1;
        if (bPromoted === undefined) return -1;
        return aPromoted - bPromoted;
      }
      return 0;
    });
  }, [activePromotions]);

  const openPlace = (place: Place) => {
    navigation.navigate('DetalSalonaScreen', { place });
  };

  const openOffer = (offer: BeautyOffer) => {
    navigation.navigate('DetalPredlozheniyaSalonaScreen', { offer });
  };

  const resetAddForm = useCallback(() => {
    setFormTitle('');
    setFormDescription('');
    setFormPhotos([]);
  }, []);

  const openBusinessForm = useCallback(() => {
    if (!validateSubmissionRequirements({ language, userId: user?.id, navigation })) return;
    setAddFormVisible(true);
  }, [language, navigation, user?.id]);

  const handleSubmitPlace = useCallback(async () => {
    if (!validateSubmissionRequirements({ language, userId: user?.id, navigation })) return;
    const trimmedTitle = formTitle.trim();
    const trimmedDescription = formDescription.trim();
    if (!trimmedTitle || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.formFillError);
      return;
    }
    const langError = getLanguageValidationError(`${trimmedTitle} ${trimmedDescription}`, language);
    if (langError) {
      Alert.alert(text.errorTitle, langError);
      return;
    }
    if (hasFormUploadingPhotos) {
      Alert.alert(text.errorTitle, text.formPhotoUploading);
      return;
    }
    if (hasFormPhotoErrors) {
      Alert.alert(text.errorTitle, text.formPhotoError);
      return;
    }
    const donePhotos = getDonePhotos(formPhotos);
    if (donePhotos.length === 0) {
      Alert.alert(text.errorTitle, text.formPhotoRequired);
      return;
    }

    setFormSubmitting(true);
    try {
      const firstPhoto = donePhotos[0];
      const createdAt = new Date().toISOString();
      await beautyTopService.add({
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
      Alert.alert(text.formSuccessTitle, text.formSuccessMsg, [
        { text: text.ok, onPress: () => { resetAddForm(); setAddFormVisible(false); } },
      ]);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setFormSubmitting(false);
    }
  }, [
    hasFormPhotoErrors,
    hasFormUploadingPhotos,
    language,
    navigation,
    resetAddForm,
    text.errorTitle,
    text.ok,
    text.formFillError,
    text.formPhotoError,
    text.formPhotoRequired,
    text.formPhotoUploading,
    text.formSuccessMsg,
    text.formSuccessTitle,
    formDescription,
    formPhotos,
    formTitle,
    user?.id,
  ]);

  const handleCategoryPress = (category: CategoryKey) => {
    setActiveCategory(category);
    setShowAllPlaces(false);
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(resultsAnchorY.current - 10, 0),
        animated: true,
      });
    }, 80);
  };

  const renderOfferCard = (offer: BeautyOffer, wide = false) => {
    const offerPlace = chaykaPlaces.find((p) => p.id === offer.placeId);
    const offerMeta = getOfferMeta(offer, text);
    return (
      <TouchableOpacity
        key={offer.id}
        style={[styles.offerCard, wide && styles.offerCardWide]}
        activeOpacity={0.88}
        onPress={() => openOffer(offer)}
      >
        <Image
          source={OFFER_PLACEHOLDER}
          style={[styles.offerImage, wide && styles.offerImageWide]}
          resizeMode="cover"
        />
        <View style={styles.offerCardBody}>
          <View style={styles.offerBadge}>
            <Text style={styles.offerBadgeText}>{text.offerTypes[offer.type]}</Text>
          </View>
          {offerPlace ? <Text style={styles.offerPlaceName} numberOfLines={1}>{offerPlace.name}</Text> : null}
          <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
          <Text style={styles.offerShortText} numberOfLines={wide ? 3 : 2}>{offer.shortText}</Text>
          {offerMeta ? <Text style={styles.offerMeta} numberOfLines={1}>{offerMeta}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlaceCard = ({ place, category }: { place: Place; category: BeautyCategory }) => {
    const featureBadges = getFeatureBadges(place, text);
    const hasClaim = isAdmin && claimPlaceIds.has(place.id);
    return (
      <TouchableOpacity key={place.id} style={[styles.placeCard, hasClaim && styles.placeCardClaimed]} activeOpacity={0.88} onPress={() => openPlace(place)}>
        <View style={styles.placeHeader}>
          <View style={styles.placeIconWrap}>
            <MaterialCommunityIcons
              name={getCategoryIcon(category)}
              size={24}
              color={SCREEN_THEME.enamelBlueDark}
            />
          </View>
          <View style={styles.placeTitleBlock}>
            <Text style={styles.placeTitle} numberOfLines={2}>{place.name}</Text>
            <Text style={styles.placeMeta} numberOfLines={1}>{text.categoryLabel[category]} · {getPriceLabel(place, text)}</Text>
          </View>
        </View>

        {featureBadges.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureBadges.map((badge) => (
              <View key={badge.key} style={styles.badge}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => openPlace(place)} activeOpacity={0.85}>
            <Text style={styles.primaryActionText}>{text.details}</Text>
          </TouchableOpacity>
        </View>
        <UserCardActionBar
          showAvatar={false}
          showProfile={false}
          showContact={false}
          showLikeAvatars
          likePath="feed_likes/salony"
          likeId={place.id}
          currentUserId={currentUserId ?? undefined}
          language={language}
          shareMessage={`${place.name}\n\nЧайка — Салони краси`}
          isFav={favoriteIds.has(place.id)}
          onToggleFavorite={() => { void handleToggleFavorite(place.id); }}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

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

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{text.actualTitle}</Text>
        </View>
        {activeOffers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offersRow}>
            {activeOffers.map((offer) => renderOfferCard(offer))}
          </ScrollView>
        ) : (
          <TouchableOpacity style={styles.addPlaceButton} activeOpacity={0.88} onPress={openBusinessForm}>
            <MaterialCommunityIcons name="store-plus" size={16} color="#FFFFFF" />
            <Text style={styles.addPlaceBtnText}>{text.addPlace}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{text.categoriesTitle}</Text>
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => {
            const isActive = activeCategory === category.key;
            return (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.categoryTile,
                  { backgroundColor: category.bg },
                  isActive && styles.categoryTileActive,
                ]}
                onPress={() => handleCategoryPress(category.key)}
                activeOpacity={0.82}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View pointerEvents="none" style={styles.categoryTileIconWrap}>
                  <MaterialCommunityIcons
                    name={category.icon}
                    size={24}
                    color={category.iconColor}
                  />
                </View>
                <Text style={styles.categoryTileText} numberOfLines={1}>{text.categories[category.key]}</Text>
                <View pointerEvents="none" style={styles.categoryTileCountBadge}>
                  <Text style={styles.categoryTileCount}>{categoryCounts[category.key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={styles.resultsBlock}
          onLayout={(event) => {
            resultsAnchorY.current = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{text.allPlacesTitle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Text style={styles.resultCount}>{filteredPlaces.length}</Text>
              <TouchableOpacity style={styles.addPlaceButton} activeOpacity={0.88} onPress={openBusinessForm}>
                <MaterialCommunityIcons name="store-plus" size={14} color="#FFFFFF" />
                <Text style={styles.addPlaceBtnText}>{text.addPlace}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <>
            <FlatList
              scrollEnabled={false}
              data={showAllPlaces ? filteredPlaces : filteredPlaces.slice(0, 4)}
              keyExtractor={(item) => item.place.id}
              renderItem={({ item }) => renderPlaceCard(item)}
              contentContainerStyle={filteredPlaces.length > 0 ? styles.cardList : undefined}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
                  <Text style={styles.emptyText}>{text.noResults}</Text>
                </View>
              }
            />
            {!showAllPlaces && filteredPlaces.length > 4 ? (
              <TouchableOpacity
                style={styles.showMoreButton}
                activeOpacity={0.82}
                onPress={() => setShowAllPlaces(true)}
              >
                <Text style={styles.showMoreText}>{text.showMore}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </>
        </View>
      </ScrollView>

      <Modal visible={addFormVisible} transparent animationType="slide" onRequestClose={() => setAddFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAddFormVisible(false)} />
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{text.addPlaceFormTitle}</Text>
                <TouchableOpacity onPress={() => setAddFormVisible(false)} style={styles.sheetCloseBtn} activeOpacity={0.75}>
                  <MaterialCommunityIcons name="close" size={18} color={SCREEN_THEME.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.sheetContent}
                style={styles.sheetScroll}
              >
                <Text style={styles.formLabel}>{text.formNameLabel}</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder={text.formNamePlaceholder}
                  placeholderTextColor="#A0938D"
                  style={styles.input}
                  maxLength={70}
                />

                <Text style={styles.formLabel}>{text.formDescriptionLabel}</Text>
                <TextInput
                  value={formDescription}
                  onChangeText={setFormDescription}
                  placeholder={text.formDescriptionPlaceholder}
                  placeholderTextColor="#A0938D"
                  style={[styles.input, styles.textarea]}
                  multiline
                  maxLength={220}
                />

                {user?.id ? (
                  <>
                    <Text style={styles.formLabel}>{text.formPhotoLabel}</Text>
                    <PhotoUploadField
                      uid={user.id}
                      userName={user.name || user.email || user.id}
                      maxPhotos={1}
                      storagePath="beauty_top_listings"
                      onPhotosChange={setFormPhotos}
                      metadata={{ sourceScreen: 'Salony-Krasoty', sourceScreenLabel: text.addPlaceFormTitle }}
                    />
                    <UploadedPhotosGrid />
                  </>
                ) : null}

                <TouchableOpacity
                  style={[styles.submitBtn, (formSubmitting || hasFormUploadingPhotos) && styles.submitBtnDisabled]}
                  onPress={handleSubmitPlace}
                  activeOpacity={0.86}
                  disabled={formSubmitting || hasFormUploadingPhotos}
                >
                  {formSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>{hasFormUploadingPhotos ? text.formPhotoUploading : text.formSubmit}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginRight: 8,
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
  actualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7E3',
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  actualIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4668E',
    marginRight: 12,
  },
  actualTextBlock: {
    flex: 1,
  },
  actualTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  actualText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },
  actualCta: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#D4668E',
    marginLeft: 8,
  },
  actualCtaText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
    marginBottom: 6,
  },
  categoryTile: {
    flex: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 1, height: 4 },
    elevation: 5,
  },
  categoryTileActive: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shadowOpacity: 0.36,
    shadowRadius: 10,
    elevation: 8,
  },
  categoryTileIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 12,
  },
  categoryTileText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  categoryTileCountBadge: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  categoryTileCount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultsBlock: {
    marginTop: 2,
  },
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
    alignItems: 'center',
  },
  placeIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8EEF3',
    marginRight: 12,
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
  placeMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: SCREEN_THEME.accentCream,
  },
  badgeText: {
    fontSize: 11,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
    alignItems: 'center',
    gap: 8,
  },
  primaryAction: {
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    flex: 1,
    alignItems: 'center',
  },
  shareAction: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  routeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.accentCream,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  routeActionText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontWeight: '800',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  emptyText: {
    marginTop: 10,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
  },
  offersRow: {
    paddingBottom: 16,
    gap: 10,
  },
  offerCard: {
    width: 220,
    backgroundColor: '#FFF7E3',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  offerCardWide: {
    width: '100%',
  },
  offerImage: {
    width: '100%',
    height: 110,
  },
  offerImageWide: {
    height: 160,
  },
  offerCardBody: {
    padding: 12,
  },
  offerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#D4668E',
    marginBottom: 6,
  },
  offerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
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
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: SCREEN_THEME.textSecondary,
  },
  offerPlaceName: {
    marginBottom: 3,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
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
    color: SCREEN_THEME.textSecondary,
  },
  addPlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  addPlaceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  // --- Add-place form sheet styles ---
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  sheetScroll: { flexGrow: 0 },
  sheetHandle: { width: 42, height: 5, borderRadius: 999, backgroundColor: '#D9C69E', alignSelf: 'center', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '900' as const, color: SCREEN_THEME.textPrimary },
  sheetCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: SCREEN_THEME.accentCream },
  sheetContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  formLabel: { fontWeight: '800' as const, color: SCREEN_THEME.textPrimary, marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#F7F3EE', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E8DDD3', fontWeight: '700' as const },
  textarea: { minHeight: 86, textAlignVertical: 'top' as const },
  submitBtn: { backgroundColor: '#E07B39', borderRadius: 16, paddingVertical: 14, alignItems: 'center' as const, marginTop: 14 },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '900' as const },
});
