import { get, limitToLast, off, onValue, orderByChild, equalTo, query, ref } from 'firebase/database';
import { database, firebaseConfig } from '../firebase/firebase';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';
import { probeRulesLevel } from './rulesProbeService';
import {
  MODERATION_PATHS,
  SECURITY_APP_CONTROL_PATH,
  SECURITY_AUTHORIZED_DEVICES_PATH,
  SECURITY_LOGS_PATH,
  USERS_PATH,
} from './securityPaths';
import {
  DEFAULT_REMOTE_APP_CONTROL_CONFIG,
  normalizeRemoteAppControlConfig,
  type RemoteAppControlConfig,
} from './securityService';

export type DashboardStats = {
  usersTotal: number;
  devicesTotal: number;
  onlineDevices: number;
  blockedDevices: number;
  newDevices24h: number;
  moderationTotal: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  activeUsersToday: number;
  permissionDenied24h: number;
  activeSubscriptions: number;
  pendingPhotos: number;
  pendingInviteRequests: number;
  moderationAvgHours: number;
  rulesEnforcementLevel: 'OPEN' | 'PARTIAL' | 'SECURE' | 'UNKNOWN';
  rulesOpenPaths: string[];
  rulesCheckedAt: number;
  pendingReports: number;
};

export type DashboardActivity = {
  id: string;
  time: number;
  email: string;
  action: string;
  deviceId: string;
};

export type DashboardIssue = {
  id: string;
  title: string;
  detail: string;
};

export type DashboardState = {
  stats: DashboardStats;
  config: RemoteAppControlConfig | null;
  activities: DashboardActivity[];
  issues: DashboardIssue[];
  connected: boolean | null;
};

type RawDevice = {
  created_at?: unknown;
  last_seen_at?: unknown;
  is_blocked?: unknown;
  is_allowed?: unknown;
  security_flags?: unknown;
};

type ModerationCounter = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
};

type RawSecurityLog = {
  event_type?: unknown;
  created_at?: unknown;
  uid?: unknown;
  metadata?: {
    device_id?: unknown;
  } | null;
};

type RawOpsError = {
  type?: unknown;
  code?: unknown;
  message?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  timestamp?: unknown;
  at?: unknown;
};

const emptyStats: DashboardStats = {
  usersTotal: 0,
  devicesTotal: 0,
  onlineDevices: 0,
  blockedDevices: 0,
  newDevices24h: 0,
  moderationTotal: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
  activeUsersToday: 0,
  permissionDenied24h: 0,
  activeSubscriptions: 0,
  pendingPhotos: 0,
  pendingInviteRequests: 0,
  moderationAvgHours: 0,
  rulesEnforcementLevel: 'UNKNOWN',
  rulesOpenPaths: [],
  rulesCheckedAt: 0,
  pendingReports: 0,
};

const emptyCounter: ModerationCounter = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
};

const moderationDashboardPaths = [
  MODERATION_PATHS.requests,
  MODERATION_PATHS.appSuggestions,
  MODERATION_PATHS.communityPhotos,
  MODERATION_PATHS.buySell,
  MODERATION_PATHS.contactsListings,
  MODERATION_PATHS.biznesChaikaListings,
  MODERATION_PATHS.localBusiness,
  MODERATION_PATHS.jobs,
  MODERATION_PATHS.lostFound,
  MODERATION_PATHS.osbbNews,
  MODERATION_PATHS.osbbVotes,
  MODERATION_PATHS.osbbHouseTopics,
  MODERATION_PATHS.osbbCollections,
] as const;

const getNumber = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;

const getTime = (value: Record<string, unknown>): number =>
  getNumber(value.createdAt) ||
  getNumber(value.created_at) ||
  getNumber(value.timestamp) ||
  getNumber(value.at) ||
  Date.parse(String(value.createdAt ?? value.timestamp ?? '')) ||
  0;


const getModerationStatus = (value: Record<string, unknown>): 'pending' | 'approved' | 'rejected' | 'expired' => {
  const raw = value.moderationStatus ?? value.status;
  if (raw === 'approved' || raw === 'active') return 'approved';
  if (raw === 'rejected') return 'rejected';
  if (raw === 'expired') return 'expired';
  return 'pending';
};

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'expired'] as const);

const countModerationRecord = (counter: ModerationCounter, value: Record<string, unknown>) => {
  const status = getModerationStatus(value);
  counter.total += 1;
  if (VALID_STATUSES.has(status)) {
    counter[status] += 1;
  }
};

const countModerationTree = (raw: unknown): ModerationCounter => {
  const counter = { ...emptyCounter };
  if (!raw || typeof raw !== 'object') return counter;

  Object.values(raw as Record<string, unknown>).forEach((value) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;

    if ('moderationStatus' in record || 'status' in record) {
      countModerationRecord(counter, record);
      return;
    }

    Object.values(record).forEach((nested) => {
      if (nested && typeof nested === 'object') {
        countModerationRecord(counter, nested as Record<string, unknown>);
      }
    });
  });

  return counter;
};

const flattenDevices = (raw: unknown): Array<{ uid: string; id: string; value: RawDevice }> => {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, Record<string, RawDevice>>).flatMap(([uid, devices]) =>
    Object.entries(devices || {}).map(([id, value]) => ({ uid, id, value })),
  );
};

const buildDeviceStats = (raw: unknown): Pick<DashboardStats, 'devicesTotal' | 'onlineDevices' | 'blockedDevices' | 'newDevices24h'> & {
  deviceIssues: DashboardIssue[];
} => {
  const devices = flattenDevices(raw);
  const now = Date.now();
  const onlineThreshold = now - 15 * 60 * 1000;
  const newThreshold = now - 24 * 60 * 60 * 1000;
  const blocked = devices.filter((device) => device.value.is_blocked === true);
  const denied = devices.filter((device) => device.value.is_allowed === false && device.value.is_blocked !== true);
  const flagged = devices.filter((device) => Array.isArray(device.value.security_flags) && device.value.security_flags.length > 0);

  const deviceIssues: DashboardIssue[] = [];
  if (denied.length) {
    deviceIssues.push({ id: 'denied_devices', title: 'Denied devices', detail: `${denied.length} devices are waiting or denied.` });
  }
  if (blocked.length) {
    deviceIssues.push({ id: 'blocked_devices', title: 'Blocked devices', detail: `${blocked.length} blocked devices exist.` });
  }
  if (flagged.length) {
    deviceIssues.push({ id: 'device_flags', title: 'Devices with errors', detail: `${flagged.length} devices have security flags.` });
  }

  return {
    devicesTotal: devices.length,
    onlineDevices: devices.filter((device) => getNumber(device.value.last_seen_at) >= onlineThreshold && device.value.is_blocked !== true).length,
    blockedDevices: blocked.length,
    newDevices24h: devices.filter((device) => getNumber(device.value.created_at) >= newThreshold).length,
    deviceIssues,
  };
};

const flattenLogs = (raw: unknown): DashboardActivity[] => {
  if (!raw || typeof raw !== 'object') return [];

  return Object.entries(raw as Record<string, Record<string, RawSecurityLog>>).flatMap(([partition, logsById]) =>
    Object.entries(logsById || {}).map(([id, log]) => ({
      id: `${partition}:${id}`,
      time: getNumber(log.created_at),
      email: typeof log.uid === 'string' ? log.uid : '',
      action: typeof log.event_type === 'string' ? log.event_type : 'security_event',
      deviceId: typeof log.metadata?.device_id === 'string' ? log.metadata.device_id : '',
    })),
  ).sort((left, right) => right.time - left.time).slice(0, 12);
};

const countActiveUsersToday = (raw: unknown): number => {
  if (!raw || typeof raw !== 'object') return 0;
  const today = Date.now() - 24 * 60 * 60 * 1000;
  return Object.values(raw as Record<string, Record<string, unknown>>).filter((user) => {
    const lastActive = getNumber(user.lastActiveAt) || getNumber(user.last_active_at) || getNumber(user.lastSeenAt);
    return lastActive >= today;
  }).length;
};

const isPermissionDeniedError = (error: RawOpsError): boolean => {
  const text = `${String(error.type ?? '')} ${String(error.code ?? '')} ${String(error.message ?? '')}`.toLowerCase();
  return text.includes('permission_denied') || text.includes('permission-denied');
};

const countPermissionDenied24h = (raw: unknown): number => {
  if (!raw || typeof raw !== 'object') return 0;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return Object.values(raw as Record<string, RawOpsError>).filter((error) => {
    const timestamp = getTime(error as Record<string, unknown>);
    return timestamp >= since && isPermissionDeniedError(error);
  }).length;
};

export type PermissionDeniedEntry = {
  id: string;
  at: number;
  screen: string;
  action: string;
  firebasePath: string;
  feature: string;
  stage: string;
  code: string;
  firebaseCode: string;
  uid: string;
  sessionId: string;
  appVersion: string;
  networkState: string;
  deviceInfo: string;
  androidVersion: string;
  appMode: string;
  severity: 'info' | 'warning' | 'critical';
  humanMessage: string;
  rawMessage: string;
  source: string;
  repeatCount: number;
  slowOp: boolean;
  durationMs: number | undefined;
  breadcrumbs: Array<{ at: number; category: string; message: string; screen?: string }>;
};

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');
const getNum = (v: unknown): number => (Number.isFinite(v) ? Number(v) : 0);

const isPermissionDeniedText = (text: string): boolean =>
  text.includes('permission_denied') || text.includes('permission-denied') || text.includes('permission denied');

const normalizeRichEntry = (id: string, raw: Record<string, unknown>): PermissionDeniedEntry | null => {
  // diagnostics/runtime_moderation wrapper: { fingerprint, uid, submittedAt, entry: {...}, reporter: {...} }
  const entryRaw = raw.entry && typeof raw.entry === 'object'
    ? (raw.entry as Record<string, unknown>)
    : raw; // flat structure from diagnostics/runtime or ops/errors

  const at = getNum(raw.submittedAt) || getNum(entryRaw.at) || getNum(raw.at);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (at < since) return null;

  const allText = [
    getString(entryRaw.rawMessage), getString(entryRaw.humanMessage),
    getString(entryRaw.code), getString(entryRaw.firebaseCode),
    getString(entryRaw.message), getString(entryRaw.type),
  ].join(' ').toLowerCase();

  if (!isPermissionDeniedText(allText)) return null;

  const reporter = raw.reporter && typeof raw.reporter === 'object'
    ? (raw.reporter as Record<string, unknown>) : {};

  const breadcrumbsRaw = Array.isArray(entryRaw.breadcrumbs) ? entryRaw.breadcrumbs : [];
  const breadcrumbs = breadcrumbsRaw
    .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
    .map((b) => ({
      at: getNum(b.at),
      category: getString(b.category) || 'runtime',
      message: getString(b.message),
      screen: typeof b.screen === 'string' ? b.screen : undefined,
    }));

  return {
    id,
    at,
    screen: getString(entryRaw.screen) || getString(entryRaw.functionName) || '-',
    action: getString(entryRaw.action) || '-',
    firebasePath: getString(entryRaw.firebasePath) || '-',
    feature: getString(entryRaw.feature) || '-',
    stage: getString(entryRaw.stage) || '-',
    code: getString(entryRaw.code) || getString(entryRaw.type) || '-',
    firebaseCode: getString(entryRaw.firebaseCode) || '-',
    uid: getString(raw.uid) || getString(reporter.userId) || getString(entryRaw.uid) || '-',
    sessionId: getString(entryRaw.sessionId) || getString(raw.sessionId) || '-',
    appVersion: getString(entryRaw.appVersion) || getString(raw.appVersion) || '-',
    networkState: getString(entryRaw.networkState) || '-',
    deviceInfo: getString(entryRaw.deviceInfo) || '-',
    androidVersion: getString(entryRaw.androidVersion) || '-',
    appMode: getString(entryRaw.appMode) || '-',
    severity: (entryRaw.severity === 'critical' || entryRaw.severity === 'warning' ? entryRaw.severity : 'info') as 'info' | 'warning' | 'critical',
    humanMessage: getString(entryRaw.humanMessage) || getString(entryRaw.message) || '-',
    rawMessage: getString(entryRaw.rawMessage) || getString(entryRaw.message) || '-',
    source: getString(entryRaw.source) || getString(raw.source) || 'client',
    repeatCount: getNum(entryRaw.repeatCount) || 1,
    slowOp: entryRaw.slowOp === true,
    durationMs: typeof entryRaw.durationMs === 'number' ? entryRaw.durationMs : undefined,
    breadcrumbs,
  };
};

export const fetchPermissionDeniedDetails = async (): Promise<PermissionDeniedEntry[]> => {
  const [richSnapshot, opsSnapshot] = await Promise.all([
    get(query(ref(database, 'diagnostics/runtime_moderation'), limitToLast(300))).catch(() => null),
    get(query(ref(database, 'ops/errors'), limitToLast(300))).catch(() => null),
  ]);

  const seen = new Set<string>();
  const results: PermissionDeniedEntry[] = [];

  // Primary: diagnostics/runtime_moderation (rich data with uid, breadcrumbs, etc.)
  const richRaw = richSnapshot?.val();
  if (richRaw && typeof richRaw === 'object') {
    for (const [id, value] of Object.entries(richRaw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = normalizeRichEntry(id, value as Record<string, unknown>);
      if (entry) { results.push(entry); seen.add(id); }
    }
  }

  // Fallback: ops/errors (basic data, catches anything not in runtime_moderation)
  const opsRaw = opsSnapshot?.val();
  if (opsRaw && typeof opsRaw === 'object') {
    for (const [id, value] of Object.entries(opsRaw as Record<string, unknown>)) {
      if (seen.has(id) || !value || typeof value !== 'object') continue;
      const entry = normalizeRichEntry(id, value as Record<string, unknown>);
      if (entry) results.push(entry);
    }
  }

  return results.sort((a, b) => b.at - a.at);
};

const getQueueNumber = (raw: unknown, keys: string[]): number => {
  if (!raw || typeof raw !== 'object') return 0;
  const value = raw as Record<string, unknown>;
  for (const key of keys) {
    const direct = getNumber(value[key]);
    if (direct) return direct;
  }
  return 0;
};

// ─── LOCAL_MODE: загрузка данных из localhost:3001 ───────────────────────────
const subscribeDashboardLocal = (
  onData: (state: DashboardState) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  let cancelled = false;

  const load = async () => {
    try {
      const [users, photos, helpRequests, announcements, lostFound, config] = await Promise.all([
        fetch(`${LOCAL_API}/users`).then(r => r.json()) as Promise<unknown[]>,
        fetch(`${LOCAL_API}/photos`).then(r => r.json()) as Promise<Array<{ status: string }>>,
        fetch(`${LOCAL_API}/helpRequests`).then(r => r.json()) as Promise<unknown[]>,
        fetch(`${LOCAL_API}/announcements`).then(r => r.json()) as Promise<unknown[]>,
        fetch(`${LOCAL_API}/lostFound`).then(r => r.json()) as Promise<unknown[]>,
        fetch(`${LOCAL_API}/config`).then(r => r.json()) as Promise<Record<string, unknown>>,
      ]);

      if (cancelled) return;

      const allModerationItems = [...photos, ...helpRequests, ...announcements, ...lostFound] as Array<{ status: string }>;
      const pending = allModerationItems.filter(i => i.status === 'pending').length;
      const approved = allModerationItems.filter(i => i.status === 'approved').length;
      const rejected = allModerationItems.filter(i => i.status === 'rejected').length;

      const issues: DashboardIssue[] = [];
      if (config.maintenanceMode) {
        issues.push({ id: 'maintenance', title: 'Maintenance mode', detail: 'Режим обслуживания включён.' });
      }
      if (config.appEnabled === false) {
        issues.push({ id: 'app_disabled', title: 'App disabled', detail: 'Приложение отключено.' });
      }
      if (pending > 5) {
        issues.push({ id: 'pending_mod', title: 'Ожидают модерации', detail: `${pending} элементов ждут проверки.` });
      }

      onData({
        connected: true,
        config: {
          app_enabled: Boolean(config.appEnabled),
          maintenance_mode: Boolean(config.maintenanceMode),
          invite_access_enabled: Boolean(config.inviteAccessEnabled),
          min_app_version: String(config.minAppVersion ?? '0.0.1'),
          latest_version: String(config.latestVersion ?? '1.0.0-local'),
        } as unknown as import('./securityService').RemoteAppControlConfig,
        activities: [],
        stats: {
          usersTotal: users.length,
          devicesTotal: 0,
          onlineDevices: 0,
          blockedDevices: 0,
          newDevices24h: 0,
          moderationTotal: allModerationItems.length,
          pending,
          approved,
          rejected,
          expired: 0,
          activeUsersToday: users.length,
          permissionDenied24h: 0,
          activeSubscriptions: 0,
          pendingPhotos: photos.filter((item) => item.status === 'pending').length,
          pendingInviteRequests: 0,
          moderationAvgHours: 0,
          rulesEnforcementLevel: 'UNKNOWN',
          rulesOpenPaths: [],
          rulesCheckedAt: 0,
          pendingReports: 0,
        },
        issues,
      });
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  void load();
  const timer = setInterval(() => { void load(); }, 5000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
};
// ─────────────────────────────────────────────────────────────────────────────

export const subscribeDashboard = LOCAL_MODE
  ? subscribeDashboardLocal
  : (
  onData: (state: DashboardState) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  let usersTotal = 0;
  let deviceStats = buildDeviceStats(null);
  let moderation = { ...emptyCounter };
  let config: RemoteAppControlConfig | null = null;
  let activities: DashboardActivity[] = [];
  let connected: boolean | null = null;
  let activeUsersToday = 0;
  let permissionDenied24h = 0;
  let activeSubscriptions = 0;
  let pendingPhotos = 0;
  let pendingInviteRequests = 0;
  let moderationAvgHours = 0;
  let rulesEnforcementLevel: DashboardStats['rulesEnforcementLevel'] = 'UNKNOWN';
  let rulesOpenPaths: string[] = [];
  let rulesCheckedAt = 0;
  let pendingReports = 0;

  const moderationByPath = new Map<string, ModerationCounter>();

  const emit = () => {
    const pendingOverflow = moderation.pending > 50
      ? [{ id: 'pending_overflow', title: 'Pending moderation overflow', detail: `${moderation.pending} pending items need review.` }]
      : [];

    const systemIssues: DashboardIssue[] = [];
    if (config?.maintenance_mode) {
      systemIssues.push({ id: 'maintenance', title: 'Maintenance mode', detail: 'Application maintenance mode is active.' });
    }
    if (config?.app_enabled === false) {
      systemIssues.push({ id: 'app_disabled', title: 'App disabled', detail: 'Application access is disabled.' });
    }

    onData({
      connected,
      config,
      activities,
      stats: {
        ...emptyStats,
        usersTotal,
        devicesTotal: deviceStats.devicesTotal,
        onlineDevices: deviceStats.onlineDevices,
        blockedDevices: deviceStats.blockedDevices,
        newDevices24h: deviceStats.newDevices24h,
        moderationTotal: moderation.total,
        pending: moderation.pending,
        approved: moderation.approved,
        rejected: moderation.rejected,
        expired: moderation.expired,
        activeUsersToday,
        permissionDenied24h,
        activeSubscriptions,
        pendingPhotos,
        pendingInviteRequests,
        moderationAvgHours,
        rulesEnforcementLevel,
        rulesOpenPaths,
        rulesCheckedAt,
        pendingReports,
      },
      issues: [...systemIssues, ...deviceStats.deviceIssues, ...pendingOverflow],
    });
  };

  const recomputeModeration = () => {
    moderation = Array.from(moderationByPath.values()).reduce(
      (acc, item) => ({
        total: acc.total + item.total,
        pending: acc.pending + item.pending,
        approved: acc.approved + item.approved,
        rejected: acc.rejected + item.rejected,
        expired: acc.expired + item.expired,
      }),
      { ...emptyCounter },
    );
  };

  const unsubscribers: Array<() => void> = [];

  const isPermissionDenied = (error: Error): boolean =>
    error.message.toLowerCase().includes('permission_denied') ||
    error.message.toLowerCase().includes('permission denied');

  const silentOnPermDenied = (fallback: () => void) => (error: Error) => {
    if (isPermissionDenied(error)) { fallback(); return; }
    onError?.(error);
  };

  unsubscribers.push(onValue(ref(database, '.info/connected'), (snapshot) => {
    connected = snapshot.val() === true;
    emit();
  }, (error) => onError?.(error)));

  // Однократное чтение вместо realtime-потока — USERS_PATH слишком тяжёлый для streaming.
  void get(ref(database, USERS_PATH)).then((snapshot) => {
    const raw = snapshot.val();
    usersTotal = raw && typeof raw === 'object' ? Object.keys(raw).length : 0;
    activeUsersToday = countActiveUsersToday(raw);
    emit();
  }).catch((error: unknown) => {
    if (error instanceof Error && isPermissionDenied(error)) { emit(); return; }
    onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  unsubscribers.push(onValue(ref(database, SECURITY_AUTHORIZED_DEVICES_PATH), (snapshot) => {
    deviceStats = buildDeviceStats(snapshot.val());
    emit();
  }, silentOnPermDenied(emit)));

  unsubscribers.push(onValue(ref(database, SECURITY_APP_CONTROL_PATH), (snapshot) => {
    config = normalizeRemoteAppControlConfig(snapshot.val() ?? DEFAULT_REMOTE_APP_CONTROL_CONFIG);
    emit();
  }, silentOnPermDenied(emit)));

  // Реальна перевірка: анонімний HTTP-запит до RTDB REST API.
  // Результат кешується в sessionStorage — повторні запити не робляться.
  const SESSION_KEY = 'rulesProbeResult';
  const runRulesProbe = () => {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { level: string; openPaths: string[]; checkedAt: number };
        rulesEnforcementLevel = parsed.level === 'OPEN' ? 'OPEN'
          : parsed.level === 'PARTIAL' ? 'PARTIAL'
          : parsed.level === 'SECURE' ? 'SECURE'
          : 'UNKNOWN';
        rulesOpenPaths = parsed.openPaths ?? [];
        rulesCheckedAt = parsed.checkedAt ?? 0;
        emit();
        return;
      } catch { /* ignore parse error, re-probe */ }
    }
    void probeRulesLevel(firebaseConfig.databaseURL ?? '').then((result) => {
      rulesEnforcementLevel = result.level === 'OPEN' ? 'OPEN'
        : result.level === 'PARTIAL' ? 'PARTIAL'
        : result.level === 'SECURE' ? 'SECURE'
        : 'UNKNOWN';
      rulesOpenPaths = result.openPaths;
      rulesCheckedAt = result.checkedAt;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ level: rulesEnforcementLevel, openPaths: rulesOpenPaths, checkedAt: rulesCheckedAt }));
      emit();
    });
  };
  runRulesProbe();
  // Перевіряємо раз на 30 хвилин — тільки якщо кеш застарів
  const rulesProbeInterval = setInterval(() => {
    sessionStorage.removeItem(SESSION_KEY);
    runRulesProbe();
  }, 30 * 60 * 1000);
  unsubscribers.push(() => clearInterval(rulesProbeInterval));

  unsubscribers.push(onValue(ref(database, SECURITY_LOGS_PATH), (snapshot) => {
    activities = flattenLogs(snapshot.val());
    emit();
  }, silentOnPermDenied(emit)));

  // orderByChild('timestamp') removed — path may not have the index; client-side filtering is sufficient
  unsubscribers.push(onValue(query(ref(database, 'ops/errors'), limitToLast(300)), (snapshot) => {
    permissionDenied24h = countPermissionDenied24h(snapshot.val());
    emit();
  }, silentOnPermDenied(emit)));

  unsubscribers.push(onValue(ref(database, 'ops/subscriptions/active_count'), (snapshot) => {
    activeSubscriptions = getNumber(snapshot.val());
    emit();
  }, silentOnPermDenied(emit)));

  unsubscribers.push(onValue(ref(database, 'stats/moderation_queue_counts'), (snapshot) => {
    const raw = snapshot.val();
    pendingPhotos = getQueueNumber(raw, ['pendingPhotos', 'photos', 'communityPhotos', 'pending_photos']);
    pendingInviteRequests = getQueueNumber(raw, ['pendingInviteRequests', 'inviteRequests', 'invite_requests', 'pending_invites']);
    emit();
  }, silentOnPermDenied(emit)));

  unsubscribers.push(onValue(ref(database, 'stats/moderation_avg_hours'), (snapshot) => {
    moderationAvgHours = getNumber(snapshot.val());
    emit();
  }, silentOnPermDenied(emit)));

  // Pending reports count (one-shot, не realtime — reports меняются редко)
  void get(query(ref(database, 'reports'), orderByChild('status'), equalTo('pending'))).then((snap) => {
    pendingReports = snap.exists() ? Object.keys(snap.val() as Record<string, unknown>).length : 0;
    emit();
  }).catch((error: unknown) => {
    if (error instanceof Error && isPermissionDenied(error)) { emit(); return; }
  });

  moderationDashboardPaths.forEach((path) => {
    const dataRef = ref(database, path);
    const unsubscribe = onValue(dataRef, (snapshot) => {
      moderationByPath.set(path, countModerationTree(snapshot.val()));
      recomputeModeration();
      emit();
    }, silentOnPermDenied(() => { moderationByPath.set(path, { ...emptyCounter }); recomputeModeration(); emit(); }));
    unsubscribers.push(() => {
      off(dataRef);
      unsubscribe();
    });
  });

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};
