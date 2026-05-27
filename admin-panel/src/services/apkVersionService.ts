import { get, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE, localGet } from '../local/LOCAL_MODE';

export type ApkDownloadRecord = {
  uid: string;
  version: string;
  downloadedAt: number;
  deviceId: string;
  buildStamp: string;
};

export type AppVersionRegistry = {
  version: string;
  buildStamp: string;
  apkUrl: string;
  publishedAt: number;
};

type RawApkDownload = {
  version?: unknown;
  downloadedAt?: unknown;
  deviceId?: unknown;
  buildStamp?: unknown;
};

const normalizeApkDownload = (uid: string, raw: RawApkDownload | null): ApkDownloadRecord | null => {
  if (!raw) return null;
  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!version) return null;
  return {
    uid,
    version,
    downloadedAt: Number.isFinite(raw.downloadedAt) ? Number(raw.downloadedAt) : 0,
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : 'unknown',
    buildStamp: typeof raw.buildStamp === 'string' ? raw.buildStamp : '',
  };
};

/** Fetches all APK download records keyed by uid. */
export const getApkDownloads = async (): Promise<Record<string, ApkDownloadRecord>> => {
  // LOCAL_MODE: fetch apk_downloads list from local json-server
  if (LOCAL_MODE) {
    const raw = await localGet<Array<RawApkDownload & { id?: string; uid?: string }>>('/apk_downloads');
    if (!Array.isArray(raw)) return {};
    const result: Record<string, ApkDownloadRecord> = {};
    for (const record of raw) {
      const uid = String(record.uid || record.id || '');
      if (!uid) continue;
      const normalized = normalizeApkDownload(uid, record);
      if (normalized) result[uid] = normalized;
    }
    return result;
  }

  const snapshot = await get(ref(database, 'apk_downloads'));
  const raw = snapshot.val() as Record<string, RawApkDownload> | null;
  if (!raw) return {};

  const result: Record<string, ApkDownloadRecord> = {};
  for (const [uid, record] of Object.entries(raw)) {
    const normalized = normalizeApkDownload(uid, record);
    if (normalized) result[uid] = normalized;
  }
  return result;
};

/** Fetches the current published version registry entry. */
export const getCurrentVersionRegistry = async (): Promise<AppVersionRegistry | null> => {
  // LOCAL_MODE: fetch app_version_registry from local json-server
  if (LOCAL_MODE) {
    try {
      const raw = await localGet<Partial<AppVersionRegistry>>('/app_version_registry');
      if (!raw?.version) return null;
      return {
        version: String(raw.version),
        buildStamp: typeof raw.buildStamp === 'string' ? raw.buildStamp : '',
        apkUrl: typeof raw.apkUrl === 'string' ? raw.apkUrl : '',
        publishedAt: Number.isFinite(raw.publishedAt) ? Number(raw.publishedAt) : 0,
      };
    } catch {
      return null;
    }
  }

  const snapshot = await get(ref(database, 'app_version_registry/current'));
  const raw = snapshot.val() as Partial<AppVersionRegistry> | null;
  if (!raw?.version) return null;
  return {
    version: String(raw.version),
    buildStamp: typeof raw.buildStamp === 'string' ? raw.buildStamp : '',
    apkUrl: typeof raw.apkUrl === 'string' ? raw.apkUrl : '',
    publishedAt: Number.isFinite(raw.publishedAt) ? Number(raw.publishedAt) : 0,
  };
};
