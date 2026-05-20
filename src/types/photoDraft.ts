import type { PhotoSource } from '../utils/photoPicker';

export type PhotoDraftStatus = 'idle' | 'ready' | 'uploading' | 'uploaded' | 'error';

export interface PhotoDraft {
  localUri: string;
  remoteStoragePath?: string;
  source: PhotoSource;
  status: PhotoDraftStatus;
  error?: string;
}

export interface MultiPhotoDraftItem extends PhotoDraft {
  id: string;
}
