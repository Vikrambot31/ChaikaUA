import { equalTo, get, limitToFirst, orderByChild, query, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';
import type {
  ChainEntry,
  InviteRequestBrief,
  SearchResultItem,
  TrustChainNode,
  UserAccessRecord,
  UserProfile,
  ManualRootGrantResult,
} from '../types/guarantorTree';

const USERS_PATH = 'users';
const ACCESS_PATH = 'user_access';
const TRUST_TREE_PATH = 'trust_tree';
const INVITE_REQUESTS_PATH = 'invite_requests';
const MAX_CHAIN_DEPTH = 20;

export const ROOT_GUARANTOR_PHONE = '+380509000127';
export const ROOT_GUARANTOR_UID = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2';
const LEGACY_ROOT_GUARANTOR_UID = `root:${ROOT_GUARANTOR_PHONE}`;
const functions = getFunctions(firebaseApp);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getFlexibleBoolean = (value: unknown): boolean => value === true || value === 'true';

const normalizeAccessStatus = (value: unknown): UserAccessRecord['status'] => {
  if (
    value === 'active' ||
    value === 'approved' ||
    value === 'temporary_access' ||
    value === 'whitelist_access' ||
    value === 'pending' ||
    value === 'pending_sponsor' ||
    value === 'denied' ||
    value === 'needs_review' ||
    value === 'needs_manual_review' ||
    value === 'blocked'
  ) {
    return value;
  }
  return 'unknown';
};

const normalizeTrustStatus = (value: unknown): TrustChainNode['status'] => {
  if (value === 'inactive' || value === 'blocked') return value;
  return 'active';
};

export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 5) return `+${digits.slice(0, 3)} ${digits.slice(3, 5)}***`;
  return phone ? '***' : '-';
};

export const shortUid = (uid: string): string => (uid ? `${uid.slice(0, 8)}${uid.length > 8 ? '...' : ''}` : '-');

export const makeDeletedUser = (uid: string): UserProfile => ({
  uid,
  phone: '',
  name: `Пользователь удален (${shortUid(uid)})`,
  registeredAt: 0,
  address: '',
  apartment: '',
  deleted: true,
});

export const makeRootGuarantorUser = (): UserProfile => ({
  uid: ROOT_GUARANTOR_UID,
  phone: ROOT_GUARANTOR_PHONE,
  name: 'Главный поручитель',
  registeredAt: 0,
  address: 'Корневой узел дерева поручителей',
  apartment: '',
  system: true,
});

const normalizePhoneDigits = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  if (digits.length === 11 && digits.startsWith('80')) return `3${digits}`;
  return digits;
};

const isRootGuarantorReference = (value: string): boolean =>
  value === ROOT_GUARANTOR_UID ||
  value === LEGACY_ROOT_GUARANTOR_UID ||
  normalizePhoneDigits(value) === normalizePhoneDigits(ROOT_GUARANTOR_PHONE);

const normalizeParentUid = (value: unknown): string => {
  const parentUid = getString(value);
  return isRootGuarantorReference(parentUid) ? ROOT_GUARANTOR_UID : parentUid;
};

const safeKey = (value: string): string => value.replace(/[.#$\[\]\/]/g, '_');

const normalizeUserProfile = (uid: string, raw: unknown): UserProfile | null => {
  if (!isRecord(raw)) return null;
  return {
    uid,
    phone: getString(raw.phone || raw.phoneNumber || raw.mobile),
    name: getString(raw.name || raw.displayName || raw.fullName),
    registeredAt: getNumber(raw.registeredAt || raw.createdAt),
    address: getString(raw.address),
    apartment: getString(raw.apartment || raw.flat),
  };
};

const normalizeUserAccess = (uid: string, raw: unknown): UserAccessRecord | null => {
  if (!isRecord(raw)) return null;
  return {
    uid: getString(raw.uid) || uid,
    status: normalizeAccessStatus(raw.status),
    role: getString(raw.role),
    temp_expires_at: getNumber(raw.temp_expires_at),
    denied_count: getNumber(raw.denied_count),
    current_request_id: getString(raw.current_request_id),
    trusted: getFlexibleBoolean(raw.trusted) || raw.status === 'active' || raw.status === 'approved' || raw.status === 'whitelist_access',
  };
};

const normalizeTrustNode = (id: string, raw: unknown): TrustChainNode | null => {
  if (!isRecord(raw)) return null;
  const childUid = getString(raw.childUid || raw.uid || raw.userUid) || id;
  if (!childUid) return null;
  return {
    id,
    parentUid: normalizeParentUid(raw.parentUid || raw.sponsorUid),
    childUid,
    depth: getNumber(raw.depth || raw.depthToRoot),
    status: normalizeTrustStatus(raw.status),
    approvedAt: getNumber(raw.approvedAt || raw.updatedAt || raw.createdAt),
    inviteRequestId: getString(raw.inviteRequestId || raw.requestId),
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

export const searchUsers = async (queryText: string): Promise<SearchResultItem[]> => {
  const trimmed = queryText.trim();
  if (trimmed.length < 2) return [];

  const snapshot = await get(query(ref(database, USERS_PATH), limitToFirst(100)));
  const raw = snapshot.val() as Record<string, unknown> | null;
  if (!raw) return [];

  const lower = trimmed.toLowerCase();
  const cleanQuery = trimmed.replace(/[^0-9a-zA-Zа-яА-ЯіїєґІЇЄҐ]/g, '').toLowerCase();
  const scored: Array<SearchResultItem & { score: number }> = [];

  for (const [uid, value] of Object.entries(raw)) {
    const user = normalizeUserProfile(uid, value);
    if (!user) continue;

    const uidLower = uid.toLowerCase();
    const nameLower = user.name.toLowerCase();
    const phoneClean = user.phone.replace(/\D/g, '');
    let matchField: SearchResultItem['matchField'] | null = null;
    let score = 0;

    if (uidLower === lower) { matchField = 'uid'; score = 100; }
    else if (uidLower.startsWith(lower)) { matchField = 'uid'; score = 80; }
    else if (phoneClean.startsWith(cleanQuery)) { matchField = 'phone'; score = 75; }
    else if (phoneClean.includes(cleanQuery)) { matchField = 'phone'; score = 60; }
    else if (nameLower.startsWith(lower)) { matchField = 'name'; score = 55; }
    else if (nameLower.includes(lower)) { matchField = 'name'; score = 40; }

    if (matchField) scored.push({ ...user, matchField, score });
  }

  return scored.sort((left, right) => right.score - left.score).slice(0, 10);
};

export const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
  if (uid === ROOT_GUARANTOR_UID) return makeRootGuarantorUser();
  const snapshot = await get(ref(database, `${USERS_PATH}/${uid}`));
  return normalizeUserProfile(uid, snapshot.val());
};

export const loadUserAccess = async (uid: string): Promise<UserAccessRecord | null> => {
  const snapshot = await get(ref(database, `${ACCESS_PATH}/${uid}`));
  return normalizeUserAccess(uid, snapshot.val());
};

export const loadTrustNodeByChild = async (uid: string): Promise<TrustChainNode | null> => {
  if (uid === ROOT_GUARANTOR_UID) return null;

  const directSnapshot = await get(ref(database, `${TRUST_TREE_PATH}/${uid}`));
  const directNode = normalizeTrustNode(uid, directSnapshot.val());
  if (directNode?.childUid === uid) return directNode;

  const snapshot = await get(query(ref(database, TRUST_TREE_PATH), orderByChild('childUid'), equalTo(uid)));
  const raw = snapshot.val() as Record<string, unknown> | null;
  const nodes = Object.entries(raw ?? {})
    .map(([id, value]) => normalizeTrustNode(id, value))
    .filter((value): value is TrustChainNode => value !== null)
    .sort((left, right) => right.approvedAt - left.approvedAt);
  return nodes[0] ?? null;
};

export const loadTrustPath = async (selectedUid: string): Promise<TrustChainNode[]> => {
  const nodes: TrustChainNode[] = [];
  const visited = new Set<string>();
  let currentUid = selectedUid;

  for (let guard = 0; guard < MAX_CHAIN_DEPTH; guard += 1) {
    if (visited.has(currentUid)) throw new Error('Обнаружен цикл в trust_tree. Цепочка остановлена.');
    visited.add(currentUid);

    const node = await loadTrustNodeByChild(currentUid);
    if (!node) break;
    nodes.push(node);
    if (!node.parentUid) break;
    currentUid = node.parentUid;
  }

  return nodes.reverse();
};

export const loadChildrenNodes = async (uid: string): Promise<TrustChainNode[]> => {
  const parentRefs = uid === ROOT_GUARANTOR_UID
    ? [ROOT_GUARANTOR_UID, LEGACY_ROOT_GUARANTOR_UID, ROOT_GUARANTOR_PHONE, normalizePhoneDigits(ROOT_GUARANTOR_PHONE)]
    : [uid];
  const snapshots = await Promise.all(parentRefs.flatMap((parentUid) => [
    get(query(ref(database, TRUST_TREE_PATH), orderByChild('parentUid'), equalTo(parentUid))),
    get(query(ref(database, TRUST_TREE_PATH), orderByChild('sponsorUid'), equalTo(parentUid))),
  ]));
  const entries = snapshots.flatMap((snapshot) => Object.entries((snapshot.val() as Record<string, unknown> | null) ?? {}));
  return entries
    .map(([id, value]) => normalizeTrustNode(id, value))
    .filter((value): value is TrustChainNode => value !== null)
    .sort((left, right) => right.approvedAt - left.approvedAt)
    .slice(0, 50);
};

export const loadInviteRequest = async (uid: string): Promise<InviteRequestBrief | null> => {
  const snapshot = await get(query(ref(database, INVITE_REQUESTS_PATH), orderByChild('requesterUid'), equalTo(uid)));
  const raw = snapshot.val() as Record<string, unknown> | null;
  const approved = Object.entries(raw ?? {})
    .map(([id, value]) => normalizeInviteRequest(id, value))
    .filter((value): value is InviteRequestBrief => value !== null && value.status === 'approved')
    .sort((left, right) => right.createdAt - left.createdAt);
  return approved[0] ?? null;
};

export const loadMultipleUsers = async (uids: string[]): Promise<Map<string, UserProfile>> => {
  const map = new Map<string, UserProfile>();
  await Promise.all([...new Set(uids.filter(Boolean))].map(async (uid) => {
    if (uid === ROOT_GUARANTOR_UID) {
      map.set(uid, makeRootGuarantorUser());
      return;
    }
    const user = await loadUserProfile(uid);
    map.set(uid, user ?? makeDeletedUser(uid));
  }));
  return map;
};

export const buildChainEntries = (selectedUid: string, path: TrustChainNode[], userMap: Map<string, UserProfile>): ChainEntry[] => {
  if (!path.length) return [{ uid: selectedUid, user: userMap.get(selectedUid) ?? makeDeletedUser(selectedUid), node: null, level: 0 }];

  const rootUid = path[0].parentUid || path[0].childUid;
  const entries: ChainEntry[] = [{
    uid: rootUid,
    user: rootUid === ROOT_GUARANTOR_UID ? makeRootGuarantorUser() : (userMap.get(rootUid) ?? makeDeletedUser(rootUid)),
    node: null,
    level: 0,
  }];
  for (const node of path) {
    const uid = node.childUid;
    if (entries.some((entry) => entry.uid === uid)) continue;
    entries.push({
      uid,
      user: userMap.get(uid) ?? makeDeletedUser(uid),
      node,
      level: entries.length,
      orphaned: Boolean(node.parentUid && userMap.get(node.parentUid)?.deleted),
    });
  }
  return entries;
};

export const loadUsersTotal = async (): Promise<number> => {
  const snapshot = await get(query(ref(database, USERS_PATH), limitToFirst(1000)));
  const raw = snapshot.val() as Record<string, unknown> | null;
  return Object.keys(raw ?? {}).length;
};

export const logAudit = (action: string, details: Record<string, unknown>): void => {
  console.info('[Audit:GuarantorTree]', action, details);
};

export const findUsersByPhones = async (phones: string[]): Promise<Map<string, UserProfile>> => {
  const targets = new Set(phones.map(normalizePhoneDigits).filter(Boolean));
  const snapshot = await get(ref(database, USERS_PATH));
  const raw = snapshot.val() as Record<string, unknown> | null;
  const map = new Map<string, UserProfile>();

  for (const [uid, value] of Object.entries(raw ?? {})) {
    const user = normalizeUserProfile(uid, value);
    if (!user) continue;
    const normalized = normalizePhoneDigits(user.phone);
    if (targets.has(normalized)) map.set(normalized, user);
  }

  return map;
};

export const grantRootAccessByPhones = async (phones: string[], adminUid: string): Promise<ManualRootGrantResult[]> => {
  const normalizedPhones = [...new Set(phones.map((phone) => phone.trim()).filter(Boolean))];
  if (!normalizedPhones.length) return [];

  const callable = httpsCallable<
    { phones: string[]; adminUid?: string },
    { ok: boolean; results: ManualRootGrantResult[] }
  >(functions, 'adminGrantRootAccessByPhones');
  const response = await callable({ phones: normalizedPhones, adminUid });
  const results = response.data.results;
  results
    .filter((result) => result.status === 'granted')
    .forEach((result) => logAudit('manual_root_grant', { adminUid, targetUid: result.uid, phone: maskPhone(result.phone) }));
  return results;
};