import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { resolveMediaAccessUrls } from './mediaAccess';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

export interface BuySellListing {
  id: string;
  listingType: 'buy' | 'sell';
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
  language?: AppLang;
}

const PATH = 'buy_sell_listings';
const DEFAULT_LISTING_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ACTIVE_LIMIT = 300;
const ACTIVE_LIMIT_BUFFER = 60;
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

const mapBuySellItem = (id: string, data: any, isArchived?: boolean): BuySellListing => ({
  id,
  listingType: data.listingType || 'sell',
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

export const buySellService = {
  subscribe(callback: (items: BuySellListing[]) => void, currentUserId?: string): () => void {
    // ─── LOCAL_MODE ───────────────
    if (LOCAL_MODE) {
      let cancelled = false;
      const load = () => {
        fetch(`${LOCAL_API}/announcements`)
          .then(r => r.json())
          .then((data: BuySellListing[]) => {
            if (!cancelled) callback(data);
          })
          .catch(() => { if (!cancelled) callback([]); });
      };
      load();
      const timer = setInterval(load, 5000);
      return () => { cancelled = true; clearInterval(timer); };
    }
    // ─────────────────────────────
    let approvedItems: BuySellListing[] = [];
    let ownPendingItems: BuySellListing[] = [];

    const emit = (active: BuySellListing[]) => {
      const ids = new Set(active.map((i) => i.id));
      const extras = ownPendingItems.filter((i) => !ids.has(i.id));
      const merged = [...extras, ...active];
      void resolveMediaAccessUrls(merged, 'buy_sell_listings', (item) => item.photoUri || item.photoStoragePath || '', (item, url) => ({ ...item, photoUri: url })).then(callback);
    };

    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(ACTIVE_LIMIT + ACTIVE_LIMIT_BUFFER));

    const unsubscribeApproved = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      const now = Date.now();
      const active: BuySellListing[] = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapBuySellItem(id, data))
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
        const expiredRaw = expiredSnapshot.val();
        const archived: BuySellListing[] = expiredRaw
          ? Object.entries(expiredRaw as Record<string, any>)
              .map(([id, data]) => mapBuySellItem(id, data, true))
              .reverse()
          : [];
        emit([...active, ...archived]);
      }).catch((error) => {
        console.warn('[buySellService] expired fallback load failed:', error);
        emit(active);
      });
    });

    let unsubscribeOwn: (() => void) | undefined;
    if (currentUserId) {
      const ownRef = query(ref(database, PATH), orderByChild('userId'), equalTo(currentUserId));
      unsubscribeOwn = onValue(ownRef, (snapshot) => {
        const raw = snapshot.val();
        ownPendingItems = raw
          ? Object.entries(raw as Record<string, any>)
              .map(([id, data]) => mapBuySellItem(id, data))
              .filter((item) => item.moderationStatus !== 'approved')
          : [];
        const ids = new Set(approvedItems.map((i) => i.id));
        const extras = ownPendingItems.filter((i) => !ids.has(i.id));
        void resolveMediaAccessUrls([...extras, ...approvedItems], 'buy_sell_listings', (item) => item.photoUri || item.photoStoragePath || '', (item, url) => ({ ...item, photoUri: url })).then(callback);
      }, () => { ownPendingItems = []; });
    }

    return () => {
      unsubscribeApproved();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<BuySellListing, 'id'>): Promise<string> {
    if (LOCAL_MODE) {
      const newItem = { ...item, id: `ann-${Date.now()}`, moderationStatus: 'pending' as ModerationStatus };
      const res = await fetch(`${LOCAL_API}/announcements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem),
      });
      const saved = await res.json() as BuySellListing;
      return saved.id;
    }
    try {
      const listRef = ref(database, PATH);
      const user = await ensureFirebaseAuth();
      const pendingModeration = createPendingModeration();
      const expiresAt = item.expiresAt || new Date(Date.now() + DEFAULT_LISTING_TTL_MS).toISOString();
      const photoStoragePath = item.photoStoragePath || item.photoUri;
      const sanitized = {
        ...item,
        listingType: item.listingType === 'buy' ? 'buy' : 'sell',
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
        language: normalizeAppLang(item.language, 'ua'),
      };
      assertTextMatchesLanguage(`${sanitized.itemName} ${sanitized.description}`.trim(), sanitized.language);
      const newRef = await push(listRef, sanitized);
      return newRef.key!;
    } catch (error) {
      console.error('[buySellService] add failed:', error);
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      const user = await ensureFirebaseAuth();
      const snapshot = await get(ref(database, `${PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<BuySellListing> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('permission-denied');
      }
      await remove(ref(database, `${PATH}/${id}`));
    } catch (error) {
      console.error('[buySellService] remove failed:', error);
      throw error;
    }
  },

  async attachPhotoStoragePath(id: string, photoStoragePath: string, photoId?: string): Promise<void> {
    if (!id || !photoStoragePath) return;
    try {
      await update(ref(database, `${PATH}/${id}`), {
        photoStoragePath,
        photoUri: '',
        ...(photoId ? { photoId: sanitizeStoredText(photoId) } : {}),
      });
    } catch (error) {
      console.error('[buySellService] attachPhotoStoragePath failed:', error);
      throw error;
    }
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    try {
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
    } catch (error) {
      console.error('[buySellService] moderate failed:', error);
      throw error;
    }
  },

};
