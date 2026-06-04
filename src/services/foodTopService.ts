import { equalTo, limitToLast, onValue, orderByChild, push, query, ref } from 'firebase/database';
import { database } from '../firebase-core';
import { requireWriteSession } from '../firebase-auth-session';
import { createPendingModeration, type ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { assertTextMatchesLanguage, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';

const PATH = 'food_top_listings';
const ACTIVE_LIMIT = 40;

export interface FoodTopListing {
  id: string;
  title: string;
  description: string;
  photoUri: string;
  photoStoragePath?: string;
  photoId?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  userId: string;
  language?: AppLang;
}

const mapFoodTopItem = (id: string, data: any): FoodTopListing => ({
  id,
  title: data.title || '',
  description: data.description || '',
  photoUri: data.photoUri || data.photoStoragePath || '',
  photoStoragePath: data.photoStoragePath || '',
  photoId: data.photoId || '',
  moderationStatus: data.moderationStatus || 'pending',
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  userId: data.userId || '',
  language: normalizeAppLang(data.language, 'ua'),
});

export const foodTopService = {
  subscribe(callback: (items: FoodTopListing[]) => void, currentUserId?: string): () => void {
    let approvedItems: FoodTopListing[] = [];
    let ownPendingItems: FoodTopListing[] = [];

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
      approvedItems = raw
        ? Object.entries(raw as Record<string, any>)
            .map(([id, data]) => mapFoodTopItem(id, data))
            .filter((item) => item.title.trim() && item.photoUri)
            .reverse()
        : [];
      emit();
    }, () => {
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
              .map(([id, data]) => mapFoodTopItem(id, data))
              .filter((item) => item.moderationStatus !== 'approved' && item.title.trim() && item.photoUri)
              .reverse()
          : [];
        emit();
      }, () => {
        ownPendingItems = [];
        emit();
      });
    }

    return () => {
      unsubscribeApproved();
      unsubscribeOwn?.();
    };
  },

  async add(item: Omit<FoodTopListing, 'id'>): Promise<string> {
    const user = await requireWriteSession({
      expectedUserId: item.userId,
      operation: 'create',
      screen: 'Eda-Na-Chayke',
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
      language,
    };
    assertTextMatchesLanguage(`${sanitized.title} ${sanitized.description}`.trim(), language);
    const newRef = await push(ref(database, PATH), sanitized);
    return newRef.key!;
  },
};
