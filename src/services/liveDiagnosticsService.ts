import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { auth, database } from '../firebase-core';
import { ref, push, onValue, off } from 'firebase/database';
import { getSessionId } from './sessionService';
import { isEmergencyAccessActive, subscribeEmergencyAccess } from './emergencyAccess';

export type LiveDiagnosticLevel = 'info' | 'warn' | 'error' | 'fatal';

export type LiveDiagnosticEventType =
  | 'app_start'
  | 'app_background'
  | 'app_foreground'
  | 'screen_open'
  | 'action'
  | 'network_request_start'
  | 'network_request_end'
  | 'network_error'
  | 'warning'
  | 'error'
  | 'fatal'
  | 'debug_step';

export type LiveDiagnosticInput = {
  level?: LiveDiagnosticLevel;
  eventType: LiveDiagnosticEventType;
  message: string;
  screen?: string;
  action?: string;
  details?: Record<string, unknown>;
  error?: unknown;
};

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
  eventType: LiveDiagnosticEventType;
  message: string;
  screen?: string;
  action?: string;
  details?: Record<string, unknown>;
  stack?: string;
  uid?: string;
  source: 'live_diagnostics';
};

const STORAGE_QUEUE_KEY = '@chaika:live_diagnostics_queue';
const STORAGE_DEVICE_ID_KEY = '@chaika:live_diagnostics_device_id';
const MAX_QUEUE_ITEMS = 250;
const MAX_DETAILS_KEYS = 40;
const DEDUP_WINDOW_MS = 10_000;
const SEND_COOLDOWN_MS = 400;
const SENSITIVE_KEY_RE = /authorization|password|token|secret|email|phone/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?380\d{9}/g;

const sessionId = getSessionId();
let deviceIdPromise: Promise<string> | null = null;
let queue: LiveDiagnosticEvent[] = [];
let queueLoaded = false;
let flushInProgress = false;
let lastSentAt = 0;
let lastFingerprint = '';
let lastFingerprintAt = 0;
let appStateSubscription: { remove: () => void } | null = null;
let diagnosticsEnabled = false;
let runtimeControlEnabled = false;
let emergencyDiagnosticsEnabled = false;
let controlUnsubscribe: (() => void) | null = null;
let emergencyUnsubscribe: (() => void) | null = null;

const redactString = (value: string): string =>
  value
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]');

const sanitizeValue = (value: unknown, key = '', seen: WeakSet<object> = new WeakSet()): unknown => {
  if (SENSITIVE_KEY_RE.test(key)) {
    return '[redacted]';
  }
  if (typeof value === 'string') {
    return redactString(value.length > 800 ? `${value.slice(0, 800)}...` : value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.slice(0, 25).map((item) => sanitizeValue(item, '', seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).slice(0, MAX_DETAILS_KEYS).forEach(([itemKey, itemValue]) => {
      out[itemKey] = sanitizeValue(itemValue, itemKey, seen);
    });
    return out;
  }
  return value;
};

const sanitizeRecord = (value: Record<string, unknown> = {}): Record<string, unknown> =>
  sanitizeValue(value) as Record<string, unknown>;

const normalizeErrorStack = (error: unknown): string | undefined => {
  if (error instanceof Error && typeof error.stack === 'string') {
    return redactString(error.stack);
  }
  if (error && typeof error === 'object' && 'stack' in error) {
    const stack = (error as { stack?: unknown }).stack;
    return typeof stack === 'string' ? redactString(stack) : undefined;
  }
  return undefined;
};

const normalizeErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return redactString(error.message || error.name);
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? redactString(message) : undefined;
  }
  return error ? redactString(String(error)) : undefined;
};

const getDeviceId = async (): Promise<string> => {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_DEVICE_ID_KEY);
        if (stored) {
          return stored;
        }
        const generated = `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        await AsyncStorage.setItem(STORAGE_DEVICE_ID_KEY, generated);
        return generated;
      } catch {
        return `device-memory-${Date.now()}`;
      }
    })();
  }
  return deviceIdPromise;
};

const loadQueue = async (): Promise<void> => {
  if (queueLoaded) {
    return;
  }
  queueLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    queue = Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE_ITEMS) : [];
  } catch {
    queue = [];
  }
};

const persistQueue = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
  } catch {
    // Best-effort offline queue only.
  }
};

const canSendNow = (): boolean =>
  Boolean(auth.currentUser && !auth.currentUser.isAnonymous);

const getAppVersion = (): string =>
  Application.nativeApplicationVersion ||
  Constants.expoConfig?.version ||
  'unknown';

const getBuildNumber = (): string =>
  Application.nativeBuildVersion ||
  String(Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? 'unknown');

const getModel = (): string =>
  String(Constants.deviceName || Constants.expoConfig?.name || 'unknown-device');

const buildFingerprint = (event: LiveDiagnosticEvent): string =>
  [
    event.level,
    event.eventType,
    event.screen ?? '',
    event.action ?? '',
    event.message,
  ].join('|');

const shouldDropDuplicate = (event: LiveDiagnosticEvent): boolean => {
  const fingerprint = buildFingerprint(event);
  const now = Date.now();
  if (fingerprint === lastFingerprint && now - lastFingerprintAt < DEDUP_WINDOW_MS) {
    return true;
  }
  lastFingerprint = fingerprint;
  lastFingerprintAt = now;
  return false;
};

const sendEvent = async (event: LiveDiagnosticEvent): Promise<void> => {
  const elapsed = Date.now() - lastSentAt;
  if (elapsed < SEND_COOLDOWN_MS) {
    await new Promise((resolve) => setTimeout(resolve, SEND_COOLDOWN_MS - elapsed));
  }
  lastSentAt = Date.now();
  await push(ref(database, 'diagnostics/runtime'), {
    ...event,
    uid: auth.currentUser?.uid ?? event.uid ?? 'anonymous',
  });
};

export const flushLiveDiagnostics = async (): Promise<void> => {
  if (flushInProgress || !canSendNow()) {
    return;
  }
  flushInProgress = true;
  try {
    await loadQueue();
    while (queue.length > 0 && canSendNow()) {
      const next = queue[0];
      await sendEvent(next);
      queue = queue.slice(1);
      await persistQueue();
    }
  } catch {
    // Keep the remaining queue for the next foreground/network attempt.
  } finally {
    flushInProgress = false;
  }
};

const updateDiagnosticsEnabled = (source: string): void => {
  const nextEnabled = runtimeControlEnabled || emergencyDiagnosticsEnabled;
  const changed = nextEnabled !== diagnosticsEnabled;
  diagnosticsEnabled = nextEnabled;
  if (changed && diagnosticsEnabled) {
    void recordLiveDiagnostic({
      eventType: 'app_start',
      level: 'info',
      message: `Live diagnostics enabled from ${source}`,
      details: { appState: AppState.currentState },
    });
    void flushLiveDiagnostics();
  }
};

export const recordLiveDiagnostic = async (input: LiveDiagnosticInput): Promise<void> => {
  if (!diagnosticsEnabled) {
    return;
  }
  await loadQueue();
  const at = Date.now();
  const errorMessage = normalizeErrorMessage(input.error);
  const event: LiveDiagnosticEvent = {
    id: `live-${at}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(at).toISOString(),
    at,
    sessionId,
    deviceId: await getDeviceId(),
    appVersion: getAppVersion(),
    buildNumber: getBuildNumber(),
    platform: Platform.OS,
    osVersion: String(Platform.Version ?? 'unknown'),
    model: getModel(),
    level: input.level ?? (input.eventType === 'fatal' ? 'fatal' : input.eventType === 'error' || input.eventType === 'network_error' ? 'error' : input.eventType === 'warning' ? 'warn' : 'info'),
    eventType: input.eventType,
    message: redactString(input.message || errorMessage || input.eventType),
    screen: input.screen ? redactString(input.screen) : undefined,
    action: input.action ? redactString(input.action) : undefined,
    details: sanitizeRecord({
      ...(input.details ?? {}),
      ...(errorMessage ? { errorMessage } : {}),
    }),
    stack: normalizeErrorStack(input.error),
    uid: auth.currentUser?.uid,
    source: 'live_diagnostics',
  };

  if (shouldDropDuplicate(event)) {
    return;
  }

  queue = [...queue, event].slice(-MAX_QUEUE_ITEMS);
  await persistQueue();
  await flushLiveDiagnostics();
};

export const initLiveDiagnostics = (): void => {
  if (!controlUnsubscribe) {
    const controlRef = ref(database, 'diagnostics/runtime_control');
    const unsubscribe = onValue(controlRef, (snapshot) => {
      runtimeControlEnabled = Boolean((snapshot.val() as { enabled?: unknown } | null)?.enabled);
      updateDiagnosticsEnabled('admin panel');
    }, () => {
      // Permission denied or connection error — non-fatal, diagnostics remain disabled.
    });
    controlUnsubscribe = () => {
      off(controlRef);
      unsubscribe();
    };
  }

  if (!emergencyUnsubscribe) {
    emergencyUnsubscribe = subscribeEmergencyAccess((current) => {
      emergencyDiagnosticsEnabled = Boolean(
        isEmergencyAccessActive(current) &&
        current?.bypassDiagnosticsRestrictions,
      );
      updateDiagnosticsEnabled('emergency debug');
    }, () => {
      emergencyDiagnosticsEnabled = false;
      updateDiagnosticsEnabled('emergency debug');
    });
  }

  if (appStateSubscription) {
    return;
  }

  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void recordLiveDiagnostic({
        eventType: 'app_foreground',
        level: 'info',
        message: 'Mobile app returned to foreground',
      });
      void flushLiveDiagnostics();
      return;
    }

    if (state === 'background' || state === 'inactive') {
      void recordLiveDiagnostic({
        eventType: 'app_background',
        level: 'info',
        message: 'Mobile app moved to background',
        details: { appState: state },
      });
    }
  });
};

export const recordScreenOpenDiagnostic = (screenName: string): void => {
  void recordLiveDiagnostic({
    eventType: 'screen_open',
    level: 'info',
    message: `Screen opened: ${screenName}`,
    screen: screenName,
  });
};
