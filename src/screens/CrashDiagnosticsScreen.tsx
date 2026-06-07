import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSelector } from 'react-redux';
import {
  getLastCrash,
  getConsoleErrors,
  clearLastCrash,
  clearConsoleErrors,
  CrashDiagnostic,
  ConsoleErrorLog,
} from '../services/crashDiagnosticsService';
import type { RootState } from '../redux/store';
import { normalizeLanguage } from '../redux/slices/languageSlice';

type Tab = 'crash' | 'console';
type Lang = 'ua' | 'ru' | 'en';

const TEXTS = {
  ua: {
    title: 'Діагностика збоїв',
    loadingText: 'Завантаження діагностики...',
    copied: 'Скопійовано',
    stackCopied: 'Стек скопійовано в буфер обміну',
    copyFailed: 'Копіювання не вдалося',
    cleared: 'Очищено',
    lastCrashCleared: 'Діагностика останнього збою очищена',
    logsCleared: 'Журнали консолі очищені',
    lastCrash: 'Останній збій',
    console: 'Консоль',
    time: 'Час',
    message: 'Повідомлення',
    errorType: 'Тип помилки',
    errorCode: 'Код помилки',
    componentStack: 'Стек компонентів',
    javaScriptStack: 'Стек JavaScript',
    copy: 'Копіювати',
    recentLogs: 'Останні журнали',
    noCrashes: 'Немає збоїв',
    noCrashesText: 'Чудово! Поки що зареєстровано жодних збоїв.',
    noLogs: 'Немає журналів',
    noLogsText: 'Помилок або попереджень консолі поки не записано.',
    copyArgs: 'Копіювати аргументи',
  },
  ru: {
    title: 'Диагностика сбоев',
    loadingText: 'Загрузка диагностики...',
    copied: 'Скопировано',
    stackCopied: 'Стек скопирован в буфер обмена',
    copyFailed: 'Копирование не удалось',
    cleared: 'Очищено',
    lastCrashCleared: 'Диагностика последнего сбоя очищена',
    logsCleared: 'Журналы консоли очищены',
    lastCrash: 'Последний сбой',
    console: 'Консоль',
    time: 'Время',
    message: 'Сообщение',
    errorType: 'Тип ошибки',
    errorCode: 'Код ошибки',
    componentStack: 'Стек компонентов',
    javaScriptStack: 'Стек JavaScript',
    copy: 'Копировать',
    recentLogs: 'Последние журналы',
    noCrashes: 'Нет сбоев',
    noCrashesText: 'Отлично! Пока не зарегистрировано никаких сбоев.',
    noLogs: 'Нет журналов',
    noLogsText: 'Ошибки или предупреждения консоли еще не записаны.',
    copyArgs: 'Копировать аргументы',
  },
  en: {
    title: 'Crash Diagnostics',
    loadingText: 'Loading diagnostics...',
    copied: 'Copied',
    stackCopied: 'Stack trace copied to clipboard',
    copyFailed: 'Copy failed',
    cleared: 'Cleared',
    lastCrashCleared: 'Last crash diagnostic cleared',
    logsCleared: 'Console logs cleared',
    lastCrash: 'Last Crash',
    console: 'Console',
    time: 'Time',
    message: 'Message',
    errorType: 'Error Type',
    errorCode: 'Error Code',
    componentStack: 'Component Stack',
    javaScriptStack: 'JavaScript Stack',
    copy: 'Copy',
    recentLogs: 'Recent Logs',
    noCrashes: 'No Crashes',
    noCrashesText: 'Great! No crashes have been recorded yet.',
    noLogs: 'No Logs',
    noLogsText: 'No console errors or warnings recorded yet.',
    copyArgs: 'Copy args',
  },
} as const;

export default function CrashDiagnosticsScreen() {
  const language = useSelector((state: RootState) => state.language.current);
  const text = TEXTS[normalizeLanguage(language) as Lang] ?? TEXTS.ua;
  const [activeTab, setActiveTab] = useState<Tab>('crash');
  const [lastCrash, setLastCrash] = useState<CrashDiagnostic | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleErrorLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const [crash, logs] = await Promise.all([
        getLastCrash(),
        getConsoleErrors(),
      ]);
      setLastCrash(crash);
      setConsoleLogs(logs);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyStack = async (text: string) => {
    try {
      await Clipboard.setString(text);
      Toast.show({
        type: 'success',
        text1: text.copied,
        text2: text.stackCopied,
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: text.copyFailed,
      });
    }
  };

  const handleClearLastCrash = async () => {
    await clearLastCrash();
    setLastCrash(null);
    Toast.show({
      type: 'success',
      text1: text.cleared,
      text2: text.lastCrashCleared,
    });
  };

  const handleClearConsoleLogs = async () => {
    await clearConsoleErrors();
    setConsoleLogs([]);
    Toast.show({
      type: 'success',
      text1: text.cleared,
      text2: text.logsCleared,
    });
  };

  const formatTime = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleString('uk-UA');
    } catch {
      return new Date().toLocaleString('uk-UA');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#7A1E5C" />
          <Text style={styles.loadingText}>{text.loadingText}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="bug-check-outline"
          size={28}
          color="#7A1E5C"
        />
        <Text style={styles.headerTitle}>{text.title}</Text>
        <TouchableOpacity onPress={loadDiagnostics} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={20} color="#7A1E5C" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'crash' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('crash')}
        >
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={18}
            color={activeTab === 'crash' ? '#7A1E5C' : '#9CA3AF'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'crash' && styles.activeTabLabel,
            ]}
          >
            {text.lastCrash}
          </Text>
          {lastCrash && <View style={styles.badge} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'console' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('console')}
        >
          <MaterialCommunityIcons
            name="console-line"
            size={18}
            color={activeTab === 'console' ? '#7A1E5C' : '#9CA3AF'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'console' && styles.activeTabLabel,
            ]}
          >
            {text.console} ({consoleLogs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'crash' ? (
          // Last Crash Tab
          lastCrash ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{text.lastCrash}</Text>
                <TouchableOpacity
                  onPress={handleClearLastCrash}
                  style={styles.deleteBtn}
                >
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={18}
                    color="#DC2626"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.label}>{text.time}</Text>
                <Text style={styles.value}>
                  {formatTime(lastCrash.timestamp)}
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.label}>{text.message}</Text>
                <Text style={styles.value}>{lastCrash.message}</Text>
              </View>

              {lastCrash.errorType && (
                <View style={styles.infoBox}>
                  <Text style={styles.label}>{text.errorType}</Text>
                  <Text style={styles.value}>{lastCrash.errorType}</Text>
                </View>
              )}

              {lastCrash.errorCode && (
                <View style={styles.infoBox}>
                  <Text style={styles.label}>{text.errorCode}</Text>
                  <Text style={styles.value}>{lastCrash.errorCode}</Text>
                </View>
              )}

              {lastCrash.componentStack && (
                <View style={styles.stackSection}>
                  <View style={styles.stackHeader}>
                    <Text style={styles.label}>{text.componentStack}</Text>
                    <TouchableOpacity
                      onPress={() =>
                        handleCopyStack(lastCrash.componentStack || '')
                      }
                      style={styles.copyBtn}
                    >
                      <MaterialCommunityIcons
                        name="content-copy"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.copyBtnText}>{text.copy}</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    style={styles.stackContent}
                    nestedScrollEnabled={true}
                  >
                    <Text style={styles.stackText}>
                      {lastCrash.componentStack}
                    </Text>
                  </ScrollView>
                </View>
              )}

              {lastCrash.stack && (
                <View style={styles.stackSection}>
                  <View style={styles.stackHeader}>
                    <Text style={styles.label}>{text.javaScriptStack}</Text>
                    <TouchableOpacity
                      onPress={() => handleCopyStack(lastCrash.stack || '')}
                      style={styles.copyBtn}
                    >
                      <MaterialCommunityIcons
                        name="content-copy"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.copyBtnText}>{text.copy}</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.stackContent}
                    nestedScrollEnabled={true}
                  >
                    <Text style={styles.stackText}>{lastCrash.stack}</Text>
                  </ScrollView>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={48}
                color="#10B981"
              />
              <Text style={styles.emptyStateTitle}>{text.noCrashes}</Text>
              <Text style={styles.emptyStateText}>
                {text.noCrashesText}
              </Text>
            </View>
          )
        ) : (
          // Console Tab
          consoleLogs.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {text.recentLogs} ({consoleLogs.length})
                </Text>
                <TouchableOpacity
                  onPress={handleClearConsoleLogs}
                  style={styles.deleteBtn}
                >
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={18}
                    color="#DC2626"
                  />
                </TouchableOpacity>
              </View>

              {consoleLogs
                .slice()
                .reverse()
                .map((log, idx) => (
                  <View key={idx} style={styles.logEntry}>
                    <View style={styles.logHeader}>
                      <View style={styles.logBadge}>
                        <MaterialCommunityIcons
                          name={
                            log.level === 'error'
                              ? 'alert-circle'
                              : log.level === 'warn'
                              ? 'alert'
                              : 'information'
                          }
                          size={14}
                          color={
                            log.level === 'error'
                              ? '#DC2626'
                              : log.level === 'warn'
                              ? '#F59E0B'
                              : '#3B82F6'
                          }
                        />
                        <Text
                          style={[
                            styles.logLevel,
                            {
                              color:
                                log.level === 'error'
                                  ? '#DC2626'
                                  : log.level === 'warn'
                                  ? '#F59E0B'
                                  : '#3B82F6',
                            },
                          ]}
                        >
                          {log.level.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.logTime}>
                        {new Date(log.timestamp).toLocaleTimeString('uk-UA')}
                      </Text>
                    </View>
                    <Text style={styles.logMessage}>{log.message}</Text>
                    {log.args && log.args.length > 0 && (
                      <TouchableOpacity
                        onPress={() =>
                          handleCopyStack(JSON.stringify(log.args, null, 2))
                        }
                        style={styles.logCopyBtn}
                      >
                        <MaterialCommunityIcons
                          name="content-copy"
                          size={14}
                          color="#7A1E5C"
                        />
                        <Text style={styles.logCopyText}>{text.copyArgs}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="console-line"
                size={48}
                color="#9CA3AF"
              />
              <Text style={styles.emptyStateTitle}>{text.noLogs}</Text>
              <Text style={styles.emptyStateText}>
                {text.noLogsText}
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2937',
  },
  refreshBtn: {
    padding: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#7A1E5C',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  activeTabLabel: {
    color: '#7A1E5C',
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    marginLeft: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  deleteBtn: {
    padding: 8,
  },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#7A1E5C',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#1F2937',
    fontFamily: 'monospace',
  },
  stackSection: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  stackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7A1E5C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stackContent: {
    maxHeight: 200,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stackText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
  },
  logEntry: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#9CA3AF',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logLevel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  logTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  logMessage: {
    fontSize: 13,
    color: '#1F2937',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  logCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  logCopyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A1E5C',
  },
});
