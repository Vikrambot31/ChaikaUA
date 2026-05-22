import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, firebaseApp } from '../firebase-core';

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
};

type SubmitInviteRequestResponse = {
  ok: boolean;
  status: 'received';
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
};

const functions = getFunctions(firebaseApp);
const INVITE_STATUS_CACHE_KEY = '@chaika:invite_access_status_v1';
const INVITE_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

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
    await AsyncStorage.setItem(getInviteStatusCacheKey(), JSON.stringify({ snapshot, cachedAt: Date.now() }));
  } catch {}
};

const getCachedInviteStatus = async (): Promise<InviteRequestSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(getInviteStatusCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: InviteRequestSnapshot; cachedAt?: number };
    if (!parsed.snapshot || Date.now() - Number(parsed.cachedAt || 0) > INVITE_STATUS_CACHE_TTL_MS) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
};

export const normalizeSponsorPhone = (value: string): string => {
  const raw = String(value || '').trim().replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(raw)) return `+38${raw}`;
  if (/^380\d{9}$/.test(raw)) return `+${raw}`;
  return raw;
};

export const isValidSponsorPhone = (value: string): boolean =>
  SPONSOR_PHONE_RE.test(normalizeSponsorPhone(value));

export const submitInviteRequest = async (
  requesterPhone: string,
  sponsorPhone: string,
): Promise<SubmitInviteRequestResponse> => {
  const callable = httpsCallable<
    { requesterPhone: string; sponsorPhone: string },
    SubmitInviteRequestResponse
  >(functions, 'submitInviteRequest');

  const result = await callable({
    requesterPhone: normalizeSponsorPhone(requesterPhone),
    sponsorPhone: normalizeSponsorPhone(sponsorPhone),
  });

  return result.data;
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
  };
  await cacheInviteStatus(snapshot);
  return snapshot;
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
