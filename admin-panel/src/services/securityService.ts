import { get, off, onValue, ref, remove, set, update } from 'firebase/database';
import { database } from '../firebase/firebase';
import {
  SECURITY_APP_CONTROL_PATH,
  SECURITY_AUTHORIZED_DEVICES_PATH,
  SECURITY_LOGS_PATH,
  USERS_PATH,
} from './securityPaths';

export type RemoteAppControlConfig = {
  app_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  minimum_required_version: string;
  force_update_required: boolean;
  allow_new_devices: boolean;
  beta_mode_enabled: boolean;
  config_version: number;
  updated_at: number;
  updated_by?: string;
  signature?: string;
};

export type ManagedAuthorizedDevice = {
  uid: string;
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string;
  created_at: number;
  last_seen_at: number;
  is_allowed: boolean;
  is_blocked: boolean;
  security_flags: string[];
  email?: string;
};

export type SecurityLogRecord = {
  id: string;
  partition: string;
  event_type: string;
  created_at: number;
  uid?: string | null;
  device_id?: string | null;
};

type RawDevice = Partial<Omit<ManagedAuthorizedDevice, 'uid' | 'email'>>;

type RawUser = {
  email?: unknown;
  name?: unknown;
};

type RawSecurityLog = {
  event_type?: unknown;
  created_at?: unknown;
  uid?: unknown;
  metadata?: {
    device_id?: unknown;
  } | null;
};

export const DEFAULT_REMOTE_APP_CONTROL_CONFIG: RemoteAppControlConfig = {
  app_enabled: true,
  maintenance_mode: false,
  maintenance_message: '',
  minimum_required_version: '0.0.0',
  force_update_required: false,
  allow_new_devices: true,
  beta_mode_enabled: false,
  config_version: 1,
  updated_at: 0,
};
const MAX_FEED_ITEMS = 50;

const normalizeVersion = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_REMOTE_APP_CONTROL_CONFIG.minimum_required_version;
  const trimmed = value.trim();
  return /^[0-9]+(\.[0-9A-Za-z-]+)*$/.test(trimmed)
    ? trimmed
    : DEFAULT_REMOTE_APP_CONTROL_CONFIG.minimum_required_version;
};

const normalizeMessage = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, 280) : '';

export const normalizeRemoteAppControlConfig = (value: unknown): RemoteAppControlConfig => {
  const raw = (value as Partial<RemoteAppControlConfig> | null) ?? {};
  return {
    app_enabled: raw.app_enabled !== false,
    maintenance_mode: raw.maintenance_mode === true,
    maintenance_message: normalizeMessage(raw.maintenance_message),
    minimum_required_version: normalizeVersion(raw.minimum_required_version),
    force_update_required: raw.force_update_required === true,
    allow_new_devices: raw.allow_new_devices !== false,
    beta_mode_enabled: raw.beta_mode_enabled === true,
    config_version: Number.isFinite(raw.config_version) ? Number(raw.config_version) : 1,
    updated_at: Number.isFinite(raw.updated_at) ? Number(raw.updated_at) : 0,
    updated_by: typeof raw.updated_by === 'string' ? raw.updated_by.slice(0, 120) : undefined,
    signature: typeof raw.signature === 'string' ? raw.signature.slice(0, 512) : undefined,
  };
};

const normalizeDevice = (
  uid: string,
  deviceId: string,
  value: RawDevice | null | undefined,
  email?: string,
): ManagedAuthorizedDevice | null => {
  if (!value) return null;
  return {
    uid,
    device_id: typeof value.device_id === 'string' ? value.device_id : deviceId,
    device_name: typeof value.device_name === 'string' ? value.device_name : '',
    platform: typeof value.platform === 'string' ? value.platform : '',
    app_version: typeof value.app_version === 'string' ? value.app_version : '',
    created_at: Number.isFinite(value.created_at) ? Number(value.created_at) : 0,
    last_seen_at: Number.isFinite(value.last_seen_at) ? Number(value.last_seen_at) : 0,
    is_allowed: value.is_allowed === true,
    is_blocked: value.is_blocked === true,
    security_flags: Array.isArray(value.security_flags)
      ? value.security_flags.filter((flag): flag is string => typeof flag === 'string').slice(0, 20)
      : [],
    email,
  };
};

const getDeviceActivityTimestamp = (device: ManagedAuthorizedDevice): number =>
  device.last_seen_at || device.created_at || 0;

const dedupeDevicesByLatestActivity = (
  devices: ManagedAuthorizedDevice[],
): ManagedAuthorizedDevice[] => {
  const latestByDevice = new Map<string, ManagedAuthorizedDevice>();

  devices.forEach((device) => {
    const dedupeKey = `${device.uid}:${device.device_id}`;
    const current = latestByDevice.get(dedupeKey);
    if (!current || getDeviceActivityTimestamp(device) > getDeviceActivityTimestamp(current)) {
      latestByDevice.set(dedupeKey, device);
    }
  });

  return Array.from(latestByDevice.values());
};

const getValidDeviceRecordForWrite = (
  uid: string,
  deviceId: string,
  value: RawDevice | null,
): Omit<ManagedAuthorizedDevice, 'uid' | 'email'> => {
  const currentDevice = normalizeDevice(uid, deviceId, value);
  const now = Date.now();
  return {
    device_id: deviceId,
    device_name: currentDevice?.device_name?.trim() || 'Unknown device',
    platform: currentDevice?.platform && currentDevice.platform.length >= 2 ? currentDevice.platform : 'unknown',
    app_version: currentDevice?.app_version ?? '',
    created_at: currentDevice?.created_at || now,
    last_seen_at: currentDevice?.last_seen_at || now,
    is_allowed: currentDevice?.is_allowed === true,
    is_blocked: currentDevice?.is_blocked === true,
    security_flags: currentDevice?.security_flags ?? [],
  };
};

const readUserEmails = async (): Promise<Record<string, string>> => {
  const snapshot = await get(ref(database, USERS_PATH));
  const raw = snapshot.val() as Record<string, RawUser> | null;
  if (!raw) return {};

  return Object.fromEntries(
    Object.entries(raw).map(([uid, user]) => [
      uid,
      typeof user?.email === 'string' ? user.email : typeof user?.name === 'string' ? user.name : '',
    ]),
  );
};

export const subscribeSecurityAppControl = (
  onData: (config: RemoteAppControlConfig) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const appControlRef = ref(database, SECURITY_APP_CONTROL_PATH);
  return onValue(
    appControlRef,
    (snapshot) => onData(normalizeRemoteAppControlConfig(snapshot.val() ?? DEFAULT_REMOTE_APP_CONTROL_CONFIG)),
    (error) => onError?.(error),
  );
};

export const subscribeManagedAuthorizedDevices = (
  onData: (devices: ManagedAuthorizedDevice[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const devicesRef = ref(database, SECURITY_AUTHORIZED_DEVICES_PATH);
  const unsubscribe = onValue(
    devicesRef,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, Record<string, RawDevice>> | null;
      if (!raw) {
        onData([]);
        return;
      }

      void readUserEmails()
        .then((emails) => {
          const devices = Object.entries(raw).flatMap(([uid, devicesById]) =>
            Object.entries(devicesById || {}).flatMap(([deviceId, value]) => {
              const normalized = normalizeDevice(uid, deviceId, value, emails[uid]);
              return normalized ? [normalized] : [];
            }),
          );

          const dedupedDevices = dedupeDevicesByLatestActivity(devices);
          dedupedDevices.sort((left, right) => getDeviceActivityTimestamp(right) - getDeviceActivityTimestamp(left));
          onData(dedupedDevices);
        })
        .catch((error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error))));
    },
    (error) => onError?.(error),
  );

  return () => {
    off(devicesRef);
    unsubscribe();
  };
};

export const subscribeSecurityLogs = (
  onData: (logs: SecurityLogRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const logsRef = ref(database, SECURITY_LOGS_PATH);
  const unsubscribe = onValue(
    logsRef,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, Record<string, RawSecurityLog>> | null;
      if (!raw) {
        onData([]);
        return;
      }

      const logs = Object.entries(raw).flatMap(([partition, logsById]) =>
        Object.entries(logsById || {}).map(([id, value]) => ({
          id,
          partition,
          event_type: typeof value?.event_type === 'string' ? value.event_type : 'unknown',
          created_at: Number.isFinite(value?.created_at) ? Number(value.created_at) : 0,
          uid: typeof value?.uid === 'string' ? value.uid : null,
          device_id: typeof value?.metadata?.device_id === 'string' ? value.metadata.device_id : null,
        })),
      );

      logs.sort((left, right) => right.created_at - left.created_at);
      const staleLogs = logs.slice(MAX_FEED_ITEMS);
      if (staleLogs.length) {
        void Promise.allSettled(
          staleLogs.map((log) => remove(ref(database, `${SECURITY_LOGS_PATH}/${log.partition}/${log.id}`))),
        );
      }

      onData(logs.slice(0, MAX_FEED_ITEMS));
    },
    (error) => onError?.(error),
  );

  return () => {
    off(logsRef);
    unsubscribe();
  };
};

export const updateSecurityAppControl = async (
  patch: Partial<RemoteAppControlConfig>,
  actorUid: string,
): Promise<{ changed: boolean }> => {
  const snapshot = await get(ref(database, SECURITY_APP_CONTROL_PATH));
  const currentConfig = normalizeRemoteAppControlConfig(snapshot.val() ?? DEFAULT_REMOTE_APP_CONTROL_CONFIG);
  const hasChanges = Object.entries(patch).some(([key, value]) => currentConfig[key as keyof RemoteAppControlConfig] !== value);

  if (!hasChanges) return { changed: false };

  const writePayload: Record<string, unknown> = {
    ...currentConfig,
    ...patch,
    updated_at: Date.now(),
    updated_by: actorUid,
    config_version: (currentConfig.config_version || 0) + 1,
  };

  Object.keys(writePayload).forEach((key) => {
    if (writePayload[key] === undefined) delete writePayload[key];
  });

  await update(ref(database, SECURITY_APP_CONTROL_PATH), writePayload);
  return { changed: true };
};

export const updateManagedDeviceStatus = async (
  uid: string,
  deviceId: string,
  patch: Pick<ManagedAuthorizedDevice, 'is_allowed' | 'is_blocked'>,
): Promise<{ changed: boolean }> => {
  const deviceRef = ref(database, `${SECURITY_AUTHORIZED_DEVICES_PATH}/${uid}/${deviceId}`);
  const snapshot = await get(deviceRef);
  const currentValue = snapshot.val() as RawDevice | null;
  const currentDevice = getValidDeviceRecordForWrite(uid, deviceId, currentValue);

  if (
    currentDevice.is_allowed === patch.is_allowed &&
    currentDevice.is_blocked === patch.is_blocked
  ) {
    return { changed: false };
  }

  await set(deviceRef, {
    ...currentDevice,
    ...patch,
  });
  return { changed: true };
};
