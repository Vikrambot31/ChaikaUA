import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { BeautyCategory, BeautyFeature, BeautyOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { safeCallPhone, safeOpenExternalUrl } from '../utils/communicationActions';
import { getActiveBeautyOffers } from '../services/beautySeed';

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

  const language = useSelector((s: RootState) => s.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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

  const handleCall = () => safeCallPhone(place.phone, language);
  const handleTelegram = () => {
    const tg = info?.telegram;
    if (tg) void safeOpenExternalUrl(tg.startsWith('http') ? tg : `https://t.me/${tg}`, language);
  };
  const handleInstagram = () => {
    const ig = info?.instagram;
    if (ig) void safeOpenExternalUrl(ig.startsWith('http') ? ig : `https://instagram.com/${ig}`, language);
  };
  const handleRoute = () => openInGoogleMaps(place.name, place.address);

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
});
