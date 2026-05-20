import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { off, onValue, ref } from 'firebase/database';
import { database } from '../firebase-core';
import type { RuntimeMonitorEntry } from '../services/runtimeMonitorService';
import type { RootState } from '../redux/store';

type AppNav = NavigationProp<Record<string, object | undefined>>;

type ModerationErrorRecord = {
  id: string;
  submittedAt: number;
  fingerprint: string;
  uid?: string | null;
  reporter?: {
    userId?: string | null;
    name?: string | null;
  } | null;
  entry: RuntimeMonitorEntry;
};

type DedupedModerationError = {
  fingerprint: string;
  entry: RuntimeMonitorEntry;
  submittedAt: number;
  duplicates: number;
  users: Set<string>;
};

const TEXT = {
  ua: {
    back: 'Назад',
    title: 'Моніторинг помилок користувачів',
    loading: 'Завантажуємо помилки...',
    empty: 'Поки що немає надісланих критичних помилок.',
    lastSent: 'Остання відправка',
    repeats: 'Повторів',
    users: 'Користувачів',
    screen: 'Екран',
    reason: 'Технічна причина',
  },
  ru: {
    back: 'Назад',
    title: 'Мониторинг ошибок пользователей',
    loading: 'Загружаем ошибки...',
    empty: 'Пока нет отправленных критических ошибок.',
    lastSent: 'Последняя отправка',
    repeats: 'Повторов',
    users: 'Пользователей',
    screen: 'Экран',
    reason: 'Техническая причина',
  },
  en: {
    back: 'Back',
    title: 'User error monitoring',
    loading: 'Loading errors...',
    empty: 'No submitted critical errors yet.',
    lastSent: 'Last submitted',
    repeats: 'Repeats',
    users: 'Users',
    screen: 'Screen',
    reason: 'Technical reason',
  },
} as const;

const normalizeRecord = (id: string, value: unknown): ModerationErrorRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawEntry = raw.entry;
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const entry = rawEntry as RuntimeMonitorEntry;
  if (typeof entry.shortType !== 'string' || typeof entry.screen !== 'string') return null;

  const fingerprint = typeof raw.fingerprint === 'string' && raw.fingerprint.trim()
    ? raw.fingerprint.trim()
    : `${entry.screen}|${entry.shortType}|${entry.rawMessage || ''}`;

  return {
    id,
    submittedAt: Number.isFinite(raw.submittedAt) ? Number(raw.submittedAt) : 0,
    fingerprint,
    uid: typeof raw.uid === 'string' ? raw.uid : null,
    reporter: raw.reporter && typeof raw.reporter === 'object'
      ? {
        userId: typeof (raw.reporter as Record<string, unknown>).userId === 'string'
          ? String((raw.reporter as Record<string, unknown>).userId)
          : null,
        name: typeof (raw.reporter as Record<string, unknown>).name === 'string'
          ? String((raw.reporter as Record<string, unknown>).name)
          : null,
      }
      : null,
    entry,
  };
};

const dedupeErrors = (records: ModerationErrorRecord[]): DedupedModerationError[] => {
  const map = new Map<string, DedupedModerationError>();
  records.forEach((record) => {
    const key = record.fingerprint;
    const existing = map.get(key);
    const userKey = record.uid || record.reporter?.userId || record.reporter?.name || 'unknown';
    if (!existing) {
      map.set(key, {
        fingerprint: key,
        entry: record.entry,
        submittedAt: record.submittedAt,
        duplicates: 1,
        users: new Set([userKey]),
      });
      return;
    }

    existing.duplicates += 1;
    existing.users.add(userKey);
    if (record.submittedAt > existing.submittedAt) {
      existing.submittedAt = record.submittedAt;
      existing.entry = record.entry;
    }
  });

  return [...map.values()].sort((a, b) => b.submittedAt - a.submittedAt);
};

const UserErrorModerationMonitorScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const locale = language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'uk-UA';
  const text = TEXT[language];
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [records, setRecords] = useState<ModerationErrorRecord[]>([]);

  useEffect(() => {
    const dataRef = ref(database, 'diagnostics/runtime_moderation');
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const raw = snapshot.val() as Record<string, unknown> | null;
      if (!raw) {
        setRecords([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const next = Object.entries(raw)
        .map(([id, value]) => normalizeRecord(id, value))
        .filter((item): item is ModerationErrorRecord => Boolean(item));
      setRecords(next);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      off(dataRef);
      unsubscribe();
    };
  }, []);

  const deduped = useMemo(() => dedupeErrors(records), [records]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.82}>
          <Text style={styles.back}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{text.title}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7A1E5C" />
          <Text style={styles.loading}>{text.loading}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />}
        >
          {deduped.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{text.empty}</Text>
            </View>
          ) : (
            deduped.map((item) => (
              <View key={item.fingerprint} style={styles.card}>
                <Text style={styles.shortType}>{item.entry.shortType}</Text>
                <Text style={styles.meta}>
                  {text.lastSent}: {new Date(item.submittedAt || item.entry.at).toLocaleString(locale)}
                </Text>
                <Text style={styles.meta}>
                  {text.repeats}: {item.duplicates} | {text.users}: {item.users.size}
                </Text>
                <Text style={styles.label}>{text.screen}</Text>
                <Text style={styles.value}>{item.entry.screen}</Text>
                <Text style={styles.label}>{text.reason}</Text>
                <Text style={styles.value}>{item.entry.rawMessage || '-'}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F2EE' },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  back: { color: '#6B4B6F', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  title: { color: '#2E1F35', fontSize: 22, fontWeight: '900' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: 10, color: '#524659', fontWeight: '600' },
  content: { padding: 16, gap: 10 },
  emptyCard: { borderRadius: 16, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#E2DCE8' },
  emptyText: { color: '#4A3A54', fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 16, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#E2DCE8' },
  shortType: { color: '#2D1C34', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  meta: { color: '#6A5C74', fontSize: 13, marginBottom: 2 },
  label: { color: '#705B75', fontSize: 12, fontWeight: '800', marginTop: 6 },
  value: { color: '#2F2535', fontSize: 13, lineHeight: 19 },
});

export default UserErrorModerationMonitorScreen;

