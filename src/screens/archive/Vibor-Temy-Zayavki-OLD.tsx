import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../redux/slices/authSlice';
import { selectIsPremium, selectIsPremiumPlus } from '../redux/slices/subscriptionSlice';

const PRIMARY = '#7A1E5C';
const GOLD = '#CFA060';

// в"Ђв"Ђв"Ђ Всі типи заявок в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
type TopicItem = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  desc: string;
  screen: string;
  color: string;
  shadowColor: string;
  authRequired?: boolean;
  premiumRequired?: 'premium' | 'premium_plus';
  isNew?: boolean;
  elevated?: boolean; // великий блок
};

const TOPICS: TopicItem[] = [
  // Головна - велика червона
  {
    icon: 'hand-heart',
    label: '🆘 ДОПОМОГА!',
    desc: 'Термінові прохання мешканців',
    screen: 'HelpNeighborsScreen',
    color: '#E53935',
    shadowColor: '#B71C1C',
    elevated: true,
  },
  // Основні заявки
  {
    icon: 'briefcase-search',
    label: 'Пошук роботи',
    desc: 'Вакансії та резюме у ЖК',
    screen: 'JobSearchScreen',
    color: PRIMARY,
    shadowColor: '#5A1545',
    elevated: true,
    authRequired: true,
  },
  {
    icon: 'shopping-outline',
    label: 'Куплю / Продам',
    desc: 'Оголошення купівлі-продажу',
    screen: 'BuySellScreen',
    color: PRIMARY,
    shadowColor: '#5A1545',
    elevated: true,
    authRequired: true,
  },
  // Проблеми ЖК
  {
    icon: 'alert-circle-outline',
    label: ' >7:070B8 про проблему на Чайках',
    desc: 'Повідомити про проблему у ЖК',
    screen: 'ChaikaProblemsScreen',
    color: PRIMARY,
    shadowColor: '#5A1545',
  },
  {
    icon: 'lightning-bolt',
    label: ' >7:070B8 стан !2VB;0 в домі',
    desc: 'Є чи нема електрики у вас',
    screen: 'ElectricityStatusScreen',
    color: PRIMARY,
    shadowColor: '#5A1545',
  },
  // Premium функції
  {
    icon: 'coffee',
    label: '☕ Кава і Знайомства',
    desc: 'Знайомства з мешканцями ЖК',
    screen: 'CoffeeScreen',
    color: '#F57C00',
    shadowColor: '#E65100',
    premiumRequired: 'premium_plus',
    isNew: true,
  },
  {
    icon: 'home-city',
    label: '🏆  59B8=3 будинків',
    desc: 'Оцінка якості обслуговування',
    screen: 'RatingScreen',
    color: '#7B1FA2',
    shadowColor: '#4A148C',
    premiumRequired: 'premium',
    isNew: true,
  },
  // Оголошення
  {
    icon: 'bullhorn-outline',
    label: 'Оголошення',
    desc: 'Загальні оголошення ЖК',
    screen: 'AnnouncementsScreen',
    color: PRIMARY,
    shadowColor: '#5A1545',
  },
  // Архіви та історія
  {
    icon: 'history',
    label: 'Архів заявок',
    desc: 'Всі заявки чату (Archive)',
    screen: 'HelpHistoryScreen',
    color: '#546E7A',
    shadowColor: '#37474F',
  },
];

// в"Ђв"Ђв"Ђ Компонент >4=VTW кнопки в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
function TopicButton({ item, onPress }: { item: TopicItem; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[
        styles.topicBtn,
        item.elevated && styles.topicBtnElevated,
        { backgroundColor: item.color, shadowColor: item.shadowColor },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Р"Р»СЏРЅРµС†СЊ */}
      <View style={styles.btnGloss} />

      <View style={styles.topicBtnInner}>
        <View style={styles.topicIconBox}>
          <MaterialCommunityIcons name={item.icon} size={item.elevated ? 26 : 22} color="#fff" />
        </View>
        <View style={styles.topicTextBox}>
          <Text style={[styles.topicLabel, item.elevated && styles.topicLabelBig]}>
            {item.label}
          </Text>
          <Text style={styles.topicDesc}>{item.desc}</Text>
        </View>
        <View style={styles.topicRight}>
          {item.authRequired && (
            <MaterialCommunityIcons name="lock-outline" size={14} color="rgba(255,255,255,0.6)" />
          )}
          {item.premiumRequired === 'premium_plus' && (
            <Text style={styles.premiumBadge}>рџ''+</Text>
          )}
          {item.premiumRequired === 'premium' && (
            <Text style={styles.premiumBadge}>в­ђ</Text>
          )}
          {item.isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// в"Ђв"Ђв"Ђ Головний екран в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
export default function RequestTopicScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isPremium = useSelector(selectIsPremium);
  const isPremiumPlus = useSelector(selectIsPremiumPlus);

  const handlePress = (item: TopicItem) => {
    if (item.authRequired && !isAuthenticated) {
      navigation.navigate('LoginScreen');
      return;
    }
    if (item.premiumRequired === 'premium_plus' && !isPremiumPlus) {
      navigation.navigate('SubscriptionScreen');
      return;
    }
    if (item.premiumRequired === 'premium' && !isPremium) {
      navigation.navigate('SubscriptionScreen');
      return;
    }
    navigation.navigate(item.screen);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* РЁР°РїРєР° */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={24} color="#fff" />
        <Text style={styles.headerTitle}>Р'РР'Р РђРўР РўР•РњРЈ Р—РђРЇР'РљР</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* РџС–РґРєР°Р·РєР° */}
        <View style={styles.hintCard}>
          <MaterialCommunityIcons name="information-outline" size={18} color={PRIMARY} />
          <Text style={styles.hintText}>
            РћР±РµСЂС–С‚СЊ С‚РёРї Р·Р°СЏРІРєРё Р°Р±Рѕ РїСЂРѕС…Р°РЅРЅСЏ, СЏРєРµ С…РѕС‡РµС‚Рµ РЅР°РґС–СЃР»Р°С‚Рё РјРµС€РєР°РЅС†СЏРј Р–Рљ Р§Р°Р№РєР°
          </Text>
        </View>

        {/* !5:FVO: РўРµСЂРјС–РЅРѕРІС– */}
        <Text style={styles.sectionTitle}>рџ"ґ РўРµСЂРјС–РЅРѕРІС–</Text>
        {TOPICS.filter((t) => t.elevated).map((item) => (
          <TopicButton key={item.label} item={item} onPress={() => handlePress(item)} />
        ))}

        {/* !5:FVO: РџСЂРѕР±Р»РµРјРё С‚Р° СЃС‚Р°РЅ */}
        <Text style={styles.sectionTitle}>РІС™В пёЏ РџСЂРѕР±Р»РµРјРё С‚Р° СЃС‚Р°РЅ</Text>
        {TOPICS.filter((t) => ['ChaikaProblemsScreen', 'ElectricityStatusScreen'].includes(t.screen)).map((item) => (
          <TopicButton key={item.label} item={item} onPress={() => handlePress(item)} />
        ))}

        {/* !5:FVO: РћРіРѕР»РѕС€РµРЅРЅСЏ */}
        <Text style={styles.sectionTitle}>рџ"ў РћРіРѕР»РѕС€РµРЅРЅСЏ С‚Р° Р°СЂС…С–РІ</Text>
        {TOPICS.filter((t) =>
          ['AnnouncementsScreen', 'HelpHistoryScreen'].includes(t.screen)
        ).map((item) => (
          <TopicButton key={item.label} item={item} onPress={() => handlePress(item)} />
        ))}

        {/* !5:FVO: Premium */}
        <Text style={styles.sectionTitle}>рџ'Ћ Premium функції</Text>
        <View style={styles.premiumBanner}>
          <Text style={styles.premiumBannerText}>
            в­ђ РџСЂРµРјС–СѓРј вЂ" $1/РјС–СЃ В· рџ'' РџСЂРµРјС–СѓРј+ вЂ" $4/РјС–СЃ
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SubscriptionScreen')}
            style={styles.premiumBannerBtn}
          >
            <Text style={styles.premiumBannerBtnText}>РџРµСЂРµРіР»СЏРЅСѓС‚Рё в†'</Text>
          </TouchableOpacity>
        </View>
        {TOPICS.filter((t) => !!t.premiumRequired).map((item) => (
          <TopicButton key={item.label} item={item} onPress={() => handlePress(item)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// в"Ђв"Ђв"Ђ !B8;V в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },

  header: {
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
    elevation: 4,
    shadowColor: PRIMARY,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  headerTitle: {
    color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5,
  },

  scroll: { padding: 14, paddingBottom: 32 },

  hintCard: {
    backgroundColor: '#F3E5F5',
    borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: PRIMARY,
  },
  hintText: { flex: 1, fontSize: 12, color: '#555', lineHeight: 16 },

  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: '#555',
    marginBottom: 8, marginTop: 6, paddingLeft: 2,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  // Кнопка теми
  topicBtn: {
    borderRadius: 14,
    marginBottom: 8,
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  topicBtnElevated: {
    borderRadius: 16,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    marginBottom: 10,
  },
  // Глянець
  btnGloss: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  topicBtnInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  topicIconBox: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  topicTextBox: { flex: 1 },
  topicLabel: {
    color: '#fff', fontWeight: '800', fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  topicLabelBig: { fontSize: 16 },
  topicDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  topicRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Бейджики
  premiumBadge: { fontSize: 13 },
  newBadge: {
    backgroundColor: GOLD, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  newBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },

  // Premium banner
  premiumBanner: {
    backgroundColor: '#EDE7F6', borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#7B1FA2',
  },
  premiumBannerText: { fontSize: 12, fontWeight: '700', color: '#4527A0', flex: 1 },
  premiumBannerBtn: {
    backgroundColor: '#7B1FA2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8,
  },
  premiumBannerBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});


