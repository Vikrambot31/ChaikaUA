import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { database, firebaseApp } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';

export type OsbbVoteStatus = 'active' | 'closed';
export type OsbbVoteOptionKey = 'yes' | 'no';

export interface OsbbVoteOption {
  id: string;
  labelKey: OsbbVoteOptionKey;
  votes: number;
}

export interface OsbbVoteItem {
  id: string;
  status: OsbbVoteStatus;
  title: string;
  question: string;
  options: OsbbVoteOption[];
  deadline: string;
  totalApartments: number;
  hasVoted: boolean;
  selectedOptionId: string | null;
  createdAt: string;
  createdBy: string;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
}

type StoredVote = {
  status?: OsbbVoteStatus;
  title?: string;
  question?: string;
  options?: Array<Partial<OsbbVoteOption>>;
  deadline?: string;
  totalApartments?: number;
  voterIds?: Record<string, string>;
  createdAt?: string;
  createdBy?: string;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
};

const PATH = 'osbb_votes';

const normalizeOptionKey = (value: unknown): OsbbVoteOptionKey =>
  value === 'no' ? 'no' : 'yes';

const normalizeOptions = (options: StoredVote['options']): OsbbVoteOption[] => {
  if (!Array.isArray(options)) {
    return [
      { id: 'yes', labelKey: 'yes', votes: 0 },
      { id: 'no', labelKey: 'no', votes: 0 },
    ];
  }

  return options.map((option, index): OsbbVoteOption => ({
    id: typeof option?.id === 'string' ? option.id : `option-${index}`,
    labelKey: normalizeOptionKey(option?.labelKey),
    votes: typeof option?.votes === 'number' ? option.votes : 0,
  }));
};

const normalizeStatus = (status: OsbbVoteStatus | undefined, deadline: string): OsbbVoteStatus => {
  if (status === 'closed') {
    return 'closed';
  }

  return new Date(deadline).getTime() <= Date.now() ? 'closed' : 'active';
};

export const normalizeOsbbVote = (
  id: string,
  data: StoredVote,
  currentUserId: string | null | undefined
): OsbbVoteItem => {
  const title = sanitizeStoredText(data.title || '');
  const question = sanitizeStoredText(data.question || title);
  const deadline = typeof data.deadline === 'string'
    ? data.deadline
    : new Date(Date.now() + 7 * 86_400_000).toISOString();
  const status = normalizeStatus(data.status, deadline);
  const voterIds = data.voterIds || {};
  const selectedOptionId = currentUserId ? voterIds[currentUserId] || null : null;

  return {
    id,
    status,
    title,
    question,
    options: normalizeOptions(data.options),
    deadline,
    totalApartments: typeof data.totalApartments === 'number' ? data.totalApartments : 0,
    hasVoted: selectedOptionId !== null,
    selectedOptionId,
    createdAt: data.createdAt || '',
    createdBy: data.createdBy || '',
    moderationStatus: data.moderationStatus,
    submittedForModerationAt: data.submittedForModerationAt,
  };
};

export const getOsbbVoteBlockReason = (
  vote: Pick<StoredVote, 'status' | 'deadline' | 'voterIds' | 'options'> | null,
  userId: string,
  optionId: string
): 'vote-not-found' | 'vote-closed' | 'already-voted' | 'invalid-option' | null => {
  if (!vote) return 'vote-not-found';

  const deadline = typeof vote.deadline === 'string' ? vote.deadline : '';
  if (normalizeStatus(vote.status, deadline) === 'closed') return 'vote-closed';
  if (vote.voterIds?.[userId]) return 'already-voted';

  const options = Array.isArray(vote.options) ? vote.options : [];
  return options.some((option) => option?.id === optionId) ? null : 'invalid-option';
};

export const osbbVotingService = {
  subscribe(
    buildingId: string | null | undefined,
    currentUserId: string | null | undefined,
    callback: (items: OsbbVoteItem[]) => void
  ): () => void {
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
        const items: OsbbVoteItem[] = Object.entries(raw as Record<string, StoredVote>)
          .map(([id, data]) => normalizeOsbbVote(id, data, currentUserId))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(items);
      }, () => { if (!disposed) callback([]); });
    }).catch(() => { if (!disposed) callback([]); });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  },

  async addVote(
    buildingId: string,
    payload: {
      title: string;
      question: string;
      createdBy: string;
      totalApartments?: number;
    }
  ): Promise<string> {
    const callable = httpsCallable<
      { buildingId: string; title: string; question: string; totalApartments?: number },
      { id: string | null }
    >(getFunctions(firebaseApp), 'addOsbbVote');
    const result = await callable({
      buildingId,
      title: sanitizeStoredText(payload.title),
      question: sanitizeStoredText(payload.question),
      totalApartments: payload.totalApartments ?? 0,
    });

    if (!result.data.id) {
      throw new Error('vote-create-failed');
    }

    return result.data.id;
  },

  async castVote(buildingId: string, voteId: string, userId: string, optionId: string): Promise<void> {
    if (!userId) {
      throw new Error('unauthenticated');
    }

    const callable = httpsCallable<
      { buildingId: string; voteId: string; optionId: string },
      { ok: boolean }
    >(getFunctions(firebaseApp), 'castOsbbVote');

    try {
      await callable({ buildingId, voteId, optionId });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
      const message = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';

      const known = ['already-voted', 'vote-not-approved', 'vote-closed', 'invalid-option', 'vote-not-found', 'vote-not-committed'];
      for (const token of known) {
        if (code.includes(token) || message.toLowerCase().includes(token)) {
          throw new Error(token);
        }
      }
      throw error instanceof Error ? error : new Error('vote-call-failed');
    }
  },
};
