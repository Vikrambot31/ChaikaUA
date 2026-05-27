export type ImageSafetyStatus = 'pending' | 'passed' | 'manual_reviewed' | 'blocked';

export interface ImageSafetyResult {
  status: ImageSafetyStatus;
  reason: string;
}

export async function preflightImageSafety(_localUri: string): Promise<ImageSafetyResult> {
  return { status: 'pending', reason: 'awaiting_moderator_safety_review' };
}

export const canPublishImage = (status?: string): boolean =>
  status === 'passed' || status === 'manual_reviewed';
