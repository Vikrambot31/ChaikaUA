import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { auth } from '../firebase-config';
import { setUser } from '../redux/slices/authSlice';
import { selectUser } from '../redux/selectors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { SCREEN_THEME } from '../utils/screenTheme';
import {
  START_AVATARS,
  saveSelectedStartAvatar,
  saveTempProfileData,
} from '../utils/startAvatars';
import { updateProfileRecord, uploadProfilePhoto } from '../services/authProfileService';
import { pickPhotoFromLibrary } from '../utils/photoPicker';

const TEXT = {
  ua: {
    title: 'Розкажіть про себе',
    subtitle: 'Ці дані допоможуть сусідам впізнати вас у стрічці.',
    nameSection: "Ваше ім'я",
    namePlaceholder: "Як вас звати?",
    avatarSection: 'Фото профілю',
    uploadAvatar: 'Обрати фото для аватара',
    temporaryAvatarSection: 'Обрати тимчасовий аватар',
    genderSection: 'Стать',
    ageSection: 'Вік',
    agePlaceholder: 'Ваш вік',
    male: 'Чоловік',
    female: 'Жінка',
    quickRegistration: 'Швидка реєстрація',
    continue: 'Продовжити',
    ageError: 'Вік має бути від 14 до 100',
    nameError: "Введіть ваше ім'я",
    missingTitle: 'Ще не все заповнено',
    missingName: "Введіть ім'я мінімум з 2 символів",
    missingAvatar: 'Оберіть фото профілю',
    missingGender: 'Оберіть стать',
    missingAge: 'Вкажіть вік від 14 до 100',
    avatarError: 'Не вдалося обрати або зберегти фото. Спробуйте ще раз.',
    loginRequiredForPhoto: 'Щоб зберегти власне фото, спочатку потрібно увійти в акаунт.',
  },
  ru: {
    title: 'Расскажите о себе',
    subtitle: 'Эти данные помогут соседям узнать вас в ленте.',
    nameSection: 'Ваше имя',
    namePlaceholder: 'Как вас зовут?',
    avatarSection: 'Фото профиля',
    uploadAvatar: 'Выбрать фото для аватара',
    temporaryAvatarSection: 'Выбрать временный аватар',
    genderSection: 'Пол',
    ageSection: 'Возраст',
    agePlaceholder: 'Ваш возраст',
    male: 'Мужчина',
    female: 'Женщина',
    quickRegistration: 'Быстрая Регистрация',
    continue: 'Продолжить',
    ageError: 'Возраст должен быть от 14 до 100',
    nameError: 'Введите ваше имя',
    missingTitle: 'Еще не все заполнено',
    missingName: 'Введите имя минимум из 2 символов',
    missingAvatar: 'Выберите фото профиля',
    missingGender: 'Выберите пол',
    missingAge: 'Укажите возраст от 14 до 100',
    avatarError: 'Не удалось выбрать или сохранить фото. Попробуйте еще раз.',
    loginRequiredForPhoto: 'Чтобы сохранить свое фото, сначала нужно войти в аккаунт.',
  },
  en: {
    title: 'Tell us about yourself',
    subtitle: 'This helps neighbours recognise you in the feed.',
    nameSection: 'Your name',
    namePlaceholder: 'What is your name?',
    avatarSection: 'Profile photo',
    uploadAvatar: 'Choose photo for avatar',
    temporaryAvatarSection: 'Choose temporary avatar',
    genderSection: 'Gender',
    ageSection: 'Age',
    agePlaceholder: 'Your age',
    male: 'Male',
    female: 'Female',
    quickRegistration: 'Quick registration',
    continue: 'Continue',
    ageError: 'Age must be between 14 and 100',
    nameError: 'Please enter your name',
    missingTitle: 'Not complete yet',
    missingName: 'Enter a name with at least 2 characters',
    missingAvatar: 'Choose a profile photo',
    missingGender: 'Choose gender',
    missingAge: 'Enter age from 14 to 100',
    avatarError: 'Could not choose or save the photo. Please try again.',
    loginRequiredForPhoto: 'To save your own photo, please sign in first.',
  },
} as const;

export default function ProfileSetupScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useDispatch();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector(selectUser);
  const text = TEXT[language] ?? TEXT.ua;

  const [name, setName] = useState(user?.name || '');
  const [gender, setGender] = useState<'male' | 'female' | null>(user?.gender ?? null);
  const [ageText, setAgeText] = useState(user?.age ? String(user.age) : '');
  const [selectedKey, setSelectedKey] = useState<string>(user?.startAvatarKey || '');
  const [customAvatarUri, setCustomAvatarUri] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingPhotoURL = user?.photoURL?.trim() || user?.photoURLs?.find((url) => url.trim())?.trim() || '';
  const hasExistingAvatar = Boolean(existingPhotoURL) || Boolean(user?.startAvatarKey?.trim());
  const trimmedName = name.trim();
  const parsedAge = parseInt(ageText, 10);
  const isNameDone = trimmedName.length >= 2;
  const isAvatarDone = selectedKey !== '' || customAvatarUri !== '' || hasExistingAvatar;
  const isGenderDone = gender !== null;
  const isAgeDone = !isNaN(parsedAge) && parsedAge >= 14 && parsedAge <= 100;

  const handleGenderSelect = (g: 'male' | 'female') => {
    setGender(g);
  };

  const handleAgeChange = (val: string) => {
    setAgeText(val);
    setError('');
  };

  const handlePickAvatarPhoto = async () => {
    if (saving) return;
    try {
      const picked = await pickPhotoFromLibrary({ allowsEditing: true, quality: 0.86 });
      if (!picked) return;
      setCustomAvatarUri(picked.uri);
      setSelectedKey('');
    } catch {
      Alert.alert(text.missingTitle, text.avatarError);
    }
  };

  const canSubmit = isNameDone && isGenderDone && isAgeDone && isAvatarDone;

  const renderSectionLabel = (label: string, done: boolean) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {done ? (
        <View style={styles.doneBadge}>
          <MaterialCommunityIcons name="check" size={13} color="#fff" />
        </View>
      ) : null}
    </View>
  );

  const getMissingMessages = () => {
    const missing: string[] = [];
    if (!isNameDone) missing.push(`- ${text.missingName}`);
    if (!isAvatarDone) missing.push(`- ${text.missingAvatar}`);
    if (!isGenderDone) missing.push(`- ${text.missingGender}`);
    if (!isAgeDone) missing.push(`- ${text.missingAge}`);
    return missing;
  };

  const handleContinuePress = () => {
    if (saving) return;
    const missing = getMissingMessages();
    if (missing.length > 0) {
      Alert.alert(text.missingTitle, missing.join('\n'));
      return;
    }
    void confirm().catch(() => {
      Alert.alert(text.missingTitle, text.avatarError);
    });
  };

  const handleQuickRegistrationPress = async () => {
    if (saving) return;

    setSaving(true);
    try {
      if (selectedKey) {
        await saveSelectedStartAvatar(selectedKey);
      }
      if (isNameDone && isGenderDone && isAgeDone && selectedKey) {
        await saveTempProfileData({
          name: trimmedName,
          gender: gender!,
          age: parsedAge,
          startAvatarKey: selectedKey,
        });
      }
      navigation.navigate('LoginScreen');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!canSubmit || saving) return;
    if (trimmedName.length < 2) { setError(text.nameError); return; }
    const age = parsedAge;
    if (isNaN(age) || age < 14 || age > 100) { setError(text.ageError); return; }

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid || user?.id;
      let nextPhotoURL = existingPhotoURL;
      let nextPhotoURLs = user?.photoURLs?.filter((url) => url.trim()) ?? (existingPhotoURL ? [existingPhotoURL] : []);
      let nextStartAvatarKey = user?.startAvatarKey ?? '';

      if (customAvatarUri) {
        if (!uid) {
          Alert.alert(text.missingTitle, text.loginRequiredForPhoto);
          return;
        }
        const uploaded = await uploadProfilePhoto(customAvatarUri, { moderationStatus: 'approved' });
        nextPhotoURL = uploaded.url;
        nextPhotoURLs = [uploaded.url];
        nextStartAvatarKey = '';
      } else if (selectedKey) {
        const avatar = START_AVATARS.find((a) => a.key === selectedKey) ?? START_AVATARS[0];
        nextPhotoURL = avatar.uri;
        nextPhotoURLs = [avatar.uri];
        nextStartAvatarKey = avatar.key;
        await saveSelectedStartAvatar(avatar.key);
      }

      if (uid) {
        // Authenticated — save directly to Firebase
        await updateProfileRecord(uid, {
          name: trimmedName,
          photoURL: nextPhotoURL,
          photoURLs: nextPhotoURLs,
          startAvatarKey: nextStartAvatarKey,
          gender: gender ?? undefined,
          age,
        });
        if (user) {
          dispatch(setUser({
            ...user,
            name: trimmedName,
            photoURL: nextPhotoURL,
            photoURLs: nextPhotoURLs,
            startAvatarKey: nextStartAvatarKey || undefined,
            gender: gender ?? undefined,
            age,
          }));
        }
      } else {
        // Guest — save to AsyncStorage, will be applied on registration
        await saveTempProfileData({
          name: trimmedName,
          gender: gender!,
          age,
          startAvatarKey: selectedKey,
        });
      }

      navigation.navigate('MainTabs');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>

          {/* Name */}
          {renderSectionLabel(text.nameSection, isNameDone)}
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder={text.namePlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            maxLength={60}
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.photoButton} onPress={() => void handlePickAvatarPhoto()} activeOpacity={0.86}>
            <MaterialCommunityIcons name="image-plus" size={20} color="#fff" />
            <Text style={styles.photoButtonText}>{text.uploadAvatar}</Text>
          </TouchableOpacity>
          {customAvatarUri ? (
            <Image source={{ uri: customAvatarUri }} style={styles.customAvatarPreview} resizeMode="cover" />
          ) : null}

          {/* Avatar */}
          {renderSectionLabel(text.temporaryAvatarSection, selectedKey !== '')}
          <View style={styles.grid}>
            {START_AVATARS.map((avatar) => {
              const isSelected = avatar.key === selectedKey;
              return (
                <TouchableOpacity
                  key={avatar.key}
                  style={[styles.avatarCard, isSelected && styles.avatarCardSelected]}
                  onPress={() => { setSelectedKey(avatar.key); setCustomAvatarUri(''); }}
                  activeOpacity={0.86}
                >
                  <Image source={avatar.source} style={styles.avatarImage} resizeMode="cover" />
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <MaterialCommunityIcons name="check" size={15} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Gender */}
          {renderSectionLabel(text.genderSection, isGenderDone)}
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderChip, gender === 'male' && styles.genderChipActiveMale]}
              onPress={() => handleGenderSelect('male')}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="gender-male"
                size={20}
                color={gender === 'male' ? '#fff' : SCREEN_THEME.enamelBlueDark}
              />
              <Text style={[styles.genderChipText, gender === 'male' && styles.genderChipTextActive]}>
                {text.male}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderChip, gender === 'female' && styles.genderChipActiveFemale]}
              onPress={() => handleGenderSelect('female')}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="gender-female"
                size={20}
                color={gender === 'female' ? '#fff' : SCREEN_THEME.terracotta}
              />
              <Text style={[styles.genderChipText, gender === 'female' && styles.genderChipTextActive]}>
                {text.female}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Age */}
          {renderSectionLabel(text.ageSection, isAgeDone)}
          <TextInput
            style={[styles.textInput, error ? styles.inputError : null]}
            value={ageText}
            onChangeText={handleAgeChange}
            placeholder={text.agePlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            keyboardType="number-pad"
            maxLength={3}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={{ height: 190 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.quickRegistrationButton, saving && styles.continueButtonDisabled]}
          onPress={() => void handleQuickRegistrationPress()}
          disabled={saving}
          activeOpacity={0.86}
        >
          <Text style={styles.quickRegistrationText}>{text.quickRegistration}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueButton, (!canSubmit || saving) && styles.continueButtonDisabled]}
          onPress={handleContinuePress}
          disabled={saving}
          activeOpacity={0.86}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.continueText}>{text.continue}</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 18, paddingBottom: 30 },
  header: { alignItems: 'center', marginBottom: 22 },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    marginTop: 8,
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
    marginTop: 6,
  },
  doneBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2F8F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D8C8A8',
    backgroundColor: SCREEN_THEME.paperStrong,
    paddingHorizontal: 16,
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    marginBottom: 18,
  },
  photoButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  photoButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  customAvatarPreview: {
    alignSelf: 'center',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: '#2F8F46',
    marginBottom: 18,
  },
  inputError: { borderColor: SCREEN_THEME.terracotta },
  errorText: { color: SCREEN_THEME.terracotta, fontSize: 13, marginBottom: 8, marginTop: -12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 },
  avatarCard: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 2,
    borderColor: '#E4D0AB',
  },
  avatarCardSelected: { borderColor: SCREEN_THEME.terracotta, transform: [{ scale: 0.97 }] },
  avatarImage: { width: '100%', height: '100%' },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: SCREEN_THEME.enamelBlueDark,
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  genderChipActiveMale: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  genderChipActiveFemale: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracotta,
  },
  genderChipText: { color: SCREEN_THEME.textPrimary, fontSize: 15, fontWeight: '700' },
  genderChipTextActive: { color: '#fff' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: SCREEN_THEME.appBg,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
  },
  quickRegistrationButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: SCREEN_THEME.woodGreenDark,
    backgroundColor: SCREEN_THEME.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickRegistrationText: { color: SCREEN_THEME.woodGreenDark, fontSize: 16, fontWeight: '900' },
  continueButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: { opacity: 0.45 },
  continueText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
