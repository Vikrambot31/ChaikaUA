import {
  ref,
  push,
  get,
  set,
  update,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  onValue,
  DataSnapshot,
  Unsubscribe,
} from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { SupportTicket, SupportMessage, SupportCategory } from '../types/support';
import { MAX_MESSAGE_LENGTH, MOBILE_MESSAGES_LIMIT } from '../constants/supportCategories';

const TICKETS_PATH = 'support_tickets';
const MESSAGES_PATH = 'support_messages';

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
  const q = query(
    ref(database, TICKETS_PATH),
    orderByChild('userId'),
    equalTo(userId),
  );
  const snap = await get(q);
  if (!snap.exists()) return null;

  let openTicket: SupportTicket | null = null;
  snap.forEach((child) => {
    const ticket = snapshotToTicket(child);
    if (ticket && ticket.status === 'open') {
      openTicket = ticket;
    }
  });
  return openTicket;
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

export const subscribeToUserTicket = (
  userId: string,
  callback: (ticket: SupportTicket | null) => void,
): Unsubscribe => {
  const q = query(
    ref(database, TICKETS_PATH),
    orderByChild('userId'),
    equalTo(userId),
  );
  return onValue(q, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    let latest: SupportTicket | null = null;
    snap.forEach((child) => {
      const ticket = snapshotToTicket(child);
      if (ticket && ticket.status === 'open') {
        latest = ticket;
      }
    });
    callback(latest);
  });
};

// ── Create ──

export const createTicket = async (
  category: SupportCategory,
  firstMessage: string,
  userName: string,
): Promise<{ ticketId: string }> => {
  const user = await ensureFirebaseAuth();
  const userId = user.uid;

  if (firstMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Close any existing open ticket
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

export const sendUserMessage = async (
  ticketId: string,
  text: string,
): Promise<void> => {
  const user = await ensureFirebaseAuth();

  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Verify ticket is open
  const ticketSnap = await get(ref(database, `${TICKETS_PATH}/${ticketId}/status`));
  if (ticketSnap.val() !== 'open') {
    throw new Error('Ticket is closed');
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
    updatedAt: now,
    lastUserMessage: now,
  });
};

// ── Mark as read ──

export const markTicketReadByUser = async (ticketId: string): Promise<void> => {
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    lastReadByUser: Date.now(),
  });
};

// ── Check unread ──

export const hasUnreadAdminReply = (ticket: SupportTicket | null): boolean => {
  if (!ticket) return false;
  return ticket.lastAdminMessage > ticket.lastReadByUser;
};
