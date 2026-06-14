import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { subscribeDashboard, type DashboardState } from '../services/dashboardService';

type DashboardContextValue = DashboardState & { error: string };

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
    pendingReports: 0,
    pendingBlockReports: 0,
  },
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<DashboardState>(initialState);
  const [error, setError] = useState('');

  useEffect(() => subscribeDashboard(setState, (err) => setError(err.message)), []);

  return (
    <DashboardContext.Provider value={{ ...state, error }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboardContext = (): DashboardContextValue => {
  const value = useContext(DashboardContext);
  if (!value) throw new Error('useDashboardContext must be used within DashboardProvider');
  return value;
};
