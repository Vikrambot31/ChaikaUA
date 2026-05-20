import { push, ref, set } from 'firebase/database';
import { auth, database } from '../firebase-core';
import { logClientError } from '../utils/errorLogger';

export type SecurityAuditEventType =
  | 'device_registered'
  | 'device_blocked'
  | 'device_revoked'
  | 'maintenance_enabled'
  | 'app_disabled'
  | 'force_update_enabled'
  | 'admin_login'
  | 'role_changed'
  | 'security_violation'
  | 'blocked_access_attempt';

type SecurityAuditMetadata = Record<string, string | number | boolean | null | undefined>;

const SECURITY_LOGS_PATH = 'security_logs/client_events';
const LOG_THROTTLE_WINDOW_MS = 30 * 1000;
const BLOCKED_METADATA_KEYS = new Set([
  'phone',
  'email',
  'audio',
  'request_body',
  'requestBody',
  'transcript',
  'pii',
]);

const sanitizeMetadata = (metadata?: SecurityAuditMetadata): SecurityAuditMetadata | undefined => {
  if (!metadata) {
    return undefined;
  }

  const cleaned = Object.entries(metadata).reduce<SecurityAuditMetadata>((acc, [key, value]) => {
    if (BLOCKED_METADATA_KEYS.has(key)) {
      return acc;
    }

    if (typeof value === 'string') {
      acc[key] = value.slice(0, 200);
      return acc;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      acc[key] = value;
    }

    return acc;
  }, {});

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

const recentLogEntries = new Map<string, number>();

const createEventFingerprint = (
  eventType: SecurityAuditEventType,
  uid: string | null,
  metadata?: SecurityAuditMetadata,
): string => {
  const normalizedMetadata = metadata
    ? Object.keys(metadata)
      .sort()
      .map((key) => `${key}:${String(metadata[key])}`)
      .join('|')
    : '';

  return `${uid ?? 'anonymous'}::${eventType}::${normalizedMetadata}`;
};

const shouldThrottleEvent = (
  eventType: SecurityAuditEventType,
  uid: string | null,
  metadata?: SecurityAuditMetadata,
): boolean => {
  const now = Date.now();

  for (const [fingerprint, timestamp] of recentLogEntries.entries()) {
    if (now - timestamp > LOG_THROTTLE_WINDOW_MS) {
      recentLogEntries.delete(fingerprint);
    }
  }

  const fingerprint = createEventFingerprint(eventType, uid, metadata);
  const previousTimestamp = recentLogEntries.get(fingerprint);
  if (previousTimestamp && now - previousTimestamp < LOG_THROTTLE_WINDOW_MS) {
    return true;
  }

  recentLogEntries.set(fingerprint, now);
  return false;
};

const getPartitionKey = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}_${month}`;
};

export const logSecurityAuditEvent = async (
  eventType: SecurityAuditEventType,
  metadata?: SecurityAuditMetadata,
): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid ?? null;
    const sanitizedMetadata = sanitizeMetadata(metadata);
    if (shouldThrottleEvent(eventType, uid, sanitizedMetadata)) {
      return;
    }

    const partitionKey = getPartitionKey();
    const logsRef = ref(database, `${SECURITY_LOGS_PATH}/${partitionKey}`);
    const entryRef = push(logsRef);

    await set(entryRef, {
      event_type: eventType,
      uid,
      created_at: Date.now(),
      metadata: sanitizedMetadata ?? null,
    });
  } catch (error) {
    void logClientError('securityAuditLogger.logSecurityAuditEvent', error, {
      eventType,
    });
  }
};
