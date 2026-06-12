import { get, limitToLast, onValue, push, query, ref, serverTimestamp, set, update } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, database, firebaseApp } from '../firebase-core';
import type { Comment } from '../types/app';

const functions = getFunctions(firebaseApp);

export const COMMENTS_PATH = 'request_comments';

export function subscribeComments(
  requestId: string,
  onComments: (comments: Comment[]) => void,
): () => void {
  const commentsQuery = query(
    ref(database, `${COMMENTS_PATH}/${requestId}`),
    limitToLast(50),
  );

  const unsub = onValue(commentsQuery, (snapshot) => {
    const val = snapshot.val();
    if (!val) {
      onComments([]);
      return;
    }
    const currentUid = auth.currentUser?.uid || '';
    const comments: Comment[] = Object.entries(val as Record<string, unknown>)
      .map(([id, data]) => {
        const d = data as Record<string, unknown>;
        return {
          id,
          uid: d.uid as string,
          name: d.name as string,
          text: d.text as string,
          createdAt: d.createdAt as number,
          status: d.status as Comment['status'],
          avatarKey: d.avatarKey as string | undefined,
          aiModeration: d.aiModeration as Comment['aiModeration'],
        };
      })
      .filter((c) => c.status === 'visible' || (c.status === 'pending' && c.uid === currentUid))
      .sort((a, b) => a.createdAt - b.createdAt);

    onComments(comments);
  });

  return unsub;
}

export async function submitComment(
  requestId: string,
  text: string,
  name: string,
  avatarKey?: string,
): Promise<{ commentId: string }> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('auth_required');
  }

  const commentsRef = ref(database, `${COMMENTS_PATH}/${requestId}`);
  const newCommentRef = push(commentsRef);
  const commentId = newCommentRef.key!;

  const comment: Record<string, unknown> = {
    uid: user.uid,
    name,
    text,
    createdAt: serverTimestamp(),
    status: 'pending',
  };
  if (avatarKey) {
    comment.avatarKey = avatarKey;
  }

  await set(newCommentRef, comment);

  try {
    const callable = httpsCallable<{ requestId: string; commentId: string }, { status: string }>(
      functions,
      'moderateComment',
    );
    await callable({ requestId, commentId });
  } catch {
    // fail-open: if AI moderation is unavailable, make comment visible immediately
    await update(ref(database, `${COMMENTS_PATH}/${requestId}/${commentId}`), {
      status: 'visible',
      aiModeration: null,
    });
  }

  return { commentId };
}

export async function getCommentersForRequest(requestId: string): Promise<{ uid: string; name: string; avatarKey?: string; text: string }[]> {
  const commentsRef = ref(database, `${COMMENTS_PATH}/${requestId}`);
  const snapshot = await get(commentsRef);
  const val = snapshot.val();
  if (!val) return [];

  const seen = new Map<string, { uid: string; name: string; avatarKey?: string; text: string }>();

  Object.values(val as Record<string, unknown>).forEach((d) => {
    const data = d as { uid: string; name: string; text: string; status: string; avatarKey?: string };
    if (data.status === 'visible' && data.uid && !seen.has(data.uid)) {
      seen.set(data.uid, {
        uid: data.uid,
        name: data.name,
        avatarKey: data.avatarKey,
        text: data.text.slice(0, 60),
      });
    }
  });

  return Array.from(seen.values());
}
