import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSelector } from 'react-redux';
import { selectUser } from '../redux/selectors';
import { selectIsOnline } from '../redux/slices/networkSlice';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import {
  MAX_AD_MESSAGE_LENGTH_VALUE,
  createAdTicket,
  hasUnreadAdAdminReply,
  markAdTicketReadByUser,
  sendAdUserMessage,
  subscribeToAdMessages,
  subscribeToUserAdTicket,
} from '../services/adService';
import { subscribeMyPromoCredits, type PromoCredits } from '../services/bonusService';
import type { AdMessage, AdTicket } from '../types/ad';
import ScreenTooltip from '../components/ScreenTooltip';
import HintBadge, { HINT_BADGE_LABELS } from '../components/HintBadge';
import { useTrainingMode } from '../hooks/useTrainingMode';
import { PROMO_CREDITS_TOPUP_TOOLTIP } from '../utils/screenTooltips';
import { useAppTheme } from '../hooks/useAppTheme';

type AppNav = NavigationProp<Record<string, object | undefined>>;

const PACKAGES = [
  { id: 'credits_100', credits: 100, amount: 20, label: '100 credits' },
  { id: 'credits_500', credits: 500, amount: 90, label: '500 credits' },
  { id: 'credits_1000', credits: 1000, amount: 170, label: '1000 credits' },
  { id: 'credits_3000', credits: 3000, amount: 450, label: '3000 credits' },
];

const EMPTY_PROMO_CREDITS: PromoCredits = {
  balance: 0,
  lifetime: 0,
  spent: { total: 0 },
  updatedAt: 0,
};

const formatTime = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const buildTopupMessage = (pack: typeof PACKAGES[number], pc: { topupRequestTitle: string; topupPackageLabel: string; topupAmountLabel: string; topupPackageIdLabel: string; topupAdminNote: string }) =>
  [
    pc.topupRequestTitle,
    `${pc.topupPackageLabel}: ${pack.credits}`,
    `${pc.topupAmountLabel}: ${pack.amount} UAH`,
    `${pc.topupPackageIdLabel}: ${pack.id}`,
    pc.topupAdminNote,
  ].join('\n');

const PromoCreditsTopupScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const { t, language } = useTranslation();
  const training = useTrainingMode('promo_credits_topup');
  const user = useSelector(selectUser);
  const isOnline = useSelector(selectIsOnline);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [ticket, setTicket] = useState<AdTicket | null>(null);
  const [messages, setMessages] = useState<AdMessage[]>([]);
  const [credits, setCredits] = useState<PromoCredits>(EMPTY_PROMO_CREDITS);
  const [selectedPackageId, setSelectedPackageId] = useState(PACKAGES[1].id);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { colors, isDark } = useAppTheme();
  const selectedPackage = PACKAGES.find((item) => item.id === selectedPackageId) || PACKAGES[1];

  useEffect(() => {
    let active = true;
    setLoading(true);
    void ensureFirebaseAuth()
      .then((firebaseUser) => {
        if (active) setAuthUid(firebaseUser?.uid ?? null);
      })
      .catch(() => {
        if (active) {
          setAuthUid(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authUid) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToUserAdTicket(authUid, (nextTicket) => {
      setTicket(nextTicket);
      setLoading(false);
    });
    return unsub;
  }, [authUid]);

  useEffect(() => {
    if (!authUid) return;
    const unsub = subscribeMyPromoCredits(setCredits);
    return unsub;
  }, [authUid]);

  useEffect(() => {
    if (!ticket?.ticketId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToAdMessages(ticket.ticketId, setMessages);
    return unsub;
  }, [ticket?.ticketId]);

  useEffect(() => {
    if (ticket && hasUnreadAdAdminReply(ticket)) {
      void markAdTicketReadByUser(ticket.ticketId).catch(() => undefined);
    }
  }, [ticket?.ticketId, ticket?.lastAdminMessage]);

  const createTopupTicket = useCallback(async () => {
    if (!selectedPackage || creating) return;
    setCreating(true);
    try {
      await createAdTicket({
        category: 'promo_topup',
        firstMessage: buildTopupMessage(selectedPackage, t.promoCredits),
        userName: user?.name || 'User',
        requestedCredits: selectedPackage.credits,
        expectedAmount: selectedPackage.amount,
        currency: 'UAH',
        packageId: selectedPackage.id,
      });
      Alert.alert(t.common.success, t.promoCredits.topupDesc);
    } catch (error: any) {
      Alert.alert(t.common.error, error?.message || '');
    } finally {
      setCreating(false);
    }
  }, [creating, selectedPackage, user?.name]);

  const sendMessage = useCallback(async () => {
    if (!ticket?.ticketId || !messageText.trim() || sending) return;
    setSending(true);
    try {
      await sendAdUserMessage(ticket.ticketId, messageText.trim());
      setMessageText('');
    } catch (error: any) {
      Alert.alert(t.common.error, error?.message || '');
    } finally {
      setSending(false);
    }
  }, [messageText, sending, ticket?.ticketId]);

  const canSend = Boolean(ticket?.ticketId) &&
    !sending &&
    isOnline &&
    messageText.trim().length > 0 &&
    messageText.length <= MAX_AD_MESSAGE_LENGTH_VALUE;

  const renderMessage = ({ item }: { item: AdMessage }) => {
    const isUser = item.senderRole === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAdmin]}>
        <Text style={[styles.bubbleSender, isUser ? styles.bubbleSenderUser : styles.bubbleSenderAdmin]}>
          {isUser ? t.common.profile : t.promoCredits.adminLabel}
        </Text>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAdmin]}>
          {item.text}
        </Text>
        <Text style={[styles.bubbleTime, isUser ? styles.bubbleTimeUser : styles.bubbleTimeAdmin]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <ScreenTooltip
        storageKey={PROMO_CREDITS_TOPUP_TOOLTIP.storageKey}
        title={PROMO_CREDITS_TOPUP_TOOLTIP.title}
        items={PROMO_CREDITS_TOPUP_TOOLTIP.items}
        language={language}
        accentColor={SCREEN_THEME.terracotta}
        forceVisible={training.showHint}
        onClose={training.closeHint}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: isDark ? '#F5E8F0' : undefined }]}>{t.promoCredits.topupTitle}</Text>
          <Text style={styles.headerSubtitle}>{t.promoCredits.topupDesc}</Text>
        </View>
        <HintBadge
          visible={training.isVisible}
          onTap={training.openHint}
          onDismiss={training.dismiss}
          label={HINT_BADGE_LABELS[language]}
        />
      </View>

      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>{t.promoCredits.balance}</Text>
          <Text style={styles.balanceValue}>{credits.balance}</Text>
        </View>
        <MaterialCommunityIcons name="storefront" size={34} color={SCREEN_THEME.woodGreenDark} />
      </View>

      {!ticket ? (
        <View style={styles.packageSection}>
          <Text style={styles.sectionTitle}>{t.promoCredits.topupTitle}</Text>
          <View style={styles.packageGrid}>
            {PACKAGES.map((pack) => {
              const active = pack.id === selectedPackageId;
              return (
                <TouchableOpacity
                  key={pack.id}
                  style={[styles.packageCard, active && styles.packageCardActive]}
                  onPress={() => setSelectedPackageId(pack.id)}
                  activeOpacity={0.84}
                >
                  <Text style={[styles.packageCredits, active && styles.packageCreditsActive]}>{pack.credits}</Text>
                  <Text style={[styles.packageLabel, active && styles.packageLabelActive]}>{pack.label}</Text>
                  <Text style={[styles.packageAmount, active && styles.packageAmountActive]}>{pack.amount} UAH</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.noticeCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={SCREEN_THEME.woodGreenDark} />
            <Text style={styles.noticeText}>
              {t.promoCredits.topupDesc}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.createButton, (!isOnline || creating || !authUid) && styles.disabledButton]}
            onPress={() => void createTopupTicket()}
            disabled={!isOnline || creating || !authUid}
            activeOpacity={0.86}
          >
            {creating ? (
              <ActivityIndicator color="#FBF8FD" />
            ) : (
              <>
                <MaterialCommunityIcons name="file-document-outline" size={21} color="#FBF8FD" />
                <Text style={styles.createButtonText}>{t.promoCredits.chatAdmin}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.ticketInfo}>
            <View style={styles.ticketCopy}>
              <Text style={styles.ticketTitle}>{t.promoCredits.topupTitle} #{ticket.ticketId.slice(-6)}</Text>
              <Text style={styles.ticketMeta}>
                {ticket.requestedCredits || 0} {t.bonus.trustBonuses} · {ticket.expectedAmount || 0} {ticket.currency || 'UAH'}
              </Text>
            </View>
            <View style={[styles.statusBadge, ticket.status === 'open' ? styles.statusOpen : styles.statusClosed]}>
              <Text style={styles.statusText}>{ticket.status === 'open' ? t.common.ok : t.common.cancel}</Text>
            </View>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.messageId}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <MaterialCommunityIcons name="message-text-outline" size={44} color={SCREEN_THEME.textMuted} />
              </View>
            }
          />

          {!isOnline ? (
            <View style={styles.warningBanner}>
              <MaterialCommunityIcons name="wifi-off" size={18} color="#856404" />
              <Text style={styles.warningText}>{t.common.warning}</Text>
            </View>
          ) : null}

          <View style={styles.inputArea}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder={t.promoCredits.chatAdmin}
                placeholderTextColor={SCREEN_THEME.textMuted}
                value={messageText}
                onChangeText={setMessageText}
                maxLength={MAX_AD_MESSAGE_LENGTH_VALUE}
                multiline
                editable={!sending}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !canSend && styles.disabledButton]}
                onPress={() => void sendMessage()}
                disabled={!canSend}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <MaterialCommunityIcons name="send" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.charCounter}>{messageText.length}/{MAX_AD_MESSAGE_LENGTH_VALUE}</Text>
          </View>
        </>
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
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: SCREEN_THEME.textSecondary,
    marginTop: 2,
  },
  balanceCard: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  balanceValue: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 2,
  },
  packageSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  packageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  packageCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 8,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  packageCardActive: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderColor: SCREEN_THEME.woodGreenDark,
  },
  packageCredits: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
  },
  packageCreditsActive: {
    color: '#FBF8FD',
  },
  packageLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  packageLabelActive: {
    color: 'rgba(247,241,251,0.82)',
  },
  packageAmount: {
    color: SCREEN_THEME.terracottaDark,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },
  packageAmountActive: {
    color: '#F5EEF9',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 13,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginTop: 14,
  },
  noticeText: {
    flex: 1,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  createButton: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
  },
  createButtonText: {
    color: '#FBF8FD',
    fontSize: 15,
    fontWeight: '900',
  },
  ticketInfo: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
    marginTop: 3,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusOpen: {
    backgroundColor: '#D4EDDA',
  },
  statusClosed: {
    backgroundColor: '#F8D7DA',
  },
  statusText: {
    color: '#333',
    fontSize: 12,
    fontWeight: '900',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: SCREEN_THEME.enamelBlue,
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
  },
  bubbleSenderUser: {
    color: '#DBEAFE',
  },
  bubbleSenderAdmin: {
    color: '#6B7280',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAdmin: {
    color: '#1F2937',
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 5,
    textAlign: 'right',
  },
  bubbleTimeUser: {
    color: '#BFDBFE',
  },
  bubbleTimeAdmin: {
    color: '#9CA3AF',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  warningText: {
    color: '#856404',
    fontSize: 13,
    fontWeight: '700',
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: SCREEN_THEME.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SCREEN_THEME.enamelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.62,
  },
  charCounter: {
    fontSize: 11,
    color: SCREEN_THEME.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
});

export default PromoCreditsTopupScreen;
