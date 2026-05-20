/**
 * Centralized Error Handler
 * Manages error detection, logging, and user feedback
 */

import { translations, Language } from '../i18n/translations';
import { logClientError } from './errorLogger';
import { captureCrashException } from '../services/crashReporting';

export enum ErrorType {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  type: ErrorType;
  message: string;
  code?: string;
  details?: unknown;
  timestamp: number;
  retryable: boolean;
}

export class ErrorHandler {
  private static errorLog: AppError[] = [];
  private static maxLogSize = 50;
  private static language: Language = 'ua';

  static setLanguage(lang: Language): void {
    this.language = lang;
  }

  private static t(key: keyof typeof translations.ua.errors): string {
    return translations[this.language].errors[key];
  }

  /**
   * Classify error by type
   */
  static classifyError(error: unknown): ErrorType {
    if (!error) return ErrorType.UNKNOWN;

    if (typeof error !== 'object') {
      return ErrorType.UNKNOWN;
    }

    const typedError = error as {
      name?: string;
      message?: string;
      code?: string;
      status?: number;
    };

    const message = typedError.message?.toLowerCase() || '';
    const code = typedError.code;

    // Network errors
    if (typedError.name === 'AbortError' || message.includes('network') || message.includes('fetch failed')) {
      return ErrorType.NETWORK;
    }

    // Timeout errors
    if (code === 'ETIMEDOUT' || message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }

    // HTTP status errors
    if (typedError.status) {
      if (typedError.status === 400 || typedError.status === 422) return ErrorType.VALIDATION;
      if (typedError.status === 401) return ErrorType.AUTHENTICATION;
      if (typedError.status === 403) return ErrorType.AUTHORIZATION;
      if (typedError.status === 404) return ErrorType.NOT_FOUND;
      if (typedError.status >= 500) return ErrorType.SERVER;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Determine if error is retryable
   */
  static isRetryable(errorType: ErrorType): boolean {
    switch (errorType) {
      case ErrorType.NETWORK:
      case ErrorType.TIMEOUT:
      case ErrorType.SERVER:
        return true;
      case ErrorType.VALIDATION:
      case ErrorType.AUTHENTICATION:
      case ErrorType.AUTHORIZATION:
      case ErrorType.NOT_FOUND:
      case ErrorType.UNKNOWN:
        return false;
    }
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: AppError | Error): string {
    if (typeof error === 'object' && error !== null && 'type' in error && 'message' in error) {
      const appError = error as AppError;
      switch (appError.type) {
        case ErrorType.NETWORK:
          return this.t('network');
        case ErrorType.TIMEOUT:
          return this.t('timeout');
        case ErrorType.VALIDATION:
          return this.t('validation');
        case ErrorType.AUTHENTICATION:
          return this.t('authentication');
        case ErrorType.AUTHORIZATION:
          return this.t('authorization');
        case ErrorType.NOT_FOUND:
          return this.t('notFound');
        case ErrorType.SERVER:
          return this.t('server');
        default:
          return this.t('unknown');
      }
    }
    return this.t('general');
  }

  /**
   * Create structured error object
   */
  static createError(
    error: unknown,
    customMessage?: string,
    details?: unknown
  ): AppError {
    const type = this.classifyError(error);
    const normalizedError =
      typeof error === 'object' && error !== null
        ? (error as { message?: string; code?: string })
        : undefined;

    const appError: AppError = {
      type,
      message: customMessage || normalizedError?.message || 'Unknown error',
      code: normalizedError?.code,
      details,
      timestamp: Date.now(),
      retryable: this.isRetryable(type),
    };

    this.logError(appError);
    return appError;
  }

  /**
   * Log error for debugging
   */
  static logError(error: AppError): void {
    this.errorLog.push(error);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    if (__DEV__) {
      console.error('[ErrorHandler]', error.type, error.message, error.details ?? '');
    }

    captureCrashException(new Error(error.message), {
      type: error.type,
      code: error.code ?? '',
      retryable: error.retryable,
    });
  }

  /**
   * Get error log for debugging
   */
  static getErrorLog(): AppError[] {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  static clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Get errors of specific type
   */
  static getErrorsByType(type: ErrorType): AppError[] {
    return this.errorLog.filter((e) => e.type === type);
  }

  /**
   * Get recent errors (last N minutes)
   */
  static getRecentErrors(minutes: number = 5): AppError[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.errorLog.filter((e) => e.timestamp > cutoff);
  }

  /**
   * Safe error wrapper for promises
   */
  static async safeAsync<T>(
    promise: Promise<T>,
    context?: string
  ): Promise<{ success: boolean; data?: T; error?: AppError }> {
    try {
      const data = await promise;
      return { success: true, data };
    } catch (error) {
      const appError = this.createError(error, context);
      return { success: false, error: appError };
    }
  }

  /**
   * Report error to analytics/monitoring service
   */
  static reportError(error: AppError, userId?: string): void {
    const context = userId ? `error_handler:${userId}` : 'error_handler';
    void logClientError(context, new Error(error.message), {
      type: error.type,
      code: error.code ?? null,
      retryable: error.retryable,
      details: error.details ?? null,
    });
  }

  /**
   * Get error recovery suggestions
   */
  static getRecoverySuggestion(error: AppError): string {
    switch (error.type) {
      case ErrorType.NETWORK:
        return this.t('checkConnection');
      case ErrorType.TIMEOUT:
        return this.t('tryAgainLater');
      case ErrorType.VALIDATION:
        return this.t('checkData');
      case ErrorType.AUTHENTICATION:
        return this.t('pleaseLogin');
      case ErrorType.AUTHORIZATION:
        return this.t('noPermission');
      case ErrorType.NOT_FOUND:
        return this.t('resourceUnavailable');
      case ErrorType.SERVER:
        return this.t('serverUnavailable');
      default:
        return this.t('pleaseTryAgain');
    }
  }
}

export default ErrorHandler;
