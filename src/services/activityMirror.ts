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
  photoUri?: string;
  photoStoragePath?: string;
  sourceItemId?: string;
  sourceType?: string;
  sourceCategory?: string;
  sourceTitle?: string;
  sourceDescription?: string;
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
    const photoStoragePath = trimText(payload.photoStoragePath || payload.photoUri || '', 500);
    const photoUri = payload.photoStoragePath ? '' : trimText(payload.photoUri || '', 500);

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
    ...(photoStoragePath || photoUri ? { photoStoragePath, photoUri } : {}),
    ...(payload.sourceItemId ? { sourceItemId: trimText(payload.sourceItemId, 120) } : {}),
    ...(payload.sourceType ? { sourceType: trimText(payload.sourceType, 80) } : {}),
    ...(payload.sourceCategory ? { sourceCategory: trimText(payload.sourceCategory, 120) } : {}),
    ...(payload.sourceTitle ? { sourceTitle: trimText(payload.sourceTitle, 160) } : {}),
    ...(payload.sourceDescription ? { sourceDescription: trimText(payload.sourceDescription, 280) } : {}),
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
