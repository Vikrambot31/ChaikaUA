// =============================================================
//  AI Config Service — чтение/запись конфигурации AI из RTDB
// =============================================================

import { getDatabase, ref, get, set, onValue, off } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
import type { AiConfig, AiTestResult, AiLogEntry } from '../types/ai-config';
import { DEFAULT_AI_CONFIG } from '../types/ai-config';

const AI_CONFIG_PATH = 'ai_config';
const AI_LOG_PATH = 'ops/ai_analysis';
const AI_USAGE_PATH = 'ops/ai_usage/_meta';

// ---- Load / Save config ----

export async function loadAiConfig(): Promise<AiConfig> {
  if (LOCAL_MODE) return { ...DEFAULT_AI_CONFIG };
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, AI_CONFIG_PATH));
  if (!snap.exists()) return { ...DEFAULT_AI_CONFIG };
  const val = snap.val() as Partial<AiConfig>;
  return {
    ...DEFAULT_AI_CONFIG,
    ...val,
    autonomous: { ...DEFAULT_AI_CONFIG.autonomous, ...(val.autonomous || {}) },
    thresholds: { ...DEFAULT_AI_CONFIG.thresholds, ...(val.thresholds || {}) },
  };
}

export async function saveAiConfig(config: AiConfig, adminUid: string): Promise<void> {
  if (LOCAL_MODE) return;
  const db = getDatabase(firebaseApp);
  await set(ref(db, AI_CONFIG_PATH), {
    ...config,
    updatedAt: Date.now(),
    updatedBy: adminUid,
  });
}

export function subscribeToAiConfig(callback: (config: AiConfig) => void): () => void {
  if (LOCAL_MODE) {
    callback({ ...DEFAULT_AI_CONFIG });
    return () => {};
  }
  const db = getDatabase(firebaseApp);
  const configRef = ref(db, AI_CONFIG_PATH);
  const listener = onValue(configRef, (snap) => {
    if (!snap.exists()) {
      callback({ ...DEFAULT_AI_CONFIG });
      return;
    }
    const val = snap.val() as Partial<AiConfig>;
    callback({
      ...DEFAULT_AI_CONFIG,
      ...val,
      autonomous: { ...DEFAULT_AI_CONFIG.autonomous, ...(val.autonomous || {}) },
      thresholds: { ...DEFAULT_AI_CONFIG.thresholds, ...(val.thresholds || {}) },
    });
  });
  return () => off(configRef, 'value', listener);
}

// ---- Test connection ----

export async function testAiConnection(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl: string,
): Promise<AiTestResult> {
  if (LOCAL_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    return { success: true, provider, model, tokensUsed: 12, latencyMs: 400 };
  }
  try {
    const functions = getFunctions(firebaseApp);
    const callable = httpsCallable<
      { provider: string; apiKey: string; model: string; baseUrl: string },
      AiTestResult
    >(functions, 'adminTestAiConfig');
    const result = await callable({ provider, apiKey, model, baseUrl });
    return result.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, provider, model, error: msg };
  }
}

// ---- Usage stats ----

export type AiUsageStats = {
  dailyTotal: number;
  monthlyTotal: number;
  dailyDate: string;
  monthlyDate: string;
  minuteTotal: number;
};

export async function loadAiUsageStats(): Promise<AiUsageStats | null> {
  if (LOCAL_MODE) return null;
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, AI_USAGE_PATH));
  return snap.exists() ? (snap.val() as AiUsageStats) : null;
}

// ---- AI log ----

export async function loadAiLog(limit = 50): Promise<AiLogEntry[]> {
  if (LOCAL_MODE) return [];
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, AI_LOG_PATH));
  if (!snap.exists()) return [];
  const entries: AiLogEntry[] = [];
  snap.forEach((child) => {
    entries.push({ id: child.key || '', ...(child.val() as Omit<AiLogEntry, 'id'>) });
  });
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries.slice(0, limit);
}

// ---- Mask API key for display ----

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

// ---- Escalations ----

import type { EscalationItem, AiQueueLastRun } from '../types/ai-config';
export type { EscalationItem, AiQueueLastRun };

const AI_ESCALATIONS_PATH = 'ai_queue/escalations';
const AI_QUEUE_LAST_RUN_PATH = 'ai_queue/last_run';

export async function loadEscalations(statusFilter: 'pending' | 'all' = 'pending'): Promise<EscalationItem[]> {
  if (LOCAL_MODE) return [];
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, AI_ESCALATIONS_PATH));
  if (!snap.exists()) return [];
  const items: EscalationItem[] = [];
  snap.forEach((child) => {
    const val = child.val() as EscalationItem;
    if (statusFilter === 'all' || val.status === statusFilter) {
      items.push({ ...val, id: child.key! });
    }
  });
  items.sort((a, b) => b.createdAt - a.createdAt);
  return items;
}

export function subscribeToEscalations(callback: (items: EscalationItem[]) => void): () => void {
  if (LOCAL_MODE) {
    callback([]);
    return () => {};
  }
  const db = getDatabase(firebaseApp);
  const escRef = ref(db, AI_ESCALATIONS_PATH);
  const listener = onValue(escRef, (snap) => {
    if (!snap.exists()) { callback([]); return; }
    const items: EscalationItem[] = [];
    snap.forEach((child) => {
      const val = child.val() as EscalationItem;
      if (val.status === 'pending') {
        items.push({ ...val, id: child.key! });
      }
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    callback(items);
  });
  return () => off(escRef, 'value', listener);
}

export async function resolveEscalation(
  escalationId: string,
  action: 'approve' | 'reject',
  reason?: string,
): Promise<void> {
  if (LOCAL_MODE) return;
  const functions = getFunctions(firebaseApp);
  const callable = httpsCallable<
    { escalationId: string; action: string; reason?: string },
    { success: boolean }
  >(functions, 'aiResolveEscalation');
  await callable({ escalationId, action, reason });
}

export async function loadQueueLastRun(): Promise<AiQueueLastRun | null> {
  if (LOCAL_MODE) return null;
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, AI_QUEUE_LAST_RUN_PATH));
  return snap.exists() ? (snap.val() as AiQueueLastRun) : null;
}
