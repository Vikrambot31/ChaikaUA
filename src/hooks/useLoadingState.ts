import { useState, useCallback } from 'react';
import { ErrorHandler, AppError } from '../utils/errorHandler';

interface LoadingState {
  isLoading: boolean;
  error: AppError | null;
  success: boolean;
}

interface UseLoadingStateReturn extends LoadingState {
  startLoading: () => void;
  setSuccess: () => void;
  setError: (error: unknown, context?: string) => void;
  reset: () => void;
  execute: <T,>(promise: Promise<T>, context?: string) => Promise<T>;
}

/**
 * Custom hook for managing loading states
 * Provides consistent loading, error, and success state management
 */
export const useLoadingState = (initialState: Partial<LoadingState> = {}): UseLoadingStateReturn => {
  const [state, setState] = useState<LoadingState>({
    isLoading: initialState.isLoading || false,
    error: initialState.error || null,
    success: initialState.success || false,
  });

  const startLoading = useCallback(() => {
    setState({ isLoading: true, error: null, success: false });
  }, []);

  const setSuccess = useCallback(() => {
    setState({ isLoading: false, error: null, success: true });
  }, []);

  const setError = useCallback((error: unknown, context?: string) => {
    const appError = ErrorHandler.createError(error, context);
    setState({ isLoading: false, error: appError, success: false });
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, success: false });
  }, []);

  const execute = useCallback(
    async <T,>(promise: Promise<T>, context?: string): Promise<T> => {
      startLoading();
      try {
        const result = await promise;
        setSuccess();
        return result;
      } catch (error) {
        setError(error, context);
        throw error;
      }
    },
    [startLoading, setSuccess, setError]
  );

  return {
    ...state,
    startLoading,
    setSuccess,
    setError,
    reset,
    execute,
  };
};

export default useLoadingState;
