export type StartupSyncTask =
  | 'auth'
  | 'firebase'
  | 'remoteConfig'
  | 'deviceAuth';

export type StartupSyncSnapshot = {
  isActive: boolean;
  startedAt: number | null;
  minDurationMs: number;
  maxDurationMs: number;
  pendingTasks: StartupSyncTask[];
  completionReason?: 'ready' | 'timeout' | 'forced';
};

type StartupMonitorInput = {
  screen: string;
  rawMessage: string;
  extra?: Record<string, unknown>;
  source?: string;
};

type StartupTransientDecision = {
  shouldSuppress: boolean;
  reason?: string;
};

type StartupSyncListener = (snapshot: StartupSyncSnapshot) => void;

const STARTUP_SYNC_MIN_DURATION_MS = 15_000;
const STARTUP_SYNC_MAX_DURATION_MS = 25_000;
const REQUIRED_TASKS: StartupSyncTask[] = ['auth', 'firebase', 'remoteConfig', 'deviceAuth'];

const listeners = new Set<StartupSyncListener>();
const completedTasks = new Set<StartupSyncTask>();

let startedAt: number | null = null;
let completionReason: StartupSyncSnapshot['completionReason'];
let minTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let minDurationReached = false;

const emit = (): void => {
  const snapshot = getStartupSyncSnapshot();
  listeners.forEach((listener) => listener(snapshot));
};

const cleanupTimers = (): void => {
  if (minTimer) {
    clearTimeout(minTimer);
    minTimer = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
};

const isEveryRequiredTaskReady = (): boolean =>
  REQUIRED_TASKS.every((task) => completedTasks.has(task));

const getPendingTasks = (): StartupSyncTask[] =>
  REQUIRED_TASKS.filter((task) => !completedTasks.has(task));

const finishStartupSync = (reason: NonNullable<StartupSyncSnapshot['completionReason']>): void => {
  if (!startedAt || completionReason) {
    return;
  }
  completionReason = reason;
  cleanupTimers();
  emit();
};

const maybeFinishStartupSync = (): void => {
  if (!startedAt || completionReason || !minDurationReached) {
    return;
  }
  if (isEveryRequiredTaskReady()) {
    finishStartupSync('ready');
  }
};

export const beginStartupSync = (): void => {
  if (startedAt) {
    return;
  }

  startedAt = Date.now();
  completionReason = undefined;
  minDurationReached = false;
  completedTasks.clear();

  minTimer = setTimeout(() => {
    minDurationReached = true;
    maybeFinishStartupSync();
    emit();
  }, STARTUP_SYNC_MIN_DURATION_MS);

  maxTimer = setTimeout(() => {
    finishStartupSync('timeout');
  }, STARTUP_SYNC_MAX_DURATION_MS);

  emit();
};

export const markStartupTaskReady = (task: StartupSyncTask): void => {
  if (!startedAt || completionReason || completedTasks.has(task)) {
    return;
  }
  completedTasks.add(task);
  maybeFinishStartupSync();
  emit();
};

export const forceFinishStartupSync = (): void => {
  finishStartupSync('forced');
};

export const isStartupSyncActive = (): boolean =>
  Boolean(startedAt && !completionReason);

export const getStartupSyncSnapshot = (): StartupSyncSnapshot => {
  const pendingTasks = isStartupSyncActive() ? getPendingTasks() : [];
  return {
    isActive: isStartupSyncActive(),
    startedAt,
    minDurationMs: STARTUP_SYNC_MIN_DURATION_MS,
    maxDurationMs: STARTUP_SYNC_MAX_DURATION_MS,
    pendingTasks,
    completionReason,
  };
};

export const subscribeStartupSync = (listener: StartupSyncListener): (() => void) => {
  listeners.add(listener);
  listener(getStartupSyncSnapshot());
  return () => {
    listeners.delete(listener);
  };
};

const isProtectedCriticalStartupIssue = (haystack: string, source?: string): boolean => {
  if (source === 'global_handler' || source === 'error_boundary') {
    return true;
  }

  return /globalfatalhandler|globalerrorhandler|errorboundary|fatal|crash|blocked device|device_blocked|blocked_access_attempt|security violation|security_violation|invalid-credential|user-token-expired|corrupt|corrupted auth|unhandledpromiserejection/.test(haystack);
};

export const classifyStartupTransientIssue = ({
  screen,
  rawMessage,
  extra = {},
  source,
}: StartupMonitorInput): StartupTransientDecision => {
  if (!isStartupSyncActive()) {
    return { shouldSuppress: false };
  }

  const haystack = `${screen} ${rawMessage} ${JSON.stringify(extra)}`.toLowerCase();
  if (isProtectedCriticalStartupIssue(haystack, source)) {
    return { shouldSuppress: false };
  }

  const isDeviceAuthPermission =
    screen.includes('deviceAuth') &&
    /permission_denied|permission denied|device_auth_not_ready/.test(haystack);
  const isReconnect =
    /firebase_connection|firebase_reconnecting|connection lost|offline|listener|subscribe|reconnect|onvalue|sync/.test(haystack);
  const isAuthRefreshDelay =
    /auth refresh|authstate|auth state|token refresh|session restore/.test(haystack);
  const isTransientTimeout =
    /timeout|timed out|remote_config_timeout|device_status_timeout/.test(haystack);
  const isInitialCacheMismatch =
    /cache mismatch|stale cache|cache|hydration/.test(haystack);
  const isFirebaseBootstrap =
    /firebase|database|rtdb|remoteconfig|remote config/.test(haystack);

  if (isDeviceAuthPermission) {
    return { shouldSuppress: true, reason: 'startup_device_auth' };
  }

  if (isReconnect || isAuthRefreshDelay || isTransientTimeout || isInitialCacheMismatch) {
    return { shouldSuppress: true, reason: 'startup_transient' };
  }

  if (isFirebaseBootstrap && /permission_denied|permission denied|network|fetch failed|offline/.test(haystack)) {
    return { shouldSuppress: true, reason: 'startup_firebase_bootstrap' };
  }

  return { shouldSuppress: false };
};

export const resetStartupSyncForTests = (): void => {
  cleanupTimers();
  listeners.clear();
  completedTasks.clear();
  startedAt = null;
  completionReason = undefined;
  minDurationReached = false;
};

