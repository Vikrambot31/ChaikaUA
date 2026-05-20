import { ref, push, update, onValue, query, orderByChild, equalTo, remove, get } from 'firebase/database';
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
}

const PATH = 'lost_found';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const lostFoundService = {
  subscribe(callback: (items: LostFoundItem[]) => void): () => void {
    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'));

    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const now = Date.now();
      const items: LostFoundItem[] = Object.entries(raw as Record<string, any>)
        .map(([id, data]) => ({
          id,
          type: data.type || 'found',
          name: data.name || '',
          phone: data.phone || '',
          category: data.category || '',
          photoUri: data.photoUri || data.photoStoragePath || '',
          photoStoragePath: data.photoStoragePath || data.photoUri || '',
          moderationStatus: data.moderationStatus || 'pending',
          submittedForModerationAt: data.submittedForModerationAt || '',
          createdAt: data.createdAt || '',
          expiresAt: data.expiresAt || new Date(now + DEFAULT_TTL_MS).toISOString(),
          userId: data.userId || '',
          userPhotoURL: data.userPhotoURL || '',
          moderationReason: data.moderationReason || data.reason || '',
          rejectionReason: data.rejectionReason || data.reason || '',
        }))
        .filter((item) => item.moderationStatus === 'approved' && new Date(item.expiresAt).getTime() > now)
        .reverse();
      callback(items);
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
