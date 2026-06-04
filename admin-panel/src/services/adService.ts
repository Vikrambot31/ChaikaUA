import {
  ref,
  get,
  set,
  push,
  update,
  query,
  orderByChild,
  limitToLast,
  onValue,
  type Unsubscribe,
  type DataSnapshot,
} from 'firebase/database';
import { database, auth } from '../firebase/firebase';

// ── Types ──

export type AdCategory =
  | 'pricing' | 'placement' | 'promo_credits' | 'subscription'
  | 'promotion' | 'partnership' | 'billing' | 'other';

export interface AdTicket {
  ticketId: string;
  userId: string;
  userName: string;
  category: AdCategory;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
  lastAdminMessage: number;
  lastReadByUser: number;
  lastUserMessage: number;
  lastReadByAdmin: number;
}

export interface AdMessage {
  messageId: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  text: string;
  timestamp: number;
}

const TICKETS_PATH = 'ad_tickets';
const MESSAGES_PATH = 'ad_messages';

const CATEGORY_LABELS: Record<AdCategory, string> = {
  pricing: 'Ціни та тарифи',
  placement: 'Розміщення реклами',
  promo_credits: 'Промо-кредити',
  subscription: 'Підписки',
  promotion: 'Просування анкети/послуг',
  partnership: 'Партнерство',
  billing: 'Рахунки та оплата',
  other: 'Інше питання',
};

export const getAdCategoryLabel = (key: AdCategory): string =>
  CATEGORY_LABELS[key] || key;

// ── Helpers ──

const snapshotToTickets = (snap: DataSnapshot): AdTicket[] => {
  const tickets: AdTicket[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      tickets.push({ ...data, ticketId: child.key } as AdTicket);
    }
  });
  return tickets.sort((a, b) => b.updatedAt - a.updatedAt);
};

const snapshotToMessages = (snap: DataSnapshot): AdMessage[] => {
  const messages: AdMessage[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      messages.push({ ...data, messageId: child.key } as AdMessage);
    }
  });
  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

// ── Read ──

export const loadAllAdTickets = async (): Promise<AdTicket[]> => {
  const snap = await get(
    query(ref(database, TICKETS_PATH), orderByChild('updatedAt')),
  );
  if (!snap.exists()) return [];
  return snapshotToTickets(snap);
};

export const loadAdTicketMessages = async (ticketId: string): Promise<AdMessage[]> => {
  const snap = await get(
    query(ref(database, `${MESSAGES_PATH}/${ticketId}`), orderByChild('timestamp')),
  );
  if (!snap.exists()) return [];
  return snapshotToMessages(snap);
};

// ── Subscriptions ──

export const subscribeToAdTickets = (
  callback: (tickets: AdTicket[]) => void,
): Unsubscribe => {
  const q = query(ref(database, TICKETS_PATH), orderByChild('updatedAt'));
  return onValue(q, (snap) => {
    callback(snap.exists() ? snapshotToTickets(snap) : []);
  });
};

export const subscribeToAdMessages = (
  ticketId: string,
  callback: (messages: AdMessage[]) => void,
): Unsubscribe => {
  const q = query(
    ref(database, `${MESSAGES_PATH}/${ticketId}`),
    orderByChild('timestamp'),
  );
  return onValue(q, (snap) => {
    callback(snap.exists() ? snapshotToMessages(snap) : []);
  });
};

// ── Admin actions ──

export const sendAdAdminReply = async (ticketId: string, text: string): Promise<void> => {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Not authenticated');

  const now = Date.now();
  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: AdMessage = {
    messageId: msgRef.key!,
    ticketId,
    senderId: `admin_${adminUid}`,
    senderRole: 'admin',
    text: text.trim(),
    timestamp: now,
  };
  await set(msgRef, message);

  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    updatedAt: now,
    lastAdminMessage: now,
  });
};

export const closeAdTicket = async (ticketId: string): Promise<void> => {
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    status: 'closed',
    updatedAt: Date.now(),
  });
};

export const markAdReadByAdmin = async (ticketId: string): Promise<void> => {
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    lastReadByAdmin: Date.now(),
  });
};

export const hasAdUnreadFromUser = (ticket: AdTicket): boolean =>
  ticket.lastUserMessage > ticket.lastReadByAdmin;

// ── Stats ──

export interface AdStats {
  total: number;
  open: number;
  today: number;
}

export const computeAdStats = (tickets: AdTicket[]): AdStats => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  return {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    today: tickets.filter((t) => t.createdAt >= todayMs).length,
  };
};
