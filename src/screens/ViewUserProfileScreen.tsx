import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTranslation } from '../i18n/useTranslation';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import {
  loadProfileRecord,
} from '../services/authProfileService';
import { query, ref, get, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import type { JobListing } from '../services/jobService';

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

interface RouteParams {
  userId: string;
  userName?: string;
}

const ViewUserProfileScreen: React.FC = () => {
  const route = useRoute();
  const { userId } = (route.params as RouteParams) || {};
  const { language } = useTranslation();
  const text = UI_TEXT[language];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [jobListing, setJobListing] = useState<JobListing | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!userId) {
        Alert.alert(text.error, text.errorLoadProfile);
        return;
      }

      setLoading(true);
      try {
        const profile = await loadProfileRecord(userId);
        if (profile) {
          setName(profile.name || '');
          setPhone(profile.phone || '');
          setCity(profile.building || '');
        }

        // Load job listing (business services)
        const jobRef = query(ref(database, 'job_listings'), orderByChild('userId'), equalTo(userId));
        const jobSnap = await get(jobRef);
        if (jobSnap.exists()) {
          const data = jobSnap.val();
          const firstKey = Object.keys(data)[0];
          setJobListing({ id: firstKey, ...data[firstKey] } as JobListing);
        }
      } catch (error) {
        Alert.alert(text.error, text.errorLoadProfile);
      } finally {
        setLoading(false);
      }
    };

    void loadUserProfile();
  }, [userId, text]);

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

          <Text style={styles.inputLabel}>{text.phone}</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{phone || '—'}</Text>
          </View>

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
