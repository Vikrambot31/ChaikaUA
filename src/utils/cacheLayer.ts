import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@chaika:cache:';
const CACHE_VERSION = 'v1';

type CachePayload<T> = {
  value: T;
  expiresAt: number;
  version: string;
};

const keyFor = (key: string) => `${CACHE_PREFIX}${key}`;

export const CACHE_TTL = {
  securityConfig: 5 * 60 * 1000,
  inviteAccess: 30 * 1000,
  userRole: 60 * 1000,
  userProfile: 10 * 60 * 1000,
  feed: 5 * 60 * 1000,
  statsDashboard: 2 * 60 * 1000,
  osbbContent: 3 * 60 * 1000,
} as const;

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(key));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CachePayload<T>>;
    if (parsed.version !== CACHE_VERSION || typeof parsed.expiresAt !== 'number') {
      await AsyncStorage.removeItem(keyFor(key));
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(keyFor(key));
      return null;
    }

    return parsed.value ?? null;
  } catch {
    try {
      await AsyncStorage.removeItem(keyFor(key));
    } catch {}
    return null;
  }
};

export const cacheSet = async <T>(key: string, value: T, ttlMs: number): Promise<void> => {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    await cacheInvalidate(key);
    return;
  }

  const payload: CachePayload<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
    version: CACHE_VERSION,
  };
  await AsyncStorage.setItem(keyFor(key), JSON.stringify(payload));
};

export const cacheInvalidate = async (key: string): Promise<void> => {
  await AsyncStorage.removeItem(keyFor(key));
};

export const cacheInvalidateByPrefix = async (prefix: string): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  const storagePrefix = keyFor(prefix);
  const matchingKeys = keys.filter((key) => key.startsWith(storagePrefix));
  if (matchingKeys.length > 0) {
    await AsyncStorage.multiRemove(matchingKeys);
  }
};
