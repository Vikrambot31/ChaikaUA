import { useEffect, useState } from 'react';
import {
  subscribeAuditStatus,
  subscribeAuditLogs,
  subscribeAuditHistory,
  type AuditStatusData,
  type AuditLogEntry,
  type AuditHistoryEntry,
} from '../services/aiDiagnosticsService';

export const useAIDiagnostics = () => {
  const [status, setStatus] = useState<AuditStatusData>({ status: 'idle' });
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub1 = subscribeAuditStatus(setStatus, (err) => setError(err.message));
    const unsub2 = subscribeAuditLogs(setLogs, (err) => setError(err.message));
    const unsub3 = subscribeAuditHistory(setHistory, (err) => setError(err.message));
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  return { status, logs, history, error };
};
