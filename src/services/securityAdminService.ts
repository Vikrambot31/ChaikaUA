import { get, onValue, ref, update } from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import type { AuthorizedDeviceRecord } from './deviceAuth';
import {
  DEFAULT_REMOTE_APP_CONTROL_CONFIG,
  normalizeRemoteAppControlConfig,
  type RemoteAppControlConfig,
} from './securityConfigValidator';
// TZ_3.6 — security_config reads go through the unified service to avoid duplicate onValue
import { subscribeRemoteConfigSnapshot } from './remoteConfig';

export const SECURITY_APP_CONTROL_PATH = 'security_config/app_control/current';
export const SECURITY_AUTHORIZED_DEVICES_PATH = 'authorized_devices';
export const SECURITY_LOGS_PATH = 'security_logs/client_events';
export const USER_UPDATE_LOCKS_PATH = 'user_update_locks';
export const PERSONAL_UPDATE_LOCK_MESSAGE = 'Please update the app to continue using Chaika Life.';

export type ManagedAuthorizedDevice = AuthorizedDeviceRecord & {
  uid: string;
};

export type SecurityLogRecord = {
  id: string;
  partition: string;
  event_type: string;
  created_at: number;
  uid?: string | null;
  device_id?: string | null;
};

export type UserUpdateLockRecord = {
  uid: string;
  required_version: string;
  force_update_required: boolean;
  message: string;
  updated_at: number;
};

type SecurityLogRaw = {
  event_type?: unknown;
  created_at?: unknown;
  uid?: unknown;
  metadata?: {
    device_id?: unknown;
  } | null;
};

const normalizeSecurityFlags = (flags: unknown): string[] =>
  Array.isArray(flags)
    ? flags
      .filter((flag): flag is string => typeof flag === 'string')
      .map((flag) => flag.trim().slice(0, 64))
      .filter(Boolean)
      .slice(0, 20)
    : [];

const normalizeManagedAuthorizedDevice = (
  uid: string,
  deviceId: string,
  value: Partial<AuthorizedDeviceRecord> | null | undefined,
): ManagedAuthorizedDevice | null => {
  if (!value) {
    return null;
  }

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
    security_flags: normalizeSecurityFlags(value.security_flags),
  };
};

const normalizeUserUpdateLock = (
  uid: string,
  value: unknown,
): UserUpdateLockRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as {
    required_version?: unknown;
    force_update_required?: unknown;
    message?: unknown;
    updated_at?: unknown;
  };

  const requiredVersion = typeof raw.required_version === 'string' ? raw.required_version.trim() : '';
  if (!requiredVersion) {
    return null;
  }

  return {
    uid,
    required_version: requiredVersion,
    force_update_required: raw.force_update_required === true,
    message: typeof raw.message === 'string' ? raw.message : '',
    updated_at: Number.isFinite(raw.updated_at) ? Number(raw.updated_at) : 0,
  };
};

export const subscribeSecurityAppControl = (
  onData: (config: RemoteAppControlConfig) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // TZ_3.6 — use the shared subscription from remoteConfig to avoid a second
  // onValue WebSocket listener on the same security_config/app_control/current path.
  return subscribeRemoteConfigSnapshot((snapshot) => {
    if (snapshot.error && onError) {
      onError(new Error(snapshot.error));
    }
    onData(snapshot.config);
  });
};

export const subscribeManagedAuthorizedDevices = (
  onData: (devices: ManagedAuthorizedDevice[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const devicesRef = ref(database, SECURITY_AUTHORIZED_DEVICES_PATH);
  const unsubscribe = onValue(
    devicesRef,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, Record<string, Partial<AuthorizedDeviceRecord>>> | null;
      if (!raw) {
        onData([]);
        return;
      }

      const devices = Object.entries(raw).flatMap(([uid, devicesById]) =>
        Object.entries(devicesById || {}).flatMap(([deviceId, value]) => {
          const normalized = normalizeManagedAuthorizedDevice(uid, deviceId, value);
          return normalized ? [normalized] : [];
        }),
      );

      devices.sort((left, right) => (right.last_seen_at || right.created_at) - (left.last_seen_at || left.created_at));
      onData(devices);
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
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
      const raw = snapshot.val() as Record<string, Record<string, SecurityLogRaw>> | null;
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
      onData(logs.slice(0, 50));
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
    unsubscribe();
  };
};

export const updateSecurityAppControl = async (
  patch: Partial<RemoteAppControlConfig>,
  actorUid: string,
  options?: { forceRefreshOnly?: boolean },
): Promise<{ changed: boolean }> => {
  await ensureFirebaseAuth().catch(() => undefined);
  const snapshot = await get(ref(database, SECURITY_APP_CONTROL_PATH));
  const currentConfig = normalizeRemoteAppControlConfig(snapshot.val() ?? DEFAULT_REMOTE_APP_CONTROL_CONFIG);

  const hasChanges = options?.forceRefreshOnly
    ? true
    : Object.entries(patch).some(([key, value]) => currentConfig[key as keyof RemoteAppControlConfig] !== value);

  if (!hasChanges) {
    return { changed: false };
  }

  // Normalize patch to ensure correct types before writing to Firebase
  // This prevents type mismatches when boolean/string values are incorrectly formatted
  const normalizedPatch: Partial<RemoteAppControlConfig> = {};
  for (const [key, value] of Object.entries(patch)) {
    const k = key as keyof RemoteAppControlConfig;
    switch (k) {
      case 'app_enabled':
      case 'maintenance_mode':
      case 'force_update_required':
      case 'allow_new_devices':
      case 'beta_mode_enabled':
        normalizedPatch[k] = value === true as never;
        break;
      case 'minimum_required_version':
        normalizedPatch[k] = typeof value === 'string' ? (value as never) : (currentConfig[k] as never);
        break;
      case 'maintenance_message':
        normalizedPatch[k] = typeof value === 'string' ? (value as never) : (currentConfig[k] as never);
        break;
      default:
        if (value !== undefined) {
          (normalizedPatch as Record<string, unknown>)[k] = value;
        }
    }
  }

  const writePayload = {
    ...currentConfig,
    ...normalizedPatch,
    updated_at: Date.now(),
    updated_by: actorUid,
    config_version: (currentConfig.config_version || 0) + 1,
  } as Record<string, unknown>;

  // Firebase update() rejects undefined values, so strip them from payload.
  Object.keys(writePayload).forEach((key) => {
    if (writePayload[key] === undefined) {
      delete writePayload[key];
    }
  });

  await update(ref(database, SECURITY_APP_CONTROL_PATH), writePayload);

  return { changed: true };
};

const getValidDeviceRecordForWrite = (
  uid: string,
  deviceId: string,
  value: Partial<AuthorizedDeviceRecord> | null,
): AuthorizedDeviceRecord => {
  const currentDevice = normalizeManagedAuthorizedDevice(uid, deviceId, value);
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

export const updateManagedDeviceStatus = async (
  uid: string,
  deviceId: string,
  patch: Pick<ManagedAuthorizedDevice, 'is_allowed' | 'is_blocked'>,
): Promise<{ changed: boolean }> => {
  await ensureFirebaseAuth().catch(() => undefined);
  const deviceRef = ref(database, `${SECURITY_AUTHORIZED_DEVICES_PATH}/${uid}/${deviceId}`);
  const snapshot = await get(deviceRef);
  const currentValue = snapshot.val() as Partial<AuthorizedDeviceRecord> | null;
  const currentDevice = getValidDeviceRecordForWrite(uid, deviceId, currentValue);

  if (
    currentDevice.is_allowed === patch.is_allowed &&
    currentDevice.is_blocked === patch.is_blocked
  ) {
    return { changed: false };
  }

  await update(deviceRef, {
    ...patch,
  });
  return { changed: true };
};

export const subscribeCurrentUserUpdateLock = (
  uid: string,
  onData: (lock: UserUpdateLockRecord | null) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const lockRef = ref(database, `${USER_UPDATE_LOCKS_PATH}/${uid}`);
  const unsubscribe = onValue(
    lockRef,
    (snapshot) => {
      onData(normalizeUserUpdateLock(uid, snapshot.val()));
    },
    (error) => {
      onError?.(error);
    },
  );

  return () => {
    unsubscribe();
  };
};
