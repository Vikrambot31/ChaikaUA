/** 'local' = compressed and saved on device, not yet enqueued for Firebase upload */
export type PhotoUploadStatus = 'local' | 'queued' | 'uploading' | 'uploaded' | 'error';

export type PhotoModerationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

/**
 * TZ_4 engine-level states covering the full lifecycle:
 * pick → validate → upload → RTDB pending → moderation
 */
export type EngineUploadState =
  | 'picking'
  | 'validating'
  | 'uploading'
  | 'pending'    // uploaded + RTDB written, awaiting moderator
  | 'approved'   // moderator approved
  | 'rejected'   // moderator rejected
  | 'failed';    // upload failed after all retries

export type UserPhoto = {
  id: string;
  userId?: string;
  localUri: string;
  imageUrl: string;
  status: PhotoUploadStatus;
  thumbnail: string;
  fileName?: string;
  filePath?: string;
  previewPath?: string;
  type?: string;
  width?: number;
  height?: number;
  size?: number;
  moderationStatus?: PhotoModerationStatus;
  deleted?: boolean;
  storagePath?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  retryCount?: number;
  progress?: number;
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
  /** Cached compressed file URI from a previous attempt (avoids re-compression on retry). */
  compressedUri?: string;
  /** Storage/RTDB collection, e.g. 'community_photos' or 'user_photos'. */
  collection?: string;
  uid?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: PhotoUploadMetadata;
};

export type MyPhotosScreenParams = {
  selectMode?: boolean;
};
