import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_API, LOCAL_MODE } from '../local/LOCAL_MODE';
import { ImageStorage } from '../photo-module/ImageStorage';
import { UploadQueue } from '../photo-module/UploadQueue';
import type { PhotoModerationStatus, PhotoUploadMetadata, UserPhoto } from '../photo-module/types';
import { uniqueId } from '../utils/cryptoId';
import { getContentType, getPhotoFileExtension, compressImage } from '../utils/imageCompressor';
import { pickPhotoFromLibrary, takePhotoWithCamera, type PhotoSource } from '../utils/photoPicker';
import { safeLogError } from '../utils/errorLogger';
import { uploadAndSavePhoto } from './unifiedPhotoUpload';

const PREVIEW_WIDTH = 300;
const FULL_MAX_SIZE = 1600;
const FULL_QUALITY = 0.8;
const PREVIEW_QUALITY = 0.75;
const PHOTO_CACHE_KEY = '@chaika:photo-service:cache:v1';

export type PhotoType =
  | 'avatar'
  | 'gallery'
  | 'buy_sell'
  | 'problems'
  | 'lost_found'
  | 'profile'
  | 'contacts'
  | 'announcements'
  | 'dating'
  | 'local_business'
  | 'requests'
  | 'user_photos';

export type LocalServerPhoto = {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  previewPath: string;
  type: string;
  createdAt: number;
  width: number;
  height: number;
  size: number;
  moderationStatus: PhotoModerationStatus;
  deleted: boolean;
};

export type PhotoUploadResult = {
  photoId: string;
  fileName: string;
  filePath: string;
  previewPath: string;
  imageUrl: string;
  storagePath: string;
  width?: number;
  height?: number;
  size?: number;
};

type AddPhotoOptions = {
  userId: string;
  type?: PhotoType | string;
  metadata?: PhotoUploadMetadata;
  source?: PhotoSource;
  moderationStatus?: PhotoModerationStatus;
};

type PreparedPhoto = {
  id: string;
  userId: string;
  type: string;
  localUri: string;
  previewUri: string;
  fileName: string;
  width?: number;
  height?: number;
  size?: number;
  moderationStatus?: PhotoModerationStatus;
};

const safeType = (type?: string): string => (type || 'gallery').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

const toServerUrl = (path: string): string => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || /^file:\/\//i.test(path)) return path;
  return `${LOCAL_API}${path.startsWith('/') ? path : `/${path}`}`;
};

const getFileInfoSize = async (uri: string): Promise<number> => {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? (info.size ?? 0) : 0;
};

const createPreview = async (uri: string): Promise<ImageManipulator.ImageResult> =>
  ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PREVIEW_WIDTH } }],
    { compress: PREVIEW_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: false },
  );

const readAsBase64 = async (uri: string): Promise<string> =>
  FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

const cacheServerPhoto = async (photo: LocalServerPhoto): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(PHOTO_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) as Record<string, LocalServerPhoto> : {};
    cached[photo.id] = photo;
    await AsyncStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Local image metadata cache is best-effort only.
  }
};

async function preparePhoto(localUri: string, options: AddPhotoOptions): Promise<PreparedPhoto> {
  const id = `photo_${uniqueId()}`;
  const compressedUri = await compressImage(localUri, {
    maxWidth: FULL_MAX_SIZE,
    maxHeight: FULL_MAX_SIZE,
    quality: FULL_QUALITY,
  });
  const preview = await createPreview(compressedUri);
  const size = await getFileInfoSize(compressedUri);
  const extension = getPhotoFileExtension(compressedUri);

  return {
    id,
    userId: options.userId,
    type: safeType(options.type),
    localUri: compressedUri,
    previewUri: preview.uri,
    fileName: `${id}.${extension}`,
    width: preview.width,
    height: preview.height,
    size,
    moderationStatus: options.moderationStatus,
  };
}

async function createLocalRecord(prepared: PreparedPhoto): Promise<UserPhoto> {
  const now = Date.now();
  const photo: UserPhoto = {
    id: prepared.id,
    userId: prepared.userId,
    localUri: prepared.localUri,
    imageUrl: '',
    thumbnail: prepared.previewUri,
    fileName: prepared.fileName,
    type: prepared.type,
    width: prepared.width,
    height: prepared.height,
    size: prepared.size,
    moderationStatus: prepared.moderationStatus ?? 'pending',
    deleted: false,
    status: 'local',
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
  };
  await ImageStorage.addPhoto(photo);
  return photo;
}

async function uploadToLocalServer(photo: UserPhoto): Promise<PhotoUploadResult> {
  const userId = photo.userId || 'local-user';
  const localUri = photo.localUri;
  const previewUri = photo.thumbnail || photo.localUri;
  const fileBase64 = await readAsBase64(localUri);
  const previewBase64 = await readAsBase64(previewUri);
  const response = await fetch(`${LOCAL_API}/photos/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: photo.id,
      userId,
      type: safeType(photo.type),
      fileName: photo.fileName || `${photo.id}.jpg`,
      contentType: getContentType(localUri),
      previewContentType: 'image/jpeg',
      fileBase64,
      previewBase64,
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      size: photo.size ?? await getFileInfoSize(localUri),
      moderationStatus: photo.moderationStatus ?? 'pending',
    }),
  });

  if (!response.ok) {
    throw new Error(`local photo upload failed: ${response.status}`);
  }

  const data = await response.json() as LocalServerPhoto;
  await cacheServerPhoto(data);
  return {
    photoId: data.id,
    fileName: data.fileName,
    filePath: data.filePath,
    previewPath: data.previewPath,
    imageUrl: toServerUrl(data.filePath),
    storagePath: data.filePath,
    width: data.width,
    height: data.height,
    size: data.size,
  };
}

async function uploadToRemoteStorage(photo: UserPhoto): Promise<PhotoUploadResult> {
  const namespace = `uploads/users/${photo.userId || 'user'}/${safeType(photo.type)}`;
  const upload = await uploadAndSavePhoto(photo.localUri, {
    namespace,
    resolveDownloadUrl: true,
    feature: 'profile',
    sourceLabel: 'photoService.uploadToRemoteStorage',
    logContext: { photoId: photo.id, type: photo.type },
  });

  return {
    photoId: photo.id,
    fileName: photo.fileName || `${photo.id}.${getPhotoFileExtension(photo.localUri)}`,
    filePath: upload.storagePath,
    previewPath: photo.thumbnail,
    imageUrl: upload.downloadUrl || '',
    storagePath: upload.storagePath,
    width: photo.width,
    height: photo.height,
    size: upload.size ?? photo.size,
  };
}

export const photoService = {
  async addFromLibrary(options: AddPhotoOptions): Promise<UserPhoto | null> {
    const picked = await pickPhotoFromLibrary({ quality: FULL_QUALITY });
    if (!picked) return null;
    return this.addLocalPhoto(picked.uri, options);
  },

  async addFromCamera(options: AddPhotoOptions): Promise<UserPhoto | null> {
    const picked = await takePhotoWithCamera({ quality: FULL_QUALITY });
    if (!picked) return null;
    return this.addLocalPhoto(picked.uri, { ...options, source: 'camera' });
  },

  async addLocalPhoto(localUri: string, options: AddPhotoOptions): Promise<UserPhoto> {
    const prepared = await preparePhoto(localUri, options);
    return createLocalRecord(prepared);
  },

  async upload(photoId: string): Promise<PhotoUploadResult> {
    const photo = await ImageStorage.getPhoto(photoId);
    if (!photo) throw new Error(`photo not found: ${photoId}`);
    await ImageStorage.updatePhoto(photoId, { status: 'uploading', error: undefined });

    try {
      const result = LOCAL_MODE ? await uploadToLocalServer(photo) : await uploadToRemoteStorage(photo);
      await ImageStorage.updatePhoto(photoId, {
        imageUrl: result.imageUrl,
        storagePath: result.storagePath,
        filePath: result.filePath,
        previewPath: result.previewPath,
        fileName: result.fileName,
        width: result.width,
        height: result.height,
        size: result.size,
        status: 'uploaded',
        error: undefined,
      });
      return result;
    } catch (error) {
      await ImageStorage.updatePhoto(photoId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      safeLogError('photoService.upload', error, { photoId });
      throw error;
    }
  },

  async fetchUserPhotos(userId: string): Promise<LocalServerPhoto[]> {
    if (!LOCAL_MODE) {
      return [];
    }
    const response = await fetch(`${LOCAL_API}/photos?userId=${encodeURIComponent(userId)}&deleted=false`);
    if (!response.ok) throw new Error(`fetch photos failed: ${response.status}`);
    return response.json() as Promise<LocalServerPhoto[]>;
  },

  async delete(photoId: string): Promise<void> {
    await UploadQueue.remove(photoId);
    await ImageStorage.updatePhoto(photoId, { deleted: true });
    if (LOCAL_MODE) {
      const response = await fetch(`${LOCAL_API}/photos/${encodeURIComponent(photoId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`soft delete failed: ${response.status}`);
      }
    }
  },

  async retry(photoId: string): Promise<PhotoUploadResult> {
    return this.upload(photoId);
  },

  async linkPhoto(photoId: string, targetType: string, targetId?: string): Promise<void> {
    if (!LOCAL_MODE) return;
    await fetch(`${LOCAL_API}/photo_links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `link_${uniqueId()}`,
        photoId,
        targetType,
        targetId: targetId || '',
        createdAt: Date.now(),
      }),
    }).catch((error) => safeLogError('photoService.linkPhoto', error, { photoId, targetType, targetId }));
  },
};

export default photoService;
