import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import { communityUsersAPI } from '../firebase-config';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';
import { HelpRequest, Request, User } from '../types/app';
import { getChaikaActivity, getLevelName } from '../utils/chaikaLevels';
import { profilePermissionService } from '../services/profilePermissionService';
import { ProfileViewRequestModal, PermissionModalState } from '../components/ProfileViewRequestModal';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import type { DetailItemData } from '../utils/detailViewTypes';
import UserCardActionBar from '../components/UserCardActionBar';
import { START_AVATAR_URI_PREFIX } from '../utils/startAvatars';
import { get, ref } from 'firebase/database';
import { database } from '../firebase-config';

const CACHE_KEY = '@chaika:community_users_cache_v1';
const PRIMARY = '#7A1E5C';
const AVATAR_COLORS = ['#7A1E5C', '#CFA060', '#00897B', '#1565C0', '#6A1B9A', '#2E7D32'];
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Люди Чайки',
    summaryTitle: 'Реальні користувачі застосунку',
    members: 'учасників у списку',
    loading: 'Завантажуємо людей...',
    emptyTitle: 'Поки немає користувачів',
    emptyBody: 'Список зʼявиться після реєстрації мешканців.',
    you: 'Ви',
    level: 'рів.',
    points: 'балів',
    days: 'днів',
    noAddress: 'Адресу не вказано',
    noProfession: 'Вид діяльності не вказано',
    residentFallback: 'Житель Чайки',
    statusLabel: 'Статус',
    levelFilterLabel: 'Рівень',
    statusAll: 'Усі',
    statusNew: 'Новачки',
    statusActive: 'Активні',
    statusPro: 'Досвідчені',
    levelAll: 'Усі',
    levelLow: '1-2',
    levelMid: '3-4',
    levelHigh: '5+',
    viewProfile: 'Переглянути профіль',
    contactUser: "Зв'язатися",
    cancel: 'Скасувати',
    userProfile: 'Профіль користувача',
  },
  ru: {
    title: 'Люди Чайки',
    summaryTitle: 'Реальные пользователи приложения',
    members: 'участников в списке',
    loading: 'Загружаем людей...',
    emptyTitle: 'Пока нет пользователей',
    emptyBody: 'Список появится после регистрации жителей.',
    you: 'Вы',
    level: 'ур.',
    points: 'баллов',
    days: 'дней',
    noAddress: 'Адрес не указан',
    noProfession: 'Вид деятельности не указан',
    residentFallback: 'Житель Чайки',
    statusLabel: 'Статус',
    levelFilterLabel: 'Уровень',
    statusAll: 'Все',
    statusNew: 'Новички',
    statusActive: 'Активные',
    statusPro: 'Опытные',
    levelAll: 'Все',
    levelLow: '1-2',
    levelMid: '3-4',
    levelHigh: '5+',
    viewProfile: 'Просмотреть профиль',
    contactUser: 'Связаться',
    cancel: 'Отмена',
    userProfile: 'Профиль пользователя',
  },
  en: {
    title: 'Chaika Life People',
    summaryTitle: 'Real app users',
    members: 'members in the list',
    loading: 'Loading people...',
    emptyTitle: 'No users yet',
    emptyBody: 'The list will appear after residents register.',
    you: 'You',
    level: 'lvl',
    points: 'points',
    days: 'days',
    noAddress: 'Address not specified',
    noProfession: 'Activity type not specified',
    residentFallback: 'Chaika Life Resident',
    statusLabel: 'Status',
    levelFilterLabel: 'Level',
    statusAll: 'All',
    statusNew: 'New',
    statusActive: 'Active',
    statusPro: 'Pro',
    levelAll: 'All',
    levelLow: '1-2',
    levelMid: '3-4',
    levelHigh: '5+',
    viewProfile: 'View full profile',
    contactUser: 'Contact',
    cancel: 'Cancel',
    userProfile: 'User profile',
  },
} as const;

type UiText = (typeof UI_TEXT)[Lang];

type CommunityUser = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  city?: string;
  building?: string;
  houseNumber?: string;
  registeredAt?: string;
  daysUsed?: number;
  profession?: string;
  registrationStatus?: string;
  provider?: string;
  providerId?: string;
  gender?: string;
  age?: number;
};

type Person = CommunityUser & {
  level: number;
  levelName: string;
  points: number;
  days: number;
};

type PersonStatusFilter = 'all' | 'new' | 'active' | 'pro';
type PersonLevelFilter = 'all' | 'low' | 'mid' | 'high';

const getAddress = (person: CommunityUser, text: UiText) => {
  const parts = [person.building, person.houseNumber].filter(Boolean);
  return parts.length ? parts.join(', ') : person.city || text.noAddress;
};

const mapCurrentUser = (user: User | null, text: UiText): CommunityUser | null => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || text.residentFallback,
    phone: user.phone,
    photoURL: user.photoURL || undefined,
    city: user.city,
    registeredAt: user.registeredAt ? new Date(user.registeredAt).toISOString() : undefined,
    daysUsed: user.daysUsed,
    profession: user.profession,
    gender: user.gender,
    age: user.age,
    registrationStatus: user.registrationStatus,
    provider: user.provider,
    providerId: user.providerId,
  };
};

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const firstText = (...values: unknown[]): string | undefined => {
  const found = values.find(hasText);
  return typeof found === 'string' ? found.trim() : undefined;
};

const mergeCommunityUser = (existing: CommunityUser, next: CommunityUser): CommunityUser => ({
  ...existing,
  name: firstText(existing.name, next.name) || existing.name || next.name,
  email: firstText(existing.email, next.email),
  phone: firstText(existing.phone, next.phone),
  photoURL: firstText(existing.photoURL, next.photoURL),
  city: firstText(existing.city, next.city),
  building: firstText(existing.building, next.building),
  houseNumber: firstText(existing.houseNumber, next.houseNumber),
  registeredAt: firstText(existing.registeredAt, next.registeredAt),
  daysUsed: typeof existing.daysUsed === 'number' ? existing.daysUsed : next.daysUsed,
  profession: firstText(existing.profession, next.profession),
  registrationStatus: firstText(existing.registrationStatus, next.registrationStatus),
  provider: firstText(existing.provider, next.provider),
  providerId: firstText(existing.providerId, next.providerId),
  gender: firstText(existing.gender, next.gender),
  age: typeof existing.age === 'number' ? existing.age : next.age,
});

export default function TopGirlsBoysScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const appRequests = useSelector((state: RootState) => state.requests?.items ?? []) as Request[];
  const approvedRequests = useSelector((state: RootState) => state.requests?.approved ?? []) as Request[];
  const helpRequests = useSelector((state: RootState) => state.helpRequests?.items ?? []) as HelpRequest[];
  const [people, setPeople] = useState<CommunityUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<PersonStatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<PersonLevelFilter>('all');
  const [bonusByUserId, setBonusByUserId] = useState<Record<string, number>>({});
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const [permModal, setPermModal] = useState<{
    visible: boolean;
    state: PermissionModalState;
    targetId: string;
    targetName: string;
    contactInfo: string;
  }>({ visible: false, state: 'confirm', targetId: '', targetName: '', contactInfo: '' });
  const activityByUserId = useMemo(() => {
    const stats: Record<string, { requestCount: number; reviewCount: number; likeCount: number }> = {};
    const ensureStats = (userId?: string) => {
      if (!userId) return null;
      stats[userId] ??= { requestCount: 0, reviewCount: 0, likeCount: 0 };
      return stats[userId];
    };

    appRequests.forEach((request) => {
      const userStats = ensureStats(request.userId);
      if (userStats) userStats.requestCount += 1;
    });
    helpRequests.forEach((request) => {
      const userStats = ensureStats(request.userId);
      if (userStats) userStats.requestCount += 1;
    });
    approvedRequests.forEach((request) => {
      const userStats = ensureStats(request.userId);
      if (userStats) userStats.reviewCount += 1;
    });

    return stats;
  }, [appRequests, approvedRequests, helpRequests]);

  const seenUsersFromActivity = useMemo(() => {
    const byId = new Map<string, CommunityUser>();
    const remember = (item: {
      userId?: string;
      name?: string;
      phone?: string;
      userPhotoURL?: string;
      startAvatarKey?: string;
      building?: string;
      createdAt?: number | Date;
      timestamp?: number;
    }) => {
      const id = typeof item.userId === 'string' ? item.userId.trim() : '';
      if (!id) return;

      const photoURL = firstText(
        item.userPhotoURL,
        item.startAvatarKey ? `${START_AVATAR_URI_PREFIX}${item.startAvatarKey}` : undefined,
      );
      const createdAtMs = item.createdAt instanceof Date
        ? item.createdAt.getTime()
        : typeof item.createdAt === 'number'
          ? item.createdAt
          : typeof item.timestamp === 'number'
            ? item.timestamp
            : undefined;
      const next: CommunityUser = {
        id,
        name: firstText(item.name) || text.residentFallback,
        phone: firstText(item.phone) || '',
        photoURL,
        building: firstText(item.building),
        registeredAt: createdAtMs ? new Date(createdAtMs).toISOString() : undefined,
        registrationStatus: 'seen',
      };
      const existing = byId.get(id);
      byId.set(id, existing ? mergeCommunityUser(existing, next) : next);
    };

    appRequests.forEach(remember);
    approvedRequests.forEach(remember);
    helpRequests.forEach(remember);
    return Array.from(byId.values());
  }, [appRequests, approvedRequests, helpRequests, text.residentFallback]);

  const mergeWithCurrentUser = useCallback(
    (remoteUsers: CommunityUser[]) => {
      const current = mapCurrentUser(user, text);
      const byId = new Map<string, CommunityUser>();
      const addUser = (item: CommunityUser) => {
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) return;
        const normalized = { ...item, id };
        const existing = byId.get(id);
        byId.set(id, existing ? mergeCommunityUser(existing, normalized) : normalized);
      };

      remoteUsers.forEach(addUser);
      seenUsersFromActivity.forEach(addUser);
      if (current?.id) {
        addUser(current);
        const currentMerged = byId.get(current.id) || current;
        return [currentMerged, ...Array.from(byId.values()).filter((item) => item.id !== current.id)];
      }
      return Array.from(byId.values());
    },
    [seenUsersFromActivity, text, user]
  );

  const loadPeople = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await communityUsersAPI.getUsersOnce();
      const remoteUsers = response.success && response.data ? (response.data as CommunityUser[]) : [];
      const merged = mergeWithCurrentUser(remoteUsers);
      setPeople(merged);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    } catch {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      setPeople(mergeWithCurrentUser(cached ? (JSON.parse(cached) as CommunityUser[]) : []));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mergeWithCurrentUser]);

  const openPersonDetails = useCallback((person: Person) => {
    const item: DetailItemData = {
      id: person.id,
      title: person.name || text.residentFallback,
      description: person.profession?.trim() || text.noProfession,
      phone: person.phone || '',
      category: person.levelName,
      address: getAddress(person, text),
      status: `${text.level} ${person.level}`,
      votesCount: person.points,
      photoUri: person.photoURL,
      userId: person.id,
      sourceType: 'lyudi',
      sourceId: person.id,
    };
    navigation.navigate('ItemDetailScreen', { item });
  }, [navigation, text]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  // Load bonuses for all people in one batch read
  useEffect(() => {
    if (people.length === 0) return;
    let active = true;
    void (async () => {
      try {
        const snap = await get(ref(database, 'user_bonuses'));
        if (!active || !snap.exists()) return;
        const all = snap.val() as Record<string, { total?: number }>;
        const map: Record<string, number> = {};
        for (const [uid, val] of Object.entries(all)) {
          if (val && typeof val === 'object') {
            map[uid] = Number(val.total || 0);
          }
        }
        if (active) setBonusByUserId(map);
      } catch {
        // bonuses are non-critical — silently ignore
      }
    })();
    return () => { active = false; };
  }, [people]);

  const ranked: Person[] = useMemo(() => {
    return people
      .map((person) => {
        const userStats = activityByUserId[person.id] ?? { requestCount: 0, reviewCount: 0, likeCount: 0 };
        const activity = getChaikaActivity({
          registeredAt: person.registeredAt ? new Date(person.registeredAt) : undefined,
          daysUsed: person.daysUsed,
          requestCount: userStats.requestCount,
          reviewCount: userStats.reviewCount,
          likeCount: userStats.likeCount,
        });

        return {
          ...person,
          level: activity.currentLevel.level,
          levelName: getLevelName(activity.currentLevel, language),
          points: activity.points,
          days: activity.daysInApp,
        };
      })
      .sort((a, b) => b.level - a.level || b.points - a.points || b.days - a.days || a.name.localeCompare(b.name));
  }, [activityByUserId, language, people]);

  const filteredRanked = useMemo(() => {
    const resolvedByStatus = ranked.filter((person) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'new') return person.days < 30;
      if (statusFilter === 'active') return person.days >= 30 && person.level < 5;
      return person.level >= 5;
    });

    return resolvedByStatus.filter((person) => {
      if (levelFilter === 'all') return true;
      if (levelFilter === 'low') return person.level >= 1 && person.level <= 2;
      if (levelFilter === 'mid') return person.level >= 3 && person.level <= 4;
      return person.level >= 5;
    });
  }, [levelFilter, ranked, statusFilter]);

  const handleSendViewRequest = useCallback(async () => {
    if (!user?.id || !permModal.targetId) return;
    setPermModal((prev) => ({ ...prev, state: 'sending' }));
    const target = filteredRanked.find((p) => p.id === permModal.targetId);
    try {
      const result = await profilePermissionService.requestView(
        permModal.targetId,
        { id: user.id, name: user.name ?? '', photoURL: user.photoURL },
        'lyudi',
        { name: target?.name, photoURL: target?.photoURL }
      );
      if (result === 'already_approved') {
        setPermModal((prev) => ({ ...prev, state: 'open', contactInfo: target?.phone ?? '' }));
      } else if (result === 'already_pending') {
        setPermModal((prev) => ({ ...prev, state: 'pending' }));
      } else {
        setPermModal((prev) => ({ ...prev, state: 'sent' }));
      }
    } catch (error) {
      setPermModal((prev) => ({ ...prev, state: 'confirm' }));
      Alert.alert('Помилка', error instanceof Error ? error.message : 'Не вдалося надіслати запит');
    }
  }, [user?.id, user?.name, user?.photoURL, permModal.targetId, filteredRanked]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPeople()} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filtersCard}>
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>{text.statusLabel}</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]} onPress={() => setStatusFilter('all')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>{text.statusAll}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, statusFilter === 'new' && styles.filterChipActive]} onPress={() => setStatusFilter('new')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, statusFilter === 'new' && styles.filterChipTextActive]}>{text.statusNew}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, statusFilter === 'active' && styles.filterChipActive]} onPress={() => setStatusFilter('active')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, statusFilter === 'active' && styles.filterChipTextActive]}>{text.statusActive}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, statusFilter === 'pro' && styles.filterChipActive]} onPress={() => setStatusFilter('pro')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, statusFilter === 'pro' && styles.filterChipTextActive]}>{text.statusPro}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>{text.levelFilterLabel}</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterChip, levelFilter === 'all' && styles.filterChipActive]} onPress={() => setLevelFilter('all')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, levelFilter === 'all' && styles.filterChipTextActive]}>{text.levelAll}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, levelFilter === 'low' && styles.filterChipActive]} onPress={() => setLevelFilter('low')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, levelFilter === 'low' && styles.filterChipTextActive]}>{text.levelLow}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, levelFilter === 'mid' && styles.filterChipActive]} onPress={() => setLevelFilter('mid')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, levelFilter === 'mid' && styles.filterChipTextActive]}>{text.levelMid}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, levelFilter === 'high' && styles.filterChipActive]} onPress={() => setLevelFilter('high')} activeOpacity={0.82}>
                <Text style={[styles.filterChipText, levelFilter === 'high' && styles.filterChipTextActive]}>{text.levelHigh}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <MaterialCommunityIcons name="account-group-outline" size={28} color={PRIMARY} />
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{text.summaryTitle}</Text>
            <Text style={styles.summaryText}>{filteredRanked.length} {text.members}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.emptyText}>{text.loading}</Text>
          </View>
        ) : filteredRanked.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="account-search-outline" size={34} color="#9A8F86" />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyBody}</Text>
          </View>
        ) : (
          filteredRanked.map((person, index) => {
            const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const isCurrentUser = person.id === user?.id;
            return (
              <TouchableOpacity key={person.id} style={[styles.personCard, isCurrentUser && styles.personCardCurrent]} onPress={() => { if (isCurrentUser || navLock.current) return; navLock.current = true; openPersonDetails(person); setTimeout(() => { navLock.current = false; }, 800); }} activeOpacity={0.88} disabled={isCurrentUser}>
                <View style={styles.personCardMain}>
                  <View style={styles.rankBox}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>

                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}> 
                  {person.photoURL && !failedImages[person.id] ? (
                    <AppPhotoImage
                      uri={person.photoURL}
                      style={styles.avatarImage}
                      resizeMode="cover"
                      debugLabel={`People:${person.id}`}
                      onError={() => setFailedImages((prev) => ({ ...prev, [person.id]: true }))}
                    />
                  ) : (
                    <MaterialCommunityIcons name="account" size={28} color="#fff" />
                  )}
                  </View>

                  <View style={styles.personInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
                    {isCurrentUser ? <Text style={styles.youBadge}>{text.you}</Text> : null}
                  </View>
                  <Text style={styles.addressText} numberOfLines={1}>{getAddress(person, text)}</Text>
                  <Text style={styles.professionText} numberOfLines={1}>{person.profession?.trim() || text.noProfession}</Text>

                  <View style={styles.metrics}>
                    <View style={styles.metric}>
                      <MaterialCommunityIcons name="shield-star-outline" size={14} color={PRIMARY} />
                      <Text style={styles.metricText}>{text.level} {person.level}</Text>
                    </View>
                  </View>
                  </View>

                  <View style={styles.actionsColumn}>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelName} numberOfLines={2}>{person.levelName}</Text>
                    </View>
                  </View>
                </View>
                <UserCardActionBar
                  avatarUri={person.photoURL || ''}
                  name={person.name}
                  userId={person.id}
                  currentUserId={user?.id}
                  language={language}
                  onProfile={!isCurrentUser ? () => navigation.navigate('ViewUserProfile', { userId: person.id }) : undefined}
                  onContact={!isCurrentUser ? () => openContactModal({ userId: person.id, name: person.name, sourceType: 'lyudi', sourceId: person.id, sourceTitle: person.name }) : undefined}
                  contactDisabled={isCurrentUser}
                  likePath="feed_likes/people"
                  likeId={person.id}
                />
                {(bonusByUserId[person.id] ?? 0) > 0 ? (
                  <View style={styles.bonusCoinRow}>
                    <MaterialCommunityIcons name="circle-multiple" size={14} color="#C79C47" />
                    <Text style={styles.bonusCoinText}>{bonusByUserId[person.id]}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      <MiniTabBar />
      <ProfileViewRequestModal
        visible={permModal.visible}
        state={permModal.state}
        targetName={permModal.targetName}
        contactInfo={permModal.contactInfo}
        language={language}
        onSend={() => void handleSendViewRequest()}
        onClose={() => setPermModal((prev) => ({ ...prev, visible: false }))}
      />
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  header: {
    backgroundColor: PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: PRIMARY,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  headerSpacer: { width: 42 },
  scroll: { padding: 14, paddingBottom: 110 },
  filtersCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  filterBlock: { gap: 6 },
  filterTitle: { color: '#6B5E55', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCC9A8',
    backgroundColor: '#FAF6EF',
  },
  filterChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterChipText: { color: '#5B5048', fontSize: 11, fontWeight: '800' },
  filterChipTextActive: { color: '#fff' },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: '#2D2520', fontSize: 15, fontWeight: '900' },
  summaryText: { color: '#7A6D64', marginTop: 3, fontSize: 12, fontWeight: '700' },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  emptyTitle: { color: '#2D2520', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#7A6D64', textAlign: 'center', fontWeight: '700' },
  personCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  personCardMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personCardCurrent: { borderColor: PRIMARY, backgroundColor: '#FFF8FC' },
  rankBox: { width: 26, alignItems: 'center' },
  rankText: { color: '#A0938D', fontSize: 11, fontWeight: '900' },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  personInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  personName: { color: '#2D2520', fontSize: 14, fontWeight: '900', flexShrink: 1 },
  youBadge: { color: '#fff', backgroundColor: PRIMARY, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, fontSize: 9, fontWeight: '900' },
  addressText: { color: '#7A6D64', marginTop: 2, fontSize: 11, fontWeight: '700' },
  professionText: { color: '#5B5048', marginTop: 2, fontSize: 11, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F7F3EE', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  metricText: { color: '#4A4038', fontSize: 10, fontWeight: '900' },
  actionsColumn: { width: 68, alignItems: 'center', gap: 6 },
  levelBadge: {
    width: '100%',
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E0C4EA',
  },
  levelName: { color: PRIMARY, fontSize: 10, fontWeight: '900', textAlign: 'center', lineHeight: 12 },
  contactBtn: { width: 32, height: 28, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  bonusCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 5,
    paddingRight: 4,
  },
  bonusCoinText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#C79C47',
  },
});
