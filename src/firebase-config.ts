import { GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential, User as FirebaseUser } from 'firebase/auth';
import { ref, onValue, push, update, query, orderByChild, get, remove, limitToLast, equalTo, endBefore, DatabaseReference, Query } from 'firebase/database';
import * as firebaseStorage from 'firebase/storage';
import { uploadBytes, getDownloadURL } from 'firebase/storage';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { ref as dbRef, set } from 'firebase/database';
import { logClientError, logClientEvent } from './utils/errorLogger';
import { uniqueId } from './utils/cryptoId';
import { uploadPhotoToNamespace } from './services/photoUploadService';
import { canPublishImage } from './utils/imageSafety';
import { safePromiseTimeout } from './utils/safePromiseTimeout';
import { auth, database, storage } from './firebase-core';
import { ensureFirebaseAuth, isModeratorUser, requireWriteSession } from './firebase-auth-session';
import { Request as AppRequest, CommunityPhoto as AppPhoto, AudioAttachment, type ProblemResolutionStatus } from './types/app';
import { resolveMediaAccessUrls } from './services/mediaAccess';
import { assertTextMatchesLanguage, normalizeAppLang } from './utils/contentLanguageGuard';


export { auth, database, storage };

const createStorageRef = firebaseStorage.ref;
const removeStorageObject = firebaseStorage.deleteObject;
const uploadStorageBinary = uploadBytes as (
  refValue: ReturnType<typeof createStorageRef>,
  data: Blob | Uint8Array | ArrayBuffer,
  metadata: { contentType?: string } | undefined,
) => Promise<unknown>;
const resolveStorageUrl = getDownloadURL as (
  refValue: ReturnType<typeof createStorageRef>,
) => Promise<string>;

// ─── Connection monitor ────────────────────────────────────────────────────────

let lastConnectedState: boolean | null = null;
let disconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectStartedAt: number | null = null;
const DISCONNECT_SHORT_MS = 5000;   // < 5s — don't log at all
const DISCONNECT_WARN_MS = 30000;   // > 30s — log as warning

try {
  onValue(
    ref(database, '.info/connected'),
    (snapshot) => {
      try {
        const connected = snapshot.val() === true;

        // Ignore the very first snapshot so startup handshake noise does not look like a real outage.
        if (lastConnectedState === null) {
          lastConnectedState = connected;
          return;
        }

        if (connected && !lastConnectedState) {
          // Cancel pending disconnect log — connection recovered before debounce fired
          if (disconnectDebounceTimer !== null) {
            clearTimeout(disconnectDebounceTimer);
            disconnectDebounceTimer = null;
            // Recovered within debounce window — no logging needed
          } else if (disconnectStartedAt !== null) {
            const pauseDuration = Date.now() - disconnectStartedAt;
            if (pauseDuration >= DISCONNECT_WARN_MS) {
              void logClientEvent('connection_restored', { pauseMs: pauseDuration });
            }
          }
          disconnectStartedAt = null;
        } else if (!connected && lastConnectedState) {
          disconnectStartedAt = Date.now();
          // Debounce: only log if still disconnected after DISCONNECT_SHORT_MS
          if (disconnectDebounceTimer === null) {
            disconnectDebounceTimer = setTimeout(() => {
              disconnectDebounceTimer = null;
              // Log as a DEBUG-level event, not an error
              void logClientEvent('firebase_reconnecting', { pauseMs: DISCONNECT_SHORT_MS });
            }, DISCONNECT_SHORT_MS);
          }
        }
        lastConnectedState = connected;
      } catch {
        // Connection monitor callback errors are non-fatal
      }
    },
    () => {
      // Connection monitor read errors are non-fatal
    },
  );
} catch {
  // Connection monitor setup failed — non-fatal, app continues without it
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Masks a phone number by digit positions: +38050***12 */
const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const visible = digits.slice(0, 5) + '***' + digits.slice(-2);
  return '+' + visible;
};

const MAX_REQUEST_TEXT_LENGTH = 280;
const MAX_PHOTO_TITLE_LENGTH = 80;
const MAX_PHOTO_DESCRIPTION_LENGTH = 300;
const MAX_AUDIO_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (~60s @ HIGH_QUALITY)
const DAILY_REQUEST_LIMIT = 30;
const HELP_NEIGHBORS_DAILY_LIMIT = 5;

const HIGH_PRIORITY_REQUEST_CATEGORIES = new Set<string>(['medical', 'electricity', 'care', 'repair']);
const STORAGE_UPLOAD_TIMEOUT_MS = 20_000;

// ─── Internal interfaces ───────────────────────────────────────────────────────

/** Shape of a raw database request node (all fields are potentially absent/unknown). */
interface DbRequestValue {
  description?: unknown;
  text?: unknown;
  goal?: unknown;
  timestamp?: unknown;
  createdAt?: unknown;
  status?: unknown;
  isApproved?: unknown;
  isCensored?: unknown;
  name?: unknown;
  phone?: unknown;
  maskedPhone?: unknown;
  category?: unknown;
  group?: unknown;
  subcategory?: unknown;
  store?: unknown;
  timeSlot?: unknown;
  destination?: unknown;
  building?: unknown;
  street?: unknown;
  house?: unknown;
  callWindow?: unknown;
  professions?: unknown;
  topics?: unknown;
  photoUri?: unknown;
  photoStoragePath?: unknown;
  userPhotoURL?: unknown;
  startAvatarKey?: unknown;
  resolutionStatus?: unknown;
  resolutionStatusUpdatedAt?: unknown;
  resolvedAt?: unknown;
  sourceItemId?: unknown;
  sourceType?: unknown;
  sourceCategory?: unknown;
  sourceTitle?: unknown;
  sourceDescription?: unknown;
  expires_at?: unknown;
  moderatedAt?: unknown;
  moderatedBy?: unknown;
  moderationReason?: unknown;
  rejectionReason?: unknown;
  reason?: unknown;
  audio?: {
    url?: unknown;
    duration?: unknown;
    storagePath?: unknown;
    uploadedAt?: unknown;
    transcript?: unknown;
  };
  userId?: unknown;
}

/** Shape of a raw database photo node. */
interface DbPhotoValue {
  title?: unknown;
  description?: unknown;
  imageUri?: unknown;
  storagePath?: unknown;
  uploadedBy?: unknown;
  uploadedByEmail?: unknown;
  sourceScreen?: unknown;
  sourceScreenLabel?: unknown;
  sourceFeature?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
  target?: unknown;
  likes?: unknown;
  locationLabel?: unknown;
  locationType?: unknown;
  moderationReason?: unknown;
  rejectionReason?: unknown;
  reason?: unknown;
}


/** Shape of a raw database user node. */
interface DbUserValue {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  photoURL?: unknown;
  building?: unknown;
  houseNumber?: unknown;
  registeredAt?: unknown;
  daysUsed?: unknown;
  registrationStatus?: unknown;
  provider?: unknown;
  providerId?: unknown;
  gender?: unknown;
  age?: unknown;
  profession?: unknown;
  sphere?: unknown;
  activityType?: unknown;
  occupation?: unknown;
  workType?: unknown;
}

/** Moderation priority/queue metadata derived from a request category. */
interface ModerationMeta {
  moderationPriority: 'low' | 'standard' | 'high';
  moderationQueue: 'feedback' | 'standard' | 'urgent';
  status_priority: string;
}

/** The payload accepted by firebaseChatAPI.addRequest. */
interface AddRequestPayload {
  name?: string;
  phone?: string;
  description?: string;
  text?: string;
  language?: 'ua' | 'ru' | 'en';
  category?: string;
  group?: string;
  subcategory?: string;
  store?: string;
  timeSlot?: string;
  destination?: string;
  building?: string;
  audio?: AudioAttachment;
  photoUri?: string;
  photoStoragePath?: string;
  userPhotoURL?: string;
  startAvatarKey?: string;
  resolutionStatus?: ProblemResolutionStatus;
}

/** The payload accepted by photoAPI.addPhoto. */
interface AddPhotoPayload {
  title: string;
  description?: string;
  imageUri: string;
  storagePath?: string;
  uploadedBy?: string;
  target?: 'gallery_public';
  sourceScreen?: string;
  sourceScreenLabel?: string;
  sourceFeature?: string;
  locationLabel?: string;
  locationType?: 'building' | 'place';
}

/** Options accepted by firebaseChatAPI.getRequestsPaginated. */
interface PaginationOptions {
  limit?: number;
  category?: string | null;
  status?: string | null;
  cursorBefore?: number | null;
}

/** Filters accepted by firebaseChatAPI.filterRequests. */
interface FilterOptions {
  category?: string;
  status?: string;
  userId?: string;
}

/** A community user entry returned from communityUsersAPI. */
interface CommunityUser {
  id: string;
  name: string;
  email?: string;
  phone: string;
  photoURL?: string;
  building: string;
  houseNumber: string;
  registeredAt: string;
  daysUsed: number;
  registrationStatus?: string;
  provider?: string;
  providerId?: string;
  gender?: string;
  age?: number;
  profession?: string;
}

/** Uploaded audio data returned by audioAPI.uploadAudio on success. */
interface UploadedAudioData {
  url: string;
  storagePath: string;
  duration: number;
  uploadedAt: number;
}

// ─── Success / failure result types ───────────────────────────────────────────

type SuccessResult<T> = { success: true; data: T };
type FailResult = { success: false; error: string };
type ApiResult<T> = SuccessResult<T> | FailResult;

type SuccessVoid = { success: true };
type ApiVoidResult = SuccessVoid | FailResult;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getRequestPriorityParts = (category: unknown) => {
  const normalizedCategory =
    typeof category === 'string' ? category.trim().toLowerCase() : 'other';

  if (normalizedCategory === 'app_suggestion') {
    return {
      moderationPriority: 'low',
      moderationQueue: 'feedback',
      priorityNumber: '03',
      priorityKey: 'low',
    };
  }

  if (HIGH_PRIORITY_REQUEST_CATEGORIES.has(normalizedCategory)) {
    return {
      moderationPriority: 'high',
      moderationQueue: 'urgent',
      priorityNumber: '01',
      priorityKey: normalizedCategory,
    };
  }

  return {
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    priorityNumber: '02',
    priorityKey: 'standard',
  };
};

const getRequestModerationMeta = (category: unknown, status = 'pending'): ModerationMeta => {
  const parts = getRequestPriorityParts(category);
  const normalizedStatus = status.trim().toLowerCase() || 'pending';
  return {
    moderationPriority: parts.moderationPriority as ModerationMeta['moderationPriority'],
    moderationQueue: parts.moderationQueue as ModerationMeta['moderationQueue'],
    status_priority: `${normalizedStatus}_${parts.priorityNumber}_${parts.priorityKey}`,
  };
};

const getRequestExpiryTtlMs = (payload: AddRequestPayload): number => {
  const category = String(payload.category || '').toLowerCase();
  const group = String(payload.group || '').toLowerCase();
  const subcategory = String(payload.subcategory || '').toLowerCase();

  if (category === 'problem') return 30 * 24 * 60 * 60 * 1000;
  if (group === 'help_neighbors' || category === 'medical' || category === 'care') return 10 * 24 * 60 * 60 * 1000;
  if (subcategory === 'going_shopping' || subcategory === 'ride_share' || group === 'foodsharing' || group === 'transport') return 10 * 24 * 60 * 60 * 1000;
  return 15 * 24 * 60 * 60 * 1000;
};

/**
 * Safely normalises arbitrary input text:
 * strips HTML tags, control characters, and truncates to maxLength.
 */
const normalizeText = (value: unknown, maxLength: number): string => {
  if (!value) return '';

  const text = String(value).trim();

  // Remove HTML tags
  const withoutHtml = text.replace(/<[^>]*>/g, '');

  // Remove unsafe control characters
  const safe = withoutHtml
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\uFFFD/g, '')
    .normalize('NFC');

  return safe.slice(0, maxLength).trim();
};

/**
 * Extracts Firebase Storage path from a download URL.
 * e.g. "https://firebasestorage.googleapis.com/v0/b/bucket/o/community_photos%2Fuid%2Fphoto.jpg?..."
 *   -> "community_photos/uid/photo.jpg"
 */
const extractStoragePathFromUrl = (url: string): string => {
  if (!url || !url.startsWith('https://')) return '';
  try {
    const match = url.match(/\/o\/([^?]+)/);
    if (!match?.[1]) return '';
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
};

const deleteStoragePathQuietly = async (storagePath: string): Promise<void> => {
  if (!storagePath) {
    return;
  }

  try {
    await removeStorageObject(createStorageRef(storage, storagePath));
  } catch (error: unknown) {
    void logClientError('storage.deleteStoragePathQuietly', error, {
      storagePath,
    });
  }
};

const normalizeProblemResolutionStatus = (value: unknown): ProblemResolutionStatus | undefined => {
  if (value === 'new' || value === 'in_progress' || value === 'resolved' || value === 'rejected') {
    return value;
  }
  return undefined;
};

/**
 * Maps a raw Firebase RTDB request node to a typed AppRequest.
 * All field reads are guarded against missing / wrongly-typed data.
 */
const mapDbRequestToAppRequest = (id: string, value: unknown): AppRequest => {
  const v = value as DbRequestValue;

  const description =
    typeof v?.description === 'string'
      ? v.description
      : typeof v?.text === 'string'
      ? v.text
      : typeof v?.goal === 'string'
      ? v.goal
      : '';

  // Determine timestamp first, then createdAt (fallback chain)
  const timestamp =
    typeof v?.timestamp === 'number'
      ? v.timestamp
      : typeof v?.createdAt === 'number'
      ? v.createdAt
      : Date.now();
  const createdAt =
    typeof v?.createdAt === 'number' ? v.createdAt : timestamp;

  const status =
    typeof v?.status === 'string' ? v.status : 'pending';
  const isApproved =
    typeof v?.isApproved === 'boolean' ? v.isApproved : status === 'approved';

  // Map optional audio attachment
  const audio: AudioAttachment | undefined =
    v?.audio && typeof v.audio.url === 'string'
      ? {
          url: v.audio.url,
          duration: typeof v.audio.duration === 'number' ? v.audio.duration : 0,
          storagePath:
            typeof v.audio.storagePath === 'string' ? v.audio.storagePath : '',
          uploadedAt:
            typeof v.audio.uploadedAt === 'number'
              ? v.audio.uploadedAt
              : Date.now(),
          transcript:
            typeof v.audio.transcript === 'string'
              ? v.audio.transcript
              : undefined,
        }
      : undefined;

  return {
    id,
    userId: typeof v?.userId === 'string' ? v.userId : undefined,
    name: typeof v?.name === 'string' && v.name ? v.name : 'No name',
    phone: typeof v?.maskedPhone === 'string'
      ? v.maskedPhone
      : typeof v?.phone === 'string'
        ? maskPhone(v.phone)
        : '',
    description,
    text: typeof v?.text === 'string' ? v.text : description,
    category: typeof v?.category === 'string' ? v.category : 'other',
    group: typeof v?.group === 'string' ? v.group : undefined,
    subcategory: typeof v?.subcategory === 'string' ? v.subcategory : undefined,
    store: typeof v?.store === 'string' ? v.store : undefined,
    timeSlot: typeof v?.timeSlot === 'string' ? v.timeSlot : undefined,
    destination: typeof v?.destination === 'string' ? v.destination : undefined,
    building: typeof v?.building === 'string'
      ? v.building
      : [
          typeof v?.street === 'string' ? v.street : '',
          typeof v?.house === 'string' ? v.house : '',
        ].filter(Boolean).join(' ') || undefined,
    isCensored: Boolean(v?.isCensored),
    isApproved,
    status:
      status === 'approved' || status === 'rejected' || status === 'pending'
        ? status
        : 'pending',
    createdAt,
    timestamp,
    expires_at:
      typeof v?.expires_at === 'number' ? v.expires_at : undefined,
    moderatedAt:
      typeof v?.moderatedAt === 'number' ? v.moderatedAt : undefined,
    moderatedBy:
      typeof v?.moderatedBy === 'string' ? v.moderatedBy : undefined,
    moderationReason:
      typeof v?.moderationReason === 'string'
        ? v.moderationReason
        : typeof v?.reason === 'string'
          ? v.reason
          : undefined,
    rejectionReason:
      typeof v?.rejectionReason === 'string'
        ? v.rejectionReason
        : typeof v?.reason === 'string'
          ? v.reason
          : undefined,
    resolutionStatus: normalizeProblemResolutionStatus(v?.resolutionStatus),
    resolutionStatusUpdatedAt:
      typeof v?.resolutionStatusUpdatedAt === 'number' ? v.resolutionStatusUpdatedAt : undefined,
    resolvedAt:
      typeof v?.resolvedAt === 'number' ? v.resolvedAt : undefined,
    audio,
    photoUri: typeof v?.photoUri === 'string' ? v.photoUri : undefined,
    photoStoragePath: typeof v?.photoStoragePath === 'string' ? v.photoStoragePath : undefined,
    userPhotoURL: typeof v?.userPhotoURL === 'string' ? v.userPhotoURL : undefined,
    startAvatarKey: typeof v?.startAvatarKey === 'string' ? v.startAvatarKey : undefined,
    sourceItemId: typeof v?.sourceItemId === 'string' ? v.sourceItemId : undefined,
    sourceType: typeof v?.sourceType === 'string' ? v.sourceType : undefined,
    sourceCategory: typeof v?.sourceCategory === 'string' ? v.sourceCategory : undefined,
    sourceTitle: typeof v?.sourceTitle === 'string' ? v.sourceTitle : undefined,
    sourceDescription: typeof v?.sourceDescription === 'string' ? v.sourceDescription : undefined,
  };
};


const getCurrentDayStartMs = (): number => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};


const countCurrentDayItemsByUser = async (
  path: 'requests' | 'community_photos',
  userId: string,
  options?: { group?: string },
): Promise<number> => {
  const snapshot = await get(query(ref(database, path), orderByChild('userId'), equalTo(userId)));
  const raw = snapshot.val() as Record<string, { createdAt?: unknown; group?: unknown }> | null;
  if (!raw) return 0;

  const dayStart = getCurrentDayStartMs();
  return Object.values(raw).filter(
    (entry) =>
      typeof entry?.createdAt === 'number' &&
      entry.createdAt >= dayStart &&
      (!options?.group || entry.group === options.group),
  ).length;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadBinaryWithRetry = async (
  photoRef: ReturnType<typeof createStorageRef>,
  blob: Blob | Uint8Array | ArrayBuffer,
  metadata: { contentType?: string } | undefined,
  sourceLabel: string,
  retries = 3,
): Promise<unknown> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await safePromiseTimeout(
        uploadStorageBinary(photoRef, blob as Blob, metadata),
        STORAGE_UPLOAD_TIMEOUT_MS,
        `${sourceLabel}:attempt_${attempt + 1}`,
      );
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await delay(1000 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

/**
 * Maps a raw Firebase RTDB photo node to a typed AppPhoto.
 */
const mapDbPhotoToAppPhoto = (id: string, value: unknown): AppPhoto => {
  const v = value as DbPhotoValue;

  const createdAt =
    typeof v?.createdAt === 'number' ? v.createdAt : Date.now();
  const status: AppPhoto['status'] =
    v?.status === 'approved' || v?.status === 'rejected'
      ? v.status
      : 'pending';

  return {
    id,
    title: typeof v?.title === 'string' && v.title ? v.title : 'Photo',
    description: typeof v?.description === 'string' ? v.description : '',
    imageUri: typeof v?.imageUri === 'string' ? v.imageUri : '',
    storagePath: typeof v?.storagePath === 'string'
      ? v.storagePath
      : typeof v?.imageUri === 'string' && v.imageUri.startsWith('community_photos/')
        ? v.imageUri
        : typeof v?.imageUri === 'string'
          ? extractStoragePathFromUrl(v.imageUri) || undefined
          : undefined,
  uploadedBy:
      typeof v?.uploadedBy === 'string' && v.uploadedBy
        ? v.uploadedBy
        : typeof v?.uploadedByEmail === 'string' && v.uploadedByEmail
          ? v.uploadedByEmail
        : 'Anonymous',
    createdAt: new Date(createdAt),
    status,
    target: v?.target === 'my_photos' ? 'my_photos' : 'gallery_public',
    sourceScreen:
      typeof v?.sourceScreen === 'string' ? v.sourceScreen : undefined,
    sourceScreenLabel:
      typeof v?.sourceScreenLabel === 'string' ? v.sourceScreenLabel : undefined,
    sourceFeature:
      typeof v?.sourceFeature === 'string' ? v.sourceFeature : undefined,
    likes: typeof v?.likes === 'number' ? v.likes : 0,
    locationLabel:
      typeof v?.locationLabel === 'string' ? v.locationLabel : undefined,
    locationType:
      v?.locationType === 'building' || v?.locationType === 'place'
        ? v.locationType
        : undefined,
    moderationReason:
      typeof v?.moderationReason === 'string'
        ? v.moderationReason
        : typeof v?.reason === 'string'
          ? v.reason
          : undefined,
    rejectionReason:
      typeof v?.rejectionReason === 'string'
        ? v.rejectionReason
        : typeof v?.reason === 'string'
          ? v.reason
          : undefined,
  };
};

// ─── firebaseChatAPI ───────────────────────────────────────────────────────────

export const firebaseChatAPI = {
  /**
   * Subscribes to approved requests in realtime.
   * Returns an unsubscribe function.
   */
  getRequests: (callback: (requests: AppRequest[]) => void): (() => void) => {
    let unsubscribe: () => void = () => {};
    let cancelled = false;
    let retryCount = 0;

    const subscribe = () => {
      ensureFirebaseAuth()
        .then(() => {
          if (cancelled) return;
          const requestsRef: Query = query(
            ref(database, 'requests'),
            orderByChild('status'),
            equalTo('approved'),
          );

          unsubscribe = onValue(
            requestsRef,
            (snapshot) => {
              if (cancelled) return;
              retryCount = 0;
              const data: Record<string, unknown> | null = snapshot.val();
              const requests: AppRequest[] = [];
              if (data) {
                Object.entries(data).forEach(([id, value]) => {
                  requests.unshift(mapDbRequestToAppRequest(id, value));
                });
              }
              callback(requests);
            },
            (error) => {
              void logClientError('firebaseChatAPI.getRequests.listener', error);
              if (cancelled || retryCount >= 1) {
                if (!cancelled) callback([]);
                return;
              }
              retryCount += 1;
              unsubscribe();
              subscribe();
            },
          );
        })
        .catch((error: unknown) => {
          void logClientError('firebaseChatAPI.getRequests', error);
          if (!cancelled) callback([]);
        });
    };

    subscribe();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  },

  getHelpNeighborsDailyLimitStatus: async (): Promise<ApiResult<{
    count: number;
    limit: number;
    remaining: number;
    allowed: boolean;
  }>> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      const count = await countCurrentDayItemsByUser('requests', user.uid, { group: 'help_neighbors' });
      const remaining = Math.max(0, HELP_NEIGHBORS_DAILY_LIMIT - count);
      return {
        success: true,
        data: {
          count,
          limit: HELP_NEIGHBORS_DAILY_LIMIT,
          remaining,
          allowed: count < HELP_NEIGHBORS_DAILY_LIMIT,
        },
      };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.getHelpNeighborsDailyLimitStatus', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Submits a new help-request for moderation. */
  addRequest: async (
    requestData: AddRequestPayload,
  ): Promise<ApiResult<{ id: string | null }> | FailResult> => {
    try {
      const user: FirebaseUser = await requireWriteSession({
        operation: 'create',
        screen: 'firebaseChatAPI.addRequest',
      });
      const dailyRequestsCount = await countCurrentDayItemsByUser('requests', user.uid);
      if (dailyRequestsCount >= DAILY_REQUEST_LIMIT) {
        throw new Error(`Daily request limit reached (${DAILY_REQUEST_LIMIT})`);
      }
      const normalizedDescription = normalizeText(
        requestData.description || requestData.text,
        MAX_REQUEST_TEXT_LENGTH,
      );
      const requestLanguage = normalizeAppLang(requestData.language, 'ua');
      const normalizedName = normalizeText(requestData.name || 'No name', 60);
      const normalizedPhone = normalizeText(requestData.phone || '', 30);
      const category = requestData.category || 'other';
      const phoneRequired = category !== 'app_suggestion';
      const isElectricity = category === 'electricity';
      const isHelpNeighbors = (requestData.group || '') === 'help_neighbors';
      if (isHelpNeighbors) {
        const dailyHelpCount = await countCurrentDayItemsByUser('requests', user.uid, { group: 'help_neighbors' });
        if (dailyHelpCount >= HELP_NEIGHBORS_DAILY_LIMIT) {
          throw new Error(`Daily help_neighbors limit reached (${HELP_NEIGHBORS_DAILY_LIMIT})`);
        }
      }
      const autoApprove = isElectricity || isHelpNeighbors;
      const moderationMeta: ModerationMeta = getRequestModerationMeta(category, autoApprove ? 'approved' : 'pending');

      if (
        !normalizedDescription ||
        !normalizedName ||
        (phoneRequired && !normalizedPhone)
      ) {
        throw new Error('Invalid request payload');
      }

      assertTextMatchesLanguage(normalizedDescription, requestLanguage);

      // Electricity status reports are factual community data — auto-approve immediately.
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      const newRequest = {
        userId: user.uid,
        name: normalizedName,
        phone: normalizedPhone,
        maskedPhone: maskPhone(normalizedPhone),
        category,
        group:
          typeof requestData.group === 'string' ? requestData.group : '',
        subcategory:
          typeof requestData.subcategory === 'string'
            ? requestData.subcategory
            : '',
        store:
          typeof requestData.store === 'string' ? requestData.store : '',
        timeSlot:
          typeof requestData.timeSlot === 'string'
            ? requestData.timeSlot
            : '',
        destination: normalizeText(requestData.destination || '', 100),
        building:
          typeof requestData.building === 'string'
            ? requestData.building
            : 'Чайка',
        text: normalizedDescription,
        description: normalizedDescription,
        language: requestLanguage,
        status: autoApprove ? 'approved' : 'pending',
        isApproved: autoApprove,
        isCensored: false,
        requiresManualModeration: !autoApprove,
        ...(autoApprove
          ? { moderatedAt: nowIso, moderatedBy: 'auto' }
          : { submittedForModerationAt: nowIso }),
        ...moderationMeta,
        timestamp: nowMs,
        createdAt: nowMs,
        expires_at: nowMs + getRequestExpiryTtlMs(requestData),
        ...(requestData.audio ? { audio: requestData.audio } : {}),
        ...(requestData.photoStoragePath || requestData.photoUri
          ? {
              photoUri: '',
              photoStoragePath: normalizeText(requestData.photoStoragePath || requestData.photoUri || '', 500),
            }
          : {}),
        ...(typeof requestData.userPhotoURL === 'string' && requestData.userPhotoURL.trim().length > 0
          ? { userPhotoURL: normalizeText(requestData.userPhotoURL, 500) }
          : {}),
        ...(typeof requestData.startAvatarKey === 'string' && requestData.startAvatarKey.trim().length > 0
          ? { startAvatarKey: normalizeText(requestData.startAvatarKey, 120) }
          : {}),
        ...(category === 'problem'
          ? {
              resolutionStatus: requestData.resolutionStatus || 'new',
              resolutionStatusUpdatedAt: nowMs,
            }
          : {}),
      };

      const pushResult = await push(ref(database, 'requests'), newRequest);
      if (!pushResult.key) {
        throw new Error('Firebase did not return a request ID after push');
      }
      await set(dbRef(database, `rate_limits/${user.uid}/requests/lastAt`), Date.now()).catch((rateLimitError: unknown) => {
        void logClientError('firebaseChatAPI.addRequest.rateLimit', rateLimitError);
      });
      void logClientEvent('request_created', {
        id: pushResult.key,
        category: newRequest.category,
      });
      return { success: true, data: { id: pushResult.key } };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.addRequest', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Fetches all requests once for an authenticated user. */
  getRequestsOnce: async (): Promise<ApiResult<AppRequest[]>> => {
    try {
      await ensureFirebaseAuth();
      const hasExtendedAccess = await isModeratorUser();
      const requestsRef: DatabaseReference | Query = hasExtendedAccess
        ? ref(database, 'requests')
        : query(
            ref(database, 'requests'),
            orderByChild('status'),
            equalTo('approved'),
            limitToLast(200),
          );
      const [requestsSnapshot] = await Promise.all([get(requestsRef)]);
      const requests: AppRequest[] = [];

      const appendFromSnapshot = (snapshotData: Record<string, unknown> | null) => {
        if (!snapshotData) return;
        Object.entries(snapshotData).forEach(([id, value]) => {
          const request = mapDbRequestToAppRequest(id, value);
          if (request.category === 'app_suggestion') {
            return;
          }
          requests.unshift(request);
        });
      };

      appendFromSnapshot(requestsSnapshot.val());

      return { success: true, data: requests };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.getRequestsOnce', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Approves or rejects a request for an authenticated user. */
  moderateRequest: async (
    requestId: string,
    status: 'approved' | 'rejected',
  ): Promise<ApiVoidResult> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      if (!requestId || (status !== 'approved' && status !== 'rejected')) {
        throw new Error('Invalid moderation payload');
      }

      await update(ref(database, `requests/${requestId}`), {
        status,
        isApproved: status === 'approved',
        moderatedAt: Date.now(),
        moderatedBy: user.uid,
      });

      return { success: true };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.moderateRequest', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Deletes a request permanently (authenticated user path). */
  deleteRequest: async (requestId: string): Promise<ApiVoidResult> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      if (!requestId) {
        throw new Error('Invalid request id');
      }

      const requestSnapshot = await get(ref(database, `requests/${requestId}`));
      if (!requestSnapshot.exists()) {
        throw new Error('Request not found');
      }

      const requestValue = requestSnapshot.val() as DbRequestValue;
      const hasExtendedAccess = await isModeratorUser();
      if (!hasExtendedAccess && requestValue.userId !== user.uid) {
        throw new Error('Permission denied');
      }

      const audioStoragePath =
        typeof requestValue?.audio?.storagePath === 'string'
          ? requestValue.audio.storagePath
          : '';

      await remove(ref(database, `requests/${requestId}`));
      await deleteStoragePathQuietly(audioStoragePath);
      return { success: true };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.deleteRequest', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Fetches a page of requests with optional filters. */
  getRequestsPaginated: async (
    options: PaginationOptions = {},
  ): Promise<ApiResult<AppRequest[]>> => {
    try {
      await ensureFirebaseAuth();
      const { limit = 20, category = null, status = null, cursorBefore = null } = options;
      const hasExtendedAccess = await isModeratorUser();

      let requestsQuery: DatabaseReference | Query = ref(
        database,
        'requests',
      );

      if (!hasExtendedAccess) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('status'),
          equalTo('approved'),
          limitToLast(Math.max(limit * 4, 200)),
        );
      } else if (category) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('category'),
          equalTo(category),
          limitToLast(limit),
        );
      } else if (status) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('status'),
          equalTo(status),
          limitToLast(limit),
        );
      } else {
        requestsQuery = query(
          requestsQuery,
          orderByChild('timestamp'),
          ...(cursorBefore ? [endBefore(cursorBefore)] : []),
          limitToLast(limit),
        );
      }

      const snapshot = await get(requestsQuery);
      const data: Record<string, unknown> | null = snapshot.val();
      const requests: AppRequest[] = [];

      if (data) {
        Object.entries(data).forEach(([id, value]) => {
          const request = mapDbRequestToAppRequest(id, value);
          if (request.category === 'app_suggestion') {
            return;
          }
          if (
            (hasExtendedAccess || request.status === 'approved') &&
            (!cursorBefore || request.timestamp < cursorBefore)
          ) {
            requests.unshift(request);
          }
        });
      }

      return { success: true, data: requests.slice(0, limit) };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.getRequestsPaginated', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Fetches requests filtered by category, status, or userId. */
  filterRequests: async (
    filters: FilterOptions = {},
  ): Promise<ApiResult<AppRequest[]>> => {
    try {
      await ensureFirebaseAuth();
      const { category, status, userId } = filters;
      const hasExtendedAccess = await isModeratorUser();

      let requestsQuery: DatabaseReference | Query = ref(
        database,
        'requests',
      );

      if (!hasExtendedAccess && userId) {
        // Non-moderators may only query their own userId to prevent
        // reading another user's requests by passing an arbitrary id.
        const currentUid = auth.currentUser?.uid;
        if (currentUid && userId !== currentUid) {
          return { success: false, error: 'Permission denied' };
        }
        requestsQuery = query(
          requestsQuery,
          orderByChild('userId'),
          equalTo(userId),
        );
      } else if (!hasExtendedAccess) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('status'),
          equalTo('approved'),
        );
      } else if (category) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('category'),
          equalTo(category),
        );
      } else if (status) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('status'),
          equalTo(status),
        );
      } else if (userId) {
        requestsQuery = query(
          requestsQuery,
          orderByChild('userId'),
          equalTo(userId),
        );
      } else {
        requestsQuery = query(requestsQuery, orderByChild('timestamp'));
      }

      const snapshot = await get(requestsQuery);
      const data: Record<string, unknown> | null = snapshot.val();
      const requests: AppRequest[] = [];

      if (data) {
        Object.entries(data).forEach(([id, value]) => {
          const request = mapDbRequestToAppRequest(id, value);
          if (request.category === 'app_suggestion') {
            return;
          }
          requests.unshift(request);
        });
      }

      return { success: true, data: requests };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.filterRequests', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Fetches all requests submitted by the currently authenticated user. */
  getMyRequests: async (): Promise<ApiResult<AppRequest[]>> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      const requestsQuery: Query = query(
        ref(database, 'requests'),
        orderByChild('userId'),
        equalTo(user.uid),
      );

      const snapshot = await get(requestsQuery);
      const data: Record<string, unknown> | null = snapshot.val();
      const requests: AppRequest[] = [];

      const MIRROR_CATEGORIES = new Set(['buy_sell', 'contacts', 'job_search', 'lost_found']);

      if (data) {
        Object.entries(data).forEach(([id, value]) => {
          const raw = value as Record<string, unknown>;
          if (raw?.isMirror === true) return;
          const request = mapDbRequestToAppRequest(id, value);
          if (request.category === 'app_suggestion') return;
          if (request.category && MIRROR_CATEGORIES.has(request.category)) return;
          requests.unshift(request);
        });
      }

      return { success: true, data: requests };
    } catch (error: unknown) {
      void logClientError('firebaseChatAPI.getMyRequests', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ─── photoAPI ──────────────────────────────────────────────────────────────────

export const photoAPI = {
  /** Returns whether the current user has elevated moderation access. */
  isCurrentUserModerator: async (): Promise<
    { success: true; allowed: boolean } | { success: false; allowed: false; error: string }
  > => {
    try {
      const hasExtendedAccess = await isModeratorUser();
      return { success: true, allowed: hasExtendedAccess };
    } catch (error: unknown) {
      void logClientError('photoAPI.isCurrentUserModerator', error);
      return {
        success: false,
        allowed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Fetches all community photos once for an authenticated user. */
  getPhotosOnce: async (): Promise<ApiResult<AppPhoto[]>> => {
    try {
      await ensureFirebaseAuth();
      const hasExtendedAccess = await isModeratorUser();
      const photosRef: DatabaseReference | Query = hasExtendedAccess
        ? ref(database, 'community_photos')
        : ref(database, 'community_photos_public');
      const snapshot = await get(photosRef);
      const data: Record<string, unknown> | null = snapshot.val();
      const photos: AppPhoto[] = [];

      if (data) {
        Object.entries(data).forEach(([id, value]) => {
          photos.unshift(mapDbPhotoToAppPhoto(id, value));
        });
      }

      const resolved = await resolveMediaAccessUrls(
        photos,
        'community_photos',
        (item) =>
          typeof item.imageUri === 'string' && /^https?:\/\//i.test(item.imageUri)
            ? item.imageUri
            : typeof item.storagePath === 'string'
              ? item.storagePath
              : typeof item.imageUri === 'string'
                ? item.imageUri
                : '',
        (item, url) => ({ ...item, imageUri: url || item.imageUri }),
      );

      return { success: true, data: resolved };
    } catch (error: unknown) {
      void logClientError('photoAPI.getPhotosOnce', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Uploads a local image URI to Firebase Storage and returns a private storage path. */
  uploadPhotoToStorage: async (
    localUri: string,
  ): Promise<ApiResult<{ url: string; storagePath: string }>> => {
    let fileName = '';
    try {
      await ensureFirebaseAuth();
      const upload = await uploadPhotoToNamespace(localUri, {
        namespace: 'community_photos',
        resolveDownloadUrl: true,
        logContext: { source: 'photoAPI.uploadPhotoToStorage' },
      });
      fileName = upload.storagePath;
      return { success: true, data: { url: upload.downloadUrl ?? upload.storagePath, storagePath: upload.storagePath } };
    } catch (error: unknown) {
      const firebaseCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';
      void logClientError('photoAPI.uploadPhotoToStorage', error, {
        stage: 'storage_upload',
        firebasePath: fileName || 'community_photos/<pending>',
        storageBucket: storage.app.options.storageBucket || 'unknown',
        authUid: auth.currentUser?.uid || 'none',
        isAnonymous: Boolean(auth.currentUser?.isAnonymous),
        code: firebaseCode,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Submits a new community photo for moderation. */
  addPhoto: async (photoData: AddPhotoPayload): Promise<ApiVoidResult> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      const normalizedTitle = normalizeText(
        photoData.title,
        MAX_PHOTO_TITLE_LENGTH,
      );
      const normalizedDescription = normalizeText(
        photoData.description || '',
        MAX_PHOTO_DESCRIPTION_LENGTH,
      );
      const normalizedImageUri = normalizeText(photoData.imageUri, 500);
      const fallbackIdentity = user.email || user.displayName || user.uid;
      const normalizedUploadedBy = normalizeText(
        photoData.uploadedBy || fallbackIdentity || 'Anonymous',
        120,
      );
      const normalizedUploadedByEmail = normalizeText(user.email || '', 160);
      const normalizedLocationLabel = normalizeText(
        photoData.locationLabel || '',
        120,
      );
      const normalizedSourceScreen = normalizeText(photoData.sourceScreen || '', 80);
      const normalizedSourceScreenLabel = normalizeText(photoData.sourceScreenLabel || '', 120);
      const normalizedSourceFeature = normalizeText(photoData.sourceFeature || '', 80);
      const normalizedLocationType: 'building' | 'place' | undefined =
        photoData.locationType === 'building' ||
        photoData.locationType === 'place'
          ? photoData.locationType
          : undefined;

      const resolvedStoragePath =
        photoData.storagePath ||
        (normalizedImageUri.startsWith('community_photos/') ? normalizedImageUri : '') ||
        extractStoragePathFromUrl(normalizedImageUri);
      const effectiveImageUri = normalizedImageUri || resolvedStoragePath;

      if (!normalizedTitle || !effectiveImageUri || !resolvedStoragePath) {
        throw new Error('Invalid photo payload: imageUri/storagePath required');
      }

      const now = Date.now();
      try {
        await push(ref(database, 'community_photos'), {
          title: normalizedTitle,
          description: normalizedDescription,
          imageUri: effectiveImageUri,
          ...(effectiveImageUri.startsWith('https://') ? { downloadUrl: effectiveImageUri } : {}),
          uploadedBy: normalizedUploadedBy,
          ...(normalizedUploadedByEmail ? { uploadedByEmail: normalizedUploadedByEmail } : {}),
          createdAt: now,
          uploadedAt: now,
          status: 'pending',
          target: photoData.target || 'gallery_public',
          ...(normalizedSourceScreen ? { sourceScreen: normalizedSourceScreen } : {}),
          ...(normalizedSourceScreenLabel ? { sourceScreenLabel: normalizedSourceScreenLabel } : {}),
          ...(normalizedSourceFeature ? { sourceFeature: normalizedSourceFeature } : {}),
          safetyStatus: 'pending',
          likes: 0,
          userId: user.uid,
          storagePath: resolvedStoragePath,
          ...(normalizedLocationLabel
            ? {
                locationLabel: normalizedLocationLabel,
                ...(normalizedLocationType ? { locationType: normalizedLocationType } : {}),
              }
            : {}),
        });
      } catch (error: unknown) {
        void logClientError('photoAPI.addPhoto.pushCommunityPhoto', error, {
          firebasePath: 'community_photos',
          stage: 'write_photo_moderation',
        });
        throw error;
      }

      void logClientEvent('photo_added', { title: normalizedTitle });
      return { success: true };
    } catch (error: unknown) {
      void logClientError('photoAPI.addPhoto', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Approves or rejects a community photo for an authenticated user. */
  moderatePhoto: async (
    photoId: string,
    status: 'approved' | 'rejected',
  ): Promise<ApiVoidResult> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      if (!photoId || (status !== 'approved' && status !== 'rejected')) {
        throw new Error('Invalid moderation payload');
      }

      const safetyUpdate = status === 'approved'
        ? {
            safetyStatus: 'manual_reviewed',
            safetyReviewedAt: Date.now(),
            safetyReviewedBy: user.uid,
            safetyReason: 'moderator_reviewed_before_publication',
          }
        : {};

      if (status === 'approved') {
        try {
          const snapshot = await get(ref(database, `community_photos/${photoId}`));
          const current = snapshot.val() as { safetyStatus?: string } | null;
          if (current?.safetyStatus && canPublishImage(current.safetyStatus)) {
            safetyUpdate.safetyStatus = current.safetyStatus as 'passed' | 'manual_reviewed';
          }
        } catch (error: unknown) {
          void logClientError('photoAPI.moderatePhoto.readPhotoSafety', error, {
            firebasePath: `community_photos/${photoId}`,
            stage: 'read_photo_safety',
          });
          throw error;
        }
      }

      try {
        await update(ref(database, `community_photos/${photoId}`), {
          status,
          moderatedAt: Date.now(),
          moderatedBy: user.uid,
          moderationReason: status === 'rejected' ? 'default_rejected' : null,
          rejectionReason: status === 'rejected' ? 'default_rejected' : null,
          ...safetyUpdate,
        });
      } catch (error: unknown) {
        void logClientError('photoAPI.moderatePhoto.updatePhotoStatus', error, {
          firebasePath: `community_photos/${photoId}`,
          stage: 'write_photo_moderation',
        });
        throw error;
      }

      return { success: true };
    } catch (error: unknown) {
      void logClientError('photoAPI.moderatePhoto', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Permanently deletes a community photo for an authenticated user. */
  deletePhoto: async (photoId: string): Promise<ApiVoidResult> => {
    try {
      await ensureFirebaseAuth();
      if (!photoId) {
        throw new Error('Invalid photo id');
      }

      const snapshot = await get(ref(database, `community_photos/${photoId}`));
      const current = snapshot.val() as DbPhotoValue | null;
      const storagePath = typeof current?.storagePath === 'string'
        ? current.storagePath
        : typeof current?.imageUri === 'string' && current.imageUri.startsWith('community_photos/')
          ? current.imageUri
          : '';

      await deleteStoragePathQuietly(storagePath);
      await remove(ref(database, `community_photos/${photoId}`));
      return { success: true };
    } catch (error: unknown) {
      void logClientError('photoAPI.deletePhoto', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Deletes a previously uploaded storage file if metadata save fails. */
  deleteUploadedPhoto: async (storagePath: string): Promise<void> => {
    await deleteStoragePathQuietly(storagePath);
  },
};

// ─── communityUsersAPI ─────────────────────────────────────────────────────────

export const communityUsersAPI = {
  /** Fetches all registered community users once. */
  getUsersOnce: async (): Promise<ApiResult<CommunityUser[]>> => {
    try {
      await ensureFirebaseAuth();
      const snapshot = await get(ref(database, 'users'));
      const data: Record<string, unknown> | null = snapshot.val();
      const users: CommunityUser[] = [];

      if (data) {
        Object.entries(data).forEach(([id, value]) => {
          const v = value as DbUserValue;
          users.push({
            id,
            name:
              typeof v?.name === 'string' ? v.name : 'Житель Чайки',
            email: typeof v?.email === 'string' ? v.email : undefined,
            phone: typeof v?.phone === 'string' ? maskPhone(v.phone) : '',
            photoURL:
              typeof v?.photoURL === 'string' ? v.photoURL : undefined,
            building:
              typeof v?.building === 'string' ? v.building : '',
            houseNumber:
              typeof v?.houseNumber === 'string' ? v.houseNumber : '',
            registeredAt:
              typeof v?.registeredAt === 'string'
                ? v.registeredAt
                : new Date().toISOString(),
            daysUsed:
              typeof v?.daysUsed === 'number' ? v.daysUsed : 0,
            registrationStatus:
              typeof v?.registrationStatus === 'string' ? v.registrationStatus : undefined,
            provider:
              typeof v?.provider === 'string' ? v.provider : undefined,
            providerId:
              typeof v?.providerId === 'string' ? v.providerId : undefined,
            gender:
              typeof v?.gender === 'string' ? v.gender : undefined,
            age:
              typeof v?.age === 'number' ? v.age : undefined,
            profession:
              typeof v?.profession === 'string'
                ? v.profession
                : typeof v?.sphere === 'string'
                  ? v.sphere
                  : typeof v?.activityType === 'string'
                    ? v.activityType
                    : typeof v?.occupation === 'string'
                      ? v.occupation
                      : typeof v?.workType === 'string'
                        ? v.workType
                        : undefined,
          });
        });
      }

      return { success: true, data: users };
    } catch (error: unknown) {
      void logClientError('communityUsersAPI.getUsersOnce', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ─── Social auth helpers (mobile) ─────────────────────────────────────────────

const signInWithGoogleMobile = async (): Promise<FirebaseUser> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin') as {
    GoogleSignin: {
      hasPlayServices: (opts: { showPlayServicesUpdateDialog: boolean }) => Promise<void>;
      hasPreviousSignIn?: () => boolean;
      signOut?: () => Promise<void>;
      signIn: () => Promise<{ idToken?: string; data?: { idToken?: string } }>;
    };
    statusCodes: {
      SIGN_IN_CANCELLED: string;
      IN_PROGRESS: string;
      PLAY_SERVICES_NOT_AVAILABLE: string;
    };
  };

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (GoogleSignin.signOut && (!GoogleSignin.hasPreviousSignIn || GoogleSignin.hasPreviousSignIn())) {
      await GoogleSignin.signOut();
    }
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo?.idToken || userInfo?.data?.idToken;
    if (!idToken) {
      throw new Error('Google ID token missing');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    return userCredential.user;
  } catch (error: unknown) {
    const err = error as { code?: string | number; message?: string };
    const code = String(err?.code ?? '').toUpperCase();
    const message = String(err?.message ?? '').toUpperCase();
    if (err?.code === statusCodes?.SIGN_IN_CANCELLED) {
      throw new Error('Google sign-in canceled');
    }
    if (err?.code === statusCodes?.IN_PROGRESS) {
      throw new Error('Google sign-in already in progress');
    }
    if (err?.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services is not available');
    }
    if (code.includes('DEVELOPER_ERROR') || code === '10' || message.includes('DEVELOPER_ERROR')) {
      throw new Error('Google sign-in is not configured correctly (check webClientId and SHA fingerprints)');
    }
    if (message.includes('ID TOKEN')) {
      throw new Error('Google ID token missing');
    }
    throw error;
  }
};

const signInWithFacebookMobile = async (): Promise<FirebaseUser> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LoginManager, AccessToken } = require('react-native-fbsdk-next') as {
    LoginManager: {
      logInWithPermissions: (perms: string[]) => Promise<{ isCancelled: boolean }>;
      logOut?: () => void;
    };
    AccessToken: {
      getCurrentAccessToken: () => Promise<{ accessToken: { toString(): string }; applicationID?: string; userID?: string; permissions?: string[]; declinedPermissions?: string[]; expirationTime?: number; dataAccessExpirationTime?: number } | null>;
      refreshCurrentAccessTokenAsync?: () => Promise<{ accessToken: { toString(): string } } | null>;
    };
  };

  const result = await LoginManager.logInWithPermissions([
    'public_profile',
    'email',
  ]);
  if (result.isCancelled) {
    throw new Error('Facebook sign-in canceled');
  }

  let tokenData = await AccessToken.getCurrentAccessToken();
  if (!tokenData?.accessToken) {
    throw new Error('Facebook access token missing');
  }

  try {
    if (typeof AccessToken.refreshCurrentAccessTokenAsync === 'function') {
      const refreshed = await AccessToken.refreshCurrentAccessTokenAsync();
      if (refreshed?.accessToken) {
        tokenData = refreshed;
      }
    }
  } catch {
    // refresh failed — use original token
  }

  if (!tokenData?.accessToken) {
    throw new Error('Facebook token refresh failed');
  }

  const credential = FacebookAuthProvider.credential(
    tokenData.accessToken.toString(),
  );
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
};

const signInWithAppleMobile = async (): Promise<FirebaseUser> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleAuthentication = require('expo-apple-authentication') as {
    AppleAuthenticationScope: { FULL_NAME: number; EMAIL: number };
    AppleAuthenticationCredentialState: { AUTHORIZED: number };
    isAvailableAsync: () => Promise<boolean>;
    signInAsync: (opts: {
      requestedScopes: number[];
      nonce?: string;
    }) => Promise<{
      identityToken?: string | null;
      authorizationCode?: string | null;
    }>;
  };

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Apple sign-in is not available on this device');
  }

  const rawNonce = `${uniqueId()}_${Date.now()}`;
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple identity token missing');
  }

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);
  return userCredential.user;
};

// ─── fcmAPI ────────────────────────────────────────────────────────────────────

/** FCM token registration and lifecycle management. */
export const fcmAPI = {
  /** Requests notification permission and returns the FCM token, or null on failure. */
  registerToken: async (): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    try {
      const permission = await Notifications.getPermissionsAsync();
      let notificationStatus = permission.status;
      if (notificationStatus !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        notificationStatus = requested.status;
      }
      if (notificationStatus !== 'granted') return null;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const messaging = require('@react-native-firebase/messaging').default as {
        (): {
          requestPermission: () => Promise<number>;
          getToken: () => Promise<string>;
        };
        AuthorizationStatus: { AUTHORIZED: number; PROVISIONAL: number };
      };
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) return null;

      const token = await messaging().getToken();
      return token || null;
    } catch {
      return null;
    }
  },

  /** Persists an FCM token to the user's RTDB record. */
  saveTokenForUser: async (uid: string, token: string): Promise<void> => {
    if (!uid || !token) return;
    try {
      await ensureFirebaseAuth();
      await set(dbRef(database, `user_roles/${uid}/fcmToken`), token);
    } catch {
      // Do not block app startup on token save failure
    }
  },

  /** Clears the FCM token for a user (e.g. on sign-out). */
  removeTokenForUser: async (uid: string): Promise<void> => {
    if (!uid) return;
    try {
      await set(dbRef(database, `user_roles/${uid}/fcmToken`), null);
    } catch {}
  },

  /**
   * Subscribes to FCM token refresh events.
   * Returns an unsubscribe function.
   */
  onTokenRefresh: (
    uid: string,
    callback?: (token: string) => void,
  ): (() => void) => {
    if (Platform.OS === 'web') return () => {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const messaging = require('@react-native-firebase/messaging').default as {
        (): { onTokenRefresh: (cb: (t: string) => void) => () => void };
      };
      return messaging().onTokenRefresh(async (newToken: string) => {
        await fcmAPI.saveTokenForUser(uid, newToken);
        callback?.(newToken);
      });
    } catch {
      return () => {};
    }
  },

  /**
   * Registers a foreground message handler.
   * Returns an unsubscribe function.
   */
  onForegroundMessage: (
    handler: (message: unknown) => void,
  ): (() => void) => {
    if (Platform.OS === 'web') return () => {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const messaging = require('@react-native-firebase/messaging').default as {
        (): { onMessage: (cb: (m: unknown) => void) => () => void };
      };
      return messaging().onMessage(handler);
    } catch {
      return () => {};
    }
  },
};

// ─── audioAPI ─────────────────────────────────────────────────────────────────

/** Voice message upload to Firebase Storage. */
export const audioAPI = {
  /** Uploads a local audio URI and returns the storage metadata. */
  uploadAudio: async (
    localUri: string,
    durationMs: number,
  ): Promise<ApiResult<UploadedAudioData>> => {
    try {
      const user: FirebaseUser = await ensureFirebaseAuth();
      const response = await fetch(localUri);
      const blob = await response.blob();
      if (blob.size > MAX_AUDIO_UPLOAD_BYTES) {
        throw new Error(`Файл завеликий: ${(blob.size / 1024 / 1024).toFixed(1)} МБ. Максимум 5 МБ.`);
      }
      const fileName = `voice_messages/${user.uid}/${uniqueId()}.m4a`;
      const audioStorageRef = createStorageRef(storage, fileName);
      await uploadBinaryWithRetry(
        audioStorageRef,
        blob,
        { contentType: 'audio/mp4' },
        `audioAPI.uploadAudio:${fileName}`,
      );
      let url = '';
      try {
        url = await resolveStorageUrl(audioStorageRef);
      } catch (error) {
        void logClientError('audioAPI.uploadAudio.getDownloadURL', error, {
          storagePath: fileName,
        });
        throw error;
      }
      return {
        success: true,
        data: {
          url,
          storagePath: fileName,
          duration: durationMs || 0,
          uploadedAt: Date.now(),
        },
      };
    } catch (error: unknown) {
      void logClientError('audioAPI.uploadAudio', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ─── socialAuthAPI ─────────────────────────────────────────────────────────────

/** Social sign-in via Google and Facebook (web + mobile). */
export const socialAuthAPI = {
  /** Signs the user in with Google. */
  signInWithGoogle: async (): Promise<ApiResult<FirebaseUser>> => {
    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const credential = await signInWithPopup(auth, provider);
        return { success: true, data: credential.user };
      }

      const user = await signInWithGoogleMobile();
      return { success: true, data: user };
    } catch (error: unknown) {
      void logClientError('socialAuthAPI.signInWithGoogle', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Signs the user in with Facebook. */
  signInWithFacebook: async (): Promise<ApiResult<FirebaseUser>> => {
    try {
      if (Platform.OS === 'web') {
        const provider = new FacebookAuthProvider();
        provider.setCustomParameters({ display: 'popup' });
        const credential = await signInWithPopup(auth, provider);
        return { success: true, data: credential.user };
      }

      const user = await signInWithFacebookMobile();
      return { success: true, data: user };
    } catch (error: unknown) {
      void logClientError('socialAuthAPI.signInWithFacebook', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /** Signs the user in with Apple. */
  signInWithApple: async (): Promise<ApiResult<FirebaseUser>> => {
    try {
      if (Platform.OS === 'web') {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');
        const credential = await signInWithPopup(auth, provider);
        return { success: true, data: credential.user };
      }

      const user = await signInWithAppleMobile();
      return { success: true, data: user };
    } catch (error: unknown) {
      void logClientError('socialAuthAPI.signInWithApple', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
