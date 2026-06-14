import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useTrainingMode } from '../hooks/useTrainingMode';
import TrainingHint from '../components/TrainingHint';
import HintBadge, { HINT_BADGE_LABELS } from '../components/HintBadge';
import BetaAgreementModal from '../components/BetaAgreementModal';
import { useAppTheme } from '../hooks/useAppTheme';

const BETA_AGREEMENT_KEY = '@chaika:beta_agreement_accepted_v1';

type Plan = 'monthly' | 'yearly';

const FEATURES_UA = [
  'Люди Чайки — повний доступ до анкет',
  'Більше оголошень — до 5 одночасно',
  'Більше заявок — до 6 активних',
  'Більше фото — до 10 завантажень на день',
  'Бонуси x1.5 за активність',
  'Пріоритетна підтримка',
];

const FEATURES_RU = [
  'Люди Чайки — полный доступ к анкетам',
  'Больше объявлений — до 5 одновременно',
  'Больше заявок — до 6 активных',
  'Больше фото — до 10 загрузок в день',
  'Бонусы x1.5 за активность',
  'Приоритетная поддержка',
];

const FEATURES_EN = [
  'Chaika People — full profile access',
  'More listings — up to 5 at a time',
  'More requests — up to 6 active',
  'More photos — up to 10 uploads per day',
  'Bonuses x1.5 for activity',
  'Priority support',
];

const BIZ_FEATURES_UA = [
  'Сторінка закладу з меню та цінами',
  'Акції та знижки — до 3 карток',
  'Фотогалерея вашого бізнесу',
  'Видимість для всіх користувачів Чайки',
  'Значок "Бізнес+" на картці закладу',
  'Модерація перед публікацією',
];

const BIZ_FEATURES_RU = [
  'Страница заведения с меню и ценами',
  'Акции и скидки — до 3 карточек',
  'Фотогалерея вашего бизнеса',
  'Видимость для всех пользователей Чайки',
  'Значок "Бизнес+" на карточке заведения',
  'Модерация перед публикацией',
];

const BIZ_FEATURES_EN = [
  'Venue page with menu & prices',
  'Promotions & discounts — up to 3 cards',
  'Business photo gallery',
  'Visible to all Chaika users',
  '"Business+" badge on venue card',
  'Moderator review before publishing',
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const TRAINING_HINT: Record<string, string> = {
  ua: 'Обери тариф: місяць або рік. Натисни Активувати для пробного періоду.',
  ru: 'Выбери тариф: месяц или год. Нажми Активировать для пробного периода.',
  en: 'Pick a plan: monthly or yearly. Tap Activate to start a free trial.',
};

export default function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const dispatch = useDispatch();
  const { language } = useTranslation();
  const training = useTrainingMode('podpiska_premium');

  const isPremium = useSelector(selectIsPremium);
  const status = useSelector(selectSubscriptionStatus);
  const expiresAt = useSelector(selectExpiresAt);
  const daysLeft = useSelector(selectDaysLeft);
  const trialUsed = useSelector(selectTrialUsed);

  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const isSubmitting = useRef(false);
  const [agreementVisible, setAgreementVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BETA_AGREEMENT_KEY).then((value) => {
      if (value !== 'true') {
        setAgreementVisible(true);
      }
    });
  }, []);

  const handleAgreementAccept = useCallback(() => {
    AsyncStorage.setItem(BETA_AGREEMENT_KEY, 'true');
    setAgreementVisible(false);
  }, []);

  const text = useMemo(() => {
    if (language === 'ua') {
      return {
        title: 'Premium Чайка Life',
        back: 'Назад',
        priceMonthly: '39 грн / місяць',
        priceYearly: '390 грн / рік',
        saveLabel: 'економія 78 грн',
        planMonthly: 'Щомісяця',
        planYearly: 'Щорічно',
        sectionPlans: 'Оберіть план',
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
        bizTitle: 'Маєте свій бізнес?',
        bizSubtitle: 'Пакет Бізнес+ — для кафе, магазинів та послуг',
        bizPrice: '49 грн / місяць',
        bizPriceYear: '480 грн / рік',
        bizButton: 'Детальніше про Бізнес+',
        bizFeatures: BIZ_FEATURES_UA,
      };
    }
    if (language === 'ru') {
      return {
        title: 'Premium Чайка Life',
        back: 'Назад',
        priceMonthly: '39 грн / месяц',
        priceYearly: '390 грн / год',
        saveLabel: 'экономия 78 грн',
        planMonthly: 'Ежемесячно',
        planYearly: 'Ежегодно',
        sectionPlans: 'Выберите план',
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
        bizTitle: 'Есть свой бизнес?',
        bizSubtitle: 'Пакет Бизнес+ — для кафе, магазинов и услуг',
        bizPrice: '49 грн / месяц',
        bizPriceYear: '480 грн / год',
        bizButton: 'Подробнее о Бизнес+',
        bizFeatures: BIZ_FEATURES_RU,
      };
    }
    return {
      title: 'Premium Chaika Life',
      back: 'Back',
      priceMonthly: '39 UAH / month',
      priceYearly: '390 UAH / year',
      saveLabel: 'save 78 UAH',
      planMonthly: 'Monthly',
      planYearly: 'Yearly',
      sectionPlans: 'Choose a plan',
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
      bizTitle: 'Have your own business?',
      bizSubtitle: 'Business+ package — for cafes, shops & services',
      bizPrice: '49 UAH / month',
      bizPriceYear: '480 UAH / year',
      bizButton: 'Learn more about Business+',
      bizFeatures: BIZ_FEATURES_EN,
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
            if (isSubmitting.current) return;
            isSubmitting.current = true;
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
                Alert.alert(text.trialSuccessTitle, text.trialSuccessMsg, [{ text: text.ok }]);
              } else {
                Alert.alert(text.trialErrorTitle, text.trialError, [{ text: text.ok }]);
              }
            } catch (err: any) {
              const code = err?.code || '';
              if (code.includes('already-exists')) {
                Alert.alert(text.trialErrorTitle, text.trialAlreadyUsed, [{ text: text.ok }]);
              } else {
                Alert.alert(text.trialErrorTitle, text.trialError, [{ text: text.ok }]);
              }
            } finally {
              isSubmitting.current = false;
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [text, dispatch]);

  const handlePayViaSupport = useCallback(() => {
    const planLabel = selectedPlan === 'yearly'
      ? (language === 'ua' ? '390 грн/рік' : language === 'ru' ? '390 грн/год' : '390 UAH/year')
      : (language === 'ua' ? '39 грн/міс' : language === 'ru' ? '39 грн/мес' : '39 UAH/month');

    navigation.navigate('SupportScreen', {
      initialCategory: 'payment',
      initialMessage: language === 'ua'
        ? `Хочу оплатити Premium Чайка Life (${planLabel}). Прошу надати реквізити.`
        : language === 'ru'
        ? `Хочу оплатить Premium Чайка Life (${planLabel}). Прошу предоставить реквизиты.`
        : `I would like to pay for Premium Chaika Life (${planLabel}). Please provide payment details.`,
    } as any);
  }, [navigation, language, selectedPlan]);

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

  const currentPrice = selectedPlan === 'yearly' ? text.priceYearly : text.priceMonthly;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.terracottaDark} />
          <Text style={styles.back}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? '#F5E8F0' : undefined }]}>{text.title}</Text>
        <HintBadge
          visible={training.isVisible}
          onTap={training.openHint}
          onDismiss={training.dismiss}
          label={HINT_BADGE_LABELS[language]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <TactileIcon icon="crown" size={58} iconSize={28} backgroundColor="#C79C47" />
          <Text style={styles.price}>{currentPrice}</Text>

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

        {/* Plan selector — shown only when not active */}
        {!isPremium && (
          <>
            <Text style={styles.sectionLabel}>{text.sectionPlans}</Text>
            <View style={styles.planSelector}>
              <TouchableOpacity
                style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionActive]}
                onPress={() => setSelectedPlan('monthly')}
                activeOpacity={0.82}
              >
                <Text style={[styles.planLabel, selectedPlan === 'monthly' && styles.planLabelActive]}>
                  {text.planMonthly}
                </Text>
                <Text style={[styles.planPrice, selectedPlan === 'monthly' && styles.planPriceActive]}>
                  {text.priceMonthly}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planOption, selectedPlan === 'yearly' && styles.planOptionActive]}
                onPress={() => setSelectedPlan('yearly')}
                activeOpacity={0.82}
              >
                <View style={styles.planYearlyTop}>
                  <Text style={[styles.planLabel, selectedPlan === 'yearly' && styles.planLabelActive]}>
                    {text.planYearly}
                  </Text>
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>{text.saveLabel}</Text>
                  </View>
                </View>
                <Text style={[styles.planPrice, selectedPlan === 'yearly' && styles.planPriceActive]}>
                  {text.priceYearly}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Action buttons */}
        {!isPremium && !trialUsed && (
          <TouchableOpacity
            style={[styles.trialButton, loading && styles.buttonDisabled]}
            activeOpacity={0.82}
            onPress={handleTrial}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FBF8FD" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="gift-outline" size={20} color="#FBF8FD" />
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

        {/* Business+ promo block */}
        <View style={styles.bizCard}>
          <View style={styles.bizCardHeader}>
            <View style={styles.bizIcon}>
              <MaterialCommunityIcons name="storefront" size={22} color="#7A1E5C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bizTitle}>{text.bizTitle}</Text>
              <Text style={styles.bizSubtitle}>{text.bizSubtitle}</Text>
            </View>
          </View>

          <View style={styles.bizPriceRow}>
            <View style={styles.bizPricePill}>
              <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#FBF8FD" />
              <Text style={styles.bizPriceText}>{text.bizPrice}</Text>
            </View>
            <View style={styles.bizPricePill}>
              <MaterialCommunityIcons name="calendar-star" size={13} color="#FBF8FD" />
              <Text style={styles.bizPriceText}>{text.bizPriceYear}</Text>
            </View>
          </View>

          <View style={styles.bizDivider} />

          {text.bizFeatures.map((f, i) => (
            <View key={i} style={styles.bizFeatureRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color="#FBF8FD" />
              <Text style={styles.bizFeatureText}>{f}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.bizButton}
            activeOpacity={0.82}
            onPress={() => navigation.navigate('BusinessPlusSubscriptionScreen', undefined as any)}
          >
            <Text style={styles.bizButtonText}>{text.bizButton}</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#FBF8FD" />
          </TouchableOpacity>
        </View>

      </ScrollView>
      <MiniTabBar />
      {training.showHint && (
        <TrainingHint text={TRAINING_HINT[language] ?? TRAINING_HINT.ua} onDismiss={training.closeHint} />
      )}
      <BetaAgreementModal
        visible={agreementVisible}
        language={language as 'ua' | 'ru' | 'en'}
        onAccept={handleAgreementAccept}
      />
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
  content: { padding: 16, paddingBottom: 108, gap: 14 },

  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
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
    gap: 8,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textPrimary },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -4,
  },

  planSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  planOption: {
    flex: 1,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: '#E0D4C8',
    gap: 4,
  },
  planOptionActive: {
    borderColor: '#C79C47',
    backgroundColor: '#FFFBF2',
  },
  planYearlyTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  planLabel: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  planLabelActive: { color: '#A07830' },
  planPrice: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  planPriceActive: { color: '#C79C47' },
  saveBadge: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  trialButton: {
    backgroundColor: '#5C7A5C',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SCREEN_THEME.raisedShadow,
  },
  trialButtonText: {
    color: '#FBF8FD',
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
  },
  payButtonInner: { flex: 1 },
  payButtonText: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.terracottaDark },
  payButtonHint: { fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textMuted, marginTop: 2 },

  // Business+ promo card
  bizCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#6A1A4E',
    gap: 10,
  },
  bizCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bizIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizTitle: { fontSize: 16, fontWeight: '900', color: '#FBF8FD' },
  bizSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    lineHeight: 17,
  },
  bizPriceRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  bizPricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bizPriceText: { fontSize: 13, fontWeight: '900', color: '#FBF8FD' },
  bizDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 2,
  },
  bizFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bizFeatureText: { flex: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  bizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bizButtonText: { fontSize: 14, fontWeight: '900', color: '#FBF8FD' },
});
