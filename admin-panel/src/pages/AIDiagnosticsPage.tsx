import { useState, useRef, useEffect } from 'react';
import type { SecurityRole } from '../services/authService';
import { triggerAudit, cancelAudit, type AuditLogEntry } from '../services/aiDiagnosticsService';
import { useAIDiagnostics } from '../hooks/useAIDiagnostics';

type Props = { role: SecurityRole; userEmail: string };

const SEVERITY_COLORS: Record<string, string> = {
  info: '#5ba3d8',
  warn: '#e6a817',
  error: '#d94f4f',
};

const SCORE_COLOR = (score: number): string => {
  if (score >= 80) return '#2e7d32';
  if (score >= 60) return '#e6a817';
  if (score >= 40) return '#e65100';
  return '#c62828';
};

const STEP_LABELS: Record<string, string> = {
  'upload-photo': 'Upload / Photo System',
  'firebase': 'Firebase',
  'runtime': 'Runtime System',
  'observability': 'Observability',
  'performance': 'Performance',
  'crash-safety': 'Crash Safety',
  'ai-summary': 'AI Summary (DeepSeek)',
  'generating-reports': 'Generating Reports',
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const formatTime = (ts: number): string => {
  try { return new Date(ts).toLocaleString('ru-RU'); } catch { return '-'; }
};

export const AIDiagnosticsPage = ({ role, userEmail }: Props) => {
  const { status, logs, history, error } = useAIDiagnostics();
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === 'admin';
  const isRunning = status.status === 'running';
  const isCompleted = status.status === 'completed';
  const isFailed = status.status === 'failed';

  const handleStart = async () => {
    if (!isAdmin || triggering) return;
    setTriggering(true);
    try { await triggerAudit(userEmail); } catch { /* service handles */ }
    finally { setTriggering(false); }
  };

  const handleCancel = async () => {
    if (!isAdmin) return;
    try { await cancelAudit(userEmail); } catch { /* ignore */ }
  };

  const filteredLogs = logs.filter((log) => {
    if (severityFilter && log.severity !== severityFilter) return false;
    if (searchText) {
      const hay = `${log.message} ${log.scanner}`.toLowerCase();
      if (!hay.includes(searchText.toLowerCase())) return false;
    }
    return true;
  });

  useEffect(() => {
    if (isRunning && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, isRunning]);

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>AI Diagnostics</h1>
      <p style={{ margin: '0 0 20px', color: '#5d6f8b', fontSize: 14 }}>
        Глубокий аудит проекта: Upload, Firebase, Runtime, Performance, Observability, Crash Safety
      </p>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: '#fff3f0', border: '1px solid #ffccc7', borderRadius: 6, color: '#c62828', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Control Section */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={!isAdmin || triggering || isRunning}
            style={{
              padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 700,
              background: isAdmin ? '#24618e' : '#b0bec5', color: '#fff', cursor: isAdmin ? 'pointer' : 'not-allowed',
              fontSize: 14, opacity: triggering ? 0.7 : 1,
            }}
          >
            {triggering ? 'Запуск...' : 'Запустить AI аудит'}
          </button>
        ) : (
          <button
            onClick={handleCancel}
            disabled={!isAdmin}
            style={{
              padding: '10px 20px', borderRadius: 6, border: '1px solid #d94f4f', fontWeight: 700,
              background: '#fff', color: '#d94f4f', cursor: 'pointer', fontSize: 14,
            }}
          >
            Остановить аудит
          </button>
        )}

        <span style={{
          display: 'inline-block', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
          background: isRunning ? '#e3f2fd' : isCompleted ? '#e8f5e9' : isFailed ? '#fce4ec' : '#f5f5f5',
          color: isRunning ? '#1565c0' : isCompleted ? '#2e7d32' : isFailed ? '#c62828' : '#757575',
        }}>
          {isRunning ? 'Аудит выполняется...' : isCompleted ? 'Завершён' : isFailed ? 'Ошибка' : status.status === 'cancelled' ? 'Отменён' : 'Ожидание'}
        </span>

        {!isAdmin && <span style={{ fontSize: 12, color: '#9e9e9e' }}>Только admin может запускать аудит</span>}
      </div>

      {/* Progress Section */}
      {isRunning && status.progress && (
        <div style={{ marginBottom: 20, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>
              {STEP_LABELS[status.progress.currentStep] || status.progress.currentStep}
            </span>
            <span style={{ color: '#5d6f8b' }}>
              Шаг {status.progress.stepNum}/{status.progress.totalSteps} — {status.progress.percent}%
            </span>
          </div>
          <div style={{ height: 8, background: '#e8eaf6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${status.progress.percent}%`, background: '#5ba3d8',
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
          {status.progress.message && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#5d6f8b' }}>{status.progress.message}</p>
          )}
        </div>
      )}

      {/* Health Score + Severity */}
      {(isCompleted || isFailed) && status.healthScore != null && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{
            padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0',
            textAlign: 'center', minWidth: 120,
          }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: SCORE_COLOR(status.healthScore) }}>
              {status.healthScore}
            </div>
            <div style={{ fontSize: 12, color: '#5d6f8b', fontWeight: 700 }}>Health Score</div>
          </div>

          {status.severityCounts && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { key: 'critical', label: 'Critical', bg: '#fce4ec', color: '#c62828' },
                { key: 'high', label: 'High', bg: '#fff3e0', color: '#e65100' },
                { key: 'medium', label: 'Medium', bg: '#fff8e1', color: '#f57f17' },
                { key: 'low', label: 'Low', bg: '#e3f2fd', color: '#1565c0' },
                { key: 'info', label: 'Info', bg: '#f5f5f5', color: '#757575' },
              ].map(({ key, label, bg, color }) => (
                <div key={key} style={{
                  padding: '8px 14px', borderRadius: 6, background: bg, textAlign: 'center', minWidth: 70,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>
                    {(status.severityCounts as any)?.[key] || 0}
                  </div>
                  <div style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {status.duration != null && (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: '#5d6f8b' }}>
              Время: {formatDuration(status.duration)} | Findings: {status.findingsCount || 0}
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      {isCompleted && status.summary && (
        <div style={{ marginBottom: 20, padding: 16, background: '#f3e5f5', borderRadius: 8, border: '1px solid #ce93d8' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: '#6a1b9a' }}>AI Summary (DeepSeek)</h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, color: '#4a148c', fontFamily: 'inherit' }}>
            {status.summary}
          </pre>
        </div>
      )}

      {/* Report Files Info */}
      {isCompleted && (
        <div style={{ marginBottom: 20, padding: 14, background: '#e8f5e9', borderRadius: 8, border: '1px solid #a5d6a7', fontSize: 13 }}>
          <strong>Отчёты сохранены:</strong> <code>diagnostics-reports/latest/</code>
          <div style={{ marginTop: 6, color: '#2e7d32' }}>
            full-audit.md • critical-errors.md • firebase-risks.md • performance-report.md • upload-system-report.md • diagnostics-blindspots.md
          </div>
        </div>
      )}

      {/* Live Logs Console */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Diagnostics Console</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }}>
              <option value="">All</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
            </select>
            <input
              type="text" placeholder="Search..." value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, width: 160 }}
            />
          </div>
        </div>
        <div style={{
          background: '#1e1e2e', borderRadius: 8, padding: 12, maxHeight: 360, overflowY: 'auto',
          fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace', fontSize: 12, lineHeight: 1.6,
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{ color: '#5d6f8b', textAlign: 'center', padding: 20 }}>
              {isRunning ? 'Ожидание логов...' : 'Нет записей'}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} style={{ color: SEVERITY_COLORS[log.severity] || '#ccc', marginBottom: 2 }}>
                <span style={{ color: '#5d6f8b', marginRight: 8 }}>
                  {new Date(log.at).toLocaleTimeString('ru-RU')}
                </span>
                <span style={{
                  display: 'inline-block', width: 40, fontWeight: 700,
                  color: SEVERITY_COLORS[log.severity],
                }}>
                  {log.severity.toUpperCase()}
                </span>
                {log.scanner && (
                  <span style={{ color: '#8be9fd', marginRight: 8 }}>[{log.scanner}]</span>
                )}
                <span style={{ color: log.severity === 'error' ? '#ff6b6b' : '#e0e0e0' }}>{log.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* History */}
      <div>
        <button onClick={() => setShowHistory(!showHistory)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700,
            fontSize: 15, color: '#24618e', padding: 0, marginBottom: 8,
          }}>
          {showHistory ? '▼' : '▶'} История аудитов ({history.length})
        </button>
        {showHistory && (
          <div style={{ display: 'grid', gap: 8 }}>
            {history.map((entry) => (
              <div key={entry.id} style={{
                padding: '10px 14px', background: '#fff', borderRadius: 6,
                border: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', fontSize: 13,
              }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{formatTime(entry.completedAt)}</span>
                  <span style={{ color: '#5d6f8b', marginLeft: 12 }}>{formatDuration(entry.duration)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: SCORE_COLOR(entry.healthScore) }}>
                    {entry.healthScore}/100
                  </span>
                  {entry.severityCounts.critical > 0 && (
                    <span style={{ color: '#c62828', fontWeight: 700, fontSize: 12 }}>
                      {entry.severityCounts.critical} crit
                    </span>
                  )}
                  {entry.severityCounts.high > 0 && (
                    <span style={{ color: '#e65100', fontWeight: 700, fontSize: 12 }}>
                      {entry.severityCounts.high} high
                    </span>
                  )}
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <p style={{ color: '#5d6f8b', fontSize: 13 }}>Нет прошлых аудитов</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
