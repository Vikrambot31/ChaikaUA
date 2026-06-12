// =============================================================
//  Reports Moderation Service — управление жалобами пользователей
// =============================================================

import { get, ref, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
import { addToYellowList } from './yellowListService';

export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'action_taken';

export type ReportRecord = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedListingId: string;
  reason: ReportReason;
  description: string;
  source: string;
  createdAt: string;
  status: ReportStatus;
  /** Filled after admin action */
  actionType?: 'dismissed' | 'listing_deleted' | 'user_banned';
  actionAt?: string;
  actionBy?: string;
};

export type BlockStatsEntry = {
  userId: string;
  blockCount: number;
  blockedBy: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');

const normalizeReason = (v: unknown): ReportReason => {
  if (v === 'spam' || v === 'inappropriate' || v === 'fake' || v === 'other') return v;
  return 'other';
};

const normalizeStatus = (v: unknown): ReportStatus => {
  if (v === 'reviewed' || v === 'action_taken') return v;
  return 'pending';
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const normalizeReport = (key: string, raw: unknown): ReportRecord | null => {
  if (!isRecord(raw)) return null;
  return {
    id: key,
    reporterId: getString(raw.reporterId),
    reportedUserId: getString(raw.reportedUserId),
    reportedListingId: getString(raw.reportedListingId),
    reason: normalizeReason(raw.reason),
    description: getString(raw.description),
    source: getString(raw.source),
    createdAt: getString(raw.createdAt),
    status: normalizeStatus(raw.status),
    actionType: raw.actionType as ReportRecord['actionType'],
    actionAt: getString(raw.actionAt) || undefined,
    actionBy: getString(raw.actionBy) || undefined,
  };
};

// ─── Reports CRUD ───────────────────────────────────────────────────────────

export const loadReports = async (statusFilter?: ReportStatus): Promise<ReportRecord[]> => {
  if (LOCAL_MODE) return [];

  let snap;
  if (statusFilter) {
    snap = await get(query(ref(database, 'reports'), orderByChild('status'), equalTo(statusFilter)));
  } else {
    snap = await get(ref(database, 'reports'));
  }
  if (!snap.exists()) return [];

  return Object.entries(snap.val() as Record<string, unknown>)
    .map(([key, val]) => normalizeReport(key, val))
    .filter((x): x is ReportRecord => x !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
};

export const countPendingReports = async (): Promise<number> => {
  if (LOCAL_MODE) return 0;
  try {
    const snap = await get(query(ref(database, 'reports'), orderByChild('status'), equalTo('pending')));
    if (!snap.exists()) return 0;
    return Object.keys(snap.val() as Record<string, unknown>).length;
  } catch {
    return 0;
  }
};

export const dismissReport = async (reportId: string, adminUid: string): Promise<void> => {
  if (LOCAL_MODE) return;
  await update(ref(database, `reports/${reportId}`), {
    status: 'reviewed',
    actionType: 'dismissed',
    actionAt: new Date().toISOString(),
    actionBy: adminUid,
  });
};

export const deleteReportedListing = async (
  reportId: string,
  listingId: string,
  adminUid: string,
): Promise<void> => {
  if (LOCAL_MODE) return;
  await remove(ref(database, `contacts_listings/${listingId}`));
  await update(ref(database, `reports/${reportId}`), {
    status: 'action_taken',
    actionType: 'listing_deleted',
    actionAt: new Date().toISOString(),
    actionBy: adminUid,
  });
};

export const banReportedUser = async (
  reportId: string,
  targetUserId: string,
  adminUid: string,
  displayName: string,
): Promise<void> => {
  if (LOCAL_MODE) return;

  await addToYellowList({
    uid: targetUserId,
    displayName,
    reason: `Banned via report ${reportId}`,
    bannedBy: adminUid,
    itemPath: `reports/${reportId}`,
    section: 'kontakt-xxx',
  });

  // Delete all contact listings by this user
  const snap = await get(query(
    ref(database, 'contacts_listings'),
    orderByChild('userId'),
    equalTo(targetUserId),
  ));
  if (snap.exists()) {
    const updates: Record<string, null> = {};
    for (const key of Object.keys(snap.val() as Record<string, unknown>)) {
      updates[`contacts_listings/${key}`] = null;
    }
    await update(ref(database), updates);
  }

  await update(ref(database, `reports/${reportId}`), {
    status: 'action_taken',
    actionType: 'user_banned',
    actionAt: new Date().toISOString(),
    actionBy: adminUid,
  });
};

// ─── Block Statistics ───────────────────────────────────────────────────────

export const loadBlockStats = async (): Promise<BlockStatsEntry[]> => {
  if (LOCAL_MODE) return [];

  const snap = await get(ref(database, 'user_block_list'));
  if (!snap.exists()) return [];

  // user_block_list/{blockerId}/{blockedUserId} = true
  // We need to invert: for each blockedUserId, count how many blockers
  const blockedBy = new Map<string, string[]>();
  const data = snap.val() as Record<string, Record<string, boolean>>;

  for (const [blockerId, targets] of Object.entries(data)) {
    if (!isRecord(targets)) continue;
    for (const blockedId of Object.keys(targets)) {
      const arr = blockedBy.get(blockedId) || [];
      arr.push(blockerId);
      blockedBy.set(blockedId, arr);
    }
  }

  return Array.from(blockedBy.entries())
    .map(([userId, blockers]) => ({
      userId,
      blockCount: blockers.length,
      blockedBy: blockers,
    }))
    .filter((e) => e.blockCount >= 3)
    .sort((a, b) => b.blockCount - a.blockCount);
};
