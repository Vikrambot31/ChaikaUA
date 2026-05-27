import { useEffect, useState } from 'react';
import {
  subscribeAuditStatus,
  subscribeAuditLogs,
  subscribeAuditHistory,
  subscribeFindings,
  subscribeDaemonHeartbeat,
  type AuditStatusData,
  type AuditLogEntry,
  type AuditHistoryEntry,
  type FindingRecord,
} from '../services/aiDiagnosticsService';

export const useAIDiagnostics = () => {
  const [status, setStatus] = useState<AuditStatusData>({ status: 'idle' });
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daemonOnline, setDaemonOnline] = useState<boolean>(false);

  useEffect(() => {
    const unsub1 = subscribeAuditStatus(setStatus, (err) => setError(err.message));
    const unsub2 = subscribeAuditLogs(setLogs, (err) => setError(err.message));
    const unsub3 = subscribeAuditHistory(setHistory, (err) => setError(err.message));
    const unsub4 = subscribeFindings(setFindings, (err) => setError(err.message));
    const unsub5 = subscribeDaemonHeartbeat(setDaemonOnline);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, []);

  return { status, logs, history, findings, error, daemonOnline };
};
