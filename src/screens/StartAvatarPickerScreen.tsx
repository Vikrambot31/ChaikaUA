import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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
import { saveSelectedStartAvatar, START_AVATARS } from '../utils/startAvatars';
import { updateProfileRecord } from '../services/authProfileService';

const TEXT = {
  ua: {
    title: 'Оберіть аватар',
    subtitle: 'Це тимчасове фото профілю. Після реєстрації його можна замінити на своє.',
    continue: 'Продовжити',
    selected: 'Обрано',
    successTitle: 'Чудово!',
    successPrefix: 'Аватар обрано. Тепер залишилось тільки ',
    successHighlight: 'зареєструватися',
    register: 'До реєстрації',
  },
  ru: {
    title: 'Выберите аватар',
    subtitle: 'Это временное фото профиля. После регистрации его можно заменить на своё.',
    continue: 'Продолжить',
    selected: 'Выбрано',
    successTitle: 'Отлично!',
    successPrefix: 'Аватар выбран. Теперь осталось только ',
    successHighlight: 'зарегистрироваться',
    register: 'К регистрации',
  },
  en: {
    title: 'Choose an avatar',
    subtitle: 'This is a temporary profile photo. You can replace it after registration.',
    continue: 'Continue',
    selected: 'Selected',
    successTitle: 'Great!',
    successPrefix: 'Avatar selected. Now just ',
    successHighlight: 'finish registration',
    register: 'Go to registration',
  },
} as const;

export default function StartAvatarPickerScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const dispatch = useDispatch();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector(selectUser);
  const text = TEXT[language] ?? TEXT.ua;
  const [selectedKey, setSelectedKey] = useState(START_AVATARS[0]?.key ?? '');
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const selectedAvatar = useMemo(
    () => START_AVATARS.find((avatar) => avatar.key === selectedKey) ?? START_AVATARS[0],
    [selectedKey],
  );

  const confirm = async () => {
    if (!selectedAvatar || saving) return;
    setSaving(true);
    try {
      await saveSelectedStartAvatar(selectedAvatar.key);

      const uid = auth.currentUser?.uid || user?.id;
      if (uid) {
        await updateProfileRecord(uid, {
          photoURL: selectedAvatar.uri,
          photoURLs: [selectedAvatar.uri],
          startAvatarKey: selectedAvatar.key,
        });
        if (user) {
          dispatch(setUser({
            ...user,
            photoURL: selectedAvatar.uri,
            photoURLs: [selectedAvatar.uri],
            startAvatarKey: selectedAvatar.key,
          }));
        }
      }

      setSuccessVisible(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

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
                {isSelected ? (
                  <View style={styles.selectedBadge}>
                    <MaterialCommunityIcons name="check" size={15} color="#fff" />
                    <Text style={styles.selectedText}>{text.selected}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, saving && { opacity: 0.55 }]}
          onPress={() => void confirm()}
          disabled={saving}
          activeOpacity={0.86}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.continueText}>{text.continue}</Text>
          }
        </TouchableOpacity>
      </View>

      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={() => setSuccessVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{text.successTitle}</Text>
            <Text style={styles.modalBody}>
              {text.successPrefix}
              <Text style={styles.modalBodyHighlight}>{text.successHighlight}</Text>.
            </Text>
            <TouchableOpacity
              style={styles.modalOkButton}
              activeOpacity={0.88}
              onPress={() => {
                setSuccessVisible(false);
                navigation.navigate('MainTabs');
              }}
            >
              <Text style={styles.modalOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 18, paddingBottom: 110 },
  header: { alignItems: 'center', marginBottom: 18 },
  backButton: {
    alignSelf: 'flex-start',
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  title: { marginTop: 10, color: SCREEN_THEME.textPrimary, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 8, color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  avatarCard: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 2,
    borderColor: '#E4D0AB',
  },
  avatarCardSelected: { borderColor: SCREEN_THEME.terracotta, transform: [{ scale: 0.98 }] },
  avatarImage: { width: '100%', height: '100%' },
  selectedBadge: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  selectedText: { color: '#fff', fontSize: 12, fontWeight: '900' },
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
  continueText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#FFF9EF',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 18,
  },
  modalTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalBody: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
  },
  modalBodyHighlight: {
    fontSize: 23,
    fontWeight: '900',
    color: SCREEN_THEME.terracottaDark,
  },
  modalOkButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
});
