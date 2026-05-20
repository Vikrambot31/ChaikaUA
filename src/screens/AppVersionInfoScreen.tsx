import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { getBuildInfo, type BuildInfo } from '../utils/buildInfo';
import { getReleases, getScreenNameForFile, type ReleaseInfo } from '../services/releaseInfoService';
import { COLORS } from '../utils/constants';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';

const COPY = {
  ua: {
    title: 'Версія APP і обновлення',
    currentVersion: 'Поточна версія',
    source: 'Джерело',
    build: 'Збірка',
    commit: 'Коміт',
    mode: 'Режим',
    releaseHistory: 'Історія релізів',
    current: 'Поточна',
    filesChanged: 'Змінені файли',
    showMore: 'Показати всі',
    hideMore: 'Сховати',
    noReleases: 'Немає зареєстрованих релізів',
    loading: 'Завантаження...',
    error: 'Помилка завантаження релізів',
    retry: 'Повторити',
    moreFiles: 'ще файлів',
    appVersion: 'Версія APP',
    summary: 'Опис',
  },
  ru: {
    title: 'Версия APP и обновления',
    currentVersion: 'Текущая версия',
    source: 'Источник',
    build: 'Сборка',
    commit: 'Коммит',
    mode: 'Режим',
    releaseHistory: 'История релизов',
    current: 'Текущая',
    filesChanged: 'Измененные файлы',
    showMore: 'Показать все',
    hideMore: 'Скрыть',
    noReleases: 'Нет зарегистрированных релизов',
    loading: 'Загрузка...',
    error: 'Ошибка загрузки релизов',
    retry: 'Повторить',
    moreFiles: 'ещё файлов',
    appVersion: 'Версия APP',
    summary: 'Описание',
  },
  en: {
    title: 'App Version & Updates',
    currentVersion: 'Current version',
    source: 'Source',
    build: 'Build',
    commit: 'Commit',
    mode: 'Mode',
    releaseHistory: 'Release history',
    current: 'Current',
    filesChanged: 'Changed files',
    showMore: 'Show all',
    hideMore: 'Hide',
    noReleases: 'No registered releases',
    loading: 'Loading...',
    error: 'Failed to load releases',
    retry: 'Retry',
    moreFiles: 'more files',
    appVersion: 'App Version',
    summary: 'Summary',
  },
} as const;

const PREVIEW_FILE_COUNT = 3;

function ReleaseCard({
  release,
  isFirst,
  currentVersion,
  text,
}: {
  release: ReleaseInfo;
  isFirst: boolean;
  currentVersion: string;
  text: typeof COPY[Lang];
}) {
  const [expanded, setExpanded] = useState(isFirst);
  const isCurrent = release.version === currentVersion;
  const fileEntries = Object.entries(release.files);
  const visibleFiles = expanded ? fileEntries : fileEntries.slice(0, PREVIEW_FILE_COUNT);
  const hiddenCount = fileEntries.length - PREVIEW_FILE_COUNT;

  return (
    <View style={styles.releaseCard}>
      <TouchableOpacity
        style={styles.releaseHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.82}
      >
        <View style={styles.releaseHeaderRow}>
          <Text style={styles.releaseVersion}>
            v{release.version}
            {isCurrent ? <Text style={styles.currentBadge}> ({text.current})</Text> : null}
          </Text>
          <Text style={styles.releaseDate}>
            {release.buildStamp || release.timestamp?.slice(0, 10) || ''}
          </Text>
        </View>
        {release.summary ? <Text style={styles.releaseSummary}>{release.summary}</Text> : null}
        <Text style={styles.expandToggle}>{expanded ? '▲' : '▼'} {text.filesChanged}: {fileEntries.length}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.fileList}>
          {visibleFiles.map(([filePath, entry]) => {
            const screenName = getScreenNameForFile(filePath);
            return (
              <View key={filePath} style={styles.fileEntry}>
                <Text style={styles.filePath} numberOfLines={2}>
                  {filePath}
                  {screenName ? <Text style={styles.screenName}> [{screenName}]</Text> : null}
                </Text>
                {entry.commits.map((commit, idx) => (
                  <Text key={idx} style={styles.commitMsg} numberOfLines={2}>
                    {'\u2514\u2500'} "{commit}"
                  </Text>
                ))}
              </View>
            );
          })}
          {!expanded && hiddenCount > 0 ? (
            <Text style={styles.moreFiles}>... {hiddenCount} {text.moreFiles}</Text>
          ) : null}
          {expanded && fileEntries.length > PREVIEW_FILE_COUNT ? (
            <TouchableOpacity onPress={() => setExpanded(false)} style={styles.collapseBtn}>
              <Text style={styles.collapseBtnText}>{text.hideMore}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        fileEntries.length > PREVIEW_FILE_COUNT ? (
          <Text style={styles.moreFilesHint}>... {hiddenCount} {text.moreFiles}</Text>
        ) : null
      )}
    </View>
  );
}

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;

const AppVersionInfoScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = COPY[language];

  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [info, releaseList] = await Promise.all([
        getBuildInfo(),
        getReleases(10),
      ]);
      setBuildInfo(info);
      setReleases(releaseList);
    } catch (err) {
      setError(err instanceof Error ? err.message : text.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [text.error]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.82}>
          <Text style={styles.backBtnText}>{'\u2190'} </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.title}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadData(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          {buildInfo ? (
            <View style={styles.currentCard}>
              <Text style={styles.currentCardTitle}>{'\u{1F4E6}'} ChaikaUA-v{buildInfo.appVersion}-{buildInfo.buildDate}</Text>
              <Text style={styles.currentCardMeta}>{text.source}: {buildInfo.source}</Text>
              <Text style={styles.currentCardMeta}>{text.build}: {buildInfo.buildStamp || '\u2014'}</Text>
              <Text style={styles.currentCardMeta}>{text.commit}: {buildInfo.commitHash ? buildInfo.commitHash.slice(0, 8) : '\u2014'}</Text>
              <Text style={styles.currentCardMeta}>{text.mode}: {buildInfo.buildMode || '\u2014'}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>{text.releaseHistory}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()} activeOpacity={0.82}>
                <Text style={styles.retryBtnText}>{text.retry}</Text>
              </TouchableOpacity>
            </View>
          ) : releases.length === 0 ? (
            <Text style={styles.empty}>{text.noReleases}</Text>
          ) : (
            releases.map((release, idx) => (
              <ReleaseCard
                key={release.versionKey}
                release={release}
                isFirst={idx === 0}
                currentVersion={buildInfo?.appVersion ?? ''}
                text={text}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 44,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900', flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6E6157', fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  currentCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  currentCardTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 8 },
  currentCardMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', marginBottom: 12 },
  releaseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  releaseHeader: { padding: 14 },
  releaseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  releaseVersion: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  currentBadge: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  releaseDate: { fontSize: 12, color: '#7D736B', fontWeight: '600' },
  releaseSummary: { fontSize: 13, color: '#4A3326', marginTop: 4, marginBottom: 4, fontStyle: 'italic' },
  expandToggle: { fontSize: 12, color: '#7A1E5C', fontWeight: '700', marginTop: 6 },
  fileList: { paddingHorizontal: 14, paddingBottom: 14 },
  fileEntry: { marginBottom: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0E8EC' },
  filePath: { fontSize: 12, color: '#333', fontWeight: '700', fontFamily: 'monospace' },
  screenName: { fontSize: 12, color: COLORS.primary, fontWeight: '700', fontStyle: 'italic' },
  commitMsg: { fontSize: 11, color: '#6E6157', marginTop: 2, marginLeft: 8 },
  moreFiles: { fontSize: 11, color: '#7D736B', fontStyle: 'italic', marginTop: 4 },
  moreFilesHint: { fontSize: 11, color: '#7D736B', fontStyle: 'italic', paddingHorizontal: 14, paddingBottom: 8 },
  collapseBtn: { alignSelf: 'flex-start', marginTop: 8 },
  collapseBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 16, marginBottom: 12 },
  errorText: { color: '#9C3F2B', fontWeight: '700', marginBottom: 8 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { textAlign: 'center', color: '#7D736B', fontWeight: '700', marginTop: 40 },
});

export default AppVersionInfoScreen;
