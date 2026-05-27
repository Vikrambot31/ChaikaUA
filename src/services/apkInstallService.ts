import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

type DownloadApkOptions = {
  url: string;
  fileName?: string;
  onProgress?: (progress: number) => void;
};

const getApkFileName = (url: string, fileName?: string): string => {
  const fromConfig = fileName?.trim();
  if (fromConfig) return fromConfig.replace(/[^a-zA-Z0-9._-]/g, '-');

  try {
    const lastSegment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (lastSegment?.toLowerCase().endsWith('.apk')) {
      return lastSegment.replace(/[^a-zA-Z0-9._-]/g, '-');
    }
  } catch {
    // Fall back to a stable name below.
  }

  return 'chaika-update.apk';
};

export const downloadApk = async ({ url, fileName, onProgress }: DownloadApkOptions): Promise<string> => {
  if (Platform.OS !== 'android') {
    throw new Error('APK installation is available only on Android.');
  }

  if (!/^https:\/\//i.test(url.trim())) {
    throw new Error('APK URL must use HTTPS.');
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('App cache directory is not available.');
  }

  const localUri = `${cacheDirectory}${getApkFileName(url, fileName)}`;
  await FileSystem.deleteAsync(localUri, { idempotent: true });

  const download = FileSystem.createDownloadResumable(url, localUri, {}, (event) => {
    const total = event.totalBytesExpectedToWrite;
    if (total > 0) {
      onProgress?.(Math.min(100, Math.round((event.totalBytesWritten / total) * 100)));
    }
  });

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('APK download was interrupted.');
  }

  onProgress?.(100);
  return result.uri;
};

export const installApk = async (fileUri: string): Promise<void> => {
  if (Platform.OS !== 'android') {
    throw new Error('APK installation is available only on Android.');
  }

  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
};
