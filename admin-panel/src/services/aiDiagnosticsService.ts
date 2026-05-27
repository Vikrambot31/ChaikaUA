import { off, onValue, push, ref, set } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

const BASE = 'diagnostics/runtime_moderation';
const TRIGGER_PATH = `${BASE}/_audit_trigger`;
const STATUS_PATH = `${BASE}/_audit_status`;
const LOGS_PATH = `${BASE}/_audit_logs`;
const HISTORY_PATH = `${BASE}/_audit_history`;
const HEARTBEAT_PATH = `${BASE}/_daemon_heartbeat`;

export type AuditStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type AuditProgress = {
  currentStep: string;
  stepNum: number;
  totalSteps: number;
  percent: number;
  message: string;
};

export type SeverityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export type AuditStatusData = {
  status: AuditStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  progress?: AuditProgress;
  healthScore?: number;
  verifiedScore?: number | null;
  severityCounts?: SeverityCounts;
  summary?: string;
  findingsCount?: number;
};

export type AuditLogEntry = {
  id: string;
  message: string;
  severity: 'info' | 'warn' | 'error';
  scanner: string;
  at: number;
};

export type AuditHistoryEntry = {
  id: string;
  completedAt: number;
  healthScore: number;
  verifiedScore?: number | null;
  severityCounts: SeverityCounts;
  duration: number;
};

export type FindingContext = 'production' | 'test' | 'tooling' | 'admin';

export type FindingRecord = {
  severity: string;
  file: string;
  line: number;
  rule: string;
  scanner: string;
  why: string;
  verified: boolean;
  context: FindingContext;
  suggestion?: string;
  risk?: string;
  uxImpact?: string;
  perfImpact?: string;
  memoryImpact?: string;
};

export const triggerAudit = async (email: string): Promise<void> => {
  // LOCAL_MODE: stub — audit trigger is a no-op (agent not running locally)
  if (LOCAL_MODE) {
    console.info('[aiDiagnosticsService] LOCAL_MODE: triggerAudit stub for', email);
    return;
  }

  await set(ref(database, TRIGGER_PATH), {
    action: 'start',
    requestedBy: email,
    at: Date.now(),
  });
};

export const cancelAudit = async (email: string): Promise<void> => {
  // LOCAL_MODE: stub
  if (LOCAL_MODE) {
    console.info('[aiDiagnosticsService] LOCAL_MODE: cancelAudit stub for', email);
    return;
  }

  await set(ref(database, TRIGGER_PATH), {
    action: 'cancel',
    requestedBy: email,
    at: Date.now(),
  });
};

export const subscribeAuditStatus = (
  onData: (status: AuditStatusData) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: return idle state immediately, no real-time subscription
  if (LOCAL_MODE) {
    onData({ status: 'idle' });
    return () => {};
  }

  const statusRef = ref(database, STATUS_PATH);
  const unsubscribe = onValue(statusRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw || typeof raw !== 'object') {
      onData({ status: 'idle' });
      return;
    }
    onData({
      status: raw.status || 'idle',
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      duration: raw.duration,
      progress: raw.progress || undefined,
      healthScore: raw.healthScore,
      verifiedScore: raw.verifiedScore ?? null,
      severityCounts: raw.severityCounts,
      summary: raw.summary,
      findingsCount: raw.findingsCount,
    });
  }, (error) => onError?.(error));

  return () => { unsubscribe(); };
};

export const subscribeAuditLogs = (
  onData: (logs: AuditLogEntry[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: return empty logs
  if (LOCAL_MODE) {
    onData([]);
    return () => {};
  }

  const logsRef = ref(database, LOGS_PATH);
  const unsubscribe = onValue(logsRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw || typeof raw !== 'object') { onData([]); return; }
    const logs = Object.entries(raw)
      .map(([id, val]: [string, any]) => ({
        id,
        message: val?.message || '',
        severity: val?.severity || 'info',
        scanner: val?.scanner || '',
        at: val?.at || 0,
      }))
      .sort((a, b) => a.at - b.at)
      .slice(0, 200);
    onData(logs);
  }, (error) => onError?.(error));

  return () => { unsubscribe(); };
};

export const subscribeFindings = (
  onData: (findings: FindingRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: return empty findings
  if (LOCAL_MODE) {
    onData([]);
    return () => {};
  }

  const findingsRef = ref(database, `${STATUS_PATH}/findings`);
  const unsubscribe = onValue(findingsRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw) { onData([]); return; }
    const arr: FindingRecord[] = Array.isArray(raw) ? raw : Object.values(raw);
    onData(arr);
  }, (error) => onError?.(error));
  return () => { unsubscribe(); };
};

// Daemon is considered online if heartbeat was written within the last 90 seconds
const HEARTBEAT_TIMEOUT_MS = 90_000;

export const subscribeDaemonHeartbeat = (
  onData: (online: boolean) => void,
): (() => void) => {
  if (LOCAL_MODE) {
    onData(false);
    return () => {};
  }

  const hbRef = ref(database, HEARTBEAT_PATH);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastAt = 0;

  const unsubscribe = onValue(hbRef, (snapshot) => {
    const raw = snapshot.val();
    lastAt = raw?.at || 0;
    onData(lastAt > 0 && Date.now() - lastAt < HEARTBEAT_TIMEOUT_MS);
  });

  // Re-evaluate online status every 15s in case heartbeat stops coming
  intervalId = setInterval(() => {
    onData(lastAt > 0 && Date.now() - lastAt < HEARTBEAT_TIMEOUT_MS);
  }, 15_000);

  return () => {
    unsubscribe();
    if (intervalId) clearInterval(intervalId);
  };
};

export const subscribeAuditHistory = (
  onData: (history: AuditHistoryEntry[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: return empty history
  if (LOCAL_MODE) {
    onData([]);
    return () => {};
  }

  const histRef = ref(database, HISTORY_PATH);
  const unsubscribe = onValue(histRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw || typeof raw !== 'object') { onData([]); return; }
    const history = Object.entries(raw)
      .map(([id, val]: [string, any]) => ({
        id,
        completedAt: val?.completedAt || 0,
        healthScore: val?.healthScore || 0,
        verifiedScore: val?.verifiedScore ?? null,
        severityCounts: val?.severityCounts || { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: val?.duration || 0,
      }))
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 20);
    onData(history);
  }, (error) => onError?.(error));

  return () => { unsubscribe(); };
};
