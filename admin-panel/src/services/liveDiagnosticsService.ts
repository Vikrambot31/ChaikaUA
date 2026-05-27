import { off, onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE, localGet } from '../local/LOCAL_MODE';

export type LiveDiagnosticLevel = 'info' | 'warn' | 'error' | 'fatal';

export type LiveDiagnosticEvent = {
  id: string;
  timestamp: string;
  at: number;
  sessionId: string;
  deviceId: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  osVersion: string;
  model: string;
  level: LiveDiagnosticLevel;
  eventType: string;
  message: string;
  screen: string;
  action: string;
  details: Record<string, unknown>;
  stack: string;
  uid: string;
  source: string;
  raw: Record<string, unknown>;
};

export type LiveDiagnosticsFilters = {
  windowMs: number;
  deviceId: string;
  sessionId: string;
  level: string;
  eventType: string;
  search: string;
};

const PATH = 'diagnostics/runtime';
const CONTROL_PATH = 'diagnostics/runtime_control';
const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000;
const MAX_ITEMS = 500;

const getString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const getNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '{"error":"Failed to serialize JSON"}';
  }
};

const safeJsonStringifyPretty = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{"error":"Failed to serialize JSON"}';
  }
};

const normalizeLevel = (value: unknown, fallbackSeverity?: unknown): LiveDiagnosticLevel => {
  if (value === 'fatal' || value === 'error' || value === 'warn' || value === 'info') return value;
  if (value === 'warning') return 'warn';
  if (fallbackSeverity === 'critical') return 'error';
  if (fallbackSeverity === 'warning') return 'warn';
  return 'info';
};

const normalizeEvent = (id: string, value: unknown): LiveDiagnosticEvent | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const at = getNumber(raw.at, getNumber(raw.timestampMs, Date.parse(getString(raw.timestamp)) || Date.now()));
  const timestamp = getString(raw.timestamp, new Date(at).toISOString());
  const eventType = getString(raw.eventType, getString(raw.status) ? 'debug_step' : getString(raw.source, 'debug_step'));
  const message = getString(raw.message, getString(raw.humanMessage, getString(raw.rawMessage, getString(raw.shortType, 'Diagnostic event'))));
  const details = raw.details && typeof raw.details === 'object' ? raw.details as Record<string, unknown> : {};

  return {
    id,
    timestamp,
    at,
    sessionId: getString(raw.sessionId, 'legacy-session'),
    deviceId: getString(raw.deviceId, getString(raw.deviceInfo, 'unknown-device')),
    appVersion: getString(raw.appVersion, 'unknown'),
    buildNumber: getString(raw.buildNumber, 'unknown'),
    platform: getString(raw.platform, getString(raw.deviceInfo, 'unknown')),
    osVersion: getString(raw.osVersion, getString(raw.androidVersion, 'unknown')),
    model: getString(raw.model, getString(raw.deviceInfo, 'unknown')),
    level: normalizeLevel(raw.level, raw.severity),
    eventType,
    message,
    screen: getString(raw.screen, '-'),
    action: getString(raw.action, getString(raw.status, '')),
    details,
    stack: getString(raw.stack),
    uid: getString(raw.uid),
    source: getString(raw.source, 'runtime_monitor'),
    raw,
  };
};

export const subscribeLiveDiagnostics = (
  onData: (events: LiveDiagnosticEvent[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: fetch live_diagnostics from local json-server once
  if (LOCAL_MODE) {
    const since = Date.now() - DEFAULT_WINDOW_MS;
    localGet<Array<Record<string, unknown>>>('/live_diagnostics')
      .then((raw) => {
        const events = Array.isArray(raw)
          ? raw
            .map((item) => normalizeEvent(String(item.id || ''), item))
            .filter((item): item is LiveDiagnosticEvent => Boolean(item))
            .filter((item) => item.at >= since)
            .sort((a, b) => b.at - a.at)
            .slice(0, MAX_ITEMS)
          : [];
        onData(events);
      })
      .catch((err: unknown) => onError?.(err instanceof Error ? err : new Error(String(err))));
    return () => {};
  }

  const dataRef = ref(database, PATH);

  const unsubscribe = onValue(dataRef, (snapshot) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    const since = Date.now() - DEFAULT_WINDOW_MS;
    const events = raw
      ? Object.entries(raw)
        .map(([id, value]) => normalizeEvent(id, value))
        .filter((item): item is LiveDiagnosticEvent => Boolean(item))
        .filter((item) => item.at >= since)
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_ITEMS)
      : [];
    onData(events);
  }, (error) => onError?.(error));

  return () => {
    off(dataRef);
    unsubscribe();
  };
};

export const subscribeRuntimeDiagnosticsControl = (
  onData: (enabled: boolean) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: diagnostics always enabled in local mode
  if (LOCAL_MODE) {
    onData(true);
    return () => {};
  }

  const controlRef = ref(database, CONTROL_PATH);
  const unsubscribe = onValue(controlRef, (snapshot) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    onData(Boolean(raw?.enabled));
  }, (error) => onError?.(error));

  return () => {
    off(controlRef);
    unsubscribe();
  };
};

export const setRuntimeDiagnosticsControl = async (enabled: boolean): Promise<void> => {
  // LOCAL_MODE: stub — control toggle is no-op
  if (LOCAL_MODE) {
    console.info('[liveDiagnosticsService] LOCAL_MODE: setRuntimeDiagnosticsControl stub, enabled=', enabled);
    return;
  }

  const { set } = await import('firebase/database');
  await set(ref(database, CONTROL_PATH), {
    enabled,
    updatedAt: Date.now(),
  });
};

export const filterLiveDiagnostics = (
  events: LiveDiagnosticEvent[],
  filters: LiveDiagnosticsFilters,
): LiveDiagnosticEvent[] => {
  const since = Date.now() - filters.windowMs;
  const search = filters.search.trim().toLowerCase();

  return events.filter((event) => {
    if (event.at < since) return false;
    if (filters.deviceId && event.deviceId !== filters.deviceId) return false;
    if (filters.sessionId && event.sessionId !== filters.sessionId) return false;
    if (filters.level && event.level !== filters.level) return false;
    if (filters.eventType && event.eventType !== filters.eventType) return false;
    if (!search) return true;

    const haystack = [
      event.message,
      event.screen,
      event.action,
      event.eventType,
      safeJsonStringify(event.details),
      event.stack,
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
};

const formatDateTime = (value: number): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }
  try {
    return date.toLocaleString('ru-RU');
  } catch {
    return '-';
  }
};

const summarizeCause = (event: LiveDiagnosticEvent): string => {
  const haystack = `${event.eventType} ${event.message} ${event.stack} ${safeJsonStringify(event.details)}`.toLowerCase();
  if (haystack.includes('permission') || haystack.includes('denied') || haystack.includes('unauthorized')) {
    return 'Возможная проблема доступа или правил Firebase. Проверьте роль пользователя и разрешения операции.';
  }
  if (haystack.includes('network') || haystack.includes('timeout') || haystack.includes('offline')) {
    return 'Похоже на нестабильную сеть, таймаут или потерю соединения во время операции.';
  }
  if (haystack.includes('upload') || haystack.includes('storage') || haystack.includes('photo')) {
    return 'Похоже на проблему загрузки файла/фото или запись метаданных после upload.';
  }
  if (event.stack) {
    return 'Есть stacktrace. Начните анализ с верхних строк стека и экрана, указанного в событии.';
  }
  return 'Причина не классифицирована автоматически. Смотрите соседние шаги до и после события.';
};

export const buildErrorArchiveText = (
  events: LiveDiagnosticEvent[],
  filters: LiveDiagnosticsFilters,
): string => {
  const chronological = [...events].sort((a, b) => a.at - b.at);
  const problemLevels = new Set<LiveDiagnosticLevel>(['warn', 'error', 'fatal']);
  const problemIndexes = chronological
    .map((event, index) => problemLevels.has(event.level) ? index : -1)
    .filter((index) => index >= 0);
  const includedIndexes = new Set<number>();

  problemIndexes.forEach((index) => {
    for (let i = Math.max(0, index - 3); i <= Math.min(chronological.length - 1, index + 2); i += 1) {
      includedIndexes.add(i);
    }
  });

  const archived = chronological.filter((_event, index) => includedIndexes.has(index));
  const problems = chronological.filter((event) => problemLevels.has(event.level));
  const byType = problems.reduce<Record<string, number>>((acc, event) => {
    const key = `${event.level}/${event.eventType}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const first = archived[0] ?? chronological[0];
  const last = archived[archived.length - 1] ?? chronological[chronological.length - 1];
  const title = [
    'Chaika Live Diagnostics Error Archive',
    `Дата экспорта: ${formatDateTime(Date.now())}`,
    `Диапазон: ${first ? formatDateTime(first.at) : '-'} - ${last ? formatDateTime(last.at) : '-'}`,
    `Окно фильтра: ${Math.round(filters.windowMs / 60000)} мин`,
    `Устройство: ${filters.deviceId || first?.deviceId || 'все'}`,
    `Session: ${filters.sessionId || first?.sessionId || 'все'}`,
    `Версия приложения: ${first?.appVersion || 'unknown'} (${first?.buildNumber || 'unknown'})`,
  ].join('\n');

  const summary = [
    'Сводка:',
    `Всего событий в выборке: ${chronological.length}`,
    `Проблемных событий warn/error/fatal: ${problems.length}`,
    ...Object.entries(byType).map(([key, count]) => `- ${key}: ${count}`),
  ].join('\n');

  const body = archived.length
    ? archived.map((event) => {
      const lines = [
        `[${formatDateTime(event.at)}] ${event.level.toUpperCase()} ${event.eventType}`,
        `deviceId: ${event.deviceId}`,
        `sessionId: ${event.sessionId}`,
        `screen: ${event.screen || '-'}`,
        `action: ${event.action || '-'}`,
        `message: ${event.message}`,
        `details: ${safeJsonStringifyPretty(event.details)}`,
      ];
      if (event.stack) lines.push(`stacktrace:\n${event.stack}`);
      if (problemLevels.has(event.level)) {
        lines.push(`Потенциальная причина: ${summarizeCause(event)}`);
      }
      return lines.join('\n');
    }).join('\n\n---\n\n')
    : 'Нет warn/error/fatal событий в выбранном диапазоне.';

  return `${title}\n\n${summary}\n\nХронологический список:\n\n${body}\n`;
};

// ============================================================
// Shadow Deny Events (ШАГ 1.6)
// ============================================================

export type ShadowDenyEvent = {
  id: string;
  uid: string;
  targetUid: string;
  path: string;
  operation: string;
  prevValue: string | null;
  newValue: string | null;
  timestamp: number;
  appVersion: string;
};

const SHADOW_DENY_DB_PATH = 'ops/shadow_deny';

const normalizeShadowDenyEvent = (id: string, value: unknown): ShadowDenyEvent | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    id,
    uid: typeof raw.uid === 'string' ? raw.uid : '',
    targetUid: typeof raw.targetUid === 'string' ? raw.targetUid : '',
    path: typeof raw.path === 'string' ? raw.path : '',
    operation: typeof raw.operation === 'string' ? raw.operation : 'unknown',
    prevValue: raw.prevValue != null ? String(raw.prevValue) : null,
    newValue: raw.newValue != null ? String(raw.newValue) : null,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : 0,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : 'unknown',
  };
};

export const subscribeShadowDenyEvents = (
  onData: (events: ShadowDenyEvent[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  if (LOCAL_MODE) {
    onData([]);
    return () => {};
  }

  const dataRef = ref(database, SHADOW_DENY_DB_PATH);

  const unsubscribe = onValue(dataRef, (snapshot) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    const events = raw
      ? Object.entries(raw)
        .map(([id, value]) => normalizeShadowDenyEvent(id, value))
        .filter((item): item is ShadowDenyEvent => Boolean(item))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 500)
      : [];
    onData(events);
  }, (error) => onError?.(error));

  return () => {
    off(dataRef);
    unsubscribe();
  };
};

export const buildArchiveFileName = (date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
  return `chaika-log-archive-${stamp}.txt`;
};
