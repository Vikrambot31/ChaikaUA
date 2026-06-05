import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { classifyStartupTransientIssue } from './startupSync';
import { getSessionId } from './sessionService';
import { getBreadcrumbs } from './breadcrumbService';
import { recordCrashBreadcrumb, setCrashContext } from './crashReporting';

declare const require: any;

export type RuntimeMonitorSeverity = 'info' | 'warning' | 'critical';

export type RuntimeMonitorSource =
  | 'client_error'
  | 'runtime'
  | 'global_handler'
  | 'error_boundary'
  | 'trace';

export type RuntimeMonitorStatus = 'start' | 'progress' | 'success' | 'fail' | 'cancel' | 'timeout';

export interface RuntimeMonitorEntry {
  id: string;
  at: number;
  lastSeenAt?: number;
  repeatCount?: number;
  sessionId?: string;
  /** Unique ID linking all steps of a single submit/upload attempt. */
  operationId?: string;
  appVersion?: string;
  screen: string;
  action?: string;
  status?: RuntimeMonitorStatus;
  /** Duration of the traced operation in milliseconds (only on terminal statuses). */
  durationMs?: number;
  /** true when durationMs exceeded the slow-operation threshold for the feature. */
  slowOp?: boolean;
  shortType: string;
  humanMessage: string;
  severity: RuntimeMonitorSeverity;
  rawMessage: string;
  firebasePath?: string;
  feature?: string;
  stage?: string;
  code?: string;
  firebaseCode?: string;
  networkState?: string;
  deviceInfo?: string;
  androidVersion?: string;
  appMode?: string;
  details?: Record<string, unknown>;
  breadcrumbs?: Array<{ at: number; category: string; message: string; screen?: string }>;
  stack?: string;
  source: RuntimeMonitorSource;
}

type RuntimeMonitorListener = (entries: RuntimeMonitorEntry[]) => void;

type LoggerInput = {
  screen: string;
  error: unknown;
  extra?: Record<string, unknown>;
  source?: RuntimeMonitorSource;
};

type TraceInput = {
  screen: string;
  action: string;
  status: RuntimeMonitorStatus;
  forceRecord?: boolean;
  criticalFlow?: boolean;
  operationId?: string;
  feature?: string;
  stage?: string;
  firebasePath?: string;
  firebaseCode?: string;
  message?: string;
  details?: Record<string, unknown>;
  error?: unknown;
  /**
   * Pass Date.now() from when the operation started.
   * On terminal statuses (success / fail / timeout) the service computes
   * durationMs and flags the entry as slowOp if the threshold is exceeded.
   */
  startedAt?: number;
};

const STORAGE_KEY = '@chaika:runtime_monitor_logs';
const MAX_ENTRIES = 150;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_STACK_LENGTH = 2000;
const MAX_FORMATTED_LOG_LENGTH = 20000;

// Slow-operation thresholds per feature (ms). Exceeded on terminal statuses.
const SLOW_OP_THRESHOLDS: Record<string, number> = {
  gallery: 30_000, // photo uploads: warn after 30 s
};
const SLOW_OP_DEFAULT_MS = 15_000; // all other operations: warn after 15 s

let cachedAppVersion: string | null = null;

const getAppVersion = (): string => {
  if (cachedAppVersion !== null) return cachedAppVersion;
  try {
    const app = require('expo-application') as { nativeApplicationVersion?: string | null };
    if (typeof app.nativeApplicationVersion === 'string' && app.nativeApplicationVersion) {
      cachedAppVersion = app.nativeApplicationVersion;
      return cachedAppVersion;
    }
  } catch { /* noop */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vf = require('../../app-version.json') as { latestVersion?: string };
    if (typeof vf?.latestVersion === 'string') {
      cachedAppVersion = vf.latestVersion;
      return cachedAppVersion;
    }
  } catch { /* noop */ }
  cachedAppVersion = 'unknown';
  return cachedAppVersion;
};
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const SENSITIVE_KEY_RE = /password|token|secret|email|phone|message|content|body|text|description|form/i;
const DEDUP_WINDOW_MS = 20_000;
const listeners = new Set<RuntimeMonitorListener>();

let entries: RuntimeMonitorEntry[] = [];
let hydrationPromise: Promise<void> | null = null;
let globalHandlersInitialized = false;
let latestNetworkState = 'unknown';

// Offline retry: entries that failed to write to Firebase are kept here
// and flushed automatically on the next successful write.
const offlineRetryQueue: RuntimeMonitorEntry[] = [];
const MAX_RETRY_QUEUE = 30;

const redactString = (value: string): string =>
  value
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]');

const sanitizeString = (value: unknown): string =>
  redactString(typeof value === 'string' ? value : String(value ?? ''));

const trimForStorage = (value: string, maxLength = 500): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const BROKEN_TEXT_RE =
  /\uFFFD|[A-Za-z][><@][A-Za-z0-9><@]{2,}|\!\?\>@|D>B>|\?@>|\s[UQWXTV]\s/;

const looksBrokenText = (value: string): boolean => BROKEN_TEXT_RE.test(value);

const stabilizeDisplayText = (primary: string, fallback: string): string => {
  const safePrimary = sanitizeString(primary || '').trim();
  const safeFallback = sanitizeString(fallback || '').trim();

  if (!safePrimary) {
    return safeFallback || 'Runtime error';
  }
  if (looksBrokenText(safePrimary) && safeFallback && !looksBrokenText(safeFallback)) {
    return safeFallback;
  }
  return safePrimary;
};

const sanitizeValue = (value: unknown, key = ''): unknown => {
  if (SENSITIVE_KEY_RE.test(key)) {
    return '[redacted]';
  }
  if (typeof value === 'string') {
    return trimForStorage(sanitizeString(value));
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).slice(0, 30).forEach(([itemKey, itemValue]) => {
      out[itemKey] = sanitizeValue(itemValue, itemKey);
    });
    return out;
  }
  return value;
};

const sanitizeRecord = (value: Record<string, unknown> = {}): Record<string, unknown> =>
  sanitizeValue(value) as Record<string, unknown>;

const normalizeBreadcrumbs = (value: unknown): RuntimeMonitorEntry['breadcrumbs'] => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const breadcrumb = item as {
        at?: unknown;
        category?: unknown;
        message?: unknown;
        screen?: unknown;
      };

      return {
        at: Number(breadcrumb.at ?? Date.now()),
        category: sanitizeString(breadcrumb.category ?? 'runtime'),
        message: sanitizeString(breadcrumb.message ?? ''),
        screen: typeof breadcrumb.screen === 'string' ? sanitizeString(breadcrumb.screen) : undefined,
      };
    });
};

const isDevRuntime = (): boolean => {
  const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
  return typeof runtimeGlobal.__DEV__ === 'boolean' ? runtimeGlobal.__DEV__ : false;
};

const getRuntimeEnvironment = (): Pick<RuntimeMonitorEntry, 'sessionId' | 'appVersion' | 'networkState' | 'deviceInfo' | 'androidVersion' | 'appMode'> => ({
  sessionId: getSessionId(),
  appVersion: getAppVersion(),
  networkState: latestNetworkState,
  deviceInfo: `${Platform.OS}${Platform.Version ? ` ${String(Platform.Version)}` : ''}`,
  androidVersion: Platform.OS === 'android' ? String(Platform.Version) : undefined,
  appMode: isDevRuntime() ? 'debug' : 'release',
});

const doRemoteWrite = async (entry: RuntimeMonitorEntry): Promise<void> => {
  const firebaseCore = require('../firebase-core') as typeof import('../firebase-core');
  const databaseModule = require('firebase/database') as typeof import('firebase/database');
  const user = firebaseCore.auth.currentUser;
  if (!user || user.isAnonymous) {
    return;
  }
  await databaseModule.push(databaseModule.ref(firebaseCore.database, 'diagnostics/runtime'),
    sanitizeRecord(entry as unknown as Record<string, unknown>),
  );
};

const persistRemoteDiagnostic = async (entry: RuntimeMonitorEntry): Promise<void> => {
  // Flush queued offline entries first (if network is back)
  if (offlineRetryQueue.length > 0) {
    const toFlush = offlineRetryQueue.splice(0, offlineRetryQueue.length);
    for (const pending of toFlush) {
      try {
        await doRemoteWrite(pending);
      } catch {
        // Network still down - re-queue silently (don't loop forever)
        if (offlineRetryQueue.length < MAX_RETRY_QUEUE) {
          offlineRetryQueue.unshift(pending);
        }
        break;
      }
    }
  }

  try {
    await doRemoteWrite(entry);
  } catch {
    // Network unavailable - queue for next attempt
    if (offlineRetryQueue.length < MAX_RETRY_QUEUE) {
      offlineRetryQueue.push(entry);
    }
  }
};

const emit = (): void => {
  const snapshot = [...entries];
  listeners.forEach((listener) => listener(snapshot));
};

const persist = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort cache only.
  }
};

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return sanitizeString(error.message || error.name || 'Unknown error');
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return sanitizeString((error as { message?: unknown }).message ?? 'Unknown error');
  }
  return sanitizeString(error || 'Unknown error');
};

const normalizeErrorStack = (error: unknown): string | undefined => {
  if (error instanceof Error && typeof error.stack === 'string' && error.stack.trim()) {
    return trimForStorage(sanitizeString(error.stack.trim()), MAX_STACK_LENGTH);
  }
  if (error && typeof error === 'object' && 'stack' in error) {
    const stack = (error as { stack?: unknown }).stack;
    if (typeof stack === 'string' && stack.trim()) {
      return trimForStorage(sanitizeString(stack.trim()), MAX_STACK_LENGTH);
    }
  }
  return undefined;
};

const extractErrorCode = (error: unknown): string | undefined => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;

  return typeof code === 'string' && code.trim() ? sanitizeString(code.trim()) : undefined;
};

const extractFirebasePath = (screen: string, extra: Record<string, unknown> = {}): string | undefined => {
  const directPathKeys = ['firebasePath', 'path', 'storagePath', 'dbPath'];
  for (const key of directPathKeys) {
    const value = extra[key];
    if (typeof value === 'string' && value.trim() && !SENSITIVE_KEY_RE.test(key)) {
      return sanitizeString(value.trim());
    }
  }

  const section = typeof extra.section === 'string' ? sanitizeString(extra.section) : '';
  if (section.startsWith('osbb_') || section.startsWith('service_')) {
    return section;
  }

  if (screen.includes('firebaseChatAPI')) return 'requests';
  if (screen.includes('photoAPI')) return 'photos';
  if (screen.includes('buySell')) return 'buy_sell';
  if (screen.includes('Kontakt') || screen.includes('Contact')) return 'contacts';
  if (screen.includes('job')) return 'jobs';
  if (screen.includes('lostFound')) return 'lost_found';
  if (screen.includes('local_business')) return 'local_business';

  return undefined;
};

const buildShortTypeAndMessage = (
  screen: string,
  rawMessage: string,
  extra: Record<string, unknown> = {},
): Pick<RuntimeMonitorEntry, 'shortType' | 'humanMessage' | 'severity'> => {
  const haystack = `${screen} ${rawMessage} ${JSON.stringify(extra)}`.toLowerCase();
  const isGalleryUpload =
    screen.includes('PhotoUploadScreen') ||
    screen.includes('photoAPI.uploadPhotoToStorage') ||
    screen.includes('photoAPI.addPhoto') ||
    (typeof extra.feature === 'string' && extra.feature === 'gallery');
  const isPermission = /permission|denied|unauthorized|forbidden/.test(haystack);
  const isTimeout = /timeout|timed out|time out/.test(haystack);
  const isUpload = /upload|storage|photo|image/.test(haystack);
  const isPicker = /picker|getpendingresult|no usable asset|uri/.test(haystack);
  const isForm = /submit|saveprofile|request|form|local_business|addrequest/.test(haystack);
  const isCallable = /callable|function|httpscallable|cloud function/.test(haystack);
  const isModeration = /moderation|moderator|serviceModeration/i.test(screen);
  const isSync = /sync|subscribe|onvalue|realtime/.test(haystack);
  const isCrash = /fatal|crash|errorboundary|render|unhandled/.test(haystack);
  const isFirebase = /firebase|rtdb|database/.test(haystack);
  const noUri = /no usable asset|не вернул uri|returned null|picker returned without/iu.test(haystack);
  const isFileTooLarge = /too large|file too large|слишком большой|велике|5 мб|5mb/iu.test(haystack);
  const isUnsupported = /unsupported|format|mime|webp|png|jpg|jpeg/.test(haystack);
  const isNetwork = /network|offline|fetch|internet|connection lost/.test(haystack);
  const isUnknownModule = /requiring unknown module "undefined"|requiring unknown module/.test(haystack);
  const isAtobMissing = /property 'atob' doesn't exist|atob doesn't exist|atob is not defined/.test(haystack);
  const isConnectionLost = /firebase_connection|firebase_reconnecting|connection lost|onrealtimedisconnect_|onconnectionlost_/.test(haystack);

  if (isUnknownModule) {
    return {
      shortType: 'Сбой загрузки модуля',
      humanMessage: 'Runtime не смог загрузить JS-модуль. Обычно это dynamic require/import с undefined или отсутствующий пакет в release bundle.',
      severity: 'critical',
    };
  }

  if (isAtobMissing) {
    return {
      shortType: 'Сбой декодирования файла',
      humanMessage: 'В среде React Native отсутствует atob. Из-за этого чтение base64 для upload прерывается до отправки в Firebase.',
      severity: 'critical',
    };
  }

  if (isConnectionLost) {
    return {
      shortType: 'Firebase: переподключение',
      humanMessage: 'Временная пауза соединения с Firebase. Это нормальное поведение сети, приложение переподключится автоматически.',
      severity: 'info',
    };
  }

  if (isGalleryUpload) {
    if (noUri || isPicker) {
      return {
        shortType: 'Галерея: фото не выбрано',
        humanMessage: 'Сбой на этапе выбора фото. Пикер не вернул URI файла из телефона.',
        severity: 'warning',
      };
    }

    if (isPermission) {
      return {
        shortType: 'Галерея: нет доступа к фото',
        humanMessage: 'Приложению не разрешён доступ к галерее/камере или Firebase Rules запретили операцию.',
        severity: 'critical',
      };
    }

    if (isFileTooLarge) {
      return {
        shortType: 'Галерея: файл слишком большой',
        humanMessage: 'Фото отклонено из-за размера файла. Выберите фото поменьше или повторите с другой компрессией.',
        severity: 'warning',
      };
    }

    if (isUnsupported) {
      return {
        shortType: 'Галерея: формат не поддержан',
        humanMessage: 'Выбранный файл не прошёл проверку формата. Нужен JPG/PNG/WEBP.',
        severity: 'warning',
      };
    }

    if (isTimeout || isNetwork) {
      return {
        shortType: 'Галерея: upload timeout',
        humanMessage: 'Сбой сети или таймаут при отправке фото в Firebase Storage.',
        severity: 'critical',
      };
    }

    if (isUpload || isFirebase || isForm) {
      return {
        shortType: 'Галерея: фото не загружено',
        humanMessage: 'Сбой на этапе upload или сохранения карточки фото в Firebase. Смотрите техническую причину ниже.',
        severity: 'critical',
      };
    }
  }

  if (isCrash) {
    return {
      shortType: 'Сбой интерфейса',
      humanMessage: 'Произошла runtime ошибка в интерфейсе. Экран или React-компонент завершился с исключением.',
      severity: 'critical',
    };
  }

  if (isPicker || noUri) {
    return {
      shortType: 'Фото не выбрано',
      humanMessage: 'Android picker не вернул URI, вернул пустой результат или завершился с ошибкой.',
      severity: 'warning',
    };
  }

  if (isUpload && isTimeout) {
    return {
      shortType: 'Фото не загружено',
      humanMessage: 'Firebase Storage не ответил вовремя. Загрузка файла прервалась по таймауту.',
      severity: 'critical',
    };
  }

  if (isUpload) {
    return {
      shortType: 'Фото не загружено',
      humanMessage: 'Ошибка при загрузке файла или работе с Firebase Storage.',
      severity: isPermission ? 'critical' : 'warning',
    };
  }

  if (isPermission && isModeration) {
    return {
      shortType: 'Ошибка модерации',
      humanMessage: 'Действие модератора отклонено. Скорее всего Firebase Rules запретили запись или удаление.',
      severity: 'critical',
    };
  }

  if (isPermission) {
    return {
      shortType: 'Доступ запрещён',
      humanMessage: 'Firebase Rules или права доступа запретили эту операцию.',
      severity: 'critical',
    };
  }

  if (isCallable) {
    return {
      shortType: 'Cloud Function не ответила',
      humanMessage: 'Вызов серверной функции завершился ошибкой или вернул неуспешный ответ.',
      severity: 'critical',
    };
  }

  if (isForm && isTimeout) {
    return {
      shortType: 'Форма не отправлена',
      humanMessage: 'Отправка формы зависла слишком долго. Возможна проблема сети или медленный ответ Firebase.',
      severity: 'warning',
    };
  }

  if (isForm) {
    return {
      shortType: 'Форма не отправлена',
      humanMessage: 'Ошибка во время отправки или сохранения формы. Запись не дошла до Firebase полностью.',
      severity: 'warning',
    };
  }

  if (isModeration) {
    return {
      shortType: 'Ошибка модерации',
      humanMessage: 'Во время загрузки данных модерации или выполнения действия произошёл сбой.',
      severity: 'warning',
    };
  }

  if (isSync) {
    return {
      shortType: 'Сбой синхронизации',
      humanMessage: 'Realtime-обновление не смогло корректно получить или обновить данные.',
      severity: 'warning',
    };
  }

  if (isFirebase) {
    return {
      shortType: 'Ошибка Firebase',
      humanMessage: 'Операция Firebase завершилась ошибкой. Проверьте сеть, Rules и структуру данных.',
      severity: isTimeout ? 'warning' : 'critical',
    };
  }

  return {
    shortType: 'Runtime ошибка',
    humanMessage: 'Во время работы приложения произошла внутренняя ошибка.',
    severity: 'warning',
  };
};

const createEntryFromLogger = ({
  screen,
  error,
  extra = {},
  source = 'client_error',
}: LoggerInput): RuntimeMonitorEntry | null => {
  const rawMessage = normalizeErrorMessage(error);
  const startupDecision = classifyStartupTransientIssue({
    screen,
    rawMessage,
    extra,
    source,
  });
  if (startupDecision.shouldSuppress) {
    return null;
  }
  const description = buildShortTypeAndMessage(screen, rawMessage, extra);

  const severity = description.severity;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    repeatCount: 1,
    screen: sanitizeString(screen || 'unknown'),
    shortType: stabilizeDisplayText(description.shortType, 'Runtime error'),
    humanMessage: stabilizeDisplayText(description.humanMessage, rawMessage || 'Runtime error occurred'),
    severity,
    rawMessage,
    firebasePath: extractFirebasePath(screen, extra),
    feature: typeof extra.feature === 'string' ? sanitizeString(extra.feature) : undefined,
    stage: typeof extra.stage === 'string' ? sanitizeString(extra.stage) : undefined,
    code: extractErrorCode(error),
    firebaseCode: extractErrorCode(error) || (typeof extra.code === 'string' ? sanitizeString(extra.code) : undefined),
    details: sanitizeRecord(extra),
    ...getRuntimeEnvironment(),
    breadcrumbs: severity === 'critical' ? getBreadcrumbs() : undefined,
    stack: normalizeErrorStack(error),
    source,
  };
};

const TERMINAL_STATUSES: RuntimeMonitorStatus[] = ['success', 'fail', 'timeout', 'cancel'];

const createEntryFromTrace = ({
  screen,
  action,
  status,
  operationId,
  feature,
  stage,
  firebasePath,
  firebaseCode,
  message,
  details = {},
  error,
  startedAt,
}: TraceInput): RuntimeMonitorEntry => {
  const rawMessage = error ? normalizeErrorMessage(error) : sanitizeString(message || `${action}:${status}`);

  // Compute duration on terminal statuses when caller passed startedAt.
  const isTerminal = TERMINAL_STATUSES.includes(status);
  const durationMs =
    isTerminal && typeof startedAt === 'number' && startedAt > 0
      ? Date.now() - startedAt
      : undefined;

  const slowOpThreshold =
    feature && Object.prototype.hasOwnProperty.call(SLOW_OP_THRESHOLDS, feature)
      ? SLOW_OP_THRESHOLDS[feature]
      : SLOW_OP_DEFAULT_MS;
  const slowOp = durationMs !== undefined && durationMs > slowOpThreshold ? true : undefined;

  const severity: RuntimeMonitorSeverity =
    status === 'fail' || status === 'timeout'
      ? 'critical'
      : slowOp
        ? 'warning'
        : 'info';

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    repeatCount: 1,
    screen: sanitizeString(screen || 'unknown'),
    action: sanitizeString(action || 'unknown_action'),
    status,
    durationMs,
    slowOp,
    shortType: slowOp
      ? `${sanitizeString(action || 'Action')} · slow (${Math.round(durationMs! / 1000)}s)`
      : `${sanitizeString(action || 'Action')} · ${status}`,
    humanMessage: slowOp
      ? `Медленная операция: ${sanitizeString(action || 'action')} завершилась за ${Math.round(durationMs! / 1000)}с (порог ${Math.round(slowOpThreshold / 1000)}с).`
      : message
        ? sanitizeString(message)
        : `Runtime trace: ${sanitizeString(action || 'action')} завершился со статусом ${status}.`,
    severity,
    rawMessage,
    firebasePath: firebasePath ? sanitizeString(firebasePath) : extractFirebasePath(screen, details),
    feature: feature ? sanitizeString(feature) : undefined,
    stage: stage ? sanitizeString(stage) : undefined,
    code: error ? extractErrorCode(error) : undefined,
    firebaseCode: firebaseCode ? sanitizeString(firebaseCode) : error ? extractErrorCode(error) : undefined,
    operationId: operationId ? sanitizeString(operationId) : undefined,
    details: sanitizeRecord(details),
    ...getRuntimeEnvironment(),
    breadcrumbs: severity === 'critical' ? getBreadcrumbs() : undefined,
    stack: error ? normalizeErrorStack(error) : undefined,
    source: 'trace',
  };
};

const buildFingerprint = (entry: RuntimeMonitorEntry): string =>
  [
    entry.screen,
    entry.shortType,
    entry.severity,
    entry.firebasePath ?? '',
    entry.code ?? '',
    entry.action ?? '',
    entry.status ?? '',
    entry.rawMessage,
  ].join('|');

const appendEntry = async (entry: RuntimeMonitorEntry): Promise<void> => {
  recordCrashBreadcrumb(`runtime:${entry.screen}:${entry.action ?? entry.shortType}:${entry.status ?? entry.severity}`, {
    severity: entry.severity,
    feature: entry.feature,
    stage: entry.stage,
    code: entry.code ?? entry.firebaseCode,
    androidVersion: entry.androidVersion,
  });
  setCrashContext({
    lastRuntimeScreen: entry.screen,
    lastRuntimeAction: entry.action ?? entry.shortType,
    lastRuntimeStatus: entry.status ?? entry.severity,
    lastRuntimeStage: entry.stage ?? '',
    lastRuntimeFeature: entry.feature ?? '',
    lastRuntimeAt: new Date(entry.at).toISOString(),
  });

  const existingIndex = entries.findIndex((item) => buildFingerprint(item) === buildFingerprint(entry));
  if (existingIndex >= 0) {
    const existing = entries[existingIndex];
    if (entry.at - existing.at <= DEDUP_WINDOW_MS) {
      const merged: RuntimeMonitorEntry = {
        ...existing,
        at: entry.at,
        lastSeenAt: entry.at,
        repeatCount: (existing.repeatCount ?? 1) + 1,
      };
      const nextEntries = [...entries];
      nextEntries.splice(existingIndex, 1);
      entries = [merged, ...nextEntries].slice(0, MAX_ENTRIES);
      emit();
      await persist();
      return;
    }
  }

  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  await persist();
  void persistRemoteDiagnostic(entry);
};

export const initRuntimeMonitor = async (): Promise<void> => {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return;
        }

        const ttlCutoff = Date.now() - TTL_MS;
        entries = parsed
          .filter((item) => item && typeof item === 'object' && Number((item as { at?: unknown }).at ?? 0) > ttlCutoff)
          .map((item) => ({
            id: sanitizeString((item as { id?: unknown }).id ?? ''),
            at: Number((item as { at?: unknown }).at ?? Date.now()),
            lastSeenAt: Number((item as { lastSeenAt?: unknown }).lastSeenAt ?? (item as { at?: unknown }).at ?? Date.now()),
            repeatCount: Number((item as { repeatCount?: unknown }).repeatCount ?? 1),
            sessionId: typeof (item as { sessionId?: unknown }).sessionId === 'string'
              ? sanitizeString((item as { sessionId?: string }).sessionId)
              : undefined,
            operationId: typeof (item as { operationId?: unknown }).operationId === 'string'
              ? sanitizeString((item as { operationId?: string }).operationId)
              : undefined,
            appVersion: typeof (item as { appVersion?: unknown }).appVersion === 'string'
              ? sanitizeString((item as { appVersion?: string }).appVersion)
              : undefined,
            screen: sanitizeString((item as { screen?: unknown }).screen ?? 'unknown'),
            action: typeof (item as { action?: unknown }).action === 'string'
              ? sanitizeString((item as { action?: string }).action)
              : undefined,
            status: ((item as { status?: RuntimeMonitorStatus }).status ?? undefined),
            durationMs: typeof (item as { durationMs?: unknown }).durationMs === 'number'
              ? (item as { durationMs: number }).durationMs
              : undefined,
            slowOp: (item as { slowOp?: unknown }).slowOp === true ? true : undefined,
            shortType: sanitizeString((item as { shortType?: unknown }).shortType ?? 'Runtime ошибка'),
            humanMessage: sanitizeString((item as { humanMessage?: unknown }).humanMessage ?? 'Произошла ошибка.'),
            severity: ((item as { severity?: RuntimeMonitorSeverity }).severity ?? 'warning'),
            rawMessage: sanitizeString((item as { rawMessage?: unknown }).rawMessage ?? ''),
            firebasePath: typeof (item as { firebasePath?: unknown }).firebasePath === 'string'
              ? sanitizeString((item as { firebasePath?: string }).firebasePath)
              : undefined,
            feature: typeof (item as { feature?: unknown }).feature === 'string'
              ? sanitizeString((item as { feature?: string }).feature)
              : undefined,
            stage: typeof (item as { stage?: unknown }).stage === 'string'
              ? sanitizeString((item as { stage?: string }).stage)
              : undefined,
            code: typeof (item as { code?: unknown }).code === 'string'
              ? sanitizeString((item as { code?: string }).code)
              : undefined,
            firebaseCode: typeof (item as { firebaseCode?: unknown }).firebaseCode === 'string'
              ? sanitizeString((item as { firebaseCode?: string }).firebaseCode)
              : undefined,
            networkState: typeof (item as { networkState?: unknown }).networkState === 'string'
              ? sanitizeString((item as { networkState?: string }).networkState)
              : undefined,
            deviceInfo: typeof (item as { deviceInfo?: unknown }).deviceInfo === 'string'
              ? sanitizeString((item as { deviceInfo?: string }).deviceInfo)
              : undefined,
            androidVersion: typeof (item as { androidVersion?: unknown }).androidVersion === 'string'
              ? sanitizeString((item as { androidVersion?: string }).androidVersion)
              : undefined,
            appMode: typeof (item as { appMode?: unknown }).appMode === 'string'
              ? sanitizeString((item as { appMode?: string }).appMode)
              : undefined,
            details: (item as { details?: unknown }).details && typeof (item as { details?: unknown }).details === 'object'
              ? sanitizeRecord((item as { details?: Record<string, unknown> }).details)
              : undefined,
            breadcrumbs: normalizeBreadcrumbs((item as { breadcrumbs?: unknown }).breadcrumbs),
            stack: typeof (item as { stack?: unknown }).stack === 'string'
              ? sanitizeString((item as { stack?: string }).stack)
              : undefined,
            source: ((item as { source?: RuntimeMonitorSource }).source ?? 'client_error'),
          }))
          .slice(0, MAX_ENTRIES);
      } catch {
        entries = [];
      } finally {
        emit();
      }
    })();
  }

  await hydrationPromise;
};

export const recordRuntimeMonitorError = async (input: LoggerInput): Promise<void> => {
  await initRuntimeMonitor();
  const entry = createEntryFromLogger(input);
  if (!entry) {
    return;
  }
  await appendEntry(entry);
};

export const recordRuntimeTrace = async (input: TraceInput): Promise<void> => {
  const shouldRecord =
    input.forceRecord ||
    input.criticalFlow ||
    input.status === 'fail' ||
    input.status === 'timeout' ||
    input.status === 'cancel' ||
    Boolean(input.error);

  if (!shouldRecord) {
    return;
  }

  await initRuntimeMonitor();
  await appendEntry(createEntryFromTrace(input));
};

/** Returns all trace entries for a given operationId, ordered by time. */
export const getTracesByOperationId = (opId: string): RuntimeMonitorEntry[] =>
  entries
    .filter((e) => e.operationId === opId)
    .sort((a, b) => a.at - b.at);

export const setRuntimeMonitorNetworkState = (state: string): void => {
  latestNetworkState = sanitizeString(state || 'unknown');
};

export const getRuntimeMonitorEntries = (): RuntimeMonitorEntry[] => [...entries];

export const subscribeRuntimeMonitor = (listener: RuntimeMonitorListener): (() => void) => {
  listeners.add(listener);
  listener([...entries]);
  void initRuntimeMonitor();
  return () => {
    listeners.delete(listener);
  };
};

export const clearRuntimeMonitorEntries = async (): Promise<void> => {
  entries = [];
  emit();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
};

export const formatRuntimeMonitorEntries = (items: RuntimeMonitorEntry[] = entries): string =>
  items
    .slice(0, MAX_ENTRIES)
    .map((item) => {
      const lines = [
        `[${new Date(item.at).toLocaleString('ru-RU')}] ${item.severity.toUpperCase()} - ${item.shortType}`,
        `Повторы: ${item.repeatCount ?? 1}`,
        `Экран: ${item.screen}`,
        item.action ? `Action: ${item.action}` : '',
        item.status ? `Status: ${item.status}` : '',
        `Объяснение: ${item.humanMessage}`,
        `Техническая причина: ${item.rawMessage || 'нет данных'}`,
      ].filter(Boolean);

      if (item.firebasePath) {
        lines.push(`Firebase путь: ${item.firebasePath}`);
      }
      if (item.stage) {
        lines.push(`Этап: ${item.stage}`);
      }

      if (item.code) {
        lines.push(`Код: ${item.code}`);
      }
      if (item.firebaseCode) {
        lines.push(`Firebase code: ${item.firebaseCode}`);
      }
      if (item.sessionId) {
        lines.push(`Session: ${item.sessionId}`);
      }
      if (item.appVersion) {
        lines.push(`AppVersion: ${item.appVersion}`);
      }
      if (item.networkState) {
        lines.push(`Network: ${item.networkState}`);
      }
      if (item.deviceInfo) {
        lines.push(`Device: ${item.deviceInfo}`);
      }
      if (item.androidVersion) {
        lines.push(`Android: ${item.androidVersion}`);
      }
      if (item.appMode) {
        lines.push(`Mode: ${item.appMode}`);
      }
      if (item.details && Object.keys(item.details).length) {
        lines.push(`Details: ${JSON.stringify(item.details, null, 2)}`);
      }
      if (item.breadcrumbs && item.breadcrumbs.length > 0) {
        lines.push(`Breadcrumbs (последние ${item.breadcrumbs.length} действий):`);
        item.breadcrumbs.forEach((b) => {
          const t = new Date(b.at).toLocaleTimeString('ru-RU');
          lines.push(`  [${t}] ${b.category} ${b.screen ? `(${b.screen}) ` : ''}-> ${b.message}`);
        });
      }

      lines.push(`Source: ${item.source}`);
      if (item.stack) {
        lines.push(`Stack: ${item.stack}`);
      }

      return lines.join('\n');
    })
    .join('\n\n')
    .slice(0, MAX_FORMATTED_LOG_LENGTH);

const PROBLEMATIC_KEYWORDS = [
  'error',
  'warning',
  'failed',
  'fail',
  'rejected',
  'timeout',
  'upload fail',
  'upload failed',
  'network fail',
  'firebase fail',
  'unhandled promise',
  'crash',
  'exception',
  'permission denied',
];

const includesProblematicKeyword = (value: string): boolean => {
  const haystack = value.toLowerCase();
  return PROBLEMATIC_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

export const isProblematicRuntimeMonitorEntry = (item: RuntimeMonitorEntry): boolean => {
  if (item.severity === 'critical' || item.severity === 'warning') {
    return true;
  }

  if (item.status === 'fail' || item.status === 'timeout') {
    return true;
  }

  const joined = [
    item.shortType,
    item.humanMessage,
    item.rawMessage,
    item.action ?? '',
    item.code ?? '',
    item.firebaseCode ?? '',
    item.feature ?? '',
    item.source,
  ].join(' ');

  return includesProblematicKeyword(joined);
};

const severityRank: Record<RuntimeMonitorSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const sortRuntimeMonitorBySeverity = (items: RuntimeMonitorEntry[]): RuntimeMonitorEntry[] =>
  [...items].sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const statusWeight = (entry: RuntimeMonitorEntry): number => {
      if (entry.status === 'fail') return 0;
      if (entry.status === 'timeout') return 1;
      if (entry.status === 'cancel') return 2;
      if (entry.status === 'progress') return 3;
      if (entry.status === 'start') return 4;
      return 5;
    };

    const statusDiff = statusWeight(a) - statusWeight(b);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    return b.at - a.at;
  });

export const formatProblematicRuntimeMonitorEntries = (items: RuntimeMonitorEntry[] = entries): string =>
  items
    .filter(isProblematicRuntimeMonitorEntry)
    .slice(0, MAX_ENTRIES)
    .map((item) => {
      const lines = [
        `[${new Date(item.at).toLocaleString('ru-RU')}] ${item.severity.toUpperCase()} ${item.status ? `(${item.status.toUpperCase()})` : ''}`.trim(),
        `screen: ${item.screen}`,
        `action: ${item.action || '-'}`,
        `message: ${item.humanMessage || '-'}`,
        `error_code: ${item.code || '-'}`,
        `firebase_code: ${item.firebaseCode || '-'}`,
        `device_info: ${item.deviceInfo || '-'}`,
        `android_version: ${item.androidVersion || '-'}`,
        `raw: ${item.rawMessage || '-'}`,
      ];

      if (item.stack) {
        lines.push(`stack_trace: ${item.stack}`);
      }

      return lines.join('\n');
    })
    .join('\n\n')
    .slice(0, MAX_FORMATTED_LOG_LENGTH);

export const initRuntimeMonitorGlobalHandlers = (): void => {
  if (globalHandlersInitialized) {
    return;
  }
  globalHandlersInitialized = true;

  const globalErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined; setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void } }).ErrorUtils;
  const previousHandler = globalErrorUtils?.getGlobalHandler?.();

  globalErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    void recordRuntimeMonitorError({
      screen: isFatal ? 'GlobalFatalHandler' : 'GlobalErrorHandler',
      error,
      extra: { isFatal: Boolean(isFatal) },
      source: 'global_handler',
    });
    previousHandler?.(error, isFatal);
  });

  const globalTarget = globalThis as {
    onunhandledrejection?: ((event: { reason?: unknown }) => void) | null;
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };

  const rejectionHandler = (event: { reason?: unknown }) => {
    void recordRuntimeMonitorError({
      screen: 'UnhandledPromiseRejection',
      error: event?.reason ?? 'Unhandled promise rejection',
      source: 'global_handler',
    });
  };

  if (typeof globalTarget.addEventListener === 'function') {
    try {
      globalTarget.addEventListener('unhandledrejection', rejectionHandler);
      return;
    } catch {
      // fallback below
    }
  }

  const previousRejectionHandler = globalTarget.onunhandledrejection;
  globalTarget.onunhandledrejection = (event) => {
    rejectionHandler(event);
    previousRejectionHandler?.(event);
  };
};

