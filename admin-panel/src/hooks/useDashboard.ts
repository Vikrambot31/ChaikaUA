import { useEffect, useState } from 'react';
import { subscribeDashboard, type DashboardState } from '../services/dashboardService';

const initialState: DashboardState = {
  connected: null,
  config: null,
  activities: [],
  issues: [],
  stats: {
    usersTotal: 0,
    devicesTotal: 0,
    onlineDevices: 0,
    blockedDevices: 0,
    newDevices24h: 0,
    moderationTotal: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    activeUsersToday: 0,
    permissionDenied24h: 0,
    activeSubscriptions: 0,
    pendingPhotos: 0,
    pendingInviteRequests: 0,
    moderationAvgHours: 0,
    rulesEnforcementLevel: 'UNKNOWN',
    rulesOpenPaths: [],
    rulesCheckedAt: 0,
  },
};

export const useDashboard = () => {
  const [state, setState] = useState<DashboardState>(initialState);
  const [error, setError] = useState('');

  useEffect(() => subscribeDashboard(setState, (nextError) => setError(nextError.message)), []);

  return { ...state, error };
};
