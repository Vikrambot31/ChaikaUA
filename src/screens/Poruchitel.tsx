import React, { useEffect, useState } from 'react';
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
import { useSelector } from 'react-redux';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import {
  approveSponsorConfirmation,
  denySponsorConfirmation,
  getMyInviteRequestStatus,
  getMyInvitedChildren,
  getMyTrustChain,
  getMyTrustNode,
  listMySponsorConfirmations,
  subscribeMyConfirmations,
  subscribeMyInviteAccessStatus,
  subscribeMyTrustNode,
  type InviteRequestSnapshot,
  type SponsorConfirmationSnapshot,
  type TrustChainLink,
  type TrustTreeChild,
  type TrustTreeNode,
} from '../services/sponsorService';
import {
  subscribeMyBonuses,
  type UserBonuses,
} from '../services/bonusService';

type Lang = 'ua' | 'ru' | 'en';
type AppNav = NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'Дерево довіри',
    treeExplain: 'У Чайці діє дерево довіри: кожного мешканця підтверджує сусід. Чим більше людей ви запросили — тим більше бонусів.',
    chain: 'Ваш ланцюжок довіри',
    chainRoot: 'Засновник',
    chainYou: 'Ви',
    depth: 'Ви — {n}-а ланка ланцюжка',
    depthRoot: 'Ви — у корені дерева',
    invitedByMe: 'Кого я запросив',
    invitedNobody: 'Ви ще нікого не запросили. Поділіться номером із сусідами!',
    hintPrefix: 'Щоб запросити сусіда — дайте йому свій номер:',
    hintSuffix: 'Під час реєстрації він вкаже його як поручителя',
    confirmations: 'Очікують вашої відповіді',
    confirmationsEmpty: 'Нових підтверджень поки немає.',
    confirmKnown: 'Так, знаю',
    denyKnown: 'Не знаю людину',
    expiresAt: 'Відповісти бажано до',
    confirmationHint: 'Сусід вказав вас як поручителя. Підтвердіть тільки якщо ви справді знаєте цю людину.',
    statusTitle: 'Статус вашої заявки',
    statusNone: 'Ви ще не подавали заявку',
    statusPending: 'Заявка на перевірці',
    statusPendingSponsor: 'Чекаємо підтвердження від поручителя',
    statusApproved: 'Доступ підтверджено',
    statusDenied: 'Заявку відхилено',
    statusManualReview: 'Заявка на ручній модерації',
    statusDisabled: 'Система заявок вимкнена',
    statusCancelled: 'Заявку скасовано',
    statusTemporaryAccess: 'Тимчасовий доступ',
    bonusTitle: 'Бонуси за довіру',
    noTrustNode: 'Ви поки не в дереві довіри. Подайте заявку або зареєструйтеся з поручителем.',
    retry: 'Спробувати ще раз',
    loadError: 'Не вдалося завантажити дані.',
  },
  ru: {
    title: 'Дерево доверия',
    treeExplain: 'В Чайке действует дерево доверия: каждого жителя подтверждает сосед. Чем больше людей вы пригласили — тем больше бонусов.',
    chain: 'Ваша цепочка доверия',
    chainRoot: 'Основатель',
    chainYou: 'Вы',
    depth: 'Вы — {n}-е звено цепочки',
    depthRoot: 'Вы — в корне дерева',
    invitedByMe: 'Кого я пригласил',
    invitedNobody: 'Вы еще никого не пригласили. Поделитесь номером с соседями!',
    hintPrefix: 'Чтобы пригласить соседа — дайте ему свой номер:',
    hintSuffix: 'При регистрации он укажет его как поручителя',
    confirmations: 'Ждут вашего ответа',
    confirmationsEmpty: 'Новых подтверждений пока нет.',
    confirmKnown: 'Да, знаю',
    denyKnown: 'Не знаю человека',
    expiresAt: 'Желательно ответить до',
    confirmationHint: 'Сосед указал вас как поручителя. Подтвердите только если вы действительно знаете этого человека.',
    statusTitle: 'Статус вашей заявки',
    statusNone: 'Вы еще не подавали заявку',
    statusPending: 'Заявка на проверке',
    statusPendingSponsor: 'Ждём подтверждения от поручителя',
    statusApproved: 'Доступ подтверждён',
    statusDenied: 'Заявка отклонена',
    statusManualReview: 'Заявка на ручной модерации',
    statusDisabled: 'Система заявок отключена',
    statusCancelled: 'Заявка отменена',
    statusTemporaryAccess: 'Временный доступ',
    bonusTitle: 'Бонусы за доверие',
    noTrustNode: 'Вы пока не в дереве доверия. Подайте заявку или зарегистрируйтесь с поручителем.',
    retry: 'Попробовать еще раз',
    loadError: 'Не удалось загрузить данные.',
  },
  en: {
    title: 'Trust Tree',
    treeExplain: 'Chaika uses a trust tree: every resident is verified by a neighbor. The more people you invite, the more bonuses you earn.',
    chain: 'Your trust chain',
    chainRoot: 'Founder',
    chainYou: 'You',
    depth: 'You are link #{n} in the chain',
    depthRoot: 'You are at the root of the tree',
    invitedByMe: 'Whom I invited',
    invitedNobody: 'You have not invited anyone yet. Share your number with neighbors!',
    hintPrefix: 'To invite a neighbor, share your number:',
    hintSuffix: 'During sign-up they can set it as referrer',
    confirmations: 'Waiting for your answer',
    confirmationsEmpty: 'No new confirmations yet.',
    confirmKnown: 'Yes, I know them',
    denyKnown: 'I do not know them',
    expiresAt: 'Please answer by',
    confirmationHint: 'A neighbor listed you as a sponsor. Confirm only if you really know this person.',
    statusTitle: 'Your request status',
    statusNone: 'You have not submitted a request yet',
    statusPending: 'Request is being reviewed',
    statusPendingSponsor: 'Waiting for sponsor confirmation',
    statusApproved: 'Access confirmed',
    statusDenied: 'Request was denied',
    statusManualReview: 'Request is under manual review',
    statusDisabled: 'Invite system is disabled',
    statusCancelled: 'Request was cancelled',
    statusTemporaryAccess: 'Temporary access',
    bonusTitle: 'Trust bonuses',
    noTrustNode: 'You are not yet in the trust tree. Submit a request or register with a sponsor.',
    retry: 'Try again',
    loadError: 'Could not load data.',
  },
} as const;

const STATUS_ICON: Record<string, { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string }> = {
  approved: { name: 'check-circle', color: '#4CAF50' },
  pending: { name: 'clock-outline', color: '#FF9800' },
  pending_sponsor: { name: 'account-clock', color: '#FF9800' },
  needs_manual_review: { name: 'account-search', color: '#2196F3' },
  denied: { name: 'close-circle', color: '#F44336' },
  auto_denied: { name: 'close-circle', color: '#F44336' },
  cancelled: { name: 'cancel', color: '#9E9E9E' },
  temporary_access: { name: 'timer-outline', color: '#8BC34A' },
  none: { name: 'help-circle-outline', color: '#9E9E9E' },
  disabled: { name: 'power-plug-off', color: '#9E9E9E' },
};

const getStatusText = (status: string, t: (typeof UI_TEXT)[Lang]): string => {
  const map: Record<string, string> = {
    approved: t.statusApproved,
    pending: t.statusPending,
    pending_sponsor: t.statusPendingSponsor,
    needs_manual_review: t.statusManualReview,
    denied: t.statusDenied,
    auto_denied: t.statusDenied,
    cancelled: t.statusCancelled,
    temporary_access: t.statusTemporaryAccess,
    disabled: t.statusDisabled,
    none: t.statusNone,
  };
  return map[status] || t.statusNone;
};

const PoruchitelScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];

  const [trustNode, setTrustNode] = useState<TrustTreeNode | null>(null);
  const [chain, setChain] = useState<TrustChainLink[]>([]);
  const [children, setChildren] = useState<TrustTreeChild[]>([]);
  const [inviteStatus, setInviteStatus] = useState<InviteRequestSnapshot | null>(null);
  const [confirmations, setConfirmations] = useState<SponsorConfirmationSnapshot[]>([]);
  const [bonuses, setBonuses] = useState<UserBonuses | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmationsLoading, setConfirmationsLoading] = useState(false);
  const [busyConfirmationId, setBusyConfirmationId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmActionError, setConfirmActionError] = useState(false);

  const load = React.useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      const [node, childrenResult, statusResult] = await Promise.all([
        getMyTrustNode(),
        getMyInvitedChildren().catch(() => [] as TrustTreeChild[]),
        getMyInviteRequestStatus().catch(() => null),
      ]);
      setTrustNode(node);
      setChildren(childrenResult);
      setInviteStatus(statusResult);
      if (node && node.rootPath.length > 0) {
        const chainResult = await getMyTrustChain(node).catch(() => [] as TrustChainLink[]);
        setChain(chainResult);
      } else {
        setChain([]);
      }
    } catch {
      setLoadError(text.loadError);
    } finally {
      setLoading(false);
    }
  }, [text.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: re-fetch when trust_tree or invite status changes
  useEffect(() => {
    const unsubTrust = subscribeMyTrustNode(
      (node) => {
        setTrustNode(node);
        if (node && node.rootPath.length > 0) {
          void getMyTrustChain(node).then(setChain).catch(() => setChain([]));
        }
        void getMyInvitedChildren().then(setChildren).catch(() => setChildren([]));
      },
      () => { setLoadError(text.loadError); },
    );
    const unsubAccess = subscribeMyInviteAccessStatus(() => {
      void getMyInviteRequestStatus().then(setInviteStatus).catch(() => undefined);
    });
    return () => {
      unsubTrust();
      unsubAccess();
    };
  }, []);

  // Realtime: bonuses
  useEffect(() => {
    const unsub = subscribeMyBonuses(setBonuses);
    return unsub;
  }, []);

  const loadConfirmations = React.useCallback(async () => {
    if (!user?.id) { setConfirmations([]); return; }
    setConfirmationsLoading(true);
    try {
      const next = await listMySponsorConfirmations();
      setConfirmations(next.filter((item) => item.status === 'pending'));
    } catch {
      setConfirmations([]);
    } finally {
      setConfirmationsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadConfirmations();
  }, [loadConfirmations]);

  // Realtime: reload confirmations when sponsor_confirmations changes for this user
  useEffect(() => {
    const unsub = subscribeMyConfirmations(
      () => { void loadConfirmations(); },
      () => { setConfirmations([]); },
    );
    return unsub;
  }, [loadConfirmations]);

  const respondToConfirmation = async (confirmationId: string, decision: 'approve' | 'deny') => {
    setConfirmActionError(false);
    setBusyConfirmationId(confirmationId);
    try {
      if (decision === 'approve') await approveSponsorConfirmation(confirmationId);
      else await denySponsorConfirmation(confirmationId);
    } catch {
      setConfirmActionError(true);
      setBusyConfirmationId(null);
      return;
    }
    setBusyConfirmationId(null);
    void loadConfirmations();
  };

  const depthLabel = trustNode
    ? trustNode.depthToRoot === 0
      ? text.depthRoot
      : text.depth.replace('{n}', String(trustNode.depthToRoot + 1))
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Explanation */}
        <View style={styles.explainCard}>
          <MaterialCommunityIcons name="tree" size={22} color={SCREEN_THEME.woodGreenDark} />
          <Text style={styles.explainText}>{text.treeExplain}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={{ marginTop: 40 }} />
        ) : (
          <>
            {loadError ? (
              <View style={styles.errorCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#B84A3A" />
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => void load()} activeOpacity={0.82}>
                  <Text style={styles.retryButtonText}>{text.retry}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Invite status */}
            {inviteStatus ? (
              <View style={styles.statusCard}>
                <Text style={styles.sectionTitle}>{text.statusTitle}</Text>
                <View style={styles.statusRow}>
                  <MaterialCommunityIcons
                    name={(STATUS_ICON[inviteStatus.status] || STATUS_ICON.none).name}
                    size={20}
                    color={(STATUS_ICON[inviteStatus.status] || STATUS_ICON.none).color}
                  />
                  <Text style={styles.statusText}>{getStatusText(inviteStatus.status, text)}</Text>
                </View>
              </View>
            ) : null}

            {/* Trust chain */}
            {trustNode ? (
              <>
                <Text style={styles.sectionTitle}>{text.chain}</Text>
                <View style={styles.chainCard}>
                  <Text style={styles.depthLabel}>{depthLabel}</Text>
                  <View style={styles.chainRow}>
                    {chain.map((link, i) => (
                      <React.Fragment key={link.uid}>
                        <View style={styles.chainNode}>
                          <MaterialCommunityIcons
                            name={i === 0 ? 'shield-crown' : 'account'}
                            size={16}
                            color={i === 0 ? '#C79C47' : SCREEN_THEME.textSecondary}
                          />
                          <Text style={styles.chainName} numberOfLines={1}>
                            {i === 0 ? text.chainRoot : link.name || `#${i + 1}`}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={14} color="#C4B89A" />
                      </React.Fragment>
                    ))}
                    <View style={[styles.chainNode, styles.chainNodeYou]}>
                      <MaterialCommunityIcons name="account-circle" size={16} color={SCREEN_THEME.woodGreenDark} />
                      <Text style={[styles.chainName, styles.chainNameYou]}>{text.chainYou}</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="tree-outline" size={28} color="#C4B89A" />
                <Text style={styles.emptyText}>{text.noTrustNode}</Text>
              </View>
            )}

            {/* Bonuses mini-card */}
            {bonuses && bonuses.total > 0 ? (
              <View style={styles.bonusMiniCard}>
                <MaterialCommunityIcons name="circle-multiple" size={20} color="#C79C47" />
                <Text style={styles.bonusMiniText}>{text.bonusTitle}</Text>
                <Text style={styles.bonusMiniValue}>{bonuses.total}</Text>
              </View>
            ) : null}

            {/* Sponsor confirmations */}
            <Text style={styles.sectionTitle}>{text.confirmations}</Text>
            <View style={styles.confirmationsCard}>
              <Text style={styles.confirmationHint}>{text.confirmationHint}</Text>
              {confirmActionError ? (
                <View style={styles.confirmErrorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#B84A3A" />
                  <Text style={styles.confirmErrorText}>{text.loadError}</Text>
                  <TouchableOpacity onPress={() => { setConfirmActionError(false); void loadConfirmations(); }} activeOpacity={0.82}>
                    <Text style={styles.retryButtonText}>{text.retry}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {confirmationsLoading ? (
                <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} style={{ marginTop: 12 }} />
              ) : confirmations.length === 0 ? (
                <Text style={styles.emptyText}>{text.confirmationsEmpty}</Text>
              ) : confirmations.map((item) => (
                <View key={item.confirmationId} style={styles.confirmationItem}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{item.requesterPhoneMasked || item.requesterUid}</Text>
                    {item.comment ? <Text style={styles.cardPhone}>{item.comment}</Text> : null}
                    {item.expiresAt > 0 ? (
                      <Text style={styles.cardPhone}>{text.expiresAt}: {new Date(item.expiresAt).toLocaleString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-GB' : 'uk-UA')}</Text>
                    ) : null}
                  </View>
                  <View style={styles.confirmationActions}>
                    <TouchableOpacity
                      style={[styles.confirmButton, busyConfirmationId === item.confirmationId && styles.disabledButton]}
                      disabled={Boolean(busyConfirmationId)}
                      onPress={() => void respondToConfirmation(item.confirmationId, 'approve')}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.confirmButtonText}>{text.confirmKnown}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.denyButton, busyConfirmationId === item.confirmationId && styles.disabledButton]}
                      disabled={Boolean(busyConfirmationId)}
                      onPress={() => void respondToConfirmation(item.confirmationId, 'deny')}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.denyButtonText}>{text.denyKnown}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Children (invited by me) */}
            <Text style={styles.sectionTitle}>{text.invitedByMe} ({children.length})</Text>
            {children.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{text.invitedNobody}</Text>
              </View>
            ) : (
              children.map((child) => (
                <View key={child.uid} style={styles.card}>
                  <MaterialCommunityIcons name="account-arrow-right" size={28} color="#4CAF50" />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{child.name || child.phoneMasked}</Text>
                    <Text style={styles.cardPhone}>{child.phoneMasked}</Text>
                  </View>
                </View>
              ))
            )}

            {/* Hint */}
            <View style={styles.hintCard}>
              <MaterialCommunityIcons name="information-outline" size={20} color={SCREEN_THEME.textSecondary} />
              <Text style={styles.hintText}>
                {text.hintPrefix} {user?.phone || '-'}{'\n'}
                {text.hintSuffix}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  explainCard: {
    backgroundColor: '#EAF5EA',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#C5DFC5',
  },
  explainText: {
    flex: 1,
    color: '#2D5F2D',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  // Status card
  statusCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
  },
  // Chain
  chainCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  depthLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.woodGreenDark,
    marginBottom: 10,
  },
  chainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  chainNode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F5F0E6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chainNodeYou: {
    backgroundColor: '#D6ECD6',
    borderWidth: 1,
    borderColor: '#A6D4A6',
  },
  chainName: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    maxWidth: 80,
  },
  chainNameYou: {
    color: SCREEN_THEME.woodGreenDark,
  },
  // Bonus mini
  bonusMiniCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8D5A0',
  },
  bonusMiniText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#6B5E30',
  },
  bonusMiniValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#C79C47',
  },
  // Cards
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 12,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  cardPhone: { fontSize: 13, color: SCREEN_THEME.textSecondary, marginTop: 2 },
  emptyCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  hintCard: {
    backgroundColor: '#F0EBE3',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
    lineHeight: 19,
  },
  errorCard: {
    backgroundColor: '#FFF3EF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0C7BE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  errorText: {
    flex: 1,
    color: '#A44333',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: '#B84A3A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  confirmationsCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  confirmationHint: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 10,
  },
  confirmationItem: {
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    paddingTop: 12,
    marginTop: 12,
    gap: 10,
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.woodGreenDark,
    paddingHorizontal: 10,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  denyButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FFF9EE',
    paddingHorizontal: 10,
  },
  denyButtonText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.55,
  },
  confirmErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  confirmErrorText: {
    flex: 1,
    color: '#A44333',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default PoruchitelScreen;
