import { getFunctions, httpsCallable } from 'firebase/functions';
import { equalTo, get, onValue, orderByChild, query, ref } from 'firebase/database';
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

// ── Trust Tree direct reads ─────────────────────────────────────────────

export type TrustTreeNode = {
  userUid: string;
  sponsorUid: string | null;
  phoneMasked: string;
  sponsorName: string;
  depthToRoot: number;
  rootPath: string[];
  riskScore: number;
  riskLevel: string;
  inviteCount: number;
  inviteLimit: number;
  status: string;
  approvedAt: number;
  approvalSource: string;
  createdAt: number;
};

export type TrustChainLink = {
  uid: string;
  name: string;
  depth: number;
};

export type TrustTreeChild = {
  uid: string;
  name: string;
  phoneMasked: string;
  approvedAt: number;
  depthToRoot: number;
};

const normalizeTrustNode = (raw: unknown): TrustTreeNode | null => {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  return {
    userUid: String(d.userUid || ''),
    sponsorUid: d.sponsorUid ? String(d.sponsorUid) : null,
    phoneMasked: String(d.phoneMasked || ''),
    sponsorName: String(d.sponsorName || ''),
    depthToRoot: Number(d.depthToRoot || 0),
    rootPath: Array.isArray(d.rootPath) ? d.rootPath.map(String) : [],
    riskScore: Number(d.riskScore || 0),
    riskLevel: String(d.riskLevel || ''),
    inviteCount: Number(d.inviteCount || 0),
    inviteLimit: Number(d.inviteLimit || 0),
    status: String(d.status || ''),
    approvedAt: Number(d.approvedAt || 0),
    approvalSource: String(d.approvalSource || ''),
    createdAt: Number(d.createdAt || 0),
  };
};

export const getMyTrustNode = async (): Promise<TrustTreeNode | null> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snapshot = await get(ref(database, `trust_tree/${uid}`));
  return normalizeTrustNode(snapshot.val());
};

export const getMyTrustChain = async (): Promise<TrustChainLink[]> => {
  const node = await getMyTrustNode();
  if (!node || !node.rootPath.length) return [];
  const chain: TrustChainLink[] = [];
  for (let i = 0; i < node.rootPath.length; i++) {
    const chainUid = node.rootPath[i];
    let name = '';
    try {
      const userSnap = await get(ref(database, `users/${chainUid}/name`));
      name = String(userSnap.val() || '');
    } catch {
      name = '';
    }
    chain.push({ uid: chainUid, name: name || `#${i + 1}`, depth: i });
  }
  return chain;
};

export const getMyInvitedChildren = async (): Promise<TrustTreeChild[]> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await get(query(ref(database, 'trust_tree'), orderByChild('sponsorUid'), equalTo(uid)));
  if (!snap.exists()) return [];
  const children: TrustTreeChild[] = [];
  snap.forEach((child) => {
    const val = child.val();
    if (val && typeof val === 'object') {
      children.push({
        uid: child.key || '',
        name: String(val.sponsorName || val.phoneMasked || ''),
        phoneMasked: String(val.phoneMasked || ''),
        approvedAt: Number(val.approvedAt || val.createdAt || 0),
        depthToRoot: Number(val.depthToRoot || 0),
      });
    }
  });
  return children;
};

export const subscribeMyTrustNode = (
  onChanged: (node: TrustTreeNode | null) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChanged(null);
    return () => {};
  }
  return onValue(ref(database, `trust_tree/${uid}`), (snapshot) => {
    onChanged(normalizeTrustNode(snapshot.val()));
  });
};
