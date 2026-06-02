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

export type SupportCategory =
  | 'registration' | 'profile' | 'photo' | 'verification' | 'guarantor'
  | 'requests' | 'moderation' | 'chat' | 'notifications' | 'payment'
  | 'dating' | 'business' | 'osbb' | 'map' | 'privacy'
  | 'bug_report' | 'feature_request' | 'account_delete' | 'language' | 'other';

export interface SupportTicket {
  ticketId: string;
  userId: string;
  userName: string;
  category: SupportCategory;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
  lastAdminMessage: number;
  lastReadByUser: number;
  lastUserMessage: number;
  lastReadByAdmin: number;
}

export interface SupportMessage {
  messageId: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  text: string;
  timestamp: number;
}

const TICKETS_PATH = 'support_tickets';
const MESSAGES_PATH = 'support_messages';

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  registration: 'Реєстрація та вхід',
  profile: 'Редагування профілю',
  photo: 'Завантаження фото',
  verification: 'Верифікація акаунту',
  guarantor: 'Система поручительства',
  requests: 'Створення оголошень',
  moderation: 'Модерація контенту',
  chat: 'Онлайн чат',
  notifications: 'Сповіщення (push)',
  payment: 'Оплата та бонуси',
  dating: 'Знайомства',
  business: 'Бізнес-каталог',
  osbb: 'ОСББ та будинок',
  map: 'Карта та геолокація',
  privacy: 'Приватність та безпека',
  bug_report: 'Помилка в додатку',
  feature_request: 'Пропозиція нової функції',
  account_delete: 'Видалення акаунту',
  language: 'Мова інтерфейсу',
  other: 'Інше питання',
};

export const getCategoryLabel = (key: SupportCategory): string =>
  CATEGORY_LABELS[key] || key;

// ── Helpers ──

const snapshotToTickets = (snap: DataSnapshot): SupportTicket[] => {
  const tickets: SupportTicket[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      tickets.push({ ...data, ticketId: child.key } as SupportTicket);
    }
  });
  return tickets.sort((a, b) => b.updatedAt - a.updatedAt);
};

const snapshotToMessages = (snap: DataSnapshot): SupportMessage[] => {
  const messages: SupportMessage[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      messages.push({ ...data, messageId: child.key } as SupportMessage);
    }
  });
  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

// ── Read ──

export const loadAllTickets = async (): Promise<SupportTicket[]> => {
  const snap = await get(
    query(ref(database, TICKETS_PATH), orderByChild('updatedAt')),
  );
  if (!snap.exists()) return [];
  return snapshotToTickets(snap);
};

export const loadTicketMessages = async (ticketId: string): Promise<SupportMessage[]> => {
  const snap = await get(
    query(ref(database, `${MESSAGES_PATH}/${ticketId}`), orderByChild('timestamp')),
  );
  if (!snap.exists()) return [];
  return snapshotToMessages(snap);
};

// ── Subscriptions ──

export const subscribeToTickets = (
  callback: (tickets: SupportTicket[]) => void,
): Unsubscribe => {
  const q = query(ref(database, TICKETS_PATH), orderByChild('updatedAt'));
  return onValue(q, (snap) => {
    callback(snap.exists() ? snapshotToTickets(snap) : []);
  });
};

export const subscribeToMessages = (
  ticketId: string,
  callback: (messages: SupportMessage[]) => void,
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

export const sendAdminReply = async (ticketId: string, text: string): Promise<void> => {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Not authenticated');

  const now = Date.now();
  const msgRef = push(ref(database, `${MESSAGES_PATH}/${ticketId}`));
  const message: SupportMessage = {
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

export const closeTicket = async (ticketId: string): Promise<void> => {
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    status: 'closed',
    updatedAt: Date.now(),
  });
};

export const markReadByAdmin = async (ticketId: string): Promise<void> => {
  await update(ref(database, `${TICKETS_PATH}/${ticketId}`), {
    lastReadByAdmin: Date.now(),
  });
};

export const hasUnreadFromUser = (ticket: SupportTicket): boolean =>
  ticket.lastUserMessage > ticket.lastReadByAdmin;

// ── Stats ──

export interface SupportStats {
  total: number;
  open: number;
  today: number;
}

export const computeStats = (tickets: SupportTicket[]): SupportStats => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  return {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    today: tickets.filter((t) => t.createdAt >= todayMs).length,
  };
};
