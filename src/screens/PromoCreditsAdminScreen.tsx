import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import { requireWriteSession } from '../firebase-auth-session';
import { subscribeToAllAdTickets } from '../services/adService';
import {
  adminGrantPromoCredits,
  adminModeratePromotion,
  subscribeAdminBonusPromotions,
  type BonusPromotion,
} from '../services/bonusService';
import type { AdTicket } from '../types/ad';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getActiveBeautyOffers, getBeautyPlaces } from '../services/beautySeed';
import { getActiveOffers, getChildrenPlaces } from '../services/childrenSeed';

type AppNav = NavigationProp<Record<string, object | undefined>>;
type AdminTab = 'topups' | 'promotions';

const formatDateTime = (timestamp: number) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const getPromotionTypeTitle = (promotion: BonusPromotion) => {
  const map: Record<string, string> = {
    contacts: 'Контакты',
    business: 'Бизнес',
    beauty: 'Салоны красоты',
    kids: 'Все для детей',
  };
  return map[promotion.screen] || promotion.screen || 'Продвижение';
};

const getPromotionTargetTitle = (promotion: BonusPromotion) => {
  if (promotion.targetType === 'beauty_salon') {
    return getBeautyPlaces(chaykaPlaces).find((place) => place.id === promotion.targetId)?.name || promotion.targetId;
  }
  if (promotion.targetType === 'beauty_promo') {
    return getActiveBeautyOffers().find((offer) => offer.id === promotion.targetId)?.title || promotion.targetId;
  }
  if (promotion.targetType === 'kids_place') {
    return getChildrenPlaces(chaykaPlaces).find((place) => place.id === promotion.targetId)?.name || promotion.targetId;
  }
  if (promotion.targetType === 'kids_event') {
    return getActiveOffers().find((offer) => offer.id === promotion.targetId)?.title || promotion.targetId;
  }
  return promotion.targetId || promotion.targetType || 'Без цели';
};

const PromoCreditsAdminScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>('topups');
  const [tickets, setTickets] = useState<AdTicket[]>([]);
  const [promotions, setPromotions] = useState<BonusPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotionsLoading, setPromotionsLoading] = useState(true);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [busyPromotionId, setBusyPromotionId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = subscribeToAllAdTickets((next) => {
      setTickets(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminBonusPromotions((next) => {
      setPromotions(next);
      setPromotionsLoading(false);
    });
    return unsub;
  }, []);

  const topupTickets = useMemo(
    () => tickets.filter((ticket) => ticket.category === 'promo_topup'),
    [tickets],
  );

  const sortedPromotions = useMemo(() => {
    const rank = (promotion: BonusPromotion) => {
      if (promotion.moderationStatus === 'pending') return 0;
      if (promotion.status === 'active' && promotion.moderationStatus === 'approved') return 1;
      if (promotion.moderationStatus === 'rejected') return 2;
      return 3;
    };
    return [...promotions].sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
  }, [promotions]);

  const grantCredits = async (ticket: AdTicket) => {
    const credits = Number(ticket.requestedCredits || 0);
    if (!credits || credits <= 0) {
      Alert.alert(t.common.error, t.promoCredits.topupDesc);
      return;
    }

    const userName = ticket.userName || ticket.userId;
    Alert.alert(
      t.promoCredits.adminConfirmTitle,
      t.promoCredits.adminConfirmMsg
        .replace('{amount}', String(credits))
        .replace('{name}', userName),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.ok,
          onPress: async () => {
            setBusyTicketId(ticket.ticketId);
            try {
              await requireWriteSession({ requireRealUser: true, operation: 'adminGrantPromoCredits', screen: 'PromoCreditsAdmin' });
              const result = await adminGrantPromoCredits({
                targetUid: ticket.userId,
                amount: credits,
                reason: `Promo credits top-up: ${credits} credits / ${ticket.expectedAmount || 0} ${ticket.currency || 'UAH'}`,
                ticketId: ticket.ticketId,
              });
              Alert.alert(t.common.success, `${credits} credits. ${t.bonus.balance}: ${result.newBalance}`);
            } catch (error: any) {
              Alert.alert(t.common.error, error?.message || '');
            } finally {
              setBusyTicketId(null);
            }
          },
        },
      ],
    );
  };

  const moderatePromotion = async (promotion: BonusPromotion, action: 'approve' | 'reject') => {
    const reason = rejectReasons[promotion.id]?.trim();
    setBusyPromotionId(promotion.id);
    try {
      await requireWriteSession({ requireRealUser: true, operation: 'adminModeratePromotion', screen: 'PromoCreditsAdmin' });
      await adminModeratePromotion({
        promotionId: promotion.id,
        action,
        reason: action === 'reject' ? reason || t.promoCredits.adminRejectReason : undefined,
      });
      Alert.alert(t.common.success, action === 'approve' ? t.bonus.boostProfile : t.common.cancel);
      if (action === 'reject') {
        setRejectReasons((prev) => ({ ...prev, [promotion.id]: '' }));
      }
    } catch (error: any) {
      Alert.alert(t.common.error, error?.message || '');
    } finally {
      setBusyPromotionId(null);
    }
  };

  const renderTicket = ({ item }: { item: AdTicket }) => {
    const isBusy = busyTicketId === item.ticketId;
    const isPaid = item.status === 'paid';
    return (
      <View style={styles.ticketCard}>
        <View style={styles.ticketTop}>
          <View style={styles.ticketIcon}>
            <MaterialCommunityIcons name="credit-card-plus-outline" size={22} color="#FBF8FD" />
          </View>
          <View style={styles.ticketCopy}>
            <Text style={styles.ticketTitle}>{item.userName || item.userId}</Text>
            <Text style={styles.ticketMeta}>#{item.ticketId.slice(-6)} · {item.status}</Text>
          </View>
          <View style={styles.amountPill}>
            <Text style={styles.amountText}>{item.requestedCredits || 0}</Text>
          </View>
        </View>

        <View style={styles.ticketDetails}>
          <Text style={styles.detailText}>UID: {item.userId}</Text>
          <Text style={styles.detailText}>Оплата: {item.expectedAmount || 0} {item.currency || 'UAH'}</Text>
          <Text style={styles.detailText}>Пакет: {item.packageId || '-'}</Text>
        </View>

        {isPaid ? (
          <View style={styles.paidBadge}>
            <MaterialCommunityIcons name="check-decagram" size={18} color="#2E6B38" />
            <Text style={styles.paidBadgeText}>Оплачено</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.grantButton, isBusy && styles.disabledButton]}
            onPress={() => void grantCredits(item)}
            disabled={isBusy}
            activeOpacity={0.86}
          >
            {isBusy ? (
              <ActivityIndicator color="#FBF8FD" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-decagram-outline" size={19} color="#FBF8FD" />
                <Text style={styles.grantButtonText}>{t.promoCredits.adminGrantButton}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderPromotion = ({ item }: { item: BonusPromotion }) => {
    const isBusy = busyPromotionId === item.id;
    const isPending = item.moderationStatus === 'pending';
    const isApproved = item.moderationStatus === 'approved';
    const statusColor = isPending ? '#8A6200' : isApproved ? '#2E6B38' : '#8F2D2D';
    return (
      <View style={styles.ticketCard}>
        <View style={styles.ticketTop}>
          <View style={[styles.ticketIcon, styles.promotionIcon]}>
            <MaterialCommunityIcons name="bullhorn-outline" size={22} color="#FBF8FD" />
          </View>
          <View style={styles.ticketCopy}>
            <Text style={styles.ticketTitle}>{getPromotionTargetTitle(item)}</Text>
            <Text style={styles.ticketMeta}>#{item.id.slice(-6)} · {getPromotionTypeTitle(item)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.moderationStatus || item.status}</Text>
          </View>
        </View>

        <View style={styles.ticketDetails}>
          <Text style={styles.detailText}>UID: {item.uid}</Text>
          <Text style={styles.detailText}>Цель: {item.targetType} / {item.targetId}</Text>
          <Text style={styles.detailText}>Оплачено: {item.pointsSpent} {item.currency}</Text>
          <Text style={styles.detailText}>Активно до: {formatDateTime(item.expiresAt)}</Text>
        </View>

        {isPending ? (
          <>
            <TextInput
              value={rejectReasons[item.id] || ''}
              onChangeText={(value) => setRejectReasons((prev) => ({ ...prev, [item.id]: value }))}
              placeholder={t.promoCredits.adminRejectReason}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={styles.reasonInput}
              multiline
              maxLength={180}
            />
            <View style={styles.promotionActions}>
              <TouchableOpacity
                style={[styles.rejectButton, isBusy && styles.disabledButton]}
                onPress={() => void moderatePromotion(item, 'reject')}
                disabled={isBusy}
                activeOpacity={0.86}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={18} color="#FBF8FD" />
                <Text style={styles.grantButtonText}>{t.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveButton, isBusy && styles.disabledButton]}
                onPress={() => void moderatePromotion(item, 'approve')}
                disabled={isBusy}
                activeOpacity={0.86}
              >
                {isBusy ? (
                  <ActivityIndicator color="#FBF8FD" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#FBF8FD" />
                    <Text style={styles.grantButtonText}>{t.common.ok}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{t.promoCredits.title}</Text>
          <Text style={styles.headerSubtitle}>{t.promoCredits.topupTitle}</Text>
        </View>
      </View>

      <View style={styles.adminHint}>
        <MaterialCommunityIcons name="information-outline" size={16} color={SCREEN_THEME.textSecondary} />
        <Text style={styles.adminHintText}>{t.promoCredits.adminHint}</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'topups' && styles.tabButtonActive]}
          onPress={() => setActiveTab('topups')}
          activeOpacity={0.84}
        >
          <Text style={[styles.tabText, activeTab === 'topups' && styles.tabTextActive]}>{t.promoCredits.topupTitle}</Text>
          <Text style={[styles.tabCount, activeTab === 'topups' && styles.tabTextActive]}>{topupTickets.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'promotions' && styles.tabButtonActive]}
          onPress={() => setActiveTab('promotions')}
          activeOpacity={0.84}
        >
          <Text style={[styles.tabText, activeTab === 'promotions' && styles.tabTextActive]}>{t.bonus.boostProfile}</Text>
          <Text style={[styles.tabCount, activeTab === 'promotions' && styles.tabTextActive]}>
            {sortedPromotions.filter((item) => item.moderationStatus === 'pending').length}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'topups' && loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={{ flex: 1 }} />
      ) : activeTab === 'topups' ? (
        <FlatList
          data={topupTickets}
          keyExtractor={(item) => item.ticketId}
          renderItem={renderTicket}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="file-search-outline" size={44} color={SCREEN_THEME.textMuted} />
              <Text style={styles.emptyText}>{t.promoCredits.noSubscriptions}</Text>
            </View>
          }
        />
      ) : promotionsLoading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={sortedPromotions}
          keyExtractor={(item) => item.id}
          renderItem={renderPromotion}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="bullhorn-outline" size={44} color={SCREEN_THEME.textMuted} />
              <Text style={styles.emptyText}>{t.bonus.noTransactions}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1E1BC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 19,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  adminHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F1E1BC',
    borderRadius: 8,
  },
  adminHintText: {
    flex: 1,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabButtonActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  tabText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#FBF8FD',
  },
  tabCount: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  list: {
    padding: 16,
    paddingBottom: 28,
  },
  ticketCard: {
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 14,
    marginBottom: 12,
  },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ticketIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
  },
  promotionIcon: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
  },
  ticketCopy: {
    flex: 1,
  },
  ticketTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  ticketMeta: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  amountPill: {
    borderRadius: 999,
    backgroundColor: '#E3F2E5',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amountText: {
    color: '#2E6B38',
    fontSize: 13,
    fontWeight: '900',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  ticketDetails: {
    marginTop: 12,
    gap: 4,
  },
  detailText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  paidBadge: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#E3F2E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  paidBadgeText: {
    color: '#2E6B38',
    fontSize: 14,
    fontWeight: '900',
  },
  grantButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  disabledButton: {
    opacity: 0.62,
  },
  reasonInput: {
    minHeight: 48,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FBF8FD',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlignVertical: 'top',
  },
  promotionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  rejectButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#9A3B32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  approveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  grantButtonText: {
    color: '#FBF8FD',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
  },
  emptyText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
});

export default PromoCreditsAdminScreen;
