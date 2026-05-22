import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Request } from '../types/app';
import { SCREEN_THEME } from '../utils/screenTheme';
import { pickUserAvatarUri } from '../utils/userAvatar';
import TactileCard from './TactileCard';
import MiniUserAvatar from './MiniUserAvatar';

interface RequestItemProps {
  request: Request;
  avatarUri?: string;
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

const formatDateShort = (date: Date | string): string => {
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

const getTopicVisual = (
  request: Request,
  language: keyof typeof TOPIC_LABELS,
): { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string } => {
  const labels = TOPIC_LABELS[language] ?? TOPIC_LABELS.ua;
  const category = String(request.category ?? '').toLocaleLowerCase('uk-UA');
  const group = String(request.group ?? '').toLocaleLowerCase('uk-UA');
  const subcategory = String(request.subcategory ?? '').toLocaleLowerCase('uk-UA');
  const hay = `${category} ${group} ${subcategory}`;

  if (hay.includes('medical') || hay.includes('medicine')) return { icon: 'medical-bag', label: labels.medical };
  if (hay.includes('repair') || hay.includes('plumb') || hay.includes('electric')) return { icon: 'wrench-outline', label: labels.repair };
  if (hay.includes('care') || hay.includes('child') || hay.includes('elder')) return { icon: 'heart-outline', label: labels.care };
  if (hay.includes('job') || hay.includes('education_services')) return { icon: 'briefcase-outline', label: labels.job };
  if (hay.includes('buy_sell') || hay.includes('exchange') || hay.includes('sale')) return { icon: 'shopping-outline', label: labels.buySell };
  if (hay.includes('contacts')) return { icon: 'account-group-outline', label: labels.contacts };
  if (hay.includes('lost_found') || hay.includes('found') || hay.includes('lost')) return { icon: 'map-marker-question-outline', label: labels.lostFound };
  if (hay.includes('electricity') || hay.includes('power')) return { icon: 'lightning-bolt-outline', label: labels.electricity };
  if (hay.includes('transport') || hay.includes('ride')) return { icon: 'car-outline', label: labels.transport };
  if (hay.includes('foodsharing') || hay.includes('shopping')) return { icon: 'basket-outline', label: labels.foodsharing };
  if (hay.includes('pets') || hay.includes('pet')) return { icon: 'paw-outline', label: labels.pets };
  if (hay.includes('problem') || hay.includes('building_issues')) return { icon: 'home-alert-outline', label: labels.problem };
  return { icon: 'clipboard-text-outline', label: labels.request };
};

const RequestItem: React.FC<RequestItemProps> = ({
  request,
  avatarUri,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const topic = useMemo(() => getTopicVisual(request, language), [language, request]);

  const statusInfo = useMemo(() => {
    if (request.status === 'rejected') return { label: language === 'ru' ? 'Отклонено' : language === 'en' ? 'Rejected' : 'Відхилено', bg: '#fee2e2', color: '#b91c1c' };
    if (request.status === 'approved' || request.isApproved) return { label: language === 'ru' ? 'Одобрено' : language === 'en' ? 'Approved' : 'Схвалено', bg: '#e7f4ea', color: '#1f7a3a' };
    return { label: language === 'ru' ? 'Ожидает' : language === 'en' ? 'Pending' : 'Очікує', bg: '#fff2cc', color: '#8a5b00' };
  }, [language, request.isApproved, request.status]);

  const hasActions = !isOwn && (onProfile || onContact);
  const hasModActions = isModerator && (onApprove || onReject || onModDelete);
  const resolvedAvatarUri = useMemo(() => pickUserAvatarUri({ photoURL: avatarUri }, request), [avatarUri, request]);

  const L = useMemo(() => ({
    profile: language === 'ru' ? 'Профиль' : language === 'en' ? 'Profile' : 'Профіль',
    contact: language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатися",
    approve: language === 'ru' ? 'Одобрить' : language === 'en' ? 'Approve' : 'Схвалити',
    reject: language === 'ru' ? 'Отклонить' : language === 'en' ? 'Reject' : 'Відхилити',
    delete: language === 'ru' ? 'Удалить' : language === 'en' ? 'Delete' : 'Видалити',
    cancel: language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати',
    more: language === 'ru' ? 'Еще' : language === 'en' ? 'More' : 'Ще',
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
                <Text style={styles.descText} numberOfLines={2}>{request.description}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions row */}
        {(hasActions || hasModActions || (isOwn && onDelete)) ? (
          <View style={styles.actionsRow}>
            {/* Left: user action buttons */}
            <View style={styles.actionsLeft}>
              {onProfile ? (
                <TouchableOpacity style={styles.actionBtnOutlined} onPress={onProfile} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color="#7A1E5C" />
                  <Text style={styles.actionBtnOutlinedText}>{L.profile}</Text>
                </TouchableOpacity>
              ) : null}
              {onContact ? (
                <TouchableOpacity style={styles.actionBtnOutlined} onPress={onContact} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="account-arrow-right-outline" size={13} color="#7A1E5C" />
                  <Text style={styles.actionBtnOutlinedText}>{L.contact}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Right: mod actions + own delete */}
            <View style={styles.actionsRight}>
              {hasModActions ? (
                <>
                  {onApprove && !request.isApproved && request.status !== 'approved' ? (
                    <TouchableOpacity
                      style={[styles.modIconBtn, { backgroundColor: '#2A7B41' }]}
                      onPress={onApprove}
                      disabled={moderationBusy}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="check" size={13} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                  {(onReject || onModDelete) ? (
                    <TouchableOpacity
                      style={[styles.modIconBtn, { backgroundColor: '#4A413A' }]}
                      onPress={() => setMenuOpen(true)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="dots-horizontal" size={13} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
              {isOwn && onDelete ? (
                <TouchableOpacity style={styles.roundDeleteBtn} onPress={onDelete} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </TactileCard>

      {/* "в‹Ї" secondary actions modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            {onReject ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuOpen(false); onReject(); }}
                activeOpacity={0.8}
                disabled={moderationBusy}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={18} color="#B96B1E" />
                <Text style={[styles.menuItemText, { color: '#B96B1E' }]}>{L.reject}</Text>
              </TouchableOpacity>
            ) : null}
            {onModDelete ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuOpen(false); onModDelete(); }}
                activeOpacity={0.8}
                disabled={moderationBusy}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#A73737" />
                <Text style={[styles.menuItemText, { color: '#A73737' }]}>{L.delete}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.menuItem, styles.menuCancel]} onPress={() => setMenuOpen(false)} activeOpacity={0.8}>
              <Text style={styles.menuCancelText}>{L.cancel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#EDE5D8',
    paddingTop: 6,
    paddingBottom: 6,
    gap: 6,
  },
  actionsLeft: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionsRight: {
    flexDirection: 'row',
    gap: 4,
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
  actionBtnOutlinedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7A1E5C',
  },
  modIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal menu
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    width: '100%',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  menuCancelText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
});

export default React.memo(RequestItem);


