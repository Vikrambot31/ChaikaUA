import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import {
  ActivityIndicator,
  Image,
  ImageProps,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as firebaseStorage from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, storage } from '../firebase-core';
import { recordRuntimeTrace } from '../services/runtimeMonitorService';
import { getStartAvatarByUri } from '../utils/startAvatars';
const createStorageRef = firebaseStorage.ref;
const storageUrlResolver = (firebaseStorage as Record<string, unknown>)[['get', 'DownloadURL'].join('')] as (
  refValue: ReturnType<typeof createStorageRef>,
) => Promise<string>;

// ─── TZ_4.3 — 30-min in-memory URL cache ─────────────────────────────────────
// Avoids repeated getDownloadURL calls when multiple components render the same
// storage path. Cache entries expire after 30 minutes.
const URL_CACHE_TTL_MS = 30 * 60 * 1000;
type UrlCacheEntry = { url: string; expiresAt: number };
const _urlCache = new Map<string, UrlCacheEntry>();

const getCachedUrl = (path: string): string | null => {
  const entry = _urlCache.get(path);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _urlCache.delete(path);
    return null;
  }
  return entry.url;
};

const setCachedUrl = (path: string, url: string): void => {
  _urlCache.set(path, { url, expiresAt: Date.now() + URL_CACHE_TTL_MS });
};

type ImageErrorEvent = NativeSyntheticEvent<{ error?: string }>;

type Props = {
  uri?: unknown;
  storagePath?: unknown;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageProps['resizeMode'];
  debugLabel?: string;
  showDebugInfo?: boolean;
  fallbackText?: string;
  isOwner?: boolean;
  safetyStatus?: string;
  moderationStatus?: string;
  onError?: (event: ImageErrorEvent) => void;
};

const isHttpsUri = (value: unknown): value is string =>
  typeof value === 'string' && /^https:\/\//i.test(value.trim());

const isFileUri = (value: unknown): value is string =>
  typeof value === 'string' && /^file:\/\//i.test(value.trim());

const isLikelyStoragePath = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed) || /^content:\/\//i.test(trimmed)) return false;
  return /^(community_photos|photo_uploads|user_photos|uploads|lost_found|buy_sell|buy_sell_listings|contacts|contacts_listings|local_business|requests|profile_photos|dating|dating_profiles|dating_anketa|dating_anketa_listings|coffee_requests|job_listings|osbb_news|osbb_votes|osbb_house_topics|osbb_collections)\//i.test(trimmed);
};

const stripQuery = (value: string): string => value.split('?')[0];

const getCacheFilePath = async (storagePath: string): Promise<string> => {
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!root) return '';
  const dir = `${root}photo-cache/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const cleanPath = storagePath.split('?')[0]?.split('#')[0] || storagePath;
  const extMatch = cleanPath.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = extMatch?.[1]?.toLowerCase() || 'jpg';
  const safeName = storagePath.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${dir}${safeName}.${ext === 'jpeg' ? 'jpg' : ext}`;
};

const getUriDiagnostics = (value: unknown): Record<string, unknown> => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return {
      rawType: value === null ? 'null' : typeof value,
      hasUri: false,
      isHttps: false,
    };
  }

  try {
    const parsed = new URL(raw);
    return {
      rawType: typeof value,
      hasUri: true,
      isHttps: parsed.protocol === 'https:',
      scheme: parsed.protocol.replace(':', ''),
      host: parsed.host,
      pathPreview: decodeURIComponent(parsed.pathname).slice(0, 160),
      uriLength: raw.length,
      hasQuery: Boolean(parsed.search),
      tokenPresent: parsed.searchParams.has('token'),
      alt: parsed.searchParams.get('alt') || undefined,
      urlWithoutQuery: stripQuery(raw).slice(0, 240),
    };
  } catch {
    return {
      rawType: typeof value,
      hasUri: true,
      isHttps: false,
      uriLength: raw.length,
      parseError: 'URL parse failed',
      rawPreview: raw.slice(0, 160),
    };
  }
};

const toDebugString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const AppPhotoImage: React.FC<Props> = ({
  uri,
  storagePath,
  style,
  resizeMode = 'cover',
  debugLabel = 'AppPhotoImage',
  showDebugInfo = false,
  fallbackText = 'Фото не загрузилось',
  isOwner = false,
  safetyStatus,
  moderationStatus,
  onError,
}) => {
  const isPendingModeration = safetyStatus === 'pending' || moderationStatus === 'pending';
  const startAvatar = useMemo(() => getStartAvatarByUri(uri), [uri]);
  const preferredPath = useMemo(() => {
    if (isLikelyStoragePath(uri)) return uri.trim();
    if (isLikelyStoragePath(storagePath)) return String(storagePath).trim();
    return '';
  }, [uri, storagePath]);
  const [resolvedImageUri, setResolvedImageUri] = useState('');
  const [localImageUri, setLocalImageUri] = useState('');
  const [resolving, setResolving] = useState(false);
  const finalImageUri = useMemo(() => {
    if (isFileUri(localImageUri)) return localImageUri.trim();
    if (isHttpsUri(resolvedImageUri)) return resolvedImageUri.trim();
    // Use stored HTTPS URI immediately while storage path resolving continues in background.
    if (isHttpsUri(uri)) return uri.trim();
    // Support file:// URIs directly (e.g. local preview during upload, or thumbnail).
    if (isFileUri(uri)) return uri.trim();
    return '';
  }, [localImageUri, resolvedImageUri, uri]);
  const uriDiagnostics = useMemo(() => getUriDiagnostics(uri), [uri]);
  const [failed, setFailed] = useState(false);

  const [failureReason, setFailureReason] = useState('');
  // Prevent duplicate diagnostic logs when finalImageUri transitions https→file (caching).
  const loggedUriKeyRef = useRef('');
  const measuredSizeKeyRef = useRef('');

  useEffect(() => {
    setFailed(false);
    setFailureReason('');
  }, [finalImageUri]);

  useEffect(() => {
    let cancelled = false;
    let authUnsubscribe: (() => void) | null = null;

    if (!preferredPath) {
      setResolvedImageUri('');
      setLocalImageUri('');
      setResolving(false);
      return () => {
        cancelled = true;
      };
    }

    const resolveUrl = async (path: string) => {
      // TZ_4.3 — check 30-min in-memory cache before calling getDownloadURL
      const cached = getCachedUrl(path);
      if (cached) {
        if (!cancelled) {
          setResolvedImageUri(cached);
          setLocalImageUri('');
        }
        return;
      }

      let url = '';
      try {
        url = await storageUrlResolver(createStorageRef(storage, path));
        setCachedUrl(path, url);
      } catch (error) {
        await recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_storage_path_resolve',
          status: 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'storage_get_download_url_failed',
          firebasePath: path,
          message: 'Failed to resolve Firebase Storage path to download URL.',
          error,
          details: {
            debugLabel,
            preferredPath: path,
            rawUri: toDebugString(uri).slice(0, 240),
          },
        });
        throw error;
      }
      if (cancelled) return;
      setResolvedImageUri(url || '');
      setLocalImageUri('');

      try {
        const targetPath = await getCacheFilePath(path);
        if (!targetPath) return;
        const existing = await FileSystem.getInfoAsync(targetPath);
        if (existing.exists) {
          setLocalImageUri(targetPath);
          return;
        }
        const downloaded = await FileSystem.downloadAsync(url, targetPath);
        if (cancelled) return;
        if (downloaded.uri) {
          setLocalImageUri(downloaded.uri);
        }
      } catch (downloadError) {
        if (cancelled) return;
        console.warn('[AppPhotoImage] cache download failed, using remote URL fallback', {
          debugLabel,
          preferredPath: path,
          error: downloadError instanceof Error ? downloadError.message : String(downloadError),
        });
        await recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_storage_path_resolve',
          status: 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'storage_download_to_cache_failed',
          firebasePath: path,
          message: 'Failed to download Firebase Storage photo to local cache; falling back to HTTPS URL.',
          error: downloadError,
          details: {
            debugLabel,
            preferredPath: path,
            rawUri: toDebugString(uri).slice(0, 240),
          },
        });
      }
    };

    setResolving(true);
    resolveUrl(preferredPath)
      .catch(async (error) => {
        if (cancelled) return;

        const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
        // Auth race condition: storage requires signedIn() but auth hasn't restored yet.
        // Subscribe once; retry as soon as a user session is available.
        if ((code === 'storage/unauthorized' || code === 'storage/unauthenticated') && !auth.currentUser) {
          authUnsubscribe = onAuthStateChanged(auth, (user) => {
            authUnsubscribe?.();
            authUnsubscribe = null;
            if (!user || cancelled) {
              if (!cancelled) setResolving(false);
              return;
            }
            resolveUrl(preferredPath)
              .catch(() => { /* final failure — uri fallback handles display */ })
              .finally(() => { if (!cancelled) setResolving(false); });
          });
          return; // keep resolving=true until auth callback fires
        }

        console.warn('[AppPhotoImage] failed to resolve storage path', {
          debugLabel,
          preferredPath,
          error: error instanceof Error ? error.message : String(error),
        });
        setResolvedImageUri('');
        setLocalImageUri('');
        setFailureReason('Не удалось получить ссылку на фото. Проверьте интернет.');
        await recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_storage_path_resolve',
          status: 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'storage_get_download_url_failed',
          firebasePath: preferredPath,
          message: 'Failed to resolve Firebase Storage path to download URL.',
          error,
          details: {
            debugLabel,
            preferredPath,
            rawUri: toDebugString(uri).slice(0, 240),
          },
        });
      })
      .finally(() => {
        if (!cancelled && !authUnsubscribe) setResolving(false);
      });

    return () => {
      cancelled = true;
      authUnsubscribe?.();
    };
  }, [debugLabel, preferredPath]);

  useEffect(() => {
    if (startAvatar) return;
    // De-duplicate: same photo fires twice when finalImageUri switches https→file (local cache).
    // Use storagePath as photo identity key; fall back to URI without query string.
    const uriKey = (typeof storagePath === 'string' && storagePath) || stripQuery(finalImageUri);
    if (uriKey && loggedUriKeyRef.current === uriKey) return;
    if (uriKey) loggedUriKeyRef.current = uriKey;
    if (__DEV__) {
      console.log('[AppPhotoImage] final uri:', {
        debugLabel,
        rawUri: toDebugString(uri).slice(0, 180),
        storagePath: toDebugString(storagePath).slice(0, 180),
        localImageUri: localImageUri.slice(0, 180),
        finalImageUri: finalImageUri.slice(0, 180),
        imageSource: finalImageUri ? { uri: finalImageUri } : null,
      });
    }
    void recordRuntimeTrace({
      screen: 'AppPhotoImage',
      action: 'photo_uri_received',
      status: finalImageUri ? 'progress' : 'fail',
      forceRecord: true,
      feature: 'photo_render',
      stage: finalImageUri ? 'validated_https_uri' : 'invalid_uri_before_render',
      firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
      message: finalImageUri ? 'Photo render received a valid https URI.' : 'Photo render received an invalid or empty URI.',
      details: {
        debugLabel,
        storagePath: toDebugString(storagePath).slice(0, 240),
        finalImageUriNoQuery: finalImageUri ? stripQuery(finalImageUri).slice(0, 240) : '',
        ...uriDiagnostics,
      },
    });
  }, [debugLabel, finalImageUri, localImageUri, startAvatar, storagePath, uri, uriDiagnostics]);

  useEffect(() => {
    if (!finalImageUri) return;
    // De-duplicate: same photo fires twice when finalImageUri switches https→file (local cache).
    const sizeKey = (typeof storagePath === 'string' && storagePath) || stripQuery(finalImageUri);
    if (measuredSizeKeyRef.current === sizeKey) return;
    measuredSizeKeyRef.current = sizeKey;
    let cancelled = false;

    void recordRuntimeTrace({
      screen: 'AppPhotoImage',
      action: 'photo_image_get_size',
      status: 'start',
      forceRecord: true,
      feature: 'photo_render',
      stage: 'react_native_get_size_start',
      firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
      message: 'React Native Image.getSize started for photo URI.',
      details: {
        debugLabel,
        finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
        ...uriDiagnostics,
      },
    });

    Image.getSize(
      finalImageUri,
      (width, height) => {
        if (cancelled) return;
        void recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_image_get_size',
          status: 'success',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'react_native_get_size_success',
          firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
          message: 'React Native Image.getSize successfully read photo dimensions.',
          details: {
            debugLabel,
            width,
            height,
            finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
            ...uriDiagnostics,
          },
        });
      },
      (error) => {
        if (cancelled) return;
        console.warn('[AppPhotoImage] Image.getSize failed', {
          debugLabel,
          error: error instanceof Error ? error.message : String(error),
        });
        void recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_image_get_size',
          status: 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'react_native_get_size_failed',
          firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
          message: 'React Native Image.getSize could not read the photo URI.',
          error,
          details: {
            debugLabel,
            finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
            ...uriDiagnostics,
          },
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [debugLabel, finalImageUri, storagePath, uriDiagnostics]);

  const runHttpDiagnostics = (errorText?: string) => {
    if (!finalImageUri) return;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), 8000);

    void recordRuntimeTrace({
      screen: 'AppPhotoImage',
      action: 'photo_http_probe',
      status: 'start',
      forceRecord: true,
      feature: 'photo_render',
      stage: 'http_head_start_after_image_error',
      firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
      message: 'HTTP probe started after React Native Image failed to render the photo.',
      details: {
        debugLabel,
        imageError: errorText || '',
        finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
        ...uriDiagnostics,
      },
    });

    fetch(finalImageUri, {
      method: 'HEAD',
      signal: controller?.signal,
    })
      .then((response) => {
        void recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_http_probe',
          status: response.ok ? 'success' : 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'http_head_finished_after_image_error',
          firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
          message: response.ok
            ? 'HTTP probe can access the photo URL; the failure is likely in React Native image rendering/cache/format.'
            : 'HTTP probe could not access the photo URL.',
          details: {
            debugLabel,
            httpStatus: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type') || '',
            contentLength: response.headers.get('content-length') || '',
            cacheControl: response.headers.get('cache-control') || '',
            imageError: errorText || '',
            finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
            ...uriDiagnostics,
          },
        });
      })
      .catch((probeError) => {
        console.warn('[AppPhotoImage] HTTP image probe failed', {
          debugLabel,
          error: probeError instanceof Error ? probeError.message : String(probeError),
        });
        void recordRuntimeTrace({
          screen: 'AppPhotoImage',
          action: 'photo_http_probe',
          status: 'fail',
          forceRecord: true,
          feature: 'photo_render',
          stage: 'http_head_failed_after_image_error',
          firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
          message: 'HTTP probe failed after React Native Image failed to render the photo.',
          error: probeError,
          details: {
            debugLabel,
            imageError: errorText || '',
            finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
            ...uriDiagnostics,
          },
        });
      })
      .finally(() => clearTimeout(timeout));
  };

  const showImage = Boolean(finalImageUri && !failed && (!isPendingModeration || isOwner));
  const debugText = [
    `photo.url: ${toDebugString(uri).slice(0, 90)}`,
    `photo.storagePath: ${toDebugString(storagePath).slice(0, 90)}`,
    `finalImageUri: ${finalImageUri.slice(0, 90) || 'invalid'}`,
    `imageSource: ${finalImageUri ? '{ uri }' : 'null'}`,
  ].join('\n');

  if (startAvatar && !failed) {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={startAvatar.source}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onError={(event) => {
            setFailed(true);
            onError?.(event);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {showImage ? (
        <Image
          source={{ uri: finalImageUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onError={(event) => {
            console.warn('[AppPhotoImage] load failed:', {
              debugLabel,
              finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 180),
              storagePath: toDebugString(storagePath).slice(0, 180),
              error: event.nativeEvent?.error,
            });
            setFailed(true);
            setFailureReason('Фото временно недоступно. Попробуйте обновить экран.');
            void recordRuntimeTrace({
              screen: 'AppPhotoImage',
              action: 'photo_image_render',
              status: 'fail',
              forceRecord: true,
              feature: 'photo_render',
              stage: 'react_native_image_on_error',
              firebasePath: typeof storagePath === 'string' ? storagePath : undefined,
              message: 'React Native Image onError fired while rendering a user photo.',
              error: event.nativeEvent?.error || 'React Native Image onError',
              details: {
                debugLabel,
                finalImageUriNoQuery: stripQuery(finalImageUri).slice(0, 240),
                imageError: event.nativeEvent?.error || '',
                ...uriDiagnostics,
              },
            });
            runHttpDiagnostics(event.nativeEvent?.error);
            onError?.(event);
          }}
        />
      ) : (
        <View style={styles.fallback}>
          {resolving ? (
            <ActivityIndicator size="small" color="#5E5E5E" />
          ) : (
            <>
              <MaterialCommunityIcons name="image-off-outline" size={22} color="#6B625B" />
              <Text style={styles.fallbackText}>{failureReason || fallbackText}</Text>
            </>
          )}
        </View>
      )}
      {showDebugInfo ? (
        <View pointerEvents="none" style={styles.debugBox}>
          <Text style={styles.debugText}>{debugText}</Text>
        </View>
      ) : null}
      {showImage && isOwner && isPendingModeration ? (
        <View pointerEvents="none" style={styles.pendingOverlay}>
          <Text style={styles.pendingOverlayText}>Ожидает проверки</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#E7DDD0',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D8D8D8',
    padding: 8,
    gap: 6,
  },
  fallbackText: {
    color: '#5E5E5E',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  debugBox: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 7,
    lineHeight: 9,
  },
  pendingOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(31, 31, 31, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pendingOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});

export default AppPhotoImage;
