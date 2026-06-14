import { get, ref, type Database } from 'firebase/database';
import { START_AVATAR_URI_PREFIX } from './startAvatars';

const pickFirstNonEmpty = (values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
};

export const pickUserAvatarUri = (...sources: unknown[]): string => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;

    // Real photos always take precedence over temporary avatars
    const direct = pickFirstNonEmpty([
      record.photoURL,
      record.photoUri,
      record.photoUrl,
      record.photoURI,
      record.avatarURL,
      record.avatarUrl,
      record.userPhotoURL,
      record.userPhotoUrl,
      record.profilePhotoURL,
      record.profilePhotoUrl,
      record.avatar,
      record.image,
    ]);
    if (direct) return direct;

    const urls = record.photoURLs;
    if (Array.isArray(urls)) {
      const first = urls.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
      if (typeof first === 'string' && first.trim().length > 0) return first.trim();
    }

    // Fall back to Firebase Storage path if no direct URL
    const photoStoragePath = record.photoStoragePath;
    if (typeof photoStoragePath === 'string' && photoStoragePath.trim().length > 0) {
      return photoStoragePath.trim();
    }

    // Fall back to temporary avatar ONLY if no real photos exist
    const startAvatarKey = record.startAvatarKey;
    if (typeof startAvatarKey === 'string' && startAvatarKey.trim().length > 0) {
      return `${START_AVATAR_URI_PREFIX}${startAvatarKey.trim()}`;
    }
  }
  return '';
};

export const resolveUserAvatarMap = async (
  db: Database,
  userIds: string[],
): Promise<Record<string, string>> => {
  const unique = Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  if (unique.length === 0) return {};

  const resolved = await Promise.all(
    unique.map(async (uid) => {
      try {
        const snap = await get(ref(db, `users/${uid}`));
        const data = snap.val() as Record<string, unknown> | null;
        return [uid, pickUserAvatarUri(data)] as const;
      } catch {
        return [uid, ''] as const;
      }
    }),
  );

  const map: Record<string, string> = {};
  resolved.forEach(([uid, uri]) => {
    if (uri) map[uid] = uri;
  });
  return map;
};
