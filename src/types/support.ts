export type SupportCategory =
  | 'registration'
  | 'profile'
  | 'photo'
  | 'verification'
  | 'guarantor'
  | 'requests'
  | 'moderation'
  | 'chat'
  | 'notifications'
  | 'payment'
  | 'dating'
  | 'business'
  | 'osbb'
  | 'map'
  | 'privacy'
  | 'bug_report'
  | 'feature_request'
  | 'account_delete'
  | 'language'
  | 'other';

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
