import { SupportCategory } from '../types/support';

export interface SupportCategoryItem {
  key: SupportCategory;
  labelKey: string;
}

export const SUPPORT_CATEGORIES: SupportCategoryItem[] = [
  { key: 'registration', labelKey: 'support.categories.registration' },
  { key: 'profile', labelKey: 'support.categories.profile' },
  { key: 'photo', labelKey: 'support.categories.photo' },
  { key: 'verification', labelKey: 'support.categories.verification' },
  { key: 'guarantor', labelKey: 'support.categories.guarantor' },
  { key: 'requests', labelKey: 'support.categories.requests' },
  { key: 'moderation', labelKey: 'support.categories.moderation' },
  { key: 'chat', labelKey: 'support.categories.chat' },
  { key: 'notifications', labelKey: 'support.categories.notifications' },
  { key: 'payment', labelKey: 'support.categories.payment' },
  { key: 'dating', labelKey: 'support.categories.dating' },
  { key: 'business', labelKey: 'support.categories.business' },
  { key: 'osbb', labelKey: 'support.categories.osbb' },
  { key: 'map', labelKey: 'support.categories.map' },
  { key: 'privacy', labelKey: 'support.categories.privacy' },
  { key: 'bug_report', labelKey: 'support.categories.bug_report' },
  { key: 'feature_request', labelKey: 'support.categories.feature_request' },
  { key: 'account_delete', labelKey: 'support.categories.account_delete' },
  { key: 'language', labelKey: 'support.categories.language' },
  { key: 'other', labelKey: 'support.categories.other' },
];

export const MAX_MESSAGE_LENGTH = 500;
export const MOBILE_MESSAGES_LIMIT = 10;
export const ADMIN_TICKETS_PAGE_SIZE = 20;
