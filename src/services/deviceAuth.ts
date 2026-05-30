import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { get, off, onValue, ref, set, update } from 'firebase/database';
import { Platform } from 'react-native';
import { auth, database } from '../firebase-core';
import { getCurrentAppVersion } from './appVersion';
import { logSecurityAuditEvent } from './securityAuditLogger';
import { secureGet, secureRemove, secureSet } from '../utils/secureStorage';
import { logClientError, logClientEvent } from '../utils/errorLogger';

const AUTHORIZED_DEVICES_PATH = 'authorized_devices';
const DEVICE_ID_STORAGE_KEY = '@chaika:device_id_v1';
const LAST_SEEN_CACHE_PREFIX = '@chaika:device_last_seen:';
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const DEVICE_AUTH_RETRY_DELAY_MS = 700;
const SECURE_STORE_IO_TIMEOUT_MS = 2500;
const MAX_DEVICE_SYNC_FAILURES_PER_SESSION = 5;
const DEVICE_SYNC_FAILURE_COOLDOWN_MS = 30 * 1000;
const MAX_DEVICE_SYNC_ERROR_LOGS_PER_SESSION = 3;
const MAX_SECURITY_FLAGS = 20;
const MAX_SECURITY_FLAG_LENGTH = 64;

let secureStoreModuleCache: SecureStoreModule | null | undefined;
let deviceIdInFlightPromise: Promise<string> | null = null;
const syncInFlightPromises = new Map<string, Promise<DeviceAuthorizationStatus>>();
const syncFailureStateByUid = new Map<string, { count: number; logged: number; lastFailureAt: number; lastError: string }>();

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

export type AuthorizedDeviceRecord = {
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string;
  created_at: number;
  last_seen_at: number;
  is_allowed: boolean;
  is_blocked: boolean;
  security_flags: string[];
  personal_force_update?: boolean;
};

export type DeviceAuthorizationStatus = {
  deviceId: string | null;
  status: 'allowed' | 'pending' | 'blocked' | 'unknown';
  record: AuthorizedDeviceRecord | null;
  usesSecureStore: boolean;
  error?: string;
};

const tryRequireSecureStore = (): SecureStoreModule | null => {
  try {
    const required = require('expo-secure-store') as SecureStoreModule | { default?: SecureStoreModule };
    return 'getItemAsync' in required
      ? required
      : required.default ?? null;
  } catch {
    return null;
  }
};

const getSecureStoreModule = (): SecureStoreModule | null => {
  if (secureStoreModuleCache !== undefined) {
    return secureStoreModuleCache;
  }

  secureStoreModuleCache = tryRequireSecureStore();
  return secureStoreModuleCache;
};

export const isSecureStoreBacked = (): boolean => Boolean(getSecureStoreModule());

const toSecureStoreCompatibleKey = (key: string): string =>
  key
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'chaika_secure_key';

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);
    }),
  ]);

const isSecureStoreDecryptError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /could not decrypt|decrypt the value|provided keychain/i.test(message);
};

const readSecureValue = async (key: string): Promise<string | null> => {
  const secureStore = getSecureStoreModule();
  if (secureStore) {
    const safeKey = toSecureStoreCompatibleKey(key);
    try {
      return await withTimeout(
        secureStore.getItemAsync(safeKey),
        SECURE_STORE_IO_TIMEOUT_MS,
        'secure_store_read_timeout',
      );
    } catch (error) {
      if (isSecureStoreDecryptError(error)) {
        // Expected, self-healing condition (e.g. after reinstall / keychain change):
        // we delete the corrupted entry and regenerate below. Log as an event, not
        // an error, to avoid false-alarm noise in ops/errors.
        void logClientEvent('deviceAuth.readSecureValue.recovered', {
          key,
          safeKey,
          action: 'recover_by_delete_and_regenerate',
          reason: error instanceof Error ? error.message : String(error),
        });
        try {
          await withTimeout(
            secureStore.deleteItemAsync(safeKey),
            SECURE_STORE_IO_TIMEOUT_MS,
            'secure_store_delete_timeout',
          );
        } catch (deleteError) {
          void logClientError('deviceAuth.readSecureValue.deleteCorruptedKey', deleteError, {
            key,
            safeKey,
          });
        }
        return null;
      }
      throw error;
    }
  }

  return secureGet(key);
};

const writeSecureValue = async (key: string, value: string): Promise<void> => {
  const secureStore = getSecureStoreModule();
  if (secureStore) {
    const safeKey = toSecureStoreCompatibleKey(key);
    try {
      await withTimeout(
        secureStore.setItemAsync(safeKey, value),
        SECURE_STORE_IO_TIMEOUT_MS,
        'secure_store_write_timeout',
      );
    } catch (error) {
      void logClientError('deviceAuth.writeSecureValue', error, {
        key,
        safeKey,
        action: 'fallback_to_secureSet',
      });
      await secureSet(key, value);
    }
    return;
  }

  await secureSet(key, value);
};

const deleteSecureValue = async (key: string): Promise<void> => {
  const secureStore = getSecureStoreModule();
  if (secureStore) {
    const safeKey = toSecureStoreCompatibleKey(key);
    try {
      await withTimeout(
        secureStore.deleteItemAsync(safeKey),
        SECURE_STORE_IO_TIMEOUT_MS,
        'secure_store_delete_timeout',
      );
    } catch (error) {
      void logClientError('deviceAuth.deleteSecureValue', error, {
        key,
        safeKey,
        action: 'fallback_to_secureRemove',
      });
      await secureRemove(key);
    }
    return;
  }

  await secureRemove(key);
};

const getDeviceName = (): string => {
  const configuredName = Constants.deviceName;
  if (typeof configuredName === 'string' && configuredName.trim()) {
    return configuredName.slice(0, 120);
  }

  return `${Platform.OS} device`;
};

const sanitizeSecurityFlags = (flags: unknown): string[] => {
  const source = Array.isArray(flags) ? flags : [];
  const normalized = source
    .filter((flag): flag is string => typeof flag === 'string')
    .map((flag) => flag.trim().slice(0, MAX_SECURITY_FLAG_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SECURITY_FLAGS);

  return normalized.length > 0 ? normalized : ['secure_store_backed'];
};

const getSecurityFlags = (): string[] =>
  sanitizeSecurityFlags(isSecureStoreBacked() ? ['secure_store_backed'] : ['fallback_secure_storage']);

const createDeviceRecord = (
  deviceId: string,
  allowNewDevices: boolean,
): AuthorizedDeviceRecord => ({
  device_id: deviceId,
  device_name: getDeviceName(),
  platform: Platform.OS,
  app_version: getCurrentAppVersion(),
  created_at: Date.now(),
  last_seen_at: Date.now(),
  is_allowed: allowNewDevices,
  is_blocked: false,
  security_flags: getSecurityFlags(),
});

// Validates that a stored device ID has the expected format.
// XOR key loss causes decryption to produce garbage bytes that fail this check.
const isValidDeviceId = (value: string): boolean => {
  // Standard UUID v4: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }
  // Fallback format (when Crypto.randomUUID is unavailable): {13-15 digit timestamp}-{16 hex chars}
  if (/^\d{10,15}-[0-9a-f]{16}$/.test(value)) {
    return true;
  }
  return false;
};

export const getOrCreateDeviceId = async (): Promise<string> => {
  if (deviceIdInFlightPromise) {
    return deviceIdInFlightPromise;
  }

  deviceIdInFlightPromise = (async () => {
    const existing = await readSecureValue(DEVICE_ID_STORAGE_KEY);

    if (existing && isValidDeviceId(existing)) {
      return existing;
    }

    if (existing) {
      // Value is present but corrupted (e.g. XOR encryption key was regenerated
      // after AsyncStorage partial wipe). Clear it before writing a fresh ID so
      // a garbled string is never registered as a device record in Firebase.
      try {
        await deleteSecureValue(DEVICE_ID_STORAGE_KEY);
      } catch {
        // Best-effort cleanup; proceed to generate a new valid ID.
      }
    }

    const deviceId =
      typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : `${Date.now()}-${Array.from(Crypto.getRandomBytes(8)).map((value) => value.toString(16).padStart(2, '0')).join('')}`;

    await writeSecureValue(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  })();

  try {
    return await deviceIdInFlightPromise;
  } finally {
    deviceIdInFlightPromise = null;
  }
};

export const clearStoredDeviceId = async (): Promise<void> => {
  await deleteSecureValue(DEVICE_ID_STORAGE_KEY);
};

export const getAuthorizedDevicePath = (uid: string, deviceId: string): string =>
  `${AUTHORIZED_DEVICES_PATH}/${uid}/${deviceId}`;

const isRealSignedInUser = (uid: string): boolean => {
  const currentUser = auth.currentUser;
  return Boolean(
    currentUser &&
    currentUser.uid === uid &&
    !currentUser.isAnonymous &&
    currentUser.providerData.length > 0,
  );
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const prepareAuthorizedDeviceWrite = async (uid: string): Promise<boolean> => {
  try {
    await auth.authStateReady();
  } catch {
    // authStateReady may throw if auth is not properly initialized; proceed with current state.
  }

  if (!isRealSignedInUser(uid)) {
    return false;
  }

  try {
    await auth.currentUser?.getIdToken();
  } catch {
    return false;
  }

  return isRealSignedInUser(uid);
};

const normalizeAuthorizedDeviceRecord = (
  deviceId: string,
  value: Partial<AuthorizedDeviceRecord> | null,
): AuthorizedDeviceRecord | null => {
  if (!value) {
    return null;
  }

  return {
    device_id: deviceId,
    device_name: typeof value.device_name === 'string' ? value.device_name : getDeviceName(),
    platform: typeof value.platform === 'string' ? value.platform : Platform.OS,
    app_version: typeof value.app_version === 'string' ? value.app_version : getCurrentAppVersion(),
    created_at: Number.isFinite(value.created_at) ? Number(value.created_at) : Date.now(),
    last_seen_at: Number.isFinite(value.last_seen_at) ? Number(value.last_seen_at) : Date.now(),
    is_allowed: value.is_allowed === true,
    is_blocked: value.is_blocked === true,
    security_flags: sanitizeSecurityFlags(value.security_flags),
    ...(value.personal_force_update === true ? { personal_force_update: true } : {}),
  };
};

export const evaluateDeviceAuthorizationStatus = (
  deviceId: string | null,
  record: AuthorizedDeviceRecord | null,
): DeviceAuthorizationStatus => {
  if (!deviceId) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  if (!record) {
    return {
      deviceId,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  if (record.is_blocked) {
    return {
      deviceId,
      status: 'blocked',
      record,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  if (!record.is_allowed) {
    return {
      deviceId,
      status: 'pending',
      record,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  return {
    deviceId,
    status: 'allowed',
    record,
    usesSecureStore: isSecureStoreBacked(),
  };
};

export const getCurrentAuthorizedDeviceStatus = async (uid: string): Promise<DeviceAuthorizationStatus> => {
  if (!uid) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const snapshot = await get(ref(database, getAuthorizedDevicePath(uid, deviceId)));
    const record = normalizeAuthorizedDeviceRecord(deviceId, snapshot.val() as Partial<AuthorizedDeviceRecord> | null);
    return evaluateDeviceAuthorizationStatus(deviceId, record);
  } catch (error) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
      error: error instanceof Error ? error.message : 'device_status_unavailable',
    };
  }
};

const shouldWriteLastSeen = async (uid: string, deviceId: string): Promise<boolean> => {
  try {
    const cacheKey = `${LAST_SEEN_CACHE_PREFIX}${uid}:${deviceId}`;
    const raw = await AsyncStorage.getItem(cacheKey);
    const lastSeenAt = raw ? Number(raw) : 0;
    const now = Date.now();

    if (Number.isFinite(lastSeenAt) && now - lastSeenAt < LAST_SEEN_THROTTLE_MS) {
      return false;
    }

    await AsyncStorage.setItem(cacheKey, String(now));
    return true;
  } catch {
    return true;
  }
};

export const syncAuthorizedDeviceForUser = async (
  uid: string,
  options?: { allowNewDevices?: boolean },
): Promise<DeviceAuthorizationStatus> => {
  if (!uid) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  const syncKey = `${uid}:${options?.allowNewDevices !== false ? 'allow' : 'pending'}`;
  const syncFailureState = syncFailureStateByUid.get(uid);
  if (
    syncFailureState &&
    syncFailureState.count >= MAX_DEVICE_SYNC_FAILURES_PER_SESSION &&
    Date.now() - syncFailureState.lastFailureAt < DEVICE_SYNC_FAILURE_COOLDOWN_MS
  ) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
      error: syncFailureState.lastError || 'device_sync_throttled',
    };
  }

  const inFlight = syncInFlightPromises.get(syncKey);
  if (inFlight) {
    return inFlight;
  }

  const syncPromise = (async () => {
  try {
    if (!(await prepareAuthorizedDeviceWrite(uid))) {
      return {
        deviceId: null,
        status: 'unknown' as const,
        record: null,
        usesSecureStore: isSecureStoreBacked(),
        error: 'device_auth_not_ready',
      };
    }

    const runSync = async (): Promise<DeviceAuthorizationStatus> => {
      const deviceId = await getOrCreateDeviceId();
      const path = getAuthorizedDevicePath(uid, deviceId);
      const deviceRef = ref(database, path);
      const snapshot = await get(deviceRef);
      const existingRecord = normalizeAuthorizedDeviceRecord(deviceId, snapshot.val() as Partial<AuthorizedDeviceRecord> | null);

      if (!existingRecord) {
        const record = createDeviceRecord(deviceId, options?.allowNewDevices !== false);
        await set(deviceRef, record);
        void logSecurityAuditEvent('device_registered', {
          status: record.is_allowed ? 'allowed' : 'pending',
          platform: record.platform,
        });
        syncFailureStateByUid.delete(uid);
        return evaluateDeviceAuthorizationStatus(deviceId, record);
      }

      if (await shouldWriteLastSeen(uid, deviceId)) {
        await update(deviceRef, {
          last_seen_at: Date.now(),
          app_version: getCurrentAppVersion(),
          device_name: getDeviceName(),
          security_flags: getSecurityFlags(),
        });
      }

      const nextStatus = evaluateDeviceAuthorizationStatus(deviceId, {
        ...existingRecord,
        app_version: getCurrentAppVersion(),
        device_name: getDeviceName(),
        security_flags: getSecurityFlags(),
      });

      if (nextStatus.status === 'blocked') {
        void logSecurityAuditEvent('device_blocked', {
          platform: Platform.OS,
        });
      }

      syncFailureStateByUid.delete(uid);
      return nextStatus;
    };

    try {
      return await runSync();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/permission_denied|PERMISSION_DENIED/i.test(message)) {
        throw error;
      }

      await auth.currentUser?.getIdToken(true);
      await wait(DEVICE_AUTH_RETRY_DELAY_MS);

      if (!(await prepareAuthorizedDeviceWrite(uid))) {
        throw error;
      }

      return runSync();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'device_sync_failed';
    const previousFailureState = syncFailureStateByUid.get(uid);
    const nextFailureState = {
      count: (previousFailureState?.count ?? 0) + 1,
      logged: previousFailureState?.logged ?? 0,
      lastFailureAt: Date.now(),
      lastError: message,
    };

    if (nextFailureState.logged < MAX_DEVICE_SYNC_ERROR_LOGS_PER_SESSION) {
      nextFailureState.logged += 1;
      void logClientError('deviceAuth.syncAuthorizedDeviceForUser', error, {
        uid,
        authUid: auth.currentUser?.uid ?? null,
        providerId: auth.currentUser?.providerData?.[0]?.providerId ?? null,
        isAnonymous: auth.currentUser?.isAnonymous ?? null,
        email: auth.currentUser?.email ?? null,
        emailVerified: auth.currentUser?.emailVerified ?? null,
        failureCount: nextFailureState.count,
      });
    }

    syncFailureStateByUid.set(uid, nextFailureState);
    return {
      deviceId: null,
      status: 'unknown' as const,
      record: null,
      usesSecureStore: isSecureStoreBacked(),
      error: message,
    };
  }
  })();

  syncInFlightPromises.set(syncKey, syncPromise);

  try {
    return await syncPromise;
  } finally {
    syncInFlightPromises.delete(syncKey);
  }
};

export const syncAuthorizedDeviceForCurrentUser = async (
  options?: { allowNewDevices?: boolean },
): Promise<DeviceAuthorizationStatus> => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return {
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    };
  }

  return syncAuthorizedDeviceForUser(uid, options);
};

export const subscribeAuthorizedDeviceStatus = async (
  uid: string,
  callback: (status: DeviceAuthorizationStatus) => void,
): Promise<() => void> => {
  if (!uid) {
    callback({
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
    });
    return () => {};
  }

  let deviceId: string;
  try {
    deviceId = await getOrCreateDeviceId();
  } catch (error) {
    callback({
      deviceId: null,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
      error: error instanceof Error ? error.message : 'device_id_unavailable',
    });
    return () => {};
  }

  const deviceRef = ref(database, getAuthorizedDevicePath(uid, deviceId));
  const unsubscribe = onValue(deviceRef, (snapshot) => {
    const record = normalizeAuthorizedDeviceRecord(deviceId, snapshot.val() as Partial<AuthorizedDeviceRecord> | null);
    callback(evaluateDeviceAuthorizationStatus(deviceId, record));
  }, (error) => {
    callback({
      deviceId,
      status: 'unknown',
      record: null,
      usesSecureStore: isSecureStoreBacked(),
      error: error.message,
    });
  });

  return () => off(deviceRef, 'value', unsubscribe);
};
