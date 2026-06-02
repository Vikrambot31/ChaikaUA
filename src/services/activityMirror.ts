import { push, ref } from 'firebase/database';
import { database } from '../firebase-core';

type ActivityPayload = {
  userId: string;
  name: string;
  phone: string;
  category: string;
  group?: string;
  subcategory?: string;
  text: string;
  building?: string;
};

const trimText = (value: string, maxLength: number) => String(value || '').trim().slice(0, maxLength);

export const publishApprovedActivity = async (payload: ActivityPayload): Promise<void> => {
  if (payload.category === 'app_suggestion') {
    return;
  }
  const text = trimText(payload.text, 280);
  const name = trimText(payload.name || 'Chaika', 60);
  const phone = trimText(payload.phone || '', 30);

  if (!payload.userId || !text || !name || !phone) {
    return;
  }

  try {
    await push(ref(database, 'requests'), {
    userId: payload.userId,
    name,
    phone,
    category: trimText(payload.category || 'other', 60),
    group: trimText(payload.group || payload.category || 'activity', 60),
    subcategory: trimText(payload.subcategory || payload.category || 'activity', 80),
    building: trimText(payload.building || 'Чайка', 100),
    text,
    description: text,
    status: 'approved',
    isApproved: true,
    isCensored: false,
    isMirror: true,
    requiresManualModeration: false,
    submittedForModerationAt: new Date().toISOString(),
    moderatedAt: Date.now(),
    timestamp: Date.now(),
    createdAt: Date.now(),
    expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  } catch (e) {
    console.error('[publishApprovedActivity] push failed:', e);
  }
};
