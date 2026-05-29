/**
 * TZ_4 — Unified Photo Upload Engine
 *
 * Single lifecycle path for all photo uploads in the app:
 *   PICK → VALIDATE → UPLOAD (Storage) → METADATA (RTDB pending) → MODERATION
 *
 * Replaces the two parallel engines that existed before:
 *   - photoService.ts  (user gallery path)
 *   - unifiedPhotoUpload.ts (community photo path)
 *
 * Callers:
 *   - UploadQueue (offline queue for personal/gallery photos)
 *   - PhotoUploadField / Zagruzka-Foto (community public photos)
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { push, ref } from 'firebase/database';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { database, storage } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { uploadPhotoToNamespace } from '../services/photoUploadService';
import { recordRuntimeTrace } from '../services/runtimeMonitorService';
import { safeLogError } from '../utils/errorLogger';
import type { EngineUploadState } from './types';

// ─── Constraints ──────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

// Upload: 3 attempts, exponential back-off 1s → 3s → 9s
const MAX_UPLOAD_ATTEMPTS = 3;
const UPLOAD_BACKOFF_BASE_MS = 1000;
const UPLOAD_BACKOFF_MULTIPLIER = 3;

// ─── Public types ─────────────────────────────────────────────────────────────

export type { EngineUploadState };

export interface EngineUploadOptions {
  localUri: string;
  uid: string;
  /**
   * Firebase Storage namespace AND RTDB collection prefix.
   * Common values:
   *   'community_photos'  — public gallery, full moderation record
   *   'user_photos'       — personal gallery, lightweight record
   */
  collection: string;
  metadata?: {
    title?: string;
    description?: string;
    uploadedBy?: string;
    /** 'gallery_public' (default) | 'my_photos' */
    target?: 'gallery_public' | 'my_photos';
    sourceScreen?: string;
    sourceScreenLabel?: string;
    sourceFeature?: string;
    locationLabel?: string;
    locationType?: 'building' | 'place';
  };
  /** Called with 0–100 as upload progresses. */
  onProgress?: (percent: number) => void;
}

export interface EngineUploadResult {
  storagePath: string;
  /** Push-key of the newly created RTDB record. */
  rtdbId: string;
  downloadUrl?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export async function validateLocalPhoto(localUri: string): Promise<ValidationResult> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? '';
  // Only reject if ext looks like a real extension (≤5 chars). content:// URIs
  // on Android often have no extension — skip the check in that case.
  if (ext && ext.length <= 5 && !SUPPORTED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported format: .${ext}. Use jpg/png/webp/heic.` };
  }

  let size = 0;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    size = info.exists ? (info.size ?? 0) : 0;
  } catch {
    return { ok: false, error: 'Cannot read file info.' };
  }

  if (size <= 0) {
    return { ok: false, error: 'File is empty.' };
  }
  if (size > MAX_FILE_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `File too large: ${mb} MB (max 10 MB).` };
  }

  return { ok: true };
}

// ─── Upload Engine ────────────────────────────────────────────────────────────

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const deleteUploadedStorageQuietly = async (storagePath: string, context: Record<string, unknown>): Promise<void> => {
  if (!storagePath) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch (error) {
    safeLogError('PhotoUploadEngine.cleanup_storage', error, { storagePath, ...context });
  }
};

/**
 * Full lifecycle upload:
 *  1. Validate locally (size, format)
 *  2. Upload to Firebase Storage with exponential back-off retry
 *  3. Write pending RTDB metadata entry
 */
export async function uploadPhotoWithEngine(
  options: EngineUploadOptions,
): Promise<EngineUploadResult> {
  const { localUri, uid, collection, metadata, onProgress } = options;
  const sourceLabel = 'PhotoUploadEngine.uploadPhotoWithEngine';

  onProgress?.(0);

  // ── Step 1: validate ────────────────────────────────────────────────────────
  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'engine_validate',
    status: 'start',
    feature: 'gallery',
    stage: 'validate',
    details: { uid, collection, uriScheme: localUri.split(':')[0] ?? 'file' },
  });

  const validation = await validateLocalPhoto(localUri);
  if (!validation.ok) {
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_validate',
      status: 'fail',
      feature: 'gallery',
      stage: 'validate_failed',
      details: { validationError: validation.error },
    });
    throw new Error(validation.error ?? 'Photo validation failed');
  }

  onProgress?.(10);

  // ── Step 2: upload to Firebase Storage ─────────────────────────────────────
  const user = await ensureFirebaseAuth();
  if (!user) throw new Error('Sign in required to upload photos.');

  let storagePath = '';
  let downloadUrl: string | undefined;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    // Give visual feedback that upload is in progress (not frozen at 10%)
    onProgress?.(10 + attempt * 20); // 30% → 50% → 70% across attempts
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_upload',
      status: attempt === 1 ? 'start' : 'progress',
      feature: 'gallery',
      stage: `upload.attempt_${attempt}`,
      details: { uid, collection, attempt },
    });

    try {
      const result = await uploadPhotoToNamespace(localUri, {
        namespace: collection,
        // Let the low-level engine do a single attempt per outer attempt
        maxAttempts: 1,
        resolveDownloadUrl: true,
        sourceLabel,
        logContext: { uid, collection, engineAttempt: attempt },
      });
      storagePath = result.storagePath;
      downloadUrl = result.downloadUrl;
      lastError = null;

      void recordRuntimeTrace({
        screen: sourceLabel,
        action: 'engine_upload',
        status: 'success',
        feature: 'gallery',
        stage: `upload.attempt_${attempt}`,
        firebasePath: storagePath,
        details: { attempt, hasDownloadUrl: Boolean(downloadUrl) },
      });
      break;
    } catch (err) {
      lastError = err;
      void recordRuntimeTrace({
        screen: sourceLabel,
        action: 'engine_upload',
        status: attempt < MAX_UPLOAD_ATTEMPTS ? 'progress' : 'fail',
        feature: 'gallery',
        stage: `upload.attempt_${attempt}`,
        error: err,
        details: { attempt, maxAttempts: MAX_UPLOAD_ATTEMPTS },
      });

      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        // Exponential back-off: 1s, 3s, 9s
        const backoff = UPLOAD_BACKOFF_BASE_MS * Math.pow(UPLOAD_BACKOFF_MULTIPLIER, attempt - 1);
        await delay(backoff);
      }
    }
  }

  if (lastError || !storagePath) {
    safeLogError(sourceLabel, lastError ?? new Error('Upload failed without error'), {
      uid,
      collection,
      stage: 'upload_failed_after_retries',
    });
    throw lastError ?? new Error('Upload failed');
  }

  // Guard: if Storage accepted the file but getDownloadURL failed, abort here.
  // Writing an RTDB record with imageUri: storagePath would create an orphan
  // record that other users cannot render (storagePath is not a public URL).
  if (!downloadUrl) {
    const err = new Error('Upload succeeded but download URL could not be resolved.');
    safeLogError(sourceLabel, err, { uid, collection, storagePath, stage: 'missing_download_url' });
    await deleteUploadedStorageQuietly(storagePath, { uid, collection, stage: 'missing_download_url_cleanup' });
    throw err;
  }

  onProgress?.(85);

  // ── Request photos: skip thumbnail + RTDB write — the form submission already
  // saves storagePath in the requests/{key} node; no separate RTDB record needed.
  if (collection === 'requests') {
    onProgress?.(100);
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_complete',
      status: 'success',
      feature: 'gallery',
      stage: 'complete_fast',
      firebasePath: storagePath,
      details: { storagePath, collection, skippedRtdb: true, skippedThumbnail: true },
    });
    return { storagePath, rtdbId: '', downloadUrl };
  }

  // ── Step 2.5: generate and upload 360px thumbnail ───────────────────────────
  let thumbnailUrl: string | undefined;
  let thumbnailStoragePath = '';
  try {
    const thumbResult = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 360 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    const thumbUpload = await uploadPhotoToNamespace(thumbResult.uri, {
      namespace: `thumbnails/${collection}`,
      maxAttempts: 1,
      resolveDownloadUrl: true,
      sourceLabel,
      logContext: { uid, collection, role: 'thumbnail' },
    });
    thumbnailUrl = thumbUpload.downloadUrl;
    thumbnailStoragePath = thumbUpload.storagePath;
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_thumbnail',
      status: 'success',
      feature: 'gallery',
      stage: 'thumbnail_uploaded',
      details: { hasThumbnailUrl: Boolean(thumbnailUrl) },
    });
  } catch (thumbErr) {
    safeLogError(`${sourceLabel}.thumbnail`, thumbErr, { uid, collection, stage: 'thumbnail_upload_failed' });
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_thumbnail',
      status: 'fail',
      feature: 'gallery',
      stage: 'thumbnail_upload_failed',
      error: thumbErr,
    });
  }

  // ── Step 3: write RTDB pending entry ────────────────────────────────────────
  const now = Date.now();
  const rtdbCollection =
    collection === 'community_photos' ? 'community_photos' :
    collection === 'requests'         ? `request_photos/${uid}` :
                                        `user_photos/${uid}`;

  const isRequestPhoto = collection === 'requests';
  const isPersonalPhoto = collection !== 'community_photos' && !isRequestPhoto;
  const rtdbPayload: Record<string, unknown> = {
    storagePath,
    imageUri: downloadUrl,
    status: isPersonalPhoto ? 'saved' : 'pending',
    uploadStatus: 'saved',
    moderationStatus: isPersonalPhoto ? 'not_submitted' : 'pending',
    uploadedAt: now,
    createdAt: now,
    updatedAt: now,
    uid: user.uid,
    userId: user.uid,
    uploadedBy: metadata?.uploadedBy ?? user.email ?? user.uid,
    target: metadata?.target ?? (collection === 'community_photos' ? 'gallery_public' : 'my_photos'),
    ...(isRequestPhoto ? { sourceScreen: 'HelpNeighborsScreen', sourceScreenLabel: 'Помощь соседям' } : {}),
    ...(metadata?.title ? { title: metadata.title } : {}),
    ...(metadata?.description ? { description: metadata.description } : {}),
    ...(metadata?.sourceScreen ? { sourceScreen: metadata.sourceScreen } : {}),
    ...(metadata?.sourceScreenLabel ? { sourceScreenLabel: metadata.sourceScreenLabel } : {}),
    ...(metadata?.sourceFeature ? { sourceFeature: metadata.sourceFeature } : {}),
    ...(metadata?.locationLabel ? { locationLabel: metadata.locationLabel } : {}),
    ...(metadata?.locationType ? { locationType: metadata.locationType } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'engine_rtdb_write',
    status: 'start',
    feature: 'gallery',
    stage: 'rtdb_pending',
    firebasePath: rtdbCollection,
    details: { storagePath, target: rtdbPayload.target },
  });

  let rtdbId = '';
  try {
    const newRef = await push(ref(database, rtdbCollection), rtdbPayload);
    rtdbId = newRef.key ?? '';

    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_rtdb_write',
      status: 'success',
      feature: 'gallery',
      stage: 'rtdb_pending',
      firebasePath: `${rtdbCollection}/${rtdbId}`,
      details: { rtdbId },
    });
  } catch (rtdbErr) {
    await deleteUploadedStorageQuietly(storagePath, { uid, collection, stage: 'rtdb_write_failed_cleanup' });
    await deleteUploadedStorageQuietly(thumbnailStoragePath, { uid, collection, stage: 'rtdb_write_failed_thumbnail_cleanup' });
    safeLogError(`${sourceLabel}.rtdb_write`, rtdbErr, {
      storagePath,
      collection,
      uid,
      stage: 'rtdb_write_failed',
    });
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'engine_rtdb_write',
      status: 'fail',
      feature: 'gallery',
      stage: 'rtdb_pending',
      error: rtdbErr,
      details: { storagePath },
    });
    throw rtdbErr;
  }

  onProgress?.(100);

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'engine_complete',
    status: 'success',
    feature: 'gallery',
    stage: 'complete',
    firebasePath: storagePath,
    details: { storagePath, rtdbId, collection },
  });

  return { storagePath, rtdbId, downloadUrl };
}
