// =============================================================
//  AI Feedback Service — disagreement logging + accuracy stats
// =============================================================

import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

export type Disagreement = {
  itemPath: string;
  section: string;
  textTruncated: string;
  aiVerdict: string;
  aiConfidence: number;
  humanAction: 'approved' | 'rejected';
  moderatorUid: string;
  timestamp: number;
};

export type AiAccuracyStats = {
  totalDecisions: number;
  agreements: number;
  disagreements: number;
  accuracy: number;
};

export type AiBudgetUsage = {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  provider: string;
  model: string;
};

/**
 * Логирует расхождение AI-вердикта с решением модератора.
 * Вызывается только когда AI дал один вердикт, а модератор принял другое решение.
 */
export async function logDisagreement(data: Disagreement): Promise<void> {
  if (LOCAL_MODE) {
    console.log('[LOCAL_MODE] AI disagreement:', data);
    return;
  }
  if (!functions) return;
  const fn = httpsCallable(functions, 'logAiDisagreement');
  await fn(data);
}

/**
 * Получает статистику точности AI за период.
 */
export async function fetchAiAccuracy(periodDays = 30): Promise<AiAccuracyStats> {
  if (LOCAL_MODE) {
    return { totalDecisions: 0, agreements: 0, disagreements: 0, accuracy: 0 };
  }
  if (!functions) return { totalDecisions: 0, agreements: 0, disagreements: 0, accuracy: 0 };
  const fn = httpsCallable<{ periodDays: number }, AiAccuracyStats>(functions, 'getAiAccuracyStats');
  const result = await fn({ periodDays });
  return result.data;
}

/**
 * Получает текущее использование бюджета AI.
 */
export async function fetchAiBudgetUsage(): Promise<AiBudgetUsage> {
  if (LOCAL_MODE) {
    return { dailyUsed: 0, dailyLimit: 5000, monthlyUsed: 0, monthlyLimit: 100000, provider: 'mock', model: 'mock' };
  }
  if (!functions) return { dailyUsed: 0, dailyLimit: 0, monthlyUsed: 0, monthlyLimit: 0, provider: '', model: '' };
  const fn = httpsCallable<void, AiBudgetUsage>(functions, 'getAiBudgetUsage');
  const result = await fn();
  return result.data;
}
