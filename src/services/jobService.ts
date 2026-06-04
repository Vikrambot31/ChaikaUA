import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth, requireWriteSession } from '../firebase-auth-session';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

export interface JobListing {
  id: string;
  listingKind?: 'resume' | 'vacancy';
  name: string;
  phone: string;
  age: string;
  workType: string;
  about: string;
  photoUri?: string;
  photoStoragePath?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt: string;
  userId: string;
  moderationReason?: string;
  rejectionReason?: string;
  isArchived?: boolean;
  language?: AppLang;
}

const PATH = 'job_listings';
const ACTIVE_LIMIT = 150;
const ACTIVE_LIMIT_BUFFER = 30;
const FEED_MINIMUM = 10;
const ARCHIVED_FALLBACK_LIMIT = 20;

const mapJobItem = (id: string, data: any, isArchived?: boolean): JobListing => ({
  id,
  listingKind: (data.listingKind === 'vacancy' ? 'vacancy' : 'resume') as JobListing['listingKind'],
  name: data.name || '',
  phone: data.phone || '',
  age: data.age || '',
  workType: data.workType || '',
  about: data.about || '',
  photoUri: data.photoUri || data.photoStoragePath || '',
  photoStoragePath: data.photoStoragePath || data.photoUri || '',
  moderationStatus: isArchived ? 'approved' : (data.moderationStatus || 'pending'),
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  expiresAt: data.expiresAt || '',
  userId: data.userId || '',
  moderationReason: isArchived ? '' : (data.moderationReason || data.reason || ''),
  rejectionReason: isArchived ? '' : (data.rejectionReason || data.reason || ''),
  isArchived,
});

export const jobService = {
  subscribe(callback: (items: JobListing[]) => void, currentUserId?: string): () => void {
    let disposed = false;
    let approvedItems: JobListing[] = [];
    let ownPendingItems: JobListing[] = [];
    let unsubscribeApproved: (() => void) | undefined;
    let unsubscribeOwn: (() => void) | undefined;

    const emit = (active: JobListing[]) => {
      const ids = new Set(active.map((i) => i.id));
      const extras = ownPendingItems.filter((i) => !ids.has(i.id));
      callback([...extras, ...active]);
    };

    void ensureFirebaseAuth().then(() => {
      if (disposed) return;

      const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(ACTIVE_LIMIT + ACTIVE_LIMIT_BUFFER));

      unsubscribeApproved = onValue(listRef, (snapshot) => {
        if (disposed) return;
        const raw = snapshot.val();
        const now = Date.now();
        const active: JobListing[] = raw
          ? Object.entries(raw as Record<string, any>)
              .map(([id, data]) => mapJobItem(id, data))
              .filter((item) => {
                const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
                return item.moderationStatus === 'approved' && !expired;
              })
              .reverse()
              .slice(0, ACTIVE_LIMIT)
          : [];
        approvedItems = active;

        if (active.length >= FEED_MINIMUM) {
          emit(active);
          return;
        }

        void get(query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
          if (disposed) return;
          const expiredRaw = expiredSnapshot.val();
          const archived: JobListing[] = expiredRaw
            ? Object.entries(expiredRaw as Record<string, any>)
                .map(([id, data]) => mapJobItem(id, data, true))
                .reverse()
            : [];
          emit([...active, ...archived]);
        }).catch(() => {
          if (!disposed) emit(active);
        });
      }, () => {
        if (!disposed) callback([]);
      });

      if (currentUserId) {
        const ownRef = query(ref(database, PATH), orderByChild('userId'), equalTo(currentUserId));
        unsubscribeOwn = onValue(ownRef, (snapshot) => {
          if (disposed) return;
          const raw = snapshot.val();
          ownPendingItems = raw
            ? Object.entries(raw as Record<string, any>)
                .map(([id, data]) => mapJobItem(id, data))
                .filter((item) => item.moderationStatus !== 'approved')
            : [];
          const ids = new Set(approvedItems.map((i) => i.id));
          const extras = ownPendingItems.filter((i) => !ids.has(i.id));
          callback([...extras, ...approvedItems]);
        }, () => { ownPendingItems = []; });
      }
    }).catch(() => {
      if (!disposed) callback([]);
    });

    return () => {
      disposed = true;
      unsubscribeApproved?.();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<JobListing, 'id'>): Promise<string> {
    const listRef = ref(database, PATH);
    const user = await requireWriteSession({
      expectedUserId: item.userId,
      operation: 'create',
      screen: 'Poisk-Raboty',
    });
    const pendingModeration = createPendingModeration();
    const sanitized = {
      ...item,
      listingKind: item.listingKind === 'vacancy' ? 'vacancy' : 'resume',
      name: sanitizeStoredText(item.name),
      phone: sanitizeStoredText(item.phone),
      about: sanitizeStoredText(item.about),
      photoStoragePath: item.photoStoragePath || item.photoUri || '',
      photoUri: '',
      userId: user.uid,
      moderationStatus: pendingModeration.moderationStatus,
      submittedForModerationAt: pendingModeration.submittedForModerationAt,
      language: normalizeAppLang(item.language, 'ua'),
    };
    assertTextMatchesLanguage(`${sanitized.workType} ${sanitized.about}`.trim(), sanitized.language, 'job_listings');
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
    const user = await requireWriteSession({
      operation: 'remove',
      screen: 'Poisk-Raboty',
    });
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? snapshot.val() as Partial<JobListing> : null;
    if (!existing || existing.userId !== user.uid) {
      throw new Error('owner_required');
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
