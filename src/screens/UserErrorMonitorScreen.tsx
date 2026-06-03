import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { push, ref } from 'firebase/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { database } from '../firebase-core';
import { auth } from '../firebase-config';
import { getLocalErrors } from '../utils/errorLogger';
import {
  subscribeRuntimeMonitor,
  type RuntimeMonitorEntry,
  type RuntimeMonitorStatus,
} from '../services/runtimeMonitorService';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import MiniTabBar from '../components/MiniTabBar';

type Lang = 'ua' | 'ru' | 'en';
type AppNav = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
type LocalErrorEntry = ReturnType<typeof getLocalErrors>[number];
type ErrorLevel = 'minor' | 'medium' | 'major' | 'critical';

const ERROR_LEVEL_META: Record<ErrorLevel, { label: string; short: string; details: string; color: string; bg: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  minor: {
    label: 'Мелкая ошибка',
    short: 'Чаще всего это временный сбой связи или загрузки.',
    details: 'Обычно приложение продолжает работать. Если ошибка не повторяется, срочно ничего делать не нужно.',
    color: '#4F7D57',
    bg: 'rgba(79,125,87,0.12)',
    icon: 'wifi-alert',
  },
  medium: {
    label: 'Средняя ошибка',
    short: 'Одна функция могла не выполниться с первого раза.',
    details: 'Стоит повторить действие. Если карточка появляется часто, лучше отправить отчет администратору.',
    color: '#9A6A16',
    bg: 'rgba(154,106,22,0.13)',
    icon: 'alert-circle-outline',
  },
  major: {
    label: 'Крупная ошибка',
    short: 'Важное действие могло не сохраниться или не загрузиться.',
    details: 'Проверьте интернет и повторите действие. Если не помогло, отправьте отчет администратору.',
    color: '#C05F2C',
    bg: 'rgba(192,95,44,0.14)',
    icon: 'alert-outline',
  },
  critical: {
    label: 'Критическая ошибка',
    short: 'Может мешать работе экрана или всего приложения.',
    details: 'Лучше сразу отправить отчет администратору и указать, что вы делали перед ошибкой.',
    color: '#C0392B',
    bg: 'rgba(192,57,43,0.13)',
    icon: 'alert-octagon-outline',
  },
};

const classifyErrorLevel = (entry: LocalErrorEntry): ErrorLevel => {
  const haystack = `${entry.functionName || ''} ${entry.source || ''} ${entry.message || ''}`.toLowerCase();

  if (/fatal|crash|errorboundary|error boundary|unhandled|security violation|blocked device|device_blocked|corrupt|corrupted/.test(haystack)) {
    return 'critical';
  }
  if (/permission-denied|permission denied|unauthorized|forbidden|auth\/|database|firebase|storage|upload|failed to save|failed to send|failed to remove|failed to delete|transaction/.test(haystack)) {
    return 'major';
  }
  if (/network|offline|timeout|timed out|connection|unavailable|socket|cancelled|canceled|fetch|internet/.test(haystack)) {
    return 'minor';
  }
  if (/cache|image|photo|render|parse|validation|failed|exception|warning/.test(haystack)) {
    return 'medium';
  }

  return 'medium';
};

const COPY = {
  ua: {
    title: 'Монітор помилок',
    subtitle: 'Локальні помилки вашого пристрою за цю сесію',
    noErrors: 'Помилок не виявлено',
    noErrorsSub: 'Застосунок працює нормально.',
    sendReport: 'Надіслати звіт адміністратору',
    reportSent: 'Звіт надіслано',
    reportSentMsg: 'Адміністратор отримає ваш звіт і розгляне помилки.',
    reportFailed: 'Не вдалося надіслати звіт',
    signInRequired: 'Щоб надіслати звіт, увійдіть у профіль.',
    back: 'Назад',
    screen: 'Екран',
    message: 'Повідомлення',
    time: 'Час',
    share: 'Поділитися',
    total: (n: number) => `${n} помилок за сесію`,
  },
  ru: {
    title: 'Монитор ошибок',
    subtitle: 'Локальные ошибки вашего устройства за эту сессию',
    noErrors: 'Ошибок не обнаружено',
    noErrorsSub: 'Приложение работает нормально.',
    sendReport: 'Отправить отчёт администратору',
    reportSent: 'Отчёт отправлен',
    reportSentMsg: 'Администратор получит ваш отчёт и рассмотрит ошибки.',
    reportFailed: 'Не удалось отправить отчёт',
    signInRequired: 'Чтобы отправить отчёт, войдите в профиль.',
    back: 'Назад',
    screen: 'Экран',
    message: 'Сообщение',
    time: 'Время',
    share: 'Поделиться',
    total: (n: number) => `${n} ошибок за сессию`,
  },
  en: {
    title: 'Error Monitor',
    subtitle: 'Local device errors for this session',
    noErrors: 'No errors detected',
    noErrorsSub: 'App is running normally.',
    sendReport: 'Send report to admin',
    reportSent: 'Report sent',
    reportSentMsg: 'Admin will review your error report.',
    reportFailed: 'Failed to send report',
    signInRequired: 'Please sign in to send the report.',
    back: 'Back',
    screen: 'Screen',
    message: 'Message',
    time: 'Time',
    share: 'Share',
    total: (n: number) => `${n} errors this session`,
  },
} as const;

// --- Sensitive traces section helpers ---

type OperationGroup = {
  operationId: string;
  screen: string;
  steps: RuntimeMonitorEntry[];
  startedAt: number;
  hasFail: boolean;
};

const STATUS_COLOR: Record<RuntimeMonitorStatus, string> = {
  start: '#5A7F6B',
  progress: '#4A90D9',
  success: '#4CAF50',
  fail: '#C0392B',
  cancel: '#9A6A16',
  timeout: '#C05F2C',
};

const STATUS_ICON: Record<RuntimeMonitorStatus, keyof typeof MaterialCommunityIcons.glyphMap> = {
  start: 'play-circle-outline',
  progress: 'loading',
  success: 'check-circle-outline',
  fail: 'close-circle-outline',
  cancel: 'cancel',
  timeout: 'clock-alert-outline',
};

const groupTracesByOperation = (allEntries: RuntimeMonitorEntry[]): OperationGroup[] => {
  const traces = allEntries.filter((e) => e.source === 'trace' && e.operationId);
  const map = new Map<string, RuntimeMonitorEntry[]>();
  for (const entry of traces) {
    const key = entry.operationId!;
    const list = map.get(key);
    if (list) {
      list.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  const groups: OperationGroup[] = [];
  map.forEach((steps, operationId) => {
    steps.sort((a, b) => a.at - b.at);
    groups.push({
      operationId,
      screen: steps[0].screen,
      steps,
      startedAt: steps[0].at,
      hasFail: steps.some((s) => s.status === 'fail' || s.status === 'timeout'),
    });
  });
  groups.sort((a, b) => b.startedAt - a.startedAt);
  return groups;
};

const UserErrorMonitorScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ru') as Lang;
  const user = useSelector((state: RootState) => state.auth.user);
  const text = COPY[language];
  const [sending, setSending] = useState(false);
  const [traceEntries, setTraceEntries] = useState<RuntimeMonitorEntry[]>([]);

  useEffect(() => {
    return subscribeRuntimeMonitor(setTraceEntries);
  }, []);

  const operationGroups = groupTracesByOperation(traceEntries);

  const errors = getLocalErrors();

  const sanitizeReportErrors = useCallback(() => {
    return errors.slice(-50).map((entry) => ({
      functionName: String(entry.functionName || 'unknown'),
      at: typeof entry.at === 'number' ? entry.at : Date.now(),
      message: String(entry.message || 'Unknown error'),
      source: typeof entry.source === 'string' ? entry.source : 'client',
    }));
  }, [errors]);

  const handleSendReport = useCallback(async () => {
    if (!auth.currentUser?.uid && !user?.id) {
      Alert.alert(text.reportFailed, text.signInRequired);
      return;
    }

    setSending(true);
    try {
      const normalizedErrors = sanitizeReportErrors();
      await push(ref(database, 'diagnostics/user_reports'), {
        uid: auth.currentUser?.uid ?? user?.id ?? 'anonymous',
        userName: user?.name ?? auth.currentUser?.email ?? 'unknown',
        submittedAt: Date.now(),
        errors: normalizedErrors,
        errorCount: normalizedErrors.length,
      });
      Alert.alert(text.reportSent, text.reportSentMsg);
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      Alert.alert(text.reportFailed, details || undefined);
    } finally {
      setSending(false);
    }
  }, [sanitizeReportErrors, text, user]);

  const handleShare = useCallback(async () => {
    const lines = errors.map((e, i) =>
      `#${i + 1} [${new Date(e.at).toLocaleTimeString()}] ${e.functionName}: ${e.message}`,
    );
    await Share.share({ message: lines.join('\n') || text.noErrors });
  }, [errors, text.noErrors]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.main}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.82}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
              <Text style={styles.backText}>{text.back}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
            <View style={styles.noticeBox}>
              <MaterialCommunityIcons name="information-outline" size={18} color={SCREEN_THEME.woodGreenDark} />
              <Text style={styles.noticeText}>
                Не все ошибки критические: иногда приложение просто потеряло связь или не успело загрузить данные. Ниже каждая ошибка помечена уровнем важности.
              </Text>
            </View>
            <View style={styles.legendRow}>
              {(Object.keys(ERROR_LEVEL_META) as ErrorLevel[]).map((level) => {
                const meta = ERROR_LEVEL_META[level];
                return (
                  <View key={level} style={[styles.legendChip, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                    <Text style={[styles.legendText, { color: meta.color }]}>{meta.label.replace(' ошибка', '')}</Text>
                  </View>
                );
              })}
            </View>
            {errors.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{text.total(errors.length)}</Text>
              </View>
            ) : null}
          </View>

          {errors.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="check-circle-outline" size={44} color="#4CAF50" />
              <Text style={styles.emptyTitle}>{text.noErrors}</Text>
              <Text style={styles.emptySubtitle}>{text.noErrorsSub}</Text>
            </View>
          ) : (
            errors.slice().reverse().map((entry, index) => {
              const level = classifyErrorLevel(entry);
              const meta = ERROR_LEVEL_META[level];
              return (
                <View key={`${entry.at}-${index}`} style={[styles.errorCard, { borderColor: meta.bg, borderLeftColor: meta.color }]}>
                  <View style={styles.levelRow}>
                    <View style={[styles.levelBadge, { backgroundColor: meta.bg }]}>
                      <MaterialCommunityIcons name={meta.icon} size={14} color={meta.color} />
                      <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.errorScreen, { color: meta.color }]}>{text.screen}: {entry.functionName}</Text>
                  <Text style={styles.errorMessage}>{text.message}: {entry.message}</Text>
                  <Text style={styles.errorTime}>{text.time}: {new Date(entry.at).toLocaleTimeString()}</Text>
                  <View style={[styles.explainBox, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.explainTitle, { color: meta.color }]}>{meta.short}</Text>
                    <Text style={styles.explainText}>{meta.details}</Text>
                  </View>
                </View>
              );
            })
          )}

          {/* --- Section 2: Чувствительный (Operation Traces) --- */}
          <View style={styles.sensitiveHeader}>
            <MaterialCommunityIcons name="timeline-clock-outline" size={20} color={SCREEN_THEME.terracottaDark} />
            <Text style={styles.sensitiveTitle}>Чувствительный</Text>
          </View>
          <Text style={styles.sensitiveSubtitle}>
            Пошаговая трассировка критических действий: отправка заявок, загрузка фото, публикация объявлений.
          </Text>

          {operationGroups.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="timeline-check-outline" size={36} color="#4CAF50" />
              <Text style={styles.emptyTitle}>Операций не записано</Text>
              <Text style={styles.emptySubtitle}>Данные появятся после отправки заявки или загрузки фото.</Text>
            </View>
          ) : (
            operationGroups.slice(0, 20).map((group) => (
              <View
                key={group.operationId}
                style={[
                  styles.opCard,
                  group.hasFail && styles.opCardFail,
                ]}
              >
                <View style={styles.opHeaderRow}>
                  <MaterialCommunityIcons
                    name={group.hasFail ? 'alert-circle' : 'check-circle'}
                    size={16}
                    color={group.hasFail ? '#C0392B' : '#4CAF50'}
                  />
                  <Text style={styles.opScreen}>{group.screen}</Text>
                  <Text style={styles.opTime}>
                    {new Date(group.startedAt).toLocaleTimeString()}
                  </Text>
                </View>

                {group.steps.map((step, idx) => {
                  const stepStatus = step.status ?? 'progress';
                  const color = STATUS_COLOR[stepStatus] ?? '#888';
                  const icon = STATUS_ICON[stepStatus] ?? 'circle-outline';
                  const isLast = idx === group.steps.length - 1;
                  return (
                    <View key={step.id} style={styles.stepRow}>
                      <View style={styles.stepTimeline}>
                        <MaterialCommunityIcons name={icon} size={14} color={color} />
                        {!isLast && <View style={[styles.stepLine, { backgroundColor: color }]} />}
                      </View>
                      <View style={styles.stepContent}>
                        <View style={styles.stepTopRow}>
                          <Text style={[styles.stepAction, { color }]}>{step.action ?? '—'}</Text>
                          <Text style={styles.stepStatusBadge}>
                            {stepStatus}
                            {step.durationMs != null ? ` (${Math.round(step.durationMs / 1000)}s)` : ''}
                          </Text>
                        </View>
                        {step.rawMessage && step.rawMessage !== `${step.action}:${stepStatus}` ? (
                          <Text style={styles.stepMessage} numberOfLines={2}>{step.rawMessage}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}

                <Text style={styles.opId}>ID: {group.operationId}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          {errors.length > 0 ? (
            <TouchableOpacity style={styles.shareBtn} onPress={() => void handleShare()} activeOpacity={0.82}>
              <MaterialCommunityIcons name="share-variant-outline" size={16} color="#fff" style={styles.btnIcon} />
              <Text style={styles.shareBtnText}>{text.share}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={() => void handleSendReport()}
            activeOpacity={0.82}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>{text.sendReport}</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  main: { flex: 1 },
  content: { padding: 16, paddingTop: 24, paddingBottom: 20 },
  header: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
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
  title: { fontSize: 24, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  subtitle: { color: SCREEN_THEME.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    backgroundColor: 'rgba(90,127,107,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(90,127,107,0.22)',
    borderRadius: 14,
    padding: 10,
  },
  noticeText: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  legendChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  legendText: { fontSize: 10, fontWeight: '900' },
  countBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(199,122,93,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  countBadgeText: { color: SCREEN_THEME.terracottaDark, fontWeight: '800', fontSize: 12 },
  emptyCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  emptySubtitle: { color: SCREEN_THEME.textSecondary, fontSize: 13, textAlign: 'center' },
  errorCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0CCCC',
    borderLeftWidth: 3,
    borderLeftColor: '#E57373',
    gap: 3,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '900' },
  errorScreen: { fontSize: 12, fontWeight: '800', color: '#C0392B' },
  errorMessage: { fontSize: 12, color: SCREEN_THEME.textPrimary, lineHeight: 17 },
  errorTime: { fontSize: 11, color: SCREEN_THEME.textMuted, fontWeight: '600' },
  explainBox: {
    borderRadius: 12,
    padding: 9,
    marginTop: 6,
    gap: 2,
  },
  explainTitle: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  explainText: { fontSize: 11, lineHeight: 16, color: SCREEN_THEME.textSecondary, fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 16,
    paddingVertical: 13,
  },
  btnIcon: {},
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.55 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  // --- Sensitive section styles ---
  sensitiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 4,
  },
  sensitiveTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.terracottaDark,
  },
  sensitiveSubtitle: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  opCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
    gap: 2,
  },
  opCardFail: {
    borderLeftColor: '#C0392B',
    borderColor: 'rgba(192,57,43,0.18)',
  },
  opHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  opScreen: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
  },
  opTime: {
    fontSize: 11,
    fontWeight: '600',
    color: SCREEN_THEME.textMuted,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 28,
  },
  stepTimeline: {
    width: 22,
    alignItems: 'center',
  },
  stepLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    borderRadius: 1,
  },
  stepContent: {
    flex: 1,
    paddingLeft: 6,
    paddingBottom: 6,
  },
  stepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepAction: {
    fontSize: 12,
    fontWeight: '800',
  },
  stepStatusBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: SCREEN_THEME.textMuted,
  },
  stepMessage: {
    fontSize: 11,
    color: SCREEN_THEME.textSecondary,
    lineHeight: 15,
    marginTop: 1,
  },
  opId: {
    fontSize: 9,
    color: SCREEN_THEME.textMuted,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default UserErrorMonitorScreen;
