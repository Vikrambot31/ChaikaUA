import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';

export default function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { language } = useTranslation();

  const text = useMemo(() => {
    if (language === 'ua') {
      return {
        title: 'Підписка',
        back: 'Назад',
        badge: 'Зараз безкоштовно',
        headline: 'Усі основні можливості відкриті без оплати',
        body: 'Платні тарифи поки не підключені. Коли вони зʼявляться, ми додамо просте пояснення і не будемо вмикати оплату без зрозумілої кнопки підтвердження.',
        freeTitle: 'Безкоштовний доступ',
        freeText: 'Можна користуватися сервісами, заявками, картою, профілем і спільнотою.',
        premiumTitle: 'Premium',
        premiumText: 'Пізніше тут можуть зʼявитися додаткові можливості. Зараз вони не списують гроші і не потребують активації.',
        notice: 'На цьому екрані немає оплати, промо-активації або запитів до Firebase.',
      };
    }
    if (language === 'ru') {
      return {
        title: 'Подписка',
        back: 'Назад',
        badge: 'Сейчас бесплатно',
        headline: 'Все основные возможности открыты без оплаты',
        body: 'Платные тарифы пока не подключены. Когда они появятся, мы добавим простое объяснение и не будем включать оплату без понятной кнопки подтверждения.',
        freeTitle: 'Бесплатный доступ',
        freeText: 'Можно пользоваться сервисами, заявками, картой, профилем и сообществом.',
        premiumTitle: 'Premium',
        premiumText: 'Позже здесь могут появиться дополнительные возможности. Сейчас они не списывают деньги и не требуют активации.',
        notice: 'На этом экране нет оплаты, промо-активации или запросов к Firebase.',
      };
    }
    return {
      title: 'Subscription',
      back: 'Back',
      badge: 'Free for now',
      headline: 'All core features are available without payment',
      body: 'Paid plans are not connected yet. When they appear, this screen will explain them clearly and payment will require an explicit confirmation button.',
      freeTitle: 'Free access',
      freeText: 'You can use services, requests, map, profile, and community features.',
      premiumTitle: 'Premium',
      premiumText: 'Extra features may appear here later. For now, nothing charges money or requires activation.',
      notice: 'This screen does not start payments, promo activation, or Firebase requests.',
    };
  }, [language]);

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
        <View style={styles.heroCard}>
          <TactileIcon icon="crown-outline" size={58} iconSize={28} backgroundColor="#403933" />
          <Text style={styles.badge}>{text.badge}</Text>
          <Text style={styles.headline}>{text.headline}</Text>
          <Text style={styles.body}>{text.body}</Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <TactileIcon icon="check-circle-outline" size={44} iconSize={21} backgroundColor="#5C7A5C" />
            <View style={styles.planCopy}>
              <Text style={styles.planTitle}>{text.freeTitle}</Text>
              <Text style={styles.planText}>{text.freeText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <TactileIcon icon="diamond-stone" size={44} iconSize={21} backgroundColor="#C79C47" />
            <View style={styles.planCopy}>
              <Text style={styles.planTitle}>{text.premiumTitle}</Text>
              <Text style={styles.planText}>{text.premiumText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.noticeCard}>
          <MaterialCommunityIcons name="shield-check-outline" size={22} color="#4E5F43" />
          <Text style={styles.noticeText}>{text.notice}</Text>
        </View>
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
  title: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  headerSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 108 },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 14,
    ...SCREEN_THEME.raisedShadow,
  },
  badge: {
    marginTop: 14,
    color: '#5C7A5C',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headline: {
    marginTop: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 10,
  },
  planHeader: { flexDirection: 'row', alignItems: 'center' },
  planCopy: { flex: 1, marginLeft: 12 },
  planTitle: { color: SCREEN_THEME.textPrimary, fontSize: 16, fontWeight: '900' },
  planText: { color: SCREEN_THEME.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(92, 122, 92, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(92, 122, 92, 0.22)',
    padding: 13,
  },
  noticeText: { flex: 1, color: SCREEN_THEME.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
