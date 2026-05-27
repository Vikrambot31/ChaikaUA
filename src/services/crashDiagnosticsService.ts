import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_CRASH_KEY = '@chaika:last_crash_diagnostic';
const CONSOLE_ERRORS_KEY = '@chaika:console_errors_log';
const MAX_CONSOLE_ERRORS = 50;

export interface CrashDiagnostic {
  timestamp: number;
  message: string;
  stack?: string;
  componentStack?: string;
  errorType?: string;
  errorCode?: string;
}

export interface ConsoleErrorLog {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
  args?: unknown[];
}

export const saveLastCrash = async (crash: CrashDiagnostic): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_CRASH_KEY, JSON.stringify(crash));
  } catch (error) {
    if (__DEV__) console.warn('Failed to save crash diagnostic', error);
  }
};

export const getLastCrash = async (): Promise<CrashDiagnostic | null> => {
  try {
    const data = await AsyncStorage.getItem(LAST_CRASH_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    if (__DEV__) console.warn('Failed to get last crash', error);
    return null;
  }
};

export const clearLastCrash = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LAST_CRASH_KEY);
  } catch (error) {
    if (__DEV__) console.warn('Failed to clear last crash', error);
  }
};

export const addConsoleError = async (log: ConsoleErrorLog): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(CONSOLE_ERRORS_KEY);
    const logs: ConsoleErrorLog[] = existing ? JSON.parse(existing) : [];
    logs.push(log);
    // Keep only the latest errors
    const trimmed = logs.slice(-MAX_CONSOLE_ERRORS);
    await AsyncStorage.setItem(CONSOLE_ERRORS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    if (__DEV__) console.warn('Failed to add console error log', error);
  }
};

export const getConsoleErrors = async (): Promise<ConsoleErrorLog[]> => {
  try {
    const data = await AsyncStorage.getItem(CONSOLE_ERRORS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    if (__DEV__) console.warn('Failed to get console errors', error);
    return [];
  }
};

export const clearConsoleErrors = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CONSOLE_ERRORS_KEY);
  } catch (error) {
    if (__DEV__) console.warn('Failed to clear console errors', error);
  }
};

/**
 * Initialize console error capturing.
 * This patches console.error to log all errors to AsyncStorage.
 */
export const initConsoleErrorCapture = (): (() => void) => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;

  const safeLogToStorage = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
    try {
      const message = args
        .map((arg) => {
          if (typeof arg === 'string') return arg;
          try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
        })
        .join(' ')
        .slice(0, 500);

      void addConsoleError({
        timestamp: Date.now(),
        level,
        message,
        args: level === 'error' ? args : undefined,
      });
    } catch {
      // safeLogToStorage must never throw — original console call must always succeed
    }
  };

  console.error = (...args: unknown[]) => {
    safeLogToStorage('error', args);
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    safeLogToStorage('warn', args);
    originalConsoleWarn.apply(console, args);
  };

  console.log = (...args: unknown[]) => {
    // Only log actual errors/warnings (opt-in via special prefix)
    if (
      args.length > 0 &&
      typeof args[0] === 'string' &&
      args[0].startsWith('[DIAGNOSTIC]')
    ) {
      safeLogToStorage('log', args);
    }
    originalConsoleLog.apply(console, args);
  };

  // Return cleanup function
  return () => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  };
};
