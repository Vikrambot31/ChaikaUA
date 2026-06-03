import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { recordRuntimeTrace, type RuntimeMonitorStatus } from '../services/runtimeMonitorService';
import { addBreadcrumb } from '../services/breadcrumbService';

type StepDetails = Record<string, unknown>;

type TraceStep = (
  action: string,
  status: RuntimeMonitorStatus,
  details?: StepDetails,
  error?: unknown,
) => void;

type StartOperation = () => string;

interface UseOperationTraceReturn {
  /** Call when user taps the submit/send button. Returns the new operationId. */
  startOperation: StartOperation;
  /** Record one step within the current operation. */
  trace: TraceStep;
  /** Current operationId (empty string when no operation is active). */
  operationId: string;
}

const generateOperationId = (): string =>
  `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Hook for step-by-step tracing of critical user flows (form submit, photo upload, etc.).
 *
 * Usage:
 *   const { startOperation, trace } = useOperationTrace('Forma-Zayavki');
 *
 *   const handleSubmit = async () => {
 *     const opId = startOperation();
 *     trace('validate', 'start');
 *     if (!valid) { trace('validate', 'fail', { missing: 'phone' }); return; }
 *     trace('validate', 'success');
 *     trace('api_call', 'start', { path: 'requests' });
 *     try {
 *       await firebaseChatAPI.addRequest(data);
 *       trace('api_call', 'success');
 *     } catch (err) {
 *       trace('api_call', 'fail', {}, err);
 *     }
 *   };
 */
export const useOperationTrace = (
  screen: string,
  feature?: string,
): UseOperationTraceReturn => {
  const operationIdRef = useRef('');
  const startedAtRef = useRef(0);

  const startOperation = useCallback((): string => {
    const opId = generateOperationId();
    operationIdRef.current = opId;
    startedAtRef.current = Date.now();
    addBreadcrumb('action', `operation:start ${screen}`, { screen, data: { operationId: opId } });
    void recordRuntimeTrace({
      screen,
      action: 'operation_start',
      status: 'start',
      criticalFlow: true,
      operationId: opId,
      feature,
      message: `User initiated operation on ${screen}`,
    });
    return opId;
  }, [screen, feature]);

  const trace: TraceStep = useCallback(
    (action, status, details, error) => {
      const opId = operationIdRef.current;
      if (!opId) return;
      addBreadcrumb(
        status === 'fail' || status === 'timeout' ? 'firebase' : 'action',
        `${action}:${status}`,
        { screen, data: { operationId: opId, ...details } },
      );
      void recordRuntimeTrace({
        screen,
        action,
        status,
        criticalFlow: true,
        operationId: opId,
        feature,
        startedAt: startedAtRef.current,
        details: { ...details, operationId: opId },
        error,
      });
    },
    [screen, feature],
  );

  // Auto-record cancel when user leaves screen mid-operation
  useEffect(() => {
    return () => {
      const opId = operationIdRef.current;
      if (opId) {
        void recordRuntimeTrace({
          screen,
          action: 'screen_unmount',
          status: 'cancel',
          criticalFlow: true,
          operationId: opId,
          feature,
          startedAt: startedAtRef.current,
          message: 'User left screen during active operation',
        });
        operationIdRef.current = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-record when app goes to background mid-operation
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const opId = operationIdRef.current;
      if (opId && (state === 'background' || state === 'inactive')) {
        void recordRuntimeTrace({
          screen,
          action: 'app_background',
          status: 'cancel',
          criticalFlow: true,
          operationId: opId,
          feature,
          startedAt: startedAtRef.current,
          message: 'App went to background during active operation',
        });
        operationIdRef.current = '';
      }
    });
    return () => subscription.remove();
  }, [screen, feature]);

  return {
    startOperation,
    trace,
    get operationId() {
      return operationIdRef.current;
    },
  };
};
