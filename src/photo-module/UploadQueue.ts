import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteObject, getStorage, ref as storageRef } from 'firebase/storage';
import { uploadAndSavePhoto } from '../services/unifiedPhotoUpload';
import { recordRuntimeTrace } from '../services/runtimeMonitorService';
import { safeLogError } from '../utils/errorLogger';
import { ImageStorage } from './ImageStorage';
import type { PhotoUploadMetadata, PhotoUploadTask } from './types';

const QUEUE_KEY = '@chaika:photo-module:upload-queue:v1';
const MAX_RETRY_COUNT = 3;
const MAX_QUEUE_ITEMS = 20;
const MAX_ERROR_LENGTH = 300;

let processing = false;

const readQueue = async (): Promise<PhotoUploadTask[]> => {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PhotoUploadTask[];
    return Array.isArray(parsed) ? parsed.filter((task) => task?.photoId && task.localUri) : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: PhotoUploadTask[]): Promise<void> => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE_ITEMS)));
};

const removeTask = async (photoId: string): Promise<void> => {
  const queue = await readQueue();
  await writeQueue(queue.filter((task) => task.photoId !== photoId));
};

const updateTask = async (task: PhotoUploadTask): Promise<void> => {
  const queue = await readQueue();
  await writeQueue(queue.map((item) => (item.photoId === task.photoId ? task : item)));
};

export const UploadQueue = {
  async enqueue(photoId: string, localUri: string, metadata?: PhotoUploadMetadata): Promise<void> {
    const now = Date.now();
    const queue = await readQueue();
    const exists = queue.some((task) => task.photoId === photoId);
    if (!exists) {
      await writeQueue([
        { photoId, localUri, retryCount: 0, createdAt: now, updatedAt: now, metadata },
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
        uriScheme: localUri.split(':')[0] || 'file',
        alreadyQueued: exists,
        hasMetadata: Boolean(metadata),
        title: metadata?.title || '(none)',
      },
    });

    void this.process().catch((error) => safeLogError('UploadQueue.enqueue.process', error));
  },

  async remove(photoId: string): Promise<void> {
    await removeTask(photoId);
  },

  async process(): Promise<void> {
    if (processing) return;
    processing = true;

    try {
      const queue = await readQueue();
      for (const task of queue) {
        const currentPhoto = await ImageStorage.getPhoto(task.photoId);
        if (!currentPhoto) {
          await removeTask(task.photoId);
          continue;
        }

        if (currentPhoto.status === 'uploaded') {
          await removeTask(task.photoId);
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
            uriScheme: task.localUri.split(':')[0] || 'file',
            retryCount: task.retryCount,
            namespace: 'user_photos',
          },
        });

        try {
          const upload = await uploadAndSavePhoto(task.localUri, {
            namespace: 'user_photos',
            resolveDownloadUrl: true,
            feature: 'profile',
            sourceLabel: 'PhotoModule.UploadQueue',
            logContext: { photoId: task.photoId, retryCount: task.retryCount },
            communityMetadata: task.metadata,
          });

          void recordRuntimeTrace({
            screen: 'UploadQueue.process',
            action: 'task_complete',
            status: 'success',
            feature: 'profile',
            stage: 'task_complete',
            firebasePath: upload.storagePath,
            details: {
              photoId: task.photoId,
              storagePath: upload.storagePath,
              rtdbWritten: upload.rtdbWritten,
              size: upload.size,
            },
          });

          await ImageStorage.updatePhoto(task.photoId, {
            imageUrl: upload.downloadUrl || '',
            storagePath: upload.storagePath,
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

  async deleteUploadedStorage(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      await deleteObject(storageRef(getStorage(), storagePath));
    } catch (error) {
      safeLogError('UploadQueue.deleteUploadedStorage', error, { storagePath });
    }
  },
};
