import { ImageStorage } from './ImageStorage';
import { UploadQueue } from './UploadQueue';

const POLL_MS = 1200;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForUploadedStoragePaths(
  photoIds: string[],
  pathPattern: RegExp,
  timeoutMs = 12000,
): Promise<string[]> {
  if (photoIds.length === 0) return [];

  const startedAt = Date.now();
  void UploadQueue.process();

  while (Date.now() - startedAt < timeoutMs) {
    const photos = await Promise.all(photoIds.map((photoId) => ImageStorage.getPhoto(photoId)));
    const uploaded = photos
      .map((photo) => (typeof photo?.storagePath === 'string' ? photo.storagePath : ''))
      .filter((path): path is string => Boolean(path) && pathPattern.test(path));

    if (uploaded.length > 0) {
      return uploaded;
    }

    await delay(POLL_MS);
    void UploadQueue.process();
  }

  return [];
}

export async function waitForFirstUploadedStoragePath(
  photoIds: string[],
  pathPattern: RegExp,
  timeoutMs = 180000,
): Promise<string | null> {
  const uploadedPaths = await waitForUploadedStoragePaths(photoIds, pathPattern, timeoutMs);
  return uploadedPaths[0] || null;
}
