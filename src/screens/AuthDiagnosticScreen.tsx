import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { getAuth } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { database } from '../firebase-core';
import { getCurrentAuthorizedDeviceStatus, type DeviceAuthorizationStatus } from '../services/deviceAuth';
import { getPrimaryServiceAccessState } from '../firebase-auth-session';
import { getBuildInfo, type BuildInfo } from '../utils/buildInfo';
type Lang = 'ua' | 'ru' | 'en';

type AuthInfo = {
  uid?: string;
  email?: string;
  displayName?: string;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  createdAt?: number;
  lastSignInTime?: number;
};

type RoleInfo = {
  role?: string;
  updatedAt?: string;
  fcmToken?: string;
};

const COPY = {
  ua: {
    title: 'Діагностика Auth',
    subtitle: 'Перевірка стану автентифікації і прав доступу',
    refresh: 'Оновити',
    currentUser: 'Поточний користувач',
    uid: 'UID',
    email: 'Email',
    displayName: 'Ім\'я',
    emailVerified: 'Email перевірено',
    isAnonymous: 'Анонімний',
    createdAt: 'Акаунт створено',
    lastSignInTime: 'Останній вхід',
    role: 'Роль',
    roleSection: 'Права доступу',
    roleNone: '(роль не встановлена)',
    roleAdmin: 'Admin',
    roleModerator: 'Moderator',
    roleUser: 'User',
    serviceAccess: 'Доступ до сервісів',
    deviceAuth: 'Авторизація пристрою',
    deviceAllowed: 'дозволений',
    devicePending: 'очікує дозволу',
    deviceBlocked: 'заблокований',
    deviceUnknown: 'невідомо',
    yes: 'так',
    no: 'ні',
    notAvailable: '—',
    loading: 'Завантаження...',
    error: 'Помилка',
    errorFetchingRole: 'Помилка при отриманні ролі',
    errorFetchingDevice: 'Помилка при отриманні статусу пристрою',
  },
  ru: {
    title: 'Диагностика Auth',
    subtitle: 'Проверка состояния аутентификации и прав доступа',
    refresh: 'Обновить',
    currentUser: 'Текущий пользователь',
    uid: 'UID',
    email: 'Email',
    displayName: 'Имя',
    emailVerified: 'Email проверен',
    isAnonymous: 'Анонимный',
    createdAt: 'Аккаунт создан',
    lastSignInTime: 'Последний вход',
    role: 'Роль',
    roleSection: 'Права доступа',
    roleNone: '(роль не установлена)',
    roleAdmin: 'Admin',
    roleModerator: 'Moderator',
    roleUser: 'User',
    serviceAccess: 'Доступ к сервисам',
    deviceAuth: 'Авторизация устройства',
    deviceAllowed: 'разрешён',
    devicePending: 'ожидает разрешения',
    deviceBlocked: 'заблокирован',
    deviceUnknown: 'неизвестно',
    yes: 'да',
    no: 'нет',
    notAvailable: '—',
    loading: 'Загрузка...',
    error: 'Ошибка',
    errorFetchingRole: 'Ошибка при получении роли',
    errorFetchingDevice: 'Ошибка при получении статуса устройства',
  },
  en: {
    title: 'Auth Diagnostic',
    subtitle: 'Check authentication state and access rights',
    refresh: 'Refresh',
    currentUser: 'Current User',
    uid: 'UID',
    email: 'Email',
    displayName: 'Name',
    emailVerified: 'Email Verified',
    isAnonymous: 'Anonymous',
    createdAt: 'Account Created',
    lastSignInTime: 'Last Sign In',
    role: 'Role',
    roleSection: 'Access Rights',
    roleNone: '(role not set)',
    roleAdmin: 'Admin',
    roleModerator: 'Moderator',
    roleUser: 'User',
    serviceAccess: 'Service Access',
    deviceAuth: 'Device Authorization',
    deviceAllowed: 'allowed',
    devicePending: 'pending approval',
    deviceBlocked: 'blocked',
    deviceUnknown: 'unknown',
    yes: 'yes',
    no: 'no',
    notAvailable: '—',
    loading: 'Loading...',
    error: 'Error',
    errorFetchingRole: 'Error fetching role',
    errorFetchingDevice: 'Error fetching device status',
  },
} as const;

const formatDateTime = (value?: number | string): string => {
  if (!value) return '—';
  try {
    const timestamp = typeof value === 'string' ? new Date(value).getTime() : value;
    if (!Number.isFinite(timestamp)) return '—';
    return new Date(timestamp).toLocaleString();
  } catch {
    return '—';
  }
};

const getRoleLabel = (role: string | undefined, text: Record<string, string>): string => {
  if (!role) return text.roleNone;
  if (role === 'admin') return text.roleAdmin;
  if (role === 'moderator') return text.roleModerator;
  return text.roleUser;
};

type InfoRow = {
  label: string;
  value: string;
  highlight?: boolean;
};

const InfoRow: React.FC<{ data: InfoRow; theme: typeof SCREEN_THEME }> = ({ data, theme }) => (
  <View style={[styles.infoRow, data.highlight && styles.infoRowHighlight]}>
    <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{data.label}</Text>
    <Text style={[styles.infoValue, { color: data.highlight ? theme.success : theme.text }]}>
      {data.value}
    </Text>
  </View>
);

const Section: React.FC<{ title: string; children: React.ReactNode; theme: typeof SCREEN_THEME }> = ({
  title,
  children,
  theme,
}) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: theme.primary }]}>{title}</Text>
    <View style={[styles.sectionContent, { borderColor: theme.border }]}>
      {children}
    </View>
  </View>
);

const { SCREEN_THEME } = require('../utils/screenTheme');

const AuthDiagnosticScreen: React.FC = () => {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ru') as Lang);
  const theme = SCREEN_THEME;
  const text = COPY[language];
  const mountedRef = useRef(true);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [serviceAccess, setServiceAccess] = useState<{ isPrimaryEmail: boolean; isVerified: boolean; hasAccess: boolean }>({ isPrimaryEmail: false, isVerified: false, hasAccess: false });
  const [deviceInfo, setDeviceInfo] = useState<DeviceAuthorizationStatus | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  const loadAuthData = useCallback(async () => {
    if (mountedRef.current) {
      setRefreshing(true);
    }
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setAuthInfo(null);
        setRoleInfo(null);
        setServiceAccess({ isPrimaryEmail: false, isVerified: false, hasAccess: false });
        setDeviceInfo(null);
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      const userInfo: AuthInfo = {
        uid: currentUser.uid,
        email: currentUser.email || undefined,
        displayName: currentUser.displayName || undefined,
        emailVerified: currentUser.emailVerified,
        isAnonymous: currentUser.isAnonymous,
        createdAt: currentUser.metadata?.creationTime ? new Date(currentUser.metadata.creationTime).getTime() : undefined,
        lastSignInTime: currentUser.metadata?.lastSignInTime ? new Date(currentUser.metadata.lastSignInTime).getTime() : undefined,
      };

      if (mountedRef.current) {
        setAuthInfo(userInfo);
        setServiceAccess(getPrimaryServiceAccessState(currentUser));
      }

      // Fetch role info from RTDB
      try {
        const roleRef = ref(database, `user_roles/${currentUser.uid}`);
        const snapshot = await get(roleRef);
        if (mountedRef.current) {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setRoleInfo({
              role: data.role,
              updatedAt: data.updatedAt,
              fcmToken: data.fcmToken ? '(set)' : '(not set)',
            });
            setRoleError(null);
          } else {
            setRoleInfo(null);
            setRoleError(null);
          }
        }
      } catch (error) {
        if (mountedRef.current) {
          setRoleError(error instanceof Error ? error.message : String(error));
        }
      }

      try {
        const nextDevice = await getCurrentAuthorizedDeviceStatus(currentUser.uid);
        if (mountedRef.current) {
          setDeviceInfo(nextDevice);
        }
      } catch (error) {
        if (mountedRef.current) {
          setDeviceInfo({ deviceId: null, status: 'unknown', record: null, usesSecureStore: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
      // Load build info
      try {
        const bi = await getBuildInfo();
        if (mountedRef.current) setBuildInfo(bi);
      } catch {}
    } catch (error) {
      if (mountedRef.current) {
        console.error('[AuthDiagnostic] Error loading auth data:', error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadAuthData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAuthData]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{text.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const authRows: InfoRow[] = authInfo ? [
    { label: text.uid, value: authInfo.uid?.slice(0, 8) + '...' || text.notAvailable },
    { label: text.email, value: authInfo.email || text.notAvailable },
    { label: text.displayName, value: authInfo.displayName || text.notAvailable },
    { label: text.emailVerified, value: authInfo.emailVerified ? text.yes : text.no },
    { label: text.isAnonymous, value: authInfo.isAnonymous ? text.yes : text.no },
    { label: text.createdAt, value: formatDateTime(authInfo.createdAt) },
    { label: text.lastSignInTime, value: formatDateTime(authInfo.lastSignInTime) },
  ] : [
    { label: text.currentUser, value: '(not authenticated)' },
  ];

  const roleLabel = getRoleLabel(roleInfo?.role, text);
  const isAdmin = roleInfo?.role === 'admin';
  const isModerator = roleInfo?.role === 'moderator';
  const deviceLabel = deviceInfo?.status === 'allowed'
    ? text.deviceAllowed
    : deviceInfo?.status === 'pending'
      ? text.devicePending
      : deviceInfo?.status === 'blocked'
        ? text.deviceBlocked
        : text.deviceUnknown;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: theme.text }]}>{text.title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{text.subtitle}</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
          onPress={() => void loadAuthData()}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.refreshBtnText}>{text.refresh}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAuthData()} />}
      >
        <Section title={text.currentUser} theme={theme}>
          {authRows.map((row, idx) => (
            <InfoRow key={idx} data={row} theme={theme} />
          ))}
        </Section>

        {authInfo && (
          <Section title={text.roleSection} theme={theme}>
            <InfoRow
              data={{
                label: text.role,
                value: roleLabel,
                highlight: isAdmin || isModerator,
              }}
              theme={theme}
            />
            {roleError && (
              <View style={[styles.errorBox, { backgroundColor: theme.error + '20' }]}>
                <Text style={[styles.errorText, { color: theme.error }]}>
                  {text.error}: {roleError}
                </Text>
              </View>
            )}
          </Section>
        )}

        <Section title={text.serviceAccess} theme={theme}>
          <InfoRow data={{ label: text.serviceAccess, value: serviceAccess.hasAccess ? text.yes : text.no, highlight: serviceAccess.hasAccess }} theme={theme} />
          <InfoRow data={{ label: text.emailVerified, value: serviceAccess.isVerified ? text.yes : text.no, highlight: serviceAccess.isVerified }} theme={theme} />
          <InfoRow data={{ label: text.role, value: serviceAccess.isPrimaryEmail ? text.roleAdmin : text.roleUser, highlight: serviceAccess.hasAccess }} theme={theme} />
        </Section>

        <Section title={text.deviceAuth} theme={theme}>
          <InfoRow data={{ label: text.deviceAuth, value: deviceLabel, highlight: deviceInfo?.status === 'allowed' }} theme={theme} />
          <InfoRow data={{ label: 'Device ID', value: deviceInfo?.deviceId || text.notAvailable }} theme={theme} />
          <InfoRow data={{ label: 'Secure Store', value: deviceInfo?.usesSecureStore ? text.yes : text.no }} theme={theme} />
        </Section>

        {buildInfo && (
          <Section title="Build Info" theme={theme}>
            <InfoRow data={{ label: 'Version', value: `v${buildInfo.appVersion}` }} theme={theme} />
            <InfoRow data={{ label: 'Build Stamp', value: buildInfo.buildStamp }} theme={theme} />
            <InfoRow data={{ label: 'Commit', value: buildInfo.commitHash }} theme={theme} />
            <InfoRow data={{ label: 'Build Mode', value: buildInfo.buildMode }} theme={theme} />
            <InfoRow data={{ label: 'Source', value: buildInfo.source, highlight: buildInfo.source === 'embedded' }} theme={theme} />
            <InfoRow data={{ label: 'Runtime Version', value: buildInfo.runtimeVersion }} theme={theme} />
            <InfoRow data={{ label: 'Update ID', value: buildInfo.updateId }} theme={theme} />
          </Section>
        )}

        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: theme.success + '20' }]}>
            <Text style={[styles.adminBadgeText, { color: theme.success }]}>
              вњ“ ADMIN PERMISSIONS
            </Text>
          </View>
        )}

        {isModerator && (
          <View style={[styles.modBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.modBadgeText, { color: theme.primary }]}>
              вњ“ MODERATOR PERMISSIONS
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
  },
  refreshBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  refreshBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionContent: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  infoRowHighlight: {
    backgroundColor: 'rgba(46,125,50,0.05)',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },
  adminBadge: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
  },
  adminBadgeText: {
    fontWeight: '700',
    fontSize: 13,
  },
  modBadge: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
  },
  modBadgeText: {
    fontWeight: '700',
    fontSize: 13,
  },
  errorBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '500',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
  },
});

export default AuthDiagnosticScreen;

