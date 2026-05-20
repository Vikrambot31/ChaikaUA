import { useEffect, useState } from 'react';
import { subscribeAuthAccess, type AuthAccess } from '../services/authService';

const initialState: AuthAccess = {
  status: 'loading',
  user: null,
  role: null,
  error: null,
};

export const useAuthAccess = (): AuthAccess => {
  const [access, setAccess] = useState<AuthAccess>(initialState);

  useEffect(() => subscribeAuthAccess(setAccess), []);

  return access;
};
