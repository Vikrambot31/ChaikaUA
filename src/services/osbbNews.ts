import { ref, push, update, onValue, query, orderByChild, equalTo, limitToLast, runTransaction, remove } from 'firebase/database';
import { database, auth } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { createPendingModeration, ModerationStatus } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';

export type OsbbNewsPriority = 'urgent' | 'important' | 'info';

export type OsbbNewsItem = {
  id: string;
  priority: OsbbNewsPriority;
  title: string;
  body: string;
  date: string;
  publishedAt?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceType?: 'manual' | 'ai' | 'imported';
  aiGenerated?: boolean;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
  moderatedAt?: string;
  moderatedBy?: string;
  userId?: string;
};

type StoredNews = Omit<OsbbNewsItem, 'id'>;

const PATH = 'osbb_news';

const getNewsTime = (item: Pick<OsbbNewsItem, 'publishedAt' | 'date'>): number => {
  if (item.publishedAt) {
    const publishedTime = new Date(item.publishedAt).getTime();
    if (Number.isFinite(publishedTime)) return publishedTime;
  }

  const displayDateTime = new Date(item.date.split('.').reverse().join('-')).getTime();
  return Number.isFinite(displayDateTime) ? displayDateTime : 0;
};

const mapNews = ([id, data]: [string, StoredNews]): OsbbNewsItem => ({
  id,
  priority: data.priority === 'urgent' || data.priority === 'important' ? data.priority : 'info',
  title: sanitizeStoredText(data.title || ''),
  body: sanitizeStoredText(data.body || ''),
  date: typeof data.date === 'string' ? data.date : new Date().toLocaleDateString('uk-UA'),
  publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : undefined,
  sourceName: typeof data.sourceName === 'string' ? sanitizeStoredText(data.sourceName) : undefined,
  sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : undefined,
  sourceType: data.sourceType === 'manual' || data.sourceType === 'ai' || data.sourceType === 'imported'
    ? data.sourceType
    : undefined,
  aiGenerated: typeof data.aiGenerated === 'boolean' ? data.aiGenerated : undefined,
  moderationStatus: data.moderationStatus,
  submittedForModerationAt: data.submittedForModerationAt,
  moderatedAt: data.moderatedAt,
  moderatedBy: data.moderatedBy,
  userId: data.userId,
});

export const subscribeOsbbNews = (
  buildingId: string | null | undefined,
  callback: (items: OsbbNewsItem[]) => void,
  options: { includePending?: boolean; onError?: (error: Error) => void } = {}
): (() => void) => {
  let disposed = false;

  if (!buildingId) {
    callback([]);
    return () => { disposed = true; };
  }

  const listRef = options.includePending
    ? query(ref(database, `${PATH}/${buildingId}`), orderByChild('publishedAt'), limitToLast(100))
    : query(ref(database, `${PATH}/${buildingId}`), orderByChild('moderationStatus'), equalTo('approved'), limitToLast(100));

  let unsubscribe: (() => void) | undefined;

  void ensureFirebaseAuth().then(() => {
    if (disposed) return;
    unsubscribe = onValue(listRef, (snapshot) => {
      if (disposed) return;
      const raw = snapshot.val();
      if (!raw) {
        callback([]);
        return;
      }
      const items = Object.entries(raw as Record<string, StoredNews>)
        .map((entry) => mapNews(entry as [string, StoredNews]))
        .sort((a, b) => getNewsTime(b) - getNewsTime(a));
      callback(items);
    }, options.onError ? (error) => { if (!disposed) options.onError!(error); } : () => { if (!disposed) callback([]); });
  }).catch(() => { if (!disposed) callback([]); });

  return () => {
    disposed = true;
    unsubscribe?.();
  };
};

export const loadOsbbNews = async (buildingId: string | null | undefined): Promise<OsbbNewsItem[]> => {
  return await new Promise((resolve) => {
    const unsubscribe = subscribeOsbbNews(buildingId, (items) => {
      unsubscribe();
      resolve(items);
    });
  });
};

export const addOsbbNews = async (
  buildingId: string,
  item: Omit<OsbbNewsItem, 'id' | 'date'>
): Promise<string> => {
  const listRef = ref(database, `${PATH}/${buildingId}`);
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const pendingModeration = createPendingModeration();
  const newRef = await push(listRef, {
    priority: item.priority,
    title: sanitizeStoredText(item.title),
    body: sanitizeStoredText(item.body),
    date: new Date().toLocaleDateString('uk-UA'),
    publishedAt: new Date().toISOString(),
    sourceName: item.sourceName ? sanitizeStoredText(item.sourceName) : undefined,
    sourceUrl: item.sourceUrl?.trim() || undefined,
    sourceType: item.sourceType ?? 'manual',
    aiGenerated: item.aiGenerated ?? false,
    moderationStatus: pendingModeration.moderationStatus,
    submittedForModerationAt: pendingModeration.submittedForModerationAt,
    userId: user.uid,
  });
  if (!newRef.key) throw new Error('Firebase push returned no key');
  return newRef.key;
};

export const addAutoOsbbNews = async (
  buildingId: string,
  item: {
    priority: OsbbNewsPriority;
    title: string;
    body: string;
    sourceName?: string;
    sourceUrl?: string;
  }
) => {
  return await addOsbbNews(buildingId, {
    ...item,
    sourceType: 'ai',
    aiGenerated: true,
  });
};

export const updateOsbbNews = async (
  buildingId: string,
  id: string,
  updates: Pick<OsbbNewsItem, 'priority' | 'title' | 'body'>
): Promise<void> => {
  const itemRef = ref(database, `${PATH}/${buildingId}/${id}`);

  await runTransaction(itemRef, (current: StoredNews | null) => {
    if (!current) return current;
    return {
      ...current,
      priority: updates.priority,
      title: sanitizeStoredText(updates.title),
      body: sanitizeStoredText(updates.body),
      ...createPendingModeration(),
    };
  });
};

export const moderateOsbbNews = async (
  buildingId: string,
  id: string,
  status: Exclude<ModerationStatus, 'pending'>
): Promise<void> => {
  const user = auth.currentUser;
  await update(ref(database, `${PATH}/${buildingId}/${id}`), {
    moderationStatus: status,
    moderatedAt: new Date().toISOString(),
    moderatedBy: user?.uid ?? 'moderator',
  });
};

export const deleteOsbbNews = async (
  buildingId: string,
  id: string,
): Promise<void> => {
  await remove(ref(database, `${PATH}/${buildingId}/${id}`));
};
