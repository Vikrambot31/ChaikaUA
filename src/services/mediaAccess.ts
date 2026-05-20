import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase-core';
import { logClientError, logClientEvent } from '../utils/errorLogger';
import { safePromiseTimeout } from '../utils/safePromiseTimeout';

export type MediaCollection =
  | 'community_photos'
  | 'lost_found'
  | 'buy_sell_listings'
  | 'contacts_listings'
  | 'local_business'
  | 'requests';

const isStoragePath = (value: string): boolean =>
  /^(community_photos|lost_found|buy_sell|buy_sell_listings|contacts|contacts_listings|local_business|requests|profile_photos)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|heic|heif)$/i.test(value);

const MEDIA_ACCESS_CALLABLE_TIMEOUT_MS = 12_000;
const MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS = 4;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const resolveMediaAccessUrl = async (
  collection: MediaCollection,
  itemId: string,
  storagePath: string,
): Promise<string> => {
  const normalized = String(storagePath || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (!isStoragePath(normalized)) return '';

  const getMediaAccessUrl = httpsCallable<
    { collection: MediaCollection; itemId: string; storagePath: string },
    { url: string; expiresAt: number }
  >(getFunctions(firebaseApp), 'getMediaAccessUrl');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const startedAt = Date.now();
      const result = await safePromiseTimeout(
        getMediaAccessUrl({ collection, itemId, storagePath: normalized }),
        MEDIA_ACCESS_CALLABLE_TIMEOUT_MS,
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
      if (attempt < MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS) {
        await wait(500 * attempt);
      }
    }
  }

  void logClientError('mediaAccess.resolveMediaAccessUrl', lastError, {
    collection,
    itemId,
    timeout_ms: MEDIA_ACCESS_CALLABLE_TIMEOUT_MS,
    attempts: MEDIA_ACCESS_CALLABLE_MAX_ATTEMPTS,
  });
  return '';
};

export const resolveMediaAccessUrls = async <T extends { id: string }>(
  items: T[],
  collection: MediaCollection,
  getPath: (item: T) => string,
  setUrl: (item: T, url: string) => T,
): Promise<T[]> => Promise.all(
  items.map(async (item) => setUrl(item, await resolveMediaAccessUrl(collection, item.id, getPath(item)))),
);
