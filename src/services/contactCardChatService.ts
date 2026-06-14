import { get, limitToLast, onValue, query, ref } from 'firebase/database';
import { CONTACT_COMMENTS_PATH, submitComment } from './commentService';
import { database } from '../firebase-core';
import type { Comment } from '../types/app';

export const CONTACT_CARD_FREE_MESSAGE_LIMIT = 10;
export const CONTACT_CARD_PREMIUM_MESSAGE_LIMIT = 500;
export const CONTACT_CARD_AUTO_DELETE_DAYS = 30;

const FIREBASE_KEY_UNSAFE = /[.#$[\]/]/g;

export const buildContactCardChatId = (
  targetUserId: string,
  requesterId: string,
  sourceId?: string,
): string => {
  const sourceKey = sourceId?.trim() || 'profile_request';
  return [targetUserId, requesterId, sourceKey]
    .map((part) => part.trim().replace(FIREBASE_KEY_UNSAFE, '_'))
    .join('__');
};

export const getContactCardMessageLimit = (isPremium: boolean): number =>
  isPremium ? CONTACT_CARD_PREMIUM_MESSAGE_LIMIT : CONTACT_CARD_FREE_MESSAGE_LIMIT;

const normalizeComment = (id: string, data: Record<string, unknown>): Comment => ({
  id,
  uid: typeof data.uid === 'string' ? data.uid : '',
  name: typeof data.name === 'string' ? data.name : '',
  text: typeof data.text === 'string' ? data.text : '',
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
  status: data.status === 'hidden' || data.status === 'pending' ? data.status : 'visible',
  avatarKey: typeof data.avatarKey === 'string' ? data.avatarKey : undefined,
  aiModeration: (data.aiModeration as Comment['aiModeration']) ?? null,
});

export function subscribeContactCardMessages(
  chatId: string,
  currentUid: string,
  onMessages: (messages: Comment[], totalCount: number) => void,
): () => void {
  const messagesQuery = query(
    ref(database, `${CONTACT_COMMENTS_PATH}/${chatId}`),
    limitToLast(CONTACT_CARD_PREMIUM_MESSAGE_LIMIT),
  );

  return onValue(messagesQuery, (snapshot) => {
    const val = snapshot.val();
    if (!val) {
      onMessages([], 0);
      return;
    }

    const all = Object.entries(val as Record<string, Record<string, unknown>>)
      .map(([id, data]) => normalizeComment(id, data))
      .sort((a, b) => a.createdAt - b.createdAt);
    const visible = all.filter((item) => item.status === 'visible' || (item.status === 'pending' && item.uid === currentUid));
    onMessages(visible, all.length);
  });
}

export async function countContactCardMessages(chatId: string): Promise<number> {
  const snapshot = await get(ref(database, `${CONTACT_COMMENTS_PATH}/${chatId}`));
  if (!snapshot.exists()) return 0;
  return Object.keys((snapshot.val() as Record<string, unknown>) ?? {}).length;
}

export async function sendContactCardMessage(
  chatId: string,
  text: string,
  senderName: string,
  isPremium: boolean,
  avatarKey?: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('empty_message');
  }
  if (trimmed.length > 500) {
    throw new Error('message_too_long');
  }

  const currentCount = await countContactCardMessages(chatId);
  const limit = getContactCardMessageLimit(isPremium);
  if (currentCount >= limit) {
    throw new Error('message_limit_reached');
  }

  await submitComment(chatId, trimmed, senderName, avatarKey, CONTACT_COMMENTS_PATH);
}
