import { equalTo, limitToLast, onValue, orderByChild, push, query, ref } from 'firebase/database';
import { database } from '../firebase-core';
import { requireWriteSession } from '../firebase-auth-session';
import { createPendingModeration, type ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

const PATH = 'children_top_listings';
const ACTIVE_LIMIT = 30;
const LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChildrenTopListing {
  id: string;
  title: string;
  description: string;
  photoUri: string;
  photoStoragePath?: string;
  photoId?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt?: string;
  userId: string;
  language?: AppLang;
}

const mapChildrenTopItem = (id: string, data: any): ChildrenTopListing => ({
  id,
  title: data.title || '',
  description: data.description || '',
  photoUri: data.photoUri || data.photoStoragePath || '',
  photoStoragePath: data.photoStoragePath || '',
  photoId: data.photoId || '',
  moderationStatus: data.moderationStatus || 'pending',
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
  userId: data.userId || '',
  language: normalizeAppLang(data.language, 'ua'),
});

export const childrenTopService = {
  subscribe(callback: (items: ChildrenTopListing[]) => void, currentUserId?: string): () => void {
    let approvedItems: ChildrenTopListing[] = [];
    let ownPendingItems: ChildrenTopListing[] = [];

    const emit = () => {
      const approvedIds = new Set(approvedItems.map((item) => item.id));
      const ownExtras = ownPendingItems.filter((item) => !approvedIds.has(item.id));
      callback([...ownExtras, ...approvedItems]);
    };

    const approvedRef = query(
      ref(database, PATH),
      orderByChild('moderationStatus'),
      equalTo('approved'),
      limitToLast(ACTIVE_LIMIT),
    );

    const unsubscribeApproved = onValue(approvedRef, (snapshot) => {
      const raw = snapshot.val();
      const nowMs = Date.now();
      approvedItems = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapChildrenTopItem(id, data))
            .filter((item) =>
              item.title.trim() &&
              item.photoUri &&
              (!item.expiresAt || new Date(item.expiresAt).getTime() > nowMs),
            )
            .reverse()
        : [];
      emit();
    }, (error) => {
      console.error('[childrenTopService] approved items RTDB error:', error.message);
      approvedItems = [];
      emit();
    });

    let unsubscribeOwn: (() => void) | undefined;
    if (currentUserId) {
      const ownRef = query(ref(database, PATH), orderByChild('userId'), equalTo(currentUserId));
      unsubscribeOwn = onValue(ownRef, (snapshot) => {
        const raw = snapshot.val();
        ownPendingItems = raw
          ? Object.entries(raw as Record<string, any>)
              .map(([id, data]) => mapChildrenTopItem(id, data))
              .filter((item) => item.moderationStatus !== 'approved' && item.title.trim() && item.photoUri)
              .reverse()
          : [];
        emit();
      }, (error) => {
        console.error('[childrenTopService] own pending items RTDB error:', error.message);
        ownPendingItems = [];
        emit();
      });
    }

    return () => {
      unsubscribeApproved();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<ChildrenTopListing, 'id'>): Promise<string> {
    const user = await requireWriteSession({
      expectedUserId: item.userId,
      operation: 'create',
      screen: 'Vse-Dlya-Detey',
    });
    const pendingModeration = createPendingModeration();
    const language = normalizeAppLang(item.language, 'ua');
    const sanitized = {
      ...item,
      title: sanitizeStoredText(item.title),
      description: sanitizeStoredText(item.description),
      photoUri: sanitizeStoredText(item.photoUri),
      photoStoragePath: sanitizeStoredText(item.photoStoragePath || ''),
      photoId: sanitizeStoredText(item.photoId || ''),
      userId: user.uid,
      moderationStatus: pendingModeration.moderationStatus,
      submittedForModerationAt: pendingModeration.submittedForModerationAt,
      expiresAt: new Date(Date.now() + LISTING_TTL_MS).toISOString(),
      language,
    };
    assertTextMatchesLanguage(`${sanitized.title} ${sanitized.description}`.trim(), language);
    try {
      const newRef = await push(ref(database, PATH), sanitized);
      return newRef.key!;
    } catch (error) {
      console.error('[childrenTopService] add failed:', error);
      throw error;
    }
  },
};
