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
  Image,
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
import { validateName, validatePhone, normalizeUkrainianPhoneStrict } from '../utils/validators';
import {
  loadProfileRecord,
  mapFirebaseUserToAppUser,
  updateProfileRecord,
  uploadProfilePhoto,
} from '../services/authProfileService';
import { query, ref, get, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import type { JobListing } from '../services/jobService';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { getStartAvatarByKey, saveSelectedStartAvatar, START_AVATARS, START_AVATAR_URI_PREFIX } from '../utils/startAvatars';
import { pickPhotoFromLibrary } from '../utils/photoPicker';
import useSoftToast from '../hooks/useSoftToast';

const UI_TEXT = {
  ua: {
    invalidName: "Ім'я повинно містити мінімум 2 символи.",
    invalidPhone: 'Перевірте формат телефону. Потрібно: +380XXXXXXXXX',
    phonePlaceholder: '+380XXXXXXXXX',
    subtitle: 'Оновіть свої дані, щоб профіль виглядав охайно у застосунку.',
    sectionMain: 'Основні дані',
    sectionAbout: 'Про мене',
    sectionLang: 'Мова застосунку',
    sectionLangHint: 'Тут можна швидко змінити мову інтерфейсу, не виходячи з профілю.',
    avatarSection: 'Редагувати аватарку',
    avatarHint: 'Це основне фото для ваших заявок, чатів і стрічок.',
    uploadAvatar: 'Завантажити своє фото',
    temporaryAvatar: 'Обрати тимчасовий аватар',
    avatarSaving: 'Зберігаємо аватар...',
    avatarSavedTitle: 'Готово',
    avatarSavedBody: 'Аватар оновлено.',
    avatarError: 'Не вдалося оновити аватар.',
    avatarPickCanceled: 'Фото не вибрано.',
    avatarTipTitle: 'Поточна аватарка',
    avatarTipBody: 'Зараз ця аватарка використовується у лентах застосунку. Її можна змінити нижче на цьому екрані.',
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
    invalidPhone: 'Проверьте формат телефона. Нужно: +380XXXXXXXXX',
    phonePlaceholder: '+380XXXXXXXXX',
    subtitle: 'Обновите свои данные, чтобы профиль выглядел опрятно в приложении.',
    sectionMain: 'Основные данные',
    sectionAbout: 'Обо мне',
    sectionLang: 'Язык приложения',
    sectionLangHint: 'Здесь можно быстро сменить язык интерфейса, не выходя из профиля.',
    avatarSection: 'Редактировать аватарку',
    avatarHint: 'Это основное фото для ваших заявок, чатов и лент.',
    uploadAvatar: 'Заменить своим фото',
    temporaryAvatar: 'Выбрать временный аватар',
    avatarSaving: 'Сохраняем аватар...',
    avatarSavedTitle: 'Готово',
    avatarSavedBody: 'Аватар обновлён.',
    avatarError: 'Не удалось обновить аватар.',
    avatarPickCanceled: 'Фото не выбрано.',
    avatarTipTitle: 'Текущая аватарка',
    avatarTipBody: 'Сейчас эта аватарка используется во всех лентах приложения. Её можно изменить ниже на этом экране.',
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
    invalidPhone: 'Check phone format. Required: +380XXXXXXXXX',
    phonePlaceholder: '+380XXXXXXXXX',
    subtitle: 'Update your details so the profile looks clean across the app.',
    sectionMain: 'Basic information',
    sectionAbout: 'About me',
    sectionLang: 'App language',
    sectionLangHint: 'You can quickly switch interface language here without leaving your profile.',
    avatarSection: 'Edit avatar',
    avatarHint: 'This is your main photo for requests, chats, and feeds.',
    uploadAvatar: 'Replace with my photo',
    temporaryAvatar: 'Choose temporary avatar',
    avatarSaving: 'Saving avatar...',
    avatarSavedTitle: 'Done',
    avatarSavedBody: 'Avatar updated.',
    avatarError: 'Could not update avatar.',
    avatarPickCanceled: 'No photo selected.',
    avatarTipTitle: 'Current avatar',
    avatarTipBody: 'This avatar is currently used across app feeds. You can edit it lower on this screen.',
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

type AppUserProfileArg = Parameters<typeof mapFirebaseUserToAppUser>[1];

const isStartAvatarUri = (value: string): boolean => value.startsWith(START_AVATAR_URI_PREFIX);

const EditProfileScreen: React.FC<{ navigation: { goBack: () => void; navigate: (screen: string) => void } }> = ({ navigation }) => {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();
  const { t, language } = useTranslation();
  const { showInfo } = useSoftToast();
  const text = UI_TEXT[language];
  const guarantorLabel = language === 'en' ? 'Guarantor' : 'Поручитель';

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [city, setCity] = useState(user?.city || '');
  const [houseNumber, setHouseNumber] = useState('');
  const [profession, setProfession] = useState('');
  const [about, setAbout] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [showTemporaryAvatars, setShowTemporaryAvatars] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [photoStoragePaths, setPhotoStoragePaths] = useState<string[]>([]);
  const [startAvatarKey, setStartAvatarKey] = useState(user?.startAvatarKey || '');
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
        const nextPhotoURLs = profile.photoURLs?.length
          ? profile.photoURLs
          : profile.photoURL
            ? [profile.photoURL]
            : [];
        setSavedSnapshot(snap);
        setName(snap.name);
        setPhone(snap.phone);
        setCity(snap.city);
        setHouseNumber(snap.houseNumber);
        setProfession(snap.profession);
        setAbout(snap.about);
        setPhotoURL(nextPhotoURLs[0] || profile.photoURL || '');
        setPhotoStoragePaths(profile.photoStoragePaths || []);
        setStartAvatarKey(profile.startAvatarKey || '');
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

  const currentAvatarUri = startAvatarKey ? `${START_AVATAR_URI_PREFIX}${startAvatarKey}` : photoURL;
  const currentStartAvatar = startAvatarKey ? getStartAvatarByKey(startAvatarKey) : undefined;

  const showCurrentAvatarHint = () => {
    showInfo(text.avatarTipTitle, text.avatarTipBody);
  };

  const saveAvatarPatch = async ({
    nextPhotoURL,
    nextPhotoURLs,
    nextStartAvatarKey,
    nextPhotoStoragePaths = photoStoragePaths,
    manageLoading = true,
  }: {
    nextPhotoURL: string;
    nextPhotoURLs: string[];
    nextStartAvatarKey: string;
    nextPhotoStoragePaths?: string[];
    manageLoading?: boolean;
  }) => {
    const uid = auth.currentUser?.uid || user?.id;
    if (!uid) {
      if (nextStartAvatarKey) {
        await saveSelectedStartAvatar(nextStartAvatarKey);
      }
      setPhotoURL(nextPhotoURL);
      setPhotoStoragePaths(nextPhotoStoragePaths);
      setStartAvatarKey(nextStartAvatarKey);
      Alert.alert(text.avatarSavedTitle, text.avatarSavedBody);
      return;
    }

    if (manageLoading) setAvatarSaving(true);
    try {
      if (auth.currentUser && !isStartAvatarUri(nextPhotoURL)) {
        await firebaseUpdateProfile(auth.currentUser, { photoURL: nextPhotoURL || null });
      }
      await updateProfileRecord(uid, {
        photoURL: nextPhotoURL,
        photoURLs: nextPhotoURLs,
        photoStoragePaths: nextPhotoStoragePaths,
        startAvatarKey: nextStartAvatarKey,
      });
      setPhotoURL(nextPhotoURL);
      setPhotoStoragePaths(nextPhotoStoragePaths);
      setStartAvatarKey(nextStartAvatarKey);
      if (user) {
        dispatch(setUser({
          ...user,
          photoURL: nextPhotoURL,
          photoURLs: nextPhotoURLs,
          startAvatarKey: nextStartAvatarKey || undefined,
        }));
      }
      Alert.alert(text.avatarSavedTitle, text.avatarSavedBody);
    } catch {
      Alert.alert(t.profile.errorTitle, text.avatarError);
    } finally {
      if (manageLoading) setAvatarSaving(false);
    }
  };

  const handleUploadAvatar = async () => {
    setAvatarSaving(true);
    try {
      const picked = await pickPhotoFromLibrary({ allowsEditing: true, quality: 0.86 });
      if (!picked) {
        return;
      }
      const uploaded = await uploadProfilePhoto(picked.uri);
      await saveAvatarPatch({
        nextPhotoURL: uploaded.url,
        nextPhotoURLs: [uploaded.url],
        nextPhotoStoragePaths: [uploaded.storagePath],
        nextStartAvatarKey: '',
        manageLoading: false,
      });
      setShowTemporaryAvatars(false);
    } catch {
      Alert.alert(t.profile.errorTitle, text.avatarError);
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleSelectTemporaryAvatar = async (key: string, uri: string) => {
    await saveAvatarPatch({
      nextPhotoURL: uri,
      nextPhotoURLs: [uri],
      nextPhotoStoragePaths: [],
      nextStartAvatarKey: key,
    });
  };

  const handleSave = async () => {
    const normalizedName = normalizePersonName(name);
    const rawPhone = normalizePhoneText(phone);
    // BUG-8.4: auto-convert 09XXXXXXXXX → +38009XXXXXXXXX before validation
    const normalizedPhone = rawPhone ? (normalizeUkrainianPhoneStrict(rawPhone) ?? rawPhone) : '';
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
      // BUG-8.5: success path only runs when auth is confirmed; no silent fail
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

        if (user) {
          const nextProfile: AppUserProfileArg = {
            name: normalizedName,
            phone: normalizedPhone,
            building: normalizedCity,
            houseNumber: normalizedHouseNumber,
            profession: normalizedProfession,
            about: normalizedAbout,
            photoURL,
            photoURLs: photoURL ? [photoURL] : [],
            photoStoragePaths,
            startAvatarKey,
          };
          const nextUser = mapFirebaseUserToAppUser(auth.currentUser, nextProfile);
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
      } else {
        Alert.alert(t.profile.errorTitle, t.profile.errorMessage);
      }
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack} disabled={loading}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            </TouchableOpacity>
            <View style={styles.backButtonPlaceholder} />
          </View>
          <TouchableOpacity
            style={styles.heroAvatarButton}
            onPress={showCurrentAvatarHint}
            activeOpacity={0.82}
          >
            {currentStartAvatar ? (
              <Image
                source={currentStartAvatar.source}
                style={[styles.directAvatarImage, { width: 74, height: 74, borderRadius: 24 }]}
                resizeMode="cover"
              />
            ) : (
              <MiniUserAvatar
                uri={currentAvatarUri}
                name={name || user?.name}
                size={74}
                borderRadius={24}
                backgroundColor="#6A8BA5"
              />
            )}
            <View style={styles.heroAvatarBadge}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#FFF9EE" />
            </View>
          </TouchableOpacity>
          <Text style={styles.title}>{t.profile.editProfile}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate('PoruchitelScreen')}
            activeOpacity={0.86}
          >
            <MaterialCommunityIcons name="account-network" size={18} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.quickActionText}>{guarantorLabel}</Text>
          </TouchableOpacity>
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
            placeholder={text.phonePlaceholder}
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
          <Text style={styles.sectionTitle}>{text.avatarSection}</Text>
          <Text style={styles.sectionHint}>{text.avatarHint}</Text>

          <View style={styles.avatarPreviewRow}>
            {currentStartAvatar ? (
              <Image
                source={currentStartAvatar.source}
                style={[styles.directAvatarImage, { width: 72, height: 72, borderRadius: 24 }]}
                resizeMode="cover"
              />
            ) : (
              <MiniUserAvatar
                uri={currentAvatarUri}
                name={name || user?.name}
                size={72}
                borderRadius={24}
                backgroundColor="#6A8BA5"
              />
            )}
            <View style={styles.avatarPreviewText}>
              <Text style={styles.avatarPreviewTitle}>{name || user?.name || t.profile.name}</Text>
              <Text style={styles.avatarPreviewHint}>
                {avatarSaving ? text.avatarSaving : text.avatarHint}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.avatarActionButton, avatarSaving && styles.saveButtonDisabled]}
            onPress={() => void handleUploadAvatar()}
            disabled={avatarSaving}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={20} color="#FFF9EE" />
            <Text style={styles.avatarActionText}>{text.uploadAvatar}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.avatarSecondaryButton, avatarSaving && styles.saveButtonDisabled]}
            onPress={() => setShowTemporaryAvatars((value) => !value)}
            disabled={avatarSaving}
            activeOpacity={0.88}
          >
            <MaterialCommunityIcons name="account-circle-outline" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.avatarSecondaryText}>{text.temporaryAvatar}</Text>
            <MaterialCommunityIcons
              name={showTemporaryAvatars ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={SCREEN_THEME.textSecondary}
            />
          </TouchableOpacity>

          {showTemporaryAvatars ? (
            <View style={styles.avatarGrid}>
              {START_AVATARS.map((avatar) => {
                const isSelected = avatar.uri === photoURL || avatar.key === startAvatarKey;
                return (
                  <TouchableOpacity
                    key={avatar.key}
                    style={[styles.avatarOption, isSelected && styles.avatarOptionSelected]}
                    onPress={() => void handleSelectTemporaryAvatar(avatar.key, avatar.uri)}
                    disabled={avatarSaving}
                    activeOpacity={0.86}
                  >
                    <Image source={avatar.source} style={styles.avatarOptionImage} resizeMode="cover" />
                    {isSelected ? (
                      <View style={styles.avatarCheck}>
                        <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

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
  heroAvatarButton: {
    alignSelf: 'center',
    width: 82,
    height: 82,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFDF6',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 12,
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  heroAvatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.terracotta,
    borderWidth: 2,
    borderColor: '#FFFDF6',
    alignItems: 'center',
    justifyContent: 'center',
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
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
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
  avatarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 14,
  },
  avatarPreviewText: {
    flex: 1,
  },
  directAvatarImage: {
    overflow: 'hidden',
    backgroundColor: '#E7DDD0',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  avatarPreviewTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  avatarPreviewHint: {
    marginTop: 4,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  avatarActionButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.terracotta,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  avatarActionText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  avatarSecondaryButton: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#FFFDF6',
    borderWidth: 1,
    borderColor: '#E7D6B3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  avatarSecondaryText: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  avatarOption: {
    width: '30.8%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFDF6',
    borderWidth: 2,
    borderColor: '#E7D6B3',
  },
  avatarOptionSelected: {
    borderColor: SCREEN_THEME.terracotta,
  },
  avatarOptionImage: {
    width: '100%',
    height: '100%',
  },
  avatarCheck: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
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
