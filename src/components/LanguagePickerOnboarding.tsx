import React, { useEffect, useState } from 'react';
import {
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { setLanguage } from '../redux/slices/languageSlice';
import { Language } from '../i18n/translations';
import { SCREEN_THEME } from '../utils/screenTheme';

type Props = {
  onDone: () => void;
};

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'ua', label: 'UA 🇺🇦' },
  { code: 'ru', label: 'РУ 🇷🇺' },
  { code: 'en', label: 'English' },
];

const PICKER_TEXT: Record<Language, { title: string; subtitle: string; continue: string }> = {
  ua: {
    title: 'Оберіть мову',
    subtitle: 'Виберіть зручну мову для роботи з додатком',
    continue: 'Продовжити',
  },
  ru: {
    title: 'Выберите язык',
    subtitle: 'Выберите удобный язык для работы с приложением',
    continue: 'Продолжить',
  },
  en: {
    title: 'Choose language',
    subtitle: 'Choose the language you want to use in the app',
    continue: 'Continue',
  },
};

export default function LanguagePickerOnboarding({ onDone }: Props) {
  const dispatch = useDispatch();
  const [selected, setSelected] = useState<Language>('ua');
  const text = PICKER_TEXT[selected];

  useEffect(() => {
    dispatch(setLanguage('ua'));
  }, [dispatch]);

  const handleConfirm = () => {
    onDone();
  };

  const handleSelectLanguage = (language: Language) => {
    setSelected(language);
    dispatch(setLanguage(language));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={SCREEN_THEME.appBg} />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>ЧАЙКА</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>

          <View style={styles.languageList}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageItem, selected === lang.code && styles.languageItemActive]}
                onPress={() => handleSelectLanguage(lang.code)}
                activeOpacity={0.7}
              >
                <View style={styles.languageLabelRow}>
                  <Text style={[styles.languageLabel, selected === lang.code && styles.languageLabelActive]}>
                    {lang.label}
                  </Text>
                  {lang.code === 'ru' ? (
                    <Image source={require('../../assets/WEBP-version/Russia No war.webp')} style={styles.noWarIcon} resizeMode="contain" />
                  ) : null}
                </View>
                {selected === lang.code && <View style={styles.checkDot} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.ctaButton} onPress={handleConfirm} activeOpacity={0.86}>
            <Text style={styles.ctaText}>{text.continue}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  shell: {
    flex: 1,
    paddingTop: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandBadge: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
  },
  brandBadgeText: {
    color: SCREEN_THEME.woodGreenDark,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: SCREEN_THEME.textSecondary,
    marginBottom: 36,
    lineHeight: 22,
  },
  languageList: {
    gap: 14,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  languageItemActive: {
    borderColor: SCREEN_THEME.terracotta,
    backgroundColor: 'rgba(199, 122, 93, 0.07)',
  },
  languageLabel: {
    fontSize: 19,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  languageLabelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noWarIcon: {
    width: 24,
    height: 16,
    borderRadius: 3,
  },
  languageLabelActive: {
    color: SCREEN_THEME.terracotta,
    fontWeight: '900',
  },
  checkDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
  },
  ctaButton: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  ctaText: {
    color: '#FFF9EF',
    fontSize: 17,
    fontWeight: '900',
  },
});

