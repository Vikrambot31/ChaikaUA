import { get, ref } from 'firebase/database';
import { database } from '../firebase-core';

export const COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT = 5;

export class CommunityPhotoMonthlyLimitError extends Error {
  code = 'community-photo-monthly-limit';
  limit: number;
  used: number;
  remaining: number;

  constructor(used: number, requested: number, limit = COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT) {
    const remaining = Math.max(0, limit - used);
    super(
      remaining > 0
        ? `Можно предложить на рассмотрение не больше ${limit} фото в месяц. Осталось: ${remaining}, выбрано: ${requested}.`
        : `Лимит фото на этот месяц исчерпан: можно предложить на рассмотрение не больше ${limit} фото в месяц.`,
    );
    this.name = 'CommunityPhotoMonthlyLimitError';
    this.limit = limit;
    this.used = used;
    this.remaining = remaining;
  }
}

type RawCommunityPhoto = {
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
  storagePath?: unknown;
  uid?: unknown;
  userId?: unknown;
};

export type CommunityPhotoRecord = {
  id: string;
  storagePath: string;
  createdAt: number;
  status: string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const getMonthRange = (now = Date.now()) => {
  const date = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return { start, end };
};

export const getUserCommunityPhotosForMonth = async (
  uid: string,
  now = Date.now(),
): Promise<CommunityPhotoRecord[]> => {
  const cleanUid = uid.trim();
  if (!cleanUid) return [];

  const { start, end } = getMonthRange(now);
  const snapshot = await get(ref(database, 'community_photos'));
  const raw = snapshot.val() as Record<string, RawCommunityPhoto> | null;
  if (!raw) return [];

  return Object.entries(raw)
    .map(([id, value]) => {
      const owner = toString(value.userId) || toString(value.uid);
      const createdAt = toNumber(value.createdAt) || toNumber(value.uploadedAt);
      return {
        id,
        owner,
        createdAt,
        status: toString(value.status),
        storagePath: toString(value.storagePath),
      };
    })
    .filter((item) =>
      item.owner === cleanUid &&
      item.createdAt >= start &&
      item.createdAt < end &&
      item.status !== 'deleted'
    )
    .map(({ id, storagePath, createdAt, status }) => ({ id, storagePath, createdAt, status }));
};

export const findCurrentMonthCommunityPhotoByStoragePath = async (
  uid: string,
  storagePath: string,
): Promise<CommunityPhotoRecord | null> => {
  const cleanPath = storagePath.trim();
  if (!cleanPath) return null;
  const photos = await getUserCommunityPhotosForMonth(uid);
  return photos.find((photo) => photo.storagePath === cleanPath) ?? null;
};

export const assertCommunityPhotoMonthlyLimit = async (
  uid: string,
  requestedCount = 1,
  excludeStoragePaths: string[] = [],
): Promise<void> => {
  const excluded = new Set(excludeStoragePaths.map((path) => path.trim()).filter(Boolean));
  const used = (await getUserCommunityPhotosForMonth(uid)).filter(
    (photo) => !excluded.has(photo.storagePath),
  ).length;

  if (used + requestedCount > COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT) {
    throw new CommunityPhotoMonthlyLimitError(used, requestedCount);
  }
};
