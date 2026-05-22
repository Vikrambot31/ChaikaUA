import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { resolveMediaAccessUrls } from './mediaAccess';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth } from '../firebase-auth-session';

export interface ContactListing {
  id: string;
  itemName: string;
  category: string;
  condition: string;
  price: string;
  description: string;
  phone: string;
  photoUri: string;
  photoStoragePath?: string;
  photoId?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt: string;
  userId: string;
  moderationReason?: string;
  rejectionReason?: string;
  showPhone?: boolean;
  isArchived?: boolean;
}

const PATH = 'contacts_listings';
const CONTACT_LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_LIMIT = 100;
const ACTIVE_LIMIT_BUFFER = 20;
const FEED_MINIMUM = 10;
const ARCHIVED_FALLBACK_LIMIT = 20;
const normalizePrice = (value: string): string => {
  const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric) || sanitized.trim() === '') {
    return sanitized;
  }
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 2);
};

const mapContactItem = (id: string, data: any, isArchived?: boolean): ContactListing => ({
  id,
  itemName: data.itemName || '',
  category: data.category || '',
  condition: data.condition || '',
  price: data.price || '',
  description: data.description || '',
  phone: data.phone || '',
  photoUri: data.photoUri || data.photoStoragePath || '',
  photoStoragePath: data.photoStoragePath || data.photoUri || '',
  photoId: data.photoId || '',
  moderationStatus: isArchived ? 'approved' : (data.moderationStatus || 'pending'),
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  expiresAt: data.expiresAt || '',
  userId: data.userId || '',
  moderationReason: isArchived ? '' : (data.moderationReason || data.reason || ''),
  rejectionReason: isArchived ? '' : (data.rejectionReason || data.reason || ''),
  showPhone: data.showPhone !== false,
  isArchived,
});

export const contactsService = {
  subscribe(callback: (items: ContactListing[]) => void): () => void {
    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(ACTIVE_LIMIT + ACTIVE_LIMIT_BUFFER));

    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      const now = Date.now();
      const active: ContactListing[] = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapContactItem(id, data))
            .filter((item) => {
              const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
              return item.moderationStatus === 'approved' && !expired;
            })
            .reverse()
            .slice(0, ACTIVE_LIMIT)
        : [];

      if (active.length >= FEED_MINIMUM) {
        void resolveMediaAccessUrls(active, 'contacts_listings', (item) => item.photoStoragePath || item.photoUri || '', (item, url) => ({ ...item, photoUri: url })).then(callback);
        return;
      }

      void get(query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
        const expiredRaw = expiredSnapshot.val();
        const archived: ContactListing[] = expiredRaw
          ? Object.entries(expiredRaw as Record<string, any>)
              .map(([id, data]) => mapContactItem(id, data, true))
              .reverse()
          : [];
        void resolveMediaAccessUrls([...active, ...archived], 'contacts_listings', (item) => item.photoStoragePath || item.photoUri || '', (item, url) => ({ ...item, photoUri: url })).then(callback);
      }).catch(() => {
        void resolveMediaAccessUrls(active, 'contacts_listings', (item) => item.photoStoragePath || item.photoUri || '', (item, url) => ({ ...item, photoUri: url })).then(callback);
      });
    });

    return unsubscribe;
  },

  async add(item: Omit<ContactListing, 'id'>): Promise<string> {
    const listRef = ref(database, PATH);
    const user = await ensureFirebaseAuth();
    const pendingModeration = createPendingModeration();
    const expiresAt = item.expiresAt || new Date(Date.now() + CONTACT_LISTING_TTL_MS).toISOString();
    const photoStoragePath = item.photoStoragePath || item.photoUri;
    const sanitized = {
      ...item,
      itemName: sanitizeStoredText(item.itemName),
      category: sanitizeStoredText(item.category),
      condition: sanitizeStoredText(item.condition),
      price: normalizePrice(item.price),
      description: sanitizeStoredText(item.description),
      phone: sanitizeStoredText(item.phone),
      userId: user.uid,
      photoStoragePath,
      photoUri: '',
      photoId: sanitizeStoredText(item.photoId || ''),
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
    const existing = snapshot.exists() ? snapshot.val() as Partial<ContactListing> : null;
    if (!existing || existing.userId !== user.uid) {
      throw new Error('permission-denied');
    }
    await remove(ref(database, `${PATH}/${id}`));
  },

  async attachPhotoStoragePath(id: string, photoStoragePath: string, photoId?: string): Promise<void> {
    if (!id || !photoStoragePath) return;
    await update(ref(database, `${PATH}/${id}`), {
      photoStoragePath,
      photoUri: '',
      ...(photoId ? { photoId: sanitizeStoredText(photoId) } : {}),
    });
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    const snapshot = await get(ref(database, `${PATH}/${id}`));
    const existing = snapshot.exists() ? ({ ...(snapshot.val() as Omit<ContactListing, 'id'>), id }) : null;
    await update(ref(database, `${PATH}/${id}`), {
      moderationStatus: status,
      moderatedAt: new Date().toISOString(),
      moderationReason: status === 'rejected' ? 'default_rejected' : null,
      rejectionReason: status === 'rejected' ? 'default_rejected' : null,
    });
    if (status === 'approved' && existing) {
      await publishApprovedActivity({
        userId: existing.userId,
        name: existing.itemName,
        phone: existing.phone,
        category: 'contacts',
        group: 'contacts',
        subcategory: existing.category,
        text: `[Контакти Чайки] ${existing.itemName}: ${existing.description || existing.price}`,
      });
    }
  },

};
