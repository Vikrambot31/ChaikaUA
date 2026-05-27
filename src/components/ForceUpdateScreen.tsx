import React, { useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import { VersionCheckResult } from '../services/appVersion';
import { RootState } from '../redux/store';
import { Language } from '../i18n/translations';
import { downloadApk, installApk } from '../services/apkInstallService';

type UpdateStatus = 'idle' | 'downloading' | 'downloaded' | 'installing' | 'error';

type ForceUpdateScreenProps = {
  result: VersionCheckResult;
  onRetry: () => void;
};

const uiTextByLanguage = {
  ua: {
    title: 'Оновіть застосунок',
    text: 'Доступна нова версія Чайки. Поточна версія більше не підтримується.',
    yourVersion: 'Ваша версія',
    requiredVersion: 'Потрібна версія',
    download: 'Оновити застосунок',
    downloading: 'Завантаження',
    installing: 'Відкриваємо встановлення...',
    downloaded: 'Файл завантажено. Підтвердіть встановлення Android.',
    retry: 'Перевірити ще раз',
    repeat: 'Повторити',
    missingUrl: 'Посилання на APK недоступне. Спробуйте ще раз пізніше.',
    downloadError: 'Не вдалося завантажити або відкрити встановлення APK.',
  },
  ru: {
    title: 'Обновите приложение',
    text: 'Доступна новая версия Чайки. Текущая версия больше не поддерживается.',
    yourVersion: 'Ваша версия',
    requiredVersion: 'Требуемая версия',
    download: 'Обновить приложение',
    downloading: 'Загрузка',
    installing: 'Открываем установку...',
    downloaded: 'Файл загружен. Подтвердите установку Android.',
    retry: 'Проверить снова',
    repeat: 'Повторить',
    missingUrl: 'Ссылка на APK недоступна. Попробуйте позже.',
    downloadError: 'Не удалось скачать или открыть установку APK.',
  },
  en: {
    title: 'Update the app',
    text: 'A new version of Chaika is available. Your current version is no longer supported.',
    yourVersion: 'Your version',
    requiredVersion: 'Required version',
    download: 'Update app',
    downloading: 'Downloading',
    installing: 'Opening installer...',
    downloaded: 'File downloaded. Confirm the Android installation.',
    retry: 'Check again',
    repeat: 'Retry',
    missingUrl: 'APK link is unavailable. Please try again later.',
    downloadError: 'Could not download or open APK installation.',
  },
} as const;

const getNextPatchVersion = (version: string): string => {
  const segments = version.split('.');
  if (!segments.length) return version;

  const lastIndex = segments.length - 1;
  const currentPatch = Number.parseInt(segments[lastIndex], 10);
  if (!Number.isFinite(currentPatch)) return version;

  segments[lastIndex] = String(currentPatch + 1);
  return segments.join('.');
};

const ForceUpdateScreen: React.FC<ForceUpdateScreenProps> = ({ result, onRetry }) => {
  const config = result.config;
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Language);
  const t = uiTextByLanguage[language];
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);

  const requiredVersion = config?.minSupportedVersion || getNextPatchVersion(result.currentVersion);
  const requiredVersionForDisplay =
    requiredVersion === result.currentVersion ? getNextPatchVersion(result.currentVersion) : requiredVersion;

  const updateApp = async () => {
    const androidUrl = config?.androidUrl?.trim();
    if (!androidUrl) {
      setStatus('error');
      setErrorText(t.missingUrl);
      return;
    }

    try {
      setErrorText(null);
      setProgress(0);
      setStatus('downloading');
      const apkUri = await downloadApk({
        url: androidUrl,
        fileName: config?.apkFileName,
        onProgress: setProgress,
      });
      setStatus('installing');
      await installApk(apkUri);
      setStatus('idle');
    } catch (error) {
      if (__DEV__) {
        console.warn('Unable to install APK update', error);
      }
      setStatus('error');
      setErrorText(t.downloadError);
    }
  };

  const isBusy = status === 'downloading' || status === 'installing';
  const statusText =
    status === 'downloading'
      ? `${t.downloading}: ${progress}%`
      : status === 'installing'
        ? t.installing
        : status === 'downloaded'
          ? t.downloaded
          : errorText;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Image source={require('../../assets/WEBP-version/Update.webp')} style={styles.headerImage} resizeMode="contain" />
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={42} color="#fff" />
        </View>

        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.text}>{t.text}</Text>

        <View style={styles.versionBox}>
          <Text style={styles.versionText}>{t.yourVersion}: {result.currentVersion}</Text>
          <Text style={styles.versionText}>{t.requiredVersion}: {requiredVersionForDisplay}</Text>
        </View>

        {statusText ? <Text style={[styles.statusText, status === 'error' && styles.errorText]}>{statusText}</Text> : null}

        {status === 'downloading' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        ) : null}

        <TouchableOpacity style={[styles.primaryBtn, isBusy && styles.disabledBtn]} onPress={updateApp} activeOpacity={0.86} disabled={isBusy}>
          {isBusy ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="download" size={20} color="#fff" />}
          <Text style={styles.primaryText}>{t.download}</Text>
        </TouchableOpacity>

        {status === 'error' ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={onRetry} activeOpacity={0.82}>
            <Text style={styles.secondaryText}>{t.repeat}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 22,
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadowStrong,
  },
  iconBox: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headerImage: {
    width: 296,
    height: 176,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  text: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '700',
  },
  versionBox: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.cardCream,
    padding: 13,
    marginTop: 18,
    gap: 4,
  },
  versionText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  disabledBtn: { opacity: 0.72 },
  statusText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  errorText: { color: '#B93A32' },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E7D9BF',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.woodGreenDark,
  },
  secondaryBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 8,
  },
  secondaryText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '900' },
});

export default ForceUpdateScreen;

