import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set } from 'firebase/database';
import { auth, database } from '../firebase-core';

const DEVICE_ID_STORAGE_KEY = '@chaika:device_id_v1';

/**
 * Logs an APK download event to Firebase RTDB.
 * Writes to apk_downloads/{uid} — one record per user (latest download).
 * Best-effort: silently ignores all errors.
 */
export const trackApkDownload = async (version: string, buildStamp: string): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let deviceId = 'unknown';
    try {
      const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored) deviceId = stored;
    } catch {
      // Ignore — deviceId is best-effort
    }

    await set(ref(database, `apk_downloads/${uid}`), {
      version,
      downloadedAt: Date.now(),
      deviceId,
      buildStamp,
    });
  } catch {
    // Silently ignore — tracking is best-effort, must not block UI
  }
};
