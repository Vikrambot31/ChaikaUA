import { auth, database } from '../firebase-core';
import { ref, push } from 'firebase/database';
import { recordRuntimeMonitorError } from '../services/runtimeMonitorService';
import { classifyStartupTransientIssue } from '../services/startupSync';

interface ErrorEntry {
  functionName: string;
  at: number;
  source: string;
  message: string;
  [key: string]: unknown;
}

interface EventEntry {
  type: string;
  at: number;
  source: string;
  [key: string]: unknown;
}

const MAX_LOCAL_LOG = 50;
const MAX_STRING_LENGTH = 500;
const MAX_OBJECT_KEYS = 20;
const MAX_ARRAY_ITEMS = 10;
const localLog: ErrorEntry[] = [];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

const redactString = (value: string): string =>
  value
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]');

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 2) {
    return '[truncated]';
  }
  if (typeof value === 'string') {
    const safe = redactString(value);
    return safe.length > MAX_STRING_LENGTH ? `${safe.slice(0, MAX_STRING_LENGTH)}...` : safe;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS).forEach(([k, v]) => {
      out[k] = sanitizeValue(v, depth + 1);
    });
    return out;
  }
  return value;
};

const canWriteRemoteOpsLog = (): boolean => {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  if (user.isAnonymous) {
    return false;
  }
  return true;
};

const logClientError = async (screenName: string, error: unknown, extra: Record<string, unknown> = {}): Promise<void> => {
  const rawMessage = redactString(String((error as { message?: string } | null)?.message || error || 'Unknown client error'));
  const startupDecision = classifyStartupTransientIssue({
    screen: screenName,
    rawMessage,
    extra,
    source: 'client_error',
  });
  const entry: ErrorEntry = {
    functionName: String(screenName || 'unknown'),
    at: Date.now(),
    source: 'client',
    message: rawMessage,
    ...(sanitizeValue(extra) as Record<string, unknown>),
  };

  localLog.push(entry);
  if (localLog.length > MAX_LOCAL_LOG) {
    localLog.shift();
  }

  await recordRuntimeMonitorError({
    screen: screenName,
    error,
    extra,
    source: 'client_error',
  });

  if (startupDecision.shouldSuppress) {
    return;
  }

  if (!canWriteRemoteOpsLog()) {
    return;
  }

  try {
    await push(ref(database, 'ops/errors'), entry);
  } catch {
    // silently fail, never throw from logger
  }
};

const logClientEvent = async (type: string, extra: Record<string, unknown> = {}): Promise<void> => {
  const entry: EventEntry = {
    type: String(type || 'unknown'),
    at: Date.now(),
    source: 'client',
    ...(sanitizeValue(extra) as Record<string, unknown>),
  };

  if (!canWriteRemoteOpsLog()) {
    return;
  }

  try {
    await push(ref(database, 'ops/events'), entry);
  } catch {
    // silently fail
  }
};

const getLocalErrors = (): ErrorEntry[] => [...localLog];

const clearLocalErrors = (): void => {
  localLog.length = 0;
};

const safeLogError = (screenName: string, error: unknown, extra: Record<string, unknown> = {}): void => {
  void logClientError(screenName, error, extra);
};

export { logClientError, logClientEvent, getLocalErrors, clearLocalErrors, safeLogError };
