import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import {
  CollectionPayment,
  OsbbCollection,
  calculateOsbbCollectionTotals,
  recordCollectionPayment,
  subscribeOsbbCollectionPayments,
  subscribeOsbbCollections,
} from '../services/osbbCollections';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useOsbbMembership } from '../hooks/useOsbbMembership';
import InlineFieldHint from '../components/InlineFieldHint';
import { useSoftToast } from '../hooks/useSoftToast';
import ScreenTooltip from '../components/ScreenTooltip';
import { OSBB_FINANCE_TOOLTIP } from '../utils/screenTooltips';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

const formatCurrency = (value: number) => value.toLocaleString('uk-UA');

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

const UI_TEXT = {
  ua: {
    screenTitle: 'Фінанси',
    income: 'Надходження',
    expenses: 'Витрати',
    balance: 'Баланс',
    currency: 'грн',
    expensesSection: 'Структура витрат',
    transactionsSection: 'Останні операції',
    emptyTitle: 'Фінансових даних немає',
    emptySubtitle: 'Дані з\'являться після підключення ОСББ',
    targetAmount: 'План зборів',
    remainingAmount: 'Залишилось зібрати',
    collectionProgress: 'зібрано',
    // Payment tracking
    payersSection: 'Хто сплатив / хто ні',
    paidLabel: 'Сплатили',
    unpaidLabel: 'Очікується оплата',
    markPaymentTitle: 'Відмітити оплату',
    markPaymentBtn: 'Відмітити',
    cancelBtn: 'Скасувати',
    paidAmountPlaceholder: 'Сума оплати',
    payerNamePlaceholder: 'Ім\'я / квартира',
    paymentMarked: 'Оплату відмічено',
    paymentError: 'Помилка при збереженні',
    invalidAmount: 'Введіть коректну суму',
    amountHint: 'Введіть суму більше 0. Можна використовувати кому або крапку.',
    payerHint: "Ім'я або квартира допоможуть правлінню швидше звірити оплату.",
    loading: 'Завантаження...',
    errorLoad: 'Не вдалося завантажити дані',
    retry: 'Спробувати знову',
    collected: 'Зібрано',
    target: 'Ціль',
    // Paid entries list
    noPayers: 'Платежів ще немає',
    by: 'від',
  },
  ru: {
    screenTitle: 'Финансы',
    income: 'Поступления',
    expenses: 'Расходы',
    balance: 'Баланс',
    currency: 'грн',
    expensesSection: 'Структура расходов',
    transactionsSection: 'Последние операции',
    emptyTitle: 'Финансовых данных нет',
    emptySubtitle: 'Данные появятся после подключения ОСББ',
    targetAmount: 'План сборов',
    remainingAmount: 'Осталось собрать',
    collectionProgress: 'собрано',
    payersSection: 'Кто оплатил / кто нет',
    paidLabel: 'Оплатили',
    unpaidLabel: 'Ожидается оплата',
    markPaymentTitle: 'Отметить оплату',
    markPaymentBtn: 'Отметить',
    cancelBtn: 'Отмена',
    paidAmountPlaceholder: 'Сумма оплаты',
    payerNamePlaceholder: 'Имя / квартира',
    paymentMarked: 'Оплата отмечена',
    paymentError: 'Ошибка при сохранении',
    invalidAmount: 'Введите корректную сумму',
    amountHint: 'Введите сумму больше 0. Можно использовать запятую или точку.',
    payerHint: 'Имя или квартира помогут правлению быстрее сверить оплату.',
    loading: 'Загрузка...',
    errorLoad: 'Не удалось загрузить данные',
    retry: 'Попробовать снова',
    collected: 'Собрано',
    target: 'Цель',
    noPayers: 'Платежей ещё нет',
    by: 'от',
  },
  en: {
    screenTitle: 'Finance',
    income: 'Income',
    expenses: 'Expenses',
    balance: 'Balance',
    currency: 'UAH',
    expensesSection: 'Expense breakdown',
    transactionsSection: 'Recent transactions',
    emptyTitle: 'No financial data',
    emptySubtitle: 'Data will appear after ОСББ connects',
    targetAmount: 'Funding target',
    remainingAmount: 'Remaining to collect',
    collectionProgress: 'collected',
    payersSection: 'Who paid / who hasn\'t',
    paidLabel: 'Paid',
    unpaidLabel: 'Awaiting payment',
    markPaymentTitle: 'Mark payment',
    markPaymentBtn: 'Mark',
    cancelBtn: 'Cancel',
    paidAmountPlaceholder: 'Payment amount',
    payerNamePlaceholder: 'Name / apartment',
    paymentMarked: 'Payment marked',
    paymentError: 'Error saving payment',
    invalidAmount: 'Enter a valid amount',
    amountHint: 'Enter an amount greater than 0. You can use comma or dot.',
    payerHint: 'Name or apartment helps the board match the payment faster.',
    loading: 'Loading...',
    errorLoad: 'Failed to load data',
    retry: 'Retry',
    collected: 'Collected',
    target: 'Target',
    noPayers: 'No payments yet',
    by: 'by',
  },
} as const;

// ---------------------------------------------------------------------------
// PaymentEntry – stored inside OsbbCollection as a sub-map
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// MarkPaymentModal
// ---------------------------------------------------------------------------

interface MarkPaymentModalProps {
  visible: boolean;
  collection: OsbbCollection | null;
  buildingId: string;
  t: typeof UI_TEXT[keyof typeof UI_TEXT];
  onClose: () => void;
}

const MarkPaymentModal: React.FC<MarkPaymentModalProps> = ({
  visible,
  collection,
  buildingId,
  t,
  onClose,
}) => {
  const [payerName, setPayerName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useSoftToast();

  const reset = () => {
    setPayerName('');
    setAmount('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!collection) return;

    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.showWarning(t.markPaymentTitle, t.invalidAmount);
      return;
    }

    setSaving(true);
    try {
      await recordCollectionPayment(buildingId, collection.id, payerName.trim(), numericAmount);
      toast.showSuccess(t.paymentMarked);
      reset();
      onClose();
    } catch {
      toast.showError(t.markPaymentTitle, t.paymentError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>{t.markPaymentTitle}</Text>
          {collection && (
            <Text style={modalStyles.collectionName}>{collection.title}</Text>
          )}
          <TextInput
            style={modalStyles.input}
            value={payerName}
            onChangeText={setPayerName}
            placeholder={t.payerNamePlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
          />
          <InlineFieldHint message={t.payerHint} type={payerName.trim() ? 'success' : 'hint'} />
          <TextInput
            style={modalStyles.input}
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.,]/g, ''))}
            placeholder={t.paidAmountPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            keyboardType="decimal-pad"
          />
          <InlineFieldHint message={t.amountHint} type={amount.trim() ? 'success' : 'warning'} />
          <View style={modalStyles.btnRow}>
            <TouchableOpacity
              style={[modalStyles.btn, modalStyles.cancelBtn]}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={modalStyles.cancelBtnText}>{t.cancelBtn}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.btn, modalStyles.submitBtn, saving && modalStyles.btnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={modalStyles.submitBtnText}>{t.markPaymentBtn}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#6E573B',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  collectionName: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFF8EA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#EDE5D0',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  submitBtn: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  cancelBtnText: {
    color: SCREEN_THEME.textPrimary,
    fontWeight: '900',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OsbbFinansyScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector(
    (state: RootState) => state.language?.current ?? 'ua'
  ) as Lang;
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  useOsbbMembership();
  const canManageCollections = useSelector(
    (state: RootState) =>
      state.osbb.membershipRole === 'manager' &&
      state.osbb.membershipStatus === 'approved'
  );

  const t = UI_TEXT[language];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [collections, setCollections] = useState<OsbbCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Modal state for marking a payment manually
  const [modalCollection, setModalCollection] = useState<OsbbCollection | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Track expanded collection for payers view
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collectionPayments, setCollectionPayments] = useState<CollectionPayment[]>([]);

  useEffect(() => {
    if (!expandedId || !buildingId) {
      setCollectionPayments([]);
      return;
    }
    return subscribeOsbbCollectionPayments(buildingId, expandedId, setCollectionPayments);
  }, [buildingId, expandedId]);

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------
  const loadData = () => {
    setIsLoading(true);
    setHasError(false);

    const fallback = setTimeout(() => setIsLoading(false), 8000);

    try {
      const unsubscribe = subscribeOsbbCollections(buildingId, (items) => {
        clearTimeout(fallback);
        setCollections(items);
        setIsLoading(false);
      });
      return () => {
        clearTimeout(fallback);
        unsubscribe();
      };
    } catch {
      clearTimeout(fallback);
      setHasError(true);
      setIsLoading(false);
      return () => {};
    }
  };

  useEffect(() => {
    return loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const { totalCollected: totalIncome, totalTarget, remaining } =
    calculateOsbbCollectionTotals(collections);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const openMarkPayment = (item: OsbbCollection) => {
    setModalCollection(item);
    setIsModalVisible(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderLoading = () => (
    <View style={styles.centeredBox}>
      <ActivityIndicator size="large" color={SCREEN_THEME.enamelBlue} />
      <Text style={styles.loadingText}>{t.loading}</Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.emptyCard}>
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color={SCREEN_THEME.terracotta} />
      <Text style={styles.emptyTitle}>{t.errorLoad}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>{t.retry}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyCard}>
      <MaterialCommunityIcons name="cash-multiple" size={48} color={SCREEN_THEME.textSecondary} />
      <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
      <Text style={styles.emptySubtitle}>{t.emptySubtitle}</Text>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={OSBB_FINANCE_TOOLTIP.storageKey}
        title={OSBB_FINANCE_TOOLTIP.title}
        items={OSBB_FINANCE_TOOLTIP.items}
        accentColor={SCREEN_THEME.enamelBlue}
      />
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back + title */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={SCREEN_THEME.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{t.screenTitle}</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Loading */}
        {isLoading && renderLoading()}

        {/* Error */}
        {!isLoading && hasError && renderError()}

        {/* Empty */}
        {!isLoading && !hasError && collections.length === 0 && renderEmpty()}

        {/* Content */}
        {!isLoading && !hasError && collections.length > 0 && (
          <>
            {/* Summary cards: total collected / total target / remaining */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{t.income}</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(totalIncome)} {t.currency}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{t.expenses}</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(totalTarget)} {t.currency}
                </Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardWide]}>
                <Text style={styles.summaryLabel}>{t.balance}</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(remaining)} {t.currency}
                </Text>
              </View>
            </View>

            {/* Collection progress section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t.expensesSection}</Text>
              {collections.map((item) => {
                const progress =
                  item.targetAmount > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (item.collectedAmount / item.targetAmount) * 100
                        )
                      )
                    : 0;
                const isExpanded = expandedId === item.id;

                return (
                  <View key={item.id} style={styles.collectionRow}>
                    <TouchableOpacity
                      onPress={() => toggleExpand(item.id)}
                      activeOpacity={0.8}
                      style={styles.collectionHeader}
                    >
                      <Text style={styles.collectionTitle}>{item.title}</Text>
                      <View style={styles.collectionHeaderRight}>
                        <Text style={styles.collectionAmount}>{progress}%</Text>
                        <MaterialCommunityIcons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={SCREEN_THEME.textSecondary}
                        />
                      </View>
                    </TouchableOpacity>

                    <Text style={styles.collectionMeta}>
                      {formatCurrency(item.collectedAmount)} /{' '}
                      {formatCurrency(item.targetAmount)} {t.currency}{' '}
                      {t.collectionProgress}
                    </Text>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%` },
                        ]}
                      />
                    </View>

                    {/* Status badge */}
                    {item.moderationStatus && (
                      <View
                        style={[
                          styles.statusBadge,
                          item.moderationStatus === 'approved'
                            ? styles.statusApproved
                            : item.moderationStatus === 'rejected'
                            ? styles.statusRejected
                            : styles.statusPending,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>
                          {item.moderationStatus}
                        </Text>
                      </View>
                    )}

                    {/* Expanded: payers info + manual mark button */}
                    {isExpanded && (
                      <View style={styles.payersBox}>
                        {/* Collected vs Target */}
                        <View style={styles.payersRow}>
                          <View style={styles.payersStat}>
                            <MaterialCommunityIcons
                              name="check-circle-outline"
                              size={16}
                              color={SCREEN_THEME.woodGreenDark}
                            />
                            <Text style={styles.payersStatLabel}>
                              {t.collected}
                            </Text>
                            <Text style={styles.payersStatValue}>
                              {formatCurrency(item.collectedAmount)}{' '}
                              {t.currency}
                            </Text>
                          </View>
                          <View style={styles.payersStat}>
                            <MaterialCommunityIcons
                              name="clock-outline"
                              size={16}
                              color={SCREEN_THEME.terracotta}
                            />
                            <Text style={styles.payersStatLabel}>
                              {t.unpaidLabel}
                            </Text>
                            <Text style={styles.payersStatValue}>
                              {formatCurrency(
                                Math.max(
                                  0,
                                  item.targetAmount - item.collectedAmount
                                )
                              )}{' '}
                              {t.currency}
                            </Text>
                          </View>
                        </View>

                        {/* Deadline */}
                        {item.createdAt && (
                          <Text style={styles.payersDeadline}>
                            {t.transactionsSection}: {formatDate(item.createdAt)}
                          </Text>
                        )}

                        {/* Payment entries list */}
                        {collectionPayments.length > 0 && (
                          <View style={styles.paymentsList}>
                            <Text style={styles.payersStatLabel}>{t.paidLabel}:</Text>
                            {collectionPayments.map((p) => (
                              <View key={p.id} style={styles.paymentEntry}>
                                <MaterialCommunityIcons name="check-circle" size={14} color={SCREEN_THEME.woodGreenDark} />
                                <Text style={styles.paymentEntryName} numberOfLines={1}>{p.payerName || '—'}</Text>
                                <Text style={styles.paymentEntryAmount}>{formatCurrency(p.amount)} {t.currency}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {collectionPayments.length === 0 && (
                          <Text style={styles.noPayersText}>{t.noPayers}</Text>
                        )}

                        {/* Admin mark payment button */}
                        {canManageCollections && (
                          <TouchableOpacity
                            style={styles.markPaymentBtn}
                            onPress={() => openMarkPayment(item)}
                            activeOpacity={0.85}
                          >
                            <MaterialCommunityIcons
                              name="cash-plus"
                              size={16}
                              color="#fff"
                            />
                            <Text style={styles.markPaymentBtnText}>
                              {t.markPaymentTitle}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Recent transactions section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t.transactionsSection}</Text>
              {collections.map((item) => (
                <View
                  key={`${item.id}-transaction`}
                  style={styles.transactionRow}
                >
                  <View style={styles.transactionIconWrap}>
                    <MaterialCommunityIcons
                      name="bank-transfer-in"
                      size={18}
                      color={SCREEN_THEME.enamelBlue}
                    />
                  </View>
                  <View style={styles.transactionBody}>
                    <Text style={styles.transactionTitle}>{item.title}</Text>
                    <Text style={styles.transactionSubtitle}>
                      {formatDate(item.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.transactionAmounts}>
                    <Text style={styles.transactionAmount}>
                      {formatCurrency(item.collectedAmount)} {t.currency}
                    </Text>
                    <Text style={styles.transactionHint}>
                      {t.remainingAmount}:{' '}
                      {formatCurrency(
                        Math.max(0, item.targetAmount - item.collectedAmount)
                      )}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Who paid / who hasn't - summary across all collections */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t.payersSection}</Text>
              <View style={styles.payersSummaryRow}>
                <View style={[styles.payersSummaryCard, styles.payersSummaryPaid]}>
                  <MaterialCommunityIcons
                    name="account-check-outline"
                    size={22}
                    color={SCREEN_THEME.woodGreenDark}
                  />
                  <Text style={styles.payersSummaryNum}>
                    {collections.filter((c) => c.collectedAmount > 0).length}
                  </Text>
                  <Text style={styles.payersSummaryLabel}>{t.paidLabel}</Text>
                </View>
                <View style={[styles.payersSummaryCard, styles.payersSummaryUnpaid]}>
                  <MaterialCommunityIcons
                    name="account-clock-outline"
                    size={22}
                    color={SCREEN_THEME.terracotta}
                  />
                  <Text style={styles.payersSummaryNum}>
                    {collections.filter((c) => c.collectedAmount < c.targetAmount).length}
                  </Text>
                  <Text style={styles.payersSummaryLabel}>
                    {t.unpaidLabel}
                  </Text>
                </View>
              </View>
              {collections.length === 0 && (
                <Text style={styles.noPayersText}>{t.noPayers}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Mark payment modal */}
      <MarkPaymentModal
        visible={isModalVisible}
        collection={modalCollection}
        buildingId={buildingId ?? ''}
        t={t}
        onClose={() => setIsModalVisible(false)}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_BASE = {
  backgroundColor: SCREEN_THEME.paperStrong,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#E4D0AB',
  shadowColor: '#6E573B',
  shadowOpacity: 0.10,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  listContent: { padding: 16, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  backBtn: { width: 40, alignItems: 'center' },
  screenTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },

  // Loading / error states
  centeredBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  retryBtn: {
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.enamelBlue,
    paddingHorizontal: 24,
    paddingVertical: 11,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '900',
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    ...CARD_BASE,
    flex: 1,
    minWidth: '48%',
    padding: 16,
  },
  summaryCardWide: {
    minWidth: '100%',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },

  sectionCard: {
    ...CARD_BASE,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 14,
  },

  // Collection row
  collectionRow: {
    marginBottom: 14,
  },
  collectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  collectionAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.woodGreenDark,
  },
  collectionMeta: {
    marginTop: 4,
    marginBottom: 10,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    backgroundColor: '#E9DFCC',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 999,
  },

  // Status badge
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  statusApproved: { backgroundColor: SCREEN_THEME.woodGreenDark + '22' },
  statusRejected: { backgroundColor: SCREEN_THEME.terracotta + '22' },
  statusPending: { backgroundColor: SCREEN_THEME.accentGold + '33' },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
  },

  // Expanded payers box
  payersBox: {
    marginTop: 12,
    backgroundColor: '#FFF8EA',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  payersRow: {
    flexDirection: 'row',
    gap: 10,
  },
  payersStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  payersStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  payersStatValue: {
    fontSize: 12,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  payersDeadline: {
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  markPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  markPaymentBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },

  // Transactions
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EADCC1',
  },
  transactionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EBF5FB',
  },
  transactionBody: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  transactionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
  },
  transactionAmounts: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  transactionHint: {
    marginTop: 2,
    fontSize: 11,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    textAlign: 'right',
  },

  // Payers summary cards
  payersSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  payersSummaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },
  payersSummaryPaid: {
    backgroundColor: SCREEN_THEME.woodGreenDark + '14',
    borderColor: SCREEN_THEME.woodGreenDark + '33',
  },
  payersSummaryUnpaid: {
    backgroundColor: SCREEN_THEME.terracotta + '14',
    borderColor: SCREEN_THEME.terracotta + '33',
  },
  payersSummaryNum: {
    fontSize: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  payersSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
  },
  noPayersText: {
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  paymentsList: {
    marginTop: 8,
    gap: 6,
  },
  paymentEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  paymentEntryName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
  },
  paymentEntryAmount: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.woodGreenDark,
  },

  // Empty state card
  emptyCard: {
    ...CARD_BASE,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default OsbbFinansyScreen;
