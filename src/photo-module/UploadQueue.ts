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
import { deleteEngineUpload, uploadPhotoWithEngine } from './PhotoUploadEngine';
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
let pendingRerun = false;

// Photo IDs the user removed while their upload may already be in flight.
// process() checks this set before and after each upload so a cancelled photo
// is never committed (and any already-stored file/record is cleaned up).
const cancelledIds = new Set<string>();

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
    } else {
      const nextQueue = queue.map((task) => (
        task.photoId === photoId || task.localUri === localUri
          ? {
              ...task,
              photoId,
              localUri,
              collection: options?.collection ?? task.collection,
              uid: options?.uid ?? task.uid,
              retryCount: 0,
              updatedAt: now,
              metadata: metadata ?? task.metadata,
            }
          : task
      ));
      await writeQueue(nextQueue);
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

    if (processing) {
      // process() is already running and has already read the queue snapshot.
      // Mark that a re-run is needed so the new task is picked up immediately
      // after the current run finishes — without waiting for the next focus event.
      pendingRerun = true;
    } else {
      void this.process().catch((error) => safeLogError('UploadQueue.enqueue.process', error));
    }
    return true;
  },

  async remove(photoId: string): Promise<void> {
    // Mark as cancelled so an in-flight upload is discarded (not silently
    // committed) and hide it locally immediately.
    cancelledIds.add(photoId);
    await removeTask(photoId);
    await ImageStorage.updatePhoto(photoId, { deleted: true }).catch(() => {});
  },

  /**
   * Process all pending items. Called on app focus and after enqueue.
   * Uses PhotoUploadEngine for the actual upload + RTDB write.
   */
  async process(): Promise<void> {
    if (processing) { pendingRerun = true; return; }
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

        // Cancelled before its upload started — drop it without touching the network.
        if (cancelledIds.has(task.photoId)) {
          cancelledIds.delete(task.photoId);
          await ImageStorage.updatePhoto(task.photoId, { deleted: true }).catch(() => {});
          await removeTask(task.photoId);
          continue;
        }

        // Max retries reached: keep local error state, but free the queue slot.
        if (task.retryCount >= MAX_RETRY_COUNT) {
          await removeTask(task.photoId);
          void recordRuntimeTrace({
            screen: 'UploadQueue.process',
            action: 'max_retry_evicted',
            status: 'fail',
            feature: 'profile',
            stage: 'max_retry_cleanup',
            details: { photoId: task.photoId, retryCount: task.retryCount, maxRetry: MAX_RETRY_COUNT },
          });
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
          const collection = task.collection ?? 'user_photos';
          const uid = String(task.uid ?? photo.userId ?? '').trim();
          // Every upload must be attributed to a real account — including
          // community_photos, which previously skipped this guard.
          if (!uid || uid === 'unknown' || uid === 'local-user') {
            const message = 'Sign in is required to upload this photo.';
            await ImageStorage.updatePhoto(task.photoId, {
              status: 'error',
              error: message,
              retryCount: MAX_RETRY_COUNT,
            });
            await removeTask(task.photoId);
            void recordRuntimeTrace({
              screen: 'UploadQueue.process',
              action: 'missing_uid',
              status: 'fail',
              feature: 'profile',
              stage: 'uid_guard',
              details: { photoId: task.photoId, collection, userId: photo.userId ?? null },
            });
            safeLogError('UploadQueue.process.missing_uid', new Error(message), { photoId: task.photoId, collection });
            continue;
          }

          const defaultTarget = collection === 'community_photos' ? 'gallery_public' : 'my_photos';
          const result = await uploadPhotoWithEngine({
            localUri: task.localUri,
            uid,
            collection,
            compressedUri: task.compressedUri,
            metadata: task.metadata
              ? {
                  uploadedBy: task.metadata.uploadedBy,
                  title: task.metadata.title,
                  description: task.metadata.description,
                  sourceScreen: task.metadata.sourceScreen,
                  sourceScreenLabel: task.metadata.sourceScreenLabel,
                  sourceFeature: task.metadata.sourceFeature,
                  locationLabel: task.metadata.locationLabel,
                  locationType: task.metadata.locationType,
                  target: defaultTarget,
                }
              : { target: defaultTarget },
            onProgress: (percent) => {
              void ImageStorage.updatePhoto(task.photoId, { progress: percent });
            },
          });

          // Cache compressed file path in the task so retries skip re-compression
          if (result.compressedUri && result.compressedUri !== task.compressedUri) {
            await updateTask({ ...task, compressedUri: result.compressedUri });
          }

          void recordRuntimeTrace({
            screen: 'UploadQueue.process',
            action: 'task_complete',
            status: 'success',
            feature: 'profile',
            stage: 'task_complete',
            firebasePath: result.storagePath,
            details: { photoId: task.photoId, storagePath: result.storagePath, rtdbId: result.rtdbId },
          });

          // Cancelled by the user while the upload was in flight: the file/record
          // already exist in Storage/RTDB — delete them instead of committing.
          if (cancelledIds.has(task.photoId)) {
            cancelledIds.delete(task.photoId);
            await deleteEngineUpload({ storagePath: result.storagePath, rtdbId: result.rtdbId, collection, uid });
            await ImageStorage.updatePhoto(task.photoId, { deleted: true }).catch(() => {});
            await removeTask(task.photoId);
            void recordRuntimeTrace({
              screen: 'UploadQueue.process',
              action: 'task_cancelled',
              status: 'success',
              feature: 'profile',
              stage: 'cancelled_after_upload',
              details: { photoId: task.photoId, storagePath: result.storagePath, rtdbId: result.rtdbId },
            });
            continue;
          }

          // If Storage upload succeeded but getDownloadURL failed — treat as error.
          // A localUri stored as imageUrl would be sent to Firebase and shown as
          // a broken photo to all other users (BUG-PHOTO-01).
          if (!result.downloadUrl) {
            const retryCount = task.retryCount + 1;
            await ImageStorage.updatePhoto(task.photoId, {
              status: retryCount >= MAX_RETRY_COUNT ? 'error' : 'queued',
              error: 'Upload succeeded but download URL was not returned. Retrying.',
              retryCount,
            });
            if (retryCount >= MAX_RETRY_COUNT) {
              await removeTask(task.photoId);
            } else {
              await updateTask({ ...task, retryCount, updatedAt: Date.now() });
            }
            safeLogError('UploadQueue.process.no_download_url', new Error('downloadUrl missing after upload'), { photoId: task.photoId, storagePath: result.storagePath });
            continue;
          }
          await ImageStorage.updatePhoto(task.photoId, {
            imageUrl: result.downloadUrl,
            storagePath: result.storagePath,
            status: 'uploaded',
            moderationStatus: collection === 'community_photos' ? 'pending' : 'not_submitted',
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
          if (retryCount >= MAX_RETRY_COUNT) {
            await removeTask(task.photoId);
          } else {
            await updateTask({ ...task, retryCount, updatedAt: Date.now() });
          }
          safeLogError('UploadQueue.process.upload', error, { photoId: task.photoId, retryCount });
        }
      }
    } finally {
      processing = false;
      if (pendingRerun) {
        pendingRerun = false;
        void this.process().catch((error) => safeLogError('UploadQueue.process.rerun', error));
      }
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
