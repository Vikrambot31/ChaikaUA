import React from 'react';
import { Image, Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import { VersionCheckResult } from '../services/appVersion';
import { RootState } from '../redux/store';
import { Language } from '../i18n/translations';

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
    retry: 'Перевірити ще раз',
  },
  ru: {
    title: 'Обновите приложение',
    text: 'Доступна новая версия Чайки. Текущая версия больше не поддерживается.',
    yourVersion: 'Ваша версия',
    requiredVersion: 'Требуемая версия',
    download: 'Обновить приложение',
    retry: 'Проверить снова',
  },
  en: {
    title: 'Update the app',
    text: 'A new version of Chaika is available. Your current version is no longer supported.',
    yourVersion: 'Your version',
    requiredVersion: 'Required version',
    download: 'Update app',
    retry: 'Check again',
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
  const downloadUrl = 'https://chaika-life.netlify.app/';
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Language);
  const t = uiTextByLanguage[language];

  const requiredVersion = config?.minSupportedVersion || getNextPatchVersion(result.currentVersion);
  const requiredVersionForDisplay =
    requiredVersion === result.currentVersion ? getNextPatchVersion(result.currentVersion) : requiredVersion;

  const openDownload = () => {
    void Linking.openURL(downloadUrl);
  };

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

        <TouchableOpacity style={styles.primaryBtn} onPress={openDownload} activeOpacity={0.86}>
          <MaterialCommunityIcons name="download" size={20} color="#fff" />
          <Text style={styles.primaryText}>{t.download}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={onRetry} activeOpacity={0.82}>
          <Text style={styles.secondaryText}>{t.retry}</Text>
        </TouchableOpacity>
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

