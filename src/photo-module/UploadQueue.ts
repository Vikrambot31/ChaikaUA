/**
 * TZ_4.2 — Offline Upload Queue
 *
 * Stores pending photo uploads in AsyncStorage so photos survive app restarts
 * and network outages. The queue is processed automatically on enqueue and on
 * app focus (UploadQueue.process() is called from useFocusEffect in screens).
 *
 * Rules:
 *  - Max 5 items in the queue simultaneously (TZ limit)
 *  - TTL: items older than 48 hours are dropped with a log
 *  - Deduplication: same localUri is never added twice
 *  - Retry: handled by PhotoUploadEngine (3 attempts, 1s/3s/9s back-off)
 *  - WRITE-only queue: moderation decisions are server-side only
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordRuntimeTrace } from '../services/runtimeMonitorService';
import { safeLogError } from '../utils/errorLogger';
import { uploadPhotoWithEngine } from './PhotoUploadEngine';
import { ImageStorage } from './ImageStorage';
import type { PhotoUploadTask } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_KEY = '@chaika:photo-module:upload-queue:v2';
const MAX_QUEUE_ITEMS = 5;
const ITEM_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_RETRY_COUNT = 3;
const MAX_ERROR_LENGTH = 300;

// ─── Queue persistence ────────────────────────────────────────────────────────

let processing = false;

const readQueue = async (): Promise<PhotoUploadTask[]> => {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PhotoUploadTask[];
    return Array.isArray(parsed) ? parsed.filter((t) => t?.photoId && t.localUri) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: PhotoUploadTask[]): Promise<void> => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE_ITEMS)));
};

const removeTask = async (photoId: string): Promise<void> => {
  const queue = await readQueue();
  await writeQueue(queue.filter((t) => t.photoId !== photoId));
};

const updateTask = async (task: PhotoUploadTask): Promise<void> => {
  const queue = await readQueue();
  await writeQueue(queue.map((t) => (t.photoId === task.photoId ? task : t)));
};

// ─── TTL eviction ─────────────────────────────────────────────────────────────

const evictExpired = async (): Promise<number> => {
  const queue = await readQueue();
  const cutoff = Date.now() - ITEM_TTL_MS;
  const valid = queue.filter((t) => t.createdAt >= cutoff);
  const dropped = queue.length - valid.length;
  if (dropped > 0) {
    await writeQueue(valid);
    void recordRuntimeTrace({
      screen: 'UploadQueue.evictExpired',
      action: 'ttl_eviction',
      status: 'success',
      feature: 'profile',
      stage: 'ttl_cleanup',
      details: { dropped, remaining: valid.length },
    });
  }
  return dropped;
};

// ─── Public API ────────────────────────────────────────────────────────────────

export const UploadQueue = {
  /**
   * Add a photo to the offline queue.
   * Deduplicates by both photoId AND localUri (TZ_4.5 — no duplicates).
   * Returns false if the queue is full (photo was NOT added), true otherwise.
   */
  async enqueue(
    photoId: string,
    localUri: string,
    metadata?: PhotoUploadTask['metadata'],
    options?: { collection?: string; uid?: string },
  ): Promise<boolean> {
    const now = Date.now();

    // Evict stale items first
    await evictExpired();

    const queue = await readQueue();

    // Deduplication: by photoId OR by localUri (TZ_4.5)
    const alreadyById = queue.some((t) => t.photoId === photoId);
    const alreadyByUri = queue.some((t) => t.localUri === localUri);
    const exists = alreadyById || alreadyByUri;

    if (!exists) {
      if (queue.length >= MAX_QUEUE_ITEMS) {
        void recordRuntimeTrace({
          screen: 'UploadQueue.enqueue',
          action: 'queue_full',
          status: 'fail',
          feature: 'profile',
          stage: 'enqueue_rejected',
          details: { photoId, queueSize: queue.length, maxItems: MAX_QUEUE_ITEMS },
        });
        return false; // Queue full — caller should surface this to the user
      }

      await writeQueue([
        {
          photoId,
          localUri,
          collection: options?.collection,
          uid: options?.uid,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
          metadata,
        },
        ...queue,
      ]);
    }

    void recordRuntimeTrace({
      screen: 'UploadQueue.enqueue',
      action: 'enqueue',
      status: exists ? 'progress' : 'start',
      feature: 'profile',
      stage: 'enqueue',
      details: {
        photoId,
        uriScheme: localUri.split(':')[0] ?? 'file',
        alreadyQueued: exists,
        byId: alreadyById,
        byUri: alreadyByUri,
        hasMetadata: Boolean(metadata),
      },
    });

    void this.process().catch((error) => safeLogError('UploadQueue.enqueue.process', error));
    return true;
  },

  async remove(photoId: string): Promise<void> {
    await removeTask(photoId);
  },

  /**
   * Process all pending items. Called on app focus and after enqueue.
   * Uses PhotoUploadEngine for the actual upload + RTDB write.
   */
  async process(): Promise<void> {
    if (processing) return;
    processing = true;

    try {
      await evictExpired();
      const queue = await readQueue();

      for (const task of queue) {
        const photo = await ImageStorage.getPhoto(task.photoId);

        // If local record is gone or already uploaded, remove from queue
        if (!photo) {
          await removeTask(task.photoId);
          continue;
        }
        if (photo.status === 'uploaded') {
          await removeTask(task.photoId);
          continue;
        }

        // Max retries reached — leave as error, don't keep trying
        if (task.retryCount >= MAX_RETRY_COUNT) {
          continue;
        }

        await ImageStorage.updatePhoto(task.photoId, { status: 'uploading', error: undefined });

        void recordRuntimeTrace({
          screen: 'UploadQueue.process',
          action: 'task_start',
          status: 'start',
          feature: 'profile',
          stage: `task.attempt_${task.retryCount + 1}`,
          details: {
            photoId: task.photoId,
            uriScheme: task.localUri.split(':')[0] ?? 'file',
            retryCount: task.retryCount,
            collection: task.collection ?? 'user_photos',
          },
        });

        try {
          // Determine effective uid: from task, from photo record, or fall back
          const uid = task.uid ?? photo.userId ?? 'unknown';
          const collection = task.collection ?? 'user_photos';

          const result = await uploadPhotoWithEngine({
            localUri: task.localUri,
            uid,
            collection,
            metadata: task.metadata
              ? {
                  uploadedBy: task.metadata.uploadedBy,
                  title: task.metadata.title,
                  description: task.metadata.description,
                  locationLabel: task.metadata.locationLabel,
                  locationType: task.metadata.locationType,
                  target: 'my_photos',
                }
              : { target: 'my_photos' },
            onProgress: (percent) => {
              void ImageStorage.updatePhoto(task.photoId, { progress: percent });
            },
          });

          void recordRuntimeTrace({
            screen: 'UploadQueue.process',
            action: 'task_complete',
            status: 'success',
            feature: 'profile',
            stage: 'task_complete',
            firebasePath: result.storagePath,
            details: { photoId: task.photoId, storagePath: result.storagePath, rtdbId: result.rtdbId },
          });

          await ImageStorage.updatePhoto(task.photoId, {
            imageUrl: result.downloadUrl ?? '',
            storagePath: result.storagePath,
            status: 'uploaded',
            error: undefined,
            retryCount: task.retryCount,
          });
          await removeTask(task.photoId);
        } catch (error) {
          const retryCount = task.retryCount + 1;
          const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);

          void recordRuntimeTrace({
            screen: 'UploadQueue.process',
            action: 'task_fail',
            status: retryCount >= MAX_RETRY_COUNT ? 'fail' : 'progress',
            feature: 'profile',
            stage: `task.attempt_${retryCount}`,
            error,
            details: {
              photoId: task.photoId,
              retryCount,
              maxRetry: MAX_RETRY_COUNT,
              willRetry: retryCount < MAX_RETRY_COUNT,
            },
          });

          await ImageStorage.updatePhoto(task.photoId, {
            status: retryCount >= MAX_RETRY_COUNT ? 'error' : 'queued',
            error: message,
            retryCount,
          });
          await updateTask({ ...task, retryCount, updatedAt: Date.now() });
          safeLogError('UploadQueue.process.upload', error, { photoId: task.photoId, retryCount });
        }
      }
    } finally {
      processing = false;
    }
  },

  /** Returns true if any photo with this localUri is already in the queue. */
  async hasLocalUri(localUri: string): Promise<boolean> {
    const queue = await readQueue();
    return queue.some((t) => t.localUri === localUri);
  },

  /** Returns count of items currently in the queue. */
  async queueSize(): Promise<number> {
    const queue = await readQueue();
    return queue.length;
  },

  async deleteUploadedStorage(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      const photos = await ImageStorage.getPhotos();
      const match = photos.find((p) => p.storagePath === storagePath || p.filePath === storagePath);
      if (match) {
        await ImageStorage.updatePhoto(match.id, { deleted: true });
      }
    } catch (error) {
      safeLogError('UploadQueue.deleteUploadedStorage', error, { storagePath });
    }
  },
};
