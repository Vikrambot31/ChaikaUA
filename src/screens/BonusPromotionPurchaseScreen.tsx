import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { selectUser } from '../redux/selectors';
import { auth, database } from '../firebase-core';
import { SCREEN_THEME } from '../utils/screenTheme';
import { purchaseBonusPromotion, subscribeMyBonuses, subscribeMyPromoCredits, type PromoCredits, type UserBonuses } from '../services/bonusService';
import { useTranslation } from '../i18n/useTranslation';
import ScreenTooltip from '../components/ScreenTooltip';
import { BONUS_PROMOTION_PURCHASE_TOOLTIP } from '../utils/screenTooltips';

type AppNav = NavigationProp<Record<string, object | undefined>>;
type RouteParams = {
  BonusPromotionPurchaseScreen: {
    initialPromoType?: string;
  } | undefined;
};

type PromotionOption = {
  promoType: string;
  title: string;
  subtitle: string;
  currency: 'trust' | 'promo';
  durations: Record<string, number>;
};

type PromotionTarget = {
  id: string;
  title: string;
  subtitle: string;
};

const buildOptions = (t: any): PromotionOption[] => [
  {
    promoType: 'contacts_top',
    title: t.bonus.contactsTop,
    subtitle: t.bonus.boostProfile,
    currency: 'trust',
    durations: { '24h': 80, '3d': 200, '7d': 420 },
  },
  {
    promoType: 'services_top',
    title: t.bonus.servicesTop ?? 'Послуги в топ',
    subtitle: t.bonus.boostServices ?? 'Підняти свою послугу вгору',
    currency: 'trust',
    durations: { '24h': 100, '3d': 250, '7d': 500 },
  },
  {
    promoType: 'business_top',
    title: t.bonus.businessTop,
    subtitle: t.bonus.boostBusiness,
    currency: 'promo',
    durations: { '24h': 120, '3d': 300, '7d': 650, '30d': 2200 },
  },
  {
    promoType: 'beauty_salon_top',
    title: t.bonus.beautyTop,
    subtitle: t.bonus.boostBeauty,
    currency: 'promo',
    durations: { '24h': 120, '7d': 650 },
  },
  {
    promoType: 'beauty_promo_top',
    title: t.bonus.beautyTop,
    subtitle: t.bonus.boostBeauty,
    currency: 'promo',
    durations: { '24h': 100, '7d': 550 },
  },
  {
    promoType: 'kids_place_top',
    title: t.bonus.kidsTop,
    subtitle: t.bonus.boostKids,
    currency: 'promo',
    durations: { '24h': 120, '7d': 650 },
  },
  {
    promoType: 'kids_event_top',
    title: t.bonus.kidsTop,
    subtitle: t.bonus.boostKids,
    currency: 'promo',
    durations: { '24h': 80, '7d': 420 },
  },
];

const EMPTY_BONUSES: UserBonuses | null = null;
const EMPTY_CREDITS: PromoCredits = { balance: 0, lifetime: 0, spent: { total: 0 }, updatedAt: 0 };

const normalizeBizTitle = (raw: Record<string, unknown>, id: string) =>
  String(raw.itemName || raw.businessName || raw.contactName || raw.category || id);

const normalizeListingTitle = (raw: Record<string, unknown>, id: string) =>
  String(raw.itemName || raw.title || raw.name || raw.category || id);

const normalizeListingSubtitle = (raw: Record<string, unknown>, fallback: string) =>
  String(raw.category || raw.condition || raw.moderationStatus || raw.status || fallback);

const fetchOwnedTargets = async (
  collection: string,
  uid: string,
  fallbackSubtitle: string,
): Promise<PromotionTarget[]> => {
  const snap = await get(query(ref(database, collection), orderByChild('userId'), equalTo(uid)));
  const next: PromotionTarget[] = [];
  snap.forEach((child) => {
    const raw = child.val() && typeof child.val() === 'object' ? child.val() as Record<string, unknown> : {};
    const id = child.key || '';
    if (!id) return;
    next.push({
      id,
      title: normalizeListingTitle(raw, id),
      subtitle: normalizeListingSubtitle(raw, fallbackSubtitle),
    });
  });
  return next;
};

const getPromotionErrorMessage = (error: any, fallback: string, bonus: { errorOwnCard: string; errorInsufficientFunds: string; errorAlreadyActive: string; errorMaxSlots: string; errorAccessNotConfirmed: string; errorMinBadge: string; errorSubscriptionExists: string; errorInvalidDuration: string; errorSaveFailed: string }) => {
  const raw = String(error?.message || error?.code || '').toLowerCase();
  if (raw.includes('permission-denied') || raw.includes('can_only_promote_own')) {
    return bonus.errorOwnCard;
  }
  if (raw.includes('insufficient') || raw.includes('not_enough') || raw.includes('insufficient_credits') || raw.includes('insufficient_bonuses')) {
    return bonus.errorInsufficientFunds;
  }
  if (raw.includes('already_has_active_promotion')) {
    return bonus.errorAlreadyActive;
  }
  if (raw.includes('max_top_slots_reached')) {
    return bonus.errorMaxSlots;
  }
  if (raw.includes('access_not_confirmed')) {
    return bonus.errorAccessNotConfirmed;
  }
  if (raw.includes('min_badge')) {
    return bonus.errorMinBadge;
  }
  if (raw.includes('active_subscription_already_exists')) {
    return bonus.errorSubscriptionExists;
  }
  if (raw.includes('invalid_promo_type_or_duration') || raw.includes('invalid_duration')) {
    return bonus.errorInvalidDuration;
  }
  if (raw.includes('promotion_write_failed_funds_returned')) {
    return bonus.errorSaveFailed;
  }
  return fallback;
};

const BonusPromotionPurchaseScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<RouteParams, 'BonusPromotionPurchaseScreen'>>();
  const { t } = useTranslation();
  const user = useSelector(selectUser);
  const initialPromoType = route.params?.initialPromoType || 'contacts_top';
  const [selectedPromoType, setSelectedPromoType] = useState(initialPromoType);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('24h');
  const [promotionTargets, setPromotionTargets] = useState<PromotionTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [bonuses, setBonuses] = useState<UserBonuses | null>(EMPTY_BONUSES);
  const [credits, setCredits] = useState<PromoCredits>(EMPTY_CREDITS);
  const [buying, setBuying] = useState(false);

  const OPTIONS = buildOptions(t);
  const selectedOption = OPTIONS.find((item) => item.promoType === selectedPromoType) || OPTIONS[0];
  const durations = Object.entries(selectedOption.durations);
  const selectedPrice = selectedOption.durations[selectedDuration] ?? durations[0]?.[1] ?? 0;
  const balance = selectedOption.currency === 'trust' ? (bonuses?.available ?? bonuses?.total ?? 0) : credits.balance;

  useEffect(() => {
    const unsubBonuses = subscribeMyBonuses(setBonuses);
    const unsubCredits = subscribeMyPromoCredits(setCredits);
    return () => {
      unsubBonuses();
      unsubCredits();
    };
  }, []);

  useEffect(() => {
    if (!durations.some(([duration]) => duration === selectedDuration)) {
      setSelectedDuration(durations[0]?.[0] || '24h');
    }
  }, [durations, selectedDuration]);

  useEffect(() => {
    if (selectedPromoType === 'contacts_top') {
      setSelectedTargetId(user?.id || '');
      return;
    }

    if (!user?.id) {
      setPromotionTargets([]);
      setSelectedTargetId('');
      return;
    }

    setTargetsLoading(true);
    void (async () => {
      try {
        let next: PromotionTarget[] = [];
        if (selectedPromoType === 'business_top') {
          const snap = await get(query(ref(database, 'biznes_chaika_listings'), orderByChild('userId'), equalTo(user.id)));
          snap.forEach((child) => {
            const raw = child.val() && typeof child.val() === 'object' ? child.val() as Record<string, unknown> : {};
            next.push({
              id: child.key || '',
              title: normalizeBizTitle(raw, child.key || ''),
              subtitle: String(raw.moderationStatus || raw.status || 'business'),
            });
          });
          const localBusiness = await fetchOwnedTargets('local_business', user.id, 'business');
          const knownIds = new Set(next.map((item) => item.id));
          next = [...next, ...localBusiness.filter((item) => !knownIds.has(item.id))];
        } else {
          next = await fetchOwnedTargets('contacts_listings', user.id, 'listing');
        }
        setPromotionTargets(next);
        setSelectedTargetId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || '');
      } catch {
        setPromotionTargets([]);
        setSelectedTargetId('');
      } finally {
        setTargetsLoading(false);
      }
    })();
  }, [selectedPromoType, user?.id]);

  const targets = useMemo(() => {
    if (selectedPromoType === 'contacts_top') {
      return [{ id: user?.id || '', title: user?.name || t.bonus.activePromotions, subtitle: t.bonus.trustBonuses }];
    }
    return promotionTargets;
  }, [promotionTargets, selectedPromoType, user?.id, user?.name, t.bonus.activePromotions, t.bonus.trustBonuses]);

  const canBuy = Boolean(selectedTargetId) && balance >= selectedPrice && !buying;

  const buyPromotion = async () => {
    if (!selectedTargetId || buying) return;
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      Alert.alert(t.common.error, 'Необхідно авторизуватись.');
      return;
    }
    setBuying(true);
    try {
      const result = await purchaseBonusPromotion({
        promoType: selectedPromoType,
        duration: selectedDuration,
        targetId: selectedTargetId,
      });
      Alert.alert(
        t.bonus.activePromotions,
        result.moderationStatus === 'pending'
          ? 'Запит на просування надіслано. Воно буде активоване після перевірки модератором.'
          : `Просування активне до ${new Date(result.expiresAt).toLocaleString()}.`,
      );
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t.common.error, getPromotionErrorMessage(error, t.common.error, t.bonus));
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={BONUS_PROMOTION_PURCHASE_TOOLTIP.storageKey}
        title={BONUS_PROMOTION_PURCHASE_TOOLTIP.title}
        items={BONUS_PROMOTION_PURCHASE_TOOLTIP.items}
        accentColor={SCREEN_THEME.woodGreen}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{t.bonus.activePromotions}</Text>
          <Text style={styles.headerSubtitle}>{t.promoCredits.topupDesc}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.balanceRow}>
          <BalanceCard label={t.bonus.trustBonuses} value={bonuses?.available ?? bonuses?.total ?? 0} icon="hand-heart" />
          <BalanceCard label={t.promoCredits.title} value={credits.balance} icon="storefront" />
        </View>

        <Text style={styles.sectionTitle}>{t.adChat.promotion}</Text>
        <View style={styles.optionList}>
          {OPTIONS.map((option) => {
            const active = option.promoType === selectedPromoType;
            return (
              <TouchableOpacity
                key={option.promoType}
                style={[styles.optionCard, active && styles.optionCardActive]}
                onPress={() => setSelectedPromoType(option.promoType)}
                activeOpacity={0.84}
              >
                <View style={styles.optionTop}>
                  <Text style={[styles.optionTitle, active && styles.optionTextActive]}>{option.title}</Text>
                  <Text style={[styles.currencyPill, active && styles.currencyPillActive]}>{option.currency}</Text>
                </View>
                <Text style={[styles.optionSubtitle, active && styles.optionSubActive]}>{option.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t.bonus.boostProfile}</Text>
        {targetsLoading ? (
          <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} style={{ marginVertical: 14 }} />
        ) : targets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {t.common.noData}
            </Text>
          </View>
        ) : (
          <View style={styles.targetList}>
            {targets.map((target) => {
              const active = target.id === selectedTargetId;
              return (
                <TouchableOpacity
                  key={target.id}
                  style={[styles.targetCard, active && styles.targetCardActive]}
                  onPress={() => setSelectedTargetId(target.id)}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons name={active ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={active ? SCREEN_THEME.woodGreenDark : SCREEN_THEME.textMuted} />
                  <View style={styles.targetCopy}>
                    <Text style={styles.targetTitle}>{target.title}</Text>
                    <Text style={styles.targetSubtitle}>{target.subtitle}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>{t.promoCredits.expiresIn}</Text>
        <View style={styles.durationRow}>
          {durations.map(([duration, price]) => {
            const active = duration === selectedDuration;
            return (
              <TouchableOpacity
                key={duration}
                style={[styles.durationCard, active && styles.durationCardActive]}
                onPress={() => setSelectedDuration(duration)}
                activeOpacity={0.84}
              >
                <Text style={[styles.durationText, active && styles.durationTextActive]}>{duration}</Text>
                <Text style={[styles.durationPrice, active && styles.durationPriceActive]}>{price}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>{t.bonus.spent}</Text>
            <Text style={styles.summaryValue}>{selectedPrice} {selectedOption.currency === 'trust' ? t.bonus.trustBonuses : t.promoCredits.balance}</Text>
          </View>
          <Text style={[styles.summaryBalance, balance < selectedPrice && styles.summaryBalanceBad]}>
            {t.bonus.balance}: {balance}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.buyButton, !canBuy && styles.disabledButton]}
          onPress={() => void buyPromotion()}
          disabled={!canBuy}
          activeOpacity={0.86}
        >
          {buying ? (
            <ActivityIndicator color="#FFF9EE" />
          ) : (
            <>
              <MaterialCommunityIcons name="bullhorn-outline" size={21} color="#FFF9EE" />
              <Text style={styles.buyButtonText}>{t.adChat.promotion}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const BalanceCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}) => (
  <View style={styles.balanceCard}>
    <MaterialCommunityIcons name={icon} size={22} color={SCREEN_THEME.woodGreenDark} />
    <Text style={styles.balanceLabel}>{label}</Text>
    <Text style={styles.balanceValue}>{value}</Text>
  </View>
);

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
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  balanceCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 8,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  balanceLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  balanceValue: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 8,
  },
  optionList: {
    gap: 8,
  },
  optionCard: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  optionCardActive: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderColor: SCREEN_THEME.woodGreenDark,
  },
  optionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionTitle: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  optionTextActive: {
    color: '#FFF9EE',
  },
  currencyPill: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  currencyPillActive: {
    color: '#FFF3CE',
  },
  optionSubtitle: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  optionSubActive: {
    color: 'rgba(255,249,238,0.82)',
  },
  targetList: {
    gap: 8,
  },
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  targetCardActive: {
    borderColor: SCREEN_THEME.woodGreenDark,
    backgroundColor: '#F1EBDD',
  },
  targetCopy: {
    flex: 1,
  },
  targetTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  targetSubtitle: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  emptyText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationCard: {
    minWidth: 74,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  durationCardActive: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracotta,
  },
  durationText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  durationTextActive: {
    color: '#FFF9EE',
  },
  durationPrice: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  durationPriceActive: {
    color: '#FFF3CE',
  },
  summaryCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryValue: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  summaryBalance: {
    color: SCREEN_THEME.woodGreenDark,
    fontSize: 12,
    fontWeight: '900',
  },
  summaryBalanceBad: {
    color: SCREEN_THEME.terracottaDark,
  },
  buyButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
  },
  disabledButton: {
    opacity: 0.58,
  },
  buyButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default BonusPromotionPurchaseScreen;
