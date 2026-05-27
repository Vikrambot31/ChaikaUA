import { endBefore, get, limitToLast, orderByChild, query, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';

const FEATURE_FLAG_PATH = 'feature_flags/invite_access/current';
const TRUSTED_SPONSORS_PATH = 'trusted_sponsors';
const INVITE_REQUESTS_PATH = 'invite_requests';
const PAGE_SIZE = 100;

export type InviteAccessMode = 'disabled' | 'soft' | 'medium';
export type InviteRequestStatus = 'pending' | 'pending_sponsor' | 'approved' | 'denied' | 'cancelled' | 'needs_manual_review' | 'auto_denied' | 'temporary_access';
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
  temp_expires_at: number;
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

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

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
    value === 'auto_denied' ||
    value === 'temporary_access'
  ) return value;
  return 'pending';
};

const normalizeMode = (value: unknown, enabled: boolean): InviteAccessMode => {
  if (value === 'soft' || value === 'medium') return value;
  return enabled ? 'medium' : 'disabled';
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
    temp_expires_at: getNumber(raw.temp_expires_at) || getNumber(raw.tempExpiresAt),
  };
};

export const loadInviteAccessState = async (): Promise<InviteAccessState> => {
  if (LOCAL_MODE) {
    const [invites, config] = await Promise.all([
      fetch(`${LOCAL_API}/invites`).then(r => r.json()) as Promise<Array<Record<string, unknown>>>,
      fetch(`${LOCAL_API}/config`).then(r => r.json()) as Promise<Record<string, unknown>>,
    ]);
    const requests: InviteRequest[] = invites.map(raw => ({
      id: String(raw.id),
      requesterUid: String(raw.sponsorId ?? ''),
      requesterPhoneMasked: '+380XX',
      requesterPhoneHash: '',
      sponsorPhoneMasked: '+380XX',
      sponsorPhoneHash: '',
      sponsorTrusted: raw.status === 'trusted',
      status: normalizeRequestStatus(raw.status),
      createdAt: Number(raw.createdAt ?? 0),
      updatedAt: Number(raw.createdAt ?? 0),
      moderatedAt: 0,
      moderatedBy: '',
      moderationReason: '',
      source: 'local',
      modeAtCreation: 'soft',
      riskScore: 0,
      riskLevel: 'low',
      decisionSource: 'local',
      decisionReason: '',
      temp_expires_at: Number(raw.temp_expires_at ?? raw.tempExpiresAt ?? 0),
    }));
    return {
      flag: {
        enabled: Boolean(config.inviteAccessEnabled),
        mode: (config.inviteAccessMode as InviteAccessMode) ?? 'soft',
        updatedAt: Date.now(),
        updatedBy: 'local',
        version: 1,
      },
      sponsors: [],
      requests,
      hasMore: false,
    };
  }
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
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteAccessEnabled: enabled }),
    });
    return;
  }
  const callable = httpsCallable<{ enabled: boolean }, CallableResult>(functions!, 'adminSetInviteAccessEnabled');
  await callable({ enabled });
};

export const setInviteAccessMode = async (mode: InviteAccessMode): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteAccessMode: mode }),
    });
    return;
  }
  const callable = httpsCallable<{ mode: InviteAccessMode }, CallableResult>(functions!, 'adminSetInviteAccessMode');
  await callable({ mode });
};

export const createTrustedSponsor = async (sponsorPhone: string, note: string): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/trusted_sponsors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorPhone, note: note.trim() || undefined, createdAt: Date.now(), status: 'active' }),
    });
    return;
  }
  const callable = httpsCallable<{ sponsorPhone: string; note?: string }, CallableResult>(functions!, 'adminCreateTrustedSponsor');
  await callable({ sponsorPhone, note: note.trim() || undefined });
};

export const updateTrustedSponsorStatus = async (
  sponsorPhoneHash: string,
  status: TrustedSponsorStatus,
  note?: string,
): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/trusted_sponsors/${sponsorPhoneHash}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note, updatedAt: Date.now() }),
    });
    return;
  }
  const callable = httpsCallable<
    { sponsorPhoneHash: string; status: TrustedSponsorStatus; note?: string },
    CallableResult
  >(functions!, 'adminUpdateTrustedSponsor');
  await callable({ sponsorPhoneHash, status, note });
};

export const moderateInviteRequest = async (
  requestId: string,
  status: Extract<InviteRequestStatus, 'approved' | 'denied'>,
  reason: string,
): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/invites/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, moderationReason: reason.trim() || undefined }),
    });
    return;
  }
  const callable = httpsCallable<
    { requestId: string; status: 'approved' | 'denied'; reason?: string },
    CallableResult
  >(functions!, 'adminModerateInviteRequest');
  await callable({ requestId, status, reason: reason.trim() || undefined });
};

export const grantTemporaryAccess = async (
  uid: string,
  durationHours: number,
  reason: string,
  requestId?: string,
): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/temporary_access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, durationHours, reason: reason.trim(), requestId, grantedAt: Date.now() }),
    });
    return;
  }
  const callable = httpsCallable<
    { uid: string; durationHours: number; reason: string; requestId?: string },
    CallableResult
  >(functions!, 'grantTemporaryAccess');
  await callable({ uid, durationHours, reason: reason.trim(), requestId });
};
