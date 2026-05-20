import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { onValue, ref } from 'firebase/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { database } from '../firebase-core';
import { SCREEN_THEME } from '../utils/screenTheme';

type AppNav = NavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    back: 'Назад',
    title: 'Помилки користувачів',
    reports: (n: number) => `${n} звітів`,
    loading: 'Завантаження...',
    noReports: 'Звітів поки немає',
    errorsInReport: 'Помилок у звіті',
    copy: 'Копіювати',
    moreErrors: (n: number) => `+ ще ${n} помилок`,
    shareUser: 'Користувач',
    shareTime: 'Час',
    shareErrors: 'Помилок',
    exportErrorTitle: 'Помилка експорту',
    exportErrorMsg: 'Не вдалося відкрити вікно експорту. Спробуйте ще раз.',
  },
  ru: {
    back: 'Назад',
    title: 'Ошибки пользователей',
    reports: (n: number) => `${n} отчётов`,
    loading: 'Загрузка...',
    noReports: 'Отчётов пока нет',
    errorsInReport: 'Ошибок в отчёте',
    copy: 'Копировать',
    moreErrors: (n: number) => `+ ещё ${n} ошибок`,
    shareUser: 'Пользователь',
    shareTime: 'Время',
    shareErrors: 'Ошибок',
    exportErrorTitle: 'Ошибка экспорта',
    exportErrorMsg: 'Не удалось открыть системное окно экспорта. Попробуйте снова.',
  },
  en: {
    back: 'Back',
    title: 'User errors',
    reports: (n: number) => `${n} reports`,
    loading: 'Loading...',
    noReports: 'No reports yet',
    errorsInReport: 'Errors in report',
    copy: 'Copy',
    moreErrors: (n: number) => `+ ${n} more errors`,
    shareUser: 'User',
    shareTime: 'Time',
    shareErrors: 'Errors',
    exportErrorTitle: 'Export error',
    exportErrorMsg: 'Failed to open export window. Please try again.',
  },
} as const;

type ErrorEntry = {
  functionName: string;
  at: number;
  message: string;
  source?: string;
};

type UserErrorReport = {
  id: string;
  uid: string;
  userName: string;
  submittedAt: number;
  errorCount: number;
  errors?: ErrorEntry[];
};

const AdminUserErrorsScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [reports, setReports] = useState<UserErrorReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onValue(
      ref(database, 'diagnostics/user_reports'),
      (snap) => {
        if (!snap.exists()) {
          setReports([]);
          setLoading(false);
          return;
        }
        const raw = snap.val() as Record<string, Omit<UserErrorReport, 'id'>>;
        const next = Object.entries(raw)
          .map(([id, val]) => ({ ...val, id }))
          .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
        setReports(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsubscribe();
  }, []);

  const handleShare = async (report: UserErrorReport) => {
    const lines = [
      `${text.shareUser}: ${report.userName}`,
      `UID: ${report.uid}`,
      `${text.shareTime}: ${new Date(report.submittedAt).toLocaleString()}`,
      `${text.shareErrors}: ${report.errorCount}`,
      '',
      ...(report.errors ?? []).map((e, i) =>
        `#${i + 1} [${new Date(e.at).toLocaleTimeString()}] ${e.functionName}: ${e.message}`,
      ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  const handleExportForAI = async () => {
    const grouped = new Map<string, { count: number; functionName: string; message: string }>();
    for (const report of reports) {
      for (const error of report.errors ?? []) {
        const key = `${error.functionName}::${error.message}`;
        const prev = grouped.get(key);
        if (prev) prev.count += 1;
        else grouped.set(key, { count: 1, functionName: error.functionName, message: error.message });
      }
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'diagnostics/user_reports',
      totals: {
        reports: reports.length,
        errors: reports.reduce((sum, r) => sum + (r.errors?.length ?? r.errorCount ?? 0), 0),
      },
      topErrors: Array.from(grouped.values()).sort((a, b) => b.count - a.count).slice(0, 20),
      reports: reports.map((report) => ({
        id: report.id,
        uid: report.uid,
        userName: report.userName,
        submittedAt: report.submittedAt,
        errorCount: report.errorCount ?? report.errors?.length ?? 0,
        errors: (report.errors ?? []).map((e) => ({
          functionName: e.functionName,
          message: e.message,
          at: e.at,
          source: e.source,
        })),
      })),
    };
    try {
      await Share.share({ message: JSON.stringify(payload, null, 2) });
    } catch (error) {
      Alert.alert(text.exportErrorTitle, text.exportErrorMsg);
      console.warn('AdminUserErrorsScreen.handleExportForAI failed:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.82}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.backText}>{text.back}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.reports(reports.length)}</Text>
          <TouchableOpacity style={styles.exportBtn} onPress={() => void handleExportForAI()} activeOpacity={0.82}>
            <MaterialCommunityIcons name="database-export-outline" size={14} color="#fff" />
            <Text style={styles.exportBtnText}>Export AI JSON</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} />
            <Text style={styles.stateText}>{text.loading}</Text>
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={36} color="#4CAF50" />
            <Text style={styles.stateText}>{text.noReports}</Text>
          </View>
        ) : (
          reports.map((report) => (
            <View key={report.id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.reportMeta}>
                  <Text style={styles.userName}>{report.userName || '—'}</Text>
                  <Text style={styles.reportTime}>{new Date(report.submittedAt).toLocaleString()}</Text>
                  <Text style={styles.errorCount}>{text.errorsInReport}: {report.errorCount ?? 0}</Text>
                  <Text style={styles.uid}>UID: {String(report.uid ?? '').slice(0, 20)}…</Text>
                </View>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => void handleShare(report)}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="content-copy" size={14} color="#fff" />
                  <Text style={styles.copyBtnText}>{text.copy}</Text>
                </TouchableOpacity>
              </View>

              {(report.errors ?? []).slice(0, 5).map((e, i) => (
                <View key={`${report.id}-${i}`} style={styles.errorRow}>
                  <Text style={styles.errorScreen}>{e.functionName}</Text>
                  <Text style={styles.errorMsg} numberOfLines={2}>{e.message}</Text>
                  <Text style={styles.errorTime}>{new Date(e.at).toLocaleTimeString()}</Text>
                </View>
              ))}

              {(report.errors?.length ?? 0) > 5 ? (
                <Text style={styles.moreErrors}>
                  {text.moreErrors((report.errors?.length ?? 0) - 5)}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 14, paddingTop: 24, paddingBottom: 40, gap: 12 },
  header: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    gap: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  subtitle: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '600' },
  exportBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stateCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  stateText: { color: SCREEN_THEME.textSecondary, fontSize: 14, fontWeight: '700' },
  reportCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 8,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  reportMeta: { flex: 1, gap: 3 },
  userName: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  reportTime: { fontSize: 11, color: SCREEN_THEME.textMuted, fontWeight: '600' },
  errorCount: { fontSize: 12, fontWeight: '700', color: SCREEN_THEME.terracottaDark },
  uid: { fontSize: 10, color: SCREEN_THEME.textMuted },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  copyBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  errorRow: {
    backgroundColor: '#FFF5F5',
    borderRadius: 10,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#E57373',
    gap: 2,
  },
  errorScreen: { fontSize: 11, fontWeight: '800', color: '#C0392B' },
  errorMsg: { fontSize: 11, color: SCREEN_THEME.textPrimary, lineHeight: 15 },
  errorTime: { fontSize: 10, color: SCREEN_THEME.textMuted },
  moreErrors: {
    fontSize: 11,
    color: SCREEN_THEME.textMuted,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 4,
  },
});

export default AdminUserErrorsScreen;
