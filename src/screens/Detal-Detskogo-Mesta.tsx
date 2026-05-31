import React, { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ChildCategory, ChildFeature, ChildOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import { safeCallPhone, safeOpenExternalUrl } from '../utils/communicationActions';
import { getActiveOffers } from '../services/childrenSeed';

type Lang = 'ua' | 'ru' | 'en';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type RouteParams = RouteProp<{ DetalDetskogoMesta: { place: Place } }, 'DetalDetskogoMesta'>;

const UI_TEXT = {
  ua: {
    back: 'Назад',
    call: 'Подзвонити',
    telegram: 'Telegram',
    website: 'Сайт',
    route: 'Маршрут',
    mainInfoTitle: 'Головне для батьків',
    safetyTitle: 'Безпека',
    medicalTitle: 'Медицина',
    descriptionTitle: 'Про заклад',
    offersTitle: 'Актуальні пропозиції',
    readMore: 'Читати повністю',
    age: 'Вік дітей',
    price: 'Ціна від',
    schedule: 'Графік',
    spots: 'Наявність місць',
    spotsYes: 'є місця',
    spotsNo: 'місць немає',
    priceUnknown: 'уточнюйте',
    ageUnknown: 'уточнюйте',
    categoryLabel: {
      kindergarten: 'Садочок',
      school: 'Школа',
      development: 'Розвиток',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'Подія',
    },
    features: {
      shelter: 'є укриття',
      food: 'харчування',
      english: 'англійська',
      speech_therapist: 'логопед',
      nurse: 'медсестра',
      sport: 'спорт',
      full_day: 'повний день',
      half_day: 'неповний день',
      trial_day: 'пробний день',
    },
    periods: { month: 'міс', lesson: 'заняття', day: 'день', once: 'разово' },
    safety: {
      hasShelter: 'Укриття',
      hasSecurityGuard: 'Охорона',
      hasVideoSurveillance: 'Відеоспостереження',
      hasClosedTerritory: 'Закрита територія',
      hasAccessControl: 'Контроль входу',
      hasFireSafety: 'Пожежна безпека',
    },
    medical: {
      hasNurse: 'Медсестра',
      hasDoctor: 'Лікар',
      hasFirstAid: 'Аптечка / перша допомога',
      hasAllergySupport: 'Робота з алергіями',
      nearbyClinic: 'Найближча клініка',
    },
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      open_day: 'Відкритий день',
      trial_lesson: 'Пробне заняття',
      available_places: 'Є місця',
    },
  },
  ru: {
    back: 'Назад',
    call: 'Позвонить',
    telegram: 'Telegram',
    website: 'Сайт',
    route: 'Маршрут',
    mainInfoTitle: 'Главное для родителей',
    safetyTitle: 'Безопасность',
    medicalTitle: 'Медицина',
    descriptionTitle: 'О заведении',
    offersTitle: 'Актуальные предложения',
    readMore: 'Читать полностью',
    age: 'Возраст детей',
    price: 'Цена от',
    schedule: 'График',
    spots: 'Наличие мест',
    spotsYes: 'есть места',
    spotsNo: 'мест нет',
    priceUnknown: 'уточняйте',
    ageUnknown: 'уточняйте',
    categoryLabel: {
      kindergarten: 'Садик',
      school: 'Школа',
      development: 'Развитие',
      sport: 'Спорт',
      medical: 'Медицина',
      event: 'Событие',
    },
    features: {
      shelter: 'есть укрытие',
      food: 'питание',
      english: 'английский',
      speech_therapist: 'логопед',
      nurse: 'медсестра',
      sport: 'спорт',
      full_day: 'полный день',
      half_day: 'неполный день',
      trial_day: 'пробный день',
    },
    periods: { month: 'мес', lesson: 'занятие', day: 'день', once: 'разово' },
    safety: {
      hasShelter: 'Укрытие',
      hasSecurityGuard: 'Охрана',
      hasVideoSurveillance: 'Видеонаблюдение',
      hasClosedTerritory: 'Закрытая территория',
      hasAccessControl: 'Контроль входа',
      hasFireSafety: 'Пожарная безопасность',
    },
    medical: {
      hasNurse: 'Медсестра',
      hasDoctor: 'Врач',
      hasFirstAid: 'Аптечка / первая помощь',
      hasAllergySupport: 'Работа с аллергиями',
      nearbyClinic: 'Ближайшая клиника',
    },
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      open_day: 'Открытый день',
      trial_lesson: 'Пробное занятие',
      available_places: 'Есть места',
    },
  },
  en: {
    back: 'Back',
    call: 'Call',
    telegram: 'Telegram',
    website: 'Website',
    route: 'Route',
    mainInfoTitle: 'Key info for parents',
    safetyTitle: 'Safety',
    medicalTitle: 'Medical',
    descriptionTitle: 'About',
    offersTitle: 'Current offers',
    readMore: 'Read more',
    age: 'Age range',
    price: 'Price from',
    schedule: 'Schedule',
    spots: 'Availability',
    spotsYes: 'spots available',
    spotsNo: 'no spots',
    priceUnknown: 'ask',
    ageUnknown: 'ask',
    categoryLabel: {
      kindergarten: 'Kindergarten',
      school: 'School',
      development: 'Development',
      sport: 'Sport',
      medical: 'Medical',
      event: 'Event',
    },
    features: {
      shelter: 'shelter',
      food: 'food',
      english: 'English',
      speech_therapist: 'speech therapist',
      nurse: 'nurse',
      sport: 'sport',
      full_day: 'full day',
      half_day: 'half day',
      trial_day: 'trial day',
    },
    periods: { month: 'mo', lesson: 'lesson', day: 'day', once: 'once' },
    safety: {
      hasShelter: 'Shelter',
      hasSecurityGuard: 'Security guard',
      hasVideoSurveillance: 'Video surveillance',
      hasClosedTerritory: 'Enclosed area',
      hasAccessControl: 'Access control',
      hasFireSafety: 'Fire safety',
    },
    medical: {
      hasNurse: 'Nurse',
      hasDoctor: 'Doctor',
      hasFirstAid: 'First aid kit',
      hasAllergySupport: 'Allergy management',
      nearbyClinic: 'Nearby clinic',
    },
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      open_day: 'Open day',
      trial_lesson: 'Trial lesson',
      available_places: 'Spots available',
    },
  },
} as const;

const FEATURE_PRIORITY: ChildFeature[] = [
  'shelter', 'food', 'english', 'speech_therapist', 'nurse',
  'sport', 'full_day', 'half_day', 'trial_day',
];

const CATEGORY_ICON: Record<ChildCategory, IconName> = {
  kindergarten: 'baby-face-outline',
  school: 'school-outline',
  development: 'puzzle-outline',
  sport: 'basketball',
  medical: 'medical-bag',
  event: 'calendar-star',
};

const SAFETY_ICON: Record<string, IconName> = {
  hasShelter: 'shield-home-outline',
  hasSecurityGuard: 'shield-account-outline',
  hasVideoSurveillance: 'cctv',
  hasClosedTerritory: 'gate',
  hasAccessControl: 'card-account-details-outline',
  hasFireSafety: 'fire-extinguisher',
};

const MEDICAL_ICON: Record<string, IconName> = {
  hasNurse: 'account-heart-outline',
  hasDoctor: 'doctor',
  hasFirstAid: 'medical-bag',
  hasAllergySupport: 'flower-pollen-outline',
  nearbyClinic: 'hospital-box-outline',
};

function formatOfferDate(timestamp?: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DetalDetskogoMestaScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const place: Place = route.params.place;
  const info = place.childInfo;
  const category = info?.category ?? 'kindergarten';

  const language = useSelector((s: RootState) => s.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const offers = useMemo(() => getActiveOffers(place.id), [place.id]);

  const ageLabel = useMemo(() => {
    if (info?.ageFrom != null && info?.ageTo != null) return `${info.ageFrom}–${info.ageTo}`;
    if (info?.ageFrom != null) return `${info.ageFrom}+`;
    return text.ageUnknown;
  }, [info, text]);

  const priceLabel = useMemo(() => {
    if (!info?.priceFrom) return text.priceUnknown;
    const period = info.pricePeriod ? text.periods[info.pricePeriod] : text.periods.month;
    return `${info.priceFrom} grn/${period}`;
  }, [info, text]);

  const featureLabels = useMemo(() => {
    const features = new Set(info?.features ?? []);
    if (info?.safety?.hasShelter) features.add('shelter');
    if (info?.medical?.hasNurse) features.add('nurse');
    return FEATURE_PRIORITY.filter((f) => features.has(f)).map((f) => text.features[f]);
  }, [info, text]);

  const safetyItems = useMemo(() => {
    if (!info?.safety) return [];
    const s = info.safety;
    const keys = ['hasShelter', 'hasSecurityGuard', 'hasVideoSurveillance', 'hasClosedTerritory', 'hasAccessControl', 'hasFireSafety'] as const;
    return keys.filter((k) => s[k]).map((k) => ({ key: k, label: text.safety[k], icon: SAFETY_ICON[k] }));
  }, [info, text]);

  const medicalItems = useMemo(() => {
    if (!info?.medical) return [];
    const m = info.medical;
    const items: { key: string; label: string; icon: IconName }[] = [];
    if (m.hasNurse) items.push({ key: 'hasNurse', label: text.medical.hasNurse, icon: MEDICAL_ICON.hasNurse });
    if (m.hasDoctor) items.push({ key: 'hasDoctor', label: text.medical.hasDoctor, icon: MEDICAL_ICON.hasDoctor });
    if (m.hasFirstAid) items.push({ key: 'hasFirstAid', label: text.medical.hasFirstAid, icon: MEDICAL_ICON.hasFirstAid });
    if (m.hasAllergySupport) items.push({ key: 'hasAllergySupport', label: text.medical.hasAllergySupport, icon: MEDICAL_ICON.hasAllergySupport });
    if (m.nearbyClinic) items.push({ key: 'nearbyClinic', label: `${text.medical.nearbyClinic}: ${m.nearbyClinic}`, icon: MEDICAL_ICON.nearbyClinic });
    return items;
  }, [info, text]);

  const handleCall = () => safeCallPhone(place.phone, language);
  const handleTelegram = () => {
    const tg = info?.telegram;
    if (tg) void safeOpenExternalUrl(tg.startsWith('http') ? tg : `https://t.me/${tg}`, language);
  };
  const handleWebsite = () => {
    if (place.website) void safeOpenExternalUrl(place.website, language);
  };
  const handleRoute = () => openInGoogleMaps(place.name, place.address);

  const renderInfoRow = (label: string, value: string) => (
    <View style={styles.infoRow} key={label}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  const renderCheckItem = (item: { key: string; label: string; icon: IconName }, color: string) => (
    <View style={styles.checkItem} key={item.key}>
      <MaterialCommunityIcons name={item.icon} size={20} color={color} />
      <Text style={styles.checkLabel}>{item.label}</Text>
    </View>
  );

  const renderOfferCard = (offer: ChildOffer) => {
    const dateLabel = offer.dateFrom ? formatOfferDate(offer.dateFrom) : (offer.validUntil ? `до ${formatOfferDate(offer.validUntil)}` : '');
    return (
      <View style={styles.offerCard} key={offer.id}>
        <View style={styles.offerBadge}>
          <Text style={styles.offerBadgeText}>{text.offerTypes[offer.type]}</Text>
        </View>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerShortText}>{offer.shortText}</Text>
        {dateLabel ? <Text style={styles.offerDate}>{dateLabel}</Text> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* 10.1 Header */}
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

        {/* Badges */}
        {featureLabels.length > 0 ? (
          <View style={styles.badgeRow}>
            {featureLabels.map((label) => (
              <View key={label} style={styles.badge}>
                <Text style={styles.badgeText}>{label}</Text>
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
          {place.website ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleWebsite} activeOpacity={0.85}>
              <MaterialCommunityIcons name="web" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.website}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleRoute} activeOpacity={0.85}>
            <MaterialCommunityIcons name="map-marker-path" size={18} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.route}</Text>
          </TouchableOpacity>
        </View>

        {/* 10.2 Main info */}
        {info ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.mainInfoTitle}</Text>
            <View style={styles.infoBlock}>
              {renderInfoRow(text.age, ageLabel)}
              {renderInfoRow(text.price, priceLabel)}
              {info.schedule ? renderInfoRow(text.schedule, info.schedule) : null}
              {info.hasAvailablePlaces != null ? renderInfoRow(text.spots, info.hasAvailablePlaces ? text.spotsYes : text.spotsNo) : null}
            </View>
          </View>
        ) : null}

        {/* 10.3 Safety */}
        {safetyItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.safetyTitle}</Text>
            <View style={styles.checkGrid}>
              {safetyItems.map((item) => renderCheckItem(item, SCREEN_THEME.woodGreen))}
            </View>
          </View>
        ) : null}

        {/* 10.4 Medical */}
        {medicalItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.medicalTitle}</Text>
            <View style={styles.checkGrid}>
              {medicalItems.map((item) => renderCheckItem(item, SCREEN_THEME.enamelBlue))}
            </View>
          </View>
        ) : null}

        {/* 10.5 Description */}
        {info?.shortDescription ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{text.descriptionTitle}</Text>
            <Text style={styles.descriptionText}>{info.shortDescription}</Text>
            {info.fullDescription ? (
              <TouchableOpacity activeOpacity={0.8}>
                <Text style={styles.readMore}>{text.readMore}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* 10.6 Offers for this place */}
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

  // Hero
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
    backgroundColor: SCREEN_THEME.enamelBlueDark,
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

  // Address
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

  // Badges
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

  // Actions
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

  // Sections
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

  // Info rows
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

  // Check grid (safety/medical)
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

  // Description
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

  // Offers
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
    backgroundColor: SCREEN_THEME.terracotta,
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
