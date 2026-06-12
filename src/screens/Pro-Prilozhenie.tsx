import React, { useMemo, useState } from 'react';
import { Alert, Image, ScrollView, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useDispatch, useSelector } from 'react-redux';
import { setLanguage } from '../redux/slices/languageSlice';
import { RootState } from '../redux/store';
import { useTranslation } from '../i18n/useTranslation';
import MiniTabBar from '../components/MiniTabBar';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { createPendingModeration } from '../utils/moderation';
import { APP_BUILD_DATE, APP_VERSION } from '../utils/constants';
import { showUserError } from '../utils/userFacingErrors';
import { appSuggestionsService } from '../services/appSuggestionsService';

const SUGGESTIONS_ARCHIVE_KEY = '@chaika:app_feature_suggestions_moderation_v1';
const SUGGESTION_MAX_LENGTH = 200;
const SUPPORT_EMAIL = 'support_chaika_ua@ukr.net';

const features = {
  ua: [
    'Пошук місць, карта району та корисні розділи в одному інтерфейсі',
    'Швидкий доступ до рейтингів, заявок і допомоги сусідам',
    'Зручна основа для розвитку районного сервісу Chaika Life',
  ],
  ru: [
    'Поиск мест, карта района и полезные разделы в одном интерфейсе',
    'Быстрый доступ к рейтингам, заявкам и помощи соседям',
    'Удобная основа для развития районного сервиса Chaika Life',
  ],
  en: [
    'Find places, neighborhood map and useful sections in one interface',
    'Quick access to ratings, requests and neighbor help',
    'Convenient foundation for development of Chaika Life district service',
  ],
};

const suggestionText = {
  ua: {
    title: 'Чого не вистачає?',
    intro: 'Напишіть, чого в застосунку вам не вистачає — ми додамо.',
    placeholder: 'Опишіть ідею (до 200 символів)',
    button: 'Надіслати пропозицію',
    empty: 'Напишіть короткий опис пропозиції.',
    successTitle: 'Дякуємо',
    success: 'Пропозицію збережено та надіслано на перевірку.',
    errorTitle: 'Помилка',
    error: 'Не вдалося зберегти пропозицію.',
    tooLong: 'Скоротіть пропозицію до 200 символів.',
    authHint: 'Можна надсилати і без реєстрації.',
    missionTitle: 'Наша мета',
    missionText: 'Головна ідея застосунку — зробити життя в Chaika Life зручнішим: швидше знаходити потрібні місця, вирішувати побутові питання та підтримувати контакт із сусідами.',
    featuresTitle: 'Що вміє застосунок',
    helpTitle: 'Потрібна допомога?',
    helpText: 'Якщо у вас є питання або пропозиції, напишіть нам на support_chaika_ua@ukr.net',
    copiedTitle: 'Скопійовано',
    copiedBody: 'Пошту скопійовано в буфер обміну.',
    privacyTitle: 'Конфіденційність',
    privacyPolicy: 'Політика конфіденційності',
    privacyMsg: 'Ми не передаємо ваші дані третім особам. Телефон та ім?я використовуються лише для локальних сервісів застосунку.',
    dataInApp: 'Ваші дані у застосунку',
    dataMsg: 'Ваші пропозиції зберігаються обмежений час і використовуються лише всередині застосунку для роботи сервісів.',
  },
  ru: {
    title: 'Чего не хватает?',
    intro: 'Напиши, чего в приложении тебе не хватает — мы добавим.',
    placeholder: 'Опиши идею (до 200 символов)',
    button: 'Отправить предложение',
    empty: 'Напишите короткое описание предложения.',
    successTitle: 'Спасибо',
    success: 'Предложение сохранено и отправлено на проверку.',
    errorTitle: 'Ошибка',
    error: 'Не удалось сохранить предложение.',
    tooLong: 'Сократите предложение до 200 символов.',
    authHint: 'Можно отправлять и без регистрации.',
    missionTitle: 'Наша цель',
    missionText: 'Главная идея приложения — сделать жизнь в Chaika Life удобнее: быстрее находить нужные места, решать бытовые вопросы и поддерживать контакт с соседями.',
    featuresTitle: 'Что умеет приложение',
    helpTitle: 'Нужна помощь?',
    helpText: 'Если у вас есть вопросы или предложения, напишите нам на support_chaika_ua@ukr.net',
    copiedTitle: 'Скопировано',
    copiedBody: 'Почта скопирована в буфер обмена.',
    privacyTitle: 'Конфиденциальность',
    privacyPolicy: 'Политика конфиденциальности',
    privacyMsg: 'Мы не передаем ваши данные третьим лицам. Телефон и имя используются только для локальных сервисов приложения.',
    dataInApp: 'Ваши данные в приложении',
    dataMsg: 'Ваши предложения хранятся ограниченное время и используются только внутри приложения для работы сервисов.',
  },
  en: {
    title: 'What is missing?',
    intro: 'Tell us what the app is missing — we will add it.',
    placeholder: 'Describe your idea (up to 200 characters)',
    button: 'Send suggestion',
    empty: 'Write a short suggestion.',
    successTitle: 'Thank you',
    success: 'Your suggestion was sent for moderation.',
    errorTitle: 'Error',
    error: 'Failed to save the suggestion.',
    tooLong: 'Shorten the suggestion to 200 characters.',
    authHint: 'You can submit without registration.',
    missionTitle: 'Our mission',
    missionText: 'The main goal of the app is to make life in Chaika Life easier: find useful places faster, solve everyday issues and stay connected with neighbors.',
    featuresTitle: 'What the app can do',
    helpTitle: 'Need help?',
    helpText: 'If you have any questions or suggestions, write to us at support_chaika_ua@ukr.net',
    copiedTitle: 'Copied',
    copiedBody: 'Email copied to clipboard.',
    privacyTitle: 'Privacy',
    privacyPolicy: 'Privacy policy',
    privacyMsg: 'We do not share your data with third parties. Your phone and name are used only for local app services.',
    dataInApp: 'Your data in the app',
    dataMsg: 'Your suggestions are stored for a limited time and are used only inside the app to power its services.',
  },
} as const;

const AppInfoScreen: React.FC = () => {
  const { t, language } = useTranslation();
  const dispatch = useDispatch();
  const currentLang = useSelector((state: RootState) => state.language?.current ?? 'ua');
  const authUser = useSelector((state: RootState) => state.auth.user);
  const [suggestion, setSuggestion] = useState('');
  const text = suggestionText[language];

  const canSubmitSuggestion = useMemo(
    () => suggestion.trim().length > 0,
    [suggestion]
  );

  const copySupportEmail = async () => {
    await Clipboard.setStringAsync(SUPPORT_EMAIL);
    Alert.alert(text.copiedTitle, text.copiedBody);
  };

  const submitSuggestion = async () => {
    const cleanText = suggestion.trim();
    if (!cleanText) {
      Alert.alert(text.errorTitle, text.empty);
      return;
    }

    if (cleanText.length > SUGGESTION_MAX_LENGTH) {
      Alert.alert(text.errorTitle, text.tooLong);
      return;
    }

    try {
      const displayName = (authUser?.name || '').trim() || (language === 'ru' ? 'Гость Чайки' : language === 'en' ? 'Chaika Guest' : 'Гість Чайки');
      await appSuggestionsService.addSuggestion({
        name: displayName,
        phone: authUser?.phone || '',
        text: cleanText,
        userId: authUser?.id,
        language,
      });

      const raw = await AsyncStorage.getItem(SUGGESTIONS_ARCHIVE_KEY);
      let archive: unknown[];
      try { archive = raw ? JSON.parse(raw) : []; } catch { archive = []; }
      const nextItem = {
        id: `suggestion-${Date.now()}`,
        text: cleanText.slice(0, SUGGESTION_MAX_LENGTH),
        userId: authUser?.id || 'guest',
        userName: authUser?.name || displayName,
        userPhone: authUser?.phone || '',
        userEmail: authUser?.email || '',
        createdAt: new Date().toISOString(),
        ...createPendingModeration(),
      };

      await AsyncStorage.setItem(SUGGESTIONS_ARCHIVE_KEY, JSON.stringify([nextItem, ...archive]));
      setSuggestion('');
      Alert.alert(text.successTitle, text.success);
    } catch (error) {
      showUserError(language, 'send', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{t.appInfo.title}</Text>
          <Text style={styles.headerSubtitle}>
            {language === 'ua'
              ? 'Що вміє Chaika Life і як він допомагає мешканцям'
              : language === 'ru'
                ? 'Что умеет Chaika Life и как он помогает жителям'
                : 'What Chaika Life can do and how it helps residents'}
          </Text>
        </View>

        <View style={styles.logoCard}>
          <View style={styles.logoFrame}>
            <Image source={require('../../assets/WEBP-version/Logo-Chaika-LIFE.webp')} style={styles.logo} resizeMode="contain" />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <TactileIcon icon="target" size={40} iconSize={18} backgroundColor={SCREEN_THEME.terracotta} />
            <Text style={styles.sectionTitle}>{text.missionTitle}</Text>
          </View>
          <Text style={styles.paragraph}>{text.missionText}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <TactileIcon icon="lightbulb-on-outline" size={40} iconSize={18} backgroundColor={SCREEN_THEME.woodGreen} />
            <Text style={styles.sectionTitle}>{text.title}</Text>
          </View>
          <Text style={styles.paragraph}>{text.intro}</Text>
          <TextInput
            value={suggestion}
            onChangeText={(value: string) => setSuggestion(value.slice(0, SUGGESTION_MAX_LENGTH))}
            placeholder={text.placeholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            style={styles.suggestionInput}
            multiline
            maxLength={SUGGESTION_MAX_LENGTH}
            textAlignVertical="top"
          />
          <Text style={styles.charCounter}>{suggestion.length}/{SUGGESTION_MAX_LENGTH}</Text>
          <TouchableOpacity
            style={[styles.submitSuggestionButton, !canSubmitSuggestion && styles.submitSuggestionButtonDisabled]}
            onPress={submitSuggestion}
            activeOpacity={0.82}
          >
            <Text style={styles.submitSuggestionText}>{text.button}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <TactileIcon icon="check-decagram-outline" size={40} iconSize={18} backgroundColor={SCREEN_THEME.woodGreen} />
            <Text style={styles.sectionTitle}>{text.featuresTitle}</Text>
          </View>
          {features[currentLang as keyof typeof features].map((item) => (
            <View key={item} style={styles.featureRow}>
              <View style={styles.bullet} />
              <Text style={styles.featureText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{text.helpTitle}</Text>
          <Text style={styles.infoText}>{text.helpText}</Text>
          <TouchableOpacity style={styles.emailContainer} onPress={() => void copySupportEmail()} activeOpacity={0.8}>
            <TactileIcon icon="email-outline" size={38} iconSize={16} backgroundColor="#403933" />
            <Text selectable style={styles.emailText}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <TactileIcon icon="translate" size={40} iconSize={18} backgroundColor={SCREEN_THEME.enamelBlue} />
            <Text style={styles.sectionTitle}>{t.appInfo.language}</Text>
          </View>
          <View style={styles.languageButtons}>
            {(['ua', 'ru', 'en'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.langButton, currentLang === lang && styles.langButtonActive]}
                onPress={() => dispatch(setLanguage(lang))}
                activeOpacity={0.75}
              >
                <Text style={[styles.langButtonText, currentLang === lang && styles.langButtonTextActive]}>
                  {lang === 'ua' ? '🇺🇦 UA' : lang.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <TactileIcon icon="shield-check-outline" size={40} iconSize={18} backgroundColor="#8A7AB1" />
            <Text style={styles.sectionTitle}>{text.privacyTitle}</Text>
          </View>
          <TouchableOpacity style={styles.linkRow} onPress={() => Alert.alert(text.privacyTitle, text.privacyMsg)} activeOpacity={0.75}>
            <Text style={styles.linkText}>{text.privacyPolicy}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkRow, { borderBottomWidth: 0 }]} onPress={() => Alert.alert(language === 'en' ? 'Data' : 'Дані', text.dataMsg)} activeOpacity={0.75}>
            <Text style={styles.linkText}>{text.dataInApp}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {language === 'ua' ? `Версія ${APP_VERSION}` : language === 'ru' ? `Версия ${APP_VERSION}` : `Version ${APP_VERSION}`}
          </Text>
          <Text style={styles.footerSubtext}>
            {language === 'ua' ? `Дата версії: ${APP_BUILD_DATE}` : language === 'ru' ? `Дата версии: ${APP_BUILD_DATE}` : `Version date: ${APP_BUILD_DATE}`}
          </Text>
          <Text style={styles.footerSubtext}>Chaika Life</Text>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingTop: 24, paddingBottom: 28 },
  headerCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 18, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E4D0AB' },
  headerTitle: { fontSize: 26, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 10 },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  logoCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  logoFrame: { borderRadius: 16, backgroundColor: '#d93da7', alignItems: 'center', justifyContent: 'center', minHeight: 170, padding: 18 },
  logo: { width: '88%', height: 140 },
  card: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginLeft: 10 },
  paragraph: { color: SCREEN_THEME.textPrimary, fontSize: 15, lineHeight: 22 },
  formHint: { color: SCREEN_THEME.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '800', marginTop: 10 },
  suggestionInput: { minHeight: 92, backgroundColor: '#FFF8EA', borderRadius: 16, borderWidth: 1, borderColor: '#E4D0AB', paddingHorizontal: 13, paddingVertical: 12, marginTop: 12, color: SCREEN_THEME.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  charCounter: { alignSelf: 'flex-end', marginTop: 6, color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '800' },
  submitSuggestionButton: { minHeight: 48, borderRadius: 16, backgroundColor: SCREEN_THEME.woodGreenDark, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  submitSuggestionButtonDisabled: { opacity: 0.56 },
  submitSuggestionText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0E7DF' },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: SCREEN_THEME.terracotta, marginTop: 7, marginRight: 10 },
  featureText: { flex: 1, color: SCREEN_THEME.textPrimary, fontSize: 14, lineHeight: 21 },
  infoCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  infoTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 8 },
  infoText: { color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 21 },
  footer: { alignItems: 'center', paddingVertical: 10 },
  footerText: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '700' },
  footerSubtext: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 4 },
  emailContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F3EE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, gap: 10 },
  emailText: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.terracottaDark },
  linkRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0E7DF' },
  linkText: { fontSize: 15, fontWeight: '700', color: SCREEN_THEME.textPrimary },
  languageButtons: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  langButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12, borderWidth: 2, borderColor: '#E8DDD3', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  langButtonActive: { borderColor: SCREEN_THEME.terracotta, backgroundColor: SCREEN_THEME.terracotta },
  langButtonText: { fontSize: 13, fontWeight: '700', color: '#666' },
  langButtonTextActive: { color: '#FFFFFF' },
});

export default AppInfoScreen;








