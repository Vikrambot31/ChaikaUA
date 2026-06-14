import {
  ref,
  push,
  get,
  set,
  update,
  query,
  orderByChild,
  limitToLast,
  onValue,
  DataSnapshot,
  Unsubscribe,
} from 'firebase/database';
import { database } from '../firebase-core';
import { requireWriteSession } from '../firebase-auth-session';
import { SupportTicket, SupportMessage, SupportCategory } from '../types/support';
import { MAX_MESSAGE_LENGTH, MOBILE_MESSAGES_LIMIT } from '../constants/supportCategories';

const TICKETS_PATH = 'support_tickets';
const MESSAGES_PATH = 'support_messages';
// Per-user index: /user_support_ticket_ref/{userId} = ticketId | null
// User has direct read/write on own path — no collection-level query needed
const USER_TICKET_REF_PATH = 'user_support_ticket_ref';

// ── Helpers ──

const snapshotToTicket = (snap: DataSnapshot): SupportTicket | null => {
  const data = snap.val();
  if (!data) return null;
  return { ...data, ticketId: snap.key } as SupportTicket;
};

const snapshotToMessages = (snap: DataSnapshot): SupportMessage[] => {
  const messages: SupportMessage[] = [];
  snap.forEach((child) => {
    messages.push({ ...child.val(), messageId: child.key } as SupportMessage);
  });
  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

// ── Read ──

export const getUserOpenTicket = async (userId: string): Promise<SupportTicket | null> => {
  // Read from index to avoid collection-level query
  const idxSnap = await get(ref(database, `${USER_TICKET_REF_PATH}/${userId}`));
  const ticketId = idxSnap.val() as string | null;
  if (!ticketId) return null;

  const ticketSnap = await get(ref(database, `${TICKETS_PATH}/${ticketId}`));
  const ticket = snapshotToTicket(ticketSnap);
  if (!ticket || ticket.status !== 'open') return null;
  return ticket;
};

export const getTicketMessages = async (ticketId: string): Promise<SupportMessage[]> => {
  const snap = await get(
    query(ref(database, `${MESSAGES_PATH}/${ticketId}`), orderByChild('timestamp')),
  );
  if (!snap.exists()) return [];
  return snapshotToMessages(snap);
};

// ── Subscriptions (real-time) ──

export const subscribeToTicketMessages = (
  ticketId: string,
  callback: (messages: SupportMessage[]) => void,
): Unsubscribe => {
  const q = query(
    ref(database, `${MESSAGES_PATH}/${ticketId}`),
    orderByChild('timestamp'),
    limitToLast(MOBILE_MESSAGES_LIMIT),
  );
  return onValue(q, (snap) => {
    callback(snap.exists() ? snapshotToMessages(snap) : []);
  });
};

/**
 * Subscribe to user's active ticket via per-user index.
 * /user_support_ticket_ref/{userId} → ticketId
 * Then reads /support_tickets/{ticketId} directly.
 * No collection-level query → no permission_denied.
 */
export const subscribeToUserTicket = (
  userId: string,
  callback: (ticket: SupportTicket | null) => void,
): Unsubscribe => {
  const indexRef = ref(database, `${USER_TICKET_REF_PATH}/${userId}`);

  // Inner unsub for ticket subscription
  let ticketUnsub: Unsubscribe | null = null;

  const indexUnsub = onValue(
    indexRef,
    (idxSnap) => {
      // Clean up previous ticket subscription
      if (ticketUnsub) {
        ticketUnsub();
        ticketUnsub = null;
      }

      const ticketId = idxSnap.val() as string | null;
      if (!ticketId) {
        callback(null);
        return;
      }

      // Subscribe directly to the ticket by ID
      ticketUnsub = onValue(
        ref(database, `${TICKETS_PATH}/${ticketId}`),
        (ticketSnap) => {
          const ticket = snapshotToTicket(ticketSnap);
          callback(ticket?.status === 'open' ? ticket : null);
        },
        () => {
          // Read error on ticket node — surface as no ticket
          callback(null);
        },
      );
    },
    () => {
      // Read error on index — surface as no ticket, not infinite loading
      callback(null);
    },
  );

  return () => {
    indexUnsub();
    if (ticketUnsub) ticketUnsub();
  };
};

// ── Create ──

export const createTicket = async (
  category: SupportCategory,
  firstMessage: string,
  userName: string,
): Promise<{ ticketId: string }> => {
  const user = await requireWriteSession({
    operation: 'create_ticket',
    screen: 'SupportScreen',
  });
  const userId = user.uid;

  if (firstMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Close any existing open ticket via index
  const existing = await getUserOpenTicket(userId);
  if (existing) {
    await update(ref(database, `${TICKETS_PATH}/${existing.ticketId}`), {
      status: 'closed',
      updatedAt: Date.now(),
    });
  }

  const now = Date.now();

  // Create ticket
  const ticketRef = push(ref(database, TICKETS_PATH));
  const ticketId = ticketRef.key!;
  const ticket: SupportTicket = {
    ticketId,
    userId,
    userName,
    category,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastAdminMessage: 0,
    lastReadByUser: now,
    lastUserMessage: now,
    lastReadByAdmin: 0,
  };
  await set(ticketRef, ticket);

  // Write to per-user index
  await set(ref(database, `${USER_TICKET_REF_PATH}/${userId}`), ticketId);

  // Create first message
  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: SupportMessage = {
    messageId: msgRef.key!,
    ticketId,
    senderId: userId,
    senderRole: 'user',
    text: firstMessage.trim(),
    timestamp: now,
  };
  await set(msgRef, message);

  return { ticketId };
};

// ── Send message ──

export const closeSupportTicketForNewChat = async (ticketId: string): Promise<void> => {
  await requireWriteSession({
    operation: 'open_new_support_chat',
    screen: 'SupportScreen',
  });

  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    status: 'closed',
    updatedAt: Date.now(),
  });
};

export const sendUserMessage = async (
  ticketId: string,
  text: string,
): Promise<void> => {
  const user = await requireWriteSession({
    operation: 'send_message',
    screen: 'SupportScreen',
  });

  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  const now = Date.now();

  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: SupportMessage = {
    messageId: msgRef.key!,
    ticketId,
    senderId: user.uid,
    senderRole: 'user',
    text: text.trim(),
    timestamp: now,
  };
  await set(msgRef, message);

  // Update ticket timestamps
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    status: 'open',
    updatedAt: now,
    lastUserMessage: now,
  });
};

// ── Mark as read ──

export const markTicketReadByUser = async (ticketId: string): Promise<void> => {
  await requireWriteSession({
    operation: 'mark_read',
    screen: 'SupportScreen',
  });
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    lastReadByUser: Date.now(),
  });
};

// ── Check unread ──

export const hasUnreadAdminReply = (ticket: SupportTicket | null): boolean => {
  if (!ticket) return false;
  return ticket.lastAdminMessage > ticket.lastReadByUser;
};
