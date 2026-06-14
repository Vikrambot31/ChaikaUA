import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
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
import { ref, get, set } from 'firebase/database';

import MiniTabBar from '../components/MiniTabBar';
import { SCREEN_THEME } from '../utils/screenTheme';
import { selectIsBusinessPlus, selectSubscriptionStatus, selectExpiresAt, selectDaysLeft } from '../redux/slices/subscriptionSlice';
import { selectUser } from '../redux/slices/authSlice';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTranslation } from '../i18n/useTranslation';
import { database } from '../firebase-core';
import { useAppTheme } from '../hooks/useAppTheme';

type Plan = 'monthly' | 'yearly';

const FEATURES_UA = [
  'Власна сторінка закладу — назва, опис, адреса, графік роботи',
  'Меню та ціни — до 20 позицій з описом',
  'Акції та знижки — до 3 активних карток одночасно',
  'Фотогалерея закладу — показуйте атмосферу та страви',
  'Видно всім користувачам Чайки — безкоштовна реклама всередині спільноти',
  'Значок "Бізнес+" виділяє вас серед звичайних оголошень',
  'Модерація адміністратором — якість і довіра гарантовані',
];

const FEATURES_RU = [
  'Собственная страница заведения — название, описание, адрес, часы работы',
  'Меню и цены — до 20 позиций с описанием',
  'Акции и скидки — до 3 активных карточек одновременно',
  'Фотогалерея заведения — показывайте атмосферу и блюда',
  'Видно всем пользователям Чайки — бесплатная реклама внутри сообщества',
  'Значок "Бизнес+" выделяет вас среди обычных объявлений',
  'Модерация администратором — качество и доверие гарантированы',
];

const FEATURES_EN = [
  'Your own venue page — name, description, address, working hours',
  'Menu & prices — up to 20 items with description',
  'Promotions & discounts — up to 3 active cards at a time',
  'Photo gallery — showcase your atmosphere and dishes',
  'Visible to all Chaika users — free advertising inside the community',
  '"Business+" badge sets you apart from regular listings',
  'Admin moderation — quality and trust guaranteed',
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export default function BusinessPlusSubscriptionScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { language } = useTranslation();

  const isBusinessPlus = useSelector(selectIsBusinessPlus);
  const status = useSelector(selectSubscriptionStatus);
  const expiresAt = useSelector(selectExpiresAt);
  const daysLeft = useSelector(selectDaysLeft);
  const currentUser = useSelector(selectUser);

  const { colors, isDark } = useAppTheme();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const [businessEmail, setBusinessEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);

  // Load existing businessEmail and pending request flag from Firebase on mount
  useEffect(() => {
    if (!currentUser?.id) return;
    get(ref(database, `users/${currentUser.id}/businessEmail`))
      .then((snap) => {
        if (snap.exists() && typeof snap.val() === 'string') {
          setBusinessEmail(snap.val());
        }
      })
      .catch(() => {});
    get(ref(database, `users/${currentUser.id}/businessPlusRequest`))
      .then((snap) => { if (snap.exists()) setPendingRequest(true); })
      .catch(() => {});
  }, [currentUser?.id]);

  const text = useMemo(() => {
    if (language === 'ua') {
      return {
        title: 'Бізнес+',
        back: 'Назад',
        subtitle: 'Розкажіть про свій заклад — меню, акції, фото',
        priceMonthly: '49 грн / місяць',
        priceYearly: '480 грн / рік',
        saveLabel: 'економія 108 грн',
        planMonthly: 'Щомісяця',
        planYearly: 'Щорічно',
        activeTitle: 'Підписка Бізнес+ активна',
        activeExpiry: 'Дійсна до:',
        daysLeft: (n: number) => `Залишилось: ${n} ${n === 1 ? 'день' : n < 5 ? 'дні' : 'днів'}`,
        expiredTitle: 'Підписка завершена',
        expiredBody: 'Ваш Бізнес+ закінчився. Оформіть підписку знову.',
        payButton: 'Оплатити через підтримку',
        payHint: "Зв'яжіться з адміном — він надасть реквізити та активує підписку",
        requiresClaimTitle: 'Потрібне підтвердження',
        requiresClaimBody: 'Спочатку подайте заявку на підтвердження власника закладу. Після схвалення — оформіть Бізнес+.',
        activeBadge: 'Активна',
        features: FEATURES_UA,
        ok: 'OK',
        emailLabel: 'Ваш робочий email',
        emailPlaceholder: 'example@company.ua',
        emailHint: 'Адмін використає цей email для зв\'язку щодо підписки',
        emailRequired: 'Будь ласка, вкажіть робочий email',
        emailInvalid: 'Введіть коректний email',
        pendingTitle: 'Заявку надіслано',
        pendingBody: 'Ваш запит на підписку Бізнес+ отримано. Адміністратор зв\'яжеться з вами найближчим часом та активує підписку.',
      };
    }
    if (language === 'ru') {
      return {
        title: 'Бизнес+',
        back: 'Назад',
        subtitle: 'Расскажите о своём заведении — меню, акции, фото',
        priceMonthly: '49 грн / месяц',
        priceYearly: '480 грн / год',
        saveLabel: 'экономия 108 грн',
        planMonthly: 'Ежемесячно',
        planYearly: 'Ежегодно',
        activeTitle: 'Подписка Бизнес+ активна',
        activeExpiry: 'Действительна до:',
        daysLeft: (n: number) => `Осталось: ${n} ${n === 1 ? 'день' : n < 5 ? 'дня' : 'дней'}`,
        expiredTitle: 'Подписка завершена',
        expiredBody: 'Ваш Бизнес+ закончился. Оформите подписку снова.',
        payButton: 'Оплатить через поддержку',
        payHint: 'Свяжитесь с администратором — он предоставит реквизиты и активирует подписку',
        requiresClaimTitle: 'Требуется подтверждение',
        requiresClaimBody: 'Сначала подайте заявку на подтверждение владельца заведения. После одобрения — оформите Бизнес+.',
        activeBadge: 'Активна',
        features: FEATURES_RU,
        ok: 'OK',
        emailLabel: 'Ваш рабочий email',
        emailPlaceholder: 'example@company.ua',
        emailHint: 'Администратор использует этот email для связи по подписке',
        emailRequired: 'Пожалуйста, укажите рабочий email',
        emailInvalid: 'Введите корректный email',
        pendingTitle: 'Заявка отправлена',
        pendingBody: 'Ваш запрос на подписку Бизнес+ получен. Администратор свяжется с вами в ближайшее время и активирует подписку.',
      };
    }
    return {
      title: 'Business+',
      back: 'Back',
      subtitle: 'Share your venue — menu, promotions, photo',
      priceMonthly: '49 UAH / month',
      priceYearly: '480 UAH / year',
      saveLabel: 'save 108 UAH',
      planMonthly: 'Monthly',
      planYearly: 'Yearly',
      activeTitle: 'Business+ subscription active',
      activeExpiry: 'Valid until:',
      daysLeft: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} remaining`,
      expiredTitle: 'Subscription ended',
      expiredBody: 'Your Business+ has expired. Subscribe again.',
      payButton: 'Pay via support',
      payHint: 'Contact admin — they will provide payment details and activate your subscription',
      requiresClaimTitle: 'Confirmation required',
      requiresClaimBody: 'First submit an ownership claim for your venue. After approval — subscribe to Business+.',
      activeBadge: 'Active',
      features: FEATURES_EN,
      ok: 'OK',
      emailLabel: 'Your work email',
      emailPlaceholder: 'example@company.com',
      emailHint: 'Admin will use this email to contact you about the subscription',
      emailRequired: 'Please enter your work email',
      emailInvalid: 'Enter a valid email address',
      pendingTitle: 'Request submitted',
      pendingBody: 'Your Business+ subscription request has been received. The administrator will contact you shortly to activate your subscription.',
    };
  }, [language]);

  const handlePayViaSupport = useCallback(async () => {
    // Validate email
    const trimmedEmail = businessEmail.trim();
    if (!trimmedEmail) {
      setEmailError(text.emailRequired);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError(text.emailInvalid);
      return;
    }
    setEmailError('');

    // Save to Firebase
    if (currentUser?.id) {
      setEmailSaving(true);
      try {
        await set(ref(database, `users/${currentUser.id}/businessEmail`), trimmedEmail);
      } catch {
        // non-blocking — proceed anyway
      } finally {
        setEmailSaving(false);
      }
    }

    const planLabel = selectedPlan === 'yearly'
      ? (language === 'ua' ? '480 грн/рік' : language === 'ru' ? '480 грн/год' : '480 UAH/year')
      : (language === 'ua' ? '49 грн/міс' : language === 'ru' ? '49 грн/мес' : '49 UAH/month');

    const message = language === 'ua'
      ? `Хочу оформити підписку Бізнес+ (${planLabel}). Email: ${trimmedEmail}. Прошу надати реквізити та активувати.`
      : language === 'ru'
      ? `Хочу оформить подписку Бизнес+ (${planLabel}). Email: ${trimmedEmail}. Прошу предоставить реквизиты и активировать.`
      : `I would like to subscribe to Business+ (${planLabel}). Email: ${trimmedEmail}. Please provide payment details.`;

    // Mark pending request so owner can't re-submit repeatedly
    if (currentUser?.id) {
      try {
        await set(ref(database, `users/${currentUser.id}/businessPlusRequest`), true);
        setPendingRequest(true);
      } catch { /* non-blocking */ }
    }

    navigation.navigate('SupportScreen', { prefillMessage: message });
  }, [navigation, language, selectedPlan, businessEmail, text, currentUser?.id]);

  const currentPrice = selectedPlan === 'yearly' ? text.priceYearly : text.priceMonthly;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.terracottaDark} />
          <Text style={styles.back}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? '#F5E8F0' : undefined }]}>{text.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="storefront" size={32} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{text.title}</Text>
          <Text style={styles.heroSubtitle}>{text.subtitle}</Text>

          {isBusinessPlus && (
            <View style={styles.activeBadge}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#3D6E3D" />
              <Text style={styles.activeBadgeText}>{text.activeBadge}</Text>
            </View>
          )}

          {isBusinessPlus && (
            <View style={styles.activeInfo}>
              <Text style={styles.activeTitle}>{text.activeTitle}</Text>
              {expiresAt ? <Text style={styles.activeExpiry}>{text.activeExpiry} {formatDate(expiresAt)}</Text> : null}
              {daysLeft !== null ? <Text style={styles.daysLeft}>{text.daysLeft(daysLeft)}</Text> : null}
            </View>
          )}

          {status === 'expired' && !isBusinessPlus && (
            <View style={styles.expiredInfo}>
              <Text style={styles.expiredTitle}>{text.expiredTitle}</Text>
              <Text style={styles.expiredBody}>{text.expiredBody}</Text>
            </View>
          )}
        </View>

        {/* Pending request card — shown after owner submits payment request */}
        {pendingRequest && !isBusinessPlus && (
          <View style={styles.pendingCard}>
            <MaterialCommunityIcons name="clock-outline" size={24} color="#7A5C1E" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.pendingTitle}>{text.pendingTitle}</Text>
              <Text style={styles.pendingBody}>{text.pendingBody}</Text>
            </View>
          </View>
        )}

        {/* Plan selector */}
        {!isBusinessPlus && !pendingRequest && (
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
        )}

        {/* Features list */}
        <View style={styles.featuresCard}>
          {text.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#5C7A5C" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Work email input */}
        {!isBusinessPlus && !pendingRequest && (
          <View style={styles.emailCard}>
            <View style={styles.emailLabelRow}>
              <MaterialCommunityIcons name="email-outline" size={16} color="#7A1E5C" />
              <Text style={styles.emailLabel}>{text.emailLabel}</Text>
            </View>
            <TextInput
              style={[styles.emailInput, emailError ? styles.emailInputError : null]}
              value={businessEmail}
              onChangeText={(v) => { setBusinessEmail(v); if (emailError) setEmailError(''); }}
              placeholder={text.emailPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {emailError ? (
              <Text style={styles.emailErrorText}>{emailError}</Text>
            ) : (
              <Text style={styles.emailHint}>{text.emailHint}</Text>
            )}
          </View>
        )}

        {/* Pay button */}
        {!isBusinessPlus && !pendingRequest && (
          <TouchableOpacity
            style={[styles.payButton, emailSaving && styles.payButtonDisabled]}
            activeOpacity={0.82}
            onPress={() => { void handlePayViaSupport(); }}
            disabled={emailSaving}
          >
            <MaterialCommunityIcons name="credit-card-outline" size={22} color="#fff" />
            <View style={styles.payButtonInner}>
              <Text style={styles.payButtonText}>{text.payButton}</Text>
              <Text style={styles.payButtonPrice}>{currentPrice}</Text>
              <Text style={styles.payButtonHint}>{text.payHint}</Text>
            </View>
          </TouchableOpacity>
        )}

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
  content: { padding: 16, paddingBottom: 108, gap: 14 },

  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    ...SCREEN_THEME.raisedShadow,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#7A1E5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { marginTop: 12, fontSize: 24, fontWeight: '900', color: '#7A1E5C' },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(92,122,92,0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(92,122,92,0.28)',
  },
  activeBadgeText: { fontSize: 12, fontWeight: '900', color: '#3D6E3D', textTransform: 'uppercase' },
  activeInfo: { alignItems: 'center', marginTop: 10 },
  activeTitle: { fontSize: 16, fontWeight: '900', color: '#3D6E3D', textAlign: 'center' },
  activeExpiry: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary, marginTop: 4 },
  daysLeft: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textMuted, marginTop: 2 },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8C87A',
    padding: 16,
    marginBottom: 16,
  },
  pendingTitle: { fontSize: 15, fontWeight: '900', color: '#7A5C1E' },
  pendingBody: { fontSize: 13, fontWeight: '600', color: '#8A7A5A', lineHeight: 19 },
  expiredInfo: { alignItems: 'center', marginTop: 10 },
  expiredTitle: { fontSize: 16, fontWeight: '900', color: '#9B3030', textAlign: 'center' },
  expiredBody: {
    fontSize: 13, fontWeight: '700', color: SCREEN_THEME.textSecondary,
    textAlign: 'center', marginTop: 6, lineHeight: 18,
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
    borderColor: '#7A1E5C',
    backgroundColor: '#FDF5FA',
  },
  planYearlyTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  planLabel: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  planLabelActive: { color: '#7A1E5C' },
  planPrice: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  planPriceActive: { color: '#7A1E5C' },
  saveBadge: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  featuresCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 10,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureText: { flex: 1, fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textPrimary, lineHeight: 20 },

  payButton: {
    backgroundColor: '#7A1E5C',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...SCREEN_THEME.raisedShadow,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonInner: { flex: 1 },
  payButtonText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  payButtonPrice: { fontSize: 14, fontWeight: '900', color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  payButtonHint: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.65)', marginTop: 4, lineHeight: 17 },

  emailCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  emailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emailLabel: { fontSize: 14, fontWeight: '800', color: '#7A1E5C' },
  emailInput: {
    backgroundColor: SCREEN_THEME.appBg,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D4B896',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '600',
  },
  emailInputError: { borderColor: '#C62828' },
  emailErrorText: { fontSize: 12, fontWeight: '700', color: '#C62828' },
  emailHint: { fontSize: 12, fontWeight: '600', color: SCREEN_THEME.textMuted, lineHeight: 16 },
});
