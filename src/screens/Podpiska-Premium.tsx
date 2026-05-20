import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import {
  checkExpiry,
  hydrateSubscription,
  selectPlan as selectCurrentPlan,
  SubscriptionPlan,
  cancelServerSubscription,
  fetchServerSubscription,
  tryActivateFreePremium,
} from '../redux/slices/subscriptionSlice';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import PremiumPromoNotice from '../components/PremiumPromoNotice';

const PLANS: Array<{ id: SubscriptionPlan; color: string }> = [
  { id: 'free', color: '#607D8B' },
  { id: 'premium', color: SCREEN_THEME.terracotta },
  { id: 'premium_plus', color: '#C79C47' },
];

export default function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const dispatch = useDispatch();
  const currentPlan = useSelector(selectCurrentPlan);
  const { language } = useTranslation();
  const [showPromoNotice, setShowPromoNotice] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    dispatch(checkExpiry());
    setShowPromoNotice(true);
    fetchServerSubscription()
      .then((subscription) => {
        dispatch(hydrateSubscription(subscription));
      })
      .catch(() => {});
    const timer = setTimeout(() => setIsSyncing(false), 900);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = useMemo(() => {
    if (language === 'ua') {
      return {
        title: 'Підписка',
        back: 'Назад',
        syncing: 'Оновлюємо статус підписки...',
        active: 'Поточний план',
        until: 'Діє до',
        untilMessage: 'Пакети підписок "Преміум" і "Преміум+" діють безкоштовно для перших 500 користувачів у застосунку. Встигни розповісти друзям!',
        choose: 'Оберіть тариф',
        free: 'Безкоштовно',
        premium: 'Преміум',
        premiumPlus: 'Преміум+',
        save: 'Підключити',
        connected: 'Підключено',
        cancelTitle: 'Скасувати підписку?',
        cancelText: 'Ви перейдете на безкоштовний план.',
        cancel: 'Скасувати',
        confirm: 'Підтвердити',
        freePremium500: 'Безкоштовно (перші 500)',
        limitTitle: 'Ліміт вичерпано',
        limitText: 'Безкоштовні преміум-місця закінчилися',
      };
    }
    if (language === 'ru') {
      return {
        title: 'Подписка',
        back: 'Назад',
        syncing: 'Обновляем статус подписки...',
        active: 'Текущий план',
        until: 'Действует до',
        untilMessage: 'Пакеты подписок "Премиум" и "Премиум+" действуют бесплатно до первых 500 пользователей в приложении. Успей рассказать друзьям!',
        choose: 'Выберите тариф',
        free: 'Бесплатно',
        premium: 'Премиум',
        premiumPlus: 'Премиум+',
        save: 'Подключить',
        connected: 'Подключено',
        cancelTitle: 'Отключить подписку?',
        cancelText: 'Вы перейдете на бесплатный план.',
        cancel: 'Отмена',
        confirm: 'Подтвердить',
        freePremium500: 'Бесплатно (первые 500)',
        limitTitle: 'Лимит исчерпан',
        limitText: 'Бесплатные премиум-места закончились',
      };
    }
    // default to English
    return {
      title: 'Subscription',
      back: 'Back',
      syncing: 'Refreshing subscription status...',
      active: 'Current plan',
      until: 'Promo status',
      untilMessage: 'Premium and Premium+ currently work only as a promo preview for the first 500 users. Real card billing is not enabled on this screen yet.',
      choose: 'Choose a promo plan',
      free: 'Free',
      premium: 'Premium Preview',
      premiumPlus: 'Premium+ Preview',
      save: 'Activate promo',
      connected: 'Active',
      cancelTitle: 'Disable promo access?',
      cancelText: 'You will switch to Free.',
      cancel: 'Cancel',
      confirm: 'Confirm',
      freePremium500: 'Free promo (first 500)',
      limitTitle: 'Limit reached',
      limitText: 'Free promo spots are gone',
    };
  }, [language]);

  const planName = (plan: SubscriptionPlan) => {
    if (plan === 'free') return text.free;
    if (plan === 'premium') return text.premium;
    return text.premiumPlus;
  };

  const promoNote = language === 'en'
    ? 'This screen does not run real card payments. Premium access is granted only from the server as a limited promo slot.'
    : language === 'ru'
      ? 'Оплата картой здесь не запускается: Premium активируется только как бесплатное промо-место, подтвержденное Firebase.'
      : 'Оплата карткою тут не запускається: Premium активується лише як безкоштовне промо-місце, підтверджене Firebase.';

  const selectPlan = async (plan: SubscriptionPlan) => {
    if (plan === currentPlan) return;
    if (plan === 'free') {
      Alert.alert(text.cancelTitle, text.cancelText, [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.confirm, onPress: () => {
            cancelServerSubscription()
              .then((subscription) => {
                dispatch(hydrateSubscription(subscription));
              })
              .catch(() => {});
          },
        },
      ]);
      return;
    }
    const success = await tryActivateFreePremium(plan);
    if (success) {
      const subscription = await fetchServerSubscription().catch(() => null);
      if (subscription) {
        dispatch(hydrateSubscription(subscription));
      }
    } else {
      Alert.alert(text.limitTitle, text.limitText);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <PremiumPromoNotice visible={showPromoNotice} onClose={() => setShowPromoNotice(false)} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ {text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{text.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isSyncing ? (
          <View style={styles.syncCard}>
            <ActivityIndicator size="small" color={SCREEN_THEME.terracottaDark} />
            <Text style={styles.syncText}>{text.syncing}</Text>
          </View>
        ) : null}
        <View style={styles.activeCard}>
          <Text style={styles.activeLabel}>
            {text.active}: {planName(currentPlan)}
          </Text>
          <Text style={styles.activeSub}>
            {text.until} - {text.untilMessage}
          </Text>
        </View>

        <Text style={styles.section}>{text.choose}</Text>
        <Text style={styles.promoNote}>{promoNote}</Text>
        {PLANS.map((plan) => {
          const active = currentPlan === plan.id;
          return (
            <View key={plan.id} style={styles.card}>
              <View style={styles.planRow}>
                <TactileIcon icon="diamond-stone" size={48} iconSize={22} backgroundColor={plan.color} />
                <View style={styles.planCopy}>
                  <Text style={[styles.planName, { color: plan.color }]}>{planName(plan.id)}</Text>
                  <Text style={styles.price}>{plan.id === 'free' ? '$0' : text.freePremium500}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: active ? '#9E9E9E' : plan.color }]}
                disabled={active}
                onPress={() => selectPlan(plan.id)}
              >
                <Text style={styles.buttonText}>{active ? text.connected : text.save}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
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
  back: { color: SCREEN_THEME.terracottaDark, fontSize: 20, fontWeight: '800' },
  backBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.appBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  title: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  content: { padding: 16, paddingBottom: 108 },
  syncCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  syncText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  activeCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  activeLabel: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 10 },
  activeSub: { marginTop: 4, color: SCREEN_THEME.textSecondary },
  section: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 8 },
  promoNote: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  planRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  planCopy: { marginLeft: 12, flex: 1 },
  planName: { fontSize: 18, fontWeight: '900' },
  price: { marginTop: 4, color: SCREEN_THEME.textSecondary },
  button: { borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
