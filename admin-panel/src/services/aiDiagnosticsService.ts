import { onValue, push, ref, set, update } from 'firebase/database';
import { database } from '../firebase/firebase';

const BASE = 'diagnostics/runtime_moderation';
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const statusRef = () => ref(database, STATUS_PATH);
const logsRef = () => ref(database, LOGS_PATH);

async function fbUpdateStatus(data: Record<string, unknown>) {
  try { await update(statusRef(), data); } catch (err) { console.error('[audit] RTDB status write error', err); }
}

async function fbPushLog(entry: { message: string; severity: string; scanner: string; at: number }) {
  try { await push(logsRef(), entry); } catch (err) { console.error('[audit] RTDB log write error', err); }
}

async function fbClearLogs() {
  try { await set(logsRef(), null); } catch { /* ok if empty */ }
}

async function fbAddHistory(entry: Record<string, unknown>) {
  const id = `audit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  try { await set(ref(database, `${HISTORY_PATH}/${id}`), entry); } catch (err) { console.error('[audit] RTDB history write error', err); }
}

// ── Local API detection ─────────────────────────────────────────────────────

async function isLocalAuditAvailable(): Promise<boolean> {
  try {
    const resp = await fetch('/api/audit/health', { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data?.ok === true;
  } catch {
    return false;
  }
}

// ── SSE stream reader ───────────────────────────────────────────────────────

async function processAuditStream(resp: Response, email: string, startedAt: number): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  const parseSse = (chunk: string): unknown[] => {
    const messages: unknown[] = [];
    buffer += chunk;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          try { messages.push(JSON.parse(line.slice(6))); } catch { /* skip */ }
        }
      }
    }
    return messages;
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const messages = parseSse(decoder.decode(value, { stream: true }));
    for (const msg of messages) {
      await handleAgentMessage(msg as Record<string, unknown>, email, startedAt);
    }
  }
}

async function handleAgentMessage(msg: Record<string, unknown>, email: string, startedAt: number): Promise<void> {
  const now = Date.now();

  switch (msg.type) {
    case 'progress':
      await fbUpdateStatus({
        progress: {
          currentStep: msg.scanner || msg.step || '',
          stepNum: msg.stepNum || 0,
          totalSteps: msg.totalSteps || 8,
          percent: msg.percent || 0,
          message: msg.message || '',
        },
      });
      await fbPushLog({
        message: (msg.message as string) || `Scanning ${msg.scanner}...`,
        severity: 'info',
        scanner: (msg.scanner as string) || '',
        at: now,
      });
      break;

    case 'finding':
      await fbPushLog({
        message: `[${msg.severity}] ${msg.file}:${msg.line} — ${msg.rule}: ${msg.why}`,
        severity: msg.severity === 'CRITICAL' || msg.severity === 'HIGH' ? 'error' : msg.severity === 'MEDIUM' ? 'warn' : 'info',
        scanner: (msg.scanner as string) || '',
        at: now,
      });
      break;

    case 'complete': {
      const completedAt = now;
      const duration = (msg.duration as number) || completedAt - startedAt;
      await fbUpdateStatus({
        status: 'completed',
        completedAt,
        duration,
        healthScore: msg.healthScore || 0,
        verifiedScore: msg.verifiedScore ?? null,
        severityCounts: msg.severityCounts || {},
        summary: msg.summary || '',
        findingsCount: msg.findingsCount || 0,
        progress: {
          currentStep: 'done',
          stepNum: (msg.totalSteps as number) || 8,
          totalSteps: (msg.totalSteps as number) || 8,
          percent: 100,
          message: 'Audit complete',
        },
      });
      // Upload findings array if present
      if (Array.isArray(msg.findings) && msg.findings.length > 0) {
        try { await set(ref(database, `${STATUS_PATH}/findings`), msg.findings); } catch { /* ok */ }
      }
      await fbAddHistory({
        completedAt,
        healthScore: msg.healthScore || 0,
        verifiedScore: msg.verifiedScore ?? null,
        severityCounts: msg.severityCounts || {},
        duration,
      });
      await fbPushLog({ message: `Audit completed in ${Math.round(duration / 1000)}s`, severity: 'info', scanner: 'daemon', at: now });
      break;
    }

    case 'log':
      await fbPushLog({
        message: (msg.message as string) || '',
        severity: (msg.severity as string) || 'info',
        scanner: (msg.scanner as string) || '',
        at: now,
      });
      break;

    case 'stream-end': {
      // Agent process ended — if not already completed, mark as failed
      const code = msg.code as number | null;
      if (code !== 0 && code !== null) {
        await fbUpdateStatus({ status: 'failed', completedAt: now, duration: now - startedAt });
        await fbPushLog({ message: `Agent exited with code ${code}`, severity: 'error', scanner: 'daemon', at: now });
      }
      break;
    }

    case 'error':
      await fbUpdateStatus({ status: 'failed', completedAt: now, duration: now - startedAt });
      await fbPushLog({ message: (msg.message as string) || 'Unknown error', severity: 'error', scanner: 'daemon', at: now });
      break;

    default:
      break;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start an audit. If the local Vite audit plugin is running, uses it directly.
 * The function resolves quickly after writing initial state; the SSE stream
 * continues in the background and relays progress to Firebase RTDB.
 */
export const triggerAudit = async (email: string): Promise<void> => {
  const local = await isLocalAuditAvailable();
  if (!local) {
    throw new Error('Audit server not available. Restart the admin panel dev server.');
  }

  const startedAt = Date.now();

  // Write initial running state
  await fbClearLogs();
  await set(statusRef(), {
    status: 'running',
    startedAt,
    completedAt: null,
    duration: null,
    progress: { currentStep: 'initializing', stepNum: 0, totalSteps: 8, percent: 0, message: 'Initializing audit...' },
    healthScore: null,
    verifiedScore: null,
    severityCounts: null,
    summary: null,
    findingsCount: null,
    findings: null,
  });

  await fbPushLog({ message: `Audit started by ${email}`, severity: 'info', scanner: 'daemon', at: startedAt });

  // Start the audit stream — fire and forget (background relay to Firebase)
  fetch('/api/audit/start', { method: 'POST' })
    .then((resp) => {
      if (!resp.ok) throw new Error(`Audit API returned ${resp.status}`);
      return processAuditStream(resp, email, startedAt);
    })
    .catch(async (err) => {
      console.error('[audit] stream error', err);
      await fbUpdateStatus({ status: 'failed', completedAt: Date.now(), duration: Date.now() - startedAt });
      await fbPushLog({ message: `Stream error: ${err.message}`, severity: 'error', scanner: 'daemon', at: Date.now() });
    });
};

/**
 * Cancel a running audit.
 */
export const cancelAudit = async (_email: string): Promise<void> => {
  try { await fetch('/api/audit/cancel', { method: 'POST' }); } catch { /* ok */ }
  await fbUpdateStatus({ status: 'cancelled', completedAt: Date.now() });
  await fbPushLog({ message: 'Audit cancelled by user', severity: 'warn', scanner: 'daemon', at: Date.now() });
};

// ── Firebase subscriptions (unchanged — UI reads from RTDB) ─────────────────

export const subscribeAuditStatus = (
  onData: (status: AuditStatusData) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const sRef = ref(database, STATUS_PATH);
  const unsubscribe = onValue(sRef, (snapshot) => {
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
  const lRef = ref(database, LOGS_PATH);
  const unsubscribe = onValue(lRef, (snapshot) => {
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
  const fRef = ref(database, `${STATUS_PATH}/findings`);
  const unsubscribe = onValue(fRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw) { onData([]); return; }
    const arr: FindingRecord[] = Array.isArray(raw) ? raw : Object.values(raw);
    onData(arr);
  }, (error) => onError?.(error));
  return () => { unsubscribe(); };
};

/**
 * Daemon heartbeat — checks the local Vite audit plugin health endpoint.
 * Polls every 30 seconds (matching the old daemon heartbeat interval).
 */
export const subscribeDaemonHeartbeat = (
  onData: (online: boolean) => void,
): (() => void) => {
  let active = true;

  const check = async () => {
    if (!active) return;
    const ok = await isLocalAuditAvailable();
    if (active) onData(ok);
  };

  // Initial check
  check();
  // Re-check every 30s
  const intervalId = setInterval(check, 30_000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
};

export const subscribeAuditHistory = (
  onData: (history: AuditHistoryEntry[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const hRef = ref(database, HISTORY_PATH);
  const unsubscribe = onValue(hRef, (snapshot) => {
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
