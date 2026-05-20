import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth } from '../firebase-auth-session';

export interface JobListing {
  id: string;
  listingKind?: 'resume' | 'vacancy';
  name: string;
  phone: string;
  age: string;
  workType: string;
  about: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt: string;
  userId: string;
  moderationReason?: string;
  rejectionReason?: string;
}

const PATH = 'job_listings';

export const jobService = {
  subscribe(callback: (items: JobListing[]) => void): () => void {
    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'));

    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const now = Date.now();
      const items: JobListing[] = Object.entries(raw as Record<string, any>)
        .map(([id, data]) => ({
          id,
          listingKind: (data.listingKind === 'vacancy' ? 'vacancy' : 'resume') as JobListing['listingKind'],
          name: data.name || '',
          phone: data.phone || '',
          age: data.age || '',
          workType: data.workType || '',
          about: data.about || '',
          moderationStatus: data.moderationStatus || 'pending',
          submittedForModerationAt: data.submittedForModerationAt || '',
          createdAt: data.createdAt || '',
          expiresAt: data.expiresAt || '',
          userId: data.userId || '',
          moderationReason: data.moderationReason || data.reason || '',
          rejectionReason: data.rejectionReason || data.reason || '',
        }))
        .filter((item) => {
          const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
          return item.moderationStatus === 'approved' && !expired;
        })
        .reverse();
      callback(items);
    });

    return unsubscribe;
  },

  async add(item: Omit<JobListing, 'id'>): Promise<string> {
    const listRef = ref(database, PATH);
    const user = await ensureFirebaseAuth();
    const pendingModeration = createPendingModeration();
    const sanitized = {
      ...item,
      listingKind: item.listingKind === 'vacancy' ? 'vacancy' : 'resume',
      name: sanitizeStoredText(item.name),
      phone: sanitizeStoredText(item.phone),
      about: sanitizeStoredText(item.about),
      userId: user.uid,
      moderationStatus: pendingModeration.moderationStatus,
      submittedForModerationAt: pendingModeration.submittedForModerationAt,
    };
    try {
      const newRef = await push(listRef, sanitized);
      return newRef.key!;
    } catch (error) {
      console.error('[jobService.add] submit failed', {
        path: PATH,
        uid: user.uid,
        moderationStatus: sanitized.moderationStatus,
        hasName: sanitized.name.length >= 2,
        hasPhone: sanitized.phone.length > 0,
        age: sanitized.age,
        workType: sanitized.workType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    const user = await ensureFirebaseAuth();
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? snapshot.val() as Partial<JobListing> : null;
    if (!existing || existing.userId !== user.uid) {
      throw new Error('permission-denied');
    }
    await remove(ref(database, `${PATH}/${id}`));
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? ({ ...(snapshot.val() as Omit<JobListing, 'id'>), id }) : null;
    await update(ref(database, `${PATH}/${id}`), {
      moderationStatus: status,
      moderatedAt: new Date().toISOString(),
      moderationReason: status === 'rejected' ? 'default_rejected' : null,
      rejectionReason: status === 'rejected' ? 'default_rejected' : null,
    });
    if (status === 'approved' && existing) {
      await publishApprovedActivity({
        userId: existing.userId,
        name: existing.name,
        phone: existing.phone,
        category: 'job_search',
        group: 'jobs',
        subcategory: existing.workType,
        text: `[Ищу работу] ${existing.name}: ${existing.workType}. ${existing.about || ''}`,
      });
    }
  },
};
