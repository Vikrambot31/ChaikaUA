import {
  DataSnapshot,
  Unsubscribe,
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
} from 'firebase/database';
import { database } from '../firebase-core';
import { requireWriteSession } from '../firebase-auth-session';
import type { AdMessage, AdTicket, AdTicketCategory } from '../types/ad';

const TICKETS_PATH = 'ad_tickets';
const MESSAGES_PATH = 'ad_messages';
const USER_TICKET_REF_PATH = 'ad_ticket_ref';
const MAX_AD_MESSAGE_LENGTH = 500;
const MOBILE_AD_MESSAGES_LIMIT = 80;

const snapshotToTicket = (snap: DataSnapshot): AdTicket | null => {
  const data = snap.val();
  if (!data) return null;
  return { ...data, ticketId: snap.key } as AdTicket;
};

const snapshotToMessages = (snap: DataSnapshot): AdMessage[] => {
  const messages: AdMessage[] = [];
  snap.forEach((child) => {
    messages.push({ ...child.val(), messageId: child.key } as AdMessage);
  });
  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

export const getUserOpenAdTicket = async (userId: string): Promise<AdTicket | null> => {
  const idxSnap = await get(ref(database, `${USER_TICKET_REF_PATH}/${userId}`));
  const ticketId = idxSnap.val() as string | null;
  if (!ticketId) return null;

  const ticketSnap = await get(ref(database, `${TICKETS_PATH}/${ticketId}`));
  const ticket = snapshotToTicket(ticketSnap);
  if (!ticket || ticket.status !== 'open') return null;
  return ticket;
};

export const subscribeToUserAdTicket = (
  userId: string,
  callback: (ticket: AdTicket | null) => void,
): Unsubscribe => {
  const indexRef = ref(database, `${USER_TICKET_REF_PATH}/${userId}`);
  let ticketUnsub: Unsubscribe | null = null;

  const indexUnsub = onValue(
    indexRef,
    (idxSnap) => {
      if (ticketUnsub) {
        ticketUnsub();
        ticketUnsub = null;
      }

      const ticketId = idxSnap.val() as string | null;
      if (!ticketId) {
        callback(null);
        return;
      }

      ticketUnsub = onValue(
        ref(database, `${TICKETS_PATH}/${ticketId}`),
        (ticketSnap) => callback(snapshotToTicket(ticketSnap)),
        () => callback(null),
      );
    },
    () => callback(null),
  );

  return () => {
    indexUnsub();
    if (ticketUnsub) ticketUnsub();
  };
};

export const subscribeToAdMessages = (
  ticketId: string,
  callback: (messages: AdMessage[]) => void,
): Unsubscribe => {
  const q = query(
    ref(database, `${MESSAGES_PATH}/${ticketId}`),
    orderByChild('timestamp'),
    limitToLast(MOBILE_AD_MESSAGES_LIMIT),
  );
  return onValue(q, (snap) => {
    callback(snap.exists() ? snapshotToMessages(snap) : []);
  }, (error) => {
    console.error('[subscribeToAdMessages] RTDB error:', error.message);
    callback([]);
  });
};

export const subscribeToAllAdTickets = (
  callback: (tickets: AdTicket[]) => void,
): Unsubscribe => {
  const q = query(ref(database, TICKETS_PATH), orderByChild('updatedAt'), limitToLast(100));
  return onValue(q, (snap) => {
    const tickets: AdTicket[] = [];
    snap.forEach((child) => {
      const ticket = snapshotToTicket(child);
      if (ticket) tickets.push(ticket);
    });
    tickets.sort((a, b) => b.updatedAt - a.updatedAt);
    callback(tickets);
  }, (error) => {
    console.error('[subscribeToAllAdTickets] RTDB error:', error.message);
    callback([]);
  });
};

export const createAdTicket = async ({
  category,
  firstMessage,
  userName,
  requestedCredits,
  expectedAmount,
  currency = 'UAH',
  packageId,
}: {
  category: AdTicketCategory;
  firstMessage: string;
  userName: string;
  requestedCredits?: number;
  expectedAmount?: number;
  currency?: string;
  packageId?: string;
}): Promise<{ ticketId: string }> => {
  const user = await requireWriteSession({
    operation: 'create_ad_ticket',
    screen: 'PromoCreditsTopupScreen',
  });
  const userId = user.uid;

  if (firstMessage.length > MAX_AD_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_AD_MESSAGE_LENGTH} characters`);
  }

  const existing = await getUserOpenAdTicket(userId);
  if (existing) {
    await update(ref(database, `${TICKETS_PATH}/${existing.ticketId}`), {
      status: 'closed',
      updatedAt: Date.now(),
    });
  }

  const now = Date.now();
  const ticketRef = push(ref(database, TICKETS_PATH));
  const ticketId = ticketRef.key!;
  const ticket: AdTicket = {
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
    requestedCredits,
    expectedAmount,
    currency,
    packageId,
  };

  await set(ticketRef, ticket);
  await set(ref(database, `${USER_TICKET_REF_PATH}/${userId}`), ticketId);

  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: AdMessage = {
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

export const sendAdUserMessage = async (ticketId: string, text: string): Promise<void> => {
  const user = await requireWriteSession({
    operation: 'send_ad_message',
    screen: 'PromoCreditsTopupScreen',
  });

  if (text.length > MAX_AD_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds ${MAX_AD_MESSAGE_LENGTH} characters`);
  }

  const now = Date.now();
  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: AdMessage = {
    messageId: msgRef.key!,
    ticketId,
    senderId: user.uid,
    senderRole: 'user',
    text: text.trim(),
    timestamp: now,
  };

  await set(msgRef, message);
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    status: 'open',
    updatedAt: now,
    lastUserMessage: now,
  });
};

export const markAdTicketReadByUser = async (ticketId: string): Promise<void> => {
  await requireWriteSession({
    operation: 'mark_ad_ticket_read',
    screen: 'PromoCreditsTopupScreen',
  });
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    lastReadByUser: Date.now(),
  });
};

export const hasUnreadAdAdminReply = (ticket: AdTicket | null): boolean => {
  if (!ticket) return false;
  return ticket.lastAdminMessage > ticket.lastReadByUser;
};

export const MAX_AD_MESSAGE_LENGTH_VALUE = MAX_AD_MESSAGE_LENGTH;
