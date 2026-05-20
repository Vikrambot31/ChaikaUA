export type PhotoUploadStatus = 'queued' | 'uploading' | 'uploaded' | 'error';

export type UserPhoto = {
  id: string;
  localUri: string;
  imageUrl: string;
  status: PhotoUploadStatus;
  thumbnail: string;
  storagePath?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  retryCount?: number;
};

/** Optional metadata passed through the upload queue for RTDB entry creation. */
export type PhotoUploadMetadata = {
  title?: string;
  description?: string;
  uploadedBy?: string;
  locationLabel?: string;
  locationType?: 'building' | 'place';
};

export type PhotoUploadTask = {
  photoId: string;
  localUri: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: PhotoUploadMetadata;
};

export type MyPhotosScreenParams = {
  selectMode?: boolean;
};
