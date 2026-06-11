import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BONUS_CAPS,
  subscribeMyBonuses,
  subscribeMyBonusPromotions,
  subscribeMyBonusTransactions,
  subscribeMyPromoCredits,
  type BonusPromotion,
  type BonusTransaction,
  type PromoCredits,
  type UserBonuses,
} from '../services/bonusService';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useTranslation } from '../i18n/useTranslation';
import ScreenTooltip from '../components/ScreenTooltip';
import { BONUS_WALLET_TOOLTIP } from '../utils/screenTooltips';

type AppNav = NavigationProp<Record<string, object | undefined>>;

const WEEKLY_FREE_LIMIT_FALLBACK = 250; // fallback if server hasn't written weeklyLimit yet
const EMPTY_PROMO_CREDITS: PromoCredits = {
  balance: 0,
  lifetime: 0,
  spent: { total: 0 },
  updatedAt: 0,
};

const DATE_LOCALES = {
  ua: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
} as const;

const STATUS_LABEL_KEYS = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
} as const;

const TRANSACTION_TYPE_LABEL_KEYS = {
  earn: 'earnOperation',
  spend: 'spendOperation',
  topup: 'topupOperation',
} as const;

const TARGET_TYPE_LABEL_KEYS = {
  contacts: 'promotionTargetContacts',
  contact: 'promotionTargetContacts',
  profile: 'promotionTargetContacts',
  business: 'promotionTargetBusiness',
  business_listing: 'promotionTargetBusiness',
  beauty_salon: 'promotionTargetBeautySalon',
  beauty_promo: 'promotionTargetBeautyPromo',
  kids_place: 'promotionTargetKidsPlace',
  kids_event: 'promotionTargetKidsEvent',
} as const;

type AppLanguage = keyof typeof DATE_LOCALES;
type BonusText = ReturnType<typeof useTranslation>['t']['bonus'];
type BonusStatus = keyof typeof STATUS_LABEL_KEYS;
type TransactionType = keyof typeof TRANSACTION_TYPE_LABEL_KEYS;
type TargetType = keyof typeof TARGET_TYPE_LABEL_KEYS;

const formatDate = (timestamp: number, language: AppLanguage) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString(DATE_LOCALES[language]);
};

const formatDateTime = (timestamp: number, language: AppLanguage) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString(DATE_LOCALES[language]);
};

const getStatusLabel = (status: string, bonusText: BonusText) => {
  const key = STATUS_LABEL_KEYS[status as BonusStatus];
  return key ? bonusText[key] : status;
};

const getTargetTypeLabel = (targetType: string, bonusText: BonusText) => {
  const key = TARGET_TYPE_LABEL_KEYS[targetType as TargetType];
  return key ? bonusText[key] : targetType;
};

const getTransactionTitle = (item: BonusTransaction, bonusText: BonusText) => {
  const key = TRANSACTION_TYPE_LABEL_KEYS[item.type as TransactionType];
  const type = key ? bonusText[key] : bonusText.operation;
  const category = item.category ? ` / ${item.category}` : '';
  return `${type}${category}`;
};

const BonusWalletScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { t, language } = useTranslation();
  const [bonuses, setBonuses] = useState<UserBonuses | null>(null);
  const [promoCredits, setPromoCredits] = useState<PromoCredits>(EMPTY_PROMO_CREDITS);
  const [transactions, setTransactions] = useState<BonusTransaction[]>([]);
  const [promotions, setPromotions] = useState<BonusPromotion[]>([]);
  const [ready, setReady] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const BADGE_LABELS: Record<string, string> = {
    newcomer: t.bonus.newcomer,
    good_neighbor: t.bonus.good_neighbor,
    active_resident: t.bonus.active_resident,
    guardian: t.bonus.guardian,
    ambassador: t.bonus.ambassador,
  };

  const PROMO_LABELS: Record<string, string> = {
    contacts: t.bonus.contactsTop,
    business: t.bonus.businessTop,
    beauty: t.bonus.beautyTop,
    kids: t.bonus.kidsTop,
  };

  const getPromotionTitle = (item: BonusPromotion) => {
    const screen = PROMO_LABELS[item.screen] || item.screen || t.promoCredits.topupTitle;
    const target = item.targetType ? ` · ${getTargetTypeLabel(item.targetType, t.bonus)}` : '';
    return `${screen}${target}`;
  };

  useEffect(() => {
    let active = true;
    const loadedSources = new Set<string>();
    const markLoaded = (source: string) => {
      if (!active) return;
      loadedSources.add(source);
      if (loadedSources.size >= 2) setReady(true);
    };

    const unsubBonuses = subscribeMyBonuses((next) => {
      setBonuses(next);
      markLoaded('bonuses');
    });
    const unsubCredits = subscribeMyPromoCredits((next) => {
      setPromoCredits(next);
      markLoaded('credits');
    });
    const unsubTransactions = subscribeMyBonusTransactions((next) => {
      setTransactions(next);
      markLoaded('transactions');
    });
    const unsubPromotions = subscribeMyBonusPromotions((next) => {
      setPromotions(next);
      markLoaded('promotions');
    });

    // Safety timeout: show UI even if some subscriptions never fire
    const timeout = setTimeout(() => { if (active) setReady(true); }, 5000);

    return () => {
      active = false;
      clearTimeout(timeout);
      unsubBonuses();
      unsubCredits();
      unsubTransactions();
      unsubPromotions();
    };
  }, []);

  const trustAvailable = bonuses?.available ?? bonuses?.total ?? 0;
  const weeklyEarned = bonuses?.earned?.weeklyTotal ?? 0;
  const weeklyLimit = bonuses?.earned?.weeklyLimit ?? WEEKLY_FREE_LIMIT_FALLBACK;
  const weeklyProgress = Math.min(100, (weeklyEarned / weeklyLimit) * 100);
  const totalProgress = Math.min(100, ((bonuses?.total ?? 0) / BONUS_CAPS.total) * 100);
  const activePromotions = useMemo(() => {
    const now = Date.now();
    return promotions.filter((item) =>
      item.status === 'active' &&
      item.expiresAt > now &&
      item.moderationStatus === 'approved'
    );
  }, [promotions]);

  const openSupport = useCallback(() => {
    navigation.navigate('SupportScreen');
  }, [navigation]);

  const openTopup = useCallback(() => {
    navigation.navigate('PromoCreditsTopupScreen');
  }, [navigation]);

  const openContacts = useCallback(() => {
    navigation.navigate('BonusPromotionPurchaseScreen', { initialPromoType: 'contacts_top' });
  }, [navigation]);

  const openBusiness = useCallback(() => {
    navigation.navigate('BonusPromotionPurchaseScreen', { initialPromoType: 'business_top' });
  }, [navigation]);

  const openBeauty = useCallback(() => {
    navigation.navigate('BonusPromotionPurchaseScreen', { initialPromoType: 'beauty_salon_top' });
  }, [navigation]);

  const openKids = useCallback(() => {
    navigation.navigate('BonusPromotionPurchaseScreen', { initialPromoType: 'kids_place_top' });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={BONUS_WALLET_TOOLTIP.storageKey}
        title={BONUS_WALLET_TOOLTIP.title}
        items={BONUS_WALLET_TOOLTIP.items}
        language={language}
        accentColor={SCREEN_THEME.woodGreen}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.82}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t.bonus.walletTitle}</Text>
            <Text style={styles.headerSubtitle}>{t.bonus.walletSubtitle}</Text>
          </View>
          <TouchableOpacity onPress={openSupport} style={styles.iconButton} activeOpacity={0.82}>
            <MaterialCommunityIcons name="headset" size={23} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
        </View>

        {!ready ? (
          <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={styles.loader} />
        ) : (
          <>
            <View style={styles.balanceGrid}>
              <View style={[styles.balancePanel, styles.trustPanel]}>
                <View style={styles.panelIconRow}>
                  <MaterialCommunityIcons name="hand-heart" size={22} color="#FFF9EE" />
                  <Text style={styles.panelLabelLight}>{t.bonus.trustBonuses}</Text>
                </View>
                <Text style={styles.panelValueLight}>{trustAvailable}</Text>
                <Text style={styles.panelHintLight}>{t.bonus.trustDesc}</Text>
              </View>

              <View style={styles.balancePanel}>
                <View style={styles.panelIconRow}>
                  <MaterialCommunityIcons name="storefront" size={22} color={SCREEN_THEME.woodGreenDark} />
                  <Text style={styles.panelLabel}>{t.promoCredits.title}</Text>
                </View>
                <Text style={styles.panelValue}>{promoCredits.balance}</Text>
                <Text style={styles.panelHint}>{t.promoCredits.topupDesc}</Text>
              </View>
            </View>

            {/* Badge — compact single line */}
            <View style={styles.badgeRow}>
              <MaterialCommunityIcons name="medal-outline" size={20} color={SCREEN_THEME.accentGold} />
              <Text style={styles.badgeLabel}>{BADGE_LABELS[bonuses?.badge || 'newcomer'] || t.bonus.newcomer}</Text>
              <Text style={styles.badgeMeta}>{bonuses?.total ?? 0} / {BONUS_CAPS.total}</Text>
            </View>

            <View style={styles.actionGrid}>
              <ActionButton icon="account-star" label={t.bonus.boostProfile} hint={t.bonus.contactsTop} onPress={openContacts} />
              <ActionButton icon="store-plus" label={t.bonus.boostBusiness} hint={t.bonus.businessTop} onPress={openBusiness} />
              <ActionButton icon="content-cut" label={t.bonus.boostBeauty} hint={t.bonus.beautyTop} onPress={openBeauty} />
              <ActionButton icon="baby-face-outline" label={t.bonus.boostKids} hint={t.bonus.kidsTop} onPress={openKids} />
            </View>

            <TouchableOpacity style={styles.topupButton} onPress={openTopup} activeOpacity={0.86}>
              <MaterialCommunityIcons name="credit-card-plus-outline" size={22} color="#FFF9EE" />
              <View style={styles.topupCopy}>
                <Text style={styles.topupTitle}>{t.promoCredits.topupTitle}</Text>
                <Text style={styles.topupHint}>{t.promoCredits.topupDesc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#FFF9EE" />
            </TouchableOpacity>

            {activePromotions.length > 0 && (
              <Section title={t.bonus.activePromotions} icon="pin">
                {activePromotions.map((item) => (
                  <View key={item.id} style={styles.listItem}>
                    <MaterialCommunityIcons name="bullhorn-outline" size={21} color={SCREEN_THEME.terracotta} />
                    <View style={styles.listCopy}>
                      <Text style={styles.listTitle}>{getPromotionTitle(item)}</Text>
                      <Text style={styles.listMeta}>
                        {item.pointsSpent} {item.currency} · {t.bonus.until} {formatDate(item.expiresAt, language)} · {getStatusLabel(item.moderationStatus, t.bonus)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Section>
            )}

            {/* Collapsible details: badge progress, weekly limit, history */}
            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => setShowDetails((prev) => !prev)}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name={showDetails ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={SCREEN_THEME.textSecondary}
              />
              <Text style={styles.detailsToggleText}>
                {showDetails ? t.bonus.hideDetails : t.bonus.showDetails}
              </Text>
            </TouchableOpacity>

            {showDetails && (
              <>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="medal-outline" size={22} color={SCREEN_THEME.accentGold} />
                    <Text style={styles.cardTitle}>{BADGE_LABELS[bonuses?.badge || 'newcomer'] || t.bonus.newcomer}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${totalProgress}%` }]} />
                  </View>
                  <View style={styles.progressMeta}>
                    <Text style={styles.metaText}>{bonuses?.total ?? 0} / {BONUS_CAPS.total}</Text>
                    <Text style={styles.metaText}>{t.bonus.spentLabel} {bonuses?.spent.total ?? 0}</Text>
                  </View>
                </View>

                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="calendar-week" size={22} color={SCREEN_THEME.enamelBlue} />
                    <Text style={styles.cardTitle}>{t.bonus.weeklyLimit}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFillBlue, { width: `${weeklyProgress}%` }]} />
                  </View>
                  <View style={styles.progressMeta}>
                    <Text style={styles.metaText}>{weeklyEarned} / {weeklyLimit}</Text>
                    <Text style={styles.metaText}>{bonuses?.earned.weekKey || t.bonus.currentWeek}</Text>
                  </View>
                  <View style={styles.breakdownGrid}>
                    <Breakdown label={t.bonus.help} value={bonuses?.help.points ?? 0} />
                    <Breakdown label={t.bonus.thanks} value={bonuses?.gratitude.points ?? 0} />
                    <Breakdown label={t.bonus.invites} value={bonuses?.invites.points ?? 0} />
                    <Breakdown label={t.bonus.likes} value={bonuses?.likes.points ?? 0} />
                  </View>
                </View>

                <Section title={t.bonus.recentHistory} icon="history">
                  {transactions.length === 0 ? (
                    <EmptyLine text={t.bonus.emptyHistory} />
                  ) : (
                    <>
                      {transactions.slice(0, showAllHistory ? 30 : 3).map((item) => (
                        <View key={item.id} style={styles.listItem}>
                          <MaterialCommunityIcons
                            name={item.type === 'spend' ? 'arrow-up-circle' : item.type === 'topup' ? 'plus-circle' : 'arrow-down-circle'}
                            size={21}
                            color={item.type === 'spend' ? SCREEN_THEME.terracotta : SCREEN_THEME.woodGreen}
                          />
                          <View style={styles.listCopy}>
                            <Text style={styles.listTitle}>{getTransactionTitle(item, t.bonus)}</Text>
                            <Text style={styles.listMeta}>{formatDateTime(item.createdAt, language)} · {t.bonus.balanceAfter} {item.balanceAfter}</Text>
                            {item.note ? <Text style={styles.listNote}>{item.note}</Text> : null}
                          </View>
                          <Text style={[styles.pointsDelta, item.type === 'spend' && styles.pointsDeltaSpend]}>
                            {item.type === 'spend' ? '-' : '+'}{Math.abs(item.points)}
                          </Text>
                        </View>
                      ))}
                      {transactions.length > 3 && !showAllHistory && (
                        <TouchableOpacity
                          style={styles.showAllButton}
                          onPress={() => setShowAllHistory(true)}
                          activeOpacity={0.82}
                        >
                          <Text style={styles.showAllText}>{t.bonus.allHistory} ({transactions.length})</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </Section>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Breakdown = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.breakdownItem}>
    <Text style={styles.breakdownValue}>{value}</Text>
    <Text style={styles.breakdownLabel}>{label}</Text>
  </View>
);

const ActionButton = ({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.84}>
    <MaterialCommunityIcons name={icon} size={22} color={SCREEN_THEME.woodGreenDark} />
    <Text style={styles.actionLabel}>{label}</Text>
    <Text style={styles.actionHint}>{hint}</Text>
  </TouchableOpacity>
);

const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  children: React.ReactNode;
}) => (
  <View style={styles.sectionBlock}>
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name={icon} size={21} color={SCREEN_THEME.textSecondary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.listBox}>{children}</View>
  </View>
);

const EmptyLine = ({ text }: { text: string }) => (
  <View style={styles.emptyLine}>
    <MaterialCommunityIcons name="information-outline" size={20} color={SCREEN_THEME.textMuted} />
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  content: {
    padding: 18,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 25,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  loader: {
    marginTop: 80,
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  balancePanel: {
    flex: 1,
    minHeight: 158,
    borderRadius: 8,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    justifyContent: 'space-between',
  },
  trustPanel: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderColor: SCREEN_THEME.woodGreenDark,
  },
  panelIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  panelLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  panelLabelLight: {
    color: '#FFF9EE',
    fontSize: 12,
    fontWeight: '700',
  },
  panelValue: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 38,
    fontWeight: '900',
  },
  panelValueLight: {
    color: '#FFF9EE',
    fontSize: 38,
    fontWeight: '900',
  },
  panelHint: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  panelHintLight: {
    color: 'rgba(255, 249, 238, 0.82)',
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(123, 86, 56, 0.12)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: SCREEN_THEME.accentGold,
  },
  progressFillBlue: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: SCREEN_THEME.enamelBlue,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  metaText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  breakdownItem: {
    minWidth: '47%',
    flex: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: SCREEN_THEME.appBgSoft,
  },
  breakdownValue: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  breakdownLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    width: '48%',
    minHeight: 96,
    borderRadius: 8,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  actionLabel: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  actionHint: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  topupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    padding: 14,
    marginTop: 14,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  topupCopy: {
    flex: 1,
  },
  topupTitle: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  topupHint: {
    color: 'rgba(255, 249, 238, 0.84)',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  sectionBlock: {
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  sectionTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  listBox: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  listCopy: {
    flex: 1,
  },
  listTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  listMeta: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  listNote: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pointsDelta: {
    color: SCREEN_THEME.woodGreenDark,
    fontSize: 15,
    fontWeight: '900',
  },
  pointsDeltaSpend: {
    color: SCREEN_THEME.terracottaDark,
  },
  emptyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  emptyText: {
    flex: 1,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  badgeLabel: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  badgeMeta: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  detailsToggleText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  showAllButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SCREEN_THEME.borderSoft,
  },
  showAllText: {
    color: SCREEN_THEME.enamelBlue,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default BonusWalletScreen;
