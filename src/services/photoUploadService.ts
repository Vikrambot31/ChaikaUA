import * as FileSystem from 'expo-file-system';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { uniqueId } from '../utils/cryptoId';
import { compressImage, getContentType, getPhotoFileExtension } from '../utils/imageCompressor';
import { safeLogError } from '../utils/errorLogger';
import { NATIVE_UPLOAD_NAMESPACES } from '../utils/featureFlags';
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
  if (NATIVE_UPLOAD_NAMESPACES.has(options.namespace)) {
    return uploadViaFileSystem(localUri, options);
  }

  return uploadViaBlobFetch(localUri, options);
}

async function uploadViaFileSystem(
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
  const bucket = storage.app.options.storageBucket;
  const encodedPath = encodeURIComponent(storagePath);
  const fileRef = storageRef(storage, storagePath);

  void recordRuntimeTrace({
    screen: sourceLabel,
    action: 'native_upload_engine_start',
    status: 'start',
    feature,
    stage: 'native_engine_start',
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
    const contentType = getContentType(compressedUri);
    const fileInfo = await FileSystem.getInfoAsync(compressedUri);
    const fileSize = fileInfo.exists ? (fileInfo.size ?? 0) : 0;
    let lastError: unknown = null;

    if (!bucket) {
      throw new Error('Firebase Storage bucket is not configured');
    }

    if (!fileInfo.exists || fileSize <= 0) {
      throw new Error('Invalid file after compression');
    }

    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'native_upload_engine_prepared',
      status: 'success',
      feature,
      stage: 'prepareNativeFileUpload',
      firebasePath: storagePath,
      details: {
        contentType,
        size: fileSize,
        ...options.logContext,
      },
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const uploadUrl = `https://firebasestorage.googleapis.com/upload/storage/v1/b/${bucket}/o?name=${encodedPath}&uploadType=media`;
        const idToken = await user.getIdToken(attempt > 1);

        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'FileSystem.uploadAsync',
          status: attempt === 1 ? 'start' : 'progress',
          feature,
          stage: `FileSystem.uploadAsync.attempt_${attempt}`,
          firebasePath: storagePath,
          details: { attempt, attempts: maxAttempts, timeoutMs, ...options.logContext },
        });

        const result = await safePromiseTimeout(
          FileSystem.uploadAsync(uploadUrl, compressedUri, {
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            httpMethod: 'POST',
            headers: {
              'Content-Type': contentType,
              Authorization: `Bearer ${idToken}`,
            },
            sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
          }),
          timeoutMs,
          `${options.namespace}.nativeUploadPhoto:${storagePath}:attempt_${attempt}`,
        );

        if (result.status < 200 || result.status >= 300) {
          throw new Error(`Upload HTTP error: status=${result.status} body=${result.body?.slice(0, 200) ?? ''}`);
        }

        let responseData: Record<string, unknown>;
        try {
          responseData = JSON.parse(result.body) as Record<string, unknown>;
        } catch {
          // HTTP 200 but body is not valid JSON — file IS in Storage already.
          // Avoid orphaning it: resolve the download URL via SDK instead of throwing.
          void recordRuntimeTrace({
            screen: sourceLabel,
            action: 'FileSystem.uploadAsync',
            status: 'success',
            feature,
            stage: `FileSystem.uploadAsync.attempt_${attempt}`,
            firebasePath: storagePath,
            details: { attempt, attempts: maxAttempts, responseParseError: true, bodyPreview: result.body?.slice(0, 100) ?? '', ...options.logContext },
          });
          void recordRuntimeTrace({
            screen: sourceLabel,
            action: 'native_upload_engine_complete',
            status: 'success',
            feature,
            stage: 'native_engine_complete',
            firebasePath: storagePath,
            details: { contentType, size: fileSize, sdkFallback: true, ...options.logContext },
          });
          const downloadUrl = options.resolveDownloadUrl ? await getDownloadURL(fileRef) : undefined;
          return { storagePath, contentType, downloadUrl, size: fileSize };
        }

        const downloadTokens = typeof responseData.downloadTokens === 'string'
          ? responseData.downloadTokens
          : '';
        const token = downloadTokens.split(',')[0];
        const downloadUrl = token
          ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
          : options.resolveDownloadUrl
            ? await getDownloadURL(fileRef)
            : undefined;

        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'FileSystem.uploadAsync',
          status: 'success',
          feature,
          stage: `FileSystem.uploadAsync.attempt_${attempt}`,
          firebasePath: storagePath,
          details: { attempt, attempts: maxAttempts, hasDownloadUrl: Boolean(downloadUrl), ...options.logContext },
        });

        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'native_upload_engine_complete',
          status: 'success',
          feature,
          stage: 'native_engine_complete',
          firebasePath: storagePath,
          details: {
            contentType,
            size: fileSize,
            hasDownloadUrl: Boolean(downloadUrl),
            ...options.logContext,
          },
        });

        return {
          storagePath,
          contentType,
          downloadUrl,
          size: fileSize,
        };
      } catch (error) {
        lastError = error;
        void recordRuntimeTrace({
          screen: sourceLabel,
          action: 'FileSystem.uploadAsync',
          status: attempt < maxAttempts ? 'progress' : 'fail',
          feature,
          stage: `FileSystem.uploadAsync.attempt_${attempt}`,
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
      safeLogError('photoUploadService.uploadViaFileSystem', lastError, {
        stage: 'native_storage_upload',
        firebasePath: storagePath,
        storageBucket: bucket,
        authUid: user.uid,
        timeoutMs,
        attempts: maxAttempts,
        namespace: options.namespace,
        ...options.logContext,
      });
      throw lastError;
    }

    throw new Error('Native upload failed without an error');
  } catch (error) {
    void recordRuntimeTrace({
      screen: sourceLabel,
      action: 'native_upload_engine_complete',
      status: 'fail',
      feature,
      stage: 'native_engine_complete',
      firebasePath: storagePath,
      firebaseCode: extractFirebaseCode(error),
      error,
      details: {
        storageBucket: bucket || 'unknown',
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

async function uploadViaBlobFetch(
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
