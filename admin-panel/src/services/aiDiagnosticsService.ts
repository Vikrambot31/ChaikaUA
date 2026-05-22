import { off, onValue, push, ref, set } from 'firebase/database';
import { database } from '../firebase/firebase';

const BASE = 'diagnostics/runtime_moderation';
const TRIGGER_PATH = `${BASE}/_audit_trigger`;
const STATUS_PATH = `${BASE}/_audit_status`;
const LOGS_PATH = `${BASE}/_audit_logs`;
const HISTORY_PATH = `${BASE}/_audit_history`;

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
  severityCounts: SeverityCounts;
  duration: number;
};

export const triggerAudit = async (email: string): Promise<void> => {
  await set(ref(database, TRIGGER_PATH), {
    action: 'start',
    requestedBy: email,
    at: Date.now(),
  });
};

export const cancelAudit = async (email: string): Promise<void> => {
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
      severityCounts: raw.severityCounts,
      summary: raw.summary,
      findingsCount: raw.findingsCount,
    });
  }, (error) => onError?.(error));

  return () => { off(statusRef); unsubscribe(); };
};

export const subscribeAuditLogs = (
  onData: (logs: AuditLogEntry[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
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
      .sort((a, b) => b.at - a.at)
      .slice(0, 200);
    onData(logs);
  }, (error) => onError?.(error));

  return () => { off(logsRef); unsubscribe(); };
};

export const subscribeAuditHistory = (
  onData: (history: AuditHistoryEntry[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const histRef = ref(database, HISTORY_PATH);
  const unsubscribe = onValue(histRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw || typeof raw !== 'object') { onData([]); return; }
    const history = Object.entries(raw)
      .map(([id, val]: [string, any]) => ({
        id,
        completedAt: val?.completedAt || 0,
        healthScore: val?.healthScore || 0,
        severityCounts: val?.severityCounts || { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        duration: val?.duration || 0,
      }))
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 20);
    onData(history);
  }, (error) => onError?.(error));

  return () => { off(histRef); unsubscribe(); };
};
