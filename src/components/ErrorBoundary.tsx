import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Clipboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';
import type { RootState } from '../redux/store';
import { ErrorHandler, AppError, ErrorType } from '../utils/errorHandler';
import { captureCrashException } from '../services/crashReporting';
import { recordRuntimeMonitorError } from '../services/runtimeMonitorService';
import { getBreadcrumbs } from '../services/breadcrumbService';
import { captureStateSnapshot } from '../services/stateSnapshotService';
import { normalizeLanguage } from '../redux/slices/languageSlice';
import { saveLastCrash } from '../services/crashDiagnosticsService';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Сталася помилка',
    debugTitle: 'Деталі помилки (розробка)',
    debugMsg: 'Повідомлення',
    debugCode: 'Код',
    debugType: 'Тип',
    debugTime: 'Час',
    debugDetails: 'Деталі',
    errorCountMsg: (count: number) => `Кількість помилок: ${count}. Якщо проблема зберігається, зверніться з підтримкою: support_chaika_ua@ukr.net`,
    retry: 'Спробувати ще раз',
    home: 'На домашню',
  },
  ru: {
    title: 'Произошла ошибка',
    debugTitle: 'Детали ошибки (разработка)',
    debugMsg: 'Сообщение',
    debugCode: 'Код',
    debugType: 'Тип',
    debugTime: 'Время',
    debugDetails: 'Детали',
    errorCountMsg: (count: number) => `Количество ошибок: ${count}. Если проблема сохраняется, обратитесь в поддержку: support_chaika_ua@ukr.net`,
    retry: 'Попробовать снова',
    home: 'На главную',
  },
  en: {
    title: 'An error occurred',
    debugTitle: 'Error details (development)',
    debugMsg: 'Message',
    debugCode: 'Code',
    debugType: 'Type',
    debugTime: 'Time',
    debugDetails: 'Details',
    errorCountMsg: (count: number) => `Error count: ${count}. If the problem persists, contact support: support_chaika_ua@ukr.net`,
    retry: 'Try again',
    home: 'Go home',
  },
} as const;

const MAX_COMPONENT_STACK_LENGTH = 1500;
const MAX_DEBUG_DETAILS_LENGTH = 2000;

interface Props {
  children: React.ReactNode;
  onError?: (error: AppError) => void;
  showDetails?: boolean;
  language?: Lang;
}

interface State {
  hasError: boolean;
  error: AppError | null;
  errorCount: number;
}

/**
 * Global Error Boundary Component
 * Catches unhandled errors and displays user-friendly error screens
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const appError = ErrorHandler.createError(error);
    return {
      hasError: true,
      error: appError,
      // errorCount is intentionally NOT reset here so retry cycles accumulate.
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const appError = ErrorHandler.createError(error, error.message, errorInfo);
    // Truncate componentStack to avoid storing/rendering huge strings that
    // can push low-memory Android devices over the OOM threshold.
    const truncatedStack = (errorInfo.componentStack || '').slice(0, MAX_COMPONENT_STACK_LENGTH);
    captureCrashException(error, {
      source: 'ErrorBoundary',
      componentStack: truncatedStack,
      errorType: appError.type,
    });
    void recordRuntimeMonitorError({
      screen: 'ErrorBoundary',
      error,
      extra: {
        errorType: appError.type,
        componentStack: truncatedStack,
        breadcrumbTrail: getBreadcrumbs(),
        stateSnapshot: captureStateSnapshot(),
      },
      source: 'error_boundary',
    });
    ErrorHandler.reportError(appError);

    // Store crash diagnostic to AsyncStorage for offline viewing
    void saveLastCrash({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      componentStack: truncatedStack,
      errorType: appError.type,
      errorCode: appError.code,
    });

    if (this.props.onError) {
      this.props.onError(appError);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleRetry = () => {
    // Increment first, then clear the error — done in a single setState to
    // avoid the two-call race where handleReset() would overwrite the count.
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorCount: prev.errorCount + 1,
    }));
  };

  handleCopyStack = async () => {
    const stack = (this.state.error?.details as any)?.stack || '';
    if (stack) {
      try {
        await Clipboard.setString(stack);
        Toast.show({
          type: 'success',
          text1: 'Stack copied',
          text2: 'Full stack trace copied to clipboard',
        });
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: 'Copy failed',
          text2: 'Could not copy to clipboard',
        });
      }
    }
  };

  getErrorIcon = (type: ErrorType): string => {
    switch (type) {
      case ErrorType.NETWORK:
        return 'wifi-off';
      case ErrorType.TIMEOUT:
        return 'clock-outline';
      case ErrorType.VALIDATION:
        return 'alert-circle';
      case ErrorType.AUTHENTICATION:
        return 'lock';
      case ErrorType.AUTHORIZATION:
        return 'lock-alert';
      case ErrorType.NOT_FOUND:
        return 'magnify-minus';
      case ErrorType.SERVER:
        return 'server-network-off';
      default:
        return 'alert-circle';
    }
  };

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    const error = this.state.error;
    const iconName = this.getErrorIcon(error.type);
    const userMessage = ErrorHandler.getUserMessage(error);
    const suggestion = ErrorHandler.getRecoverySuggestion(error);
    const text = UI_TEXT[normalizeLanguage(this.props.language)] ?? UI_TEXT.ua;
    const debugDetails = error.details
      ? String(JSON.stringify(error.details, null, 2)).slice(0, MAX_DEBUG_DETAILS_LENGTH)
      : '';

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Error Icon */}
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name={iconName as keyof typeof MaterialCommunityIcons.glyphMap} size={80} color="#DC2626" />
          </View>

          {/* Error Title */}
          <Text style={styles.title}>{text.title}</Text>

          {/* Error Message */}
              <Text style={styles.message}>{String(userMessage)}</Text>

          {/* Error Type Badge */}
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{error.type}</Text>
          </View>

          {/* Recovery Suggestion */}
          <View style={styles.suggestionBox}>
            <MaterialCommunityIcons name="lightbulb-outline" size={20} color="#7A1E5C" />
            <Text style={styles.suggestionText}>{String(suggestion)}</Text>
          </View>

          {/* Debug Information */}
          {this.props.showDetails && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>{text.debugTitle}</Text>
              <Text style={styles.debugText}>{text.debugMsg}: {error.message}</Text>
              {error.code && <Text style={styles.debugText}>{text.debugCode}: {error.code}</Text>}
              <Text style={styles.debugText}>{text.debugType}: {error.type}</Text>
              <Text style={styles.debugText}>
                {text.debugTime}: {new Date(error.timestamp).toLocaleString()}
              </Text>
              {Boolean(debugDetails) && (
                <Text style={styles.debugText}>
                  {text.debugDetails}: {debugDetails}
                </Text>
              )}
            </View>
          )}

          {/* Stack Trace (if available) */}
          {(error.details as any)?.stack && (
            <View style={styles.stackBox}>
              <View style={styles.stackHeader}>
                <Text style={styles.stackTitle}>Stack Trace</Text>
                <TouchableOpacity
                  onPress={this.handleCopyStack}
                  style={styles.copyButton}
                >
                  <MaterialCommunityIcons name="content-copy" size={16} color="#7A1E5C" />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.stackScroll}
                nestedScrollEnabled={true}
              >
                <Text style={styles.stackText}>{(error.details as any).stack}</Text>
              </ScrollView>
            </View>
          )}

          {/* Error Count Warning */}
          {this.state.errorCount > 2 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                {text.errorCountMsg(this.state.errorCount)}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {error.retryable && (
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={this.handleRetry}>
                <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
                <Text style={styles.buttonText}>{text.retry}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={this.handleReset}>
              <MaterialCommunityIcons name="home" size={20} color="#7A1E5C" />
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>{text.home}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  content: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  typeBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  suggestionBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  suggestionText: {
    fontSize: 14,
    color: '#92400E',
    marginLeft: 12,
    flex: 1,
    lineHeight: 21,
  },
  debugBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  stackBox: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
    width: '100%',
    maxHeight: 240,
    overflow: 'hidden',
  },
  stackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  stackTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  copyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A1E5C',
  },
  stackScroll: {
    maxHeight: 180,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stackText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  warningBox: {
    backgroundColor: '#FEF08A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EAB308',
  },
  warningText: {
    fontSize: 13,
    color: '#713F12',
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#7A1E5C',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#7A1E5C',
  },
});

// Functional wrapper so the class component can read language from Redux
interface WrapperProps {
  children: React.ReactNode;
  onError?: (error: AppError) => void;
  showDetails?: boolean;
}

function ErrorBoundaryWithLanguage({ children, onError, showDetails }: WrapperProps) {
  const language = useSelector((state: RootState) => normalizeLanguage(state.language?.current));
  return (
    <ErrorBoundary language={language} onError={onError} showDetails={showDetails}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundaryWithLanguage;
