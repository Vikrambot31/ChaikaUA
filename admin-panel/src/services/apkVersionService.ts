import { get, ref } from 'firebase/database';
import { database } from '../firebase/firebase';

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
