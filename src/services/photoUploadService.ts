import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { uniqueId } from '../utils/cryptoId';
import { compressImage, getContentType, getPhotoFileExtension } from '../utils/imageCompressor';
import { safeLogError } from '../utils/errorLogger';
import { safePromiseTimeout } from '../utils/safePromiseTimeout';
import { recordRuntimeTrace } from './runtimeMonitorService';

const PHOTO_UPLOAD_TIMEOUT_MS = 35_000;
const PHOTO_UPLOAD_MAX_ATTEMPTS = 4;
const PHOTO_UPLOAD_BACKOFF_MS = 900;

type UploadFeature =
  | 'buy_sell'
  | 'contacts'
  | 'lost_found'
  | 'gallery'
  | 'profile'
  | 'local_business'
  | 'requests'
  | 'firebase_storage';

export interface UploadedPhotoResult {
  storagePath: string;
  contentType: string;
  downloadUrl?: string;
  size?: number;
}

export interface PhotoUploadOptions {
  namespace: string;
  timeoutMs?: number;
  maxAttempts?: number;
  logContext?: Record<string, unknown>;
  sourceLabel?: string;
  feature?: UploadFeature;
  backoffMs?: number;
  resolveDownloadUrl?: boolean;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const extractFirebaseCode = (error: unknown): string =>
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';

const mapNamespaceToFeature = (namespace: string): UploadFeature => {
  if (namespace.includes('buy_sell')) return 'buy_sell';
  if (namespace.includes('contacts')) return 'contacts';
  if (namespace.includes('lost_found')) return 'lost_found';
  if (namespace.includes('gallery')) return 'gallery';
  if (namespace.includes('profile')) return 'profile';
  if (namespace.includes('local_business')) return 'local_business';
  if (namespace.includes('requests')) return 'requests';
  return 'firebase_storage';
};

export async function uploadPhotoToNamespace(
  localUri: string,
  options: PhotoUploadOptions,
): Promise<UploadedPhotoResult> {
  const storage = getStorage();
  const user = await ensureFirebaseAuth();
  const timeoutMs = options.timeoutMs ?? PHOTO_UPLOAD_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? PHOTO_UPLOAD_MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? PHOTO_UPLOAD_BACKOFF_MS;
  const sourceLabel = options.sourceLabel ?? 'photoUploadService.uploadPhotoToNamespace';
  const feature = options.feature ?? mapNamespaceToFeature(options.namespace);
  const storagePath = `${options.namespace}/${user.uid}/${uniqueId()}.${getPhotoFileExtension(localUri)}`;

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'upload_engine_start',
    status: 'start',
    feature,
    stage: 'engine_start',
    firebasePath: storagePath,
    details: {
      uriScheme: localUri.split(':')[0] || 'file',
      attempts: maxAttempts,
      timeoutMs,
      storageRoot: options.namespace,
      uid: user.uid,
      ...options.logContext,
    },
  });

  try {
    const compressedUri = await compressImage(localUri, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.82,
    });
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    if (!blob || blob.size <= 0) {
      throw new Error('Invalid blob after compression');
    }
    const contentType = getContentType(compressedUri);
    const fileRef = storageRef(storage, storagePath);
    let lastError: unknown = null;

    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'upload_engine_prepared',
      status: 'success',
      feature,
      stage: 'preparePhotoBlob',
      firebasePath: storagePath,
      details: {
        contentType,
        size: blob.size,
        ...options.logContext,
      },
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'uploadBytes',
          status: attempt === 1 ? 'start' : 'progress',
          feature,
          stage: `uploadBytes.attempt_${attempt}`,
          firebasePath: storagePath,
          details: { attempt, attempts: maxAttempts, timeoutMs, ...options.logContext },
        });

        await safePromiseTimeout(
          uploadBytes(fileRef, blob, { contentType }),
          timeoutMs,
          `${options.namespace}.uploadPhoto:${storagePath}:attempt_${attempt}`,
        );

        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'uploadBytes',
          status: 'success',
          feature,
          stage: `uploadBytes.attempt_${attempt}`,
          firebasePath: storagePath,
          details: { attempt, attempts: maxAttempts, ...options.logContext },
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'uploadBytes',
          status: attempt < maxAttempts ? 'progress' : 'fail',
          feature,
          stage: `uploadBytes.attempt_${attempt}`,
          firebasePath: storagePath,
          firebaseCode: extractFirebaseCode(error),
          error,
          details: { attempt, attempts: maxAttempts, timeoutMs, ...options.logContext },
        });
        if (attempt < maxAttempts) {
          await delay(attempt * backoffMs);
        }
      }
    }

    if (lastError) {
      safeLogError('photoUploadService.uploadPhotoToNamespace', lastError, {
        stage: 'storage_upload',
        firebasePath: storagePath,
        storageBucket: storage.app.options.storageBucket || 'unknown',
        authUid: user.uid,
        timeoutMs,
        attempts: maxAttempts,
        namespace: options.namespace,
        ...options.logContext,
      });
      throw lastError;
    }

    let downloadUrl: string | undefined;
    if (options.resolveDownloadUrl) {
      void recordRuntimeTrace({
        screen: sourceLabel,
        action: 'getDownloadURL',
        status: 'start',
        feature,
        stage: 'getDownloadURL',
        firebasePath: storagePath,
      });
      downloadUrl = await getDownloadURL(fileRef);
      void recordRuntimeTrace({
        screen: sourceLabel,
        action: 'getDownloadURL',
        status: 'success',
        feature,
        stage: 'getDownloadURL',
        firebasePath: storagePath,
        details: { urlLength: downloadUrl.length, ...options.logContext },
      });
    }

    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'upload_engine_complete',
      status: 'success',
      feature,
      stage: 'engine_complete',
      firebasePath: storagePath,
      details: {
        contentType,
        size: blob.size,
        hasDownloadUrl: Boolean(downloadUrl),
        ...options.logContext,
      },
    });

    return {
      storagePath,
      contentType,
      downloadUrl,
      size: blob.size,
    };
  } catch (error) {
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'upload_engine_complete',
      status: 'fail',
      feature,
      stage: 'engine_complete',
      firebasePath: storagePath,
      firebaseCode: extractFirebaseCode(error),
      error,
      details: {
        storageBucket: storage.app.options.storageBucket || 'unknown',
        authUid: user.uid,
        timeoutMs,
        attempts: maxAttempts,
        namespace: options.namespace,
        ...options.logContext,
      },
    });
    throw error;
  }
}
