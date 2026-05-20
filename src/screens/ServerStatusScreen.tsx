import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
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
import { SCREEN_THEME } from '../utils/screenTheme';
import {
  checkAppVersion,
  compareVersions,
  getCurrentAppVersion,
} from '../services/appVersion';
import {
  getCachedRemoteConfigSnapshot,
  loadRemoteConfigSnapshot,
  type RemoteConfigSnapshot,
} from '../services/remoteConfig';
import {
  subscribeSecurityLogs,
  type SecurityLogRecord,
} from '../services/securityAdminService';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

type LocalIssue = {
  id: string;
  summary: string;
  details: string;
};

const COPY = {
  ua: {
    title: 'Сервер',
    subtitle: 'Статус синхронізації застосунку з сервером',
    refresh: 'Оновити',
    appVersion: 'Версія застосунку',
    latestVersion: 'Остання серверна версія',
    minVersion: 'Мінімально підтримувана',
    syncStatus: 'Статус синхронізації',
    inSync: 'Синхронізовано',
    outOfDate: 'Потрібне оновлення',
    remoteConfigSource: 'Джерело конфігу',
    remoteLoadedAt: 'Час завантаження конфігу',
    remoteStale: 'Конфіг застарілий',
    yes: 'так',
    no: 'ні',
    logs: 'Логи сервера',
    issues: 'Помилки',
    noLogs: 'Логи поки відсутні',
    noIssues: 'Помилок не зафіксовано',
    loading: 'Завантаження...',
  },
  ru: {
    title: 'Сервер',
    subtitle: 'Статус синхронизации приложения с сервером',
    refresh: 'Обновить',
    appVersion: 'Версия приложения',
    latestVersion: 'Последняя версия на сервере',
    minVersion: 'Минимально поддерживаемая',
    syncStatus: 'Статус синхронизации',
    inSync: 'Синхронизировано',
    outOfDate: 'Требуется обновление',
    remoteConfigSource: 'Источник конфига',
    remoteLoadedAt: 'Время загрузки конфига',
    remoteStale: 'Конфиг устарел',
    yes: 'да',
    no: 'нет',
    logs: 'Логи сервера',
    issues: 'Ошибки',
    noLogs: 'Логи пока отсутствуют',
    noIssues: 'Ошибок не зафиксировано',
    loading: 'Загрузка...',
  },
  en: {
    title: 'Server',
    subtitle: 'Application sync status with server',
    refresh: 'Refresh',
    appVersion: 'App version',
    latestVersion: 'Latest server version',
    minVersion: 'Minimum supported',
    syncStatus: 'Sync status',
    inSync: 'Synchronized',
    outOfDate: 'Update required',
    remoteConfigSource: 'Config source',
    remoteLoadedAt: 'Config loaded at',
    remoteStale: 'Config stale',
    yes: 'yes',
    no: 'no',
    logs: 'Server logs',
    issues: 'Errors',
    noLogs: 'No logs yet',
    noIssues: 'No errors recorded',
    loading: 'Loading...',
  },
} as const;

const formatDateTime = (value?: number): string => {
  if (!value || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
};

const ServerStatusScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ru') as Lang);
  const text = COPY[language];
  const mountedRef = useRef(true);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appVersion, setAppVersion] = useState(getCurrentAppVersion());
  const [latestVersion, setLatestVersion] = useState<string>('—');
  const [minSupportedVersion, setMinSupportedVersion] = useState<string>('—');
  const [remoteSnapshot, setRemoteSnapshot] = useState<RemoteConfigSnapshot | null>(null);
  const [logs, setLogs] = useState<SecurityLogRecord[]>([]);
  const [issues, setIssues] = useState<LocalIssue[]>([]);

  const addIssue = useCallback((summary: string, details: string) => {
    setIssues((current) => {
      const next: LocalIssue = { id: `${Date.now()}-${current.length}`, summary, details };
      return [next, ...current].slice(0, 30);
    });
  }, []);

  const loadStatus = useCallback(async () => {
    if (mountedRef.current) {
      setRefreshing(true);
    }
    try {
      setAppVersion(getCurrentAppVersion());
      const [versionResult, remote] = await Promise.all([
        checkAppVersion(),
        loadRemoteConfigSnapshot(),
      ]);
      if (!mountedRef.current) return;
      setLatestVersion(versionResult.config?.latestVersion ?? '—');
      setMinSupportedVersion(versionResult.config?.minSupportedVersion ?? '—');
      setRemoteSnapshot(remote);
      if (remote.error) {
        addIssue(
          language === 'ru' ? 'Ошибка remote config' : language === 'ua' ? 'Помилка remote config' : 'Remote config error',
          remote.error,
        );
      }
    } catch (error) {
      if (!mountedRef.current) return;
      addIssue(
        language === 'ru' ? 'Ошибка обновления статуса' : language === 'ua' ? 'Помилка оновлення статусу' : 'Status refresh error',
        error instanceof Error ? error.message : String(error),
      );
      const cached = await getCachedRemoteConfigSnapshot().catch(() => null);
      if (cached && mountedRef.current) {
        setRemoteSnapshot(cached);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [addIssue, language]);

  useEffect(() => {
    mountedRef.current = true;
    void loadStatus();
    const unsubscribeLogs = subscribeSecurityLogs(
      (nextLogs) => {
        if (!mountedRef.current) return;
        setLogs(nextLogs);
      },
      (error) => {
        if (!mountedRef.current) return;
        addIssue(
          language === 'ru' ? 'Ошибка чтения логов' : language === 'ua' ? 'Помилка читання логів' : 'Log subscription error',
          error.message,
        );
      },
    );

    return () => {
      mountedRef.current = false;
      unsubscribeLogs();
    };
  }, [addIssue, language, loadStatus]);

  const syncOk = useMemo(() => {
    if (!latestVersion || latestVersion === '—') return true;
    return compareVersions(appVersion, latestVersion) >= 0;
  }, [appVersion, latestVersion]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadStatus()} />}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.82}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#7A1E5C" />
            <Text style={styles.loadingText}>{text.loading}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{text.syncStatus}</Text>
          <Text style={[styles.syncBadge, syncOk ? styles.syncOk : styles.syncBad]}>
            {syncOk ? text.inSync : text.outOfDate}
          </Text>
          <Text style={styles.meta}>{text.appVersion}: {appVersion}</Text>
          <Text style={styles.meta}>{text.latestVersion}: {latestVersion}</Text>
          <Text style={styles.meta}>{text.minVersion}: {minSupportedVersion}</Text>
          <Text style={styles.meta}>{text.remoteConfigSource}: {remoteSnapshot?.source ?? '—'}</Text>
          <Text style={styles.meta}>{text.remoteLoadedAt}: {formatDateTime(remoteSnapshot?.loadedAt)}</Text>
          <Text style={styles.meta}>{text.remoteStale}: {remoteSnapshot?.isStale ? text.yes : text.no}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{text.issues}</Text>
          {issues.length === 0 ? (
            <Text style={styles.meta}>{text.noIssues}</Text>
          ) : (
            issues.slice(0, 12).map((item) => (
              <View key={item.id} style={styles.issueRow}>
                <Text style={styles.issueTitle}>{item.summary}</Text>
                <Text style={styles.issueDetails}>{item.details}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{text.logs}</Text>
          {logs.length === 0 ? (
            <Text style={styles.meta}>{text.noLogs}</Text>
          ) : (
            logs.slice(0, 20).map((log) => (
              <View key={`${log.partition}:${log.id}`} style={styles.logRow}>
                <Text style={styles.logEvent}>{log.event_type}</Text>
                <Text style={styles.logMeta}>{formatDateTime(log.created_at)}</Text>
                <Text style={styles.logMeta}>UID: {log.uid || '—'}</Text>
                <Text style={styles.logMeta}>device: {log.device_id || '—'}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={() => void loadStatus()} activeOpacity={0.82}>
          <Text style={styles.refreshBtnText}>{text.refresh}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  header: { borderRadius: 16, backgroundColor: '#7A1E5C', padding: 14 },
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  loadingCard: {
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  card: { borderRadius: 16, backgroundColor: '#fff', padding: 14, borderWidth: 1, borderColor: '#E6D9CF' },
  cardTitle: { color: SCREEN_THEME.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  syncBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    overflow: 'hidden',
  },
  syncOk: { backgroundColor: 'rgba(95,123,77,0.18)', color: '#31533A' },
  syncBad: { backgroundColor: 'rgba(199,66,66,0.18)', color: '#7A2525' },
  meta: { color: SCREEN_THEME.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2, fontWeight: '700' },
  issueRow: { borderTopWidth: 1, borderTopColor: '#EEE4DA', paddingTop: 8, marginTop: 8 },
  issueTitle: { color: '#7A2525', fontSize: 13, fontWeight: '900' },
  issueDetails: { color: '#6A5950', fontSize: 12, lineHeight: 17, marginTop: 2, fontWeight: '700' },
  logRow: { borderTopWidth: 1, borderTopColor: '#EEE4DA', paddingTop: 8, marginTop: 8 },
  logEvent: { color: '#2D2018', fontSize: 13, fontWeight: '900' },
  logMeta: { color: '#6A5950', fontSize: 12, lineHeight: 17, marginTop: 2, fontWeight: '700' },
  refreshBtn: {
    borderRadius: 12,
    backgroundColor: '#7A1E5C',
    paddingVertical: 11,
    alignItems: 'center',
  },
  refreshBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});

export default ServerStatusScreen;

