import React, { useMemo, useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import {
  selectIsPremium,
  selectSubscriptionStatus,
  selectExpiresAt,
  selectDaysLeft,
  selectTrialUsed,
  hydrateSubscription,
  callActivateTrialPremium,
} from '../redux/slices/subscriptionSlice';

const FEATURES_UA = [
  'Люди Чайки — повний доступ',
  'Більше оголошень (до 5)',
  'Більше заявок (до 6)',
  'Більше фото (до 10/день)',
  'Бонуси x1.5',
  'Пріоритетна підтримка',
];

const FEATURES_RU = [
  'Люди Чайки — полный доступ',
  'Больше объявлений (до 5)',
  'Больше заявок (до 6)',
  'Больше фото (до 10/день)',
  'Бонусы x1.5',
  'Приоритетная поддержка',
];

const FEATURES_EN = [
  'Chaika People — full access',
  'More listings (up to 5)',
  'More requests (up to 6)',
  'More photos (up to 10/day)',
  'Bonuses x1.5',
  'Priority support',
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

export default function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const dispatch = useDispatch();
  const { language } = useTranslation();

  const isPremium = useSelector(selectIsPremium);
  const status = useSelector(selectSubscriptionStatus);
  const expiresAt = useSelector(selectExpiresAt);
  const daysLeft = useSelector(selectDaysLeft);
  const trialUsed = useSelector(selectTrialUsed);

  const [loading, setLoading] = useState(false);

  const text = useMemo(() => {
    if (language === 'ua') {
      return {
        title: 'Premium Чайка Life',
        back: 'Назад',
        price: '39 грн / місяць',
        activeTitle: 'Ваша підписка активна',
        activeExpiry: 'Дійсна до:',
        daysLeft: (n: number) => `Залишилось: ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'}`,
        expiredTitle: 'Підписка завершена',
        expiredBody: 'Ваш Premium закінчився. Оформіть підписку знову щоб відновити доступ.',
        trialButton: 'Спробувати безкоштовно\nперший місяць',
        payButton: 'Оплатити через підтримку',
        payHint: "Зв'яжіться з адміном для отримання реквізитів",
        trialConfirmTitle: 'Безкоштовний місяць',
        trialConfirmMsg: 'Активувати безкоштовний пробний місяць Premium? Ця можливість доступна лише один раз.',
        trialConfirmOk: 'Активувати',
        trialConfirmCancel: 'Скасувати',
        trialSuccessTitle: 'Premium активовано!',
        trialSuccessMsg: 'Ваш безкоштовний місяць Premium розпочато. Насолоджуйтесь!',
        trialErrorTitle: 'Помилка',
        trialAlreadyUsed: 'Пробний місяць вже був використаний.',
        trialError: 'Не вдалося активувати пробний місяць. Спробуйте пізніше.',
        ok: 'OK',
        trialBadge: 'Пробний',
        activeBadge: 'Активна',
        features: FEATURES_UA,
      };
    }
    if (language === 'ru') {
      return {
        title: 'Premium Чайка Life',
        back: 'Назад',
        price: '39 грн / месяц',
        activeTitle: 'Ваша подписка активна',
        activeExpiry: 'Действительна до:',
        daysLeft: (n: number) => `Осталось: ${n} ${n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}`,
        expiredTitle: 'Подписка завершена',
        expiredBody: 'Ваш Premium закончился. Оформите подписку снова чтобы восстановить доступ.',
        trialButton: 'Попробовать бесплатно\nпервый месяц',
        payButton: 'Оплатить через поддержку',
        payHint: 'Свяжитесь с администратором для получения реквизитов',
        trialConfirmTitle: 'Бесплатный месяц',
        trialConfirmMsg: 'Активировать бесплатный пробный месяц Premium? Это возможно только один раз.',
        trialConfirmOk: 'Активировать',
        trialConfirmCancel: 'Отмена',
        trialSuccessTitle: 'Premium активирован!',
        trialSuccessMsg: 'Ваш бесплатный месяц Premium начат. Наслаждайтесь!',
        trialErrorTitle: 'Ошибка',
        trialAlreadyUsed: 'Пробный месяц уже был использован.',
        trialError: 'Не удалось активировать пробный месяц. Попробуйте позже.',
        ok: 'OK',
        trialBadge: 'Пробная',
        activeBadge: 'Активна',
        features: FEATURES_RU,
      };
    }
    return {
      title: 'Premium Chaika Life',
      back: 'Back',
      price: '39 UAH / month',
      activeTitle: 'Your subscription is active',
      activeExpiry: 'Valid until:',
      daysLeft: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} remaining`,
      expiredTitle: 'Subscription ended',
      expiredBody: 'Your Premium has expired. Subscribe again to restore access.',
      trialButton: 'Try free\nfor the first month',
      payButton: 'Pay via support',
      payHint: 'Contact admin for payment details',
      trialConfirmTitle: 'Free month',
      trialConfirmMsg: 'Activate a free trial month of Premium? This is available only once.',
      trialConfirmOk: 'Activate',
      trialConfirmCancel: 'Cancel',
      trialSuccessTitle: 'Premium activated!',
      trialSuccessMsg: 'Your free Premium month has started. Enjoy!',
      trialErrorTitle: 'Error',
      trialAlreadyUsed: 'Trial month has already been used.',
      trialError: 'Failed to activate trial. Please try again later.',
      ok: 'OK',
      trialBadge: 'Trial',
      activeBadge: 'Active',
      features: FEATURES_EN,
    };
  }, [language]);

  const handleTrial = useCallback(() => {
    Alert.alert(
      text.trialConfirmTitle,
      text.trialConfirmMsg,
      [
        { text: text.trialConfirmCancel, style: 'cancel' },
        {
          text: text.trialConfirmOk,
          onPress: async () => {
            setLoading(true);
            try {
              const result = await callActivateTrialPremium();
              if (result.ok) {
                dispatch(hydrateSubscription({
                  plan: 'premium',
                  status: 'trial',
                  expiresAt: result.expiresAt,
                  activatedAt: new Date().toISOString(),
                  trialUsed: true,
                  paymentMethod: 'trial',
                }));
              }
              Alert.alert(text.trialSuccessTitle, text.trialSuccessMsg, [{ text: text.ok }]);
            } catch (err: any) {
              const code = err?.code || '';
              if (code.includes('already-exists')) {
                Alert.alert(text.trialErrorTitle, text.trialAlreadyUsed, [{ text: text.ok }]);
              } else {
                Alert.alert(text.trialErrorTitle, text.trialError, [{ text: text.ok }]);
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [text, dispatch]);

  const handlePayViaSupport = useCallback(() => {
    navigation.navigate('SupportScreen', {
      initialCategory: 'payment',
      initialMessage: language === 'ua'
        ? 'Хочу оплатити Premium Чайка Life (39 грн/міс). Прошу надати реквізити.'
        : language === 'ru'
        ? 'Хочу оплатить Premium Чайка Life (39 грн/мес). Прошу предоставить реквизиты.'
        : 'I would like to pay for Premium Chaika Life (39 UAH/month). Please provide payment details.',
    } as any);
  }, [navigation, language]);

  const statusBadgeStyle = isPremium
    ? styles.statusBadgeActive
    : status === 'expired'
    ? styles.statusBadgeExpired
    : styles.statusBadgeFree;

  const statusBadgeTextStyle = isPremium
    ? styles.statusBadgeTextActive
    : status === 'expired'
    ? styles.statusBadgeTextExpired
    : styles.statusBadgeTextFree;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.terracottaDark} />
          <Text style={styles.back}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{text.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <TactileIcon icon="crown" size={58} iconSize={28} backgroundColor="#C79C47" />
          <Text style={styles.price}>{text.price}</Text>

          {isPremium && (
            <View style={[styles.statusBadge, statusBadgeStyle]}>
              <Text style={[styles.statusBadgeText, statusBadgeTextStyle]}>
                {status === 'trial' ? text.trialBadge : text.activeBadge}
              </Text>
            </View>
          )}

          {isPremium && (
            <View style={styles.activeInfo}>
              <Text style={styles.activeTitle}>{text.activeTitle}</Text>
              {expiresAt && (
                <Text style={styles.activeExpiry}>{text.activeExpiry} {formatDate(expiresAt)}</Text>
              )}
              {daysLeft !== null && (
                <Text style={styles.daysLeft}>{text.daysLeft(daysLeft)}</Text>
              )}
            </View>
          )}

          {status === 'expired' && !isPremium && (
            <View style={styles.expiredInfo}>
              <Text style={styles.expiredTitle}>{text.expiredTitle}</Text>
              <Text style={styles.expiredBody}>{text.expiredBody}</Text>
            </View>
          )}
        </View>

        {/* Features list */}
        <View style={styles.featuresCard}>
          {text.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#5C7A5C" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        {!isPremium && !trialUsed && (
          <TouchableOpacity
            style={[styles.trialButton, loading && styles.buttonDisabled]}
            activeOpacity={0.82}
            onPress={handleTrial}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF9EE" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="gift-outline" size={20} color="#FFF9EE" />
                <Text style={styles.trialButtonText}>{text.trialButton}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.payButton}
          activeOpacity={0.82}
          onPress={handlePayViaSupport}
        >
          <MaterialCommunityIcons name="credit-card-outline" size={20} color={SCREEN_THEME.terracottaDark} />
          <View style={styles.payButtonInner}>
            <Text style={styles.payButtonText}>{text.payButton}</Text>
            <Text style={styles.payButtonHint}>{text.payHint}</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
  },
  backBtn: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.appBg,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  back: { color: SCREEN_THEME.terracottaDark, fontSize: 14, fontWeight: '900' },
  title: { fontSize: 17, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  headerSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 108 },

  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 14,
    ...SCREEN_THEME.raisedShadow,
  },
  price: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '900',
    color: '#C79C47',
  },
  statusBadge: {
    marginTop: 10,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(92, 122, 92, 0.14)',
    borderColor: 'rgba(92, 122, 92, 0.30)',
  },
  statusBadgeExpired: {
    backgroundColor: 'rgba(180, 60, 60, 0.12)',
    borderColor: 'rgba(180, 60, 60, 0.28)',
  },
  statusBadgeFree: {
    backgroundColor: 'rgba(120, 100, 60, 0.10)',
    borderColor: 'rgba(120, 100, 60, 0.22)',
  },
  statusBadgeText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  statusBadgeTextActive: { color: '#3D6E3D' },
  statusBadgeTextExpired: { color: '#9B3030' },
  statusBadgeTextFree: { color: SCREEN_THEME.textSecondary },

  activeInfo: { alignItems: 'center', marginTop: 10 },
  activeTitle: { fontSize: 16, fontWeight: '900', color: '#3D6E3D', textAlign: 'center' },
  activeExpiry: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary, marginTop: 4 },
  daysLeft: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textMuted, marginTop: 2 },

  expiredInfo: { alignItems: 'center', marginTop: 10 },
  expiredTitle: { fontSize: 16, fontWeight: '900', color: '#9B3030', textAlign: 'center' },
  expiredBody: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  featuresCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 14,
    gap: 8,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textPrimary },

  trialButton: {
    backgroundColor: '#5C7A5C',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    ...SCREEN_THEME.raisedShadow,
  },
  trialButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    flex: 1,
  },
  buttonDisabled: { opacity: 0.6 },

  payButton: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 10,
  },
  payButtonInner: { flex: 1 },
  payButtonText: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.terracottaDark },
  payButtonHint: { fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textMuted, marginTop: 2 },
});
