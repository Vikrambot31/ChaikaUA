import { useEffect, useState } from 'react';
import { subscribeErrorMonitor, type ErrorMonitorState } from '../services/errorMonitorService';

const initialState: ErrorMonitorState = {
  runtimeErrors: [],
  dedupedRuntimeErrors: [],
  userReports: [],
};

export const useErrorMonitor = () => {
  const [state, setState] = useState<ErrorMonitorState>(initialState);
  const [error, setError] = useState('');

  useEffect(() => subscribeErrorMonitor(setState, (nextError) => setError(nextError.message)), []);

  return { ...state, error };
};
