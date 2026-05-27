import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import { database } from '../../firebase-core';
import { auth } from '../../firebase-config';
import {
  subscribeManagedAuthorizedDevices,
  subscribeSecurityAppControl,
  subscribeSecurityLogs,
  updateManagedDeviceStatus,
  updateSecurityAppControl,
  type ManagedAuthorizedDevice,
  type SecurityLogRecord,
} from '../../services/securityAdminService';
import type { RemoteAppControlConfig } from '../../services/securityConfigValidator';
import type { RootState } from '../../redux/store';
import { SCREEN_THEME } from '../../utils/screenTheme';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';
type SecurityStatusKey = 'appEnabled' | 'maintenanceMode' | 'forceUpdate' | 'allowDevices' | 'betaMode';

/** URL message shown to users during pause / global-pause modes */
const CHAIKA_UPDATE_MESSAGE = 'Обновите приложение на сайте:\nhttps://chaika-life.netlify.app/';

const SUBSCRIPTION_LOADING_TIMEOUT_MS = 8000;

const COPY = {
  ua: {
    title: 'Безпека',
    subtitle: 'Керування системою безпеки застосунку',
    accessDenied: 'Доступ закрито',
    accessHint: 'Цей екран доступний тільки admin або підтвердженому primary owner.',
    retry: 'Спробувати знову',
    systemStatus: 'Статус системи',
    devices: 'Пристрої',
    logs: 'Security Logs',
    quickStats: 'Швидка статистика',
    emergency: 'Emergency Actions',
    activeDevices: 'Активні',
    blockedDevices: 'Заблоковані',
    pendingDevices: 'Очікують',
    onlineToday: 'Онлайн сьогодні',
    enableApp: 'Увімкнути застосунок',
    disableApp: 'Вимкнути застосунок',
    enableMaintenance: 'Увімкнути техроботи',
    disableMaintenance: 'Вимкнути техроботи',
    enableForceUpdate: 'Увімкнути Force Update',
    disableForceUpdate: 'Вимкнути Force Update',
    allowNewDevices: 'Дозволити нові пристрої',
    denyNewDevices: 'Заборонити нові пристрої',
    enableBeta: 'Увімкнути Beta Mode',
    disableBeta: 'Вимкнути Beta Mode',
    approve: 'Approve',
    block: 'Відключити від сервера',
    unblock: 'Unblock',
    revoke: 'Revoke',
    appEnabled: 'App Enabled',
    maintenanceMode: 'Maintenance Mode',
    forceUpdate: 'Force Update',
    allowDevices: 'Allow New Devices',
    betaMode: 'Beta Mode',
    appEnabledHint: '',
    maintenanceModeHint: '',
    forceUpdateHint: '',
    allowDevicesHint: '',
    betaModeHint: '',
    on: 'ON',
    off: 'OFF',
    noDevices: 'Пристроїв поки немає',
    noLogs: 'Логів поки немає',
    loading: 'Завантаження...',
    partialError: 'Частина даних тимчасово недоступна. Можна оновити ще раз.',
    emergencyShutdown: 'Emergency Shutdown',
    emergencyMaintenance: 'Emergency Maintenance',
    globalRefresh: 'Force Global Refresh',
    confirmShutdownTitle: 'Вимкнути застосунок?',
    confirmShutdownBody: 'Усі користувачі втратять доступ, поки ви не ввімкнете застосунок знову.',
    confirmMaintenanceTitle: 'Увімкнути техроботи?',
    confirmMaintenanceBody: 'Користувачі побачать екран техробіт замість звичайного інтерфейсу.',
    confirmForceUpdateTitle: 'Увімкнути Force Update?',
    confirmForceUpdateBody: 'Користувачі побачать вимогу оновити застосунок.',
    confirmBlockTitle: 'Відключити пристрій?',
    confirmBlockBody: 'Цей пристрій одразу втратить доступ до застосунку. Обліковий запис та дані збережуться.',
    confirmRevokeTitle: 'Відкликати пристрій?',
    confirmRevokeBody: 'Цей пристрій втратить дозвіл до нового схвалення.',
    cancel: 'Скасувати',
    confirm: 'Підтвердити',
    updatedAt: 'Оновлено',
    userUid: 'UID',
    platform: 'Платформа',
    version: 'Версія',
    createdAt: 'Створено',
    lastSeen: 'Остання активність',
    allowed: 'Allowed',
    blocked: 'Blocked',
    event: 'Подія',
    back: 'Назад',
    ownerName: 'Власник',
    installedAt: 'Дата встановлення',
    allDevices: 'Всі встановлення',
    allDevicesHint: 'Всі пристрої, що хоч раз підключалися через сервер',
    deviceStatus: 'Статус',
    deviceName: 'Пристрій',
    statusActive: 'Активний',
    statusPending: 'Очікує',
    statusBlocked: 'Заблоковано',
    pauseMode: 'Режим призупинення',
    pauseModeHint: 'Усі користувачі побачать екран з проханням оновити застосунок',
    startPause: 'Запустити призупинення',
    stopPause: 'Зупинити призупинення',
    pauseIsActive: 'ПРИЗУПИНЕННЯ АКТИВНЕ',
    pauseIsInactive: 'Режим вимкнено',
    confirmPauseTitle: 'Запустити призупинення?',
    confirmPauseBody: 'Усі користувачі побачать екран оновлення і не зможуть користуватись застосунком.',
    globalPause: 'Глобальне призупинення',
    globalPauseHint: 'Повністю вимикає застосунок для всіх користувачів. Використовуйте з обережністю.',
    enableGlobalPause: 'Ввімкнути глобальне призупинення',
    disableGlobalPause: 'Відновити роботу застосунку',
    globalPauseActive: 'ЗАСТОСУНОК ВИМКНЕНО ДЛЯ ВСІХ',
    globalPauseInactive: 'Застосунок працює нормально',
    confirmGlobalPauseTitle: 'Глобальне призупинення?',
    confirmGlobalPauseBody: 'ВСІ користувачі одразу втратять доступ до застосунку до відновлення.',
    showFeed: 'Показати стрічку',
    hideFeed: 'Сховати стрічку',
    showLogs: 'Показати журнал',
    hideLogs: 'Сховати журнал',
    details: 'Детальніше',
  },
  ru: {
    title: 'Безопасность',
    subtitle: 'Управление системой безопасности приложения',
    accessDenied: 'Доступ закрыт',
    accessHint: 'Этот экран доступен только admin или подтвержденному primary owner.',
    retry: 'Попробовать снова',
    systemStatus: 'Статус системы',
    devices: 'Устройства',
    logs: 'Журнал безопасности',
    quickStats: 'Быстрая статистика',
    emergency: 'Экстренные действия',
    activeDevices: 'Активные',
    blockedDevices: 'Заблокированные',
    pendingDevices: 'Ожидают',
    onlineToday: 'Онлайн сегодня',
    enableApp: 'Включить приложение',
    disableApp: 'Отключить приложение',
    enableMaintenance: 'Включить техработы',
    disableMaintenance: 'Выключить техработы',
    enableForceUpdate: 'Включить обязательное обновление',
    disableForceUpdate: 'Выключить обязательное обновление',
    allowNewDevices: 'Разрешить новые устройства',
    denyNewDevices: 'Запретить новые устройства',
    enableBeta: 'Включить бета-режим',
    disableBeta: 'Выключить бета-режим',
    approve: 'Одобрить',
    block: 'Отключить от сервера',
    unblock: 'Разблокировать',
    revoke: 'Отозвать доступ',
    appEnabled: 'Приложение включено',
    maintenanceMode: 'Техработы',
    forceUpdate: 'Обязательное обновление',
    allowDevices: 'Новые устройства',
    betaMode: 'Бета-режим',
    appEnabledHint: 'Главный переключатель доступа: если выключен, приложение закрыто для всех пользователей.',
    maintenanceModeHint: 'Показывает пользователям экран технических работ вместо обычного приложения.',
    forceUpdateHint: 'Заставляет пользователей обновить приложение перед дальнейшей работой.',
    allowDevicesHint: 'Разрешает новым телефонам и установкам регистрироваться через сервер.',
    betaModeHint: 'Открывает тестовый режим для функций, которые еще проверяются.',
    on: 'ВКЛ',
    off: 'ВЫКЛ',
    noDevices: 'Устройств пока нет',
    noLogs: 'Логов пока нет',
    loading: 'Загрузка...',
    partialError: 'Часть данных временно недоступна. Можно обновить еще раз.',
    emergencyShutdown: 'Экстренно отключить приложение',
    emergencyMaintenance: 'Экстренно включить техработы',
    globalRefresh: 'Принудительно обновить настройки',
    confirmShutdownTitle: 'Отключить приложение?',
    confirmShutdownBody: 'Все пользователи потеряют доступ, пока вы не включите приложение снова.',
    confirmMaintenanceTitle: 'Включить техработы?',
    confirmMaintenanceBody: 'Пользователи увидят экран техработ вместо обычного интерфейса.',
    confirmForceUpdateTitle: 'Включить Force Update?',
    confirmForceUpdateBody: 'Пользователи увидят обязательное требование обновиться.',
    confirmBlockTitle: 'Отключить устройство?',
    confirmBlockBody: 'Это устройство сразу потеряет доступ к приложению. Аккаунт и данные сохранятся.',
    confirmRevokeTitle: 'Отозвать устройство?',
    confirmRevokeBody: 'Это устройство потеряет доступ до нового одобрения.',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    updatedAt: 'Обновлено',
    userUid: 'UID',
    platform: 'Платформа',
    version: 'Версия',
    createdAt: 'Создано',
    lastSeen: 'Последняя активность',
    allowed: 'Разрешено',
    blocked: 'Заблокировано',
    event: 'Событие',
    back: 'Назад',
    ownerName: 'Владелец',
    installedAt: 'Дата установки',
    allDevices: 'Все установки',
    allDevicesHint: 'Все устройства, когда-либо подключавшиеся через сервер',
    deviceStatus: 'Статус',
    deviceName: 'Устройство',
    statusActive: 'Активно',
    statusPending: 'Ожидает',
    statusBlocked: 'Заблокировано',
    pauseMode: 'Режим приостановки',
    pauseModeHint: 'Все пользователи увидят экран с просьбой обновить приложение',
    startPause: 'Запустить приостановку',
    stopPause: 'Остановить приостановку',
    pauseIsActive: 'ПРИОСТАНОВКА АКТИВНА',
    pauseIsInactive: 'Режим выключен',
    confirmPauseTitle: 'Запустить приостановку?',
    confirmPauseBody: 'Все пользователи увидят экран обновления и не смогут пользоваться приложением.',
    globalPause: 'Глобальная приостановка',
    globalPauseHint: 'Полностью отключает приложение для всех пользователей. Используйте с осторожностью.',
    enableGlobalPause: 'Включить глобальную приостановку',
    disableGlobalPause: 'Восстановить работу приложения',
    globalPauseActive: 'ПРИЛОЖЕНИЕ ОТКЛЮЧЕНО ДЛЯ ВСЕХ',
    globalPauseInactive: 'Приложение работает нормально',
    confirmGlobalPauseTitle: 'Глобальная приостановка?',
    confirmGlobalPauseBody: 'ВСЕ пользователи сразу потеряют доступ к приложению до восстановления.',
    details: 'Подробнее',
    showFeed: 'Показать ленту',
    hideFeed: 'Скрыть ленту',
    showLogs: 'Показать журнал',
    hideLogs: 'Скрыть журнал',
  },
  en: {
    title: 'Security',
    subtitle: 'Application security control panel',
    accessDenied: 'Access denied',
    accessHint: 'This screen is available only to admin or a verified primary owner.',
    retry: 'Retry',
    systemStatus: 'System status',
    devices: 'Devices',
    logs: 'Security Logs',
    quickStats: 'Quick stats',
    emergency: 'Emergency Actions',
    activeDevices: 'Active',
    blockedDevices: 'Blocked',
    pendingDevices: 'Pending',
    onlineToday: 'Online today',
    enableApp: 'Enable app',
    disableApp: 'Disable app',
    enableMaintenance: 'Enable maintenance',
    disableMaintenance: 'Disable maintenance',
    enableForceUpdate: 'Enable Force Update',
    disableForceUpdate: 'Disable Force Update',
    allowNewDevices: 'Allow new devices',
    denyNewDevices: 'Deny new devices',
    enableBeta: 'Enable Beta Mode',
    disableBeta: 'Disable Beta Mode',
    approve: 'Approve',
    block: 'Disconnect',
    unblock: 'Unblock',
    revoke: 'Revoke',
    appEnabled: 'App Enabled',
    maintenanceMode: 'Maintenance Mode',
    forceUpdate: 'Force Update',
    allowDevices: 'Allow New Devices',
    betaMode: 'Beta Mode',
    appEnabledHint: 'Main access switch: when off, the app is closed for everyone.',
    maintenanceModeHint: 'Shows users a maintenance screen instead of the regular app.',
    forceUpdateHint: 'Requires users to update the app before continuing.',
    allowDevicesHint: 'Allows new phones and installs to register through the server.',
    betaModeHint: 'Enables test mode for features that are still being checked.',
    on: 'ON',
    off: 'OFF',
    noDevices: 'No devices yet',
    noLogs: 'No logs yet',
    loading: 'Loading...',
    partialError: 'Some data is temporarily unavailable. You can retry.',
    emergencyShutdown: 'Emergency Shutdown',
    emergencyMaintenance: 'Emergency Maintenance',
    globalRefresh: 'Force Global Refresh',
    confirmShutdownTitle: 'Disable the app?',
    confirmShutdownBody: 'All users will lose access until you enable the app again.',
    confirmMaintenanceTitle: 'Enable maintenance mode?',
    confirmMaintenanceBody: 'Users will see the maintenance screen instead of the regular app.',
    confirmForceUpdateTitle: 'Enable Force Update?',
    confirmForceUpdateBody: 'Users will be required to update the app.',
    confirmBlockTitle: 'Disconnect device?',
    confirmBlockBody: 'This device will immediately lose access to the app. Account and data will be preserved.',
    confirmRevokeTitle: 'Revoke this device?',
    confirmRevokeBody: 'This device will lose access until it is approved again.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    updatedAt: 'Updated',
    userUid: 'UID',
    platform: 'Platform',
    version: 'Version',
    createdAt: 'Created',
    lastSeen: 'Last seen',
    allowed: 'Allowed',
    blocked: 'Blocked',
    event: 'Event',
    back: 'Back',
    ownerName: 'Owner',
    installedAt: 'Installed',
    allDevices: 'All installs',
    allDevicesHint: 'Every device that has ever connected through the server',
    deviceStatus: 'Status',
    deviceName: 'Device',
    statusActive: 'Active',
    statusPending: 'Pending',
    statusBlocked: 'Blocked',
    pauseMode: 'Pause mode',
    pauseModeHint: 'All users will see the update screen',
    startPause: 'Start pause',
    stopPause: 'Stop pause',
    pauseIsActive: 'PAUSE ACTIVE',
    pauseIsInactive: 'Mode off',
    confirmPauseTitle: 'Start pause mode?',
    confirmPauseBody: 'All users will see the update screen and cannot use the app.',
    globalPause: 'Global pause',
    globalPauseHint: 'Completely disables the app for all users. Use with caution.',
    enableGlobalPause: 'Enable global pause',
    disableGlobalPause: 'Restore app access',
    globalPauseActive: 'APP DISABLED FOR ALL',
    globalPauseInactive: 'App working normally',
    confirmGlobalPauseTitle: 'Enable global pause?',
    confirmGlobalPauseBody: 'ALL users will immediately lose access to the app until restored.',
    showFeed: 'Show feed',
    hideFeed: 'Hide feed',
    showLogs: 'Show logs',
    hideLogs: 'Hide logs',
    details: 'Details',
  },
} as const;

const DETAILS_RU = {
  appEnabled: 'Главный переключатель доступа. Если выключить — ВСЕ пользователи сразу теряют доступ к приложению, пока вы не включите обратно.',
  maintenanceMode: 'Переводит всех пользователей на экран техработ. Приложение открывается, но вместо контента — сообщение об обслуживании. Отключить можно кнопкой ниже.',
  forceUpdate: 'Требует от всех пользователей обновить приложение до последней версии. Пока не обновятся — не войдут.',
  allowDevices: 'Управляет регистрацией новых телефонов. Если запретить — ни одно новое устройство не сможет привязаться к серверу.',
  betaMode: 'Открывает экспериментальные функции. Включайте только если проводите тестирование новых возможностей.',
  emergencyShutdown: 'Мгновенно отключает приложение для ВСЕХ пользователей без предупреждения. Доступ блокируется немедленно.',
  emergencyMaintenance: 'Мгновенно переводит всех пользователей на экран техработ. Отключить можно в разделе "Режим приостановки" ниже.',
  globalRefresh: 'Принудительно заставляет все устройства получить обновлённую конфигурацию с сервера прямо сейчас.',
} as const;

const formatDateTime = (value: number): string => {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
};

const StatusPill = ({ enabled, label }: { enabled: boolean; label: string }) => (
  <View style={[styles.statusPill, enabled ? styles.statusPillOn : styles.statusPillOff]}>
    <Text style={styles.statusPillLabel}>{label}</Text>
  </View>
);

const getSecurityErrorSummary = (kind: 'config' | 'devices' | 'logs', language: Lang) => {
  if (language === 'ru') {
    if (kind === 'config') return 'Не загрузились системные переключатели';
    if (kind === 'devices') return 'Не загрузился список устройств';
    return 'Не загрузился журнал безопасности';
  }

  if (language === 'ua') {
    if (kind === 'config') return 'Не завантажилися системні перемикачі';
    if (kind === 'devices') return 'Не завантажився список пристроїв';
    return 'Не завантажився журнал безпеки';
  }

  if (kind === 'config') return 'System switches failed to load';
  if (kind === 'devices') return 'Device list failed to load';
  return 'Security log failed to load';
};

const getSecurityErrorExplanation = (kind: 'config' | 'devices' | 'logs', message: string, language: Lang) => {
  const detail = message.toLowerCase();
  const isPermission = detail.includes('permission') || detail.includes('denied') || detail.includes('unauthorized');

  if (language === 'ru') {
    if (isPermission) {
      return 'Похоже на ограничение прав Firebase для этой ветки данных. Аккаунт вошел в экран, но конкретный источник читать нельзя.';
    }
    if (kind === 'config') return 'Без этих данных экран не знает, включено ли приложение, техработы, обновление и новые устройства.';
    if (kind === 'devices') return 'Без этих данных нельзя увидеть активные, ожидающие и заблокированные устройства.';
    return 'Без этих данных не видны последние события безопасности.';
  }

  if (language === 'ua') {
    if (isPermission) return 'Схоже на обмеження прав Firebase для цієї гілки даних.';
    if (kind === 'config') return 'Без цих даних екран не знає поточні системні перемикачі.';
    if (kind === 'devices') return 'Без цих даних не видно активні, очікуючі та заблоковані пристрої.';
    return 'Без цих даних не видно останні події безпеки.';
  }

  if (isPermission) return 'This looks like a Firebase permission issue for this data branch.';
  if (kind === 'config') return 'Without this data, the screen cannot show the current system switches.';
  if (kind === 'devices') return 'Without this data, active, pending, and blocked devices are unavailable.';
  return 'Without this data, recent security events are unavailable.';
};

const SecurityControlScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  // Admin screen is always in Russian regardless of user language preference
  const language: Lang = 'ru';
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const text = COPY[language];

  const mountedRef = useRef(true);
  const busyActionRef = useRef<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [config, setConfig] = useState<RemoteAppControlConfig | null>(null);
  const [devices, setDevices] = useState<ManagedAuthorizedDevice[]>([]);
  const [logs, setLogs] = useState<SecurityLogRecord[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalUsersLoading, setTotalUsersLoading] = useState(true);
  const [showDevicesFeed, setShowDevicesFeed] = useState(false);
  const [showAllDevicesFeed, setShowAllDevicesFeed] = useState(false);
  const [showLogsFeed, setShowLogsFeed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setConfigLoading(true);
    setDevicesLoading(true);
    setLogsLoading(true);
    setConfigError(null);
    setDevicesError(null);
    setLogsError(null);

    const timeoutId = setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }

      setConfigLoading(false);
      setDevicesLoading(false);
      setLogsLoading(false);
    }, SUBSCRIPTION_LOADING_TIMEOUT_MS);

    const unsubscribeConfig = subscribeSecurityAppControl(
      (nextConfig) => {
        if (!mountedRef.current) {
          return;
        }
        setConfig(nextConfig);
        setConfigLoading(false);
        setConfigError(null);
      },
      (error) => {
        if (!mountedRef.current) {
          return;
        }
        setConfigLoading(false);
        setConfigError(error.message);
      },
    );

    const unsubscribeDevices = subscribeManagedAuthorizedDevices(
      (nextDevices) => {
        if (!mountedRef.current) {
          return;
        }
        setDevices(nextDevices);
        setDevicesLoading(false);
        setDevicesError(null);
      },
      (error) => {
        if (!mountedRef.current) {
          return;
        }
        setDevicesLoading(false);
        setDevicesError(error.message);
      },
    );

    const unsubscribeLogs = subscribeSecurityLogs(
      (nextLogs) => {
        if (!mountedRef.current) {
          return;
        }
        setLogs(nextLogs);
        setLogsLoading(false);
        setLogsError(null);
      },
      (error) => {
        if (!mountedRef.current) {
          return;
        }
        setLogsLoading(false);
        setLogsError(error.message);
      },
    );

    setTotalUsersLoading(true);
    const usersRef = ref(database, 'users');
    const unsubscribeUsers = onValue(
      usersRef,
      (snap) => {
        if (!mountedRef.current) {
          return;
        }
        if (!snap.exists()) {
          setTotalUsers(0);
          setUserNames({});
          setTotalUsersLoading(false);
          return;
        }
        const raw = snap.val() as Record<string, { name?: unknown }>;
        setTotalUsers(Object.keys(raw).length);
        const nameMap: Record<string, string> = {};
        Object.entries(raw).forEach(([uid, val]) => {
          if (val && typeof val.name === 'string' && val.name.trim()) {
            nameMap[uid] = val.name;
          }
        });
        setUserNames(nameMap);
        setTotalUsersLoading(false);
      },
      () => {
        if (mountedRef.current) {
          setTotalUsersLoading(false);
        }
      },
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribeConfig();
      unsubscribeDevices();
      unsubscribeLogs();
      unsubscribeUsers();
    };
  }, [retryTick]);

  const confirmAction = useCallback((title: string, message: string) => new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: text.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: text.confirm, style: 'destructive', onPress: () => resolve(true) },
    ]);
  }), [text.cancel, text.confirm]);

  const runBusyAction = useCallback(async (actionKey: string, task: () => Promise<void>) => {
    if (busyActionRef.current) {
      return;
    }

    busyActionRef.current = actionKey;
    setBusyAction(actionKey);
    try {
      await task();
    } catch {
      // Intentionally suppress action error popups on this screen.
    } finally {
      busyActionRef.current = null;
      if (mountedRef.current) {
        setBusyAction(null);
      }
    }
  }, [currentUser?.id]);

  const updateConfigAction = useCallback(async (
    actionKey: string,
    patch: Partial<RemoteAppControlConfig>,
    confirmOptions?: { title: string; body: string },
    options?: { forceRefreshOnly?: boolean },
  ) => {
    const actorUid = auth.currentUser?.uid ?? currentUser?.id ?? '';

    if (confirmOptions) {
      const confirmed = await confirmAction(confirmOptions.title, confirmOptions.body);
      if (!confirmed) {
        return;
      }
    }

    await runBusyAction(actionKey, async () => {
      await updateSecurityAppControl(patch, actorUid, options);
    });
  }, [confirmAction, currentUser?.id, runBusyAction]);

  const updateDeviceAction = useCallback(async (
    actionKey: string,
    device: ManagedAuthorizedDevice,
    patch: Pick<ManagedAuthorizedDevice, 'is_allowed' | 'is_blocked'>,
    confirmOptions?: { title: string; body: string },
  ) => {
    if (confirmOptions) {
      const confirmed = await confirmAction(confirmOptions.title, confirmOptions.body);
      if (!confirmed) {
        return;
      }
    }

    await runBusyAction(actionKey, async () => {
      await updateManagedDeviceStatus(device.uid, device.device_id, patch);
    });
  }, [confirmAction, runBusyAction]);

  const refreshAll = useCallback(() => {
    setIsRefreshing(true);
    if (mountedRef.current) {
      setRetryTick((current) => current + 1);
      setIsRefreshing(false);
    }
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      totalUsers,
      active: devices.filter((device) => device.is_allowed && !device.is_blocked).length,
      blocked: devices.filter((device) => device.is_blocked).length,
      pending: devices.filter((device) => !device.is_allowed && !device.is_blocked).length,
      onlineToday: devices.filter((device) => device.last_seen_at > 0 && now - device.last_seen_at <= 24 * 60 * 60 * 1000).length,
    };
  }, [devices, totalUsers]);

  const hasSectionErrors = Boolean(configError || devicesError || logsError);
  const sectionErrors = useMemo(() => {
    const items: { kind: 'config' | 'devices' | 'logs'; message: string }[] = [];
    if (configError) items.push({ kind: 'config', message: configError });
    if (devicesError) items.push({ kind: 'devices', message: devicesError });
    if (logsError) items.push({ kind: 'logs', message: logsError });
    return items;
  }, [configError, devicesError, logsError]);
  const statusItems = useMemo<Array<{
    key: SecurityStatusKey;
    label: string;
    hint: string;
    enabled: boolean;
  }>>(() => [
    {
      key: 'appEnabled',
      label: text.appEnabled,
      hint: text.appEnabledHint,
      enabled: config?.app_enabled === true,
    },
    {
      key: 'maintenanceMode',
      label: text.maintenanceMode,
      hint: text.maintenanceModeHint,
      enabled: config?.maintenance_mode === true,
    },
    {
      key: 'forceUpdate',
      label: text.forceUpdate,
      hint: text.forceUpdateHint,
      enabled: config?.force_update_required === true,
    },
    {
      key: 'allowDevices',
      label: text.allowDevices,
      hint: text.allowDevicesHint,
      enabled: config?.allow_new_devices === true,
    },
    {
      key: 'betaMode',
      label: text.betaMode,
      hint: text.betaModeHint,
      enabled: config?.beta_mode_enabled === true,
    },
  ], [
    config?.allow_new_devices,
    config?.app_enabled,
    config?.beta_mode_enabled,
    config?.force_update_required,
    config?.maintenance_mode,
    text.allowDevices,
    text.allowDevicesHint,
    text.appEnabled,
    text.appEnabledHint,
    text.betaMode,
    text.betaModeHint,
    text.forceUpdate,
    text.forceUpdateHint,
    text.maintenanceMode,
    text.maintenanceModeHint,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refreshAll()} />}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.82}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.backButtonText}>{text.back}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
          {config?.updated_at ? (
            <Text style={styles.headerMeta}>
              {text.updatedAt}: {formatDateTime(config.updated_at)}
            </Text>
          ) : null}
        </View>

        {hasSectionErrors ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{text.partialError}</Text>
            {sectionErrors.map((item) => (
              <View key={item.kind} style={styles.noticeIssue}>
                <Text style={styles.noticeIssueTitle}>{getSecurityErrorSummary(item.kind, language)}</Text>
                <Text style={styles.noticeIssueText}>{getSecurityErrorExplanation(item.kind, item.message, language)}</Text>
                <Text style={styles.noticeIssueTech}>{item.message}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => void refreshAll()} activeOpacity={0.82}>
              <Text style={styles.noticeLink}>{text.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.systemStatus}</Text>
          {configLoading && !config ? (
            <SectionLoading label={text.loading} />
          ) : (
            <>
              <View style={styles.statusCardGrid}>
                {statusItems.map((item) => (
                  <View key={item.key} style={styles.statusCard}>
                    <View style={styles.statusCardHeader}>
                      <Text style={styles.statusTitle}>{item.label}</Text>
                      {item.hint ? (
                        <TouchableOpacity
                          onPress={() => Alert.alert(item.label, item.hint)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.detailLink}>{text.details}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <StatusPill enabled={item.enabled} label={item.enabled ? text.on : text.off} />
                  </View>
                ))}
              </View>

              <View style={styles.buttonGrid}>
                <View style={styles.buttonGroupHeader}>
                  <Text style={styles.buttonGroupLabel}>{text.appEnabled}</Text>
                  <TouchableOpacity onPress={() => Alert.alert(text.appEnabled, DETAILS_RU.appEnabled)} activeOpacity={0.7}>
                    <Text style={styles.detailLink}>{text.details}</Text>
                  </TouchableOpacity>
                </View>
                <ActionButton
                  label={text.enableApp}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('enable-app', { app_enabled: true })}
                />
                <ActionButton
                  label={text.disableApp}
                  disabled={Boolean(busyAction)}
                  danger
                  onPress={() => void updateConfigAction(
                    'disable-app',
                    { app_enabled: false },
                    { title: text.confirmShutdownTitle, body: text.confirmShutdownBody },
                  )}
                />

                <View style={styles.buttonGroupHeader}>
                  <Text style={styles.buttonGroupLabel}>{text.maintenanceMode}</Text>
                  <TouchableOpacity onPress={() => Alert.alert(text.maintenanceMode, DETAILS_RU.maintenanceMode)} activeOpacity={0.7}>
                    <Text style={styles.detailLink}>{text.details}</Text>
                  </TouchableOpacity>
                </View>
                <ActionButton
                  label={text.enableMaintenance}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction(
                    'enable-maintenance',
                    { maintenance_mode: true },
                    { title: text.confirmMaintenanceTitle, body: text.confirmMaintenanceBody },
                  )}
                />
                <ActionButton
                  label={text.disableMaintenance}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('disable-maintenance', { maintenance_mode: false })}
                />

                <View style={styles.buttonGroupHeader}>
                  <Text style={styles.buttonGroupLabel}>{text.forceUpdate}</Text>
                  <TouchableOpacity onPress={() => Alert.alert(text.forceUpdate, DETAILS_RU.forceUpdate)} activeOpacity={0.7}>
                    <Text style={styles.detailLink}>{text.details}</Text>
                  </TouchableOpacity>
                </View>
                <ActionButton
                  label={text.enableForceUpdate}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction(
                    'enable-force-update',
                    { force_update_required: true },
                    { title: text.confirmForceUpdateTitle, body: text.confirmForceUpdateBody },
                  )}
                />
                <ActionButton
                  label={text.disableForceUpdate}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('disable-force-update', { force_update_required: false })}
                />

                <View style={styles.buttonGroupHeader}>
                  <Text style={styles.buttonGroupLabel}>{text.allowDevices}</Text>
                  <TouchableOpacity onPress={() => Alert.alert(text.allowDevices, DETAILS_RU.allowDevices)} activeOpacity={0.7}>
                    <Text style={styles.detailLink}>{text.details}</Text>
                  </TouchableOpacity>
                </View>
                <ActionButton
                  label={text.allowNewDevices}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('allow-new-devices', { allow_new_devices: true })}
                />
                <ActionButton
                  label={text.denyNewDevices}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('deny-new-devices', { allow_new_devices: false })}
                />

                <View style={styles.buttonGroupHeader}>
                  <Text style={styles.buttonGroupLabel}>{text.betaMode}</Text>
                  <TouchableOpacity onPress={() => Alert.alert(text.betaMode, DETAILS_RU.betaMode)} activeOpacity={0.7}>
                    <Text style={styles.detailLink}>{text.details}</Text>
                  </TouchableOpacity>
                </View>
                <ActionButton
                  label={text.enableBeta}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('enable-beta', { beta_mode_enabled: true })}
                />
                <ActionButton
                  label={text.disableBeta}
                  disabled={Boolean(busyAction)}
                  onPress={() => void updateConfigAction('disable-beta', { beta_mode_enabled: false })}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.quickStats}</Text>
          {(devicesLoading && !devices.length) || totalUsersLoading ? (
            <SectionLoading label={text.loading} />
          ) : (
            <View style={styles.statsRow}>
              <StatCard label={language === 'ru' ? 'Пользователей' : language === 'ua' ? 'Користувачів' : 'Users'} value={stats.totalUsers} accent />
              <StatCard label={text.blockedDevices} value={stats.blocked} />
              <StatCard label={text.pendingDevices} value={stats.pending} />
              <StatCard label={text.onlineToday} value={stats.onlineToday} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.emergency}</Text>
          <View style={styles.buttonGrid}>
            <View style={styles.buttonGroupHeader}>
              <Text style={styles.buttonGroupLabel}>{text.emergencyShutdown}</Text>
              <TouchableOpacity onPress={() => Alert.alert(text.emergencyShutdown, DETAILS_RU.emergencyShutdown)} activeOpacity={0.7}>
                <Text style={styles.detailLink}>{text.details}</Text>
              </TouchableOpacity>
            </View>
            <ActionButton
              label={text.emergencyShutdown}
              danger
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction(
                'emergency-shutdown',
                { app_enabled: false },
                { title: text.confirmShutdownTitle, body: text.confirmShutdownBody },
              )}
            />
            <View style={styles.buttonGroupHeader}>
              <Text style={styles.buttonGroupLabel}>{text.emergencyMaintenance}</Text>
              <TouchableOpacity onPress={() => Alert.alert(text.emergencyMaintenance, DETAILS_RU.emergencyMaintenance)} activeOpacity={0.7}>
                <Text style={styles.detailLink}>{text.details}</Text>
              </TouchableOpacity>
            </View>
            <ActionButton
              label={text.emergencyMaintenance}
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction(
                'emergency-maintenance',
                { maintenance_mode: true },
                { title: text.confirmMaintenanceTitle, body: text.confirmMaintenanceBody },
              )}
            />
            <View style={styles.buttonGroupHeader}>
              <Text style={styles.buttonGroupLabel}>{text.globalRefresh}</Text>
              <TouchableOpacity onPress={() => Alert.alert(text.globalRefresh, DETAILS_RU.globalRefresh)} activeOpacity={0.7}>
                <Text style={styles.detailLink}>{text.details}</Text>
              </TouchableOpacity>
            </View>
            <ActionButton
              label={text.globalRefresh}
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction('force-global-refresh', {}, undefined, { forceRefreshOnly: true })}
            />
          </View>
        </View>

        {/* Р­РўРђРџ 3 вЂ" Pause mode section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.pauseMode}</Text>
          <Text style={styles.sectionHint}>{text.pauseModeHint}</Text>

          {/* Status badge */}
          {config?.maintenance_mode ? (
            <View style={styles.pauseActiveBadge}>
              <Text style={styles.pauseActiveBadgeText}>{text.pauseIsActive}</Text>
            </View>
          ) : (
            <View style={styles.pauseInactiveBadge}>
              <Text style={styles.pauseInactiveBadgeText}>{text.pauseIsInactive}</Text>
            </View>
          )}

          {/* Toggle button */}
          {!config?.maintenance_mode ? (
            <ActionButton
              label={text.startPause}
              danger
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction(
                'start-pause',
                { maintenance_mode: true, maintenance_message: CHAIKA_UPDATE_MESSAGE },
                { title: text.confirmPauseTitle, body: text.confirmPauseBody },
              )}
            />
          ) : (
            <ActionButton
              label={text.stopPause}
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction('stop-pause', { maintenance_mode: false, maintenance_message: '' })}
            />
          )}
        </View>

        {/* Р­РўРђРџ 4 вЂ" Global pause section */}
        <View style={[styles.section, styles.globalPauseSection]}>
          <Text style={styles.sectionTitle}>{text.globalPause}</Text>
          <Text style={styles.sectionHint}>{text.globalPauseHint}</Text>

          {/* Status */}
          {config?.app_enabled === false ? (
            <View style={styles.globalPauseActiveBadge}>
              <Text style={styles.globalPauseActiveBadgeText}>{text.globalPauseActive}</Text>
            </View>
          ) : (
            <View style={styles.pauseInactiveBadge}>
              <Text style={styles.pauseInactiveBadgeText}>{text.globalPauseInactive}</Text>
            </View>
          )}

          {/* Button */}
          {config?.app_enabled !== false ? (
            <ActionButton
              label={text.enableGlobalPause}
              danger
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction(
                'global-pause-enable',
                { app_enabled: false, maintenance_message: CHAIKA_UPDATE_MESSAGE },
                { title: text.confirmGlobalPauseTitle, body: text.confirmGlobalPauseBody },
              )}
            />
          ) : (
            <ActionButton
              label={text.disableGlobalPause}
              disabled={Boolean(busyAction)}
              onPress={() => void updateConfigAction('global-pause-disable', { app_enabled: true })}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.devices}</Text>
          <TouchableOpacity
            style={styles.toggleFeedButton}
            onPress={() => setShowDevicesFeed((current) => !current)}
            activeOpacity={0.82}
          >
            <Text style={styles.toggleFeedButtonText}>{showDevicesFeed ? text.hideFeed : text.showFeed}</Text>
          </TouchableOpacity>
          {showDevicesFeed ? (
            devicesLoading && !devices.length ? (
              <SectionLoading label={text.loading} />
            ) : devices.length === 0 ? (
              <EmptyCard label={text.noDevices} />
            ) : (
              devices.map((device) => {
                // Truncate device_id to 12 chars for display
                const rawId = device.device_id;
                const shortId = rawId.length > 12 ? `${rawId.slice(0, 12)}...` : rawId;

                // Combined status badge
                const statusLabel = device.is_blocked
                  ? `🔴 ${text.statusBlocked}`
                  : device.is_allowed
                    ? `🟢 ${text.statusActive}`
                    : `🟡 ${text.statusPending}`;

                const statusStyle = device.is_blocked
                  ? styles.deviceStatusBadgeBlocked
                  : device.is_allowed
                    ? styles.deviceStatusBadgeActive
                    : styles.deviceStatusBadgePending;

                return (
                  <View key={`${device.uid}:${device.device_id}`} style={styles.deviceCard}>
                    <View style={styles.deviceHeaderRow}>
                      {/* Title: device_name first, fallback to device_id */}
                      <Text style={styles.deviceTitle}>{device.device_name || device.device_id}</Text>
                      <View style={[styles.deviceStatusBadge, statusStyle]}>
                        <Text style={styles.deviceStatusBadgeText}>{statusLabel}</Text>
                      </View>
                    </View>

                    {/* Owner name if available */}
                    {userNames[device.uid] ? (
                      <Text style={styles.deviceMeta}>{text.ownerName}: {userNames[device.uid]}</Text>
                    ) : null}

                    {/* Truncated device ID */}
                    <Text style={styles.deviceMeta}>{text.deviceName}: {shortId}</Text>

                    {/* App version */}
                    <Text style={styles.deviceMeta}>{text.version}: {device.app_version || '—'}</Text>

                    {/* Last activity */}
                    <Text style={styles.deviceMeta}>{text.lastSeen}: {formatDateTime(device.last_seen_at)}</Text>

                    {/* Platform */}
                    <Text style={styles.deviceMeta}>{text.platform}: {device.platform || '—'}</Text>

                    <View style={styles.deviceActions}>
                      <View style={styles.deviceActionsRow}>
                        <ActionButton
                          label={text.approve}
                          compact
                          disabled={Boolean(busyAction)}
                          onPress={() => void updateDeviceAction(`approve:${device.uid}:${device.device_id}`, device, {
                            is_allowed: true,
                            is_blocked: false,
                          })}
                        />
                        <ActionButton
                          label={text.unblock}
                          compact
                          disabled={Boolean(busyAction)}
                          onPress={() => void updateDeviceAction(`unblock:${device.uid}:${device.device_id}`, device, {
                            is_allowed: true,
                            is_blocked: false,
                          })}
                        />
                      </View>
                      <View style={styles.deviceActionsRow}>
                        <ActionButton
                          label={text.block}
                          compact
                          danger
                          disabled={Boolean(busyAction)}
                          onPress={() => void updateDeviceAction(
                            `block:${device.uid}:${device.device_id}`,
                            device,
                            { is_allowed: device.is_allowed, is_blocked: true },
                            { title: text.confirmBlockTitle, body: text.confirmBlockBody },
                          )}
                        />
                        <ActionButton
                          label={text.revoke}
                          compact
                          disabled={Boolean(busyAction)}
                          onPress={() => void updateDeviceAction(
                            `revoke:${device.uid}:${device.device_id}`,
                            device,
                            {
                              is_allowed: false,
                              is_blocked: false,
                            },
                            { title: text.confirmRevokeTitle, body: text.confirmRevokeBody },
                          )}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.allDevices}</Text>
          <Text style={styles.sectionHint}>{text.allDevicesHint}</Text>
          <TouchableOpacity
            style={styles.toggleFeedButton}
            onPress={() => setShowAllDevicesFeed((current) => !current)}
            activeOpacity={0.82}
          >
            <Text style={styles.toggleFeedButtonText}>{showAllDevicesFeed ? text.hideFeed : text.showFeed}</Text>
          </TouchableOpacity>
          {showAllDevicesFeed ? (
            (devicesLoading && !devices.length ? (
              <SectionLoading label={text.loading} />
            ) : devices.length === 0 ? (
              <EmptyCard label={text.noDevices} />
            ) : (
              devices.map((device) => {
                const ownerName = userNames[device.uid];
                const deviceStatusLabel = device.is_blocked
                  ? text.statusBlocked
                  : device.is_allowed
                    ? text.statusActive
                    : text.statusPending;
                return (
                  <View key={`install:${device.uid}:${device.device_id}`} style={styles.installCard}>
                    <Text style={styles.installOwner}>{ownerName ?? '—'}</Text>
                    <Text style={styles.installDeviceName}>{device.device_name || device.device_id}</Text>
                    <Text style={styles.installMeta}>{text.installedAt}: {formatDateTime(device.created_at)}</Text>
                    <Text style={styles.installMeta}>{text.lastSeen}: {formatDateTime(device.last_seen_at)}</Text>
                    <Text style={styles.installMeta}>{text.deviceStatus}: {deviceStatusLabel}</Text>
                    <Text style={styles.installMeta}>{text.platform}: {device.platform || '—'}</Text>
                    <Text style={styles.installMeta}>{text.version}: {device.app_version || '—'}</Text>
                  </View>
                );
              })
            ))
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{text.logs}</Text>
          <TouchableOpacity
            style={styles.toggleFeedButton}
            onPress={() => setShowLogsFeed((current) => !current)}
            activeOpacity={0.82}
          >
            <Text style={styles.toggleFeedButtonText}>{showLogsFeed ? text.hideLogs : text.showLogs}</Text>
          </TouchableOpacity>
          {showLogsFeed ? (
            (logsLoading && !logs.length ? (
              <SectionLoading label={text.loading} />
            ) : logs.length === 0 ? (
              <EmptyCard label={text.noLogs} />
            ) : (
              logs.slice(0, 20).map((logItem) => (
                <View key={`${logItem.partition}:${logItem.id}`} style={styles.logCard}>
                  <Text style={styles.logTitle}>{text.event}: {logItem.event_type}</Text>
                  <Text style={styles.logMeta}>{text.updatedAt}: {formatDateTime(logItem.created_at)}</Text>
                  <Text style={styles.logMeta}>UID: {logItem.uid || '—'}</Text>
                  <Text style={styles.logMeta}>device_id: {logItem.device_id || '—'}</Text>
                </View>
              ))
            ))
          ) : null}
        </View>
      </ScrollView>

      {busyAction ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const SectionLoading = ({ label }: { label: string }) => (
  <View style={styles.loadingCard}>
    <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} />
    <Text style={styles.loadingCardText}>{label}</Text>
  </View>
);

const EmptyCard = ({ label }: { label: string }) => (
  <View style={styles.emptyCard}>
    <Text style={styles.emptyCardText}>{label}</Text>
  </View>
);

const StatCard = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <View style={[styles.statCard, accent ? styles.statCardAccent : null]}>
    <Text style={[styles.statValue, accent ? styles.statValueAccent : null]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const ActionButton = ({
  label,
  onPress,
  disabled,
  compact,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  danger?: boolean;
}) => (
  <TouchableOpacity
    style={[
      styles.actionButton,
      compact ? styles.actionButtonCompact : null,
      danger ? styles.actionButtonDanger : null,
      disabled ? styles.actionButtonDisabled : null,
    ]}
    onPress={onPress}
    activeOpacity={0.82}
    disabled={disabled}
  >
    <Text style={styles.actionButtonText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: SCREEN_THEME.appBg,
  },
  loadingText: {
    marginTop: 10,
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  lockedTitle: {
    marginTop: 14,
    color: SCREEN_THEME.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  lockedText: {
    marginTop: 8,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  retryButton: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  content: {
    padding: 14,
    paddingBottom: 44,
    gap: 14,
  },
  header: {
    borderRadius: 22,
    backgroundColor: SCREEN_THEME.paperStrong,
    padding: 16,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    ...SCREEN_THEME.raisedShadowStrong,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  backButtonText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  headerMeta: {
    marginTop: 10,
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  noticeCard: {
    borderRadius: 18,
    backgroundColor: '#FFF4D8',
    borderWidth: 1,
    borderColor: '#E1C38B',
    padding: 14,
  },
  noticeText: {
    color: '#6E542B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  noticeLink: {
    marginTop: 10,
    color: SCREEN_THEME.terracottaDark,
    fontSize: 13,
    fontWeight: '900',
  },
  noticeIssue: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.52)',
    padding: 10,
  },
  noticeIssueTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  noticeIssueText: {
    marginTop: 4,
    color: '#6E542B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  noticeIssueTech: {
    marginTop: 6,
    color: '#8A4D38',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    paddingHorizontal: 2,
  },
  statusCardGrid: {
    gap: 10,
  },
  statusCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 8,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  statusHint: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailLink: {
    color: SCREEN_THEME.terracotta,
    fontSize: 12,
    fontWeight: '900',
  },
  buttonGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  buttonGroupLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillOn: {
    backgroundColor: 'rgba(95,123,77,0.14)',
  },
  statusPillOff: {
    backgroundColor: 'rgba(199,122,93,0.14)',
  },
  statusPillLabel: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  buttonGrid: {
    gap: 8,
  },
  actionButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonCompact: {
    flex: 1,
    minHeight: 40,
  },
  actionButtonDanger: {
    backgroundColor: SCREEN_THEME.terracottaDark,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  statCardAccent: {
    backgroundColor: 'rgba(95,123,77,0.08)',
    borderColor: 'rgba(95,123,77,0.22)',
  },
  statValue: {
    color: SCREEN_THEME.terracottaDark,
    fontSize: 24,
    fontWeight: '900',
  },
  statValueAccent: {
    color: SCREEN_THEME.woodGreenDark,
  },
  statLabel: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  loadingCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  loadingCardText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 16,
  },
  emptyCardText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  deviceCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 4,
  },
  deviceTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
    marginRight: 8,
  },
  deviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  deviceMeta: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  deviceActions: {
    gap: 8,
    marginTop: 10,
  },
  deviceActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleFeedButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  toggleFeedButtonText: {
    color: SCREEN_THEME.terracottaDark,
    fontSize: 13,
    fontWeight: '900',
  },
  logCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 4,
  },
  logTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  logMeta: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  sectionHint: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    paddingHorizontal: 2,
    marginTop: -4,
  },
  installCard: {
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    gap: 3,
  },
  installOwner: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  installDeviceName: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  installMeta: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  busyOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(74,60,39,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Device card status badge styles (ЭТАП 1)
  deviceStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  deviceStatusBadgeActive: {
    backgroundColor: 'rgba(95,123,77,0.16)',
  },
  deviceStatusBadgePending: {
    backgroundColor: 'rgba(216,175,89,0.22)',
  },
  deviceStatusBadgeBlocked: {
    backgroundColor: 'rgba(255,59,48,0.14)',
  },
  deviceStatusBadgeText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },

  // Pause mode section badges (ЭТАП 3)
  pauseActiveBadge: {
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  pauseActiveBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  pauseInactiveBadge: {
    borderRadius: 12,
    backgroundColor: 'rgba(95,123,77,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  pauseInactiveBadgeText: {
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },

  // Global pause section (ЭТАП 4)
  globalPauseSection: {
    borderWidth: 2,
    borderColor: '#FF3B30',
    borderRadius: 18,
    padding: 14,
  },
  globalPauseActiveBadge: {
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  globalPauseActiveBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default SecurityControlScreen;
