declare const require: any;

let crashlytics: any = null;
let initialized = false;

export const CRASH_REPORTING_PROVIDER = 'Firebase Crashlytics';

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
      Object.entries(context).forEach(([key, value]) => {
        void crashlytics.setAttribute(key, String(value ?? ''));
      });
    }
    crashlytics.recordError(normalized);
  }
};
