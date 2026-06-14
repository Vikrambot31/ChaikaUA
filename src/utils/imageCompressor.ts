import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export const getContentType = (localUri: string): string => {
  const clean = localUri.split('?')[0]?.split('#')[0] || '';
  const ext = clean.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
};

export const getPhotoFileExtension = (localUri: string): string => {
  const clean = localUri.split('?')[0]?.split('#')[0] || '';
  const ext = clean.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  if (!ext || ext === 'jpeg' || ext === 'heic' || ext === 'heif') return 'jpg';
  return ext;
};

export async function compressImage(localUri: string, options: CompressOptions = {}): Promise<string> {
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 1600;
  const quality = options.quality ?? 0.82;
  const inputScheme = localUri.split(':')[0] || 'unknown';

  if (__DEV__) {
    console.log('[imageCompressor] compressImage start', { inputScheme, maxWidth, maxHeight, quality });
  }

  // Normalize to JPEG (also converts content:// to file://) and get dimensions.
  // When no resize is needed, compress directly in this single call to avoid a second pass.
  const probe = await ImageManipulator.manipulateAsync(localUri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: false,
  });
  const shouldResize = probe.width > maxWidth || probe.height > maxHeight;

  // When resize IS needed: second call with resize + compress (unavoidable — we need dimensions first).
  // When resize is NOT needed: single call with just compress applied to the original URI directly.
  const compressed = shouldResize
    ? await ImageManipulator.manipulateAsync(
        probe.uri,
        [{ resize: {
          width: Math.round(probe.width * Math.min(maxWidth / probe.width, maxHeight / probe.height)),
          height: Math.round(probe.height * Math.min(maxWidth / probe.width, maxHeight / probe.height)),
        }}],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: false },
      )
    : await ImageManipulator.manipulateAsync(
        localUri,
        [],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: false },
      );

  if (__DEV__) {
    console.log('[imageCompressor] compressImage done', {
      inputScheme,
      outputScheme: compressed.uri.split(':')[0] || 'unknown',
      originalDimensions: `${probe.width}x${probe.height}`,
      outputDimensions: `${compressed.width}x${compressed.height}`,
      resized: shouldResize,
    });
  }

  return compressed.uri;
}
