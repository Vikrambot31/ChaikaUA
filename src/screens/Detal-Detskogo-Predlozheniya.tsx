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
import { ChildOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';
import { safeCallPhone, safeOpenExternalUrl } from '../utils/communicationActions';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { childInfoSeed } from '../services/childrenSeed';
import { openInGoogleMaps } from '../utils/googleMapsLink';
import CommentSection from '../components/CommentSection';
import { COMMENTS_PATH } from '../services/commentService';
import ContentComplaintModal from '../components/ContentComplaintModal';

type Lang = 'ua' | 'ru' | 'en';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type AppNavigation = NavigationProp<Record<string, object | undefined>>;
type RouteParams = RouteProp<{ DetalDetskogoPredlozheniya: { offer: ChildOffer } }, 'DetalDetskogoPredlozheniya'>;

const UI_TEXT = {
  ua: {
    back: 'Назад',
    place: 'Заклад',
    date: 'Дата',
    validUntil: 'Дійсно до',
    age: 'Вік',
    price: 'Ціна',
    free: 'Безкоштовно',
    currency: 'грн',
    discount: 'Знижка',
    conditions: 'Умови',
    call: 'Подзвонити',
    telegram: 'Telegram',
    route: 'Маршрут',
    openPlace: 'Відкрити заклад',
    conditionsText: 'Щоб уточнити умови участі, відкрийте картку закладу або звʼяжіться напряму.',
    offerTypes: {
      promotion: 'Акція',
      event: 'Подія',
      open_day: 'День відкритих дверей',
      trial_lesson: 'Пробне заняття',
      available_places: 'Є місця',
    },
  },
  ru: {
    back: 'Назад',
    place: 'Заведение',
    date: 'Дата',
    validUntil: 'Действует до',
    age: 'Возраст',
    price: 'Цена',
    free: 'Бесплатно',
    currency: 'грн',
    discount: 'Скидка',
    conditions: 'Условия',
    call: 'Позвонить',
    telegram: 'Telegram',
    route: 'Маршрут',
    openPlace: 'Открыть заведение',
    conditionsText: 'Чтобы уточнить условия участия, откройте карточку заведения или свяжитесь напрямую.',
    offerTypes: {
      promotion: 'Акция',
      event: 'Событие',
      open_day: 'День открытых дверей',
      trial_lesson: 'Пробное занятие',
      available_places: 'Есть места',
    },
  },
  en: {
    back: 'Back',
    place: 'Place',
    date: 'Date',
    validUntil: 'Valid until',
    age: 'Age',
    price: 'Price',
    free: 'Free',
    currency: 'UAH',
    discount: 'Discount',
    conditions: 'Conditions',
    call: 'Call',
    telegram: 'Telegram',
    route: 'Route',
    openPlace: 'Open place',
    conditionsText: 'To clarify participation terms, open the place card or contact directly.',
    offerTypes: {
      promotion: 'Promotion',
      event: 'Event',
      open_day: 'Open day',
      trial_lesson: 'Trial lesson',
      available_places: 'Spots available',
    },
  },
} as const;

const OFFER_ICON: Record<ChildOffer['type'], IconName> = {
  promotion: 'brightness-percent',
  event: 'calendar-star',
  open_day: 'door-open',
  trial_lesson: 'school-outline',
  available_places: 'account-group-outline',
};

function formatDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function DetalDetskogoPredlozheniyaScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteParams>();
  const offer: ChildOffer = route.params.offer;

  const language = useSelector((s: RootState) => s.language?.current ?? 'ua') as Lang;
  const [complaintVisible, setComplaintVisible] = useState(false);
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const { colors } = useAppTheme();

  const place = useMemo<Place | undefined>(
    () => chaykaPlaces.find((p) => p.id === offer.placeId),
    [offer.placeId],
  );

  const placeInfo = place ? childInfoSeed[place.id] : undefined;

  const handleCall = () => {
    if (place?.phone) void safeCallPhone(place.phone, language);
  };

  const handleTelegram = () => {
    const tg = placeInfo?.telegram;
    if (tg) void safeOpenExternalUrl(tg.startsWith('http') ? tg : `https://t.me/${tg}`, language);
  };

  const handleOpenPlace = () => {
    if (place) {
      const merged = placeInfo ? { ...place, childInfo: placeInfo } : place;
      navigation.navigate('DetalDetskogoMestaScreen', { place: merged });
    }
  };

  const handleRoute = () => {
    if (place) openInGoogleMaps(place.name, place.address);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name={OFFER_ICON[offer.type]} size={24} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{text.offerTypes[offer.type]}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{offer.title}</Text>
          </View>
        </View>

        {/* Place name */}
        {place ? (
          <TouchableOpacity style={styles.placeRow} onPress={handleOpenPlace} activeOpacity={0.85}>
            <MaterialCommunityIcons name="map-marker-outline" size={18} color={SCREEN_THEME.textMuted} />
            <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={SCREEN_THEME.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* Short text */}
        <View style={styles.section}>
          <Text style={styles.shortText}>{offer.shortText}</Text>
          {offer.fullText ? <Text style={styles.fullText}>{offer.fullText}</Text> : null}
        </View>

        {/* Details */}
        <View style={styles.section}>
          {offer.dateFrom ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{text.date}</Text>
              <Text style={styles.detailValue}>{formatDate(offer.dateFrom)}</Text>
            </View>
          ) : null}
          {offer.validUntil ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{text.validUntil}</Text>
              <Text style={styles.detailValue}>{formatDate(offer.validUntil)}</Text>
            </View>
          ) : null}
          {offer.ageFrom != null ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{text.age}</Text>
              <Text style={styles.detailValue}>
                {offer.ageTo != null ? `${offer.ageFrom}–${offer.ageTo}` : `${offer.ageFrom}+`}
              </Text>
            </View>
          ) : null}
          {offer.price != null ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{text.price}</Text>
              <Text style={styles.detailValue}>{offer.price === 0 ? text.free : `${offer.price} ${text.currency}`}</Text>
            </View>
          ) : null}
          {offer.discountPercent != null ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{text.discount}</Text>
              <Text style={[styles.detailValue, styles.discountValue]}>-{offer.discountPercent}%</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.conditionsTitle}>{text.conditions}</Text>
          <Text style={styles.fullText}>{text.conditionsText}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          {place?.phone ? (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall} activeOpacity={0.85}>
              <MaterialCommunityIcons name="phone-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>{text.call}</Text>
            </TouchableOpacity>
          ) : null}
          {placeInfo?.telegram ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleTelegram} activeOpacity={0.85}>
              <MaterialCommunityIcons name="send" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.telegram}</Text>
            </TouchableOpacity>
          ) : null}
          {place ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleOpenPlace} activeOpacity={0.85}>
              <MaterialCommunityIcons name="store-outline" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.openPlace}</Text>
            </TouchableOpacity>
          ) : null}
          {place ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={handleRoute} activeOpacity={0.85}>
              <MaterialCommunityIcons name="map-marker-path" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={[styles.actionBtnText, styles.actionBtnTextAlt]}>{text.route}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <CommentSection
          requestId={`childoffer_${offer.id}`}
          requestAuthorUid={''}
          isRequestClosed={false}
          collectionPath={COMMENTS_PATH}
        />

        <TouchableOpacity style={styles.complaintBtn} onPress={() => setComplaintVisible(true)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="flag-outline" size={13} color={SCREEN_THEME.textMuted} />
          <Text style={styles.complaintBtnText}>{language === 'ua' ? 'Поскаржитись' : language === 'ru' ? 'Пожаловаться' : 'Report'}</Text>
        </TouchableOpacity>

      </ScrollView>
      <ContentComplaintModal
        visible={complaintVisible}
        onClose={() => setComplaintVisible(false)}
        contentId={offer.id}
        contentType="kids-offer"
        contentTitle={offer.title}
        language={language}
      />
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
    backgroundColor: SCREEN_THEME.terracotta,
    marginRight: 12,
  },
  heroText: {
    flex: 1,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: SCREEN_THEME.terracotta,
    marginBottom: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 22,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 6,
  },
  placeName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
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
  shortText: {
    fontSize: 15,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 21,
  },
  fullText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 20,
  },
  conditionsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  discountValue: {
    color: SCREEN_THEME.terracotta,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  complaintBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14 },
  complaintBtnText: { color: SCREEN_THEME.textMuted, fontSize: 12, fontWeight: '700' },
  actionBtnTextAlt: {
    color: SCREEN_THEME.enamelBlueDark,
  },
});
