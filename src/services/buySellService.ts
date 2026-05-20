import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { resolveMediaAccessUrls } from './mediaAccess';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth } from '../firebase-auth-session';

export interface BuySellListing {
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
}

const PATH = 'buy_sell_listings';
const DEFAULT_LISTING_TTL_MS = 120 * 24 * 60 * 60 * 1000;
const normalizePrice = (value: string): string => {
  const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric) || sanitized.trim() === '') {
    return sanitized;
  }
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 2);
};

export const buySellService = {
  subscribe(callback: (items: BuySellListing[]) => void): () => void {
    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'));

    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const now = Date.now();
      const items: BuySellListing[] = Object.entries(raw as Record<string, any>)
        .map(([id, data]) => ({
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
          moderationStatus: data.moderationStatus || 'pending',
          submittedForModerationAt: data.submittedForModerationAt || '',
          createdAt: data.createdAt || '',
          expiresAt: data.expiresAt || '',
          userId: data.userId || '',
          moderationReason: data.moderationReason || data.reason || '',
          rejectionReason: data.rejectionReason || data.reason || '',
          showPhone: data.showPhone !== false,
        }))
        .filter((item) => {
          const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
          return item.moderationStatus === 'approved' && !expired;
        })
        .reverse();
      void resolveMediaAccessUrls(
        items,
        'buy_sell_listings',
        (item) => item.photoStoragePath || item.photoUri || '',
        (item, url) => ({ ...item, photoUri: url }),
      ).then(callback);
    });

    return unsubscribe;
  },

  async add(item: Omit<BuySellListing, 'id'>): Promise<string> {
    const listRef = ref(database, PATH);
    const user = await ensureFirebaseAuth();
    const pendingModeration = createPendingModeration();
    const expiresAt = item.expiresAt || new Date(Date.now() + DEFAULT_LISTING_TTL_MS).toISOString();
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
    const existing = snapshot.exists() ? snapshot.val() as Partial<BuySellListing> : null;
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
    const existing = snapshot.exists() ? ({ ...(snapshot.val() as Omit<BuySellListing, 'id'>), id }) : null;
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
        category: 'buy_sell',
        group: 'buy_sell',
        subcategory: existing.category,
        text: `[Контакти Чайки] ${existing.itemName}: ${existing.description || existing.price}`,
      });
    }
  },

};
