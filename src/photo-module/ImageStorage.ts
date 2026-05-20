import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserPhoto } from './types';

const STORAGE_KEY = '@chaika:photo-module:user-photos:v1';
const MAX_STORED_PHOTOS = 80;
const MAX_ERROR_LENGTH = 300;

type Listener = (photos: UserPhoto[]) => void;

let memoryPhotos: UserPhoto[] | null = null;
const listeners = new Set<Listener>();

const sortPhotos = (photos: UserPhoto[]): UserPhoto[] =>
  [...photos].sort((a, b) => b.createdAt - a.createdAt);

const notify = (photos: UserPhoto[]) => {
  const sorted = sortPhotos(photos);
  listeners.forEach((listener) => listener(sorted));
};

const readStoredPhotos = async (): Promise<UserPhoto[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as UserPhoto[];
    return Array.isArray(parsed) ? sortPhotos(parsed.filter((item) => item?.id && item.localUri)) : [];
  } catch {
    return [];
  }
};

const preparePhotoForStorage = (photo: UserPhoto): UserPhoto => ({
  ...photo,
  thumbnail: /^data:image\//i.test(photo.thumbnail || '') ? '' : photo.thumbnail,
  error: photo.error ? photo.error.slice(0, MAX_ERROR_LENGTH) : undefined,
});

const writePhotos = async (photos: UserPhoto[]): Promise<UserPhoto[]> => {
  const sorted = sortPhotos(photos).slice(0, MAX_STORED_PHOTOS).map(preparePhotoForStorage);
  memoryPhotos = sorted;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  notify(sorted);
  return sorted;
};

export const ImageStorage = {
  async getPhotos(): Promise<UserPhoto[]> {
    if (memoryPhotos) return sortPhotos(memoryPhotos);
    memoryPhotos = await readStoredPhotos();
    return sortPhotos(memoryPhotos);
  },

  async setPhotos(photos: UserPhoto[]): Promise<UserPhoto[]> {
    return writePhotos(photos);
  },

  async addPhoto(photo: UserPhoto): Promise<UserPhoto[]> {
    const photos = await this.getPhotos();
    return writePhotos([photo, ...photos.filter((item) => item.id !== photo.id)]);
  },

  async updatePhoto(photoId: string, patch: Partial<UserPhoto>): Promise<UserPhoto | null> {
    const photos = await this.getPhotos();
    let updated: UserPhoto | null = null;
    const next = photos.map((photo) => {
      if (photo.id !== photoId) return photo;
      updated = { ...photo, ...patch, updatedAt: Date.now() };
      return updated;
    });
    await writePhotos(next);
    return updated;
  },

  async removePhoto(photoId: string): Promise<UserPhoto | null> {
    const photos = await this.getPhotos();
    const removed = photos.find((photo) => photo.id === photoId) ?? null;
    if (!removed) return null;
    await writePhotos(photos.filter((photo) => photo.id !== photoId));
    return removed;
  },

  async getPhoto(photoId: string): Promise<UserPhoto | null> {
    const photos = await this.getPhotos();
    return photos.find((photo) => photo.id === photoId) ?? null;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    void this.getPhotos().then(listener).catch(() => listener([]));
    return () => {
      listeners.delete(listener);
    };
  },
};

export const getBestPhotoUri = (photo: UserPhoto | null | undefined): string => {
  if (!photo) return '';
  const imageUrl = typeof photo.imageUrl === 'string' ? photo.imageUrl.trim() : '';
  const thumbnail = typeof photo.thumbnail === 'string' ? photo.thumbnail.trim() : '';
  const localUri = typeof photo.localUri === 'string' ? photo.localUri.trim() : '';

  const candidates = [imageUrl, thumbnail, localUri];
  const best = candidates.find((candidate) => isRenderableImageUri(candidate)) || '';
  return best;
};

export const getPhotoThumbnailUri = (photo: UserPhoto | null | undefined): string => {
  if (!photo) return '';
  const thumbnail = typeof photo.thumbnail === 'string' ? photo.thumbnail.trim() : '';
  return isRenderableImageUri(thumbnail) ? thumbnail : getBestPhotoUri(photo);
};

const isRenderableImageUri = (value: string): boolean => (
  /^https?:\/\//i.test(value) ||
  /^file:\/\//i.test(value) ||
  /^content:\/\//i.test(value) ||
  /^asset:\/\//i.test(value) ||
  /^data:image\//i.test(value)
);
