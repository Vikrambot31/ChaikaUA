import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';

const COPY = {
  ua: {
    title: 'Пристрій відключено',
    message: 'Цей пристрій відключено від сервера адміністратором.',
    updateHint: 'Оновіть застосунок на сайті:',
    retry: 'Перевірити ще раз',
  },
  ru: {
    title: 'Устройство отключено',
    message: 'Это устройство отключено от сервера администратором.',
    updateHint: 'Обновите приложение на сайте:',
    retry: 'Проверить снова',
  },
  en: {
    title: 'Device disconnected',
    message: 'This device has been disconnected from the server by the administrator.',
    updateHint: 'Update the app at:',
    retry: 'Check again',
  },
} as const;

const CHAIKA_URL = 'https://chaika-life.netlify.app/';
const CHAIKA_URL_DISPLAY = 'chaika-life.netlify.app';

type BlockedScreenProps = {
  message?: string;
  onRetry?: () => void;
};

const BlockedScreen: React.FC<BlockedScreenProps> = ({ onRetry }) => {
  const language = useSelector(
    (state: RootState) => (state.language?.current ?? 'ru') as Lang,
  );
  const text = COPY[language];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Shield alert icon */}
        <MaterialCommunityIcons
          name="shield-alert"
          size={52}
          color={SCREEN_THEME.terracottaDark}
          style={styles.icon}
        />

        {/* Title */}
        <Text style={styles.title}>{text.title}</Text>

        {/* Message */}
        <Text style={styles.message}>{text.message}</Text>

        {/* Update hint + URL */}
        <Text style={styles.updateHint}>{text.updateHint}</Text>
        <TouchableOpacity
          onPress={() => void Linking.openURL(CHAIKA_URL).catch(() => null)}
          activeOpacity={0.78}
        >
          <Text style={styles.urlLink}>{CHAIKA_URL_DISPLAY}</Text>
        </TouchableOpacity>

        {/* Retry button */}
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
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 20,
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
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});

export default BlockedScreen;

