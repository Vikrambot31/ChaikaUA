import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, onValue, ref } from 'firebase/database';
import { database } from '../firebase-core';
import {
  DEFAULT_REMOTE_APP_CONTROL_CONFIG,
  RemoteAppControlConfig,
  validateRemoteAppControlConfig,
} from './securityConfigValidator';
import { logClientError } from '../utils/errorLogger';

const APP_CONTROL_PATH = 'security_config/app_control/current';
const APP_CONTROL_CACHE_KEY = '@chaika:app_control_config_v1';
const APP_CONTROL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REMOTE_CONFIG_LOAD_TIMEOUT_MS = 4500;

let remoteConfigInFlightPromise: Promise<RemoteConfigSnapshot> | null = null;

export type RemoteConfigSnapshot = {
  config: RemoteAppControlConfig;
  source: 'remote' | 'cache' | 'default';
  loadedAt: number;
  isStale: boolean;
  error?: string;
};

type CachedRemoteConfigPayload = {
  config: RemoteAppControlConfig;
  loadedAt: number;
};

const toSnapshot = (
  config: RemoteAppControlConfig,
  source: RemoteConfigSnapshot['source'],
  loadedAt = Date.now(),
  error?: string,
): RemoteConfigSnapshot => ({
  config,
  source,
  loadedAt,
  isStale: Date.now() - loadedAt > APP_CONTROL_CACHE_MAX_AGE_MS,
  error,
});

export const createDefaultRemoteConfigSnapshot = (): RemoteConfigSnapshot =>
  toSnapshot(DEFAULT_REMOTE_APP_CONTROL_CONFIG, 'default', 0);

const createRemoteConfigTimeoutPromise = (): Promise<never> =>
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error('remote_config_timeout')), REMOTE_CONFIG_LOAD_TIMEOUT_MS);
  });

const setCachedSnapshot = async (snapshot: RemoteConfigSnapshot): Promise<void> => {
  const payload: CachedRemoteConfigPayload = {
    config: snapshot.config,
    loadedAt: snapshot.loadedAt,
  };
  await AsyncStorage.setItem(APP_CONTROL_CACHE_KEY, JSON.stringify(payload));
};

export const getCachedRemoteConfigSnapshot = async (): Promise<RemoteConfigSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(APP_CONTROL_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CachedRemoteConfigPayload>;
    if (!parsed?.config) {
      await AsyncStorage.removeItem(APP_CONTROL_CACHE_KEY);
      return null;
    }

    return toSnapshot(parsed.config, 'cache', Number(parsed.loadedAt) || 0);
  } catch {
    try {
      await AsyncStorage.removeItem(APP_CONTROL_CACHE_KEY);
    } catch {}
    return null;
  }
};

const checkRawTypes = (raw: unknown): string[] => {
  const errors: string[] = [];
  const r = raw as Record<string, unknown> | null ?? {};
  if (r.app_enabled !== undefined && typeof r.app_enabled !== 'boolean') errors.push('app_enabled');
  if (r.maintenance_mode !== undefined && typeof r.maintenance_mode !== 'boolean') errors.push('maintenance_mode');
  if (r.minimum_required_version !== undefined && typeof r.minimum_required_version !== 'string') errors.push('minimum_required_version');
  if (r.force_update_required !== undefined && typeof r.force_update_required !== 'boolean') errors.push('force_update_required');
  if (r.allow_new_devices !== undefined && typeof r.allow_new_devices !== 'boolean') errors.push('allow_new_devices');
  if (r.beta_mode_enabled !== undefined && typeof r.beta_mode_enabled !== 'boolean') errors.push('beta_mode_enabled');
  return errors;
};

const readRemoteConfig = async (): Promise<RemoteConfigSnapshot> => {
  const snapshot = await Promise.race([
    get(ref(database, APP_CONTROL_PATH)),
    createRemoteConfigTimeoutPromise(),
  ]);
  const rawVal = snapshot.val();
  const rawTypeErrors = checkRawTypes(rawVal);
  if (rawTypeErrors.length > 0) {
    void logClientError('remoteConfig.type_mismatch', {
      message: 'Remote config has unexpected types (normalized and used anyway)',
      fields: rawTypeErrors,
    });
  }

  const result = validateRemoteAppControlConfig(rawVal);
  const nextSnapshot = toSnapshot(result.config, 'remote', Date.now());

  await setCachedSnapshot(nextSnapshot);

  return nextSnapshot;
};

export const loadRemoteConfigSnapshot = async (): Promise<RemoteConfigSnapshot> => {
  if (remoteConfigInFlightPromise) {
    return remoteConfigInFlightPromise;
  }

  remoteConfigInFlightPromise = (async () => {
  try {
      return await readRemoteConfig();
  } catch (error) {
    const cached = await getCachedRemoteConfigSnapshot();
    if (cached) {
      return {
        ...cached,
        error: error instanceof Error ? error.message : 'remote_config_unavailable',
      };
    }

    void logClientError('remoteConfig.loadRemoteConfigSnapshot', error);
    return {
      ...createDefaultRemoteConfigSnapshot(),
      error: error instanceof Error ? error.message : 'remote_config_unavailable',
    };
  }
  })();

  try {
    return await remoteConfigInFlightPromise;
  } finally {
    remoteConfigInFlightPromise = null;
  }
};

export const subscribeRemoteConfigSnapshot = (
  callback: (snapshot: RemoteConfigSnapshot) => void,
): (() => void) => {
  const configRef = ref(database, APP_CONTROL_PATH);

  const unsubscribe = onValue(configRef, (snapshot) => {
    try {
      const rawVal = snapshot.val();
      const rawTypeErrors = checkRawTypes(rawVal);
      if (rawTypeErrors.length > 0) {
        void logClientError('remoteConfig.subscription_type_mismatch', {
          message: 'Remote config subscription has unexpected types (normalized and used anyway)',
          fields: rawTypeErrors,
        });
      }

      const result = validateRemoteAppControlConfig(rawVal);
      const nextSnapshot = toSnapshot(result.config, 'remote', Date.now());

      void setCachedSnapshot(nextSnapshot);
      callback(nextSnapshot);
    } catch (callbackError) {
      void logClientError('remoteConfig.subscribeRemoteConfigSnapshot.callback', callbackError);
      try {
        callback(createDefaultRemoteConfigSnapshot());
      } catch {
        // Callback itself threw — nothing more we can do
      }
    }
  }, (error) => {
    void (async () => {
      try {
        const cached = await getCachedRemoteConfigSnapshot();
        callback(cached ?? {
          ...createDefaultRemoteConfigSnapshot(),
          error: error.message,
        });
      } catch {
        try {
          callback({ ...createDefaultRemoteConfigSnapshot(), error: error.message });
        } catch {
          // Callback threw — nothing more we can do
        }
      }
    })();
  });

  return unsubscribe;
};
