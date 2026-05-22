import { ref, push, update, onValue, query, orderByChild, equalTo, remove, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth } from '../firebase-auth-session';

export type RequestType = 'found' | 'lost';

export interface LostFoundItem {
  id: string;
  type: RequestType;
  name: string;
  phone: string;
  category: string;
  photoUri: string;
  photoStoragePath?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt: string;
  userId: string;
  userPhotoURL?: string;
  moderationReason?: string;
  rejectionReason?: string;
  isArchived?: boolean;
}

const PATH = 'lost_found';
const DEFAULT_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const ACTIVE_LIMIT = 100;
const ACTIVE_LIMIT_BUFFER = 20;
const FEED_MINIMUM = 10;
const ARCHIVED_FALLBACK_LIMIT = 20;

const mapLostFoundItem = (id: string, data: any, now: number, isArchived?: boolean): LostFoundItem => ({
  id,
  type: data.type || 'found',
  name: data.name || '',
  phone: data.phone || '',
  category: data.category || '',
  photoUri: data.photoUri || data.photoStoragePath || '',
  photoStoragePath: data.photoStoragePath || data.photoUri || '',
  moderationStatus: isArchived ? 'approved' : (data.moderationStatus || 'pending'),
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  expiresAt: data.expiresAt || new Date(now + DEFAULT_TTL_MS).toISOString(),
  userId: data.userId || '',
  userPhotoURL: data.userPhotoURL || '',
  moderationReason: isArchived ? '' : (data.moderationReason || data.reason || ''),
  rejectionReason: isArchived ? '' : (data.rejectionReason || data.reason || ''),
  isArchived,
});

export const lostFoundService = {
  subscribe(callback: (items: LostFoundItem[]) => void): () => void {
    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(ACTIVE_LIMIT + ACTIVE_LIMIT_BUFFER));

    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      const now = Date.now();
      const active: LostFoundItem[] = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapLostFoundItem(id, data, now))
            .filter((item) => item.moderationStatus === 'approved' && new Date(item.expiresAt).getTime() > now)
            .reverse()
            .slice(0, ACTIVE_LIMIT)
        : [];

      if (active.length >= FEED_MINIMUM) {
        callback(active);
        return;
      }

      void get(query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
        const expiredRaw = expiredSnapshot.val();
        const archived: LostFoundItem[] = expiredRaw
          ? Object.entries(expiredRaw as Record<string, any>)
              .map(([id, data]) => mapLostFoundItem(id, data, now, true))
              .reverse()
          : [];
        callback([...active, ...archived]);
      }).catch(() => {
        callback(active);
      });
    });

    return unsubscribe;
  },

  async add(item: Omit<LostFoundItem, 'id'>): Promise<string> {
    const listRef = ref(database, PATH);
    const user = await ensureFirebaseAuth();
    const pendingModeration = createPendingModeration();
    const expiresAt = item.expiresAt || new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
    const photoStoragePath = item.photoStoragePath || item.photoUri;
    const sanitized = {
      ...item,
      name: sanitizeStoredText(item.name),
      phone: sanitizeStoredText(item.phone),
      category: sanitizeStoredText(item.category),
      userId: user.uid,
      photoStoragePath,
      photoUri: '',
      expiresAt,
      moderationStatus: pendingModeration.moderationStatus,
      submittedForModerationAt: pendingModeration.submittedForModerationAt,
    };
    const newRef = await push(listRef, sanitized);
    return newRef.key!;
  },

  async remove(id: string): Promise<void> {
    const user = await ensureFirebaseAuth();
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? snapshot.val() as Partial<LostFoundItem> : null;
    if (!existing || existing.userId !== user.uid) {
      throw new Error('permission-denied');
    }
    await remove(ref(database, `${PATH}/${id}`));
  },

  async attachPhotoStoragePath(id: string, photoStoragePath: string): Promise<void> {
    if (!id || !photoStoragePath) return;
    await update(ref(database, `${PATH}/${id}`), {
      photoStoragePath,
      photoUri: '',
    });
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? ({ ...(snapshot.val() as Omit<LostFoundItem, 'id'>), id }) : null;
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
        category: 'lost_found',
        group: 'lost_found',
        subcategory: existing.type,
        text: `[${existing.type === 'lost' ? 'Потеряно' : 'Найдено'}] ${existing.category}: ${existing.name}`,
      });
    }
  },

};
