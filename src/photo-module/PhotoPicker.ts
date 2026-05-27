import { photoService } from '../services/photoService';
import { UploadQueue } from './UploadQueue';
import type { PhotoUploadMetadata, UserPhoto } from './types';

export const PhotoPicker = {
  async addFromLibrary(metadata?: PhotoUploadMetadata & { userId?: string; type?: string }): Promise<UserPhoto | null> {
    const photo = await photoService.addFromLibrary({
      userId: metadata?.userId || metadata?.uploadedBy || 'local-user',
      type: metadata?.type || 'gallery',
      metadata,
    });
    if (!photo) return null;
    await UploadQueue.enqueue(photo.id, photo.localUri, metadata);
    return photo;
  },
};
