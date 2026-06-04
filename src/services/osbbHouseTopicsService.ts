import { ref, push, onValue, query, orderByChild, limitToLast, runTransaction } from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { ModerationStatus, createPendingModeration } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';

export interface OsbbHouseTopic {
  id: string;
  title: string;
  votes: number;
  createdAt: string;
  createdBy: string;
  hasVoted: boolean;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
}

type StoredTopic = {
  title?: string;
  votes?: number;
  createdAt?: string;
  createdBy?: string;
  voterIds?: Record<string, boolean>;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
};

const PATH = 'osbb_house_topics';

export const normalizeHouseTopicTitle = (value: string): string =>
  sanitizeStoredText(value).toLowerCase();

export const subscribeApprovedHouseTopics = (
  buildingId: string | null | undefined,
  currentUserId: string | null | undefined,
  callback: (items: OsbbHouseTopic[]) => void
): (() => void) => {
  if (!buildingId) {
    callback([]);
    return () => {};
  }

  const listRef = query(ref(database, `${PATH}/${buildingId}`), orderByChild('createdAt'), limitToLast(100));

  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  void ensureFirebaseAuth().then(() => {
    if (disposed) return;
    unsubscribe = onValue(listRef, (snapshot) => {
      if (disposed) return;
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const items: OsbbHouseTopic[] = Object.entries(raw as Record<string, StoredTopic>)
        .map(([id, data]) => ({
          id,
          title: sanitizeStoredText(data.title || ''),
          votes: typeof data.votes === 'number' ? data.votes : 0,
          createdAt: data.createdAt || '',
          createdBy: data.createdBy || '',
          hasVoted: currentUserId ? Boolean(data.voterIds?.[currentUserId]) : false,
          moderationStatus: data.moderationStatus,
          submittedForModerationAt: data.submittedForModerationAt,
        }))
        .filter((item) => item.moderationStatus === 'approved')
        .sort((a, b) => b.votes - a.votes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    }, () => { if (!disposed) callback([]); });
  }).catch(() => { if (!disposed) callback([]); });

  return () => {
    disposed = true;
    unsubscribe?.();
  };
};

export const addHouseTopicForModeration = async (
  buildingId: string,
  payload: { title: string; createdBy: string }
): Promise<string> => {
  const listRef = ref(database, `${PATH}/${buildingId}`);
  const newRef = await push(listRef, {
    title: sanitizeStoredText(payload.title),
    votes: 0,
    voterIds: {},
    createdAt: new Date().toISOString(),
    createdBy: payload.createdBy,
    ...createPendingModeration(),
  });

  return newRef.key!;
};

export const supportHouseTopic = async (
  buildingId: string,
  topicId: string,
  userId: string
): Promise<void> => {
  const topicRef = ref(database, `${PATH}/${buildingId}/${topicId}`);
  let transactionError: Error | null = null;

  const result = await runTransaction(topicRef, (current: StoredTopic | null) => {
    if (!current) {
      transactionError = new Error('topic-not-found');
      return current;
    }

    if (current.moderationStatus !== 'approved') {
      transactionError = new Error('topic-not-approved');
      return current;
    }

    if (current.voterIds?.[userId]) {
      transactionError = new Error('already-voted');
      return current;
    }

    return {
      ...current,
      votes: (typeof current.votes === 'number' ? current.votes : 0) + 1,
      voterIds: {
        ...(current.voterIds || {}),
        [userId]: true,
      },
    };
  });

  if (transactionError) {
    throw transactionError;
  }

  if (!result.committed) {
    throw new Error('topic-vote-not-committed');
  }
};
