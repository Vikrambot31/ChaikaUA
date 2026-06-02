import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';

const COPY = {
  ua: {
    title: 'Сервіс тимчасово недоступний',
    defaultMessage: 'Ми проводимо технічне обслуговування.',
    updateHint: 'Оновіть застосунок на сайті:',
    retry: 'Повторити',
    support: 'Написати в підтримку',
  },
  ru: {
    title: 'Сервис временно недоступен',
    defaultMessage: 'Выполняются технические работы.',
    updateHint: 'Обновите приложение на сайте:',
    retry: 'Повторить',
    support: 'Написать в поддержку',
  },
  en: {
    title: 'Service temporarily unavailable',
    defaultMessage: 'We are performing maintenance.',
    updateHint: 'Update the app at:',
    retry: 'Retry',
    support: 'Contact support',
  },
} as const;

const CHAIKA_URL = 'https://chaika-life.netlify.app/';
const CHAIKA_URL_DISPLAY = 'chaika-life.netlify.app';
const SUPPORT_EMAIL_URL = 'mailto:support_chaika_ua@ukr.net';

type MaintenanceScreenProps = {
  message?: string;
  onRetry?: () => void;
};

const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ message, onRetry }) => {
  const language = useSelector(
    (state: RootState) => (state.language?.current ?? 'ru') as Lang,
  );
  const text = COPY[language];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <MaterialCommunityIcons
          name="tools"
          size={52}
          color={SCREEN_THEME.terracottaDark}
          style={styles.icon}
        />

        <Text style={styles.title}>{text.title}</Text>

        <Text style={styles.message}>
          {message || text.defaultMessage}
        </Text>

        <Text style={styles.updateHint}>{text.updateHint}</Text>
        <TouchableOpacity
          onPress={() => void Linking.openURL(CHAIKA_URL).catch(() => null)}
          activeOpacity={0.78}
        >
          <Text style={styles.urlLink}>{CHAIKA_URL_DISPLAY}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.supportButton}
          onPress={() => void Linking.openURL(SUPPORT_EMAIL_URL).catch(() => null)}
          activeOpacity={0.82}
        >
          <Text style={styles.supportButtonText}>{text.support}</Text>
        </TouchableOpacity>

        {onRetry ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.82}
          >
            <Text style={styles.retryButtonText}>{text.retry}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    backgroundColor: SCREEN_THEME.paperStrong,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    ...SCREEN_THEME.raisedShadowStrong,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  message: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 16,
  },
  updateHint: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  urlLink: {
    color: SCREEN_THEME.terracotta,
    fontSize: 14,
    fontWeight: '900',
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginBottom: 22,
  },
  retryButton: {
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  supportButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracotta,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 10,
  },
  supportButtonText: {
    color: SCREEN_THEME.terracottaDark,
    fontSize: 14,
    fontWeight: '900',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});

export default MaintenanceScreen;


