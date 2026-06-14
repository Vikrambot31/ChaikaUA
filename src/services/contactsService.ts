import { ref, push, update, onValue, remove, query, orderByChild, equalTo, get, limitToLast, endBefore } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { resolveMediaAccessUrls } from './mediaAccess';
import { publishApprovedActivity } from './activityMirror';
import { ensureFirebaseAuth, requireWriteSession } from '../firebase-auth-session';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

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
  zodiacSign?: string;
  humanDesignType?: string;
  humanDesignProfile?: string;
  lookingForGender?: string;
  photoUris?: string[];
  photoStoragePaths?: string[];
  isArchived?: boolean;
  language?: AppLang;
  lastEditedAt?: string;
}

const normalizeRtdbArray = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return (val as unknown[]).filter((v): v is string => typeof v === 'string' && Boolean(v));
  if (typeof val === 'object') return Object.values(val as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && Boolean(v));
  return [];
};

const PATH = 'contacts_listings';
const CONTACT_LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;
const ACTIVE_LIMIT_BUFFER = 20;
const FEED_MINIMUM = 10;
const ARCHIVED_FALLBACK_LIMIT = 20;
const INITIAL_PHOTO_RESOLVE_LIMIT = 25;
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
  zodiacSign: data.zodiacSign || '',
  humanDesignType: data.humanDesignType || '',
  humanDesignProfile: data.humanDesignProfile || '',
  lookingForGender: data.lookingForGender || '',
  photoUris: normalizeRtdbArray(data.photoUris),
  photoStoragePaths: normalizeRtdbArray(data.photoStoragePaths),
  isArchived,
  lastEditedAt: data.lastEditedAt || '',
});

export const contactsService = {
  subscribe(callback: (items: ContactListing[]) => void, currentUserId?: string, onError?: (error: unknown) => void): () => void {
    let requestId = 0;
    let disposed = false;
    let latestApprovedArchived: ContactListing[] = [];
    let ownPendingItems: ContactListing[] = [];
    let unsubscribeApproved: (() => void) | undefined;
    let unsubscribeOwn: (() => void) | undefined;

    const buildMerged = (approvedArchived: ContactListing[]): ContactListing[] => {
      const ids = new Set(approvedArchived.map((i) => i.id));
      const extras = ownPendingItems.filter((i) => !ids.has(i.id));
      return [...extras, ...approvedArchived];
    };

    const resolvePhotosInBackground = (items: ContactListing[], currentRequestId: number): void => {
      const resolvedPhotoUris = new Map<string, string>();
      const resolvedPhotoUrisArrays = new Map<string, string[]>();
      const publishResolvedPhotos = () => {
        if (disposed || currentRequestId !== requestId) return;
        callback(items.map((item) => {
          const photoUri = resolvedPhotoUris.get(item.id);
          const photoUrisArr = resolvedPhotoUrisArrays.get(item.id);
          const updates: Partial<ContactListing> = {};
          if (photoUri) updates.photoUri = photoUri;
          if (photoUrisArr) updates.photoUris = photoUrisArr;
          return (photoUri || photoUrisArr) ? { ...item, ...updates } : item;
        }));
      };

      const resolveChunk = async (chunk: ContactListing[]) => {
        const resolved = await resolveMediaAccessUrls(
          chunk,
          'contacts_listings',
          (item) => item.photoUri || item.photoStoragePath || '',
          (item, url) => ({ ...item, photoUri: url }),
          { profile: 'list' },
        );
        if (disposed || currentRequestId !== requestId) return;
        resolved.forEach((item) => {
          if (item.photoUri) {
            resolvedPhotoUris.set(item.id, item.photoUri);
          }
        });
        // Resolve multi-photo photoUris arrays
        for (const item of chunk) {
          if (disposed || currentRequestId !== requestId) return;
          const storagePaths = item.photoUris || [];
          if (storagePaths.length <= 1) continue;
          try {
            type Wrapper = { id: string; path: string };
            const wrappers: Wrapper[] = storagePaths.map((p, i) => ({ id: `${item.id}_${i}`, path: p }));
            const resolvedArr = await resolveMediaAccessUrls(
              wrappers,
              'contacts_listings',
              (w) => w.path,
              (w, url) => ({ ...w, path: url }),
              { profile: 'list' },
            );
            if (disposed || currentRequestId !== requestId) return;
            const urls = resolvedArr.map((w) => w.path).filter(Boolean);
            if (urls.length > 0) {
              resolvedPhotoUrisArrays.set(item.id, urls);
            }
          } catch {
            // skip multi-photo resolve errors silently
          }
        }
        publishResolvedPhotos();
      };

      void resolveChunk(items.slice(0, INITIAL_PHOTO_RESOLVE_LIMIT)).then(async () => {
        for (let index = INITIAL_PHOTO_RESOLVE_LIMIT; index < items.length; index += INITIAL_PHOTO_RESOLVE_LIMIT) {
          if (disposed || currentRequestId !== requestId) return;
          await resolveChunk(items.slice(index, index + INITIAL_PHOTO_RESOLVE_LIMIT));
        }
      }).catch((error) => {
        console.warn('[contactsService] media resolve failed:', error);
      });
    };

    void ensureFirebaseAuth().then(() => {
      if (disposed) return;

      const listRef = query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(PAGE_SIZE + ACTIVE_LIMIT_BUFFER));

      unsubscribeApproved = onValue(listRef, (snapshot) => {
        if (disposed) return;
        requestId += 1;
        const currentRequestId = requestId;
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
          : [];

        if (active.length >= FEED_MINIMUM) {
          latestApprovedArchived = active;
          const merged = buildMerged(active);
          callback(merged);
          resolvePhotosInBackground(merged, currentRequestId);
          return;
        }

        callback(buildMerged(active));

        void get(query(ref(database, PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
          if (disposed || currentRequestId !== requestId) return;
          const expiredRaw = expiredSnapshot.val();
          const archived: ContactListing[] = expiredRaw
            ? Object.entries(expiredRaw as Record<string, any>)
                .map(([id, data]) => mapContactItem(id, data, true))
                .reverse()
            : [];
          const combined = [...active, ...archived];
          latestApprovedArchived = combined;
          const merged = buildMerged(combined);
          callback(merged);
          resolvePhotosInBackground(merged, currentRequestId);
        }).catch((error) => {
          console.warn('[contactsService] expired fallback load failed:', error);
          if (disposed || currentRequestId !== requestId) return;
          latestApprovedArchived = active;
          resolvePhotosInBackground(buildMerged(active), currentRequestId);
        });
      }, (error) => {
        console.warn('[contactsService] approved subscription failed:', error);
        if (!disposed) {
          callback([]);
          onError?.(error);
        }
      });

      if (currentUserId) {
        const ownRef = query(ref(database, PATH), orderByChild('userId'), equalTo(currentUserId));
        unsubscribeOwn = onValue(ownRef, (snapshot) => {
          if (disposed) return;
          const raw = snapshot.val();
          ownPendingItems = raw
            ? Object.entries(raw as Record<string, any>)
                .map(([id, data]) => mapContactItem(id, data))
                .filter((item) => item.moderationStatus !== 'approved')
            : [];
          callback(buildMerged(latestApprovedArchived));
        }, (error) => {
          console.warn('[contactsService] own subscription failed:', error);
          ownPendingItems = [];
          if (!disposed) onError?.(error);
        });
      }
    }).catch((error) => {
      console.warn('[contactsService] auth bootstrap failed:', error);
      if (!disposed) {
        callback([]);
        onError?.(error);
      }
    });

    return () => {
      disposed = true;
      requestId += 1;
      unsubscribeApproved?.();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<ContactListing, 'id'>): Promise<string> {
    try {
      const listRef = ref(database, PATH);
      const user = await requireWriteSession({
        expectedUserId: item.userId,
        operation: 'create',
        screen: 'Kontakt-XXX',
      });
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
        zodiacSign: sanitizeStoredText(item.zodiacSign || ''),
        humanDesignType: sanitizeStoredText(item.humanDesignType || ''),
        humanDesignProfile: sanitizeStoredText(item.humanDesignProfile || ''),
        lookingForGender: sanitizeStoredText(item.lookingForGender || ''),
        photoUris: (item.photoUris || []).map((p) => sanitizeStoredText(p)),
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
      console.error('[contactsService] add failed:', error);
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      const user = await requireWriteSession({
        operation: 'remove',
        screen: 'Kontakt-XXX',
      });
      const snapshot = await get(ref(database, `${PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<ContactListing> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('owner_required');
      }
      await remove(ref(database, `${PATH}/${id}`));
    } catch (error) {
      console.error('[contactsService] remove failed:', error);
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
      console.error('[contactsService] attachPhotoStoragePath failed:', error);
      throw error;
    }
  },

  async edit(id: string, fields: Partial<Omit<ContactListing, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    try {
      const user = await requireWriteSession({
        operation: 'edit',
        screen: 'Kontakt-XXX',
      });
      const snapshot = await get(ref(database, `${PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<ContactListing> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('owner_required');
      }
      const EDIT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
      const lastEdited = existing.lastEditedAt ? new Date(existing.lastEditedAt as string).getTime() : 0;
      if (lastEdited && Date.now() - lastEdited < EDIT_COOLDOWN_MS) {
        throw new Error('edit_cooldown');
      }
      if (existing.moderationStatus === 'pending') {
        throw new Error('edit_while_pending');
      }
      const pendingModeration = createPendingModeration();
      const patch: Record<string, unknown> = {};
      if (fields.itemName !== undefined) patch.itemName = sanitizeStoredText(fields.itemName);
      if (fields.category !== undefined) patch.category = sanitizeStoredText(fields.category);
      if (fields.condition !== undefined) patch.condition = sanitizeStoredText(fields.condition);
      if (fields.price !== undefined) patch.price = normalizePrice(fields.price);
      if (fields.description !== undefined) patch.description = sanitizeStoredText(fields.description);
      if (fields.phone !== undefined) patch.phone = sanitizeStoredText(fields.phone);
      if (fields.zodiacSign !== undefined) patch.zodiacSign = sanitizeStoredText(fields.zodiacSign);
      if (fields.humanDesignType !== undefined) patch.humanDesignType = sanitizeStoredText(fields.humanDesignType);
      if (fields.humanDesignProfile !== undefined) patch.humanDesignProfile = sanitizeStoredText(fields.humanDesignProfile);
      if (fields.lookingForGender !== undefined) patch.lookingForGender = sanitizeStoredText(fields.lookingForGender);
      if (fields.showPhone !== undefined) patch.showPhone = fields.showPhone;
      if (fields.photoStoragePath !== undefined) {
        patch.photoStoragePath = fields.photoStoragePath;
        patch.photoUri = '';
      }
      if (fields.photoUris !== undefined) patch.photoUris = fields.photoUris;
      if (fields.photoStoragePaths !== undefined) {
        patch.photoStoragePaths = fields.photoStoragePaths;
        if (fields.photoStoragePaths.length > 0) {
          patch.photoStoragePath = fields.photoStoragePaths[0];
          patch.photoUri = '';
        }
      }
      if (fields.language !== undefined) patch.language = normalizeAppLang(fields.language, 'ua');
      const descText = (patch.description as string) ?? existing.description ?? '';
      const nameText = (patch.itemName as string) ?? existing.itemName ?? '';
      const lang = (patch.language as AppLang) ?? existing.language ?? 'ua';
      assertTextMatchesLanguage(`${nameText} ${descText}`.trim(), lang);
      patch.moderationStatus = pendingModeration.moderationStatus;
      patch.submittedForModerationAt = pendingModeration.submittedForModerationAt;
      patch.lastEditedAt = new Date().toISOString();
      patch.expiresAt = new Date(Date.now() + CONTACT_LISTING_TTL_MS).toISOString();
      await update(ref(database, `${PATH}/${id}`), patch);
    } catch (error) {
      console.error('[contactsService] edit failed:', error);
      throw error;
    }
  },

  async moderate(id: string, status: Exclude<ModerationStatus, 'pending'>): Promise<void> {
    try {
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
    } catch (error) {
      console.error('[contactsService] moderate failed:', error);
      throw error;
    }
  },

  async fetchNextPage(cursor: string, pageSize: number = PAGE_SIZE): Promise<{ items: ContactListing[]; nextCursor: string | null; hasMore: boolean }> {
    try {
      await ensureFirebaseAuth();
      const pageQuery = query(
        ref(database, PATH),
        orderByChild('createdAt'),
        endBefore(cursor),
        limitToLast(pageSize + 1),
      );
      const snap = await get(pageQuery);
      const raw = snap.val();
      if (!raw) return { items: [], nextCursor: null, hasMore: false };

      const rawEntries = Object.entries(raw as Record<string, any>);
      // hasMore based on PRE-filter count (RTDB returned more than pageSize items)
      const hasMore = rawEntries.length > pageSize;

      const now = Date.now();
      const all = rawEntries
        .map(([id, data]) => mapContactItem(id, data))
        .filter((i) => i.moderationStatus === 'approved' && (!i.expiresAt || new Date(i.expiresAt).getTime() >= now))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      const items = all.slice(0, pageSize);

      // Cursor from oldest raw entry's createdAt (not filtered), to ensure no gaps
      const oldestRawCreatedAt = rawEntries
        .map(([, data]) => (data as any).createdAt || '')
        .filter(Boolean)
        .sort()[0];
      const nextCursor = hasMore ? (oldestRawCreatedAt || null) : null;

      return { items, nextCursor, hasMore };
    } catch (error) {
      console.warn('[contactsService] fetchNextPage failed:', error);
      return { items: [], nextCursor: null, hasMore: false };
    }
  },

};

export { PAGE_SIZE };
