import { ApiResponse, Place, PlaceType, Request, RequestFormData } from '../types/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, ref } from 'firebase/database';
import { database, firebaseChatAPI } from '../firebase-config';
import { getRequestsAccessScope } from '../firebase-auth-session';
import { chaykaPlaces } from './chaykaPlacesData';
import { logClientError, logClientEvent } from '../utils/errorLogger';

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });
const fail = <T = never>(message: string): ApiResponse<T> => ({ success: false, error: message });

const normalizePlaceType = (value: unknown): PlaceType => {
  const allowed = Object.values(PlaceType);
  return typeof value === 'string' && allowed.includes(value as PlaceType)
    ? (value as PlaceType)
    : PlaceType.SHOP;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isValidCoordinate = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180 &&
  !(latitude === 0 && longitude === 0);

const sanitizePlaces = (places: Place[]): Place[] =>
  places.filter((item) => isValidCoordinate(item.latitude, item.longitude));

const mapDbPlace = (id: string, value: Record<string, unknown>): Place => ({
  id,
  name: typeof value?.name === 'string' ? value.name : 'Place',
  address: typeof value?.address === 'string' ? value.address : '',
  latitude: toNumber(value?.latitude),
  longitude: toNumber(value?.longitude),
  type: normalizePlaceType(value?.type),
  rating: typeof value?.rating === 'number' ? value.rating : 0,
  reviews: typeof value?.reviews === 'number' ? value.reviews : 0,
  phone: typeof value?.phone === 'string' ? value.phone : undefined,
  website: typeof value?.website === 'string' ? value.website : undefined,
  workingHours: typeof value?.workingHours === 'string' ? value.workingHours : undefined,
  createdAt:
    value?.createdAt instanceof Date
      ? value.createdAt.getTime()
      : typeof value?.createdAt === 'string' || typeof value?.createdAt === 'number'
        ? new Date(value.createdAt).getTime()
        : Date.now(),
});

const fetchPlacesFromFirebase = async (): Promise<Place[]> => {
  const snapshot = await get(ref(database, 'places'));
  const data = snapshot.val();
  if (!data) {
    return [];
  }

  const places = Object.entries(data as Record<string, unknown>).map(([id, value]) =>
    mapDbPlace(id, value as Record<string, unknown>)
  );
  return sanitizePlaces(places);
};

// ===== CACHE SYSTEM =====
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const CACHE_PREFIX = 'api_cache_v3_';
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;
const PLACES_CACHE_TTL = 60 * 60 * 1000;

const memoryCache = new Map<string, CacheEntry<unknown>>();

const getCacheKey = (endpoint: string): string => `${CACHE_PREFIX}${endpoint}`;
const getScopedCacheKey = (endpoint: string, scope: string): string => `${CACHE_PREFIX}${endpoint}:${scope}`;
const getSafeCacheKeyLabel = (key: string): string => key.startsWith(`${CACHE_PREFIX}/requests:`) ? `${CACHE_PREFIX}/requests:[scope]` : key;

const getFromCache = async <T>(key: string): Promise<T | null> => {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }

  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const entry = JSON.parse(stored) as CacheEntry<T>;
      if (Date.now() - entry.timestamp < entry.ttl) {
        memoryCache.set(key, entry);
        return entry.data;
      } else {
        await AsyncStorage.removeItem(key);
      }
    }
  } catch (error) {
    const cacheKeyLabel = getSafeCacheKeyLabel(key);
    console.warn('[api.cache] failed to read cache', { key: cacheKeyLabel, error: error instanceof Error ? error.message : String(error) });
    void logClientError('api.cache.read', error, { key: cacheKeyLabel });
  }
  return null;
};

// Читает кеш даже если он устарел (stale fallback для офлайн режима)
const getStaleCache = async <T>(key: string): Promise<T | null> => {
  const cached = memoryCache.get(key);
  if (cached) return cached.data as T;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const entry = JSON.parse(stored) as CacheEntry<T>;
      memoryCache.set(key, entry);
      return entry.data;
    }
  } catch (error) {
    const cacheKeyLabel = getSafeCacheKeyLabel(key);
    console.warn('[api.cache] failed to read stale cache', { key: cacheKeyLabel, error: error instanceof Error ? error.message : String(error) });
    void logClientError('api.cache.readStale', error, { key: cacheKeyLabel });
  }
  return null;
};

// Keys that must NOT be persisted to AsyncStorage (contain user PII).
const MEMORY_ONLY_CACHE_PREFIXES = [`${CACHE_PREFIX}/requests`];

const isMemoryOnlyKey = (key: string): boolean =>
  MEMORY_ONLY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));

const setCache = async <T>(key: string, data: T, ttl: number = DEFAULT_CACHE_TTL): Promise<void> => {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  memoryCache.set(key, entry);

  if (isMemoryOnlyKey(key)) {
    return;
  }

  try {
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    const cacheKeyLabel = getSafeCacheKeyLabel(key);
    console.warn('[api.cache] failed to write cache', { key: cacheKeyLabel, error: error instanceof Error ? error.message : String(error) });
    void logClientError('api.cache.write', error, { key: cacheKeyLabel });
  }
};

const clearCache = async (key: string): Promise<void> => {
  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    const cacheKeyLabel = getSafeCacheKeyLabel(key);
    console.warn('[api.cache] failed to clear cache', { key: cacheKeyLabel, error: error instanceof Error ? error.message : String(error) });
    void logClientError('api.cache.clear', error, { key: cacheKeyLabel });
  }
};

// ===== PLACES =====
export const getPlaces = async (): Promise<ApiResponse<Place[]>> => {
  const cacheKey = getCacheKey('/places');

  // 1. Читаем кэш (TTL 1 час) — пустой массив не считается валидным кэшем
  const cached = await getFromCache<Place[]>(cacheKey);
  if (cached && cached.length > 0) {
    return ok(cached);
  }

  // 2. Пробуем Firebase
  try {
    const places = await fetchPlacesFromFirebase();
    if (places.length > 0) {
      // Firebase вернул данные — кешируем и возвращаем
      await setCache(cacheKey, places, PLACES_CACHE_TTL);
      return ok(places);
    }
    // Firebase пустой (places node не заполнен) — используем встроенные данные
    return ok(chaykaPlaces);
  } catch (error) {
    void logClientError('api.getPlaces', error);
    // 3. Firebase недоступен — устаревший кеш
    const stale = await getStaleCache<Place[]>(cacheKey);
    if (stale && stale.length > 0) {
      return ok(stale);
    }
    // 4. Нет кеша — встроенные статичные 142 места (всегда доступны)
    return ok(chaykaPlaces);
  }
};

// ===== REQUESTS =====
export const getRequests = async (): Promise<ApiResponse<Request[]>> => {
  const scope = await getRequestsAccessScope();
  const cacheKey = getScopedCacheKey('/requests', scope);

  const cached = await getFromCache<Request[]>(cacheKey);
  if (cached) {
    return ok(cached);
  }

  try {
    const response = await firebaseChatAPI.getRequestsOnce();
    if (!response.success || !response.data) {
      const errorMessage = response.success ? 'Failed to fetch requests' : response.error;
      void logClientError('api.getRequests', errorMessage);
      const stale = await getStaleCache<Request[]>(cacheKey);
      if (stale) {
        console.warn('[api.getRequests] request failed, using stale cache', { errorMessage });
        return ok(stale);
      }
      return fail(errorMessage ?? 'Не удалось загрузить заявки. Проверьте интернет и попробуйте ещё раз.');
    }

    await setCache(cacheKey, response.data);
    return ok(response.data);
  } catch (error) {
    void logClientError('api.getRequests.exception', error);
    const stale = await getStaleCache<Request[]>(cacheKey);
    if (stale) {
      console.warn('[api.getRequests] exception, using stale cache', { error: error instanceof Error ? error.message : String(error) });
      return ok(stale);
    }
    return fail('Не удалось загрузить заявки. Проверьте интернет и попробуйте ещё раз.');
  }
};

export const createRequest = async (data: RequestFormData): Promise<ApiResponse<Request>> => {
  if (data.category === 'app_suggestion') {
    return fail('Use appSuggestionsService for app suggestions');
  }
  const description = data.description || data.text || '';
  if (!description || description.length > 280) {
    return fail('Invalid description');
  }

  const response = await firebaseChatAPI.addRequest({
    name: data.name,
    phone: data.phone,
    language: data.language,
    category: data.category || 'other',
    group: data.group || '',
    subcategory: data.subcategory || data.category || '',
    store: data.store || '',
    timeSlot: data.timeSlot || '',
    destination: data.destination || '',
    building: data.building || 'Чайка',
    text: description,
    description,
    photoUri: data.photoUri || '',
    photoStoragePath: data.photoStoragePath || '',
  });
  if (!response.success) {
    void logClientError('api.createRequest', response.error);
    return fail(response.error ?? 'Failed to create request');
  }

  const scope = await getRequestsAccessScope();
  await clearCache(getScopedCacheKey('/requests', scope));
  void logClientEvent('request_created_api', { category: data.category || 'other' });

  const request: Request = {
    id: typeof response.data?.id === 'string' && response.data.id.length > 0 ? response.data.id : `request-${Date.now()}`,
    name: data.name,
    phone: data.phone,
    description,
    isCensored: false,
    isApproved: false,
    createdAt: response.data?.createdAt ?? Date.now(),
    timestamp: response.data?.createdAt ?? Date.now(),
    text: description,
    category: data.category || 'other',
    group: data.group,
    subcategory: data.subcategory,
    store: data.store,
    timeSlot: data.timeSlot,
    destination: data.destination,
    building: data.building,
    photoUri: data.photoUri,
    photoStoragePath: data.photoStoragePath,
  };
  return ok(request);
};

export const deleteRequestById = async (requestId: string): Promise<ApiResponse<boolean>> => {
  if (!requestId) return fail('Invalid request id');

  const response = await firebaseChatAPI.deleteRequest(requestId);
  if (!response.success) {
    void logClientError('api.deleteRequestById', response.error);
    return fail(response.error ?? 'Failed to delete request');
  }

  const scope = await getRequestsAccessScope();
  await clearCache(getScopedCacheKey('/requests', scope));
  return ok(true);
};

export const chatAPI = {
  addRequest: async (
    payload: Pick<RequestFormData, 'name' | 'phone'> & {
      language?: 'ua' | 'ru' | 'en';
      category: string;
      text: string;
      group?: string;
      subcategory?: string;
      store?: string;
      timeSlot?: string;
      destination?: string;
      building?: string;
      photoUri?: string;
      photoStoragePath?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await createRequest({
      name: payload.name,
      phone: payload.phone,
      language: payload.language,
      category: payload.category,
      description: payload.text,
      text: payload.text,
      group: payload.group,
      subcategory: payload.subcategory,
      store: payload.store,
      timeSlot: payload.timeSlot,
      destination: payload.destination,
      building: payload.building,
      photoUri: payload.photoUri,
      photoStoragePath: payload.photoStoragePath,
    });
    return response.success ? { success: true } : { success: false, error: response.error };
  },
};

export default {};

