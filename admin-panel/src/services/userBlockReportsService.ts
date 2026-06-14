import { get, ref, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export type BlockReport = {
  id: string;
  reporterId: string;
  blockedUserId: string;
  reason: string;
  createdAt: string;
  status: string;
  reporterName?: string;
  blockedUserName?: string;
};

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');

export const loadBlockReports = async (): Promise<BlockReport[]> => {
  if (LOCAL_MODE) return [];

  const snap = await get(query(
    ref(database, 'reports'),
    orderByChild('source'),
    equalTo('profile_block'),
  ));
  if (!snap.exists()) return [];

  const raw = snap.val() as Record<string, Record<string, unknown>>;
  const reports: BlockReport[] = [];

  for (const [key, val] of Object.entries(raw)) {
    reports.push({
      id: key,
      reporterId: getString(val.reporterId),
      blockedUserId: getString(val.reportedUserId),
      reason: getString(val.description),
      createdAt: getString(val.createdAt),
      status: getString(val.status) || 'pending',
    });
  }

  reports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reports;
};

export const fetchUserDisplayName = async (uid: string): Promise<string> => {
  try {
    const snap = await get(ref(database, `users/${uid}/name`));
    if (snap.exists() && typeof snap.val() === 'string') return snap.val() as string;
  } catch { /* fallback */ }
  return uid;
};

export const countPendingBlockReports = async (): Promise<number> => {
  if (LOCAL_MODE) return 0;
  try {
    const snap = await get(query(
      ref(database, 'reports'),
      orderByChild('source'),
      equalTo('profile_block'),
    ));
    if (!snap.exists()) return 0;
    const data = snap.val() as Record<string, Record<string, unknown>>;
    let pending = 0;
    for (const val of Object.values(data)) {
      if ((getString(val.status) || 'pending') === 'pending') pending++;
    }
    return pending;
  } catch {
    return 0;
  }
};
