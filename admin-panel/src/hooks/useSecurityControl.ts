import { useEffect, useMemo, useState } from 'react';
import {
  subscribeManagedAuthorizedDevices,
  subscribeSecurityAppControl,
  subscribeSecurityLogs,
  type ManagedAuthorizedDevice,
  type RemoteAppControlConfig,
  type SecurityLogRecord,
} from '../services/securityService';

export type SecurityControlState = {
  config: RemoteAppControlConfig | null;
  devices: ManagedAuthorizedDevice[];
  logs: SecurityLogRecord[];
  errors: string[];
};

export const useSecurityControl = (): SecurityControlState => {
  const [config, setConfig] = useState<RemoteAppControlConfig | null>(null);
  const [devices, setDevices] = useState<ManagedAuthorizedDevice[]>([]);
  const [logs, setLogs] = useState<SecurityLogRecord[]>([]);
  const [configError, setConfigError] = useState('');
  const [devicesError, setDevicesError] = useState('');
  const [logsError, setLogsError] = useState('');

  useEffect(() => {
    const unsubscribeConfig = subscribeSecurityAppControl(setConfig, (error) => setConfigError(error.message));
    const unsubscribeDevices = subscribeManagedAuthorizedDevices(setDevices, (error) => setDevicesError(error.message));
    const unsubscribeLogs = subscribeSecurityLogs(setLogs, (error) => setLogsError(error.message));

    return () => {
      unsubscribeConfig();
      unsubscribeDevices();
      unsubscribeLogs();
    };
  }, []);

  const errors = useMemo(
    () => [configError, devicesError, logsError].filter(Boolean),
    [configError, devicesError, logsError],
  );

  return { config, devices, logs, errors };
};
