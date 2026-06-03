import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { firebaseApp, storage } from '../firebase-core';
import { logClientError, logClientEvent } from '../utils/errorLogger';
import { safePromiseTimeout } from '../utils/safePromiseTimeout';

export type MediaCollection =
  | 'community_photos'
  | 'lost_found'
  | 'buy_sell_listings'
  | 'contacts_listings'
  | 'biznes_chaika_listings'
  | 'local_business'
  | 'requests';

const isStoragePath = (value: string): boolean =>
  /^.+\/.+\.(jpg|jpeg|png|webp|heic|heif)$/i.test(value);

const MEDIA_ACCESS_CALLABLE_TIMEOUT_MS = 12_000;
const MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS = 4;
const MEDIA_ACCESS_LIST_TIMEOUT_MS = 5_000;
const MEDIA_ACCESS_LIST_MAX_ATTEMPTS = 2;

export type MediaAccessResolveProfile = 'default' | 'list';

export interface MediaAccessResolveOptions {
  profile?: MediaAccessResolveProfile;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const resolveMediaAccessUrl = async (
  collection: MediaCollection,
  itemId: string,
  storagePath: string,
  options: MediaAccessResolveOptions = {},
): Promise<string> => {
  const normalized = String(storagePath || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (!isStoragePath(normalized)) return '';

  if (normalized.startsWith('uploads/')) {
    try {
      return await getDownloadURL(storageRef(storage, normalized));
    } catch (err) {
      void logClientError('mediaAccess.getDownloadURL', err, { storagePath: normalized });
      return '';
    }
  }

  const getMediaAccessUrl = httpsCallable<
    { collection: MediaCollection; itemId: string; storagePath: string },
    { url: string; expiresAt: number }
  >(getFunctions(firebaseApp), 'getMediaAccessUrl');

  const timeoutMs = options.profile === 'list' ? MEDIA_ACCESS_LIST_TIMEOUT_MS : MEDIA_ACCESS_CALLABLE_TIMEOUT_MS;
  const maxAttempts = options.profile === 'list' ? MEDIA_ACCESS_LIST_MAX_ATTEMPTS : MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const startedAt = Date.now();
      const result = await safePromiseTimeout(
        getMediaAccessUrl({ collection, itemId, storagePath: normalized }),
        timeoutMs,
        `mediaAccess:${collection}:${itemId}:attempt_${attempt}`,
      );
      void logClientEvent('media_access_resolved', {
        collection,
        itemId,
        attempt,
        duration_ms: Date.now() - startedAt,
      });
      return result.data.url || '';
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await wait((options.profile === 'list' ? 250 : 500) * attempt);
      }
    }
  }

  void logClientError('mediaAccess.resolveMediaAccessUrl', lastError, {
    collection,
    itemId,
    timeout_ms: timeoutMs,
    attempts: maxAttempts,
    profile: options.profile || 'default',
  });
  return '';
};

export const resolveMediaAccessUrls = async <T extends { id: string }>(
  items: T[],
  collection: MediaCollection,
  getPath: (item: T) => string,
  setUrl: (item: T, url: string) => T,
  options?: MediaAccessResolveOptions,
): Promise<T[]> => Promise.all(
  items.map(async (item) => setUrl(item, await resolveMediaAccessUrl(collection, item.id, getPath(item), options))),
);
