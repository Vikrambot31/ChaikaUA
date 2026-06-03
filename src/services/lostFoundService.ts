import { ref, push, update, onValue, query, orderByChild, equalTo, remove, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { publishApprovedActivity } from './activityMirror';
import { requireWriteSession } from '../firebase-auth-session';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

export type RequestType = 'found' | 'lost';

export interface LostFoundItem {
  id: string;
  type: RequestType;
  name: string;
  phone: string;
  category: string;
  description?: string;
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
  language?: AppLang;
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
  description: data.description || '',
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
  subscribe(callback: (items: LostFoundItem[]) => void, currentUserId?: string): () => void {
    // ─── LOCAL_MODE ───────────────────────────────────────────────────────────
    if (LOCAL_MODE) {
      let cancelled = false;
      const load = () => {
        fetch(`${LOCAL_API}/lostFound`)
          .then(r => r.json())
          .then((data: LostFoundItem[]) => {
            if (!cancelled) callback(data);
          })
          .catch(() => { if (!cancelled) callback([]); });
      };
      load();
      const timer = setInterval(load, 5000);
      return () => { cancelled = true; clearInterval(timer); };
    }
    // ─────────────────────────────────────────────────────────────────────────
    const now = Date.now();
    let approvedItems: LostFoundItem[] = [];
    let ownPendingItems: LostFoundItem[] = [];

    const emit = (active: LostFoundItem[]) => {
      // Merge own pending/rejected items (not yet approved) with the feed
      const ids = new Set(active.map((i) => i.id));
      const extras = ownPendingItems.filter((i) => !ids.has(i.id));
      const merged = [...extras, ...active];
      callback(merged);
    };

    const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(ACTIVE_LIMIT + ACTIVE_LIMIT_BUFFER));

    const unsubscribeApproved = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      approvedItems = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapLostFoundItem(id, data, now))
            .filter((item) => item.moderationStatus === 'approved' && new Date(item.expiresAt).getTime() > now)
            .reverse()
            .slice(0, ACTIVE_LIMIT)
        : [];

      if (approvedItems.length >= FEED_MINIMUM) {
        emit(approvedItems);
        return;
      }

      void get(query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
        const expiredRaw = expiredSnapshot.val();
        const archived: LostFoundItem[] = expiredRaw
          ? Object.entries(expiredRaw as Record<string, any>)
              .map(([id, data]) => mapLostFoundItem(id, data, now, true))
              .reverse()
          : [];
        emit([...approvedItems, ...archived]);
      }).catch((error) => {
        console.warn('[lostFoundService] expired fallback load failed:', error);
        emit(approvedItems);
      });
    });

    let unsubscribeOwn: (() => void) | undefined;
    if (currentUserId) {
      const ownRef = query(ref(database, PATH), orderByChild('userId'), equalTo(currentUserId));
      unsubscribeOwn = onValue(ownRef, (snapshot) => {
        const raw = snapshot.val();
        ownPendingItems = raw
          ? Object.entries(raw as Record<string, any>)
              .map(([id, data]) => mapLostFoundItem(id, data, now))
              .filter((item) => item.moderationStatus !== 'approved')
          : [];
        // Re-emit with updated own items merged into last known approved list
        const ids = new Set(approvedItems.map((i) => i.id));
        const extras = ownPendingItems.filter((i) => !ids.has(i.id));
        callback([...extras, ...approvedItems]);
      }, () => { ownPendingItems = []; });
    }

    return () => {
      unsubscribeApproved();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<LostFoundItem, 'id'>): Promise<string> {
    if (LOCAL_MODE) {
      const newItem = { ...item, id: `lf-${Date.now()}`, moderationStatus: 'pending' as ModerationStatus };
      const res = await fetch(`${LOCAL_API}/lostFound`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem),
      });
      const saved = await res.json() as LostFoundItem;
      return saved.id;
    }
    try {
      const listRef = ref(database, PATH);
      const user = await requireWriteSession({
        expectedUserId: item.userId,
        operation: 'create',
        screen: 'Kto-Poteryal',
      });
      const pendingModeration = createPendingModeration();
      const expiresAt = item.expiresAt || new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
      const photoStoragePath = item.photoStoragePath || item.photoUri;
      const sanitized = {
        ...item,
        name: sanitizeStoredText(item.name),
        phone: sanitizeStoredText(item.phone),
        category: sanitizeStoredText(item.category),
        description: sanitizeStoredText(item.description || ''),
        userId: user.uid,
        photoStoragePath,
        photoUri: '',
        expiresAt,
        moderationStatus: pendingModeration.moderationStatus,
        submittedForModerationAt: pendingModeration.submittedForModerationAt,
        language: normalizeAppLang(item.language, 'ua'),
      };
      assertTextMatchesLanguage(`${sanitized.category} ${sanitized.description}`.trim(), sanitized.language);
      const newRef = await push(listRef, sanitized);
      return newRef.key!;
    } catch (error) {
      console.error('[lostFoundService] add failed:', error);
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      const user = await requireWriteSession({
        operation: 'remove',
        screen: 'Kto-Poteryal',
      });
      const snapshot = await get(ref(database, `${PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<LostFoundItem> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('owner_required');
      }
      await remove(ref(database, `${PATH}/${id}`));
    } catch (error) {
      console.error('[lostFoundService] remove failed:', error);
      throw error;
    }
  },

  async close(id: string): Promise<void> {
    try {
      const user = await requireWriteSession({
        operation: 'close',
        screen: 'Kto-Poteryal',
      });
      const snapshot = await get(ref(database, `${PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<LostFoundItem> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('owner_required');
      }
      await update(ref(database, `${PATH}/${id}`), {
        moderationStatus: 'expired',
        closedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[lostFoundService] close failed:', error);
      throw error;
    }
  },

  async attachPhotoStoragePath(id: string, photoStoragePath: string): Promise<void> {
    if (!id || !photoStoragePath) return;
    try {
      await update(ref(database, `${PATH}/${id}`), {
        photoStoragePath,
        photoUri: '',
      });
    } catch (error) {
      console.error('[lostFoundService] attachPhotoStoragePath failed:', error);
      throw error;
    }
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    try {
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
          photoUri: existing.photoUri,
          photoStoragePath: existing.photoStoragePath,
          sourceItemId: id,
          sourceType: existing.type,
          sourceCategory: existing.category,
          sourceTitle: existing.category,
          sourceDescription: existing.description,
          text: `[${existing.type === 'lost' ? 'Потеряно' : 'Найдено'}] ${existing.category}: ${existing.name}`,
        });
      }
    } catch (error) {
      console.error('[lostFoundService] moderate failed:', error);
      throw error;
    }
  },

};
