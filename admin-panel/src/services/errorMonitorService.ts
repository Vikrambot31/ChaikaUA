import { off, onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE, localGet } from '../local/LOCAL_MODE';

export type RuntimeErrorEntry = {
  id: string;
  submittedAt: number;
  fingerprint: string;
  uid: string;
  reporterName: string;
  shortType: string;
  screen: string;
  rawMessage: string;
  humanMessage: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  firebasePath: string;
  stage: string;
  code: string;
  appVersion: string;
  sessionId: string;
  /** Total duration of the traced operation in ms (only on terminal statuses). */
  durationMs?: number;
  /** true when durationMs exceeded the slow-operation threshold. */
  slowOp?: boolean;
};

export type DedupedRuntimeError = {
  fingerprint: string;
  latestAt: number;
  duplicates: number;
  usersCount: number;
  sample: RuntimeErrorEntry;
};

export type UserErrorReport = {
  id: string;
  uid: string;
  userName: string;
  submittedAt: number;
  errorCount: number;
  errors: Array<{
    functionName: string;
    at: number;
    message: string;
    source: string;
  }>;
};

export type ErrorMonitorState = {
  runtimeErrors: RuntimeErrorEntry[];
  dedupedRuntimeErrors: DedupedRuntimeError[];
  userReports: UserErrorReport[];
};
const MAX_FEED_ITEMS = 50;

const getString = (value: unknown): string => typeof value === 'string' ? value : '';
const getNumber = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;

const normalizeSeverity = (value: unknown): RuntimeErrorEntry['severity'] => {
  if (value === 'critical' || value === 'warning' || value === 'info') return value;
  return 'warning';
};

const normalizeRuntimeRecord = (id: string, value: unknown): RuntimeErrorEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const entry = raw.entry;
  if (!entry || typeof entry !== 'object') return null;

  const rawEntry = entry as Record<string, unknown>;
  const shortType = getString(rawEntry.shortType);
  const screen = getString(rawEntry.screen);
  if (!shortType && !screen) return null;

  const reporter = raw.reporter && typeof raw.reporter === 'object'
    ? raw.reporter as Record<string, unknown>
    : {};
  const fingerprint = getString(raw.fingerprint) || `${screen}|${shortType}|${getString(rawEntry.rawMessage)}`;

  return {
    id,
    submittedAt: getNumber(raw.submittedAt) || getNumber(rawEntry.at),
    fingerprint,
    uid: getString(raw.uid) || getString(reporter.userId),
    reporterName: getString(reporter.name),
    shortType: shortType || 'Ошибка',
    screen: screen || '-',
    rawMessage: getString(rawEntry.rawMessage),
    humanMessage: getString(rawEntry.humanMessage),
    severity: normalizeSeverity(rawEntry.severity),
    source: getString(rawEntry.source),
    firebasePath: getString(rawEntry.firebasePath),
    stage: getString(rawEntry.stage),
    code: getString(rawEntry.code),
    appVersion: getString(rawEntry.appVersion) || getString(raw.appVersion) || '-',
    sessionId: getString(rawEntry.sessionId) || getString(raw.sessionId) || '-',
    durationMs: typeof rawEntry.durationMs === 'number' ? rawEntry.durationMs : undefined,
    slowOp: rawEntry.slowOp === true ? true : undefined,
  };
};

const dedupeRuntimeErrors = (records: RuntimeErrorEntry[]): DedupedRuntimeError[] => {
  const grouped = new Map<string, DedupedRuntimeError & { users: Set<string> }>();

  records.forEach((record) => {
    const existing = grouped.get(record.fingerprint);
    const userKey = record.uid || record.reporterName || 'unknown';
    if (!existing) {
      grouped.set(record.fingerprint, {
        fingerprint: record.fingerprint,
        latestAt: record.submittedAt,
        duplicates: 1,
        usersCount: 1,
        users: new Set([userKey]),
        sample: record,
      });
      return;
    }

    existing.duplicates += 1;
    existing.users.add(userKey);
    existing.usersCount = existing.users.size;
    if (record.submittedAt > existing.latestAt) {
      existing.latestAt = record.submittedAt;
      existing.sample = record;
    }
  });

  return Array.from(grouped.values())
    .map(({ users: _users, ...item }) => item)
    .sort((a, b) => b.latestAt - a.latestAt);
};

const normalizeUserReport = (id: string, value: unknown): UserErrorReport | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawErrors = Array.isArray(raw.errors) ? raw.errors : [];

  return {
    id,
    uid: getString(raw.uid),
    userName: getString(raw.userName) || '-',
    submittedAt: getNumber(raw.submittedAt),
    errorCount: getNumber(raw.errorCount) || rawErrors.length,
    errors: rawErrors
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        functionName: getString(item.functionName),
        at: getNumber(item.at),
        message: getString(item.message),
        source: getString(item.source),
      })),
  };
};

export const subscribeErrorMonitor = (
  onData: (state: ErrorMonitorState) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: fetch diagnostics from local json-server once and emit
  if (LOCAL_MODE) {
    Promise.all([
      localGet<Record<string, unknown>[]>('/diagnostics_runtime').catch(() => []),
      localGet<Record<string, unknown>[]>('/diagnostics_reports').catch(() => []),
    ]).then(([rawRuntime, rawReports]) => {
      const runtimeErrors = Array.isArray(rawRuntime)
        ? rawRuntime
          .map((item) => normalizeRuntimeRecord(String(item.id || ''), item))
          .filter((item): item is RuntimeErrorEntry => Boolean(item))
          .sort((a, b) => b.submittedAt - a.submittedAt)
          .slice(0, MAX_FEED_ITEMS)
        : [];
      const userReports = Array.isArray(rawReports)
        ? rawReports
          .map((item) => normalizeUserReport(String(item.id || ''), item))
          .filter((item): item is UserErrorReport => Boolean(item))
          .sort((a, b) => b.submittedAt - a.submittedAt)
          .slice(0, MAX_FEED_ITEMS)
        : [];
      onData({ runtimeErrors, dedupedRuntimeErrors: dedupeRuntimeErrors(runtimeErrors), userReports });
    }).catch((err: unknown) => onError?.(err instanceof Error ? err : new Error(String(err))));
    return () => {};
  }

  let runtimeErrors: RuntimeErrorEntry[] = [];
  let userReports: UserErrorReport[] = [];

  const emit = () => {
    onData({
      runtimeErrors,
      dedupedRuntimeErrors: dedupeRuntimeErrors(runtimeErrors),
      userReports,
    });
  };

  const runtimeRef = ref(database, 'diagnostics/runtime_moderation');
  const reportsRef = ref(database, 'diagnostics/user_reports');

  const unsubscribeRuntime = onValue(runtimeRef, (snapshot) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    runtimeErrors = raw
      ? Object.entries(raw)
        .map(([id, value]) => normalizeRuntimeRecord(id, value))
        .filter((item): item is RuntimeErrorEntry => Boolean(item))
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, MAX_FEED_ITEMS)
      : [];
    emit();
  }, (error) => onError?.(error));

  const unsubscribeReports = onValue(reportsRef, (snapshot) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    userReports = raw
      ? Object.entries(raw)
        .map(([id, value]) => normalizeUserReport(id, value))
        .filter((item): item is UserErrorReport => Boolean(item))
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, MAX_FEED_ITEMS)
      : [];
    emit();
  }, (error) => onError?.(error));

  return () => {
    off(runtimeRef);
    off(reportsRef);
    unsubscribeRuntime();
    unsubscribeReports();
  };
};
