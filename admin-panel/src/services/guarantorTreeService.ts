import { equalTo, get, limitToFirst, orderByChild, query, ref, remove, set } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE, localGet } from '../local/LOCAL_MODE';
import type {
  ChainEntry,
  FullTreeNode,
  FullTreeStats,
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
const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

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

const matchRootGuarantor = (queryText: string): SearchResultItem | null => {
  const lower = queryText.trim().toLowerCase();
  const cleanQ = queryText.replace(/\D/g, '');
  const rootUser = makeRootGuarantorUser();
  const rootPhoneClean = ROOT_GUARANTOR_PHONE.replace(/\D/g, '');
  if (ROOT_GUARANTOR_UID.toLowerCase().startsWith(lower)) return { ...rootUser, matchField: 'uid' };
  if (rootPhoneClean.includes(cleanQ) && cleanQ.length >= 3) return { ...rootUser, matchField: 'phone' };
  if (rootUser.name.toLowerCase().includes(lower)) return { ...rootUser, matchField: 'name' };
  return null;
};

export const searchUsers = async (queryText: string): Promise<SearchResultItem[]> => {
  const trimmed = queryText.trim();
  if (trimmed.length < 2) return [];

  // LOCAL_MODE: search users list from local json-server
  if (LOCAL_MODE) {
    const users = await localGet<Array<Record<string, unknown>>>('/users');
    if (!Array.isArray(users)) return [];
    const lower = trimmed.toLowerCase();
    const cleanQuery = trimmed.replace(/[^0-9a-zA-Zа-яА-ЯіїєґІЇЄҐ]/g, '').toLowerCase();
    const scored: Array<SearchResultItem & { score: number }> = [];
    for (const value of users) {
      const uid = String(value.id || '');
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
    const rootMatch = matchRootGuarantor(trimmed);
    if (rootMatch) scored.push({ ...rootMatch, score: 90 });
    return scored.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  const snapshot = await get(query(ref(database, USERS_PATH), limitToFirst(500)));
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

  const rootMatch = matchRootGuarantor(trimmed);
  if (rootMatch && !scored.some((s) => s.uid === ROOT_GUARANTOR_UID)) scored.push({ ...rootMatch, score: 90 });
  return scored.sort((left, right) => right.score - left.score).slice(0, 10);
};

export const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
  if (uid === ROOT_GUARANTOR_UID) return makeRootGuarantorUser();

  // LOCAL_MODE: fetch user by id from local json-server
  if (LOCAL_MODE) {
    try {
      const user = await localGet<Record<string, unknown>>(`/users/${uid}`);
      return normalizeUserProfile(uid, user);
    } catch {
      return null;
    }
  }

  const snapshot = await get(ref(database, `${USERS_PATH}/${uid}`));
  return normalizeUserProfile(uid, snapshot.val());
};

export const loadUserAccess = async (uid: string): Promise<UserAccessRecord | null> => {
  // LOCAL_MODE: fetch user_access entry by uid from local json-server
  if (LOCAL_MODE) {
    try {
      const record = await localGet<Record<string, unknown>>(`/user_access/${uid}`);
      return normalizeUserAccess(uid, record);
    } catch {
      return null;
    }
  }

  const snapshot = await get(ref(database, `${ACCESS_PATH}/${uid}`));
  return normalizeUserAccess(uid, snapshot.val());
};

export const loadTrustNodeByChild = async (uid: string): Promise<TrustChainNode | null> => {
  if (uid === ROOT_GUARANTOR_UID) return null;

  // LOCAL_MODE: fetch trust_tree node by childUid from local json-server
  if (LOCAL_MODE) {
    try {
      const nodes = await localGet<Array<Record<string, unknown>>>('/trust_tree');
      if (!Array.isArray(nodes)) return null;
      const node = nodes.find((n) => n.childUid === uid || n.uid === uid || n.userUid === uid);
      if (!node) return null;
      const id = String(node.id || uid);
      return normalizeTrustNode(id, node);
    } catch {
      return null;
    }
  }

  const directSnapshot = await get(ref(database, `${TRUST_TREE_PATH}/${uid}`));
  const directNode = normalizeTrustNode(uid, directSnapshot.val());
  if (directNode?.childUid === uid) return directNode;

  const snapshot = await get(query(ref(database, TRUST_TREE_PATH), orderByChild('userUid'), equalTo(uid)));
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
  // LOCAL_MODE: fetch trust_tree nodes by parentUid/sponsorUid from local json-server
  if (LOCAL_MODE) {
    try {
      const nodes = await localGet<Array<Record<string, unknown>>>('/trust_tree');
      if (!Array.isArray(nodes)) return [];
      const sponsorUids = uid === ROOT_GUARANTOR_UID
        ? [ROOT_GUARANTOR_UID, LEGACY_ROOT_GUARANTOR_UID, ROOT_GUARANTOR_PHONE, normalizePhoneDigits(ROOT_GUARANTOR_PHONE)]
        : [uid];
      return nodes
        .filter((n) => sponsorUids.includes(String(n.parentUid || n.sponsorUid || '')))
        .map((n) => normalizeTrustNode(String(n.id || ''), n))
        .filter((n): n is TrustChainNode => n !== null)
        .sort((a, b) => b.approvedAt - a.approvedAt)
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  const sponsorRefs = uid === ROOT_GUARANTOR_UID
    ? [ROOT_GUARANTOR_UID, LEGACY_ROOT_GUARANTOR_UID, ROOT_GUARANTOR_PHONE, normalizePhoneDigits(ROOT_GUARANTOR_PHONE)]
    : [uid];
  const snapshots = await Promise.all(sponsorRefs.map((sponsorUid) =>
    get(query(ref(database, TRUST_TREE_PATH), orderByChild('sponsorUid'), equalTo(sponsorUid))),
  ));
  const entries = snapshots.flatMap((snapshot) => Object.entries((snapshot.val() as Record<string, unknown> | null) ?? {}));
  return entries
    .map(([id, value]) => normalizeTrustNode(id, value))
    .filter((value): value is TrustChainNode => value !== null)
    .sort((left, right) => right.approvedAt - left.approvedAt)
    .slice(0, 50);
};

export const loadInviteRequest = async (uid: string): Promise<InviteRequestBrief | null> => {
  // LOCAL_MODE: find invite_request by requesterUid from local json-server
  if (LOCAL_MODE) {
    try {
      const requests = await localGet<Array<Record<string, unknown>>>('/invite_requests');
      if (!Array.isArray(requests)) return null;
      const approved = requests
        .filter((r) => r.requesterUid === uid && r.status === 'approved')
        .map((r) => normalizeInviteRequest(String(r.id || ''), r))
        .filter((r): r is InviteRequestBrief => r !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      return approved[0] ?? null;
    } catch {
      return null;
    }
  }

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
  // LOCAL_MODE: count users from local json-server
  if (LOCAL_MODE) {
    try {
      const users = await localGet<unknown[]>('/users');
      return Array.isArray(users) ? users.length : 0;
    } catch {
      return 0;
    }
  }

  const snapshot = await get(query(ref(database, USERS_PATH), limitToFirst(10000)));
  const raw = snapshot.val() as Record<string, unknown> | null;
  return Object.keys(raw ?? {}).length;
};

export const logAudit = (action: string, details: Record<string, unknown>): void => {
  console.info('[Audit:GuarantorTree]', action, details);
};

export const findUsersByPhones = async (phones: string[]): Promise<Map<string, UserProfile>> => {
  const targets = new Set(phones.map(normalizePhoneDigits).filter(Boolean));

  // LOCAL_MODE: search users by phone in local json-server
  if (LOCAL_MODE) {
    const map = new Map<string, UserProfile>();
    try {
      const users = await localGet<Array<Record<string, unknown>>>('/users');
      if (Array.isArray(users)) {
        for (const value of users) {
          const uid = String(value.id || '');
          const user = normalizeUserProfile(uid, value);
          if (!user) continue;
          const normalized = normalizePhoneDigits(user.phone);
          if (targets.has(normalized)) map.set(normalized, user);
        }
      }
    } catch { /* empty */ }
    return map;
  }

  const map = new Map<string, UserProfile>();

  // Query each phone individually — avoids downloading all users
  const snapshots = await Promise.all(
    [...targets].flatMap((normalized) => [
      get(query(ref(database, USERS_PATH), orderByChild('phone'), equalTo(`+${normalized}`))),
      get(query(ref(database, USERS_PATH), orderByChild('phone'), equalTo(normalized))),
    ])
  );

  for (const snap of snapshots) {
    const raw = snap.val() as Record<string, unknown> | null;
    for (const [uid, value] of Object.entries(raw ?? {})) {
      const user = normalizeUserProfile(uid, value);
      if (!user) continue;
      const norm = normalizePhoneDigits(user.phone);
      if (targets.has(norm)) map.set(norm, user);
    }
  }

  return map;
};

export const grantRootAccessByPhones = async (phones: string[], adminUid: string): Promise<ManualRootGrantResult[]> => {
  const normalizedPhones = [...new Set(phones.map((phone) => phone.trim()).filter(Boolean))];
  if (!normalizedPhones.length) return [];

  // LOCAL_MODE: stub — return ok for each phone
  if (LOCAL_MODE) {
    logAudit('manual_root_grant_local_stub', { adminUid, phones: normalizedPhones.map(maskPhone) });
    return normalizedPhones.map((phone) => ({ status: 'granted', phone, uid: '' } as ManualRootGrantResult));
  }

  const callable = httpsCallable<
    { phones: string[]; adminUid?: string },
    { ok: boolean; results: ManualRootGrantResult[] }
  >(functions!, 'adminGrantRootAccessByPhones');
  const response = await callable({ phones: normalizedPhones, adminUid });
  const results = response.data.results;
  results
    .filter((result) => result.status === 'granted')
    .forEach((result) => logAudit('manual_root_grant', { adminUid, targetUid: result.uid, phone: maskPhone(result.phone) }));
  return results;
};

export const loadFullTree = async (): Promise<{ root: FullTreeNode; orphans: FullTreeNode[]; unlinked: FullTreeNode[]; stats: FullTreeStats }> => {
  let allNodes: TrustChainNode[] = [];
  let allUsers: Map<string, UserProfile> = new Map();
  let allAccess: Map<string, UserAccessRecord> = new Map();

  if (LOCAL_MODE) {
    const nodesRaw = await localGet<Array<Record<string, unknown>>>('/trust_tree');
    if (Array.isArray(nodesRaw)) {
      allNodes = nodesRaw
        .map((n) => normalizeTrustNode(String(n.id || ''), n))
        .filter((n): n is TrustChainNode => n !== null);
    }
    const usersRaw = await localGet<Array<Record<string, unknown>>>('/users');
    if (Array.isArray(usersRaw)) {
      for (const u of usersRaw) {
        const uid = String(u.id || '');
        const profile = normalizeUserProfile(uid, u);
        if (profile) allUsers.set(uid, profile);
      }
    }
    const accessRaw = await localGet<Array<Record<string, unknown>>>('/user_access');
    if (Array.isArray(accessRaw)) {
      for (const a of accessRaw) {
        const uid = String(a.id || a.uid || '');
        const record = normalizeUserAccess(uid, a);
        if (record) allAccess.set(uid, record);
      }
    }
  } else {
    // Load trust_tree first, then only the users referenced in it
    const nodesSnap = await get(ref(database, TRUST_TREE_PATH));

    const nodesRaw = nodesSnap.val() as Record<string, unknown> | null;
    for (const [id, value] of Object.entries(nodesRaw ?? {})) {
      const node = normalizeTrustNode(id, value);
      if (node) allNodes.push(node);
    }

    // Collect unique UIDs from tree nodes — avoids loading all users
    const uidsNeeded = new Set<string>();
    for (const node of allNodes) {
      uidsNeeded.add(node.childUid);
      if (node.parentUid) uidsNeeded.add(node.parentUid);
    }

    const BATCH = 50;
    const uids = [...uidsNeeded];
    for (let i = 0; i < uids.length; i += BATCH) {
      const batchSnaps = await Promise.all(
        uids.slice(i, i + BATCH).map((uid) =>
          get(ref(database, `${USERS_PATH}/${uid}`)).then((snap) => ({ uid, snap }))
        )
      );
      for (const { uid, snap } of batchSnaps) {
        const profile = normalizeUserProfile(uid, snap.val() as Record<string, unknown>);
        if (profile) allUsers.set(uid, profile);
      }
    }

    // user_access — try bulk read first, fallback to skipping (path may not be in Firebase rules)
    try {
      const accessSnap = await get(ref(database, ACCESS_PATH));
      const accessRaw = accessSnap.val() as Record<string, unknown> | null;
      for (const [uid, value] of Object.entries(accessRaw ?? {})) {
        const record = normalizeUserAccess(uid, value);
        if (record) allAccess.set(uid, record);
      }
    } catch {
      // user_access not readable — tree will render without status badges
      console.warn('[GuarantorTree] user_access not accessible, building tree without status data');
    }
  }

  // Build parentUid -> children map
  const childrenMap = new Map<string, TrustChainNode[]>();
  const nodeByChild = new Map<string, TrustChainNode>();
  for (const node of allNodes) {
    nodeByChild.set(node.childUid, node);
    const parentKey = node.parentUid || '__no_parent__';
    const list = childrenMap.get(parentKey) || [];
    list.push(node);
    childrenMap.set(parentKey, list);
  }

  // Recursively build tree
  const visited = new Set<string>();
  let maxDepth = 0;

  const buildNode = (uid: string, depth: number): FullTreeNode => {
    visited.add(uid);
    if (depth > maxDepth) maxDepth = depth;
    const user = uid === ROOT_GUARANTOR_UID ? makeRootGuarantorUser() : (allUsers.get(uid) ?? makeDeletedUser(uid));
    const node = nodeByChild.get(uid) ?? null;
    const access = allAccess.get(uid) ?? null;
    const childNodes = childrenMap.get(uid) ?? [];
    const children: FullTreeNode[] = [];

    if (depth < MAX_CHAIN_DEPTH) {
      for (const childNode of childNodes) {
        if (!visited.has(childNode.childUid)) {
          children.push(buildNode(childNode.childUid, depth + 1));
        }
      }
    }

    children.sort((a, b) => (a.user.name || '').localeCompare(b.user.name || '', 'uk'));

    return { uid, user, node, access, children, depth };
  };

  const root = buildNode(ROOT_GUARANTOR_UID, 0);

  // Users WITHOUT trust_tree entry → separate "unlinked" list (не в дерево)
  const unlinked: FullTreeNode[] = [];
  for (const [uid, user] of allUsers) {
    if (uid === ROOT_GUARANTOR_UID || visited.has(uid)) continue;
    visited.add(uid);
    const access = allAccess.get(uid) ?? null;
    unlinked.push({ uid, user, node: null, access, children: [], depth: -1 });
  }
  unlinked.sort((a, b) => (a.user.name || '').localeCompare(b.user.name || '', 'uk'));

  // Collect orphans: trust_tree nodes whose childUid wasn't visited (broken links)
  const orphans: FullTreeNode[] = [];
  for (const node of allNodes) {
    if (!visited.has(node.childUid)) {
      visited.add(node.childUid);
      const user = allUsers.get(node.childUid) ?? makeDeletedUser(node.childUid);
      const access = allAccess.get(node.childUid) ?? null;
      orphans.push({ uid: node.childUid, user, node, access, children: [], depth: -1 });
    }
  }

  // Stats
  let active = 0;
  let blocked = 0;
  const countStats = (treeNode: FullTreeNode) => {
    const status = treeNode.access?.status;
    if (status === 'active' || status === 'approved' || status === 'whitelist_access' || status === 'temporary_access') active++;
    else if (status === 'blocked' || status === 'denied') blocked++;
    for (const child of treeNode.children) countStats(child);
  };
  countStats(root);

  const countNodes = (treeNode: FullTreeNode): number => 1 + treeNode.children.reduce((sum, c) => sum + countNodes(c), 0);
  const total = countNodes(root) - 1 + orphans.length + unlinked.length;

  const stats: FullTreeStats = {
    total,
    active,
    blocked,
    orphaned: orphans.length,
    unlinked: unlinked.length,
    maxDepth,
  };

  return { root, orphans, unlinked, stats };
};

export const attachToParent = async (childUid: string, parentUid: string, adminUid: string): Promise<void> => {
  logAudit('attach_to_parent', { adminUid, childUid, parentUid });
  if (LOCAL_MODE) return;

  // Calculate depth: load parent's node to get their depth
  let parentDepth = 0;
  if (parentUid !== ROOT_GUARANTOR_UID) {
    const parentSnap = await get(ref(database, `${TRUST_TREE_PATH}/${parentUid}`));
    const parentData = parentSnap.val() as Record<string, unknown> | null;
    if (parentData) parentDepth = getNumber(parentData.depth || parentData.depthToRoot);
  }

  await set(ref(database, `${TRUST_TREE_PATH}/${childUid}`), {
    childUid,
    parentUid,
    sponsorUid: parentUid,
    depth: parentDepth + 1,
    depthToRoot: parentDepth + 1,
    status: 'active',
    approvedAt: Date.now(),
    approvedBy: adminUid,
    createdAt: Date.now(),
  });
};

export const reparentNode = async (childUid: string, newParentUid: string, adminUid: string): Promise<void> => {
  logAudit('reparent_node', { adminUid, childUid, newParentUid });
  if (LOCAL_MODE) return;

  // Same as attach — write/overwrite the trust_tree entry
  await attachToParent(childUid, newParentUid, adminUid);
};

export const deleteNode = async (uid: string, _strategy: 'promote' | 'orphan', adminUid: string): Promise<void> => {
  logAudit('delete_node', { adminUid, uid, strategy: _strategy });
  if (LOCAL_MODE) return;
  // Remove trust_tree entry
  await remove(ref(database, `${TRUST_TREE_PATH}/${uid}`));
};

export const deleteUserRecord = async (uid: string, adminUid: string): Promise<void> => {
  logAudit('delete_user_record', { adminUid, targetUid: uid });
  if (LOCAL_MODE) return;
  // Remove from users, trust_tree, user_access — throw if user record removal fails
  const results = await Promise.allSettled([
    remove(ref(database, `${USERS_PATH}/${uid}`)),
    remove(ref(database, `${TRUST_TREE_PATH}/${uid}`)),
    remove(ref(database, `${ACCESS_PATH}/${uid}`)),
  ]);
  const userResult = results[0];
  if (userResult.status === 'rejected') {
    throw new Error(`Не удалось удалить пользователя: ${userResult.reason instanceof Error ? userResult.reason.message : 'Ошибка доступа'}`);
  }
};