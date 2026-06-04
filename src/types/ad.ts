export type AdTicketCategory = 'promo_topup' | 'promotion' | 'other';

export interface AdTicket {
  ticketId: string;
  userId: string;
  userName: string;
  category: AdTicketCategory;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
  lastAdminMessage: number;
  lastReadByUser: number;
  lastUserMessage: number;
  lastReadByAdmin: number;
  requestedCredits?: number;
  expectedAmount?: number;
  currency?: string;
  packageId?: string;
}

export interface AdMessage {
  messageId: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  text: string;
  timestamp: number;
}
