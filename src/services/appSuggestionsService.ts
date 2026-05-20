import { get, onValue, push, ref, remove, set, update } from 'firebase/database';
import { database } from '../firebase-core';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';
import { ensureFirebaseAuth, getCurrentUser } from '../firebase-auth-session';

export interface AppSuggestion {
  id: string;
  text: string;
  name: string;
  phone: string;
  userId: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  moderatedAt?: string;
  moderationReason?: string;
  rejectionReason?: string;
}

const PATH = 'app_suggestions';
const MAX_TEXT_LENGTH = 200;

const resolveSuggestionUserId = async (fallbackUserId?: string): Promise<string> => {
  const currentUser = getCurrentUser();
  if (currentUser) {
    return currentUser.uid;
  }

  try {
    const user = await ensureFirebaseAuth();
    return user.uid;
  } catch {
    return sanitizeStoredText(fallbackUserId || `guest_${Date.now()}`).slice(0, 64);
  }
};

const mapSuggestion = (id: string, value: Record<string, unknown>): AppSuggestion => ({
  id,
  text: typeof value.text === 'string' ? value.text : '',
  name: typeof value.name === 'string' ? value.name : 'Guest',
  phone: typeof value.phone === 'string' ? value.phone : '',
  userId: typeof value.userId === 'string' ? value.userId : '',
  moderationStatus:
    value.moderationStatus === 'approved' || value.moderationStatus === 'rejected'
      ? value.moderationStatus
      : 'pending',
  submittedForModerationAt:
    typeof value.submittedForModerationAt === 'string'
      ? value.submittedForModerationAt
      : new Date().toISOString(),
  createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  moderatedAt: typeof value.moderatedAt === 'string' ? value.moderatedAt : undefined,
  moderationReason: typeof value.moderationReason === 'string' ? value.moderationReason : undefined,
  rejectionReason: typeof value.rejectionReason === 'string' ? value.rejectionReason : undefined,
});

const mapLegacySuggestion = (id: string, value: Record<string, unknown>): AppSuggestion => ({
  id,
  text:
    typeof value.text === 'string'
      ? value.text
      : typeof value.description === 'string'
        ? value.description
        : '',
  name: typeof value.name === 'string' ? value.name : 'Guest',
  phone: typeof value.phone === 'string' ? value.phone : '',
  userId: typeof value.userId === 'string' ? value.userId : '',
  moderationStatus:
    value.status === 'approved' || value.status === 'rejected'
      ? value.status
      : value.moderationStatus === 'approved' || value.moderationStatus === 'rejected'
        ? value.moderationStatus
        : 'pending',
  submittedForModerationAt:
    typeof value.submittedForModerationAt === 'string'
      ? value.submittedForModerationAt
      : typeof value.createdAt === 'string'
        ? value.createdAt
        : new Date().toISOString(),
  createdAt:
    typeof value.createdAt === 'string'
      ? value.createdAt
      : new Date().toISOString(),
  moderatedAt:
    typeof value.moderatedAt === 'string'
      ? value.moderatedAt
      : undefined,
  moderationReason:
    typeof value.moderationReason === 'string'
      ? value.moderationReason
      : undefined,
  rejectionReason:
    typeof value.rejectionReason === 'string'
      ? value.rejectionReason
      : undefined,
});

const migrateLegacySuggestions = async (): Promise<void> => {
  const requestsSnap = await get(ref(database, 'requests'));
  const raw = requestsSnap.val();
  if (!raw || typeof raw !== 'object') return;

  const legacyEntries = Object.entries(raw as Record<string, Record<string, unknown>>)
    .filter(([, value]) => value?.category === 'app_suggestion');

  for (const [id, value] of legacyEntries) {
    const currentSuggestionSnap = await get(ref(database, `${PATH}/${id}`));
    if (!currentSuggestionSnap.exists()) {
      await set(ref(database, `${PATH}/${id}`), mapLegacySuggestion(id, value));
    }
    await remove(ref(database, `requests/${id}`));
  }
};

export const appSuggestionsService = {
  subscribe(callback: (items: AppSuggestion[]) => void): () => void {
    const listRef = ref(database, PATH);
    const unsubscribe = onValue(listRef, (snapshot) => {
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const items = Object.entries(raw as Record<string, Record<string, unknown>>)
        .map(([id, value]) => mapSuggestion(id, value))
        .reverse();
      callback(items);
    });
    return unsubscribe;
  },

  async getSuggestionsOnce(): Promise<AppSuggestion[]> {
    await migrateLegacySuggestions();
    const snapshot = await get(ref(database, PATH));
    const raw = snapshot.val();
    if (!raw) return [];
    return Object.entries(raw as Record<string, Record<string, unknown>>)
      .map(([id, value]) => mapSuggestion(id, value))
      .reverse();
  },

  async addSuggestion(input: { name?: string; phone?: string; text: string; userId?: string }): Promise<string> {
    const cleanText = sanitizeStoredText(input.text).slice(0, MAX_TEXT_LENGTH);
    if (!cleanText) {
      throw new Error('Invalid suggestion text');
    }
    const resolvedUserId = await resolveSuggestionUserId(input.userId);

    const pendingModeration = createPendingModeration();
    const createdAt = new Date().toISOString();
    const payload = {
      text: cleanText,
      name: sanitizeStoredText(input.name || 'Guest').slice(0, 60),
      phone: sanitizeStoredText(input.phone || '').slice(0, 30),
      userId: resolvedUserId,
      moderationStatus: pendingModeration.moderationStatus,
      submittedForModerationAt: pendingModeration.submittedForModerationAt,
      createdAt,
    };
    const newRef = push(ref(database, PATH));
    await set(ref(database, `${PATH}/${newRef.key}`), payload);
    return newRef.key!;
  },

  async moderateSuggestion(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await update(ref(database, `${PATH}/${id}`), {
      moderationStatus: status,
      moderatedAt: new Date().toISOString(),
      moderationReason: status === 'rejected' ? 'default_rejected' : null,
      rejectionReason: status === 'rejected' ? 'default_rejected' : null,
    });
  },

  async deleteSuggestion(id: string): Promise<void> {
    await remove(ref(database, `${PATH}/${id}`));
  },
};
