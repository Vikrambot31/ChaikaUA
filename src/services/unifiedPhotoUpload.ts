/**
 * Unified photo upload pipeline: Storage upload + optional RTDB entry creation.
 *
 * Use this instead of calling uploadPhotoToNamespace() directly whenever a
 * community_photos record must be visible to the moderator after upload.
 *
 * For other namespaces (lost_found, buy_sell, etc.) the RTDB write is handled
 * by the corresponding service — this function only performs the Storage upload
 * and returns the result so the caller can attach it to their record.
 */

import { photoAPI } from '../firebase-config';
import { uploadPhotoToNamespace, type UploadedPhotoResult, type PhotoUploadOptions } from './photoUploadService';
import { recordRuntimeTrace } from './runtimeMonitorService';
import { safeLogError } from '../utils/errorLogger';

export interface CommunityPhotoMetadata {
  title?: string;
  description?: string;
  uploadedBy?: string;
  target?: 'gallery_public';
  locationLabel?: string;
  locationType?: 'building' | 'place';
}

export interface UploadAndSaveOptions extends Omit<PhotoUploadOptions, 'namespace'> {
  namespace: string;
  communityMetadata?: CommunityPhotoMetadata;
}

export interface UploadAndSaveResult extends UploadedPhotoResult {
  /** True when an RTDB entry was successfully created (community_photos only). */
  rtdbWritten: boolean;
}

/**
 * Upload a photo to Firebase Storage and — for community_photos namespace —
 * also create a pending RTDB entry so the moderator can see it.
 *
 * RTDB write failures are logged but do NOT throw; the caller always receives
 * the Storage result. This lets the UI show "uploaded" even if the RTDB write
 * fails due to a transient error, and the failure is recorded in runtimeMonitor.
 */
export async function uploadAndSavePhoto(
  localUri: string,
  options: UploadAndSaveOptions,
): Promise<UploadAndSaveResult> {
  const sourceLabel = options.sourceLabel ?? 'unifiedPhotoUpload.uploadAndSavePhoto';

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'uploadAndSave_start',
    status: 'start',
    feature: 'gallery',
    stage: 'start',
    details: {
      namespace: options.namespace,
      uriScheme: localUri.split(':')[0] || 'file',
      hasCommunityMeta: Boolean(options.communityMetadata),
      ...options.logContext,
    },
  });

  // ── Step 1: Upload to Firebase Storage ──────────────────────────────────────
  const upload = await uploadPhotoToNamespace(localUri, {
    ...options,
    resolveDownloadUrl: options.resolveDownloadUrl ?? true,
    sourceLabel,
  });

  // ── Step 2: Write RTDB entry (community_photos only) ────────────────────────
  let rtdbWritten = false;

  if (options.namespace === 'community_photos') {
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'rtdb_write',
      status: 'start',
      feature: 'gallery',
      stage: 'photoAPI.addPhoto',
      firebasePath: `community_photos/<pending>`,
      details: {
        storagePath: upload.storagePath,
        title: options.communityMetadata?.title || '(default)',
        ...options.logContext,
      },
    });

    try {
      const result = await photoAPI.addPhoto({
        title: options.communityMetadata?.title || 'Фото',
        description: options.communityMetadata?.description || '',
        imageUri: upload.downloadUrl || upload.storagePath,
        storagePath: upload.storagePath,
        uploadedBy: options.communityMetadata?.uploadedBy,
        target: options.communityMetadata?.target || 'gallery_public',
        locationLabel: options.communityMetadata?.locationLabel,
        locationType: options.communityMetadata?.locationType,
      });

      if (result.success) {
        rtdbWritten = true;
        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'rtdb_write',
          status: 'success',
          feature: 'gallery',
          stage: 'photoAPI.addPhoto',
          firebasePath: 'community_photos/<new>',
          details: { storagePath: upload.storagePath, ...options.logContext },
        });
      } else {
        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'rtdb_write',
          status: 'fail',
          feature: 'gallery',
          stage: 'photoAPI.addPhoto',
          details: { apiError: result.error, storagePath: upload.storagePath, ...options.logContext },
        });
        safeLogError(
          'unifiedPhotoUpload.rtdb_write',
          new Error(result.error || 'rtdb_write_failed'),
          { storagePath: upload.storagePath, namespace: options.namespace, ...options.logContext },
        );
      }
    } catch (rtdbError) {
      void recordRuntimeTrace({
        screen: sourceLabel,
        action: 'rtdb_write',
        status: 'fail',
        feature: 'gallery',
        stage: 'photoAPI.addPhoto',
        error: rtdbError,
        details: { storagePath: upload.storagePath, ...options.logContext },
      });
      safeLogError(
        'unifiedPhotoUpload.rtdb_write',
        rtdbError,
        { storagePath: upload.storagePath, namespace: options.namespace, ...options.logContext },
      );
    }
  }

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'uploadAndSave_complete',
    status: 'success',
    feature: 'gallery',
    stage: 'complete',
    details: {
      storagePath: upload.storagePath,
      namespace: options.namespace,
      rtdbWritten,
      ...options.logContext,
    },
  });

  return { ...upload, rtdbWritten };
}
