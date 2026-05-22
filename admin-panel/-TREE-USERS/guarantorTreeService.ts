import { get, orderByChild, query, ref, equalTo } from 'firebase/database';
import { database } from '../src/firebase/firebase';
import type { UserProfile, UserAccessRecord, TrustChainNode, InviteRequestBrief } from './types';

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeStatus = (value: unknown): 'active' | 'inactive' | 'blocked' => {
  if (value === 'inactive' || value === 'blocked') return value;
  return 'active';
};

const normalizeAccessStatus = (value: unknown): 'active' | 'pending' | 'denied' | 'needs_review' | 'blocked' => {
  if (value === 'pending' || value === 'denied' || value === 'needs_review' || value === 'blocked') return value;
  return 'active';
};

const normalizeUserProfile = (uid: string, raw: unknown): UserProfile | null => {
  if (!isRecord(raw)) return null;
  return {
    uid,
    phone: getString(raw.phone),
    name: getString(raw.name),
    registeredAt: getNumber(raw.registeredAt),
    address: getString(raw.address),
    apartment: getString(raw.apartment),
  };
};

const normalizeUserAccess = (raw: unknown): UserAccessRecord | null => {
  if (!isRecord(raw)) return null;
  return {
    uid: getString(raw.uid),
    status: normalizeAccessStatus(raw.status),
    role: getString(raw.role),
    temp_expires_at: getNumber(raw.temp_expires_at),
    denied_count: getNumber(raw.denied_count),
    current_request_id: getString(raw.current_request_id),
    trusted: raw.trusted === true || getString(raw.trusted) === 'true',
  };
};

const normalizeTrustNode = (id: string, raw: unknown): TrustChainNode | null => {
  if (!isRecord(raw)) return null;
  return {
    parentUid: getString(raw.parentUid),
    childUid: getString(raw.childUid),
    depth: getNumber(raw.depth),
    status: normalizeStatus(raw.status),
    approvedAt: getNumber(raw.approvedAt),
    inviteRequestId: getString(raw.inviteRequestId),
  };
};

const normalizeInviteRequest = (id: string, raw: unknown): InviteRequestBrief | null => {
  if (!isRecord(raw)) return null;
  return {
    id,
    requesterUid: getString(raw.requesterUid),
    status: getString(raw.status),
    createdAt: getNumber(raw.createdAt),
    moderatedAt: getNumber(raw.moderatedAt),
    moderatedBy: getString(raw.moderatedBy),
    moderationReason: getString(raw.moderationReason),
  };
};

export const searchUsers = async (queryText: string): Promise<UserProfile[]> => {
  if (!queryText.trim()) return [];
  const snapshot = await get(ref(database, 'users'));
  const raw = snapshot.val() as Record<string, unknown> | null;
  if (!raw) return [];

  const lower = queryText.toLowerCase();
  const results: UserProfile[] = [];

  for (const [uid, value] of Object.entries(raw)) {
    const user = normalizeUserProfile(uid, value);
    if (!user) continue;
    const phoneClean = user.phone.replace(/[^0-9]/g, '');
    const queryClean = queryText.replace(/[^0-9a-zA-Z]/g, '');
    if (
      uid.toLowerCase().startsWith(lower) ||
      phoneClean.includes(queryClean) ||
      user.name.toLowerCase().includes(lower)
    ) {
      results.push(user);
    }
    if (results.length >= 100) break;
  }

  return results.slice(0, 10);
};

export const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await get(ref(database, `users/${uid}`));
  return normalizeUserProfile(uid, snapshot.val());
};

export const loadUserAccess = async (uid: string): Promise<UserAccessRecord | null> => {
  const snapshot = await get(ref(database, `user_access/${uid}`));
  return normalizeUserAccess(snapshot.val());
};

export const loadTrustChain = async (uid: string): Promise<TrustChainNode[]> => {
  const snapshot = await get(
    query(ref(database, 'trust_tree'), orderByChild('childUid'), equalTo(uid))
  );
  const raw = snapshot.val() as Record<string, unknown> | null;
  if (!raw) return [];

  const nodes: TrustChainNode[] = [];
  for (const [id, value] of Object.entries(raw)) {
    const node = normalizeTrustNode(id, value);
    if (node) nodes.push(node);
  }
  return nodes.sort((a, b) => a.depth - b.depth);
};

export const loadChildrenNodes = async (uid: string): Promise<TrustChainNode[]> => {
  const snapshot = await get(
    query(ref(database, 'trust_tree'), orderByChild('parentUid'), equalTo(uid))
  );
  const raw = snapshot.val() as Record<string, unknown> | null;
  if (!raw) return [];

  const nodes: TrustChainNode[] = [];
  for (const [id, value] of Object.entries(raw)) {
    const node = normalizeTrustNode(id, value);
    if (node) nodes.push(node);
  }
  return nodes.sort((a, b) => b.approvedAt - a.approvedAt).slice(0, 50);
};

export const loadInviteRequest = async (uid: string): Promise<InviteRequestBrief | null> => {
  const snapshot = await get(
    query(ref(database, 'invite_requests'), orderByChild('requesterUid'), equalTo(uid))
  );
  const raw = snapshot.val() as Record<string, unknown> | null;
  if (!raw) return null;

  let latest: InviteRequestBrief | null = null;
  let latestTime = 0;
  for (const [id, value] of Object.entries(raw)) {
    const req = normalizeInviteRequest(id, value);
    if (req && req.createdAt > latestTime) {
      latest = req;
      latestTime = req.createdAt;
    }
  }
  return latest;
};

export const loadMultipleUsers = async (uids: string[]): Promise<Map<string, UserProfile>> => {
  const map = new Map<string, UserProfile>();
  const unique = [...new Set(uids)];
  const batch: Promise<void>[] = [];
  for (const uid of unique) {
    batch.push(
      loadUserProfile(uid).then((user) => {
        if (user) map.set(uid, user);
      })
    );
  }
  await Promise.all(batch);
  return map;
};

export const logAudit = (action: string, details: Record<string, unknown>): void => {
  console.info(`[Audit:GuarantorTree] ${action}`, details);
};
