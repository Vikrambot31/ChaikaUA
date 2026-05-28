import React, { useState } from 'react';
import {
  ActivityIndicator,
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
  getDefaultAvatarKey,
  saveTempProfileData,
} from '../utils/startAvatars';
import { updateProfileRecord } from '../services/authProfileService';

const TEXT = {
  ua: {
    title: 'Розкажіть про себе',
    subtitle: 'Ці дані допоможуть сусідам впізнати вас у стрічці.',
    nameSection: "Ваше ім'я",
    namePlaceholder: "Як вас звати?",
    avatarSection: 'Фото профілю',
    genderSection: 'Стать',
    ageSection: 'Вік',
    agePlaceholder: 'Ваш вік',
    male: 'Чоловік',
    female: 'Жінка',
    continue: 'Продовжити',
    ageError: 'Вік має бути від 14 до 100',
    nameError: "Введіть ваше ім'я",
  },
  ru: {
    title: 'Расскажите о себе',
    subtitle: 'Эти данные помогут соседям узнать вас в ленте.',
    nameSection: 'Ваше имя',
    namePlaceholder: 'Как вас зовут?',
    avatarSection: 'Фото профиля',
    genderSection: 'Пол',
    ageSection: 'Возраст',
    agePlaceholder: 'Ваш возраст',
    male: 'Мужчина',
    female: 'Женщина',
    continue: 'Продолжить',
    ageError: 'Возраст должен быть от 14 до 100',
    nameError: 'Введите ваше имя',
  },
  en: {
    title: 'Tell us about yourself',
    subtitle: 'This helps neighbours recognise you in the feed.',
    nameSection: 'Your name',
    namePlaceholder: 'What is your name?',
    avatarSection: 'Profile photo',
    genderSection: 'Gender',
    ageSection: 'Age',
    agePlaceholder: 'Your age',
    male: 'Male',
    female: 'Female',
    continue: 'Continue',
    ageError: 'Age must be between 14 and 100',
    nameError: 'Please enter your name',
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleGenderSelect = (g: 'male' | 'female') => {
    setGender(g);
    if (!selectedKey) {
      const age = parseInt(ageText, 10);
      setSelectedKey(getDefaultAvatarKey(g, isNaN(age) ? undefined : age));
    }
  };

  const handleAgeChange = (val: string) => {
    setAgeText(val);
    setError('');
    if (gender && !selectedKey) {
      const age = parseInt(val, 10);
      setSelectedKey(getDefaultAvatarKey(gender, isNaN(age) ? undefined : age));
    }
  };

  const canSubmit = name.trim().length >= 2 && gender !== null && ageText.trim().length > 0 && selectedKey !== '';

  const confirm = async () => {
    if (!canSubmit || saving) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) { setError(text.nameError); return; }
    const age = parseInt(ageText, 10);
    if (isNaN(age) || age < 14 || age > 100) { setError(text.ageError); return; }

    const avatarKey = selectedKey || getDefaultAvatarKey(gender ?? undefined, age);
    const avatar = START_AVATARS.find((a) => a.key === avatarKey) ?? START_AVATARS[0];

    setSaving(true);
    try {
      await saveSelectedStartAvatar(avatar.key);

      const uid = auth.currentUser?.uid || user?.id;
      if (uid) {
        // Authenticated — save directly to Firebase
        await updateProfileRecord(uid, {
          name: trimmedName,
          photoURL: avatar.uri,
          photoURLs: [avatar.uri],
          startAvatarKey: avatar.key,
          gender: gender ?? undefined,
          age,
        });
        if (user) {
          dispatch(setUser({
            ...user,
            name: trimmedName,
            photoURL: avatar.uri,
            photoURLs: [avatar.uri],
            startAvatarKey: avatar.key,
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
          startAvatarKey: avatar.key,
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
          <Text style={styles.sectionLabel}>{text.nameSection}</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder={text.namePlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            maxLength={60}
            autoCorrect={false}
          />

          {/* Avatar */}
          <Text style={styles.sectionLabel}>{text.avatarSection}</Text>
          <View style={styles.grid}>
            {START_AVATARS.map((avatar) => {
              const isSelected = avatar.key === selectedKey;
              return (
                <TouchableOpacity
                  key={avatar.key}
                  style={[styles.avatarCard, isSelected && styles.avatarCardSelected]}
                  onPress={() => setSelectedKey(avatar.key)}
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
          <Text style={styles.sectionLabel}>{text.genderSection}</Text>
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
          <Text style={styles.sectionLabel}>{text.ageSection}</Text>
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

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, (!canSubmit || saving) && styles.continueButtonDisabled]}
          onPress={() => void confirm()}
          disabled={!canSubmit || saving}
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
    marginBottom: 10,
    marginTop: 6,
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
