import { ref, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth, requireWriteSession } from '../firebase-auth-session';

export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'other';

export interface ReportParams {
  reportedUserId: string;
  reportedListingId: string;
  reason: ReportReason;
  description?: string;
  source: string;
}

export interface ContentReportParams {
  contentId: string;
  contentType: string;
  contentTitle?: string;
  reportedUserId?: string;
  reason: ReportReason;
  description: string;
}

export const reportBlockService = {
  async writeReport(params: ReportParams): Promise<string> {
    const user = await requireWriteSession({
      operation: 'report',
      screen: 'Kontakt-XXX',
    });
    const reportRef = push(ref(database, 'reports'), {
      reporterId: user.uid,
      reportedUserId: params.reportedUserId,
      reportedListingId: params.reportedListingId,
      reason: params.reason,
      description: params.description || '',
      source: params.source,
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
    return reportRef.key!;
  },

  async setBlock(blockedUserId: string): Promise<void> {
    const user = await requireWriteSession({
      operation: 'block',
      screen: 'Kontakt-XXX',
    });
    await set(ref(database, `user_block_list/${user.uid}/${blockedUserId}`), true);
  },

  async removeBlock(blockedUserId: string): Promise<void> {
    const user = await requireWriteSession({
      operation: 'unblock',
      screen: 'Kontakt-XXX',
    });
    await remove(ref(database, `user_block_list/${user.uid}/${blockedUserId}`));
  },

  async writeContentReport(params: ContentReportParams): Promise<void> {
    const user = await requireWriteSession({
      operation: 'content_report',
      screen: params.contentType,
    });
    await push(ref(database, 'reports'), {
      reporterId: user.uid,
      reportedUserId: params.reportedUserId || '',
      reportedListingId: params.contentId,
      reason: params.reason,
      description: params.description,
      source: params.contentType,
      contentTitle: params.contentTitle || '',
      contentType: params.contentType,
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
  },

  async loadBlockedUsers(userId: string): Promise<Set<string>> {
    await ensureFirebaseAuth();
    const snap = await get(ref(database, `user_block_list/${userId}`));
    const data = snap.val();
    return new Set(data ? Object.keys(data) : []);
  },
};
