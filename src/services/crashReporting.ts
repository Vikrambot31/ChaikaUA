declare const require: any;

let crashlytics: any = null;
let initialized = false;
let cachedStaticAttributes: Record<string, string> | null = null;

export const CRASH_REPORTING_PROVIDER = 'Firebase Crashlytics';

const MAX_ATTRIBUTE_LENGTH = 1000;
const MAX_LOG_LENGTH = 4000;

const toCrashlyticsValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.slice(0, MAX_ATTRIBUTE_LENGTH);
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return serialized.slice(0, MAX_ATTRIBUTE_LENGTH);
  } catch {
    return String(value).slice(0, MAX_ATTRIBUTE_LENGTH);
  }
};

const getStaticCrashAttributes = (): Record<string, string> => {
  if (cachedStaticAttributes) {
    return cachedStaticAttributes;
  }

  const attributes: Record<string, string> = {};
  try {
    const platform = require('react-native').Platform as { OS?: string; Version?: unknown };
    attributes.platform = String(platform.OS ?? 'unknown');
    attributes.platformVersion = String(platform.Version ?? 'unknown');
  } catch {
    attributes.platform = 'unknown';
  }

  try {
    const app = require('expo-application') as {
      nativeApplicationVersion?: string | null;
      nativeBuildVersion?: string | null;
      applicationId?: string | null;
    };
    attributes.appVersion = String(app.nativeApplicationVersion ?? 'unknown');
    attributes.buildVersion = String(app.nativeBuildVersion ?? 'unknown');
    attributes.applicationId = String(app.applicationId ?? 'unknown');
  } catch {
    attributes.appVersion = 'unknown';
    attributes.buildVersion = 'unknown';
  }

  cachedStaticAttributes = attributes;
  return attributes;
};

const setAttributes = (attributes: Record<string, unknown>): void => {
  if (!crashlytics) {
    return;
  }
  Object.entries(attributes).forEach(([key, value]) => {
    void crashlytics.setAttribute(key, toCrashlyticsValue(value));
  });
};

export const initCrashReporting = (): void => {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const crashlyticsModule = require('@react-native-firebase/crashlytics');
    const crashlyticsFactory = crashlyticsModule?.default ?? crashlyticsModule;
    if (typeof crashlyticsFactory === 'function') {
      crashlytics = crashlyticsFactory();
      void crashlytics.setCrashlyticsCollectionEnabled(true);
      setAttributes(getStaticCrashAttributes());
    }
  } catch {}
};

export const identifyCrashUser = (userId?: string | null): void => {
  const id = userId ?? null;
  if (crashlytics) {
    void crashlytics.setUserId(id ?? '');
  }
};

export const captureCrashException = (error: unknown, context?: Record<string, unknown>): void => {
  const normalized = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
  if (crashlytics) {
    if (context) {
      setAttributes(context);
    }
    crashlytics.recordError(normalized);
  }
};

export const setCrashContext = (context: Record<string, unknown>): void => {
  setAttributes(context);
};

export const recordCrashBreadcrumb = (message: string, context: Record<string, unknown> = {}): void => {
  if (!crashlytics) {
    return;
  }
  const contextText = Object.keys(context).length ? ` ${toCrashlyticsValue(context)}` : '';
  void crashlytics.log(`${message}${contextText}`.slice(0, MAX_LOG_LENGTH));
};
