import { ref, get, set, update, onValue, serverTimestamp } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../firebase-core';
import { logClientError } from '../utils/errorLogger';
import { RATE_LIMITERS } from '../utils/rateLimiter';

export type ProfilePrivacyMode = 'open' | 'request';
export type ViewRequestContext = 'lyudi' | 'help' | 'sport' | 'buysell' | 'job';
export type ViewRequestStatus = 'pending' | 'approved' | 'denied';
export type ContactReason = 'acquaintance' | 'by_listing' | 'by_services' | 'by_issue';
export type ProfileViewRequestResult =
  | 'sent'
  | 'already_approved'
  | 'already_pending'
  | 'open_profile'
  | 'cooldown'
  | 'daily_limit'
  | 'retry_later';

export interface ProfileViewRequest {
  requesterId: string;
  requesterName: string;
  requesterPhotoURL: string;
  targetUserId?: string;
  targetName?: string;
  targetPhotoURL?: string;
  sharedContact?: string;
  requestedAt: string;
  context: ViewRequestContext;
  status: ViewRequestStatus;
  // Extended fields (optional for backward compatibility)
  reason?: ContactReason;
  sourceType?: string;
  sourceId?: string;
  sourceTitle?: string;
  requesterPhone?: string;
  targetPhone?: string;
  requesterUserId?: string;
  createdAt?: string;
  viewedAt?: string;
}

export interface ContactRequestOptions {
  reason?: ContactReason;
  sourceId?: string;
  sourceTitle?: string;
  sourceType?: string;
  requesterPhone?: string;
  targetPhone?: string;
}

export interface AccessRecord {
  status: ViewRequestStatus | null;
  sharedContact?: string;
}
export interface PendingRequestsSummary {
  count: number;
  latestRequestedAtMs: number;
}

type PendingSummarySubscriber = (summary: PendingRequestsSummary) => void;

type PendingSummarySubscription = {
  callbacks: Set<PendingSummarySubscriber>;
  unsubscribe: () => void;
};

const pendingSummarySubscriptions = new Map<string, PendingSummarySubscription>();

const summarizePendingRequests = (
  targetUserId: string,
  data: Record<string, ProfileViewRequest> | null | undefined,
  hiddenKeys: Record<string, boolean> = {},
): PendingRequestsSummary => {
  if (!data) {
    return { count: 0, latestRequestedAtMs: 0 };
  }

  let count = 0;
  let latestRequestedAtMs = 0;
  Object.entries(data).forEach(([requesterKey, request]) => {
    if (request.status !== 'pending') return;
    const requesterId = typeof request.requesterId === 'string' && request.requesterId.trim()
      ? request.requesterId
      : requesterKey;
    if (hiddenKeys[`${targetUserId}__${requesterId}`]) return;
    count += 1;
    const requestedAtMs = typeof request.requestedAt === 'string' ? new Date(request.requestedAt).getTime() : 0;
    if (Number.isFinite(requestedAtMs) && requestedAtMs > latestRequestedAtMs) {
      latestRequestedAtMs = requestedAtMs;
    }
  });

  return { count, latestRequestedAtMs };
};

const subscribeToSharedPendingSummary = (userId: string, callback: PendingSummarySubscriber): (() => void) => {
  let subscription = pendingSummarySubscriptions.get(userId);
  if (!subscription) {
    const callbacks = new Set<PendingSummarySubscriber>();
    let currentData: Record<string, ProfileViewRequest> | null = null;
    let currentHiddenKeys: Record<string, boolean> = {};
    const emit = () => {
      const summary = summarizePendingRequests(userId, currentData, currentHiddenKeys);
      callbacks.forEach((subscriber) => subscriber(summary));
    };

    const unsubscribe = onValue(ref(database, `profileViewRequests/${userId}`), (snap) => {
      currentData = snap.exists() ? (snap.val() as Record<string, ProfileViewRequest>) : null;
      emit();
    }, (error) => {
      console.error('[profilePermissionService] subscribeToPendingSummary failed:', error);
      callbacks.forEach((subscriber) => subscriber({ count: 0, latestRequestedAtMs: 0 }));
    });

    const unsubscribeHidden = onValue(ref(database, `users/${userId}/profileRequestsArchive`), (snap) => {
      const raw = snap.exists() ? ((snap.val() as Record<string, boolean | ArchivedRequestEntry>) ?? {}) : {};
      currentHiddenKeys = Object.entries(raw).reduce<Record<string, boolean>>((acc, [key, value]) => {
        if (typeof value === 'boolean') {
          if (value) acc[key] = true;
          return acc;
        }
        if (value && typeof value === 'object' && value.archived) acc[key] = true;
        return acc;
      }, {});
      emit();
    }, () => {
      currentHiddenKeys = {};
      emit();
    });

    const unsubscribeAll = () => {
      unsubscribe();
      unsubscribeHidden();
    };

    subscription = { callbacks, unsubscribe: unsubscribeAll };
    pendingSummarySubscriptions.set(userId, subscription);
  }

  subscription.callbacks.add(callback);
  return () => {
    const current = pendingSummarySubscriptions.get(userId);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size === 0) {
      current.unsubscribe();
      pendingSummarySubscriptions.delete(userId);
    }
  };
};

type ArchivedRequestEntry = {
  archived: boolean;
  updatedAt: object | number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PROFILE_CONTACT_DAILY_LIMIT = 10;
const DAILY_COUNTER_PREFIX = '@chaika:profile_contact_daily:v1:';

const getLocalDayStart = (timeMs = Date.now()): number => {
  const date = new Date(timeMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const readDailyRequestCount = async (requesterId: string): Promise<{ dayStart: number; count: number }> => {
  const todayStart = getLocalDayStart();
  try {
    const raw = await AsyncStorage.getItem(`${DAILY_COUNTER_PREFIX}${requesterId}`);
    if (!raw) return { dayStart: todayStart, count: 0 };
    const parsed = JSON.parse(raw) as Partial<{ dayStart: number; count: number }>;
    if (parsed.dayStart !== todayStart) return { dayStart: todayStart, count: 0 };
    return { dayStart: todayStart, count: Math.max(0, Number(parsed.count) || 0) };
  } catch {
    return { dayStart: todayStart, count: 0 };
  }
};

const recordDailyRequest = async (requesterId: string): Promise<void> => {
  const current = await readDailyRequestCount(requesterId);
  const next = { dayStart: current.dayStart, count: current.count + 1 };
  try {
    await AsyncStorage.setItem(`${DAILY_COUNTER_PREFIX}${requesterId}`, JSON.stringify(next));
  } catch {
    // Local anti-spam is best-effort only; never turn storage issues into permission problems.
  }
};

const isWithinLastDay = (isoDate: unknown): boolean => {
  if (typeof isoDate !== 'string') return false;
  const time = new Date(isoDate).getTime();
  return Number.isFinite(time) && Date.now() - time < DAY_MS;
};

export const profilePermissionService = {
  requestKey(targetUserId: string, requesterId: string): string {
    return `${targetUserId}__${requesterId}`;
  },

  async getHiddenRequestKeys(userId: string): Promise<Record<string, boolean>> {
    try {
      const snap = await get(ref(database, `users/${userId}/profileRequestsArchive`));
      if (!snap.exists()) return {};
      const raw = (snap.val() as Record<string, boolean | ArchivedRequestEntry>) ?? {};
      const result: Record<string, boolean> = {};
      Object.entries(raw).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
          result[key] = value;
          return;
        }
        result[key] = value?.archived === true;
      });
      return result;
    } catch {
      try {
        // Backward compatibility for old hidden-only storage
        const legacy = await get(ref(database, `users/${userId}/hiddenProfileRequests`));
        if (!legacy.exists()) return {};
        return (legacy.val() as Record<string, boolean>) ?? {};
      } catch {
        return {};
      }
    }
  },

  async hideRequestForUser(userId: string, targetUserId: string, requesterId: string): Promise<void> {
    const key = profilePermissionService.requestKey(targetUserId, requesterId);
    try {
      await set(ref(database, `users/${userId}/profileRequestsArchive/${key}`), {
        archived: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[profilePermissionService] hideRequestForUser failed:', err);
      throw err;
    }
  },

  async unhideRequestForUser(userId: string, targetUserId: string, requesterId: string): Promise<void> {
    const key = profilePermissionService.requestKey(targetUserId, requesterId);
    try {
      await set(ref(database, `users/${userId}/profileRequestsArchive/${key}`), {
        archived: false,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[profilePermissionService] unhideRequestForUser failed:', err);
      throw err;
    }
  },

  async getPrivacyMode(userId: string): Promise<ProfilePrivacyMode> {
    try {
      const snap = await get(ref(database, `users/${userId}/profilePrivacy`));
      return (snap.val() as ProfilePrivacyMode) ?? 'request';
    } catch {
      return 'request';
    }
  },

  async setPrivacyMode(userId: string, mode: ProfilePrivacyMode): Promise<void> {
    try {
      await set(ref(database, `users/${userId}/profilePrivacy`), mode);
    } catch (err) {
      console.error('[profilePermissionService] setPrivacyMode failed:', err);
      throw err;
    }
  },

  async requestView(
    targetUserId: string,
    requester: { id: string; name: string; photoURL?: string },
    context: ViewRequestContext,
    _targetProfile?: { name?: string; photoURL?: string },
    options?: ContactRequestOptions
  ): Promise<ProfileViewRequestResult> {
    if (!targetUserId || !requester.id || targetUserId === requester.id) {
      throw new Error('Invalid requestView arguments');
    }

    // If target profile is open — no request needed, contact is freely accessible
    const privacyMode = await profilePermissionService.getPrivacyMode(targetUserId);
    if (privacyMode === 'open') {
      return 'open_profile';
    }

    const cooldownLeft = RATE_LIMITERS.profileViewRequest.cooldownSecondsLeft();
    if (cooldownLeft > 0) {
      return 'cooldown';
    }

    const path = `profileViewRequests/${targetUserId}/${requester.id}`;
    try {
      const existing = await get(ref(database, path));
      if (existing.exists()) {
        const value = existing.val() as Partial<ProfileViewRequest>;
        const s = value?.status as ViewRequestStatus;
        if (s === 'approved') return 'already_approved';
        if (s === 'pending') return 'already_pending';
        if (s === 'denied' && isWithinLastDay(value?.requestedAt ?? value?.createdAt)) {
          return 'retry_later';
        }
      }
    } catch {
      // can't read existing status — proceed to write attempt
    }
    const daily = await readDailyRequestCount(requester.id);
    if (daily.count >= PROFILE_CONTACT_DAILY_LIMIT) {
      return 'daily_limit';
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      requesterId: requester.id,
      requesterUserId: requester.id,
      requesterName: requester.name,
      requesterPhotoURL: requester.photoURL ?? '',
      targetUserId,
      targetName: _targetProfile?.name ?? '',
      targetPhotoURL: _targetProfile?.photoURL ?? '',
      sharedContact: '',
      requestedAt: now,
      createdAt: now,
      context,
      status: 'pending',
    };
    if (options?.reason !== undefined) payload.reason = options.reason;
    if (options?.sourceId !== undefined) payload.sourceId = options.sourceId;
    if (options?.sourceTitle !== undefined) payload.sourceTitle = options.sourceTitle;
    if (options?.sourceType !== undefined) payload.sourceType = options.sourceType;
    if (options?.requesterPhone !== undefined) payload.requesterPhone = options.requesterPhone;
    if (options?.targetPhone !== undefined) payload.targetPhone = options.targetPhone;

    await update(ref(database), {
      [path]: payload,
      [`outgoingProfileRequestsByUser/${requester.id}/${targetUserId}`]: payload,
    });
    RATE_LIMITERS.profileViewRequest.recordSubmit();
    void recordDailyRequest(requester.id);
    return 'sent';
  },

  async checkAccess(targetUserId: string, requesterId: string): Promise<ViewRequestStatus | null> {
    try {
      const snap = await get(ref(database, `profileViewRequests/${targetUserId}/${requesterId}`));
      if (!snap.exists()) return null;
      return (snap.val()?.status as ViewRequestStatus) ?? null;
    } catch (error) {
      void logClientError('profilePermissionService.checkAccess', error, { targetUserId, requesterId });
      throw error;
    }
  },

  async getAccessRecord(targetUserId: string, requesterId: string): Promise<AccessRecord> {
    try {
      const snap = await get(ref(database, `profileViewRequests/${targetUserId}/${requesterId}`));
      if (!snap.exists()) {
        return { status: null };
      }
      const status = (snap.val()?.status as ViewRequestStatus) ?? null;
      const sharedContact = typeof snap.val()?.sharedContact === 'string' ? snap.val().sharedContact : undefined;
      return { status, sharedContact };
    } catch (error) {
      void logClientError('profilePermissionService.getAccessRecord', error, { targetUserId, requesterId });
      throw error;
    }
  },

  async getAllRequests(userId: string): Promise<ProfileViewRequest[]> {
    let snap;
    try {
      snap = await get(ref(database, `profileViewRequests/${userId}`));
    } catch (err) {
      console.error('[profilePermissionService] getAllRequests failed:', err);
      return [];
    }
    if (!snap.exists()) return [];
    const data = snap.val() as Record<string, Partial<ProfileViewRequest>>;
    return Object.entries(data)
      .map(([requesterId, value]) => ({
        requesterId: typeof value.requesterId === 'string' && value.requesterId.trim() ? value.requesterId : requesterId,
        requesterUserId: typeof value.requesterUserId === 'string' ? value.requesterUserId : (typeof value.requesterId === 'string' ? value.requesterId : requesterId),
        requesterName: typeof value.requesterName === 'string' && value.requesterName.trim() ? value.requesterName : 'Unknown user',
        requesterPhotoURL: typeof value.requesterPhotoURL === 'string' ? value.requesterPhotoURL : '',
        requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : new Date(0).toISOString(),
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
        context: (value.context as ViewRequestContext) ?? 'lyudi',
        status: (value.status as ViewRequestStatus) ?? 'pending',
        sharedContact: typeof value.sharedContact === 'string' ? value.sharedContact : '',
        reason: value.reason as ContactReason | undefined,
        sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
        sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
        sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
        requesterPhone: typeof value.requesterPhone === 'string' ? value.requesterPhone : undefined,
        targetPhone: typeof value.targetPhone === 'string' ? value.targetPhone : undefined,
      }))
      .filter((r) => Boolean(r.requesterId) && r.status === 'pending')
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  },

  async getAllRequestsWithHistory(userId: string): Promise<ProfileViewRequest[]> {
    let snap;
    try {
      snap = await get(ref(database, `profileViewRequests/${userId}`));
    } catch (err) {
      console.error('[profilePermissionService] getAllRequestsWithHistory failed:', err);
      return [];
    }
    if (!snap.exists()) return [];
    const data = snap.val() as Record<string, Partial<ProfileViewRequest>>;
    return Object.entries(data)
      .map(([requesterId, value]) => ({
        requesterId: typeof value.requesterId === 'string' && value.requesterId.trim() ? value.requesterId : requesterId,
        requesterUserId: typeof value.requesterUserId === 'string' ? value.requesterUserId : (typeof value.requesterId === 'string' ? value.requesterId : requesterId),
        requesterName: typeof value.requesterName === 'string' && value.requesterName.trim() ? value.requesterName : 'Unknown user',
        requesterPhotoURL: typeof value.requesterPhotoURL === 'string' ? value.requesterPhotoURL : '',
        requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : new Date(0).toISOString(),
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
        context: (value.context as ViewRequestContext) ?? 'lyudi',
        status: (value.status as ViewRequestStatus) ?? 'pending',
        sharedContact: typeof value.sharedContact === 'string' ? value.sharedContact : '',
        reason: value.reason as ContactReason | undefined,
        sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
        sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
        sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
        requesterPhone: typeof value.requesterPhone === 'string' ? value.requesterPhone : undefined,
        targetPhone: typeof value.targetPhone === 'string' ? value.targetPhone : undefined,
        viewedAt: typeof value.viewedAt === 'string' ? value.viewedAt : undefined,
      }))
      .filter((r) => Boolean(r.requesterId))
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  },

  async getOutgoingRequests(userId: string): Promise<ProfileViewRequest[]> {
    let indexedSnap;
    try {
      indexedSnap = await get(ref(database, `outgoingProfileRequestsByUser/${userId}`));
    } catch (err) {
      console.error('[profilePermissionService] getOutgoingRequests failed:', err);
      return [];
    }
    if (indexedSnap.exists()) {
      const indexed = indexedSnap.val() as Record<string, Partial<ProfileViewRequest>>;
      const out = Object.entries(indexed)
        .map(([targetUserId, value]) => ({
          requesterId: typeof value.requesterId === 'string' && value.requesterId.trim() ? value.requesterId : userId,
          requesterUserId: typeof value.requesterUserId === 'string' ? value.requesterUserId : userId,
          requesterName: typeof value.requesterName === 'string' && value.requesterName.trim() ? value.requesterName : 'Unknown user',
          requesterPhotoURL: typeof value.requesterPhotoURL === 'string' ? value.requesterPhotoURL : '',
          targetUserId,
          targetName: typeof value.targetName === 'string' ? value.targetName : '',
          targetPhotoURL: typeof value.targetPhotoURL === 'string' ? value.targetPhotoURL : '',
          requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : new Date(0).toISOString(),
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
          context: (value.context as ViewRequestContext) ?? 'lyudi',
          status: (value.status as ViewRequestStatus) ?? 'pending',
          sharedContact: typeof value.sharedContact === 'string' ? value.sharedContact : '',
          reason: value.reason as ContactReason | undefined,
          sourceType: typeof value.sourceType === 'string' ? value.sourceType : undefined,
          sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
          sourceTitle: typeof value.sourceTitle === 'string' ? value.sourceTitle : undefined,
          requesterPhone: typeof value.requesterPhone === 'string' ? value.requesterPhone : undefined,
          targetPhone: typeof value.targetPhone === 'string' ? value.targetPhone : undefined,
          viewedAt: typeof value.viewedAt === 'string' ? value.viewedAt : undefined,
        }))
        .filter((r) => Boolean(r.targetUserId));
      return out.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }

    return [];
  },

  async respondToRequest(targetUserId: string, requesterId: string, approved: boolean): Promise<void> {
    const status: ViewRequestStatus = approved ? 'approved' : 'denied';
    let sharedContact = '';
    if (approved) {
      try {
        const ownerSnap = await get(ref(database, `users/${targetUserId}/phone`));
        const raw = ownerSnap.val();
        sharedContact = typeof raw === 'string' ? raw : '';
      } catch {
        sharedContact = '';
      }
    }
    try {
      await update(ref(database), {
        [`profileViewRequests/${targetUserId}/${requesterId}/status`]: status,
        [`profileViewRequests/${targetUserId}/${requesterId}/sharedContact`]: sharedContact,
        [`outgoingProfileRequestsByUser/${requesterId}/${targetUserId}/status`]: status,
        [`outgoingProfileRequestsByUser/${requesterId}/${targetUserId}/sharedContact`]: sharedContact,
      });
    } catch (err) {
      console.error('[profilePermissionService] respondToRequest failed:', err);
      throw err;
    }
  },

  async markIncomingAsViewed(targetUserId: string, requesterIds: string[]): Promise<void> {
    if (!requesterIds.length) return;
    const now = new Date().toISOString();
    const updates: Record<string, string> = {};
    for (const rid of requesterIds) {
      updates[`profileViewRequests/${targetUserId}/${rid}/viewedAt`] = now;
      updates[`outgoingProfileRequestsByUser/${rid}/${targetUserId}/viewedAt`] = now;
    }
    try {
      await update(ref(database), updates);
    } catch (err) {
      console.error('[profilePermissionService] markIncomingAsViewed failed:', err);
    }
  },

  subscribeToPendingCount(userId: string, callback: (count: number) => void): () => void {
    return subscribeToSharedPendingSummary(userId, (summary) => callback(summary.count));
  },

  subscribeToPendingSummary(userId: string, callback: (summary: PendingRequestsSummary) => void): () => void {
    return subscribeToSharedPendingSummary(userId, callback);
  },
};
