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
import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { useSelector } from 'react-redux';
import { database } from '../firebase-config';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { normalizePhoneText } from '../utils/textUtils';
import {
  approveSponsorConfirmation,
  denySponsorConfirmation,
  listMySponsorConfirmations,
  type SponsorConfirmationSnapshot,
} from '../services/sponsorService';

interface ReferreeInfo {
  name: string;
  phone: string;
  registeredAt: string;
}

type Lang = 'ua' | 'ru' | 'en';
type AppNav = NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'Поручитель',
    desc: 'Ваше дерево запрошень - хто вас запросив і кого запросили ви',
    invitedMe: 'Хто запросив мене',
    referrerNotFound: 'Поручителя не знайдено у базі',
    noReferrer: 'Ви зареєструвались без поручителя',
    invitedByMe: 'Кого я запросив',
    invitedNobody: 'Ви ще нікого не запросили. Поділіться своїм номером телефону із сусідами!',
    hintPrefix: 'Щоб запросити сусіда - дайте йому свій номер:',
    hintSuffix: 'Під час реєстрації він вкаже його як поручителя',
    unknown: 'Невідомо',
    confirmations: 'Очікують вашої відповіді',
    confirmationsEmpty: 'Нових підтверджень поки немає.',
    confirmKnown: 'Так, знаю',
    denyKnown: 'Не знаю людину',
    expiresAt: 'Відповісти бажано до',
    confirmationHint: 'Сусід вказав вас як поручителя. Підтвердіть тільки якщо ви справді знаєте цю людину.',
  },
  ru: {
    title: 'Поручитель',
    desc: 'Ваше дерево приглашений - кто вас пригласил и кого пригласили вы',
    invitedMe: 'Кто пригласил меня',
    referrerNotFound: 'Поручитель не найден в базе',
    noReferrer: 'Вы зарегистрировались без поручителя',
    invitedByMe: 'Кого я пригласил',
    invitedNobody: 'Вы еще никого не пригласили. Поделитесь своим номером с соседями!',
    hintPrefix: 'Чтобы пригласить соседа - дайте ему свой номер:',
    hintSuffix: 'При регистрации он укажет его как поручителя',
    unknown: 'Неизвестно',
    confirmations: 'Ждут вашего ответа',
    confirmationsEmpty: 'Новых подтверждений пока нет.',
    confirmKnown: 'Да, знаю',
    denyKnown: 'Не знаю человека',
    expiresAt: 'Желательно ответить до',
    confirmationHint: 'Сосед указал вас как поручителя. Подтвердите только если вы действительно знаете этого человека.',
  },
  en: {
    title: 'Referrals',
    desc: 'Your invitation tree - who invited you and whom you invited',
    invitedMe: 'Who invited me',
    referrerNotFound: 'Referrer not found in database',
    noReferrer: 'You registered without a referrer',
    invitedByMe: 'Whom I invited',
    invitedNobody: 'You have not invited anyone yet. Share your phone number with neighbors!',
    hintPrefix: 'To invite a neighbor, share your number:',
    hintSuffix: 'During sign-up they can set it as referrer',
    unknown: 'Unknown',
    confirmations: 'Waiting for your answer',
    confirmationsEmpty: 'No new confirmations yet.',
    confirmKnown: 'Yes, I know them',
    denyKnown: 'I do not know them',
    expiresAt: 'Please answer by',
    confirmationHint: 'A neighbor listed you as a sponsor. Confirm only if you really know this person.',
  },
} as const;

const PoruchitelScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];

  const [myReferrer, setMyReferrer] = useState<ReferreeInfo | null>(null);
  const [myReferrees, setMyReferrees] = useState<ReferreeInfo[]>([]);
  const [confirmations, setConfirmations] = useState<SponsorConfirmationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmationsLoading, setConfirmationsLoading] = useState(false);
  const [busyConfirmationId, setBusyConfirmationId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = React.useCallback(async () => {
    setLoadError('');
    setLoading(true);
    setMyReferrer(null);
    setMyReferrees([]);

      if (!user?.phone) {
        setLoading(false);
        return;
      }

      try {
        const safePhone = user.phone.replace(/[^0-9]/g, '');

        const refereesSnap = await get(ref(database, `referrals/${safePhone}`));
        if (refereesSnap.exists()) {
          const data = refereesSnap.val() as Record<string, ReferreeInfo>;
          setMyReferrees(Object.values(data));
        } else {
          setMyReferrees([]);
        }

        if (user.referrerPhone) {
          const safeReferrer = user.referrerPhone.replace(/[^0-9]/g, '');
          const normalizedReferrerPhone = normalizePhoneText(user.referrerPhone);
          const usersSnap = await get(query(ref(database, 'users'), orderByChild('phone'), equalTo(normalizedReferrerPhone)));
          if (usersSnap.exists()) {
            const allUsers = usersSnap.val() as Record<string, { phone?: string; name?: string; registeredAt?: string }>;
            const referrerEntry = Object.values(allUsers).find(
              (u) => u.phone?.replace(/[^0-9]/g, '') === safeReferrer
            );
            if (referrerEntry) {
              setMyReferrer({
                name: referrerEntry.name || text.unknown,
                phone: referrerEntry.phone || user.referrerPhone,
                registeredAt: referrerEntry.registeredAt || '',
              });
            } else {
              setMyReferrer(null);
            }
          } else {
            setMyReferrer(null);
          }
        } else {
          setMyReferrer(null);
        }
      } catch {
        setLoadError(language === 'ua' ? 'Не вдалося завантажити дані. Спробуйте ще раз.' : language === 'ru' ? 'Не удалось загрузить данные. Попробуйте еще раз.' : 'Could not load data. Please try again.');
      } finally {
        setLoading(false);
      }
  }, [language, user?.phone, user?.referrerPhone]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadConfirmations = React.useCallback(async () => {
    if (!user?.id) {
      setConfirmations([]);
      return;
    }
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

  const respondToConfirmation = async (confirmationId: string, decision: 'approve' | 'deny') => {
    setBusyConfirmationId(confirmationId);
    try {
      if (decision === 'approve') {
        await approveSponsorConfirmation(confirmationId);
      } else {
        await denySponsorConfirmation(confirmationId);
      }
      await loadConfirmations();
    } catch {
      setLoadError(language === 'ua' ? 'Не вдалося надіслати відповідь. Оновіть і спробуйте ще раз.' : language === 'ru' ? 'Не удалось отправить ответ. Обновите и попробуйте ещё раз.' : 'Could not send your answer. Refresh and try again.');
    } finally {
      setBusyConfirmationId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.descCard}>
          <Text style={styles.descText}>{text.desc}</Text>
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
                  <Text style={styles.retryButtonText}>{language === 'ua' ? 'Спробувати ще раз' : language === 'ru' ? 'Попробовать еще раз' : 'Try again'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>{text.confirmations}</Text>
            <View style={styles.confirmationsCard}>
              <Text style={styles.confirmationHint}>{text.confirmationHint}</Text>
              {confirmationsLoading ? (
                <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} style={{ marginTop: 12 }} />
              ) : confirmations.length === 0 ? (
                <Text style={styles.emptyText}>{text.confirmationsEmpty}</Text>
              ) : confirmations.map((item) => (
                <View key={item.confirmationId} style={styles.confirmationItem}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{item.requesterPhoneMasked || item.requesterUid}</Text>
                    {item.comment ? <Text style={styles.cardPhone}>{item.comment}</Text> : null}
                    <Text style={styles.cardPhone}>{text.expiresAt}: {new Date(item.expiresAt).toLocaleString()}</Text>
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

            <Text style={styles.sectionTitle}>{text.invitedMe}</Text>
            {myReferrer ? (
              <View style={styles.card}>
                <MaterialCommunityIcons name="account-arrow-left" size={28} color={SCREEN_THEME.terracotta} />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{myReferrer.name}</Text>
                  <Text style={styles.cardPhone}>{myReferrer.phone}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {user?.referrerPhone ? text.referrerNotFound : text.noReferrer}
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>{text.invitedByMe} ({myReferrees.length})</Text>
            {myReferrees.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {text.invitedNobody}
                </Text>
              </View>
            ) : (
              myReferrees.map((r, i) => (
                <View key={i} style={styles.card}>
                  <MaterialCommunityIcons name="account-arrow-right" size={28} color="#4CAF50" />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{r.name}</Text>
                    <Text style={styles.cardPhone}>{r.phone}</Text>
                  </View>
                </View>
              ))
            )}

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
    marginBottom: 20,
    marginTop: 8,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  descCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 10,
  },
  descText: {
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
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
});

export default PoruchitelScreen;
