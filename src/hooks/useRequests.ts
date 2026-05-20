import { useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { fetchRequests, setError, setLoading, setRequests, submitRequest } from '../redux/slices/requestsSlice';
import { AppDispatch } from '../redux/store';
import { getRequests } from '../services/api';
import { Request, RequestFormData } from '../types/app';
import { logClientError } from '../utils/errorLogger';

const REQUESTS_LOAD_ERROR = 'Не удалось загрузить заявки';

export const useRequests = () => {
  const dispatch = useDispatch<AppDispatch>();

  const loadRequests = useCallback(async () => {
    try {
      await dispatch(fetchRequests()).unwrap();
      return;
    } catch {
      // fallback to legacy loading path below
    }

    dispatch(setLoading(true));

    try {
      const response = await getRequests();
      if (response.success && response.data) {
        dispatch(setRequests(response.data));
      } else {
        dispatch(setError(response.error ?? REQUESTS_LOAD_ERROR));
      }
    } catch (error) {
      void logClientError('useRequests.loadRequests.fallback', error);
      dispatch(setError(REQUESTS_LOAD_ERROR));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const sendRequest = useCallback(
    async (data: RequestFormData): Promise<Request> => {
      return await dispatch(submitRequest(data)).unwrap();
    },
    [dispatch]
  );

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return {
    loadRequests,
    sendRequest,
  };
};
