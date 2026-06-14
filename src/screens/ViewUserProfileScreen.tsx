import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import ContactReasonModal from '../components/ContactReasonModal';
import ReportBlockMenu from '../components/ReportBlockMenu';
import BlockReasonModal from '../components/BlockReasonModal';
import { reportBlockService } from '../services/reportBlockService';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { useContactRequest } from '../hooks/useContactRequest';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { useTranslation } from '../i18n/useTranslation';
import type { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import {
  loadProfileRecord,
} from '../services/authProfileService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase-core';
import { enqueueAndDrainAsync } from '../services/bonusQueue';
import { profilePermissionService } from '../services/profilePermissionService';
import { query, ref, get, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import type { JobListing } from '../services/jobService';
import { getDaysInApp } from '../utils/chaikaLevels';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import { requireAuthForDetails } from '../utils/authGuard';
import { useAppTheme } from '../hooks/useAppTheme';

const UI_TEXT = {
  ua: {
    title: 'Профіль користувача',
    sectionMain: 'Основні дані',
    sectionExtended: 'Розширена інформація',
    sectionLang: 'Сервіси',
    name: 'Імʼя',
    phone: 'Телефон',
    cityLabel: 'Вулиця',
    professionLabel: 'Професія',
    ageLabel: 'Вік',
    interestsLabel: 'Інтереси',
    businessTitle: 'Послуги',
    businessHint: 'Цей користувач пропонує послуги:',
    loading: 'Завантаження...',
    error: 'Помилка',
    errorLoadProfile: 'Не вдалося завантажити профіль',
    days: 'днів',
    likes: 'лайків',
    thankAwarded: '+3 бонуси надіслано!',
    thankAlready: 'Вже подяковано сьогодні',
    thankError: 'Помилка. Спробуйте пізніше.',
    thankSentLabel: 'Подяковано ✓',
    thankBtnLabel: 'Подякувати +3',
  },
  ru: {
    title: 'Профиль пользователя',
    sectionMain: 'Основные данные',
    sectionExtended: 'Расширенная информация',
    sectionLang: 'Сервисы',
    name: 'Имя',
    phone: 'Телефон',
    cityLabel: 'Улица',
    professionLabel: 'Профессия',
    ageLabel: 'Возраст',
    interestsLabel: 'Интересы',
    businessTitle: 'Услуги',
    businessHint: 'Этот пользователь предлагает услуги:',
    loading: 'Загрузка...',
    error: 'Ошибка',
    errorLoadProfile: 'Не удалось загрузить профиль',
    days: 'дней',
    likes: 'лайков',
    thankAwarded: '+3 бонуса отправлено!',
    thankAlready: 'Уже поблагодарено сегодня',
    thankError: 'Ошибка. Попробуйте позже.',
    thankSentLabel: 'Поблагодарено ✓',
    thankBtnLabel: 'Поблагодарить +3',
  },
  en: {
    title: 'User Profile',
    sectionMain: 'Basic information',
    sectionExtended: 'Extended information',
    sectionLang: 'Services',
    name: 'Name',
    phone: 'Phone',
    cityLabel: 'Street',
    professionLabel: 'Profession',
    ageLabel: 'Age',
    interestsLabel: 'Interests',
    businessTitle: 'Services',
    businessHint: 'This user offers services:',
    loading: 'Loading...',
    error: 'Error',
    errorLoadProfile: 'Failed to load profile',
    days: 'days',
    likes: 'likes',
    thankAwarded: '+3 bonuses sent!',
    thankAlready: 'Already thanked today',
    thankError: 'Error. Please try again.',
    thankSentLabel: 'Thanked ✓',
    thankBtnLabel: 'Thank +3',
  },
} as const;

const ACTION_TEXT = {
  ua: {
    report: 'Поскаржитись',
    block: 'Заблокувати',
    unblock: 'Розблокувати',
  },
  ru: {
    report: 'Пожаловаться',
    block: 'Заблокировать',
    unblock: 'Разблокировать',
  },
  en: {
    report: 'Report',
    block: 'Block',
    unblock: 'Unblock',
  },
} as const;

const CONTACT_TEXT = {
  ua: {
    call: 'Зателефонувати',
    viber: 'Viber',
    copy: 'Копія',
    copiedTitle: 'Скопійовано',
    copiedBody: 'Номер телефону скопійовано.',
    contact: "Зв'язатися",
    cancel: 'Скасувати',
  },
  ru: {
    call: 'Позвонить',
    viber: 'Viber',
    copy: 'Копия',
    copiedTitle: 'Скопировано',
    copiedBody: 'Номер телефона скопирован.',
    contact: 'Связаться',
    cancel: 'Отмена',
  },
  en: {
    call: 'Call',
    viber: 'Viber',
    copy: 'Copy',
    copiedTitle: 'Copied',
    copiedBody: 'Phone number copied.',
    contact: 'Contact',
    cancel: 'Cancel',
  },
} as const;

interface RouteParams {
  userId: string;
  userName?: string;
}

const RTDB_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;
const toSafeRtdbKey = (value: string): string => (value ?? '').replace(RTDB_FORBIDDEN_KEY_CHARS, '_').trim();

const getGenderShortLabel = (gender?: string) => {
  if (gender === 'male') return 'M';
  if (gender === 'female') return 'F';
  return '';
};

const ViewUserProfileScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { userId } = (route.params as RouteParams) || {};
  const { language } = useTranslation();
  const text = UI_TEXT[language];
  const contactText = CONTACT_TEXT[language];
  const actionText = ACTION_TEXT[language];
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest } = useContactRequest();
  const { colors } = useAppTheme();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState<number | undefined>();
  const [gender, setGender] = useState('');
  const [registeredAt, setRegisteredAt] = useState('');
  const [profilePhotoURL, setProfilePhotoURL] = useState('');
  const [profileStartAvatarKey, setProfileStartAvatarKey] = useState('');
  const [profileLikes, setProfileLikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [jobListing, setJobListing] = useState<JobListing | null>(null);
  const [contactApproved, setContactApproved] = useState(false);
  const [thankSent, setThankSent] = useState(false);
  const [reportMenuVisible, setReportMenuVisible] = useState(false);
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const isAuthenticated = Boolean(currentUser?.id);
  const isOwnProfile = Boolean(userId && currentUser?.id && userId === currentUser.id);

  // Restore daily "already thanked" state from local storage (no server call)
  useEffect(() => {
    if (!userId || !currentUser?.id || isOwnProfile) return;
    const key = `@profile_thanks_${currentUser.id}_${userId}`;
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(key).then((stored) => {
      if (stored === today) setThankSent(true);
    }).catch(() => {});
  }, [userId, currentUser?.id, isOwnProfile]);

  useEffect(() => {
    if (!isAuthenticated) {
      requireAuthForDetails({ userId: currentUser?.id, navigation, language });
    }
  }, [currentUser?.id, isAuthenticated, language, navigation]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !currentUser?.id || isOwnProfile) return;
    let cancelled = false;
    void (async () => {
      try {
        const [status, privacyMode] = await Promise.all([
          profilePermissionService.checkAccess(userId, currentUser.id),
          profilePermissionService.getPrivacyMode(userId),
        ]);
        if (!cancelled) setContactApproved(status === 'approved' || privacyMode === 'open');
      } catch {
        if (!cancelled) setContactApproved(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, userId, currentUser?.id, isOwnProfile]);

  useEffect(() => {
    if (!userId || !currentUser?.id || isOwnProfile) return;
    let cancelled = false;
    void (async () => {
      try {
        const blocked = await reportBlockService.loadBlockedUsers(currentUser.id);
        if (!cancelled) setIsBlocked(blocked.has(userId));
      } catch {
        if (!cancelled) setIsBlocked(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, currentUser?.id, isOwnProfile]);

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      if (!userId) {
        Alert.alert(text.error, text.errorLoadProfile);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const profile = await loadProfileRecord(userId);
        if (profile) {
          setName(profile.name || '');
          setPhone(profile.phone || '');
          setCity(profile.building || '');
          setAge(profile.age);
          setGender(profile.gender || '');
          setRegisteredAt(profile.registeredAt || '');
          setProfilePhotoURL(profile.photoURL || '');
          setProfileStartAvatarKey(profile.startAvatarKey || '');
        }
      } catch (error) {
        Alert.alert(text.error, text.errorLoadProfile);
      } finally {
        setLoading(false);
      }

      // Optional section: user services from job_listings.
      // Failures here should not show a global profile error.
      try {
        const likesSnap = await get(ref(database, `feed_likes/people/${toSafeRtdbKey(userId)}`));
        const likesValue = likesSnap.val();
        setProfileLikes(likesValue && typeof likesValue === 'object' ? Object.keys(likesValue).length : 0);
      } catch {
        setProfileLikes(0);
      }

      try {
        const jobRef = query(ref(database, 'job_listings'), orderByChild('userId'), equalTo(userId));
        const jobSnap = await get(jobRef);
        if (jobSnap.exists()) {
          const data = jobSnap.val() as Record<string, unknown>;
          const firstKey = Object.keys(data)[0];
          if (firstKey) {
            setJobListing({ id: firstKey, ...(data[firstKey] as Record<string, unknown>) } as JobListing);
          } else {
            setJobListing(null);
          }
        } else {
          setJobListing(null);
        }
      } catch {
        setJobListing(null);
      }
    };

    void loadUserProfile();
  }, [isAuthenticated, userId, language]);

  const genderLabel = getGenderShortLabel(gender);
  const ageGenderLabel = [
    typeof age === 'number' ? String(age) : '',
    genderLabel,
  ].filter(Boolean).join(' / ');
  const daysInApp = registeredAt ? getDaysInApp(registeredAt) : 0;
  const profileMeta = [
    ageGenderLabel,
    `${daysInApp} ${text.days}`,
    `${profileLikes} ${text.likes}`,
  ].filter(Boolean).join(' · ');

  const avatarUri = pickUserAvatarUri({ photoURL: profilePhotoURL, startAvatarKey: profileStartAvatarKey });
  const phoneVisible = isOwnProfile || contactApproved;
  const hasPhone = phoneVisible && Boolean(phone.trim());
  const canRequestContact = Boolean(userId && userId !== currentUser?.id && !contactApproved);
  const canContact = canRequestContact || hasPhone;

  const handleThank = () => {
    if (!userId || isOwnProfile) return;
    const currentUid = auth.currentUser?.uid ?? currentUser?.id;
    if (!currentUid) return;

    // Check local daily rate limit — no server call needed
    const key = `@profile_thanks_${currentUid}_${userId}`;
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.getItem(key).then((stored) => {
      if (stored === today) {
        Alert.alert('', text.thankAlready);
        setThankSent(true);
        return;
      }
      // Optimistic UI — show success immediately, process in background
      setThankSent(true);
      AsyncStorage.setItem(key, today).catch(() => {});
      Alert.alert('', text.thankAwarded);
      enqueueAndDrainAsync('profile_thanks', { targetUid: userId });
    }).catch(() => {
      // If AsyncStorage fails, still proceed optimistically
      setThankSent(true);
      AsyncStorage.setItem(key, today).catch(() => {});
      Alert.alert('', text.thankAwarded);
      enqueueAndDrainAsync('profile_thanks', { targetUid: userId });
    });
  };

  const handleSendRequest = async (reason: string) => {
    await sendRequest(reason as Parameters<typeof sendRequest>[0]);
    if (!currentUser?.id || !userId) return;
    try {
      const [status, privacyMode] = await Promise.all([
        profilePermissionService.checkAccess(userId, currentUser.id),
        profilePermissionService.getPrivacyMode(userId),
      ]);
      setContactApproved(status === 'approved' || privacyMode === 'open');
    } catch {
      // keep current state
    }
  };

  const handleCopyPhone = async () => {
    if (!phone) return;
    await Clipboard.setStringAsync(phone);
    Alert.alert(contactText.copiedTitle, contactText.copiedBody);
  };

  const handleContact = () => {
    if (canRequestContact && userId) {
      openModal({
        userId,
        name: name || text.title,
        sourceType: 'lyudi',
        sourceId: userId,
        sourceTitle: name || text.title,
      });
      return;
    }

    if (!hasPhone) return;
    Alert.alert(contactText.contact, name || text.title, [
      { text: contactText.call, onPress: () => { void safeCallPhone(phone, language); } },
      { text: contactText.viber, onPress: () => { void safeOpenViber(phone, language); } },
      { text: contactText.cancel, style: 'cancel' },
    ]);
  };

  const handleBlockConfirm = async (reason: string) => {
    if (!userId) return;
    setBlockLoading(true);
    try {
      await reportBlockService.setBlockWithReason(userId, reason);
      setIsBlocked(true);
      setBlockModalVisible(false);
      Alert.alert('', isOwnProfile ? '' : language === 'en' ? 'User blocked' : language === 'ru' ? 'Пользователь заблокирован' : 'Користувача заблоковано');
    } catch {
      Alert.alert(text.error, language === 'en' ? 'Failed to block user' : language === 'ru' ? 'Не удалось заблокировать' : 'Не вдалося заблокувати');
    } finally {
      setBlockLoading(false);
    }
  };

  const handleUnblock = () => {
    if (!userId) return;
    Alert.alert(
      language === 'en' ? 'Unblock user' : language === 'ru' ? 'Разблокировать пользователя' : 'Розблокувати користувача',
      language === 'en' ? 'Are you sure?' : language === 'ru' ? 'Вы уверены?' : 'Ви впевнені?',
      [
        { text: language === 'en' ? 'Cancel' : language === 'ru' ? 'Отмена' : 'Скасувати', style: 'cancel' },
        {
          text: language === 'en' ? 'Unblock' : language === 'ru' ? 'Разблокировать' : 'Розблокувати',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportBlockService.removeBlock(userId);
              setIsBlocked(false);
            } catch {
              Alert.alert(text.error, language === 'en' ? 'Failed to unblock' : language === 'ru' ? 'Не удалось разблокировать' : 'Не вдалося розблокувати');
            }
          },
        },
      ],
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="lock-outline" size={42} color={SCREEN_THEME.terracotta} />
          <Text style={styles.loadingText}>
            {language === 'en' ? 'Registration required' : language === 'ru' ? '\u041d\u0443\u0436\u043d\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f' : '\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044f'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={SCREEN_THEME.textPrimary} />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <MiniUserAvatar uri={avatarUri} name={name} size={72} borderRadius={20} />
          <Text style={styles.title}>{text.title}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{text.sectionMain}</Text>

          <Text style={styles.inputLabel}>{text.name}</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{name || '—'}</Text>
          </View>

          <Text style={styles.metaText}>{profileMeta}</Text>

          <Text style={styles.inputLabel}>{text.phone}</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{phoneVisible ? (phone || '—') : '***'}</Text>
          </View>

          {phoneVisible ? (
            <View style={styles.contactActions}>
              <TouchableOpacity
                style={[styles.smallAction, !hasPhone && styles.disabledAction]}
                onPress={() => void safeCallPhone(phone, language)}
                disabled={!hasPhone}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="phone-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                <Text style={[styles.smallActionText, !hasPhone && styles.disabledText]}>{contactText.call}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallAction, !hasPhone && styles.disabledAction]}
                onPress={() => void safeOpenViber(phone, language)}
                disabled={!hasPhone}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="message-text-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                <Text style={[styles.smallActionText, !hasPhone && styles.disabledText]}>{contactText.viber}</Text>
              </TouchableOpacity>
              {hasPhone ? (
                <TouchableOpacity style={styles.smallActionAlt} onPress={() => void handleCopyPhone()} activeOpacity={0.82}>
                  <MaterialCommunityIcons name="content-copy" size={16} color="#403933" />
                  <Text style={styles.smallActionAltText}>{contactText.copy}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.contactBtn, !canContact && styles.disabledAction]}
            onPress={handleContact}
            disabled={!canContact}
            activeOpacity={0.86}
          >
            <Text style={[styles.contactBtnText, !canContact && styles.disabledText]}>{contactText.contact}</Text>
          </TouchableOpacity>

          {!isOwnProfile && isAuthenticated ? (
            <TouchableOpacity
              style={[styles.thankBtn, thankSent && styles.thankBtnDone]}
              onPress={() => void handleThank()}
              disabled={thankSent}
              activeOpacity={0.86}
            >
              <Text style={styles.thankBtnText}>{thankSent ? text.thankSentLabel : text.thankBtnLabel}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.inputLabel}>{text.cityLabel}</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{city || '—'}</Text>
          </View>
        </View>

        {jobListing && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{text.sectionExtended}</Text>

            <View style={styles.extendedSection}>
              <Text style={styles.businessHint}>{text.businessHint}</Text>
              <Text style={styles.businessDescription}>{jobListing.about}</Text>
            </View>
          </View>
        )}

        {!isOwnProfile && isAuthenticated ? (
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setReportMenuVisible(true)}
            activeOpacity={0.86}
          >
            <MaterialCommunityIcons name="flag-outline" size={18} color="#B91C1C" />
            <Text style={styles.reportBtnText}>{actionText.report}</Text>
          </TouchableOpacity>
        ) : null}

        {!isOwnProfile && isAuthenticated ? (
          <TouchableOpacity
            style={isBlocked ? styles.unblockBtn : styles.blockBtn}
            onPress={isBlocked ? handleUnblock : () => setBlockModalVisible(true)}
            activeOpacity={0.86}
          >
            <MaterialCommunityIcons
              name={isBlocked ? 'account-check-outline' : 'block-helper'}
              size={18}
              color={isBlocked ? '#2E7D4F' : '#B91C1C'}
            />
            <Text style={isBlocked ? styles.unblockBtnText : styles.blockBtnText}>
              {isBlocked ? actionText.unblock : actionText.block}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <ReportBlockMenu
        visible={reportMenuVisible}
        onClose={() => setReportMenuVisible(false)}
        listingId={userId}
        reportedUserId={userId}
        currentUserId={currentUser?.id || ''}
        language={language as 'ua' | 'ru' | 'en'}
        hideBlock
        source="profile_report"
        onBlock={() => {
          setReportMenuVisible(false);
        }}
      />
      <BlockReasonModal
        visible={blockModalVisible}
        loading={blockLoading}
        userName={name}
        onConfirm={handleBlockConfirm}
        onClose={() => setBlockModalVisible(false)}
      />
      <ContactReasonModal
        visible={modalVisible}
        pending={pending}
        target={currentTarget}
        onSelect={(reason) => void handleSendRequest(reason)}
        onClose={closeModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  valueBox: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E7D6B3',
  },
  valueText: {
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '500',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#403933',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  smallActionAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8DDD3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionAltText: {
    color: '#403933',
    fontSize: 12,
    fontWeight: '900',
  },
  contactBtn: {
    alignItems: 'center',
    backgroundColor: '#7A1E5C',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 10,
  },
  contactBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  disabledAction: {
    backgroundColor: '#E1D7CF',
  },
  disabledText: {
    color: '#9F958E',
  },
  thankBtn: {
    alignItems: 'center',
    backgroundColor: '#2E7D4F',
    borderRadius: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  thankBtnDone: {
    backgroundColor: '#7A9E85',
  },
  thankBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  metaText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 16,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
  },
  extendedSection: {
    marginTop: 12,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    backgroundColor: '#D9BFA8',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  interestTag: {
    backgroundColor: '#E8CCAA',
  },
  tagText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '600',
    marginTop: 6,
  },
  businessHint: {
    fontSize: 14,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    marginBottom: 8,
  },
  businessDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '500',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF0EE',
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#F5D0CC',
  },
  reportBtnText: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '900',
  },
  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF0EE',
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#F5D0CC',
  },
  blockBtnText: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '900',
  },
  unblockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EEF7F0',
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#C8E6D0',
  },
  unblockBtnText: {
    color: '#2E7D4F',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default ViewUserProfileScreen;
