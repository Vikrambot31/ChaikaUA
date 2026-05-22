import { endBefore, get, limitToLast, orderByChild, query, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';

const FEATURE_FLAG_PATH = 'feature_flags/invite_access/current';
const TRUSTED_SPONSORS_PATH = 'trusted_sponsors';
const INVITE_REQUESTS_PATH = 'invite_requests';
const PAGE_SIZE = 100;

export type InviteAccessMode = 'disabled' | 'soft' | 'medium' | 'hard';
export type InviteRequestStatus = 'pending' | 'pending_sponsor' | 'approved' | 'denied' | 'cancelled' | 'needs_manual_review' | 'auto_denied';
export type TrustedSponsorStatus = 'active' | 'disabled';

export type InviteFeatureFlag = {
  enabled: boolean;
  mode: InviteAccessMode;
  updatedAt: number;
  updatedBy: string;
  version: number;
};

export type TrustedSponsor = {
  id: string;
  phoneMasked: string;
  status: TrustedSponsorStatus;
  note: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  approvedInviteCount: number;
  lastInviteAt: number;
};

export type InviteRequest = {
  id: string;
  requesterUid: string;
  requesterPhoneMasked: string;
  requesterPhoneHash: string;
  sponsorPhoneMasked: string;
  sponsorPhoneHash: string;
  sponsorTrusted: boolean;
  status: InviteRequestStatus;
  createdAt: number;
  updatedAt: number;
  moderatedAt: number;
  moderatedBy: string;
  moderationReason: string;
  source: string;
  modeAtCreation: InviteAccessMode;
  riskScore: number;
  riskLevel: string;
  decisionSource: string;
  decisionReason: string;
};

export type InviteAccessState = {
  flag: InviteFeatureFlag;
  sponsors: TrustedSponsor[];
  requests: InviteRequest[];
  hasMore: boolean;
};

type CallableResult = {
  ok: boolean;
};

const functions = getFunctions(firebaseApp);

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
const getBoolean = (value: unknown): boolean => value === true;

const normalizeSponsorStatus = (value: unknown): TrustedSponsorStatus =>
  value === 'disabled' ? 'disabled' : 'active';

const normalizeRequestStatus = (value: unknown): InviteRequestStatus => {
  if (
    value === 'pending_sponsor' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'cancelled' ||
    value === 'needs_manual_review' ||
    value === 'auto_denied'
  ) return value;
  return 'pending';
};

const normalizeMode = (value: unknown, enabled: boolean): InviteAccessMode => {
  if (value === 'soft' || value === 'medium' || value === 'hard') return value;
  return enabled ? 'soft' : 'disabled';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeFlag = (raw: unknown): InviteFeatureFlag => {
  const value = isRecord(raw) ? raw : {};
  return {
    enabled: getBoolean(value.enabled),
    mode: normalizeMode(value.mode, getBoolean(value.enabled)),
    updatedAt: getNumber(value.updatedAt),
    updatedBy: getString(value.updatedBy),
    version: getNumber(value.version),
  };
};

const normalizeSponsor = (id: string, raw: unknown): TrustedSponsor | null => {
  if (!isRecord(raw)) return null;
  return {
    id,
    phoneMasked: getString(raw.phoneMasked),
    status: normalizeSponsorStatus(raw.status),
    note: getString(raw.note),
    createdAt: getNumber(raw.createdAt),
    createdBy: getString(raw.createdBy),
    updatedAt: getNumber(raw.updatedAt),
    updatedBy: getString(raw.updatedBy),
    approvedInviteCount: getNumber(raw.approvedInviteCount),
    lastInviteAt: getNumber(raw.lastInviteAt),
  };
};

const normalizeRequest = (id: string, raw: unknown): InviteRequest | null => {
  if (!isRecord(raw)) return null;
  return {
    id,
    requesterUid: getString(raw.requesterUid),
    requesterPhoneMasked: getString(raw.requesterPhoneMasked),
    requesterPhoneHash: getString(raw.requesterPhoneHash),
    sponsorPhoneMasked: getString(raw.sponsorPhoneMasked),
    sponsorPhoneHash: getString(raw.sponsorPhoneHash),
    sponsorTrusted: getBoolean(raw.sponsorTrusted),
    status: normalizeRequestStatus(raw.status),
    createdAt: getNumber(raw.createdAt),
    updatedAt: getNumber(raw.updatedAt),
    moderatedAt: getNumber(raw.moderatedAt),
    moderatedBy: getString(raw.moderatedBy),
    moderationReason: getString(raw.moderationReason),
    source: getString(raw.source),
    modeAtCreation: normalizeMode(raw.modeAtCreation, true),
    riskScore: getNumber(raw.riskScore),
    riskLevel: getString(raw.riskLevel),
    decisionSource: getString(raw.decisionSource),
    decisionReason: getString(raw.decisionReason),
  };
};

export const loadInviteAccessState = async (): Promise<InviteAccessState> => {
  const [flagSnapshot, sponsorsSnapshot, requestsSnapshot] = await Promise.all([
    get(ref(database, FEATURE_FLAG_PATH)),
    get(ref(database, TRUSTED_SPONSORS_PATH)),
    get(query(ref(database, INVITE_REQUESTS_PATH), orderByChild('createdAt'), limitToLast(PAGE_SIZE))),
  ]);

  const rawSponsors = sponsorsSnapshot.val() as Record<string, unknown> | null;
  const rawRequests = requestsSnapshot.val() as Record<string, unknown> | null;

  const sponsors = Object.entries(rawSponsors ?? {})
    .map(([id, value]) => normalizeSponsor(id, value))
    .filter((value): value is TrustedSponsor => value !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt);

  const requests = Object.entries(rawRequests ?? {})
    .map(([id, value]) => normalizeRequest(id, value))
    .filter((value): value is InviteRequest => value !== null)
    .sort((left, right) => right.createdAt - left.createdAt);

  return {
    flag: normalizeFlag(flagSnapshot.val()),
    sponsors,
    requests,
    hasMore: requests.length >= PAGE_SIZE,
  };
};

export const loadMoreRequests = async (oldestCreatedAt: number): Promise<{ requests: InviteRequest[]; hasMore: boolean }> => {
  const requestsSnapshot = await get(
    query(ref(database, INVITE_REQUESTS_PATH), orderByChild('createdAt'), endBefore(oldestCreatedAt), limitToLast(PAGE_SIZE)),
  );
  const rawRequests = requestsSnapshot.val() as Record<string, unknown> | null;
  const requests = Object.entries(rawRequests ?? {})
    .map(([id, value]) => normalizeRequest(id, value))
    .filter((value): value is InviteRequest => value !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
  return { requests, hasMore: requests.length >= PAGE_SIZE };
};

export const setInviteAccessEnabled = async (enabled: boolean): Promise<void> => {
  const callable = httpsCallable<{ enabled: boolean }, CallableResult>(functions, 'adminSetInviteAccessEnabled');
  await callable({ enabled });
};

export const setInviteAccessMode = async (mode: InviteAccessMode): Promise<void> => {
  const callable = httpsCallable<{ mode: InviteAccessMode }, CallableResult>(functions, 'adminSetInviteAccessMode');
  await callable({ mode });
};

export const createTrustedSponsor = async (sponsorPhone: string, note: string): Promise<void> => {
  const callable = httpsCallable<{ sponsorPhone: string; note?: string }, CallableResult>(functions, 'adminCreateTrustedSponsor');
  await callable({ sponsorPhone, note: note.trim() || undefined });
};

export const updateTrustedSponsorStatus = async (
  sponsorPhoneHash: string,
  status: TrustedSponsorStatus,
  note?: string,
): Promise<void> => {
  const callable = httpsCallable<
    { sponsorPhoneHash: string; status: TrustedSponsorStatus; note?: string },
    CallableResult
  >(functions, 'adminUpdateTrustedSponsor');
  await callable({ sponsorPhoneHash, status, note });
};

export const moderateInviteRequest = async (
  requestId: string,
  status: Extract<InviteRequestStatus, 'approved' | 'denied'>,
  reason: string,
): Promise<void> => {
  const callable = httpsCallable<
    { requestId: string; status: 'approved' | 'denied'; reason?: string },
    CallableResult
  >(functions, 'adminModerateInviteRequest');
  await callable({ requestId, status, reason: reason.trim() || undefined });
};

export const grantTemporaryAccess = async (
  uid: string,
  durationHours: number,
  reason: string,
): Promise<void> => {
  const callable = httpsCallable<
    { uid: string; durationHours: number; reason: string },
    CallableResult
  >(functions, 'grantTemporaryAccess');
  await callable({ uid, durationHours, reason: reason.trim() });
};
