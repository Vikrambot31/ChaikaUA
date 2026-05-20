import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import {
  clearRuntimeMonitorEntries,
  formatRuntimeMonitorEntries,
  getRuntimeMonitorEntries,
  initRuntimeMonitor,
  subscribeRuntimeMonitor,
  type RuntimeMonitorEntry,
} from '../services/runtimeMonitorService';

type AppNav = NavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    back: 'Назад',
    title: 'Монітор помилок',
    subtitle: 'Простий runtime лог для модератора. Нові помилки зʼявляються одразу.',
    refresh: 'Оновити',
    clearLogs: 'Очистити логи',
    copyLog: 'Скопіювати лог',
    loading: 'Завантажуємо локальний runtime лог...',
    noErrors: 'Помилок поки немає',
    noErrorsBody: 'Коли в застосунку виникне помилка завантаження, відправки форми, доступу до Firebase, upload або runtime збій — запис зʼявиться тут.',
    clearTitle: 'Очистити лог?',
    clearMsg: 'Всі збережені runtime помилки будуть видалені з цього пристрою.',
    cancel: 'Скасувати',
    clearBtn: 'Очистити',
    logEmpty: 'Лог порожній',
    logEmptyMsg: 'Поки немає помилок для копіювання.',
    summaryFmt: (total: number, photo: number, crit: number, warn: number) =>
      `Всього записів: ${total} | Фото: ${photo} | Критично: ${crit} | Попередження: ${warn}`,
    preparing: 'Підготовуємо лог...',
    clearing: 'Очищаємо лог...',
    repeats: 'Повторів',
    labelScreen: 'Екран',
    labelCause: 'Технічна причина',
    labelFirebase: 'Firebase шлях',
    labelStage: 'Етап',
    labelFeature: 'Функція',
    labelAction: 'Дія',
    labelStatus: 'Статус',
    labelCode: 'Код',
    labelSource: 'Джерело',
    labelDetails: 'Деталі',
    labelStack: 'Стек',
    labelLastRepeat: 'Останній повтор',
    noData: 'Немає даних',
    severity: { info: 'Інфо', warning: 'Попередження', critical: 'Критично' },
  },
  ru: {
    back: 'Назад',
    title: 'Монитор ошибок',
    subtitle: 'Простой runtime лог для модератора. Новые ошибки появляются сразу.',
    refresh: 'Обновить',
    clearLogs: 'Очистить логи',
    copyLog: 'Копировать лог',
    loading: 'Загружаем локальный runtime лог...',
    noErrors: 'Ошибок пока нет',
    noErrorsBody: 'Когда в приложении произойдёт ошибка загрузки, отправки формы, доступа к Firebase, upload или runtime сбой, запись появится здесь.',
    clearTitle: 'Очистить лог?',
    clearMsg: 'Все сохранённые runtime ошибки будут удалены с этого устройства.',
    cancel: 'Отмена',
    clearBtn: 'Очистить',
    logEmpty: 'Лог пуст',
    logEmptyMsg: 'Пока нет ошибок для копирования.',
    summaryFmt: (total: number, photo: number, crit: number, warn: number) =>
      `Всего записей: ${total} | Фото: ${photo} | Критично: ${crit} | Предупреждений: ${warn}`,
    preparing: 'Подготавливаем лог...',
    clearing: 'Очищаем лог...',
    repeats: 'Повторов',
    labelScreen: 'Экран',
    labelCause: 'Техническая причина',
    labelFirebase: 'Firebase путь',
    labelStage: 'Этап',
    labelFeature: 'Функция',
    labelAction: 'Действие',
    labelStatus: 'Статус',
    labelCode: 'Код',
    labelSource: 'Источник',
    labelDetails: 'Детали',
    labelStack: 'Стек',
    labelLastRepeat: 'Последний повтор',
    noData: 'Нет данных',
    severity: { info: 'Инфо', warning: 'Предупреждение', critical: 'Критично' },
  },
  en: {
    back: 'Back',
    title: 'Error Monitor',
    subtitle: 'Simple runtime log for moderators. New errors appear immediately.',
    refresh: 'Refresh',
    clearLogs: 'Clear logs',
    copyLog: 'Copy log',
    loading: 'Loading local runtime log...',
    noErrors: 'No errors yet',
    noErrorsBody: 'When a load error, form submit failure, Firebase access issue, upload error or runtime crash occurs, it will appear here.',
    clearTitle: 'Clear log?',
    clearMsg: 'All saved runtime errors will be removed from this device.',
    cancel: 'Cancel',
    clearBtn: 'Clear',
    logEmpty: 'Log is empty',
    logEmptyMsg: 'No errors to copy yet.',
    summaryFmt: (total: number, photo: number, crit: number, warn: number) =>
      `Total: ${total} | Photo: ${photo} | Critical: ${crit} | Warnings: ${warn}`,
    preparing: 'Preparing log...',
    clearing: 'Clearing log...',
    repeats: 'Repeats',
    labelScreen: 'Screen',
    labelCause: 'Technical cause',
    labelFirebase: 'Firebase path',
    labelStage: 'Stage',
    labelFeature: 'Feature',
    labelAction: 'Action',
    labelStatus: 'Status',
    labelCode: 'Code',
    labelSource: 'Source',
    labelDetails: 'Details',
    labelStack: 'Stack',
    labelLastRepeat: 'Last repeat',
    noData: 'No data',
    severity: { info: 'Info', warning: 'Warning', critical: 'Critical' },
  },
} as const;

const severityColor: Record<RuntimeMonitorEntry['severity'], string> = {
  info: '#355C7D',
  warning: '#9A6B16',
  critical: '#A53A3A',
};

const shareLogText = async (text: string): Promise<void> => {
  await Share.share({
    message: text,
    title: 'Runtime monitor log',
  });
};

const AdminRuntimeMonitorScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [entries, setEntries] = useState<RuntimeMonitorEntry[]>(getRuntimeMonitorEntries());
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'refresh' | 'clear' | 'copy' | null>(null);
  const visibleEntries = useMemo(
    () => entries.filter((item) => item.severity === 'critical' || item.severity === 'warning' || item.feature === 'photo_render'),
    [entries],
  );

  useEffect(() => {
    let active = true;

    void initRuntimeMonitor()
      .then(() => {
        if (active) {
          setEntries(getRuntimeMonitorEntries());
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const unsubscribe = subscribeRuntimeMonitor((nextEntries) => {
      if (active) {
        setEntries(nextEntries);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setBusyAction('refresh');
    try {
      await initRuntimeMonitor();
      setEntries(getRuntimeMonitorEntries());
    } finally {
      setBusyAction(null);
    }
  }, []);

  const handleClear = useCallback(() => {
    Alert.alert(
      text.clearTitle,
      text.clearMsg,
      [
        { text: text.cancel, style: 'cancel' },
        {
          text: text.clearBtn,
          style: 'destructive',
          onPress: () => {
            setBusyAction('clear');
            void clearRuntimeMonitorEntries().finally(() => setBusyAction(null));
          },
        },
      ],
    );
  }, [text]);

  const handleCopy = useCallback(async () => {
    const logText = formatRuntimeMonitorEntries(visibleEntries);
    if (!logText.trim()) {
      Alert.alert(text.logEmpty, text.logEmptyMsg);
      return;
    }

    setBusyAction('copy');
    try {
      await shareLogText(logText);
    } finally {
      setBusyAction(null);
    }
  }, [visibleEntries, text]);

  const summaryText = useMemo(() => {
    const critical = visibleEntries.filter((item) => item.severity === 'critical').length;
    const warning = visibleEntries.filter((item) => item.severity === 'warning').length;
    const photo = visibleEntries.filter((item) => item.feature === 'photo_render').length;
    return text.summaryFmt(visibleEntries.length, photo, critical, warning);
  }, [visibleEntries, text]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.82}>
          <Text style={styles.back}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.subtitle}>{text.subtitle}</Text>
        <Text style={styles.summary}>{summaryText}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => void handleRefresh()} activeOpacity={0.82}>
            <Text style={styles.actionButtonText}>{text.refresh}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleClear} activeOpacity={0.82}>
            <Text style={styles.actionButtonText}>{text.clearLogs}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => void handleCopy()} activeOpacity={0.82}>
            <Text style={styles.actionButtonText}>{text.copyLog}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7A1E5C" />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={busyAction === 'refresh'} onRefresh={() => void handleRefresh()} />}
        >
          {visibleEntries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{text.noErrors}</Text>
              <Text style={styles.emptyText}>{text.noErrorsBody}</Text>
            </View>
          ) : (
            visibleEntries.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.badge, { color: severityColor[item.severity] }]}>
                    {text.severity[item.severity]}
                  </Text>
                  <Text style={styles.time}>{new Date(item.at).toLocaleString()}</Text>
                </View>
                {(item.repeatCount ?? 1) > 1 ? (
                  <Text style={styles.repeat}>{text.repeats}: {item.repeatCount}</Text>
                ) : null}
                <Text style={styles.shortType}>{item.shortType}</Text>
                <Text style={styles.message}>{item.humanMessage}</Text>
                <Text style={styles.label}>{text.labelScreen}</Text>
                <Text style={styles.value}>{item.screen}</Text>
                <Text style={styles.label}>{text.labelCause}</Text>
                <Text style={styles.value}>{item.rawMessage || text.noData}</Text>
                {item.firebasePath ? (
                  <>
                    <Text style={styles.label}>{text.labelFirebase}</Text>
                    <Text style={styles.value}>{item.firebasePath}</Text>
                  </>
                ) : null}
                {item.stage ? (
                  <>
                    <Text style={styles.label}>{text.labelStage}</Text>
                    <Text style={styles.value}>{item.stage}</Text>
                  </>
                ) : null}
                {item.feature ? (
                  <>
                    <Text style={styles.label}>{text.labelFeature}</Text>
                    <Text style={styles.value}>{item.feature}</Text>
                  </>
                ) : null}
                {item.action ? (
                  <>
                    <Text style={styles.label}>{text.labelAction}</Text>
                    <Text style={styles.value}>{item.action}</Text>
                  </>
                ) : null}
                {item.status ? (
                  <>
                    <Text style={styles.label}>{text.labelStatus}</Text>
                    <Text style={styles.value}>{item.status}</Text>
                  </>
                ) : null}
                {item.code ? (
                  <>
                    <Text style={styles.label}>{text.labelCode}</Text>
                    <Text style={styles.value}>{item.code}</Text>
                  </>
                ) : null}
                <Text style={styles.label}>{text.labelSource}</Text>
                <Text style={styles.value}>{item.source}</Text>
                {item.details && Object.keys(item.details).length ? (
                  <>
                    <Text style={styles.label}>{text.labelDetails}</Text>
                    <Text style={styles.value}>{JSON.stringify(item.details, null, 2)}</Text>
                  </>
                ) : null}
                {item.stack ? (
                  <>
                    <Text style={styles.label}>{text.labelStack}</Text>
                    <Text style={styles.value}>{item.stack}</Text>
                  </>
                ) : null}
                {item.lastSeenAt && (item.repeatCount ?? 1) > 1 ? (
                  <>
                    <Text style={styles.label}>{text.labelLastRepeat}</Text>
                    <Text style={styles.value}>{new Date(item.lastSeenAt).toLocaleString()}</Text>
                  </>
                ) : null}
              </View>
            ))
          )}

          {busyAction === 'copy' || busyAction === 'clear' ? (
            <Text style={styles.footerInfo}>
              {busyAction === 'copy' ? text.preparing : text.clearing}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F1EC',
  },
  header: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E6DED4',
    backgroundColor: '#FFFFFF',
  },
  back: {
    color: '#7A1E5C',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1E1E1E',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#5D5249',
  },
  summary: {
    marginTop: 8,
    fontSize: 12,
    color: '#6F6258',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    backgroundColor: '#EEE7DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionButtonText: {
    color: '#3D342D',
    fontWeight: '800',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#5D5249',
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E1E1E',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#62564C',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8DFD5',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    fontSize: 12,
    fontWeight: '900',
  },
  time: {
    fontSize: 11,
    color: '#7B7067',
  },
  repeat: {
    marginTop: 6,
    fontSize: 12,
    color: '#6A5D53',
    fontWeight: '800',
  },
  shortType: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    color: '#241F1B',
  },
  message: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#574C44',
  },
  label: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '800',
    color: '#7A1E5C',
  },
  value: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 19,
    color: '#2C2723',
  },
  footerInfo: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6F6258',
    fontSize: 12,
  },
});

export default AdminRuntimeMonitorScreen;



