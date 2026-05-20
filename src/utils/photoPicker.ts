import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { uniqueId } from './cryptoId';
import { safeLogError } from './errorLogger';

export type PhotoSource = 'library' | 'camera';

export interface PickedPhoto {
  uri: string;
  originalUri: string;
  width?: number;
  height?: number;
  fileName?: string | null;
  source: PhotoSource;
}

export class PhotoPermissionError extends Error {
  constructor(public readonly source: PhotoSource) {
    super(source === 'camera' ? 'camera-permission-denied' : 'photo-library-permission-denied');
    this.name = 'PhotoPermissionError';
  }
}

export interface PickPhotoOptions {
  quality?: number;
  allowsEditing?: boolean;
}

type PickerResultLike = Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;

const getCacheRoot = (): string =>
  FileSystem.documentDirectory || FileSystem.cacheDirectory || '';

const getExtension = (uri: string): string => {
  const clean = uri.split('?')[0]?.split('#')[0] || '';
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  const extension = match?.[1]?.toLowerCase();
  if (!extension || extension === 'heic' || extension === 'heif') {
    return 'jpg';
  }
  return extension;
};

/**
 * Copies a picked photo into a stable app-owned file:// URI.
 *
 * Android API 33+ returns content:// URIs from the system photo picker.
 * FileSystem.copyAsync may fail on content:// on certain devices/Expo versions,
 * so we fall back to ImageManipulator (which always produces a file:// URI).
 * If all copy attempts fail we do a final ImageManipulator pass so the returned
 * URI is guaranteed to be file://, never content://.
 */
async function copyToAppCache(uri: string, source: PhotoSource): Promise<string> {
  const isContentUri = uri.startsWith('content://');
  const cacheRoot = getCacheRoot();

  if (__DEV__) {
    console.log('[photoPicker] copyToAppCache start', { uri: uri.slice(0, 80), isContentUri, source });
  }

  if (!cacheRoot) {
    safeLogError('photoPicker.copyToAppCache', new Error('no-cache-root'), { source, uriScheme: uri.split(':')[0] });
    return uri;
  }

  const directory = `${cacheRoot}picked-photos/`;
  const target = `${directory}${source}-${Date.now()}-${uniqueId()}.${getExtension(uri)}`;

  // ── Attempt 1: direct FileSystem copy (fast path, works for file:// URIs) ──
  if (!isContentUri) {
    try {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      await FileSystem.copyAsync({ from: uri, to: target });
      if (__DEV__) {
        console.log('[photoPicker] copyToAppCache success (direct copy)', { target });
      }
      return target;
    } catch (copyError) {
      if (__DEV__) {
        console.warn('[photoPicker] copyToAppCache direct copy failed, trying ImageManipulator', copyError);
      }
    }
  }

  // ── Attempt 2: ImageManipulator → then copy (handles content:// and HEIC) ──
  try {
    const materialized = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: false },
    );
    const materializedTarget = `${directory}${source}-${Date.now()}-${uniqueId()}.jpg`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: materialized.uri, to: materializedTarget });
    if (__DEV__) {
      console.log('[photoPicker] copyToAppCache success (ImageManipulator+copy)', { materializedTarget });
    }
    return materializedTarget;
  } catch (manipError) {
    if (__DEV__) {
      console.warn('[photoPicker] copyToAppCache ImageManipulator+copy failed', manipError);
    }
  }

  // ── Attempt 3: last resort — ImageManipulator result directly (no extra copy) ──
  // Guarantees file:// even if the app-cache copy fails.
  try {
    const lastResort = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: false },
    );
    safeLogError(
      'photoPicker.copyToAppCache',
      new Error('copy-failed-using-manipulator-uri-directly'),
      { source, uriScheme: uri.split(':')[0] || 'unknown', fallbackUri: lastResort.uri.split(':')[0] },
    );
    if (__DEV__) {
      console.warn('[photoPicker] copyToAppCache using raw manipulator URI (temp location)', lastResort.uri.slice(0, 80));
    }
    return lastResort.uri; // always file://
  } catch (lastResortError) {
    safeLogError(
      'photoPicker.copyToAppCache',
      lastResortError,
      { source, uriScheme: uri.split(':')[0] || 'unknown', stage: 'all-attempts-failed' },
    );
    if (__DEV__) {
      console.error('[photoPicker] copyToAppCache ALL attempts failed, returning original URI', uri.slice(0, 80));
    }
    // Final fallback: return original URI. compressImage() inside preparePhotoForUpload
    // runs ImageManipulator first so content:// will still be resolved before readAsStringAsync.
    return uri;
  }
}

function mapAsset(asset: ImagePicker.ImagePickerAsset, source: PhotoSource, stableUri: string): PickedPhoto {
  return {
    uri: stableUri,
    originalUri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    source,
  };
}

const getUsableAssetFromResult = (
  result: PickerResultLike | ImagePicker.ImagePickerErrorResult | null | undefined,
): ImagePicker.ImagePickerAsset | null => {
  if (!result || 'code' in result || result.canceled) {
    return null;
  }
  const asset = result.assets?.[0];
  return asset?.uri ? asset : null;
};

async function resolvePendingPickerAsset(): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    const pendingResults = Array.isArray(pending) ? pending : pending ? [pending] : [];
    const asset =
      pendingResults
        .map((item) => getUsableAssetFromResult(item))
        .find((item): item is ImagePicker.ImagePickerAsset => Boolean(item)) ?? null;

    if (__DEV__) {
      console.log('[photoPicker] getPendingResultAsync result:', {
        pendingCount: pendingResults.length,
        hasUsableAsset: Boolean(asset),
        assetUri: asset?.uri ?? null,
        firstPendingKeys:
          pendingResults[0] && typeof pendingResults[0] === 'object'
            ? Object.keys(pendingResults[0])
            : [],
      });
    }

    return asset;
  } catch (error) {
    if (__DEV__) {
      console.warn('[photoPicker] getPendingResultAsync failed', error);
    }
    safeLogError('photoPicker.getPendingResultAsync', error, {
      source: 'image-picker',
    });
    return null;
  }
}

export async function pickPhotoFromLibrary(options: PickPhotoOptions = {}): Promise<PickedPhoto | null> {
  // On Android 13+ the new system Photo Picker handles its own permissions.
  // Calling requestMediaLibraryPermissionsAsync before launchImageLibraryAsync
  // caused the system picker to open twice (once for permission, once for picking).
  // So we only request permission on iOS and older Android.
  const needsExplicitPermission = Platform.OS === 'ios' ||
    (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 33);

  if (needsExplicitPermission) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (__DEV__) {
      console.log('[photoPicker] Media library permission result:', {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
        accessPrivileges: 'accessPrivileges' in permission ? permission.accessPrivileges : 'unknown',
      });
    }
    if (!permission.granted) {
      safeLogError('photoPicker.requestMediaLibraryPermissionsAsync', new Error('photo-library-permission-denied'), {
        source: 'image-picker',
      });
      throw new PhotoPermissionError('library');
    }
  }

  if (__DEV__) {
    console.log('[photoPicker] About to launch image library picker', {
      allowsEditing: options.allowsEditing ?? false,
      quality: options.quality ?? 0.82,
    });
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? 0.82,
    exif: false,
  });
  if (__DEV__) {
    console.log('[photoPicker] launchImageLibraryAsync raw result:', {
      canceled: result?.canceled,
      hasAssetsArray: Array.isArray(result?.assets),
      assetsLength: Array.isArray(result?.assets) ? result.assets.length : 'not-array',
      firstAssetUri: result?.assets?.[0]?.uri ?? null,
      firstAssetFileName: result?.assets?.[0]?.fileName ?? null,
      firstAssetWidth: result?.assets?.[0]?.width ?? null,
      firstAssetHeight: result?.assets?.[0]?.height ?? null,
      rawResultType: typeof result,
      rawKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });
  }

  let asset = getUsableAssetFromResult(result);
  // On Android, the activity may be killed while the picker is open, causing
  // result.canceled=true even if the user selected a photo. Always try
  // getPendingResultAsync to recover the result regardless of canceled status.
  if (!asset && Platform.OS === 'android') {
    if (__DEV__) {
      console.warn('[photoPicker] No usable asset returned directly, trying getPendingResultAsync fallback');
    }
    asset = await resolvePendingPickerAsset();
  }

  if (!asset) {
    if (__DEV__) {
      console.warn('[photoPicker] Picker returned without a usable asset', {
        canceled: result?.canceled,
        hasAsset: Boolean(result?.assets?.[0]),
        assetUri: result?.assets?.[0]?.uri ?? null,
      });
    }
    if (!result?.canceled) {
      safeLogError('photoPicker.launchImageLibraryAsync', new Error('picker returned without usable asset'), {
        source: 'image-picker',
      });
    }
    return null;
  }

  const stableUri = await copyToAppCache(asset.uri, 'library');
  const mappedAsset = mapAsset(asset, 'library', stableUri);
  if (__DEV__) {
    console.log('[photoPicker] Returning mapped library asset:', {
      uri: mappedAsset.uri,
      originalUri: mappedAsset.originalUri,
      width: mappedAsset.width ?? null,
      height: mappedAsset.height ?? null,
      fileName: mappedAsset.fileName ?? null,
    });
  }
  return mappedAsset;
}

export async function takePhotoWithCamera(options: PickPhotoOptions = {}): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    safeLogError('photoPicker.requestCameraPermissionsAsync', new Error('camera-permission-denied'), {
      source: 'image-picker',
    });
    throw new PhotoPermissionError('camera');
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? 0.82,
    exif: false,
  });

  let asset = getUsableAssetFromResult(result);
  if (!asset && Platform.OS === 'android') {
    if (__DEV__) {
      console.warn('[photoPicker] Camera returned no usable asset directly, trying getPendingResultAsync fallback');
    }
    asset = await resolvePendingPickerAsset();
  }

  if (!asset) {
    if (!result?.canceled) {
      safeLogError('photoPicker.launchCameraAsync', new Error('camera returned without usable asset'), {
        source: 'image-picker',
      });
    }
    return null;
  }

  const stableUri = await copyToAppCache(asset.uri, 'camera');
  return mapAsset(asset, 'camera', stableUri);
}
