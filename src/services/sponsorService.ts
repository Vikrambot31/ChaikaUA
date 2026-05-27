import { getFunctions, httpsCallable } from 'firebase/functions';
import { get, onValue, ref } from 'firebase/database';
import { auth, database, firebaseApp } from '../firebase-core';
import { CACHE_TTL, cacheGet, cacheSet } from '../utils/cacheLayer';
import { normalizeSponsorPhoneValue } from '../utils/rulesEngine';

export const SPONSOR_PHONE_RE = /^\+380\d{9}$/;

export type InviteRequestStatus = 'disabled' | 'none' | 'pending' | 'pending_sponsor' | 'approved' | 'denied' | 'cancelled' | 'needs_manual_review' | 'auto_denied' | 'temporary_access';

export type UserAccessSnapshot = {
  status?: string;
  temp_expires_at?: number;
  guest_expires_at?: number;
  manual_grant_reason?: string;
  manual_grant_at?: number;
  updatedAt?: number;
};

export type InviteRequestSnapshot = {
  featureEnabled: boolean;
  status: InviteRequestStatus;
  requestId?: string;
  createdAt?: number;
  updatedAt?: number;
  moderatedAt?: number;
  moderationReason?: string;
  mode?: string;
  accessStatus?: string;
  userAccess?: UserAccessSnapshot;
  bypass?: boolean;
  riskScore?: number;
  riskLevel?: string;
  configUpdatedAt?: number;
  moderationAvgHours?: number;
};

type SubmitInviteRequestResponse = {
  ok: boolean;
  status: 'received' | 'pending' | 'pending_sponsor' | 'auto_approved' | 'already_granted' | 'error';
  requestId?: string;
  queuePosition?: number;
  accessStatus?: string;
};

export type SponsorConfirmationSnapshot = {
  confirmationId: string;
  requestId: string;
  requesterUid: string;
  requesterPhoneMasked: string;
  comment: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestStatus: string;
  createdAt: number;
  expiresAt: number;
};

type RawSponsorConfirmationsResponse = {
  ok?: boolean;
  confirmations?: SponsorConfirmationSnapshot[];
};

type RawInviteStatusResponse = {
  featureEnabled?: boolean;
  status?: string;
  requestId?: string;
  createdAt?: number;
  updatedAt?: number;
  moderatedAt?: number;
  moderationReason?: string;
  mode?: string;
  accessStatus?: string;
  userAccess?: UserAccessSnapshot;
  bypass?: boolean;
  riskScore?: number;
  riskLevel?: string;
  configUpdatedAt?: number;
  moderationAvgHours?: number;
};

const functions = getFunctions(firebaseApp);
const INVITE_STATUS_CACHE_KEY = 'invite_access:status';

const normalizeStatus = (value: unknown): InviteRequestStatus => {
  if (
    value === 'pending' ||
    value === 'pending_sponsor' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'cancelled' ||
    value === 'needs_manual_review' ||
    value === 'auto_denied' ||
    value === 'temporary_access'
  ) {
    return value;
  }
  return 'none';
};

const normalizeUserAccess = (value: RawInviteStatusResponse['userAccess']): UserAccessSnapshot | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return {
    status: typeof value.status === 'string' ? value.status : undefined,
    temp_expires_at: Number(value.temp_expires_at || 0),
    guest_expires_at: Number(value.guest_expires_at || 0),
    manual_grant_reason: typeof value.manual_grant_reason === 'string' ? value.manual_grant_reason : '',
    manual_grant_at: Number(value.manual_grant_at || 0),
    updatedAt: Number(value.updatedAt || 0),
  };
};

const getInviteStatusCacheKey = (): string =>
  `${INVITE_STATUS_CACHE_KEY}:${auth.currentUser?.uid || 'anonymous'}`;

const cacheInviteStatus = async (snapshot: InviteRequestSnapshot): Promise<void> => {
  try {
    await cacheSet(getInviteStatusCacheKey(), snapshot, CACHE_TTL.inviteAccess);
  } catch {}
};

const getCachedInviteStatus = async (): Promise<InviteRequestSnapshot | null> => {
  try {
    return await cacheGet<InviteRequestSnapshot>(getInviteStatusCacheKey());
  } catch {
    return null;
  }
};

export const normalizeSponsorPhone = (value: string): string => {
  return normalizeSponsorPhoneValue(value);
};

export const isValidSponsorPhone = (value: string): boolean =>
  SPONSOR_PHONE_RE.test(normalizeSponsorPhone(value));

export const submitInviteRequest = async (
  requesterPhone: string,
  sponsorPhone: string,
  payload: { text?: string; apartment?: string } = {},
): Promise<SubmitInviteRequestResponse> => {
  const callable = httpsCallable<
    { requesterPhone: string; sponsorPhone: string; text?: string; apartment?: string; comment?: string },
    SubmitInviteRequestResponse
  >(functions, 'submitInviteRequest');

  const result = await callable({
    requesterPhone: normalizeSponsorPhone(requesterPhone),
    sponsorPhone: normalizeSponsorPhone(sponsorPhone),
    text: String(payload.text || '').trim(),
    apartment: String(payload.apartment || '').trim(),
    comment: String(payload.text || '').trim(),
  });

  return result.data;
};

export const getModerationAverageHours = async (): Promise<number> => {
  const snapshot = await get(ref(database, 'stats/moderation_avg_hours'));
  const value = Number(snapshot.val() || 0);
  return Number.isFinite(value) && value > 0 ? value : 48;
};

export const getMyInviteRequestStatus = async (): Promise<InviteRequestSnapshot> => {
  const callable = httpsCallable<Record<string, never>, RawInviteStatusResponse>(
    functions,
    'getMyInviteRequestStatus',
  );
  let result;
  try {
    result = await callable({});
  } catch (error) {
    const cached = await getCachedInviteStatus();
    if (cached) return cached;
    throw error;
  }
  const featureEnabled = result.data.featureEnabled === true;

  if (!featureEnabled) {
    const snapshot: InviteRequestSnapshot = {
      featureEnabled: false,
      mode: result.data.mode,
      accessStatus: result.data.accessStatus,
      userAccess: normalizeUserAccess(result.data.userAccess),
      bypass: result.data.bypass === true,
      configUpdatedAt: Number(result.data.configUpdatedAt || 0),
      status: 'disabled',
    };
    await cacheInviteStatus(snapshot);
    return snapshot;
  }

  const snapshot: InviteRequestSnapshot = {
    featureEnabled,
    status: normalizeStatus(result.data.status),
    mode: result.data.mode,
    accessStatus: result.data.accessStatus,
    userAccess: normalizeUserAccess(result.data.userAccess),
    bypass: result.data.bypass === true,
    requestId: result.data.requestId,
    createdAt: Number(result.data.createdAt || 0),
    updatedAt: Number(result.data.updatedAt || 0),
    moderatedAt: Number(result.data.moderatedAt || 0),
    moderationReason: result.data.moderationReason || '',
    riskScore: Number(result.data.riskScore || 0),
    riskLevel: result.data.riskLevel || '',
    configUpdatedAt: Number(result.data.configUpdatedAt || 0),
    moderationAvgHours: Number(result.data.moderationAvgHours || 0),
  };
  await cacheInviteStatus(snapshot);
  return snapshot;
};

export const subscribeMyInviteAccessStatus = (
  onChanged: () => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  const handler = () => { void onChanged(); };

  // TZ_3.3 — 4th critical onValue: fires immediately when moderator approves the request.
  // invite_access/{uid} — where the invite request record lives (status field).
  // user_access/{uid}   — where the access grant is written after approval.
  // Both paths are watched so whichever the admin panel writes to first triggers a refresh.
  const unsubInvite = onValue(ref(database, `invite_access/${uid}`), handler);
  const unsubUserAccess = onValue(ref(database, `user_access/${uid}`), handler);

  return () => {
    unsubInvite();
    unsubUserAccess();
  };
};

const normalizeConfirmationStatus = (value: unknown): SponsorConfirmationSnapshot['status'] => {
  if (value === 'approved' || value === 'denied' || value === 'expired') return value;
  return 'pending';
};

export const listMySponsorConfirmations = async (): Promise<SponsorConfirmationSnapshot[]> => {
  const callable = httpsCallable<Record<string, never>, RawSponsorConfirmationsResponse>(
    functions,
    'listMySponsorConfirmations',
  );
  const result = await callable({});
  return (Array.isArray(result.data.confirmations) ? result.data.confirmations : []).map((item) => ({
    confirmationId: String(item.confirmationId || ''),
    requestId: String(item.requestId || ''),
    requesterUid: String(item.requesterUid || ''),
    requesterPhoneMasked: String(item.requesterPhoneMasked || ''),
    comment: String(item.comment || ''),
    status: normalizeConfirmationStatus(item.status),
    requestStatus: String(item.requestStatus || ''),
    createdAt: Number(item.createdAt || 0),
    expiresAt: Number(item.expiresAt || 0),
  }));
};

export const approveSponsorConfirmation = async (confirmationId: string): Promise<void> => {
  const callable = httpsCallable<{ confirmationId: string }, { ok: boolean }>(functions, 'approveSponsorConfirmation');
  await callable({ confirmationId });
};

export const denySponsorConfirmation = async (confirmationId: string): Promise<void> => {
  const callable = httpsCallable<{ confirmationId: string }, { ok: boolean }>(functions, 'denySponsorConfirmation');
  await callable({ confirmationId });
};
