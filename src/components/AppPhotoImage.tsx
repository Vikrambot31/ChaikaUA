import React, { useEffect, useMemo, useState } from 'react';
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
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { storage } from '../firebase-core';
import { recordRuntimeTrace } from '../services/runtimeMonitorService';

type ImageErrorEvent = NativeSyntheticEvent<{ error?: string }>;

type Props = {
  uri?: unknown;
  storagePath?: unknown;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageProps['resizeMode'];
  debugLabel?: string;
  showDebugInfo?: boolean;
  fallbackText?: string;
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
  return /^(community_photos|lost_found|buy_sell|buy_sell_listings|contacts|contacts_listings|local_business|requests|profile_photos)\//i.test(trimmed);
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
  showDebugInfo = __DEV__,
  fallbackText = 'Фото не загрузилось',
  onError,
}) => {
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
    if (!preferredPath && isHttpsUri(uri)) return uri.trim();
    return '';
  }, [localImageUri, preferredPath, resolvedImageUri, uri]);
  const uriDiagnostics = useMemo(() => getUriDiagnostics(uri), [uri]);
  const [failed, setFailed] = useState(false);
  const [failureReason, setFailureReason] = useState('');

  useEffect(() => {
    setFailed(false);
    setFailureReason('');
  }, [finalImageUri]);

  useEffect(() => {
    let cancelled = false;
    if (!preferredPath) {
      setResolvedImageUri('');
      setLocalImageUri('');
      setResolving(false);
      return () => {
        cancelled = true;
      };
    }

    setResolving(true);
    getDownloadURL(storageRef(storage, preferredPath))
      .then(async (url) => {
        if (cancelled) return;
        setResolvedImageUri(url || '');
        setLocalImageUri('');

        try {
          const targetPath = await getCacheFilePath(preferredPath);
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
            preferredPath,
            error: downloadError instanceof Error ? downloadError.message : String(downloadError),
          });
          await recordRuntimeTrace({
            screen: 'AppPhotoImage',
            action: 'photo_storage_path_resolve',
            status: 'fail',
            forceRecord: true,
            feature: 'photo_render',
            stage: 'storage_download_to_cache_failed',
            firebasePath: preferredPath,
            message: 'Failed to download Firebase Storage photo to local cache; falling back to HTTPS URL.',
            error: downloadError,
            details: {
              debugLabel,
              preferredPath,
              rawUri: toDebugString(uri).slice(0, 240),
            },
          });
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
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
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debugLabel, preferredPath]);

  useEffect(() => {
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
  }, [debugLabel, finalImageUri, localImageUri, storagePath, uri, uriDiagnostics]);

  useEffect(() => {
    if (!finalImageUri) return;
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

  const showImage = Boolean(finalImageUri && !failed);
  const debugText = [
    `photo.url: ${toDebugString(uri).slice(0, 90)}`,
    `photo.storagePath: ${toDebugString(storagePath).slice(0, 90)}`,
    `finalImageUri: ${finalImageUri.slice(0, 90) || 'invalid'}`,
    `imageSource: ${finalImageUri ? '{ uri }' : 'null'}`,
  ].join('\n');

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
});

export default AppPhotoImage;
