import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppTheme } from '../hooks/useAppTheme';
import { Alert, Animated, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout, selectUser } from '../redux/slices/authSlice';
import { selectExpiresAt, selectPlan } from '../redux/slices/subscriptionSlice';
import { setLanguage } from '../redux/slices/languageSlice';
import { fcmAPI } from '../firebase-config';
import { persistor, RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import TactileCard from '../components/TactileCard';
import TactileButton from '../components/TactileButton';
import { APP_VERSION } from '../utils/constants';
import { CHAIKA_LEVELS, getChaikaActivity, getLevelName } from '../utils/chaikaLevels';
import { profilePermissionService } from '../services/profilePermissionService';
import { logClientEvent } from '../utils/errorLogger';
import AppPhotoImage from '../components/AppPhotoImage';
import { signOutPrimarySession } from '../services/authSessionService';
import { subscribeCurrentUserSecurityRole, type SecurityRole } from '../services/securityRoles';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { subscribeMyBonuses, BONUS_CAPS, type UserBonuses } from '../services/bonusService';
import { subscribeToUserTicket, hasUnreadAdminReply } from '../services/supportService';
import {
  setHasContactRequest,
  setHasSupportReply,
  setHasSubscriptionChanged,
  selectHasSupportReply,
  selectHasSubscriptionChanged,
} from '../redux/slices/notificationSlice';


type AppNavigation = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    guest: 'Гість',
    exitTitle: 'Вихід з акаунту',
    exitConfirm: 'Ви впевнені, що хочете вийти?',
    cancel: 'Скасувати',
    exit: 'Вийти',
    login: 'Увійти',
    accountSettings: 'Налаштування акаунту',
    completeRegistration: 'Реєстрація і вхід',
    userStatus: 'Статус користувача',
    editProfile: 'Редагувати профіль',
    myPhotos: 'Мої фотографії',
    favorites: 'Обране',
    uploadPhoto: 'Завантажити фото',
    myRequests: 'Мої заявки',
    helpHistory: 'Історія допомоги',
    notifications: 'Сповіщення',
    appMonitor: 'Монітор застосунку',
    requestsAdmin: 'Усі заявки (адмін)',
    moderation: 'Центр модерації',
    moderationPasscodeTitle: 'Міні-пароль модерації',
    moderationPasscodeHint: 'Введіть код доступу до сервісного центру.',
    moderationPasscodePlaceholder: 'Код',
    moderationPasscodeError: 'Невірний код доступу',
    moderationPasscodeConfirm: 'Увійти',
    notificationsSoon: 'Налаштування сповіщень ще не підключені',
    subscription: 'Підписка',
    manageSubscription: 'Керувати підпискою',
    buildingRating: 'Рейтинг будинків',
    guarantor: 'Поручитель',
    memberLevel: 'Рівень учасника',
    showFullStatus: 'Дивитися повний статус',
    hideFullStatus: 'Сховати повний статус',
    activityPoints: (points: number) => `${points} балів активності`,
    maxLevel: 'Максимальний рівень',
    nextLevelByDays: (levelName: string, days: number) => `До "${levelName}" ще ${days} дн.`,
    nextLevelByPoints: (levelName: string, points: number) => `До "${levelName}" ще ${points} балів`,
    dayLock: 'Перехід на наступний рівень відкриється тільки після потрібного строку використання застосунку.',
    pointsRequest: 'заявка',
    pointsReview: 'відгук',
    pointsLike: 'лайк',
    pointsDay: 'день',
    showLevels: 'Показати всі рівні',
    hideLevels: 'Сховати рівні',
    levelRequirement: (points: number, days: number) => `від ${points} балів і ${days} днів`,
    currentLevel: 'поточний',
    requests: 'Заявок',
    reviews: 'Відгуків',
    days: 'Днів',
    until: 'до',
    language: 'Мова',
    allRights: 'Всі права захищені',
    plans: { free: 'Безкоштовно', premium: 'Преміум', premium_plus: 'Преміум+' },
    sectionActivity: 'Моя активність',
    sectionSettings: 'Налаштування',
    sectionServices: 'Підписка та сервіси',
    contactRequests: "Хочуть зв'язатись",
    contactRequestsHint: 'нових запитів',
    bonusTitle: 'Бонуси за довіру',
    bonusInvites: 'Запрошення',
    bonusLikes: 'Лайки',
    bonusHelp: 'Допомога',
    bonusBadgeNewcomer: 'Новачок',
    bonusBadgeGoodNeighbor: 'Добрий сусід',
    bonusBadgeActiveResident: 'Активний житель',
    bonusBadgeGuardian: 'Хранитель Чайки',
    bonusBadgeAmbassador: 'Посол довіри',
    bonusNextBadge: (badge: string, points: number) => `До "${badge}" ще ${points} бонусів`,
    bonusMaxBadge: 'Максимальний статус',
    seeMore: 'Більше',
    seeLess: 'Згорнути',
  },
  ru: {
    guest: 'Гость',
    exitTitle: 'Выход из аккаунта',
    exitConfirm: 'Вы уверены, что хотите выйти?',
    cancel: 'Отмена',
    exit: 'Выйти',
    login: 'Войти',
    accountSettings: 'Настройки аккаунта',
    completeRegistration: 'Регистрация и вход',
    userStatus: 'Статус пользователя',
    editProfile: 'Редактировать профиль',
    myPhotos: 'Мои фотографии',
    favorites: 'Избранное',
    uploadPhoto: 'Загрузить фото',
    myRequests: 'Мои заявки',
    helpHistory: 'История помощи',
    notifications: 'Уведомления',
    appMonitor: 'Монитор приложения',
    requestsAdmin: 'Все заявки (админ)',
    moderation: 'Центр модерации',
    moderationPasscodeTitle: 'Мини-пароль модерации',
    moderationPasscodeHint: 'Введите код доступа к сервисному центру.',
    moderationPasscodePlaceholder: 'Код',
    moderationPasscodeError: 'Неверный код доступа',
    moderationPasscodeConfirm: 'Войти',
    notificationsSoon: 'Настройки уведомлений пока не подключены',
    subscription: 'Подписка',
    manageSubscription: 'Управлять подпиской',
    buildingRating: 'Рейтинг домов',
    guarantor: 'Поручитель',
    memberLevel: 'Уровень участника',
    showFullStatus: 'Смотреть полный статус',
    hideFullStatus: 'Скрыть полный статус',
    activityPoints: (points: number) => `${points} баллов активности`,
    maxLevel: 'Максимальный уровень',
    nextLevelByDays: (levelName: string, days: number) => `До "${levelName}" еще ${days} дн.`,
    nextLevelByPoints: (levelName: string, points: number) => `До "${levelName}" еще ${points} баллов`,
    dayLock: 'Переход на следующий уровень откроется только после нужного срока использования приложения.',
    pointsRequest: 'заявка',
    pointsReview: 'отзыв',
    pointsLike: 'лайк',
    pointsDay: 'день',
    showLevels: 'Показать все уровни',
    hideLevels: 'Скрыть уровни',
    levelRequirement: (points: number, days: number) => `от ${points} баллов и ${days} дней`,
    currentLevel: 'текущий',
    requests: 'Заявок',
    reviews: 'Отзывов',
    days: 'Дней',
    until: 'до',
    language: 'Язык',
    allRights: 'Все права защищены',
    plans: { free: 'Бесплатно', premium: 'Премиум', premium_plus: 'Премиум+' },
    sectionActivity: 'Моя активность',
    sectionSettings: 'Настройки',
    sectionServices: 'Подписка и сервисы',
    contactRequests: 'Хотят связаться',
    contactRequestsHint: 'новых запросов',
    bonusTitle: 'Бонусы за доверие',
    bonusInvites: 'Приглашения',
    bonusLikes: 'Лайки',
    bonusHelp: 'Помощь',
    bonusBadgeNewcomer: 'Новичок',
    bonusBadgeGoodNeighbor: 'Добрый сосед',
    bonusBadgeActiveResident: 'Активный житель',
    bonusBadgeGuardian: 'Хранитель Чайки',
    bonusBadgeAmbassador: 'Посол доверия',
    bonusNextBadge: (badge: string, points: number) => `До "${badge}" ещё ${points} бонусов`,
    bonusMaxBadge: 'Максимальный статус',
    seeMore: 'Больше',
    seeLess: 'Свернуть',
  },
  en: {
    guest: 'Guest',
    exitTitle: 'Sign out',
    exitConfirm: 'Are you sure you want to sign out?',
    cancel: 'Cancel',
    exit: 'Sign out',
    login: 'Sign in',
    accountSettings: 'Account settings',
    completeRegistration: 'Sign in / Register',
    userStatus: 'User status',
    editProfile: 'Edit profile',
    myPhotos: 'My photos',
    favorites: 'Favorites',
    uploadPhoto: 'Upload photo',
    myRequests: 'My requests',
    helpHistory: 'Help history',
    notifications: 'Notifications',
    appMonitor: 'Application monitor',
    requestsAdmin: 'All requests (admin)',
    moderation: 'Moderation center',
    moderationPasscodeTitle: 'Moderation passcode',
    moderationPasscodeHint: 'Enter the service center access code.',
    moderationPasscodePlaceholder: 'Code',
    moderationPasscodeError: 'Invalid access code',
    moderationPasscodeConfirm: 'Open',
    notificationsSoon: 'Notification settings are not connected yet',
    subscription: 'Subscription',
    manageSubscription: 'Manage subscription',
    buildingRating: 'Building rating',
    guarantor: 'Guarantor',
    memberLevel: 'Member level',
    showFullStatus: 'View full status',
    hideFullStatus: 'Hide full status',
    activityPoints: (points: number) => `${points} activity points`,
    maxLevel: 'Maximum level',
    nextLevelByDays: (levelName: string, days: number) => `${days} days until "${levelName}"`,
    nextLevelByPoints: (levelName: string, points: number) => `${points} points until "${levelName}"`,
    dayLock: 'The next level unlocks only after the required app usage period.',
    pointsRequest: 'request',
    pointsReview: 'review',
    pointsLike: 'like',
    pointsDay: 'day',
    showLevels: 'Show all levels',
    hideLevels: 'Hide levels',
    levelRequirement: (points: number, days: number) => `from ${points} points and ${days} days`,
    currentLevel: 'current',
    requests: 'Requests',
    reviews: 'Reviews',
    days: 'Days',
    until: 'until',
    language: 'Language',
    allRights: 'All rights reserved',
    plans: { free: 'Free', premium: 'Premium', premium_plus: 'Premium+' },
    sectionActivity: 'My activity',
    sectionSettings: 'Settings',
    sectionServices: 'Subscription & services',
    contactRequests: 'Contact requests',
    contactRequestsHint: 'new requests',
    bonusTitle: 'Trust bonuses',
    bonusInvites: 'Invitations',
    bonusLikes: 'Likes',
    bonusHelp: 'Help',
    bonusBadgeNewcomer: 'Newcomer',
    bonusBadgeGoodNeighbor: 'Good neighbor',
    bonusBadgeActiveResident: 'Active resident',
    bonusBadgeGuardian: 'Chaika Guardian',
    bonusBadgeAmbassador: 'Trust Ambassador',
    bonusNextBadge: (badge: string, points: number) => `${points} bonuses until "${badge}"`,
    bonusMaxBadge: 'Maximum status',
    seeMore: 'More',
    seeLess: 'Less',
  },
} as const;

const LANG_OPTIONS = [
  { code: 'ua' as const, label: 'УКР' },
  { code: 'ru' as const, label: 'РУС' },
  { code: 'en' as const, label: 'ENG' },
];

const SERVICE_MODERATION_PIN: string = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.serviceModerationPin ?? '';
const PRIMARY_MODERATION_EMAIL = 'vikramsave@ukr.net';
const PROFILE_REQUESTS_LAST_SEEN_AT_KEY = '@chaika:profile_requests_last_seen_at:';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<AppNavigation>();
  const dispatch = useDispatch();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const plan = useSelector(selectPlan);
  const expiresAt = useSelector(selectExpiresAt);
  const user = useSelector(selectUser);
  const appRequests = useSelector((state: RootState) => state.requests?.items ?? []);
  const approvedRequests = useSelector((state: RootState) => state.requests?.approved ?? []);
  const helpRequests = useSelector((state: RootState) => state.helpRequests?.items ?? []);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [moderationPinVisible, setModerationPinVisible] = useState(false);
  const [moderationPin, setModerationPin] = useState('');
  const [moderationPinError, setModerationPinError] = useState('');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [latestPendingRequestedAtMs, setLatestPendingRequestedAtMs] = useState(0);
  const [lastSeenPendingAtMs, setLastSeenPendingAtMs] = useState(0);
  const [moderationUnlocked, setModerationUnlocked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bonuses, setBonuses] = useState<UserBonuses | null>(null);
  const hasSupportReply = useSelector(selectHasSupportReply);
  const hasSubscriptionChanged = useSelector(selectHasSubscriptionChanged);
  const isLoggedIn = Boolean(user?.id);
  const hasPrimaryModerationAccess = Boolean(
    user?.id &&
    typeof user?.email === 'string' &&
    user.email.trim().toLowerCase() === PRIMARY_MODERATION_EMAIL
  );
  const uaTapCountRef = React.useRef(0);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const subGlowAnim = React.useRef(new Animated.Value(0)).current;

  const handleLogout = useCallback(() => {
    Alert.alert(text.exitTitle, text.exitConfirm, [
      { text: text.cancel },
      {
        text: text.exit,
        style: 'destructive',
        onPress: async () => {
          if (user?.id) {
            await fcmAPI.removeTokenForUser(user.id).catch(() => undefined);
          }
          await signOutPrimarySession({ resumeAnonymous: true }).catch(() => undefined);
          dispatch(logout());
          await persistor.purge().catch(() => undefined);
          navigation.navigate('MainTabs', { screen: 'HomeTab' });
        },
      },
    ]);
  }, [dispatch, navigation, text.cancel, text.exit, text.exitConfirm, text.exitTitle, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    const unsubscribeRole = subscribeCurrentUserSecurityRole((snapshot: { role: SecurityRole }) => {
      setIsAdmin(snapshot.role === 'admin');
    });
    return unsubscribeRole;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setPendingRequestsCount(0);
      setLatestPendingRequestedAtMs(0);
      setLastSeenPendingAtMs(0);
      return;
    }
    const unsub = profilePermissionService.subscribeToPendingSummary(user.id, (summary) => {
      setPendingRequestsCount(summary.count);
      setLatestPendingRequestedAtMs(summary.latestRequestedAtMs);
    });
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setBonuses(null);
      return;
    }
    const unsub = subscribeMyBonuses(setBonuses);
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${PROFILE_REQUESTS_LAST_SEEN_AT_KEY}${user.id}`);
        if (cancelled) return;
        const parsed = raw ? Number(raw) : 0;
        setLastSeenPendingAtMs(Number.isFinite(parsed) ? parsed : 0);
      } catch {
        if (!cancelled) setLastSeenPendingAtMs(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const hasUnreadPendingRequests = pendingRequestsCount > 0 && latestPendingRequestedAtMs > lastSeenPendingAtMs;

  useEffect(() => {
    dispatch(setHasContactRequest(hasUnreadPendingRequests));
  }, [hasUnreadPendingRequests, dispatch]);

  useEffect(() => {
    if (!user?.id) {
      dispatch(setHasSupportReply(false));
      return;
    }
    const unsub = subscribeToUserTicket(user.id, (ticket) => {
      dispatch(setHasSupportReply(hasUnreadAdminReply(ticket)));
    });
    return unsub;
  }, [user?.id, dispatch]);

  const markPendingRequestsSeen = useCallback(() => {
    if (!user?.id) return;
    const seenAt = Date.now();
    setLastSeenPendingAtMs(seenAt);
    void AsyncStorage.setItem(`${PROFILE_REQUESTS_LAST_SEEN_AT_KEY}${user.id}`, String(seenAt)).catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(subGlowAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(subGlowAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [subGlowAnim]);

  useEffect(() => {
    if (!hasUnreadPendingRequests) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [hasUnreadPendingRequests, pulseAnim]);

  useFocusEffect(
    useCallback(() => {
      uaTapCountRef.current = 0;
      setModerationUnlocked(false);
    }, [])
  );

  const handleEditProfile = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('EditProfileScreen');
      return;
    }
    navigation.navigate('EditProfileScreen');
  }, [navigation]);

  const handleSupportPress = useCallback(() => {
    dispatch(setHasSupportReply(false));
    navigation.navigate('SupportScreen');
  }, [navigation, dispatch]);

  const openServiceModerationPin = useCallback(() => {
    if (!hasPrimaryModerationAccess) {
      return;
    }
    setModerationPin('');
    setModerationPinError('');
    setModerationPinVisible(true);
  }, [hasPrimaryModerationAccess]);

  const closeServiceModerationPin = useCallback(() => {
    setModerationPinVisible(false);
    setModerationPin('');
    setModerationPinError('');
  }, []);

  const submitServiceModerationPin = useCallback(() => {
    if (!hasPrimaryModerationAccess) {
      closeServiceModerationPin();
      return;
    }
    if (moderationPin.trim() !== SERVICE_MODERATION_PIN) {
      void logClientEvent('service_moderation_pin_denied', { uid: user?.id ?? null });
      setModerationPinError(text.moderationPasscodeError);
      return;
    }

    closeServiceModerationPin();
    navigation.navigate('ServiceModerationScreen');
  }, [closeServiceModerationPin, hasPrimaryModerationAccess, moderationPin, navigation, text.moderationPasscodeError, user?.id]);

  const planLabel = text.plans[plan as keyof typeof text.plans] ?? text.plans.free;
  const locale = language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'uk-UA';

  const handleLanguagePress = useCallback((code: 'ua' | 'ru' | 'en') => {
    if (code === 'ua') {
      uaTapCountRef.current += 1;
      if (uaTapCountRef.current >= 3) setModerationUnlocked(true);
    } else {
      uaTapCountRef.current = 0;
    }

    dispatch(setLanguage(code));
  }, [dispatch]);

  const activity = useMemo(() => {
    const requestCount = appRequests.length + helpRequests.length;
    const reviewCount = approvedRequests.length;
    const likeCount = 0;
    const levelActivity = getChaikaActivity({
      registeredAt: user?.registeredAt,
      daysUsed: user?.daysUsed,
      requestCount,
      reviewCount,
      likeCount,
    });

    return {
      requestCount,
      reviewCount,
      likeCount,
      ...levelActivity,
    };
  }, [appRequests.length, approvedRequests.length, helpRequests.length, user?.daysUsed, user?.registeredAt]);
  const profileAvatarUri = useMemo(() => pickUserAvatarUri(user), [user]);
  const { colors, isDark } = useAppTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
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
        <TactileCard elevated style={styles.headerCard} pressable={false}>
          <View style={styles.avatarCircle}>
            {profileAvatarUri ? (
              <AppPhotoImage uri={profileAvatarUri} style={styles.headerImage} resizeMode="cover" debugLabel={`Profile:${user?.id || 'unknown'}`} />
            ) : (
              <Image source={require('../../assets/WEBP-version/profil.webp')} style={styles.headerImage} resizeMode="cover" />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.userName, !user?.name && styles.userNameGuest]}>{user?.name || text.guest}</Text>
            {user?.email ? <Text style={styles.userMeta}>{user.email}</Text> : null}
            {user?.phone ? <Text style={styles.userMeta}>{user.phone}</Text> : null}
          </View>
        </TactileCard>

        <Text style={[styles.sectionLabel, { color: isDark ? '#F5E8F0' : undefined }]}>{text.sectionActivity}</Text>
        <View style={styles.statsRow}>
          {[
            { icon: 'clipboard-check-outline', value: String(activity.requestCount), label: text.requests, color: SCREEN_THEME.terracotta },
            { icon: 'star-outline', value: String(activity.reviewCount), label: text.reviews, color: '#C79C47' },
            { icon: 'calendar-check-outline', value: String(activity.daysInApp), label: text.days, color: SCREEN_THEME.woodGreen },
          ].map((item) => (
            <TactileCard key={item.label} elevated={false} style={styles.statItem} pressable={false}>
              <TactileIcon icon={item.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={42} iconSize={18} backgroundColor={item.color} />
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </TactileCard>
          ))}
        </View>

        <TactileCard elevated style={styles.levelCard} pressable={false}>
          <View style={styles.levelTop}>
            <TactileIcon icon="trophy-award" size={54} iconSize={25} backgroundColor={SCREEN_THEME.woodGreenDark} />
            <View style={styles.levelCopy}>
              <Text style={styles.levelEyebrow}>{text.memberLevel}</Text>
              <Text style={styles.levelTitle}>
                {activity.currentLevel.level}. {getLevelName(activity.currentLevel, language)}
              </Text>
            </View>
            <TouchableOpacity style={styles.fullStatusButton} onPress={() => setLevelsOpen((value) => !value)} activeOpacity={0.82}>
              <Text style={styles.fullStatusButtonText}>{levelsOpen ? text.hideFullStatus : text.showFullStatus}</Text>
              <MaterialCommunityIcons name={levelsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={SCREEN_THEME.woodGreenDark} />
            </TouchableOpacity>
          </View>

          {levelsOpen ? (
            <View style={styles.fullStatusContent}>
              <Text style={styles.levelScore}>{text.activityPoints(activity.points)}</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${activity.progress}%` }]} />
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{activity.progress}%</Text>
                <Text style={styles.progressText}>
                  {activity.nextLevel
                    ? activity.blockedByDays
                      ? text.nextLevelByDays(getLevelName(activity.nextLevel, language), activity.daysToNext)
                      : text.nextLevelByPoints(getLevelName(activity.nextLevel, language), activity.pointsToNext)
                    : text.maxLevel}
                </Text>
              </View>

              {activity.blockedByDays ? (
                <View style={styles.dayLockBox}>
                  <MaterialCommunityIcons name="lock-clock" size={18} color={SCREEN_THEME.terracottaDark} />
                  <Text style={styles.dayLockText}>{text.dayLock}</Text>
                </View>
              ) : null}

              <View style={styles.pointsGrid}>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsValue}>+15</Text>
                  <Text style={styles.pointsLabel}>{text.pointsRequest}</Text>
                </View>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsValue}>+10</Text>
                  <Text style={styles.pointsLabel}>{text.pointsReview}</Text>
                </View>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsValue}>+2</Text>
                  <Text style={styles.pointsLabel}>{text.pointsLike}</Text>
                </View>
                <View style={styles.pointsPill}>
                  <Text style={styles.pointsValue}>+3</Text>
                  <Text style={styles.pointsLabel}>{text.pointsDay}</Text>
                </View>
              </View>

              <View style={styles.levelsList}>
                {CHAIKA_LEVELS.map((item) => {
                  const isCurrent = item.level === activity.currentLevel.level;
                  const isDone = activity.points >= item.points && activity.daysInApp >= item.days;
                  return (
                    <View key={item.level} style={[styles.levelItem, isCurrent && styles.levelItemActive]}>
                      <View style={[styles.levelBadge, isDone && styles.levelBadgeDone]}>
                        <Text style={[styles.levelBadgeText, isDone && styles.levelBadgeTextDone]}>{item.level}</Text>
                      </View>
                      <View style={styles.levelItemCopy}>
                        <Text style={styles.levelItemName}>{getLevelName(item, language)}</Text>
                        <Text style={styles.levelItemPoints}>
                          {text.levelRequirement(item.points, item.days)}
                        </Text>
                      </View>
                      {isCurrent ? <Text style={styles.currentLevelMark}>{text.currentLevel}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </TactileCard>

        {/* Trust bonuses card */}
        {isLoggedIn && (<TouchableOpacity
          activeOpacity={0.86}
          onPress={() => navigation.navigate('BonusWalletScreen')}
          style={styles.bonusCard}
        >
          <View style={styles.bonusHeader}>
            <MaterialCommunityIcons name="circle-multiple" size={22} color="#C79C47" />
            <Text style={styles.bonusTitle}>{text.bonusTitle}</Text>
            <Text style={styles.bonusTotal}>{bonuses?.total ?? 0}</Text>
          </View>

          <View style={styles.bonusProgressTrack}>
            <View style={[styles.bonusProgressFill, { width: `${Math.min(100, ((bonuses?.total ?? 0) / BONUS_CAPS.total) * 100)}%` }]} />
          </View>

          <View style={styles.bonusBreakdown}>
            <View style={styles.bonusBreakdownItem}>
              <MaterialCommunityIcons name="account-plus" size={14} color="#4CAF50" />
              <Text style={styles.bonusBreakdownLabel}>{text.bonusInvites}</Text>
              <Text style={styles.bonusBreakdownValue}>{bonuses?.invites.points ?? 0}</Text>
            </View>
            <View style={styles.bonusBreakdownItem}>
              <MaterialCommunityIcons name="heart" size={14} color="#E91E63" />
              <Text style={styles.bonusBreakdownLabel}>{text.bonusLikes}</Text>
              <Text style={styles.bonusBreakdownValue}>{bonuses?.likes.points ?? 0}</Text>
            </View>
            <View style={styles.bonusBreakdownItem}>
              <MaterialCommunityIcons name="handshake" size={14} color="#2196F3" />
              <Text style={styles.bonusBreakdownLabel}>{text.bonusHelp}</Text>
              <Text style={styles.bonusBreakdownValue}>{bonuses?.help.points ?? 0}</Text>
            </View>
          </View>

          {bonuses ? (
            <View style={styles.bonusBadgeRow}>
              <MaterialCommunityIcons
                name={bonuses.badge === 'ambassador' ? 'star-circle' : bonuses.badge === 'guardian' ? 'shield-star' : 'medal'}
                size={16}
                color="#C79C47"
              />
              <Text style={styles.bonusBadgeText}>
                {(({
                  newcomer: text.bonusBadgeNewcomer,
                  good_neighbor: text.bonusBadgeGoodNeighbor,
                  active_resident: text.bonusBadgeActiveResident,
                  guardian: text.bonusBadgeGuardian,
                  ambassador: text.bonusBadgeAmbassador,
                }) as Record<string, string>)[bonuses.badge] || text.bonusBadgeNewcomer}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={SCREEN_THEME.textSecondary} style={{ marginLeft: 'auto' }} />
            </View>
          ) : null}
        </TouchableOpacity>)}

        <Text style={[styles.sectionLabel, { color: isDark ? '#F5E8F0' : undefined }]}>{text.sectionSettings}</Text>
        <TactileCard elevated style={styles.card} pressable={false}>
          <View style={styles.cardHeader}>
            <TactileIcon icon="cog-outline" size={40} iconSize={18} backgroundColor="#403933" />
            <Text style={styles.cardTitle}>{text.accountSettings}</Text>
          </View>

          {!isLoggedIn && (
            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('LoginScreen')} activeOpacity={0.84}>
              <TactileIcon icon="login-variant" size={40} iconSize={18} backgroundColor="#5C7A5C" />
              <Text style={styles.menuLabel}>{text.completeRegistration}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile} activeOpacity={0.84}>
            <TactileIcon icon="pencil-outline" size={40} iconSize={18} backgroundColor={SCREEN_THEME.terracotta} />
            <Text style={styles.menuLabel}>{text.editProfile}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('MyPhotosScreen')} activeOpacity={0.84}>
            <TactileIcon icon="image-multiple-outline" size={40} iconSize={18} backgroundColor="#6A8BA5" />
            <Text style={styles.menuLabel}>{text.myPhotos}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>

          {settingsExpanded && (
            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('FavoritesScreen')} activeOpacity={0.84}>
              <TactileIcon icon="bookmark-outline" size={40} iconSize={18} backgroundColor="#C77A5D" />
              <Text style={styles.menuLabel}>{text.favorites}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              markPendingRequestsSeen();
              navigation.navigate('ProfileRequestsScreen');
            }}
            activeOpacity={0.84}
          >
            <TactileIcon icon="account-arrow-left-outline" size={40} iconSize={18} backgroundColor="#7A1E5C" />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{text.contactRequests}</Text>
            </View>
            {hasUnreadPendingRequests ? (
              <Animated.View style={[styles.requestsBadge, { opacity: pulseAnim }]}>
                <Text style={styles.requestsBadgeText}>{pendingRequestsCount} {text.contactRequestsHint}</Text>
              </Animated.View>
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
            )}
          </TouchableOpacity>

          {settingsExpanded && (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('MyRequestsScreen')} activeOpacity={0.84}>
                <TactileIcon icon="clipboard-text-outline" size={40} iconSize={18} backgroundColor="#4B7F9E" />
                <Text style={styles.menuLabel}>{text.myRequests}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('HelpHistoryScreen')} activeOpacity={0.84}>
                <TactileIcon icon="history" size={40} iconSize={18} backgroundColor="#8A7AB1" />
                <Text style={styles.menuLabel}>{text.helpHistory}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AppMonitorScreen')} activeOpacity={0.84}>
                <TactileIcon icon="monitor-dashboard" size={40} iconSize={18} backgroundColor="#4B7F9E" />
                <Text style={styles.menuLabel}>{text.appMonitor}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.settingsSeeMoreBtn} onPress={() => setSettingsExpanded(v => !v)} activeOpacity={0.8}>
            <Text style={styles.settingsSeeMoreText}>{settingsExpanded ? text.seeLess : text.seeMore}</Text>
            <MaterialCommunityIcons name={settingsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={SCREEN_THEME.accentGold} />
          </TouchableOpacity>

          {plan === 'business_plus' ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('BonusWalletScreen')}
              activeOpacity={0.84}
            >
              <TactileIcon icon="wallet-outline" size={40} iconSize={18} backgroundColor="#D4A017" />
              <Text style={styles.menuLabel}>{language === 'ua' ? 'Мої промо-кредити' : language === 'ru' ? 'Мои промо-кредиты' : 'My promo credits'}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          ) : null}

          {isAdmin ? (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => navigation.navigate('RequestsScreen')}
                activeOpacity={0.84}
              >
                <TactileIcon icon="clipboard-list-outline" size={40} iconSize={18} backgroundColor="#7A1E5C" />
                <Text style={styles.menuLabel}>{text.requestsAdmin}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => navigation.navigate('PromoCreditsAdminScreen')}
                activeOpacity={0.84}
              >
                <TactileIcon icon="credit-card-check-outline" size={40} iconSize={18} backgroundColor="#5F7B4D" />
                <Text style={styles.menuLabel}>Промо-кредиты</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
              </TouchableOpacity>
            </>
          ) : null}

          {moderationUnlocked && hasPrimaryModerationAccess ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={openServiceModerationPin}
              activeOpacity={0.84}
            >
              <TactileIcon icon="shield-crown-outline" size={40} iconSize={18} backgroundColor="#6C47A6" />
              <Text style={styles.menuLabel}>{text.moderation}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          ) : null}

          <View style={[styles.menuItem, styles.menuItemLast]}>
            <TactileIcon icon="translate" size={40} iconSize={18} backgroundColor="#4B7F9E" />
            <Text style={styles.menuLabel}>{text.language}</Text>
            <View style={styles.langPicker}>
              {LANG_OPTIONS.map((opt) => {
                const active = language === opt.code;
                return (
                  <TouchableOpacity
                    key={opt.code}
                    style={[styles.langBtn, active && styles.langBtnActive]}
                    onPress={() => handleLanguagePress(opt.code)}
                    activeOpacity={0.78}
                  >
                    <View style={styles.langBtnInner}>
                      <Text style={[styles.langBtnText, active && styles.langBtnTextActive]}>
                        {opt.code === 'ua' ? `🇺🇦 ${opt.label}` : opt.label}
                      </Text>
                      {opt.code === 'ru' ? (
                        <Image source={require('../../assets/WEBP-version/Russia No war.webp')} style={styles.noWarLangIcon} resizeMode="contain" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TactileCard>

        <Text style={[styles.sectionLabel, { color: isDark ? '#F5E8F0' : undefined }]}>{text.sectionServices}</Text>
        <TactileCard elevated style={styles.card} pressable={false}>
          <View style={styles.cardHeader}>
            <TactileIcon icon="crown-outline" size={40} iconSize={18} backgroundColor="#403933" />
            <Text style={styles.cardTitle}>{text.subscription}</Text>
          </View>

          <View style={styles.subscriptionBanner}>
            <Text style={styles.subscriptionPlan}>{planLabel}</Text>
            {expiresAt ? (
              <Text style={styles.subscriptionExpiry}>
                {text.until} {new Date(expiresAt).toLocaleDateString(locale)}
              </Text>
            ) : null}
          </View>

          <View style={{ position: 'relative' }}>
            <Animated.View style={[
              styles.subscriptionButtonWrapper,
              {
                opacity: subGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
              },
            ]}>
              <TactileButton
                title={text.manageSubscription}
                onPress={() => { dispatch(setHasSubscriptionChanged(false)); navigation.navigate('SubscriptionScreen'); }}
                variant="primary"
                style={styles.subscriptionButton}
                textStyle={{ color: '#FFFFFF', letterSpacing: 0.5 }}
                icon={<MaterialCommunityIcons name="crown" size={18} color="#C9A84C" />}
              />
            </Animated.View>
            {hasSubscriptionChanged && (
              <View style={styles.greenNotifDotButton} />
            )}
          </View>

        </TactileCard>

        <View style={{ position: 'relative' }}>
          <TactileButton
            title={language === 'ua' ? 'Служба підтримки' : language === 'ru' ? 'Служба поддержки' : 'Support service'}
            onPress={handleSupportPress}
            variant="secondary"
            style={styles.supportButton}
            icon={<MaterialCommunityIcons name="headset" size={22} color="#4E5F43" />}
          />
          {hasSupportReply && (
            <View style={styles.greenNotifDotButton} />
          )}
        </View>

        <TactileButton
          title={isLoggedIn ? text.exit : text.login}
          onPress={isLoggedIn ? handleLogout : () => navigation.navigate('LoginScreen')}
          variant="primary"
          style={
            isLoggedIn
              ? { backgroundColor: '#D05B4D', borderColor: '#A0403A' }
              : { backgroundColor: '#5C7A5C', borderColor: '#3F5E3F' }
          }
          textStyle={{ color: '#FFFFFF' }}
          icon={<MaterialCommunityIcons name={isLoggedIn ? 'logout' : 'login'} size={22} color="#FFFFFF" />}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{`Chaika Life v${APP_VERSION}`}</Text>
          <Text style={styles.footerSubtext}>© 2026 {text.allRights}</Text>
        </View>
      </ScrollView>

      <Modal
        visible={moderationPinVisible}
        transparent
        animationType="fade"
        onRequestClose={closeServiceModerationPin}
      >
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <View style={styles.pinIconWrap}>
              <MaterialCommunityIcons name="shield-key-outline" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.pinTitle}>{text.moderationPasscodeTitle}</Text>
            <Text style={styles.pinHint}>{text.moderationPasscodeHint}</Text>
            <TextInput
              value={moderationPin}
              onChangeText={(value) => {
                setModerationPin(value.replace(/\D/g, '').slice(0, SERVICE_MODERATION_PIN.length));
                setModerationPinError('');
              }}
              placeholder={text.moderationPasscodePlaceholder}
              placeholderTextColor="#9A8F80"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={SERVICE_MODERATION_PIN.length}
              autoFocus
              style={[styles.pinInput, moderationPinError ? styles.pinInputError : null]}
              onSubmitEditing={submitServiceModerationPin}
            />
            {moderationPinError ? <Text style={styles.pinError}>{moderationPinError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity style={[styles.pinButton, styles.pinCancelButton]} onPress={closeServiceModerationPin} activeOpacity={0.82}>
                <Text style={styles.pinCancelText}>{text.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pinButton, styles.pinConfirmButton]} onPress={submitServiceModerationPin} activeOpacity={0.82}>
                <Text style={styles.pinConfirmText}>{text.moderationPasscodeConfirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBgSoft },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { padding: 16, paddingBottom: 36 },
  headerCard: {
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: SCREEN_THEME.terracotta,
    marginBottom: 4,
  },
  registerCta: {
    marginBottom: 14,
  },
  headerImage: {
    width: 100,
    height: 100,
  },
  headerInfo: {
    paddingTop: 10,
    alignItems: 'center',
  },
  userName: {
    fontSize: 22,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
  userNameGuest: {
    textAlign: 'center',
  },
  userMeta: { fontSize: 13, color: SCREEN_THEME.textSecondary, marginTop: 4, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8 },
  statLabel: { marginTop: 4, fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '700' },
  levelCard: {
    marginBottom: 14,
    padding: 16,
  },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelCopy: { flex: 1, minWidth: 0 },
  levelEyebrow: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  levelTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  levelScore: { color: SCREEN_THEME.terracottaDark, fontSize: 13, fontWeight: '900', marginTop: 4 },
  fullStatusButton: {
    maxWidth: 132,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#F7F0E6',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  fullStatusButtonText: {
    flexShrink: 1,
    color: SCREEN_THEME.woodGreenDark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  fullStatusContent: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    paddingTop: 14,
  },
  progressTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: '#E8DAC0',
    overflow: 'hidden',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#D9C69E',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.woodGreen,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 7,
  },
  progressText: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '800' },
  dayLockBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(200, 100, 69, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200, 100, 69, 0.24)',
    padding: 10,
    marginTop: 10,
  },
  dayLockText: {
    flex: 1,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  pointsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  pointsPill: {
    flex: 1,
    minWidth: '22%',
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    paddingVertical: 9,
  },
  pointsValue: { color: SCREEN_THEME.woodGreenDark, fontSize: 15, fontWeight: '900' },
  pointsLabel: { color: SCREEN_THEME.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 2 },
  levelsToggle: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#F7F0E6',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  levelsToggleText: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900' },
  levelsList: { gap: 8, marginTop: 12 },
  levelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 10,
  },
  levelItemActive: {
    backgroundColor: 'rgba(64, 91, 58, 0.12)',
    borderColor: SCREEN_THEME.woodGreen,
  },
  levelBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#E8DAC0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  levelBadgeDone: { backgroundColor: SCREEN_THEME.woodGreenDark },
  levelBadgeText: { color: SCREEN_THEME.textSecondary, fontSize: 14, fontWeight: '900' },
  levelBadgeTextDone: { color: '#fff' },
  levelItemCopy: { flex: 1 },
  levelItemName: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900' },
  levelItemPoints: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  currentLevelMark: { color: SCREEN_THEME.woodGreenDark, fontSize: 11, fontWeight: '900' },
  // Bonus card styles
  bonusCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8D5A0',
    shadowColor: '#C79C47',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  bonusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bonusTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#6B5E30',
  },
  bonusTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#C79C47',
  },
  bonusProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EDE0C0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  bonusProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#C79C47',
  },
  bonusBreakdown: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  bonusBreakdownItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3D0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  bonusBreakdownLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: '#8A7B50',
  },
  bonusBreakdownValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6B5E30',
  },
  bonusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#EDE0C0',
    paddingTop: 10,
  },
  bonusBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6B5E30',
  },
  card: {
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  cardTitle: { marginLeft: 10, fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, textShadowColor: SCREEN_THEME.embossDark, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginLeft: 12, textShadowColor: SCREEN_THEME.embossDark, textShadowOffset: { width: 0, height: 0.5 }, textShadowRadius: 1 },
  subscriptionBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(138, 122, 177, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(138, 122, 177, 0.22)',
  },
  subscriptionPlan: { fontSize: 16, fontWeight: '900', color: '#7B69A8' },
  subscriptionExpiry: { marginTop: 4, fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  subscriptionButtonWrapper: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    shadowColor: '#C9A84C',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  subscriptionButton: {
    backgroundColor: '#111111',
    borderColor: '#C9A84C',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  footer: { alignItems: 'center', paddingTop: 18 },
  footerText: { fontSize: 15, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  footerSubtext: { marginTop: 6, fontSize: 12, color: SCREEN_THEME.textSecondary },
  pinBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(29, 24, 20, 0.58)',
  },
  pinCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pinIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C47A6',
    marginBottom: 12,
  },
  pinTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  pinHint: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  pinInput: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9C69E',
    backgroundColor: '#FBF8FD',
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 5,
    color: SCREEN_THEME.textPrimary,
  },
  pinInputError: { borderColor: SCREEN_THEME.terracotta },
  pinError: { marginTop: 8, color: SCREEN_THEME.terracottaDark, fontSize: 12, fontWeight: '900' },
  pinActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pinButton: { flex: 1, minHeight: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pinCancelButton: { backgroundColor: '#F7F0E6', borderWidth: 1, borderColor: '#E4D0AB' },
  pinConfirmButton: { backgroundColor: '#6C47A6' },
  pinCancelText: { fontSize: 14, fontWeight: '900', color: SCREEN_THEME.textSecondary },
  pinConfirmText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  supportButton: { marginBottom: 12 },

  langPicker: {
    flexDirection: 'row',
    gap: 6,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#F7F0E6',
  },
  langBtnActive: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracotta,
  },
  langBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
  },
  langBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noWarLangIcon: { width: 18, height: 12, borderRadius: 2 },
  langBtnTextActive: {
    color: '#fff',
  },
  requestsBadge: {
    backgroundColor: '#7A1E5C',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  requestsBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  settingsSeeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SCREEN_THEME.borderSoft,
  },
  settingsSeeMoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#21041B',
    letterSpacing: 0.5,
  },
  greenNotifDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  greenNotifDotButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});

export default ProfileScreen;
