import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Request } from '../types/app';
import { SCREEN_THEME } from '../utils/screenTheme';
import { pickUserAvatarUri } from '../utils/userAvatar';
import TactileCard from './TactileCard';
import MiniUserAvatar from './MiniUserAvatar';
import UserCardActionBar from './UserCardActionBar';
import AppPhotoImage from './AppPhotoImage';

interface RequestItemProps {
  request: Request;
  avatarUri?: string;
  currentUserId?: string;
  onPress?: () => void;
  isOwn?: boolean;
  onDelete?: () => void;
  onProfile?: () => void;
  onContact?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onModDelete?: () => void;
  isModerator?: boolean;
  moderationBusy?: boolean;
  language?: 'ua' | 'ru' | 'en';
}

const formatDateShort = (date: Date | string | number): string => {
  const value = date instanceof Date ? date : new Date(date);
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

const TOPIC_LABELS = {
  ua: {
    medical: 'Медицина',
    repair: 'Ремонт',
    care: 'Допомога',
    household: 'Побут',
    job: 'Робота',
    buySell: 'Куплю / продам',
    contacts: 'Контакти',
    lostFound: 'Загублено / знайдено',
    electricity: 'Світло',
    transport: 'Транспорт',
    foodsharing: 'Фудшеринг',
    pets: 'Тварини',
    problem: 'Проблеми ЖК',
    request: 'Заявка',
  },
  ru: {
    medical: 'Медицина',
    repair: 'Ремонт',
    care: 'Помощь',
    household: 'Быт',
    job: 'Работа',
    buySell: 'Куплю / продам',
    contacts: 'Контакты',
    lostFound: 'Потеряно / найдено',
    electricity: 'Свет',
    transport: 'Транспорт',
    foodsharing: 'Фудшеринг',
    pets: 'Животные',
    problem: 'Проблемы ЖК',
    request: 'Заявка',
  },
  en: {
    medical: 'Medical',
    repair: 'Repair',
    care: 'Help',
    household: 'Household',
    job: 'Work',
    buySell: 'Buy / sell',
    contacts: 'Contacts',
    lostFound: 'Lost / found',
    electricity: 'Power',
    transport: 'Transport',
    foodsharing: 'Foodsharing',
    pets: 'Pets',
    problem: 'Building issue',
    request: 'Request',
  },
} as const;

/**
 * Maps a request to a topic icon + localized label for display in the feed card.
 * Matching order: explicit subcategory values first, then broader group/category tokens.
 * Every subcategory value from categories.ts is covered so no card falls back to the
 * generic "Заявка / Request" label unless the data is genuinely unknown.
 */
const getTopicVisual = (
  request: Request,
  language: keyof typeof TOPIC_LABELS,
): { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string } => {
  const labels = TOPIC_LABELS[language] ?? TOPIC_LABELS.ua;
  const category  = String(request.category   ?? '').toLowerCase();
  const group     = String(request.group       ?? '').toLowerCase();
  const subcategory = String(request.subcategory ?? '').toLowerCase();

  // Helper: test whether any of the three fields equals an exact value.
  const eq = (...values: string[]) =>
    values.some((v) => category === v || group === v || subcategory === v);

  // ── Medical / medicine ──────────────────────────────────────────────────────
  if (eq('medical', 'medical_consultation', 'medicine')) return { icon: 'medical-bag', label: labels.medical };

  // ── Repair & tech: all repair subcategories ─────────────────────────────────
  if (eq('repair', 'plumbing', 'electrical', 'locks_doors', 'windows_balconies',
         'home_appliances', 'furniture', 'small_repair'))
    return { icon: 'wrench-outline', label: labels.repair };

  // ── Care & help ─────────────────────────────────────────────────────────────
  if (eq('care', 'childcare', 'elderly_help', 'psychological_support'))
    return { icon: 'heart-outline', label: labels.care };

  // ── Education & services, job search ────────────────────────────────────────
  if (eq('education_services', 'tutoring', 'job_search', 'sports_company',
         'creative_club', 'master_services', 'legal_consultation', 'documents'))
    return { icon: 'briefcase-outline', label: labels.job };

  // ── Buy / sell and exchange ─────────────────────────────────────────────────
  if (eq('buy_sell', 'exchange', 'free_items', 'borrow_tool', 'item_exchange'))
    return { icon: 'shopping-outline', label: labels.buySell };

  // ── Lost & found (items and pets) ───────────────────────────────────────────
  if (eq('lost_found', 'lost_item', 'found_item', 'lost_pet', 'found_pet'))
    return { icon: 'map-marker-question-outline', label: labels.lostFound };

  // ── Pets ────────────────────────────────────────────────────────────────────
  if (eq('pets', 'dog_walking', 'pet_care'))
    return { icon: 'paw-outline', label: labels.pets };

  // ── Contacts ────────────────────────────────────────────────────────────────
  if (eq('contacts')) return { icon: 'account-group-outline', label: labels.contacts };

  // ── Electricity / power ─────────────────────────────────────────────────────
  if (eq('electricity', 'power')) return { icon: 'lightning-bolt-outline', label: labels.electricity };

  // ── Transport: all transport subcategories ──────────────────────────────────
  if (eq('transport', 'ride_share', 'need_ride', 'parking_help', 'parcel_delivery'))
    return { icon: 'car-outline', label: labels.transport };

  // ── Foodsharing ─────────────────────────────────────────────────────────────
  if (eq('foodsharing', 'going_shopping')) return { icon: 'basket-outline', label: labels.foodsharing };

  // ── Household & cleaning ────────────────────────────────────────────────────
  if (eq('household', 'cleaning', 'trash_removal', 'laundry', 'plants'))
    return { icon: 'broom', label: labels.household };

  // ── Building issues ─────────────────────────────────────────────────────────
  if (eq('building_issues', 'noise', 'elevator', 'parking_blocked',
         'yard_trash', 'yard_lighting', 'management_request'))
    return { icon: 'home-alert-outline', label: labels.problem };

  // ── Broad substring fallbacks (for legacy / free-text category values) ──────
  const hay = `${category} ${group} ${subcategory}`;
  if (hay.includes('medical') || hay.includes('medicine'))   return { icon: 'medical-bag',              label: labels.medical };
  if (hay.includes('repair')  || hay.includes('plumb') || hay.includes('electric')) return { icon: 'wrench-outline', label: labels.repair };
  if (hay.includes('care')    || hay.includes('child') || hay.includes('elder'))    return { icon: 'heart-outline',  label: labels.care };
  if (hay.includes('job')     || hay.includes('education'))                         return { icon: 'briefcase-outline', label: labels.job };
  if (hay.includes('buy_sell') || hay.includes('exchange') || hay.includes('sale')) return { icon: 'shopping-outline', label: labels.buySell };
  if (hay.includes('contacts'))                                                     return { icon: 'account-group-outline', label: labels.contacts };
  if (hay.includes('lost')    || hay.includes('found'))                             return { icon: 'map-marker-question-outline', label: labels.lostFound };
  if (hay.includes('electricity') || hay.includes('power'))                         return { icon: 'lightning-bolt-outline', label: labels.electricity };
  if (hay.includes('transport') || hay.includes('ride'))                            return { icon: 'car-outline', label: labels.transport };
  if (hay.includes('foodsharing') || hay.includes('shopping'))                      return { icon: 'basket-outline', label: labels.foodsharing };
  if (hay.includes('pet'))                                                          return { icon: 'paw-outline', label: labels.pets };
  if (hay.includes('problem') || hay.includes('building'))                          return { icon: 'home-alert-outline', label: labels.problem };

  return { icon: 'clipboard-text-outline', label: labels.request };
};

const RequestItem: React.FC<RequestItemProps> = ({
  request,
  avatarUri,
  currentUserId,
  onPress,
  isOwn,
  onDelete,
  onProfile,
  onContact,
  onApprove,
  onReject,
  onModDelete,
  isModerator,
  moderationBusy,
  language = 'ua',
}) => {
  const [descExpanded, setDescExpanded] = useState(false);
  const topic = useMemo(() => getTopicVisual(request, language), [language, request]);
  const hasPhoto = Boolean(request.photoUri || request.photoStoragePath);

  const statusInfo = useMemo(() => {
    if (request.status === 'rejected') return { label: language === 'ru' ? 'Отклонено' : language === 'en' ? 'Rejected' : 'Відхилено', bg: '#fee2e2', color: '#b91c1c' };
    if (request.status === 'approved' || request.isApproved) return { label: language === 'ru' ? 'Одобрено' : language === 'en' ? 'Approved' : 'Схвалено', bg: '#e7f4ea', color: '#1f7a3a' };
    return { label: language === 'ru' ? 'Ожидает' : language === 'en' ? 'Pending' : 'Очікує', bg: '#fff2cc', color: '#8a5b00' };
  }, [language, request.isApproved, request.status]);

  const hasModActions = isModerator && (onApprove || onReject || onModDelete);
  const resolvedAvatarUri = useMemo(() => pickUserAvatarUri({ photoURL: avatarUri }, request), [avatarUri, request]);

  const L = useMemo(() => ({
    profile: language === 'ru' ? 'Профиль' : language === 'en' ? 'Profile' : 'Профіль',
    contact: language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатися",
    approve: language === 'ru' ? 'Одобрить' : language === 'en' ? 'Approve' : 'Схвалити',
    reject: language === 'ru' ? 'Отклонить' : language === 'en' ? 'Reject' : 'Відхилити',
    delete: language === 'ru' ? 'Удалить' : language === 'en' ? 'Delete' : 'Видалити',
  }), [language]);

  return (
    <>
      <TactileCard onPress={onPress} style={styles.card}>
        {/* Top: avatar + info column */}
        <View style={styles.cardTop}>
          <MiniUserAvatar
            uri={resolvedAvatarUri}
            name={request.name ?? ''}
            size={50}
            borderRadius={13}
            backgroundColor={SCREEN_THEME.enamelBlue}
          />
          <View style={styles.infoCol}>
            <View style={styles.nameRow}>
              <Text style={styles.nameText} numberOfLines={1}>{request.name ?? ''}</Text>
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>{formatDateShort(request.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.topicPill}>
                <MaterialCommunityIcons name={topic.icon} size={10} color={SCREEN_THEME.enamelBlueDark} />
                <Text style={styles.topicPillText} numberOfLines={1}>{topic.label}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}> 
                <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>
            </View>

            {/* Description box */}
            {Boolean(request.description) && (
              <View style={styles.descBox}>
                <Text style={styles.descText} numberOfLines={descExpanded ? undefined : 2}>{request.description}</Text>
                {(request.description?.length ?? 0) > 120 && (
                  <TouchableOpacity onPress={() => setDescExpanded((prev) => !prev)} activeOpacity={0.7}>
                    <Text style={styles.expandToggle}>
                      {descExpanded
                        ? (language === 'ru' ? 'Свернуть' : language === 'en' ? 'Collapse' : 'Згорнути')
                        : (language === 'ru' ? 'Читать далее' : language === 'en' ? 'Read more' : 'Читати далі')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {hasPhoto ? (
          <AppPhotoImage
            uri={request.photoUri}
            storagePath={request.photoStoragePath}
            style={styles.photo}
            resizeMode="cover"
            isOwner={Boolean(isModerator)}
            debugLabel={`RequestItem:${request.id}`}
          />
        ) : null}

        <UserCardActionBar
          avatarUri={resolvedAvatarUri}
          name={request.name ?? ''}
          userId={request.userId}
          currentUserId={currentUserId}
          language={language}
          onProfile={onProfile}
          onContact={onContact}
          contactDisabled={!onContact}
          likePath="feed_likes/requests"
          likeId={request.id}
        />

        {(hasModActions || (isOwn && onDelete)) ? (
          <View style={styles.modActionsRow}>
            {hasModActions ? (
              <>
                {onApprove && !request.isApproved && request.status !== 'approved' ? (
                  <TouchableOpacity
                    style={[styles.modBtn, styles.modBtnApprove]}
                    onPress={onApprove}
                    disabled={moderationBusy}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
                    <Text style={styles.modBtnText}>{L.approve}</Text>
                  </TouchableOpacity>
                ) : null}
                {onReject ? (
                  <TouchableOpacity
                    style={[styles.modBtn, styles.modBtnReject]}
                    onPress={onReject}
                    disabled={moderationBusy}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={16} color="#fff" />
                    <Text style={styles.modBtnText}>{L.reject}</Text>
                  </TouchableOpacity>
                ) : null}
                {onModDelete ? (
                  <TouchableOpacity
                    style={[styles.modBtn, styles.modBtnDelete]}
                    onPress={onModDelete}
                    disabled={moderationBusy}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                    <Text style={styles.modBtnText}>{L.delete}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
            {isOwn && onDelete ? (
              <TouchableOpacity
                style={[styles.modBtn, styles.modBtnDelete]}
                onPress={onDelete}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                <Text style={styles.modBtnText}>{L.delete}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </TactileCard>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 0,
    marginBottom: 8,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoCol: {
    flex: 1,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D2520',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  topicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F0F3',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    maxWidth: '68%',
  },
  topicPillText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontSize: 9,
    fontWeight: '800',
    flexShrink: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  datePill: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  datePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#3D5D87',
  },
  descBox: {
    borderWidth: 1,
    borderColor: '#E0D5C8',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#FAF7F3',
  },
  descText: {
    fontSize: 12,
    color: '#7A6D64',
    lineHeight: 17,
  },
  expandToggle: {
    marginTop: 4,
    fontSize: 11,
    color: '#7A6D64',
    fontWeight: '700',
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  modActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  modBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modBtnApprove: {
    backgroundColor: '#2A7B41',
  },
  modBtnReject: {
    backgroundColor: '#C77A2B',
  },
  modBtnDelete: {
    backgroundColor: '#C0392B',
  },
  modBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
});

export default React.memo(RequestItem);


