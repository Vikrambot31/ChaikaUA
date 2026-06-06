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
import { useContactRequest } from '../hooks/useContactRequest';
import { useTranslation } from '../i18n/useTranslation';
import type { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import {
  loadProfileRecord,
} from '../services/authProfileService';
import { profilePermissionService } from '../services/profilePermissionService';
import { query, ref, get, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import type { JobListing } from '../services/jobService';
import { getDaysInApp } from '../utils/chaikaLevels';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import { requireAuthForDetails } from '../utils/authGuard';

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
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest } = useContactRequest();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState<number | undefined>();
  const [gender, setGender] = useState('');
  const [registeredAt, setRegisteredAt] = useState('');
  const [profileLikes, setProfileLikes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [jobListing, setJobListing] = useState<JobListing | null>(null);
  const [contactApproved, setContactApproved] = useState(false);
  const isAuthenticated = Boolean(currentUser?.id);
  const isOwnProfile = Boolean(userId && currentUser?.id && userId === currentUser.id);

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
  }, [isAuthenticated, userId, text]);

  const genderLabel = getGenderShortLabel(gender);
  const ageGenderLabel = [
    typeof age === 'number' ? String(age) : '',
    genderLabel,
  ].filter(Boolean).join(' / ');
  const daysInApp = getDaysInApp(registeredAt);
  const profileMeta = [
    ageGenderLabel,
    `${daysInApp} days`,
    `${profileLikes} likes`,
  ].filter(Boolean).join(' · ');

  const phoneVisible = isOwnProfile || contactApproved;
  const hasPhone = phoneVisible && Boolean(phone.trim());
  const canRequestContact = Boolean(userId && userId !== currentUser?.id);
  const canContact = canRequestContact || hasPhone;

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

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
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
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={SCREEN_THEME.textPrimary} />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
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
      </ScrollView>
      <ContactReasonModal
        visible={modalVisible}
        pending={pending}
        target={currentTarget}
        onSelect={(reason) => void sendRequest(reason)}
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
});

export default ViewUserProfileScreen;
