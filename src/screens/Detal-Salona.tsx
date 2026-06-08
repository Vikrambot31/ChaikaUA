import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { ref, get, set, getDatabase } from 'firebase/database';
import { BeautyCategory, BeautyFeature, BeautyOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { safeCallPhone, safeOpenExternalUrl } from '../utils/communicationActions';
import { getActiveBeautyOffers } from '../services/beautySeed';
import { database } from '../firebase-core';
import {
  selectIsBusinessPlus,
  hydrateSubscription,
  normalizeServerSubscription,
} from '../redux/slices/subscriptionSlice';
import { getMapFocusPlaceParams } from '../utils/mapFocusParams';
import type { DetailItemData } from '../utils/detailViewTypes';

type Lang = 'ua' | 'ru' | 'en';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type RouteParams = RouteProp<{ DetalSalona: { place: Place } }, 'DetalSalona'>;
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    back: 'Назад',
    call: 'Подзвонити',
    telegram: 'Telegram',
    instagram: 'Instagram',
    route: 'Маршрут',
    mainInfoTitle: 'Про салон',
    servicesTitle: 'Послуги',
    descriptionTitle: 'Опис',
    offersTitle: 'Актуальні пропозиції',
    readMore: 'Читати повністю',
    readLess: 'Згорнути',
    showMore: 'Показати більше',
    hide: 'Сховати',
    businessSectionTitle: 'Для власників бізнесу',
    price: 'Ціна від',
    schedule: 'Графік',
    slots: 'Вільні вікна',
    slotsYes: 'є вільні вікна',
    slotsNo: 'вікон немає',
    master: 'Майстер',
    priceFrom: 'від',
    currency: 'грн',
    priceUnknown: 'уточнюйте',
    infoUnknown: 'уточнюйте',
    descriptionEmpty: 'Детальна інформація поки не заповнена. Можна скористатися маршрутом або контактами.',
    categoryLabel: {
      hair: 'Перукарня',
      nails: 'Нігті',
      cosmetology: 'Косметологія',
      massage: 'Масаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'Виїзд додому',
      online_booking: 'Онлайн запис',
      kids_friendly: 'Дитячі стрижки',
      women: 'Жіночі послуги',
      men: 'Чоловічі послуги',
      parking: 'Парковка',
      certificate: 'Сертифікати',
      discount_first: 'Знижка на перший візит',
    } as Record<BeautyFeature, string>,
    periods: { service: 'послуга', hour: 'год', session: 'сеанс' },
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      new_master: 'Новий майстер',
      discount: 'Знижка',
      available_slots: 'Є вікна',
    },
  },
  ru: {
    back: 'Назад',
    call: 'Позвонить',
    telegram: 'Telegram',
    instagram: 'Instagram',
    route: 'Маршрут',
    mainInfoTitle: 'О салоне',
    servicesTitle: 'Услуги',
    descriptionTitle: 'Описание',
    offersTitle: 'Актуальные предложения',
    readMore: 'Читать полностью',
    readLess: 'Свернуть',
    showMore: 'Показать больше',
    hide: 'Скрыть',
    businessSectionTitle: 'Для владельцев бизнеса',
    price: 'Цена от',
    schedule: 'График',
    slots: 'Свободные окна',
    slotsYes: 'есть свободные окна',
    slotsNo: 'окон нет',
    master: 'Мастер',
    priceFrom: 'от',
    currency: 'грн',
    priceUnknown: 'уточняйте',
    infoUnknown: 'уточняйте',
    descriptionEmpty: 'Подробная информация пока не заполнена. Можно воспользоваться маршрутом или контактами.',
    categoryLabel: {
      hair: 'Парикмахерская',
      nails: 'Ногти',
      cosmetology: 'Косметология',
      massage: 'Массаж',
      barbershop: 'Барбершоп',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'Выезд на дом',
      online_booking: 'Онлайн запись',
      kids_friendly: 'Детские стрижки',
      women: 'Женские услуги',
      men: 'Мужские услуги',
      parking: 'Парковка',
      certificate: 'Сертификаты',
      discount_first: 'Скидка на первый визит',
    } as Record<BeautyFeature, string>,
    periods: { service: 'услуга', hour: 'час', session: 'сеанс' },
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      new_master: 'Новый мастер',
      discount: 'Скидка',
      available_slots: 'Есть окна',
    },
  },
  en: {
    back: 'Back',
    call: 'Call',
    telegram: 'Telegram',
    instagram: 'Instagram',
    route: 'Route',
    mainInfoTitle: 'About salon',
    servicesTitle: 'Services',
    descriptionTitle: 'Description',
    offersTitle: 'Current offers',
    readMore: 'Read more',
    readLess: 'Collapse',
    showMore: 'Show more',
    hide: 'Hide',
    businessSectionTitle: 'For business owners',
    price: 'Price from',
    schedule: 'Schedule',
    slots: 'Availability',
    slotsYes: 'slots available',
    slotsNo: 'no slots',
    master: 'Master',
    priceFrom: 'from',
    currency: 'UAH',
    priceUnknown: 'ask',
    infoUnknown: 'ask',
    descriptionEmpty: 'Detailed information has not been filled in yet. You can use route or contacts if available.',
    categoryLabel: {
      hair: 'Hair salon',
      nails: 'Nails',
      cosmetology: 'Cosmetology',
      massage: 'Massage',
      barbershop: 'Barbershop',
      spa: 'SPA',
    } as Record<BeautyCategory, string>,
    features: {
      home_visit: 'Home visit',
      online_booking: 'Online booking',
      kids_friendly: 'Kids friendly',
      women: 'Women',
      men: 'Men',
      parking: 'Parking',
      certificate: 'Gift cards',
      discount_first: 'First visit discount',
    } as Record<BeautyFeature, string>,
    periods: { service: 'service', hour: 'hr', session: 'session' },
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      new_master: 'New master',
      discount: 'Discount',
      available_slots: 'Slots available',
    },
  },
} as const;

const FEATURE_PRIORITY: BeautyFeature[] = [
  'home_visit', 'online_booking', 'kids_friendly', 'women', 'men',
  'parking', 'certificate', 'discount_first',
];

const FEATURE_ICON: Record<BeautyFeature, IconName> = {
  home_visit: 'home-outline',
  online_booking: 'calendar-check-outline',
  kids_friendly: 'baby-face-outline',
  women: 'face-woman-outline',
  men: 'face-man-outline',
  parking: 'parking',
  certificate: 'gift-outline',
  discount_first: 'percent-outline',
};

const CATEGORY_ICON: Record<BeautyCategory, IconName> = {
  hair: 'content-cut',
  nails: 'hand-back-right-outline',
  cosmetology: 'face-woman-shimmer',
  massage: 'hand-heart-outline',
  barbershop: 'face-man-outline',
  spa: 'spa-outline',
};

function formatOfferDate(timestamp?: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DetalSalonaScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteParams>();
  const place: Place = route.params.place;
  const info = place.beautyInfo;
  const category: BeautyCategory = info?.category ?? 'hair';

  const dispatch = useDispatch();
  const language = useSelector((s: RootState) => s.language?.current ?? 'ua') as Lang;
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const isBusinessPlus = useSelector(selectIsBusinessPlus);
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showBusinessSection, setShowBusinessSection] = useState(false);
  const [claimStatus, setClaimStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [businessCard, setBusinessCard] = useState<{ ownerId?: string } | null>(null);

  const isAuthenticated = Boolean(currentUser?.id);
  const isAdmin = currentUser?.email === 'vikramsave@ukr.net';
  const isMyApprovedPlace = claimStatus === 'approved' && businessCard?.ownerId === currentUser?.id;

  // Sync subscription from RTDB on screen open
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { firebaseApp } = require('../firebase-core') as typeof import('../firebase-core');
        const db = getDatabase(firebaseApp);
        const snap = await get(ref(db, `user_subscription/${currentUser.id}`));
        if (cancelled) return;
        const normalized = normalizeServerSubscription(snap.val() as Record<string, unknown> | null);
        dispatch(hydrateSubscription(normalized));
      } catch { /* realtime listener in App.tsx is primary */ }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, dispatch]);

  // Load business claim status
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const claimRef = ref(database, `business_plus_claims/${place.id}`);
        const snap = await get(claimRef);
        if (cancelled) return;
        if (!snap.exists()) { setClaimStatus('none'); return; }
        const data = snap.val() as { ownerUid?: string; status?: string };
        if (currentUser.email === 'vikramsave@ukr.net') {
          setClaimStatus((data.status as 'pending' | 'approved' | 'rejected') ?? 'none');
        } else if (data.ownerUid === currentUser.id) {
          setClaimStatus((data.status as 'pending' | 'approved' | 'rejected') ?? 'none');
        } else {
          setClaimStatus('approved');
        }
      } catch { if (!cancelled) setClaimStatus('none'); }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, place.id, currentUser?.id]);

  // Load business+ card (to check ownerId)
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const cardRef = ref(database, `business_plus_cards/${place.id}`);
        const snap = await get(cardRef);
        if (cancelled) return;
        if (snap.exists()) setBusinessCard(snap.val() as { ownerId?: string });
      } catch { /* optional content */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, place.id]);

  const offers = useMemo(() => getActiveBeautyOffers(place.id), [place.id]);

  const priceLabel = useMemo(() => {
    if (!info?.priceFrom) return text.priceUnknown;
    const period = info.pricePeriod ? text.periods[info.pricePeriod] : text.periods.service;
    return `${text.priceFrom} ${info.priceFrom} ${text.currency}/${period}`;
  }, [info, text]);

  const featureItems = useMemo(() => {
    const features = new Set(info?.features ?? []);
    return FEATURE_PRIORITY
      .filter((f) => features.has(f))
      .map((f) => ({ key: f, label: text.features[f], icon: FEATURE_ICON[f] }));
  }, [info, text]);

  const claimLabel = language === 'ua' ? 'Я власник цього закладу' : language === 'ru' ? 'Я владелец этого заведения' : 'I am the owner';
  const claimPendingLabel = language === 'ua' ? 'Заявку надіслано — на розгляді' : language === 'ru' ? 'Заявка отправлена — на рассмотрении' : 'Claim submitted — pending review';
  const claimApprovedLabel = language === 'ua' ? 'Підтверджений власник' : language === 'ru' ? 'Подтверждённый владелец' : 'Verified owner';
  const claimRejectedLabel = language === 'ua' ? 'Заявку відхилено — подати нову' : language === 'ru' ? 'Заявка отклонена — подать новую' : 'Claim rejected — resubmit';
  const activateBusinessPlusLabel = language === 'ua' ? 'Активувати Бізнес+ (49 грн/міс)' : language === 'ru' ? 'Активировать Бизнес+ (49 грн/мес)' : 'Activate Business+ (49 UAH/mo)';

  const claimItem: DetailItemData = {
    id: place.id,
    title: place.name,
    address: place.address,
    phone: place.phone,
    sourceType: 'place',
    sourceId: place.id,
  };

  const handleCall = () => safeCallPhone(place.phone, language);
  const handleTelegram = () => {
    const tg = info?.telegram;
    if (tg) void safeOpenExternalUrl(tg.startsWith('http') ? tg : `https://t.me/${tg}`, language);
  };
  const handleInstagram = () => {
    const ig = info?.instagram;
    if (ig) void safeOpenExternalUrl(ig.startsWith('http') ? ig : `https://instagram.com/${ig}`, language);
  };
  const handleRoute = () => {
    navigation.navigate('MainTabs', {
      screen: 'MapTab',
      params: getMapFocusPlaceParams(place),
    });
  };

  const handleAdminApprove = () => {
    void (async () => {
      try {
        const now = new Date().toISOString();
        await set(ref(database, `business_plus_claims/${place.id}/status`), 'approved');
        await set(ref(database, `business_plus_claims/${place.id}/moderatedAt`), now);
        setClaimStatus('approved');
      } catch {
        Alert.alert('Помилка', 'Не вдалося схвалити заявку. Спробуйте ще раз.');
      }
    })();
  };

  const handleAdminReject = () => {
    Alert.alert('Відхилити заявку?', '', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Відхилити',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const now = new Date().toISOString();
              await set(ref(database, `business_plus_claims/${place.id}/status`), 'rejected');
              await set(ref(database, `business_plus_claims/${place.id}/moderatedAt`), now);
              setClaimStatus('rejected');
            } catch {
              Alert.alert('Помилка', 'Не вдалося відхилити заявку. Спробуйте ще раз.');
            }
          })();
        },
      },
    ]);
  };

  const renderInfoRow = (label: string, value: string) => (
    <View style={styles.infoRow} key={label}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  const openOffer = (offer: BeautyOffer) => {
    navigation.navigate('DetalPredlozheniyaSalonaScreen', { offer });
  };

  const renderOfferCard = (offer: BeautyOffer) => {
    const dateLabel = offer.validUntil ? `до ${formatOfferDate(offer.validUntil)}` : '';
    return (
      <TouchableOpacity style={styles.offerCard} key={offer.id} activeOpacity={0.88} onPress={() => openOffer(offer)}>
        <View style={styles.offerBadge}>
          <Text style={styles.offerBadgeText}>{text.offerTypes[offer.type]}</Text>
        </View>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerShortText}>{offer.shortText}</Text>
        {dateLabel ? <Text style={styles.offerDate}>{dateLabel}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name={CATEGORY_ICON[category]} size={28} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} numberOfLines={2}>{place.name}</Text>
            <Text style={styles.heroCategory}>{text.categoryLabel[category]}</Text>
          </View>
        </View>

        {/* Address */}
        <View style={styles.addressRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={SCREEN_THEME.textMuted} />
          <Text style={styles.addressText}>{place.address}</Text>
        </View>

        {/* Feature badges */}
        {featureItems.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureItems.map((item) => (
              <View key={item.key} style={styles.badge}>
                <Text style={styles.badgeText}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {place.phone ? (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall} activeOpacity={0.85}>
              <MaterialCommunityIcons name="phone-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>{text.call}</Text>
            </TouchableOpacity>
          ) : null}
          {info?.telegram ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleTelegram} activeOpacity={0.85}>
              <MaterialCommunityIcons name="send" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.telegram}</Text>
            </TouchableOpacity>
          ) : null}
          {info?.instagram ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleInstagram} activeOpacity={0.85}>
              <MaterialCommunityIcons name="instagram" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.instagram}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleRoute} activeOpacity={0.85}>
            <MaterialCommunityIcons name="map-marker-path" size={18} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.route}</Text>
          </TouchableOpacity>
        </View>

        {/* Main info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.mainInfoTitle}</Text>
          <View style={styles.infoBlock}>
            {renderInfoRow(text.price, priceLabel)}
            {renderInfoRow(text.schedule, info?.workingHours ?? text.infoUnknown)}
            {info?.masterName ? renderInfoRow(text.master, info.masterName) : null}
            {renderInfoRow(text.slots, info?.hasAvailableSlots == null ? text.infoUnknown : info.hasAvailableSlots ? text.slotsYes : text.slotsNo)}
          </View>
        </View>

        {/* Services / features */}
        {featureItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.servicesTitle}</Text>
            <View style={styles.checkGrid}>
              {featureItems.map((item) => (
                <View style={styles.checkItem} key={item.key}>
                  <MaterialCommunityIcons name={item.icon} size={20} color={SCREEN_THEME.enamelBlue} />
                  <Text style={styles.checkLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.descriptionTitle}</Text>
          <Text style={styles.descriptionText}>
            {isDescriptionExpanded && info?.fullDescription ? info.fullDescription : info?.shortDescription ?? text.descriptionEmpty}
          </Text>
          {info?.fullDescription ? (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setIsDescriptionExpanded((c) => !c)}>
              <Text style={styles.readMore}>{isDescriptionExpanded ? text.readLess : text.readMore}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Offers for this place */}
        {offers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.offersTitle}</Text>
            <View style={styles.offersList}>
              {offers.map(renderOfferCard)}
            </View>
          </View>
        ) : null}

        {/* Admin moderation panel — only for vikramsave@ukr.net */}
        {isAdmin && claimStatus !== 'none' ? (
          <View style={styles.adminSection}>
            <View style={styles.adminSectionHeader}>
              <MaterialCommunityIcons name="shield-account-outline" size={15} color="#8A7A5A" />
              <Text style={styles.adminSectionTitle}>МОДЕРАЦІЯ</Text>
            </View>
            <View style={[styles.claimStatusCard, claimStatus === 'approved' && styles.claimStatusApproved]}>
              <MaterialCommunityIcons
                name={claimStatus === 'pending' ? 'clock-outline' : claimStatus === 'approved' ? 'check-circle-outline' : 'close-circle-outline'}
                size={15}
                color={claimStatus === 'approved' ? '#2E7D32' : '#8A7A5A'}
              />
              <Text style={[styles.claimStatusText, claimStatus === 'approved' && styles.claimStatusApprovedText]}>
                {claimStatus === 'pending' ? 'На розгляді' : claimStatus === 'approved' ? 'Схвалено' : 'Відхилено'}
              </Text>
            </View>
            <View style={styles.adminActions}>
              {claimStatus !== 'approved' ? (
                <TouchableOpacity style={styles.adminApproveBtn} onPress={handleAdminApprove} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="check-circle-outline" size={15} color="#fff" />
                  <Text style={styles.adminBtnText}>Схвалити</Text>
                </TouchableOpacity>
              ) : null}
              {claimStatus !== 'rejected' ? (
                <TouchableOpacity style={styles.adminRejectBtn} onPress={handleAdminReject} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="close-circle-outline" size={15} color="#fff" />
                  <Text style={styles.adminBtnText}>Відхилити</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Business ownership claim section */}
        {showBusinessSection ? (
          <View style={styles.businessSectionContainer}>
            <View style={styles.businessSectionHeader}>
              <MaterialCommunityIcons name="briefcase-outline" size={18} color={SCREEN_THEME.textSecondary} />
              <Text style={styles.businessSectionTitle}>{text.businessSectionTitle}</Text>
            </View>
            {claimStatus === 'none' || claimStatus === 'rejected' ? (
              <TouchableOpacity
                style={styles.claimBtn}
                onPress={() => navigation.navigate('BusinessClaimScreen', { item: claimItem })}
                activeOpacity={0.86}
              >
                <MaterialCommunityIcons name="store-plus-outline" size={18} color={SCREEN_THEME.terracotta} />
                <Text style={styles.claimBtnText}>
                  {claimStatus === 'rejected' ? claimRejectedLabel : claimLabel}
                </Text>
              </TouchableOpacity>
            ) : claimStatus === 'pending' ? (
              <View style={styles.claimStatusCard}>
                <MaterialCommunityIcons name="clock-outline" size={16} color="#8A7A5A" />
                <Text style={styles.claimStatusText}>{claimPendingLabel}</Text>
              </View>
            ) : isMyApprovedPlace ? (
              <View style={{ gap: 8 }}>
                <View style={[styles.claimStatusCard, styles.claimStatusApproved]}>
                  <MaterialCommunityIcons name="check-circle-outline" size={16} color="#2E7D32" />
                  <Text style={[styles.claimStatusText, styles.claimStatusApprovedText]}>{claimApprovedLabel}</Text>
                </View>
                {!isBusinessPlus && (
                  <TouchableOpacity
                    style={styles.activateBusinessBtn}
                    onPress={() => navigation.navigate('BusinessPlusSubscriptionScreen')}
                    activeOpacity={0.86}
                  >
                    <MaterialCommunityIcons name="storefront" size={16} color="#fff" />
                    <Text style={styles.activateBusinessBtnText}>{activateBusinessPlusLabel}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            <TouchableOpacity style={styles.hideBtn} onPress={() => setShowBusinessSection(false)}>
              <Text style={styles.hideBtnText}>{text.hide}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowBusinessSection(true)}>
            <MaterialCommunityIcons name="chevron-down-circle-outline" size={18} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={styles.showMoreBtnText}>{text.showMore}</Text>
          </TouchableOpacity>
        )}

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
    paddingBottom: 40,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
    marginRight: 10,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4668E',
    marginRight: 12,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 24,
  },
  heroCategory: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  addressText: {
    flex: 1,
    marginLeft: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: SCREEN_THEME.accentCream,
  },
  badgeText: {
    fontSize: 12,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    gap: 6,
  },
  actionBtnAlt: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff',
  },
  actionBtnTextAlt: {
    color: SCREEN_THEME.enamelBlueDark,
  },
  section: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 12,
  },
  infoBlock: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  checkGrid: {
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },
  readMore: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.enamelBlueDark,
  },
  offersList: {
    gap: 10,
  },
  offerCard: {
    backgroundColor: '#FFF7E3',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
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
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  offerShortText: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 18,
  },
  offerDate: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textMuted,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracotta,
    marginBottom: 12,
  },
  claimBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.terracotta,
  },
  claimStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#D4B95E',
    marginBottom: 12,
  },
  claimStatusApproved: {
    backgroundColor: '#F0FFF4',
    borderColor: '#81C784',
  },
  claimStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A7A5A',
  },
  claimStatusApprovedText: {
    color: '#2E7D32',
  },
  activateBusinessBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7A1E5C',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 12,
  },
  activateBusinessBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 12,
  },
  showMoreBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
  businessSectionContainer: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 8,
  },
  businessSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  businessSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hideBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  hideBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textMuted,
  },
  adminSection: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F9C400',
    marginBottom: 12,
    gap: 8,
  },
  adminSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminSectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8A7A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adminActions: {
    flexDirection: 'row',
    gap: 8,
  },
  adminApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  adminRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C62828',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  adminBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
});
