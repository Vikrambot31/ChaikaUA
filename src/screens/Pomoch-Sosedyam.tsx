import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { HelpRequest } from '../types/app';
import { selectTodayHelpRequests, selectYesterdayHelpRequests } from '../redux/slices/helpRequestsSlice';
import MiniTabBar from '../components/MiniTabBar';
import ContactReasonModal from '../components/ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';
import { SCREEN_THEME } from '../utils/screenTheme';
import { safeCallPhone } from '../utils/communicationActions';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import type { DetailItemData } from '../utils/detailViewTypes';
import UserCardActionBar from '../components/UserCardActionBar';
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';
import AppPhotoImage from '../components/AppPhotoImage';

const HELP_NEIGHBORS_SPLASH_KEY = '@help_neighbors_first_visit_splash_seen';

type ListItem = HelpRequest & { isYesterday?: boolean };

const UI_TEXT = {
  ua: {
    listTitle: 'Термінові запити',
    emptyTitle: 'Сьогодні все спокійно',
    emptySubtitle: 'Немає термінових прохань від сусідів',
    expired: 'Час минув',
    splash: 'Зробимо Чайку місцем підтримки один для одного',
    yesterday: 'Вчора',
  },
  ru: {
    listTitle: 'Срочные запросы',
    emptyTitle: 'Сегодня все спокойно',
    emptySubtitle: 'Нет срочных просьб от соседей',
    expired: 'Срок вышел',
    splash: 'Сделаем Чайку местом поддержки друг для друга',
    yesterday: 'Вчера',
  },
  en: {
    listTitle: 'Urgent requests',
    emptyTitle: 'Everything is calm today',
    emptySubtitle: 'There are no urgent requests from neighbors',
    expired: 'Time expired',
    splash: "Let's make Chaika Life a place of support for one another",
    yesterday: 'Yesterday',
  },
} as const;

const formatPublishedAt = (createdAt: Date) => {
  const day = String(createdAt.getDate()).padStart(2, '0');
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const hours = String(createdAt.getHours()).padStart(2, '0');
  const minutes = String(createdAt.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
};

const HelpNeighborsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const [showHelpSplash, setShowHelpSplash] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const todayRequests = useSelector((state: RootState) => selectTodayHelpRequests(state)) as HelpRequest[];
  const yesterdayRequests = useSelector((state: RootState) => selectYesterdayHelpRequests(state));
  const burningRequests = useMemo(
    () => todayRequests.filter((request) => request.isBurning && request.expiresAt > new Date()),
    [todayRequests]
  );
  const listData = useMemo((): ListItem[] => [
    ...burningRequests,
    ...yesterdayRequests.map((r) => ({ ...r, isYesterday: true as const })),
  ], [burningRequests, yesterdayRequests]);
  const avatarByUserId = useUserAvatarMap(listData.map((item) => item.userId));

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadSplashState = async () => {
      try {
        const seenSplash = await AsyncStorage.getItem(HELP_NEIGHBORS_SPLASH_KEY);
        if (!isMounted) return;

        if (seenSplash === 'true') {
          setIsReady(true);
          return;
        }

        setShowHelpSplash(true);
        timeoutId = setTimeout(async () => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
          try {
            await AsyncStorage.setItem(HELP_NEIGHBORS_SPLASH_KEY, 'true');
          } catch {}
        }, 3000);
      } catch {
        if (!isMounted) return;
        setShowHelpSplash(true);
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
        }, 3000);
      }
    };

    void loadSplashState();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const mapToDetailData = (item: HelpRequest): DetailItemData => ({
    id: item.id,
    title: item.name,
    description: item.description,
    phone: item.phone,
    category: undefined,
    status: item.isBurning && item.expiresAt > new Date() ? text.listTitle : text.expired,
    userId: item.userId,
    createdAt: item.createdAt.toISOString(),
    sourceType: 'help',
    sourceId: item.id,
    photoUri: item.photoUri,
    photoStoragePath: item.photoStoragePath,
  });

  const openDetail = (item: HelpRequest) => {
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {showHelpSplash ? (
        <View style={styles.splashContainer}>
          <Image source={require('../../assets/WEBP-version/dopomoga1.webp')} style={styles.splashImage} resizeMode="cover" />
          <View style={styles.splashOverlay} />
          <View style={styles.splashCaption}>
            <Text style={styles.splashText}>{text.splash}</Text>
          </View>
        </View>
      ) : null}

      {isReady ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          data={listData}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          windowSize={5}
          ListHeaderComponent={
            <>
              <View style={styles.headerCard}>
                <Image source={require('../../assets/WEBP-version/Sosedi-pomogaut.webp')} style={styles.headerImage} resizeMode="cover" />
              </View>

              <TouchableOpacity
                style={styles.addRequestButton}
                onPress={() => { void openRequestFormWithLimitCheck(navigation, language); }}
                activeOpacity={0.86}
              >
                <Text style={styles.addRequestButtonText}>+ Додати прохання</Text>
              </TouchableOpacity>

              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>{text.listTitle}</Text>
                <View style={styles.listCountBadge}>
                  <Text style={styles.listCount}>{burningRequests.length}</Text>
                </View>
              </View>
            </>
          }
          renderItem={({ item, index }) => (
            <>
              {item.isYesterday && (index === 0 || !listData[index - 1]?.isYesterday) && (
                <View style={styles.yesterdaySeparator}>
                  <View style={styles.yesterdayLine} />
                  <Text style={styles.yesterdayLabel}>{text.yesterday}</Text>
                  <View style={styles.yesterdayLine} />
                </View>
              )}
            <TouchableOpacity style={item.isYesterday ? styles.requestCardYesterday : styles.requestCard} onPress={() => { if (navLock.current) return; navLock.current = true; openDetail(item); setTimeout(() => { navLock.current = false; }, 800); }} activeOpacity={0.86}>
              <View style={styles.requestHeader}>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.name}</Text>
                </View>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeText}>{formatPublishedAt(item.createdAt)}</Text>
                </View>
              </View>
              {item.photoUri || item.photoStoragePath ? (
                <AppPhotoImage
                  uri={item.photoUri}
                  storagePath={item.photoStoragePath}
                  style={styles.requestPhoto}
                  resizeMode="cover"
                  debugLabel={`HelpNeighborsCard:${item.id}`}
                  showDebugInfo={false}
                />
              ) : null}
              <Text style={styles.requestDescription}>{item.description}</Text>
              {item.moderationStatus === 'pending' && item.userId === user?.id && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>
                    {language === 'ru' ? 'Ожидает модерации' : language === 'en' ? 'Awaiting moderation' : 'Очікує модерації'}
                  </Text>
                </View>
              )}
              <UserCardActionBar
                avatarUri={(item.userId && avatarByUserId[item.userId]) || undefined}
                name={item.name}
                userId={item.userId}
                currentUserId={user?.id}
                language={language}
                onProfile={item.userId ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.userId as string }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
                onContact={item.userId && item.userId !== user?.id ? () => openContactModal({ userId: item.userId as string, name: item.name || 'Unknown', photoURL: (item.userId && avatarByUserId[item.userId]) || undefined, sourceType: 'help', sourceId: item.id, sourceTitle: item.description?.slice(0, 60) }) : item.phone ? () => void safeCallPhone(item.phone, language) : undefined}
                contactDisabled={!item.phone && (!item.userId || item.userId === user?.id)}
                likePath="feed_likes/help_neighbors"
                likeId={item.id}
                avatarSize={64}
              />
            </TouchableOpacity>
            </>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{text.emptyTitle}</Text>
              <Text style={styles.emptySubtext}>{text.emptySubtitle}</Text>
            </View>
          }
        />
      ) : null}

      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    backgroundColor: '#1F221A',
    justifyContent: 'flex-end',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 28, 18, 0.24)',
  },
  splashCaption: {
    marginHorizontal: 18,
    marginBottom: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 248, 238, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 63, 0.18)',
    shadowColor: '#26301E',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  splashText: {
    color: '#2A2D22',
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  scrollContent: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 16 },
  headerCard: {
    marginBottom: 14,
    overflow: 'hidden',
    borderRadius: 18,
  },
  headerImage: { width: '100%', height: 200, resizeMode: 'cover' },
  addRequestButton: {
    marginBottom: 14,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
    shadowColor: '#7A3A22',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  addRequestButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  listTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  listCountBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  listCount: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  requestCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  userInfo: { flex: 1 },
  userName: { fontWeight: '900', color: SCREEN_THEME.textPrimary },
  timeBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  timeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  requestPhoto: { width: '100%', height: 170, borderRadius: 14, marginBottom: 8, backgroundColor: '#E7D6B6' },
  requestDescription: { color: '#fff', backgroundColor: '#7A1E5C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, lineHeight: 20, marginBottom: 8, fontWeight: '800', overflow: 'hidden' },
  pendingBadge: { backgroundColor: '#FFF3CD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#F0C96B' },
  pendingBadgeText: { color: '#7A5C00', fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 12 },
  emptySubtext: { color: SCREEN_THEME.textSecondary, marginTop: 4 },
  requestCardYesterday: {
    backgroundColor: '#D6D6D6',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#B0B0B0',
  },
  yesterdaySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 8,
  },
  yesterdayLine: { flex: 1, height: 1, backgroundColor: '#B0B0B0' },
  yesterdayLabel: { color: '#888888', fontWeight: '800', fontSize: 13 },
});

export default HelpNeighborsScreen;
