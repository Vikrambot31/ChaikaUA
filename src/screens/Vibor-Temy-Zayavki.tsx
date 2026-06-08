import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { safeNavigate } from '../utils/safeNavigation';
import { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { selectTodayHelpRequests } from '../redux/slices/helpRequestsSlice';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import type { HelpRequest } from '../types/app';
import { jobService, type JobListing } from '../services/jobService';
import { database } from '../firebase-core';
import type { User } from '../types/app';

type TopicItem = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  desc: string;
  screen: string;
  accent: string;
};

type ActivityUser = {
  userId?: string;
  name?: string;
  photoUri?: string;
};

const UI_TEXT = {
  ua: {
    quickLabel: 'ВСІ ЗАЯВКИ ЧАЙКИ',
    quickDesc: 'Відкрити живий список заявок',
    activityTitle: 'сьогодні активність',
    activeUsers: (count: number) => `активні за добу: ${count}`,
    activityFallback: 'активність за добу',
    sosCaption: 'допомога сусідів сьогодні',
    offerCaption: 'робота і бізнес сьогодні',
    seeMore: 'Більше',
    seeLess: 'Згорнути',
    topics: [
      { label: 'Допомога сусідам', desc: 'Термінові запити від мешканців - тільки сьогодні', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'Нова заявка', desc: 'Категорія, деталі або терміново - одна форма', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Хто загубив?', desc: 'Загублені та знайдені речі мешканців', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Проблеми ЖК', desc: 'Повідомити про проблему в ЖК', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Рейтинг будинків', desc: 'Оцінка якості від мешканців', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
  ru: {
    quickLabel: 'ВСЕ ЗАЯВКИ ЧАЙКИ',
    quickDesc: 'Открыть живой список заявок',
    activityTitle: 'сегодня активность',
    activeUsers: (count: number) => `активные за сутки: ${count}`,
    activityFallback: 'активность за сутки',
    sosCaption: 'помощь соседей сегодня',
    offerCaption: 'работа и бизнес сегодня',
    seeMore: 'Больше',
    seeLess: 'Свернуть',
    topics: [
      { label: 'Помощь соседям', desc: 'Срочные запросы жителей - только сегодня', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'Новая заявка', desc: 'Категория, детали или срочно - одна форма', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Кто потерял?', desc: 'Потерянные и найденные вещи жителей', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Проблемы ЖК', desc: 'Сообщить о проблеме в ЖК', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Рейтинг домов', desc: 'Оценка качества от жителей', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
  en: {
    quickLabel: 'ALL CHAIKA REQUESTS',
    quickDesc: 'Open live request list',
    activityTitle: "today's activity",
    activeUsers: (count: number) => `active in 24h: ${count}`,
    activityFallback: 'activity in 24h',
    sosCaption: 'neighbor help today',
    offerCaption: 'jobs and business today',
    seeMore: 'More',
    seeLess: 'Less',
    topics: [
      { label: 'Neighbor Help', desc: 'Urgent requests from residents - today only', screen: 'HelpNeighborsScreen', icon: 'hand-heart-outline', accent: SCREEN_THEME.woodGreen },
      { label: 'New Request', desc: 'Category, details, or urgent - one form', screen: 'RequestFormScreen', icon: 'clipboard-edit-outline', accent: SCREEN_THEME.terracotta },
      { label: 'Who lost it?', desc: 'Lost and found items from residents', screen: 'LostAndFoundScreen', icon: 'magnify', accent: '#3E7A73' },
      { label: 'Building Issues', desc: 'Report an issue in the complex', screen: 'ChaikaProblemsScreen', icon: 'alert-circle-outline', accent: '#8A7AB1' },
      { label: 'Building Rating', desc: 'Service quality score by residents', screen: 'RatingScreen', icon: 'home-city-outline', accent: '#6F8D57' },
    ] as TopicItem[],
  },
} as const;

const SCREEN_W = Dimensions.get('window').width;
const SOS_MAX_VISIBLE_COUNT = 20;
const OFFERS_MAX_VISIBLE_COUNT = 20;

const getSosBarPercent = (count: number) => {
  if (count <= 0) return 18;
  return Math.min(100, 18 + (count / SOS_MAX_VISIBLE_COUNT) * 82);
};

const getOfferBarPercent = (count: number) => {
  if (count <= 0) return 16;
  return Math.min(100, 16 + (count / OFFERS_MAX_VISIBLE_COUNT) * 84);
};

const isCreatedToday = (value: string | number | Date | undefined) => {
  if (!value) return false;
  const createdAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(createdAt.getTime())) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return createdAt >= todayStart;
};

const RequestTopicScreen: React.FC = () => {
  const navigation =
    useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const currentUser = useSelector((state: RootState) => state.auth.user) as User | null;
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [todayOffersCount, setTodayOffersCount] = useState(0);
  const [offerActivityUsers, setOfferActivityUsers] = useState<ActivityUser[]>([]);
  const todayHelpRequests = useSelector((state: RootState) => selectTodayHelpRequests(state)) as HelpRequest[];
  const sosRequests = useMemo(
    () => todayHelpRequests.filter((request) => request.isBurning && request.expiresAt > new Date()),
    [todayHelpRequests]
  );
  const sosUsers = useMemo<ActivityUser[]>(() => {
    const seen = new Set<string>();
    return sosRequests.filter((request) => {
      if (!request.userId || seen.has(request.userId)) return false;
      seen.add(request.userId);
      return true;
    }).map((request) => ({ userId: request.userId, name: request.name })).slice(0, 3);
  }, [sosRequests]);
  const activeAvatarUsers = useMemo<ActivityUser[]>(() => {
    const byId = new Map<string, ActivityUser>();
    const add = (item: ActivityUser | null | undefined) => {
      if (!item) return;
      const id = item?.userId?.trim();
      if (!id || byId.has(id)) return;
      byId.set(id, { ...item, userId: id });
    };

    sosUsers.forEach((item) => add(item));
    offerActivityUsers.forEach((item) => add(item));
    if (currentUser?.id) {
      add({ userId: currentUser.id, name: currentUser.name, photoUri: currentUser.photoURL });
    }

    return Array.from(byId.values()).slice(0, 3);
  }, [currentUser?.id, currentUser?.name, currentUser?.photoURL, offerActivityUsers, sosUsers]);
  const avatarByUserId = useUserAvatarMap(activeAvatarUsers.map((item) => item.userId));
  const shimmerX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerX, {
        toValue: 1,
        duration: 2100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerX]);

  useEffect(() => {
    let jobCount = 0;
    let businessCount = 0;
    let jobUsers: ActivityUser[] = [];
    let businessUsers: ActivityUser[] = [];
    const publish = () => setTodayOffersCount(jobCount + businessCount);
    const publishUsers = () => setOfferActivityUsers([...jobUsers, ...businessUsers].slice(0, 6));

    const unsubscribeJobs = jobService.subscribe((items: JobListing[]) => {
      const now = Date.now();
      const todaysJobs = items.filter((item) => {
        const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
        return item.moderationStatus === 'approved' && !item.isArchived && !expired && isCreatedToday(item.createdAt);
      });
      jobCount = todaysJobs.length;
      jobUsers = todaysJobs.map((item) => ({ userId: item.userId, name: item.name, photoUri: item.photoUri }));
      publish();
      publishUsers();
    });

    let cancelled = false;
    let unsubscribeBusiness: (() => void) = () => {};

    const activeBusinessQuery = query(ref(database, 'local_business'), orderByChild('status'), equalTo('active'));
    void ensureFirebaseAuth().then(() => {
      if (cancelled) return;
      unsubscribeBusiness = onValue(activeBusinessQuery, (snapshot) => {
        if (cancelled) return;
        const raw = snapshot.val() as Record<string, { status?: string; createdAt?: string | number; userId?: string; contactName?: string; photoUri?: string }> | null;
        const todaysBusiness = raw
          ? Object.values(raw).filter((item) => item?.status === 'active' && isCreatedToday(item.createdAt))
          : [];
        businessCount = todaysBusiness.length;
        businessUsers = todaysBusiness.map((item) => ({ userId: item.userId, name: item.contactName, photoUri: item.photoUri }));
        publish();
        publishUsers();
      }, () => {
        if (cancelled) return;
        businessCount = 0;
        businessUsers = [];
        publish();
        publishUsers();
      });
    }).catch(() => { /* auth failed, leave count at 0 */ });

    return () => {
      cancelled = true;
      unsubscribeJobs();
      unsubscribeBusiness();
    };
  }, []);

  const activeUsersLabel = activeAvatarUsers.length > 0
    ? text.activeUsers(activeAvatarUsers.length)
    : text.activityFallback;

  const shimmerTranslate = shimmerX.interpolate({
    inputRange: [0, 1],
    outputRange: [-110, SCREEN_W - 70],
  });

  const openTopic = (screen: string) => {
    if (screen === 'RequestFormScreen') {
      void openRequestFormWithLimitCheck(navigation, language);
      return;
    }
    safeNavigate(navigation, screen);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        {LIGHT_ORBS.map((orb, index) => (
          <View
            key={index}
            style={[
              styles.orb,
              {
                width: orb.size,
                height: orb.size,
                backgroundColor: orb.color,
                top: orb.top,
                left: orb.left,
                right: orb.right,
                bottom: orb.bottom,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={require('../../assets/WEBP-version/Operator.webp')} style={styles.headerImage} resizeMode="cover" />

        <TouchableOpacity
          style={styles.activityPanel}
          onPress={() => safeNavigate(navigation, 'OnlineChatTab')}
          activeOpacity={0.88}
        >
          <Text style={styles.activityTitle}>{text.activityTitle}</Text>
          <View style={styles.activityRow}>
            <View style={styles.activityAvatars}>
              {[0, 1, 2].map((index) => {
                const activityUser = activeAvatarUsers[index];
                return (
                  <View key={activityUser?.userId ?? `activity-avatar-${index}`} style={[styles.activityAvatarWrap, { left: index * 22 }, index > 0 && styles.activityAvatarOverlap]}>
                    <MiniUserAvatar
                      uri={activityUser?.photoUri || (activityUser?.userId && avatarByUserId[activityUser.userId]) || undefined}
                      name={activityUser?.name}
                      size={34}
                      borderRadius={17}
                      backgroundColor="#FFD917"
                    />
                  </View>
                );
              })}
              <Text style={styles.activityUsersLabel}>{activeUsersLabel}</Text>
            </View>

            <View style={styles.sosColumn}>
              <View style={styles.sosTrack}>
                <View style={[styles.sosFill, { width: `${getSosBarPercent(sosRequests.length)}%` }]}>
                  <Animated.View style={[styles.sosShimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }] }]} />
                  <Text style={styles.sosText}>SOS {sosRequests.length}</Text>
                </View>
              </View>
              <Text style={styles.sosCaption}>{text.sosCaption}</Text>
            </View>
          </View>
          <View style={styles.offerRow}>
            <View style={styles.offerSpacer} />
            <View style={styles.sosColumn}>
              <View style={styles.offerTrack}>
                <View style={[styles.offerFill, { width: `${getOfferBarPercent(todayOffersCount)}%` }]}>
                  <Animated.View style={[styles.offerShimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }] }]} />
                  <Text style={styles.offerText}>😃 {todayOffersCount}</Text>
                </View>
              </View>
              <Text style={styles.offerCaption}>{text.offerCaption}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => safeNavigate(navigation, 'OnlineChatTab')}
            activeOpacity={0.86}
          >
            <TactileIcon icon="message-outline" size={46} iconSize={21} backgroundColor={SCREEN_THEME.enamelBlue} />
            <View style={styles.quickCopy}>
              <Text style={styles.quickLabel}>{text.quickLabel}</Text>
              <Text style={styles.quickDesc}>{text.quickDesc}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.topicsGrid}>
          {text.topics.filter(t => t.screen !== 'RequestFormScreen' && t.screen !== 'RatingScreen').map((topic) => (
            <TouchableOpacity
              key={topic.screen}
              style={styles.topicCard}
              onPress={() => openTopic(topic.screen)}
              activeOpacity={0.86}
            >
              <View style={styles.topicGloss} />
              <View style={styles.topicRow}>
                <TactileIcon icon={topic.icon} size={46} iconSize={21} backgroundColor={topic.accent} />
                <View style={styles.topicCopy}>
                  <Text style={styles.topicLabel}>{topic.label}</Text>
                  <Text style={styles.topicDesc}>{topic.desc}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}
          {topicsExpanded && text.topics.filter(t => t.screen === 'RequestFormScreen' || t.screen === 'RatingScreen').map((topic) => (
            <TouchableOpacity
              key={topic.screen}
              style={styles.topicCard}
              onPress={() => openTopic(topic.screen)}
              activeOpacity={0.86}
            >
              <View style={styles.topicGloss} />
              <View style={styles.topicRow}>
                <TactileIcon icon={topic.icon} size={46} iconSize={21} backgroundColor={topic.accent} />
                <View style={styles.topicCopy}>
                  <Text style={styles.topicLabel}>{topic.label}</Text>
                  <Text style={styles.topicDesc}>{topic.desc}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.seeMoreBtn} onPress={() => setTopicsExpanded(v => !v)} activeOpacity={0.8}>
            <Text style={styles.seeMoreText}>{topicsExpanded ? text.seeLess : text.seeMore}</Text>
            <MaterialCommunityIcons name={topicsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={SCREEN_THEME.accentGold} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingBottom: 32 },
  headerImage: {
    width: SCREEN_W,
    height: Math.round(SCREEN_W * 0.42),
    marginLeft: -16,
    marginRight: -16,
    marginBottom: 12,
  },
  activityPanel: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 12,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: '#30A95A',
    overflow: 'hidden',
    ...SCREEN_THEME.raisedShadow,
  },
  activityTitle: {
    textAlign: 'center',
    color: '#13A84A',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center' },
  activityAvatars: {
    width: 78,
    minHeight: 48,
    marginRight: 10,
  },
  activityAvatarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#111',
    backgroundColor: '#FFD917',
    overflow: 'hidden',
  },
  activityAvatarOverlap: { marginLeft: 0 },
  activityUsersLabel: {
    position: 'absolute',
    left: 0,
    top: 38,
    color: '#15823D',
    fontSize: 8,
    fontWeight: '800',
    width: 86,
  },
  sosColumn: { flex: 1 },
  sosTrack: {
    height: 31,
    borderRadius: 12,
    backgroundColor: SCREEN_THEME.appBg,
    padding: 4,
    overflow: 'hidden',
  },
  sosFill: {
    minWidth: 58,
    height: '100%',
    borderRadius: 9,
    backgroundColor: '#F01822',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sosShimmer: {
    position: 'absolute',
    top: -18,
    bottom: -18,
    width: 42,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
    paddingHorizontal: 10,
  },
  sosCaption: {
    color: '#14813B',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
  },
  offerSpacer: {
    width: 88,
  },
  offerTrack: {
    height: 27,
    borderRadius: 11,
    backgroundColor: SCREEN_THEME.appBg,
    padding: 4,
    overflow: 'hidden',
  },
  offerFill: {
    minWidth: 94,
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#25B958',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  offerShimmer: {
    position: 'absolute',
    top: -18,
    bottom: -18,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  offerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    paddingHorizontal: 8,
  },
  offerCaption: {
    color: '#14813B',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  topicsGrid: { gap: 10 },
  quickGrid: { gap: 10, marginBottom: 14 },
  quickCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadow,
  },
  quickCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  quickLabel: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  quickDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 3, fontWeight: '600' },
  topicCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    ...SCREEN_THEME.raisedShadow,
    overflow: 'hidden',
  },
  topicGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.10)' },
  topicRow: { flexDirection: 'row', alignItems: 'center' },
  topicCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  topicLabel: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  topicDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 3, fontWeight: '600' },
  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.accentGold,
    letterSpacing: 0.5,
  },
});

export default RequestTopicScreen;
