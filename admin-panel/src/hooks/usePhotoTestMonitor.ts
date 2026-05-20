import { useEffect, useState } from 'react';
import { subscribePhotoTest, type PhotoTestState } from '../services/photoTestService';

const initialState: PhotoTestState = { sessions: [] };

export const usePhotoTestMonitor = () => {
  const [state, setState] = useState<PhotoTestState>(initialState);
  const [error, setError] = useState('');

  useEffect(() => subscribePhotoTest(setState, (err) => setError(err.message)), []);

  return { ...state, error };
};
