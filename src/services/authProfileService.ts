import { User as FirebaseUser } from 'firebase/auth';
import { get, ref, set, update } from 'firebase/database';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { database, storage } from '../firebase-config';
import type { User } from '../types/app';
import { sanitizeStoredText } from '../utils/textUtils';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { safeLogError } from '../utils/errorLogger';
import { START_AVATAR_URI_PREFIX } from '../utils/startAvatars';
import { photoService } from './photoService';

type ProfileRecord = {
  name?: string;
  phone?: string;
  building?: string;
  houseNumber?: string;
  profession?: string;
  about?: string;
  registeredAt?: string;
  referrerPhone?: string;
  registrationStatus?: 'partial' | 'complete';
  provider?: 'google' | 'facebook' | 'apple' | 'email';
  providerId?: string;
  photoURL?: string;
  photoURLs?: string[];
  photoStoragePaths?: string[];
  startAvatarKey?: string;
  gender?: 'male' | 'female';
  age?: number;
};

const MAX_PROFILE_PHOTOS = 3;
const normalizeStringArray = (value: unknown, limit = MAX_PROFILE_PHOTOS): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => sanitizeStoredText(typeof item === 'string' ? item : ''))
        .filter(Boolean)
        .slice(0, limit)
    : [];

const USERS_PATH = 'users';

const normalizeRecord = (raw: ProfileRecord | null | undefined): ProfileRecord => ({
  name: sanitizeStoredText(raw?.name || ''),
  phone: sanitizeStoredText(raw?.phone || ''),
  building: sanitizeStoredText(raw?.building || ''),
  houseNumber: sanitizeStoredText(raw?.houseNumber || ''),
  profession: sanitizeStoredText(raw?.profession || ''),
  about: sanitizeStoredText(raw?.about || ''),
  registeredAt: raw?.registeredAt || '',
  referrerPhone: sanitizeStoredText(raw?.referrerPhone || ''),
  registrationStatus: raw?.registrationStatus,
  provider: raw?.provider,
  providerId: raw?.providerId,
  photoURL: raw?.photoURL,
  photoURLs: normalizeStringArray(raw?.photoURLs),
  photoStoragePaths: normalizeStringArray(raw?.photoStoragePaths),
  startAvatarKey: sanitizeStoredText(raw?.startAvatarKey || ''),
  gender: raw?.gender,
  age: typeof raw?.age === 'number' ? raw.age : undefined,
});

export const getProfileRefPath = (uid: string) => `${USERS_PATH}/${uid}`;

export const loadProfileRecord = async (uid: string): Promise<ProfileRecord | null> => {
  const snapshot = await get(ref(database, getProfileRefPath(uid)));
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeRecord(snapshot.val() as ProfileRecord);
};

export const inferRegistrationStatus = (
  firebaseUser: FirebaseUser,
  profile: ProfileRecord | null,
): 'partial' | 'complete' => {
  if (profile?.registrationStatus === 'complete') {
    return 'complete';
  }

  // Social auth users (Google, Facebook, Apple) are considered complete if they have a name.
  // They authenticate via the provider — phone and address can be filled later.
  const isSocialProvider = firebaseUser.providerData.some(
    (p) => p.providerId === 'google.com' || p.providerId === 'facebook.com' || p.providerId === 'apple.com',
  );
  const hasName = Boolean(profile?.name || firebaseUser.displayName);

  if (isSocialProvider && hasName) {
    return 'complete';
  }

  const hasPhone = Boolean(profile?.phone || firebaseUser.phoneNumber);
  const hasAddress = Boolean(profile?.building && profile?.houseNumber);
  return hasName && hasPhone && hasAddress ? 'complete' : 'partial';
};

export const mapFirebaseUserToAppUser = (
  firebaseUser: FirebaseUser,
  profile: ProfileRecord | null,
): User => {
  const normalizedProfile = normalizeRecord(profile);
  const registrationStatus = inferRegistrationStatus(firebaseUser, normalizedProfile);
  const photoURLs = normalizedProfile.photoURLs?.length
    ? normalizedProfile.photoURLs
    : normalizedProfile.photoURL
      ? [normalizedProfile.photoURL]
      : [];
  const startAvatarUri = normalizedProfile.startAvatarKey
    ? `${START_AVATAR_URI_PREFIX}${normalizedProfile.startAvatarKey}`
    : '';
  const primaryPhotoUrl = startAvatarUri || photoURLs[0] || normalizedProfile.photoURL || firebaseUser.photoURL || undefined;
  const resolvedPhotoURLs = startAvatarUri ? [startAvatarUri] : photoURLs;

  return {
    id: firebaseUser.uid,
    name: normalizedProfile.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
    email: firebaseUser.email || '',
    phone: normalizedProfile.phone || firebaseUser.phoneNumber || '',
    daysUsed: 0,
    registeredAt: normalizedProfile.registeredAt
      || firebaseUser.metadata?.creationTime
      || new Date().toISOString(),
    isActive: registrationStatus === 'complete',
    city: normalizedProfile.building || '',
    houseNumber: normalizedProfile.houseNumber || undefined,
    profession: normalizedProfile.profession || undefined,
    about: normalizedProfile.about || undefined,
    registrationStatus,
    photoURL: primaryPhotoUrl,
    photoURLs: resolvedPhotoURLs,
    startAvatarKey: normalizedProfile.startAvatarKey || undefined,
    gender: normalizedProfile.gender,
    age: normalizedProfile.age,
    provider: (normalizedProfile.provider as User['provider']) || (() => {
      const sp = firebaseUser.providerData.find(
        (p) => p.providerId === 'facebook.com' || p.providerId === 'google.com' || p.providerId === 'apple.com',
      );
      if (!sp) return 'email';
      if (sp.providerId === 'facebook.com') return 'facebook';
      if (sp.providerId === 'google.com') return 'google';
      return 'apple';
    })(),
    providerId: normalizedProfile.providerId || firebaseUser.uid,
    referrerPhone: normalizedProfile.referrerPhone || undefined,
  };
};

export const ensurePartialProfileRecord = async (
  firebaseUser: FirebaseUser,
  provider: 'google' | 'facebook' | 'apple' | 'email',
): Promise<ProfileRecord> => {
  const current = await loadProfileRecord(firebaseUser.uid);
  if (current) {
    return current;
  }

  const partialRecord: ProfileRecord = {
    name: sanitizeStoredText(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || ''),
    phone: sanitizeStoredText(firebaseUser.phoneNumber || ''),
    building: '',
    houseNumber: '',
    registeredAt: new Date().toISOString(),
    registrationStatus: 'partial',
    provider,
    providerId: firebaseUser.uid,
    photoURL: firebaseUser.photoURL || '',
    photoURLs: firebaseUser.photoURL ? [firebaseUser.photoURL] : [],
    photoStoragePaths: [],
  };

  await set(ref(database, getProfileRefPath(firebaseUser.uid)), partialRecord);
  return partialRecord;
};

export const updateProfileRecord = async (uid: string, patch: Partial<ProfileRecord>): Promise<void> => {
  const currentProfile = await loadProfileRecord(uid);

  await update(ref(database, getProfileRefPath(uid)), patch);

  if (currentProfile) {
    const historyEntry = {
      timestamp: Date.now(),
      changedAt: new Date().toISOString(),
      changes: {} as Record<string, { old: string; new: string }>,
    };

    const fieldsToTrack: Array<keyof ProfileRecord> = ['name', 'phone', 'building'];

    for (const field of fieldsToTrack) {
      const oldValue = String(currentProfile[field] || '');
      const newValue = String(patch[field] || '');

      if (newValue && oldValue !== newValue) {
        historyEntry.changes[field] = { old: oldValue, new: newValue };
      }
    }

    if (Object.keys(historyEntry.changes).length > 0) {
      const historyPath = `${USERS_PATH}/${uid}/profile_history/${historyEntry.timestamp}`;
      await set(ref(database, historyPath), historyEntry);

      const allHistorySnap = await get(ref(database, `${USERS_PATH}/${uid}/profile_history`));
      if (allHistorySnap.exists()) {
        const allHistory = allHistorySnap.val() as Record<string, unknown>;
        const historyKeys = Object.keys(allHistory).sort((a, b) => Number(b) - Number(a));

        if (historyKeys.length > 10) {
          const toDelete = historyKeys.slice(10);
          const batchDelete: Record<string, null> = {};
          for (const key of toDelete) {
            batchDelete[`${USERS_PATH}/${uid}/profile_history/${key}`] = null;
          }
          try {
            await update(ref(database, '/'), batchDelete);
          } catch (err) {
            console.error('[authProfileService] profile_history batch delete failed:', err);
          }
        }
      }
    }
  }
};

export const uploadProfilePhoto = async (
  localUri: string,
  options: { moderationStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected' } = {},
): Promise<{ url: string; storagePath: string }> => {
  const user = await ensureFirebaseAuth();
  try {
    const photo = await photoService.addLocalPhoto(localUri, {
      userId: user.uid,
      type: 'avatar',
      moderationStatus: options.moderationStatus,
    });
    const upload = await photoService.upload(photo.id);
    if (!upload.imageUrl) {
      throw new Error('Profile photo URL was not resolved after upload');
    }
    const url = upload.imageUrl;
    return { url, storagePath: upload.storagePath };
  } catch (error) {
    safeLogError('authProfileService.uploadProfilePhoto', error, {
      stage: 'photo_service_upload',
      firebasePath: 'uploads/users/<uid>/avatar/<pending>',
      storageBucket: storage.app.options.storageBucket || 'unknown',
      authUid: user.uid,
    });
    throw error;
  }
};

export const deleteProfilePhoto = async (storagePath: string): Promise<void> => {
  if (!storagePath) return;
  await deleteObject(storageRef(storage, storagePath));
};

export const resolveAppUserFromFirebase = async (
  firebaseUser: FirebaseUser,
  options?: {
    ensureProfile?: boolean;
    provider?: 'google' | 'facebook' | 'apple' | 'email';
  },
): Promise<User> => {
  const provider = options?.provider || 'email';
  const profile = options?.ensureProfile
    ? await ensurePartialProfileRecord(firebaseUser, provider)
    : await loadProfileRecord(firebaseUser.uid);

  return mapFirebaseUserToAppUser(firebaseUser, profile);
};
