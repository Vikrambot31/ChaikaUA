import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { updateProfile as firebaseUpdateProfile } from 'firebase/auth';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../firebase-config';
import { setUser } from '../redux/slices/authSlice';
import { selectUser } from '../redux/selectors';
import { useTranslation } from '../i18n/useTranslation';
import LanguageSelector from '../components/LanguageSelector';
import TactileIcon from '../components/TactileIcon';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import {
  loadProfileRecord,
  mapFirebaseUserToAppUser,
  updateProfileRecord,
} from '../services/authProfileService';
import { query, ref, get, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import type { JobListing } from '../services/jobService';

const UI_TEXT = {
  ua: {
    invalidName: "Ім'я повинно містити мінімум 2 символи.",
    invalidPhone: 'Перевірте формат телефону.',
    subtitle: 'Оновіть свої дані, щоб профіль виглядав охайно у застосунку.',
    sectionMain: 'Основні дані',
    sectionAbout: 'Про мене',
    sectionLang: 'Мова застосунку',
    sectionLangHint: 'Тут можна швидко змінити мову інтерфейсу, не виходячи з профілю.',
    cityLabel: 'Вулиця',
    houseLabel: 'Квартира / будинок',
    housePlaceholder: 'Напр. кв. 42',
    professionLabel: 'Рід діяльності',
    professionPlaceholder: 'Напр. IT, лікар, підприємець...',
    aboutLabel: 'Коротко про себе',
    aboutPlaceholder: 'Розкажіть трохи про себе...',
    restoreSaved: 'Відновити збережені дані',
    unsavedChanges: 'У вас є незбережені зміни. Вийти без збереження?',
    leave: 'Вийти',
    sectionExtended: 'Розширена інформація',
    businessHint: 'Ви пропонуєте послуги:',
  },
  ru: {
    invalidName: 'Имя должно содержать минимум 2 символа.',
    invalidPhone: 'Проверьте формат телефона.',
    subtitle: 'Обновите свои данные, чтобы профиль выглядел опрятно в приложении.',
    sectionMain: 'Основные данные',
    sectionAbout: 'Обо мне',
    sectionLang: 'Язык приложения',
    sectionLangHint: 'Здесь можно быстро сменить язык интерфейса, не выходя из профиля.',
    cityLabel: 'Улица',
    houseLabel: 'Квартира / дом',
    housePlaceholder: 'Напр. кв. 42',
    professionLabel: 'Род деятельности',
    professionPlaceholder: 'Напр. IT, врач, предприниматель...',
    aboutLabel: 'Коротко о себе',
    aboutPlaceholder: 'Расскажите немного о себе...',
    restoreSaved: 'Вернуть сохранённые данные',
    unsavedChanges: 'У вас есть несохранённые изменения. Выйти без сохранения?',
    leave: 'Выйти',
    sectionExtended: 'Расширенная информация',
    businessHint: 'Вы предлагаете услуги:',
  },
  en: {
    invalidName: 'Name must contain at least 2 characters.',
    invalidPhone: 'Check phone number format.',
    subtitle: 'Update your details so the profile looks clean across the app.',
    sectionMain: 'Basic information',
    sectionAbout: 'About me',
    sectionLang: 'App language',
    sectionLangHint: 'You can quickly switch interface language here without leaving your profile.',
    cityLabel: 'Street',
    houseLabel: 'Apartment / house',
    housePlaceholder: 'E.g. apt. 42',
    professionLabel: 'Occupation',
    professionPlaceholder: 'E.g. IT, doctor, entrepreneur...',
    aboutLabel: 'About me',
    aboutPlaceholder: 'Tell a bit about yourself...',
    restoreSaved: 'Restore saved values',
    unsavedChanges: 'You have unsaved changes. Leave without saving?',
    leave: 'Leave',
    sectionExtended: 'Extended information',
    businessHint: 'You offer services:',
  },
} as const;

const EditProfileScreen: React.FC<{ navigation: { goBack: () => void } }> = ({ navigation }) => {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const { t, language } = useTranslation();
  const text = UI_TEXT[language];

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.city || '');
  const [houseNumber, setHouseNumber] = useState('');
  const [profession, setProfession] = useState('');
  const [about, setAbout] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobListing, setJobListing] = useState<JobListing | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => ({
    name: user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    houseNumber: '',
    profession: '',
    about: '',
  }));

  useEffect(() => {
    const syncProfile = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const profile = await loadProfileRecord(uid);
        if (!profile) return;
        const snap = {
          name: profile.name || user?.name || '',
          phone: profile.phone || user?.phone || '',
          city: profile.building || user?.city || '',
          houseNumber: profile.houseNumber || '',
          profession: profile.profession || '',
          about: profile.about || '',
        };
        setSavedSnapshot(snap);
        setName(snap.name);
        setPhone(snap.phone);
        setCity(snap.city);
        setHouseNumber(snap.houseNumber);
        setProfession(snap.profession);
        setAbout(snap.about);
      } catch {
        // Ignore bootstrap sync failures and keep current UI state.
      }
    };

    const loadExtendedData = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        // Load job listing (business services)
        const jobRef = query(ref(database, 'job_listings'), orderByChild('userId'), equalTo(uid));
        const jobSnap = await get(jobRef);
        if (jobSnap.exists()) {
          const data = jobSnap.val();
          const firstKey = Object.keys(data)[0];
          setJobListing({ id: firstKey, ...data[firstKey] } as JobListing);
        }
      } catch {
        // Ignore errors loading extended data
      }
    };

    void syncProfile();
    void loadExtendedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty =
    normalizePersonName(name) !== normalizePersonName(savedSnapshot.name) ||
    normalizePhoneText(phone) !== normalizePhoneText(savedSnapshot.phone) ||
    sanitizeStoredText(city) !== sanitizeStoredText(savedSnapshot.city) ||
    sanitizeStoredText(houseNumber) !== sanitizeStoredText(savedSnapshot.houseNumber) ||
    sanitizeStoredText(profession) !== sanitizeStoredText(savedSnapshot.profession) ||
    sanitizeStoredText(about) !== sanitizeStoredText(savedSnapshot.about);

  const handleBack = () => {
    if (!isDirty || loading) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      t.profile.errorTitle,
      text.unsavedChanges,
      [
        { text: t.profile.cancel, style: 'cancel' },
        { text: text.leave, style: 'destructive', onPress: () => navigation.goBack() },
      ],
    );
  };

  const restoreSaved = () => {
    setName(savedSnapshot.name);
    setPhone(savedSnapshot.phone);
    setCity(savedSnapshot.city);
    setHouseNumber(savedSnapshot.houseNumber);
    setProfession(savedSnapshot.profession);
    setAbout(savedSnapshot.about);
  };

  const handleSave = async () => {
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);
    const normalizedCity = sanitizeStoredText(city);

    if (!validateName(normalizedName)) {
      Alert.alert(t.profile.errorTitle, text.invalidName);
      return;
    }

    if (normalizedPhone && !validatePhone(normalizedPhone)) {
      Alert.alert(t.profile.errorTitle, text.invalidPhone);
      return;
    }

    setLoading(true);

    const normalizedHouseNumber = sanitizeStoredText(houseNumber);
    const normalizedProfession = sanitizeStoredText(profession);
    const normalizedAbout = sanitizeStoredText(about);

    try {
      if (auth.currentUser) {
        await firebaseUpdateProfile(auth.currentUser, {
          displayName: normalizedName,
        });

        await updateProfileRecord(auth.currentUser.uid, {
          name: normalizedName,
          phone: normalizedPhone,
          building: normalizedCity,
          houseNumber: normalizedHouseNumber,
          profession: normalizedProfession,
          about: normalizedAbout,
        });
      }

      if (user && auth.currentUser) {
        const nextUser = mapFirebaseUserToAppUser(auth.currentUser, {
          name: normalizedName,
          phone: normalizedPhone,
          building: normalizedCity,
          houseNumber: normalizedHouseNumber,
          profession: normalizedProfession,
          about: normalizedAbout,
        } as any);
        dispatch(setUser(nextUser));
      }

      setSavedSnapshot({
        name: normalizedName,
        phone: normalizedPhone,
        city: normalizedCity,
        houseNumber: normalizedHouseNumber,
        profession: normalizedProfession,
        about: normalizedAbout,
      });
      Alert.alert(t.profile.successTitle, t.profile.successMessage);
      navigation.goBack();
    } catch {
      Alert.alert(t.profile.errorTitle, t.profile.errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} disabled={loading}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            </TouchableOpacity>
            <View style={styles.backButtonPlaceholder} />
          </View>
          <Text style={styles.title}>{t.profile.editProfile}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{text.sectionMain}</Text>

          <Text style={styles.inputLabel}>{t.profile.name}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.profile.name}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={name}
            onChangeText={(value) => setName(normalizePersonName(value))}
          />

          <Text style={styles.inputLabel}>{t.profile.phone}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.profile.phone}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={phone}
            onChangeText={(value) => setPhone(normalizePhoneText(value))}
            keyboardType="phone-pad"
          />

          <Text style={styles.inputLabel}>{text.cityLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={text.cityLabel}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={city}
            onChangeText={(value) => setCity(sanitizeStoredText(value))}
          />

          <Text style={styles.inputLabel}>{text.houseLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={text.housePlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={houseNumber}
            onChangeText={(value) => setHouseNumber(sanitizeStoredText(value))}
          />

          <TouchableOpacity
            style={[styles.saveButton, (!isDirty || loading) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!isDirty || loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFF9EE" />
            ) : (
              <>
                <TactileIcon
                  icon="content-save-outline"
                  size={42}
                  iconSize={18}
                  backgroundColor="#7A4B36"
                  tint="#FFF3CE"
                  style={styles.saveIcon}
                />
                <Text style={styles.saveButtonText}>{t.profile.save}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={handleBack} disabled={loading}>
            <Text style={styles.cancelButtonText}>{t.profile.cancel}</Text>
          </TouchableOpacity>
          {isDirty ? (
            <TouchableOpacity
              style={[styles.restoreButton, { opacity: loading ? 0.5 : 1 }]}
              onPress={restoreSaved}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>{text.restoreSaved}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{text.sectionAbout}</Text>

          <Text style={styles.inputLabel}>{text.professionLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={text.professionPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={profession}
            onChangeText={(value) => setProfession(sanitizeStoredText(value))}
            maxLength={80}
          />

          <Text style={[styles.inputLabel, { marginTop: 12 }]}>{text.aboutLabel}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder={text.aboutPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={about}
            onChangeText={(value) => setAbout(sanitizeStoredText(value))}
            multiline
            numberOfLines={4}
            maxLength={300}
            textAlignVertical="top"
          />
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{text.sectionLang}</Text>
          <Text style={styles.sectionHint}>{text.sectionLangHint}</Text>
          <LanguageSelector />
        </View>
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
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1E1BC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0C89A',
  },
  backButtonPlaceholder: {
    width: 42,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: SCREEN_THEME.textSecondary,
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
  sectionHint: {
    fontSize: 13,
    lineHeight: 19,
    color: SCREEN_THEME.textSecondary,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    borderWidth: 1,
    borderColor: '#E7D6B3',
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: 14,
  },
  saveButton: {
    marginTop: 18,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: SCREEN_THEME.terracotta,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  saveIcon: {
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  saveButtonText: {
    color: '#FFF9EE',
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  restoreButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '800',
    fontSize: 15,
  },
  saveButtonDisabled: {
    opacity: 0.45,
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

export default EditProfileScreen;
