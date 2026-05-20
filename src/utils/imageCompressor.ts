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

  // First pass: normalize format and get actual dimensions.
  // This also handles content:// URIs - ImageManipulator produces file:// output.
  const normalized = await ImageManipulator.manipulateAsync(
    localUri,
    [],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );

  const shouldResize = normalized.width > maxWidth || normalized.height > maxHeight;
  const resizeRatio = shouldResize
    ? Math.min(maxWidth / normalized.width, maxHeight / normalized.height)
    : 1;
  const actions = shouldResize
    ? [{
        resize: {
          width: Math.round(normalized.width * resizeRatio),
          height: Math.round(normalized.height * resizeRatio),
        },
      }]
    : [];

  const compressed = await ImageManipulator.manipulateAsync(
    normalized.uri,
    actions,
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );

  if (__DEV__) {
    console.log('[imageCompressor] compressImage done', {
      inputScheme,
      outputScheme: compressed.uri.split(':')[0] || 'unknown',
      originalDimensions: `${normalized.width}x${normalized.height}`,
      outputDimensions: `${compressed.width}x${compressed.height}`,
      resized: shouldResize,
    });
  }

  return compressed.uri;
}
