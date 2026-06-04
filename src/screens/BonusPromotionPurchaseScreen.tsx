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
import { database } from '../firebase-core';
import { SCREEN_THEME } from '../utils/screenTheme';
import { purchaseBonusPromotion, subscribeMyBonuses, subscribeMyPromoCredits, type PromoCredits, type UserBonuses } from '../services/bonusService';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getBeautyPlaces, getActiveBeautyOffers } from '../services/beautySeed';
import { getChildrenPlaces, getActiveOffers } from '../services/childrenSeed';
import { useTranslation } from '../i18n/useTranslation';

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

const BonusPromotionPurchaseScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<RouteParams, 'BonusPromotionPurchaseScreen'>>();
  const { t } = useTranslation();
  const user = useSelector(selectUser);
  const initialPromoType = route.params?.initialPromoType || 'contacts_top';
  const [selectedPromoType, setSelectedPromoType] = useState(initialPromoType);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('24h');
  const [businessTargets, setBusinessTargets] = useState<PromotionTarget[]>([]);
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

    if (selectedPromoType === 'business_top') {
      if (!user?.id) {
        setBusinessTargets([]);
        setSelectedTargetId('');
        return;
      }
      setTargetsLoading(true);
      void (async () => {
        try {
          const snap = await get(query(ref(database, 'biznes_chaika_listings'), orderByChild('userId'), equalTo(user.id)));
          const next: PromotionTarget[] = [];
          snap.forEach((child) => {
            const raw = child.val() && typeof child.val() === 'object' ? child.val() as Record<string, unknown> : {};
            next.push({
              id: child.key || '',
              title: normalizeBizTitle(raw, child.key || ''),
              subtitle: String(raw.moderationStatus || raw.status || 'business'),
            });
          });
          setBusinessTargets(next);
          setSelectedTargetId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || '');
        } catch {
          setBusinessTargets([]);
          setSelectedTargetId('');
        } finally {
          setTargetsLoading(false);
        }
      })();
      return;
    }

    const nextTargets = buildStaticTargets(selectedPromoType);
    setSelectedTargetId((current) => current && nextTargets.some((item) => item.id === current) ? current : nextTargets[0]?.id || '');
  }, [selectedPromoType, user?.id]);

  const targets = useMemo(() => {
    if (selectedPromoType === 'contacts_top') {
      return [{ id: user?.id || '', title: user?.name || t.bonus.activePromotions, subtitle: t.bonus.trustBonuses }];
    }
    if (selectedPromoType === 'business_top') return businessTargets;
    return buildStaticTargets(selectedPromoType);
  }, [businessTargets, selectedPromoType, user?.id, user?.name, t.bonus.activePromotions, t.bonus.trustBonuses]);

  const canBuy = Boolean(selectedTargetId) && balance >= selectedPrice && !buying;

  const buyPromotion = async () => {
    if (!selectedTargetId || buying) return;
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
          ? t.common.loading
          : `${t.bonus.active_resident} ${new Date(result.expiresAt).toLocaleString()}.`,
      );
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t.common.error, error?.message || '');
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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

const buildStaticTargets = (promoType: string): PromotionTarget[] => {
  if (promoType === 'beauty_salon_top') {
    return getBeautyPlaces(chaykaPlaces).map((place) => ({
      id: place.id,
      title: place.name,
      subtitle: place.address,
    }));
  }
  if (promoType === 'beauty_promo_top') {
    return getActiveBeautyOffers().map((offer) => ({
      id: offer.id,
      title: offer.title,
      subtitle: offer.shortText,
    }));
  }
  if (promoType === 'kids_place_top') {
    return getChildrenPlaces(chaykaPlaces).map((place) => ({
      id: place.id,
      title: place.name,
      subtitle: place.address,
    }));
  }
  if (promoType === 'kids_event_top') {
    return getActiveOffers().map((offer) => ({
      id: offer.id,
      title: offer.title,
      subtitle: offer.shortText,
    }));
  }
  return [];
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
