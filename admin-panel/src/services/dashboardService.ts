import { get, off, onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
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
  MODERATION_PATHS.datingProfiles,
  MODERATION_PATHS.datingAnketaListings,
  MODERATION_PATHS.coffeeRequests,
  MODERATION_PATHS.buySell,
  MODERATION_PATHS.contactsListings,
  MODERATION_PATHS.localBusiness,
  MODERATION_PATHS.jobs,
  MODERATION_PATHS.lostFound,
  MODERATION_PATHS.osbbNews,
  MODERATION_PATHS.osbbVotes,
  MODERATION_PATHS.osbbHouseTopics,
  MODERATION_PATHS.osbbCollections,
] as const;

const getNumber = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;

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

export const subscribeDashboard = (
  onData: (state: DashboardState) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  let usersTotal = 0;
  let deviceStats = buildDeviceStats(null);
  let moderation = { ...emptyCounter };
  let config: RemoteAppControlConfig | null = null;
  let activities: DashboardActivity[] = [];
  let connected: boolean | null = null;

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

  unsubscribers.push(onValue(ref(database, '.info/connected'), (snapshot) => {
    connected = snapshot.val() === true;
    emit();
  }, (error) => onError?.(error)));

  // Однократное чтение вместо realtime-потока — USERS_PATH слишком тяжёлый для streaming.
  void get(ref(database, USERS_PATH)).then((snapshot) => {
    const raw = snapshot.val();
    usersTotal = raw && typeof raw === 'object' ? Object.keys(raw).length : 0;
    emit();
  }).catch((error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error))));

  unsubscribers.push(onValue(ref(database, SECURITY_AUTHORIZED_DEVICES_PATH), (snapshot) => {
    deviceStats = buildDeviceStats(snapshot.val());
    emit();
  }, (error) => onError?.(error)));

  unsubscribers.push(onValue(ref(database, SECURITY_APP_CONTROL_PATH), (snapshot) => {
    config = normalizeRemoteAppControlConfig(snapshot.val() ?? DEFAULT_REMOTE_APP_CONTROL_CONFIG);
    emit();
  }, (error) => onError?.(error)));

  unsubscribers.push(onValue(ref(database, SECURITY_LOGS_PATH), (snapshot) => {
    activities = flattenLogs(snapshot.val());
    emit();
  }, (error) => onError?.(error)));

  moderationDashboardPaths.forEach((path) => {
    const dataRef = ref(database, path);
    const unsubscribe = onValue(dataRef, (snapshot) => {
      moderationByPath.set(path, countModerationTree(snapshot.val()));
      recomputeModeration();
      emit();
    }, (error) => onError?.(error));
    unsubscribers.push(() => {
      off(dataRef);
      unsubscribe();
    });
  });

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};
