import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { uniqueId } from '../utils/cryptoId';
import { pickPhotoFromLibrary } from '../utils/photoPicker';
import { ImageStorage } from './ImageStorage';
import { UploadQueue } from './UploadQueue';
import type { PhotoUploadMetadata, UserPhoto } from './types';

const THUMB_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}my-photo-thumbnails/`;

const createThumbnail = async (localUri: string, photoId: string): Promise<string> => {
  if (!THUMB_DIR) return localUri;

  const thumbnail = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 360 } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: false },
  );

  const target = `${THUMB_DIR}${photoId}.jpg`;
  await FileSystem.makeDirectoryAsync(THUMB_DIR, { intermediates: true });
  await FileSystem.copyAsync({ from: thumbnail.uri, to: target });
  return target;
};

export const PhotoPicker = {
  async addFromLibrary(metadata?: PhotoUploadMetadata): Promise<UserPhoto | null> {
    const picked = await pickPhotoFromLibrary({ quality: 0.82 });
    if (!picked) return null;

    if (__DEV__) {
      console.log('[PhotoPicker] addFromLibrary picked', {
        uri: picked.uri.slice(0, 80),
        uriScheme: picked.uri.split(':')[0] || 'unknown',
        originalUri: picked.originalUri.slice(0, 80),
        width: picked.width ?? null,
        height: picked.height ?? null,
        fileName: picked.fileName ?? null,
        source: picked.source,
        hasMetadata: Boolean(metadata),
        title: metadata?.title || '(none)',
      });
    }

    const now = Date.now();
    const id = `photo_${uniqueId()}`;
    const thumbnail = await createThumbnail(picked.uri, id).catch(() => picked.uri);

    if (__DEV__) {
      console.log('[PhotoPicker] addFromLibrary thumbnail created', {
        photoId: id,
        thumbnailScheme: thumbnail.split(':')[0] || 'unknown',
      });
    }

    const photo: UserPhoto = {
      id,
      localUri: picked.uri,
      imageUrl: '',
      status: 'queued',
      thumbnail,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
    };

    await ImageStorage.addPhoto(photo);
    await UploadQueue.enqueue(photo.id, photo.localUri, metadata);
    return photo;
  },
};
