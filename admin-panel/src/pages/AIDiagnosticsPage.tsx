import { useState, useRef, useEffect, useMemo } from 'react';
import type { SecurityRole } from '../services/authService';
import { triggerAudit, cancelAudit } from '../services/aiDiagnosticsService';
import { useAIDiagnostics } from '../hooks/useAIDiagnostics';
import { FindingsTable } from '../components/FindingsTable';
import { TrendSection } from '../components/TrendSection';
import { useViewMode } from '../contexts/ViewModeContext';
import { subscribeShadowDenyEvents, type ShadowDenyEvent } from '../services/liveDiagnosticsService';

type Props = { role: SecurityRole; userEmail: string };
type ActiveView = 'overview' | 'findings' | 'shadow_deny';

const STEP_LABELS: Record<string, string> = {
  'upload-photo':       'Upload / Photo',
  'firebase':           'Firebase',
  'runtime':            'Runtime',
  'observability':      'Observability',
  'performance':        'Performance',
  'crash-safety':       'Crash Safety',
  'ai-summary':         'AI Summary',
  'generating-reports': 'Reports',
};

const scoreClass = (score: number): string => {
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-ok';
  if (score >= 40) return 'score-warn';
  return 'score-danger';
};

const scoreColor = (score: number): string => {
  if (score >= 80) return '#0f6a36';
  if (score >= 60) return '#b47f16';
  if (score >= 40) return '#e65100';
  return '#c62828';
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const formatTime = (ts: number): string => {
  try { return new Date(ts).toLocaleString('ru-RU'); } catch { return '–'; }
};

const formatShortDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '–'; }
};

export const AIDiagnosticsPage = ({ role, userEmail }: Props) => {
  const { status, logs, history, findings, error, daemonOnline } = useAIDiagnostics();
  const { viewMode } = useViewMode();
  const [activeView, setActiveView] = useState<ActiveView>('overview');

  const prodCounts = useMemo(() => {
    const prod = findings.filter(f => f.context === 'production');
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of prod) {
      const k = f.severity.toLowerCase();
      if (k in counts) counts[k]++;
    }
    return { counts, total: prod.length };
  }, [findings]);

  const verifiedCounts = useMemo(() => {
    const verified = findings.filter(f => f.verified && f.context === 'production');
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of verified) {
      const k = f.severity.toLowerCase();
      if (k in counts) counts[k]++;
    }
    return { counts, total: verified.length };
  }, [findings]);

  const [severityFilter, setSeverityFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [shadowDenyEvents, setShadowDenyEvents] = useState<ShadowDenyEvent[]>([]);
  const [shadowDenyFilter, setShadowDenyFilter] = useState({ path: '', uid: '', operation: '' });

  useEffect(() => {
    const unsub = subscribeShadowDenyEvents(setShadowDenyEvents);
    return unsub;
  }, []);

  const isAdmin     = role === 'admin';
  const isRunning   = status.status === 'running';
  const isCompleted = status.status === 'completed';
  const isFailed    = status.status === 'failed';
  const isSimple    = viewMode === 'simple';

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

  const filteredLogs = logs.filter(log => {
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

  const statusKey = status.status as string;

  return (
    <div className="diagPage">
      {/* ── Page Header ── */}
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Аналитика проекта</p>
          <h2 style={{ margin: 0 }}>AI Diagnostics</h2>
          {!isSimple && (
            <p style={{ margin: '4px 0 0', color: '#607594', fontSize: 14 }}>
              Аудит: Upload · Firebase · Runtime · Performance · Observability · Crash Safety
            </p>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, border: '1px solid #ef9a9a',
          background: '#fff5f5', color: '#c62828', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Daemon Status ── */}
      <div className="daemonBar">
        <span className={`daemonDot ${daemonOnline ? 'online' : 'offline'}`} />
        <span className={`daemonLabel ${daemonOnline ? 'online' : 'offline'}`}>
          Daemon: {daemonOnline ? 'online' : 'offline'}
        </span>
        {!daemonOnline && (
          <span className="daemonCmd">
            — запустите в терминале проекта: <code>npm run daemon</code>
          </span>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="diagControls">
        {!isRunning ? (
          <button
            className="diagRunBtn"
            onClick={handleStart}
            disabled={!isAdmin || triggering || !daemonOnline}
            title={!daemonOnline ? 'Daemon не запущен' : !isAdmin ? 'Только admin' : undefined}
          >
            {triggering ? 'Запуск…' : 'Запустить аудит'}
          </button>
        ) : (
          <button className="diagStopBtn" onClick={handleCancel} disabled={!isAdmin}>
            Остановить аудит
          </button>
        )}

        <span className={`diagStatusBadge ${statusKey}`}>
          {isRunning   ? '⟳ Аудит выполняется…'
          : isCompleted ? '✓ Завершён'
          : isFailed    ? '✗ Ошибка'
          : status.status === 'cancelled' ? '✕ Отменён'
          : 'Ожидание'}
        </span>

        {!isAdmin && (
          <span style={{ fontSize: 12, color: '#8a9ab0' }}>Только admin может запускать аудит</span>
        )}
      </div>

      {/* ── Progress ── */}
      {isRunning && status.progress && (
        <div className="diagProgressCard">
          <div className="diagProgressHeader">
            <span className="diagProgressLabel">
              {STEP_LABELS[status.progress.currentStep] || status.progress.currentStep}
            </span>
            <span className="diagProgressMeta">
              Шаг {status.progress.stepNum}/{status.progress.totalSteps} — {status.progress.percent}%
            </span>
          </div>
          <div className="diagProgressTrack">
            <div className="diagProgressFill" style={{ width: `${status.progress.percent}%` }} />
          </div>
          {status.progress.message && (
            <p className="diagProgressMsg">{status.progress.message}</p>
          )}
        </div>
      )}

      {/* ── Score + Severity Cards ── */}
      {(isCompleted || isFailed) && status.healthScore != null && (
        <>
          <div className="diagScoreGrid">
            {/* Health Score */}
            <div className={`diagScoreCard ${scoreClass(status.healthScore)}`}>
              <span className="diagScoreNum">{status.healthScore}</span>
              <span className="diagScoreLabel">Health Score</span>
              <span className="diagScoreSub">все ошибки</span>
            </div>

            {/* Verified Score */}
            {status.verifiedScore != null && (
              <div className={`diagScoreCard ${scoreClass(status.verifiedScore)}`}>
                <span className="diagScoreNum">{status.verifiedScore}</span>
                <span className="diagScoreLabel">Verified Score</span>
                <span className="diagScoreSub">только точные</span>
              </div>
            )}

            {/* Severity counts */}
            {status.severityCounts && (
              [
                { key: 'critical', label: 'Critical' },
                { key: 'high',     label: 'High'     },
                { key: 'medium',   label: 'Medium'   },
                { key: 'low',      label: 'Low'      },
                { key: 'info',     label: 'Info'     },
              ].map(({ key, label }) => {
                const total    = (status.severityCounts as any)?.[key] || 0;
                const prod     = findings.length > 0 ? (prodCounts.counts[key] || 0) : null;
                const verified = findings.length > 0 ? (verifiedCounts.counts[key] || 0) : null;
                const shown    = verified !== null ? verified : total;
                return (
                  <div key={key} className={`diagScoreCard sev-${key}`}>
                    <span className="diagScoreNum">{shown}</span>
                    <span className="diagScoreLabel">{label}</span>
                    {prod !== null && total !== prod && (
                      <span className="diagScoreSub">из {total} всего</span>
                    )}
                  </div>
                );
              })
            )}

            {/* Duration note */}
            {status.duration != null && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#8a9ab0' }}>Время аудита</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#25324a' }}>
                  {formatDuration(status.duration)}
                </span>
                <span style={{ fontSize: 12, color: '#8a9ab0' }}>
                  {(status.findingsCount || 0)} findings
                </span>
              </div>
            )}
          </div>

          {findings.length > 0 && (
            <p className="diagScoreMeta">
              Verified = подтверждённые структурно (низкий % ложных срабатываний) · production context ·{' '}
              {(status.findingsCount || 0) - prodCounts.total} findings из тестов/инструментов исключены
              {prodCounts.total - verifiedCounts.total > 0 && (
                <> · {prodCounts.total - verifiedCounts.total} heuristic не считаются в Verified Score</>
              )}
            </p>
          )}
        </>
      )}

      {/* ── Simple mode: just show findings ── */}
      {isSimple && findings.length > 0 && (
        <FindingsTable findings={findings} />
      )}

      {/* ── Tabs ── */}
      {!isSimple && (
        <div className="diagTabs">
          {(isCompleted || findings.length > 0) && (
            <>
              <button
                className={`diagTab ${activeView === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveView('overview')}
              >
                Обзор
              </button>
              <button
                className={`diagTab ${activeView === 'findings' ? 'active' : ''}`}
                onClick={() => setActiveView('findings')}
              >
                Findings{findings.length > 0 ? ` (${findings.length})` : ''}
              </button>
            </>
          )}
          <button
            className={`diagTab tabDanger ${activeView === 'shadow_deny' ? 'active' : ''}`}
            onClick={() => setActiveView('shadow_deny')}
          >
            Shadow Deny{shadowDenyEvents.length > 0 ? ` (${shadowDenyEvents.length})` : ''}
          </button>
        </div>
      )}

      {/* ══════════════ OVERVIEW TAB ══════════════ */}
      {!isSimple && activeView === 'overview' && (
        <div style={{ display: 'grid', gap: 20 }}>

          {/* Top Issues — прямо на Обзоре */}
          {isCompleted && findings.length > 0 && (() => {
            const topIssues = findings
              .filter(f => f.context === 'production' && (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.verified)
              .slice(0, 6);
            const allProdCount = findings.filter(f => f.context === 'production').length;
            if (topIssues.length === 0) return null;
            return (
              <div style={{ border: '1px solid #d6e2f4', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: '#f4f8ff', borderBottom: '1px solid #d6e2f4',
                }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#25324a' }}>
                    Топ проблем (VERIFIED · production)
                  </span>
                  <button
                    onClick={() => setActiveView('findings')}
                    style={{
                      padding: '4px 14px', borderRadius: 8, border: '1px solid #24618e',
                      background: '#24618e', color: '#fff', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    Все {allProdCount} findings →
                  </button>
                </div>
                {topIssues.map((f, i) => (
                  <div key={i} style={{
                    padding: '10px 16px',
                    borderTop: i > 0 ? '1px solid #eef3fb' : undefined,
                    background: i % 2 === 0 ? '#fff' : '#fafcff',
                  }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                      <span className={`sevBadge ${f.severity}`}>{f.severity}</span>
                      <span className="classTag verified">VERIFIED</span>
                      <span style={{ fontWeight: 700, fontSize: 12, color: '#25324a' }}>{f.rule}</span>
                      <span style={{ fontSize: 11, color: '#9e9e9e', marginLeft: 'auto' }}>[{f.scanner}]</span>
                    </div>
                    <div className="diagFindingFile">
                      {f.file.replace(/^.*?(src\/|admin-panel\/src\/|functions\/|scripts\/)/, '$1')}{f.line ? `:${f.line}` : ''}
                    </div>
                    <div className="diagFindingWhy">{f.why}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Если findings ещё не загрузились из Firebase */}
          {isCompleted && findings.length === 0 && (
            <div className="diagInfoNote" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⏳</span>
              <span>Findings загружаются из Firebase… Перейдите на вкладку <strong>Findings</strong> для просмотра деталей.</span>
            </div>
          )}

          {/* Trend */}
          {isCompleted && history.length > 0 && (
            <TrendSection current={status} history={history} />
          )}

          {/* AI Summary */}
          {isCompleted && status.summary && (
            <div className="diagSummaryCard">
              <h3 className="diagSummaryTitle">AI Summary (DeepSeek)</h3>
              <pre className="diagSummaryText">{status.summary}</pre>
            </div>
          )}

          {/* Report files */}
          {isCompleted && (
            <div className="diagReportsCard">
              <p className="diagReportsLabel">Отчёты сохранены: <code>diagnostics-reports/latest/</code></p>
              <div className="diagReportLinks">
                {[
                  { file: 'full-audit.md',            label: 'Полный аудит',   cls: ''       },
                  { file: 'critical-errors.md',        label: 'Critical errors', cls: 'danger' },
                  { file: 'firebase-risks.md',          label: 'Firebase risks',  cls: ''       },
                  { file: 'performance-report.md',      label: 'Performance',     cls: ''       },
                  { file: 'upload-system-report.md',    label: 'Upload system',   cls: ''       },
                  { file: 'diagnostics-blindspots.md',  label: 'Blindspots',      cls: ''       },
                ].map(({ file, label, cls }) => (
                  <a
                    key={file}
                    href={`/reports/${file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`diagReportLink ${cls}`}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Console */}
          <div className="diagConsole">
            <div className="diagConsoleBar">
              <span className="diagConsoleTitle">Diagnostics Console</span>
              <div className="diagConsoleFilters">
                <select
                  className="diagConsoleSelect"
                  value={severityFilter}
                  onChange={e => setSeverityFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                </select>
                <input
                  className="diagConsoleSearch"
                  type="text"
                  placeholder="Search…"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                />
              </div>
            </div>
            <div className="diagConsoleLogs">
              {filteredLogs.length === 0 ? (
                <div className="diagConsoleEmpty">
                  {isRunning ? 'Ожидание логов…' : 'Нет записей'}
                </div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="diagLogRow">
                    <span className="diagLogTs">
                      {new Date(log.at).toLocaleTimeString('ru-RU')}
                    </span>
                    <span className={`diagLogSev sev-${log.severity}`}>
                      {log.severity.toUpperCase()}
                    </span>
                    {log.scanner && (
                      <span className="diagLogScanner">[{log.scanner}]</span>
                    )}
                    <span className={`diagLogMsg sev-${log.severity}`}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* History */}
          <div>
            <button className="diagHistoryToggle" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '▼' : '▶'} История аудитов ({history.length})
            </button>
            {showHistory && (
              <div className="diagHistoryList">
                {history.length === 0 ? (
                  <p style={{ color: '#8a9ab0', fontSize: 13, margin: 0 }}>Нет прошлых аудитов</p>
                ) : history.map(entry => (
                  <div key={entry.id} className="diagHistoryEntry">
                    <div className="diagHistoryLeft">
                      <span className="diagHistoryTime">{formatShortDate(entry.completedAt)}</span>
                      <span className="diagHistoryDur">{formatDuration(entry.duration)}</span>
                    </div>
                    <div className="diagHistoryRight">
                      <span className="diagHistoryScore" style={{ color: scoreColor(entry.healthScore) }}>
                        {entry.healthScore}/100
                      </span>
                      {entry.verifiedScore != null && (
                        <span style={{ fontSize: 12, color: scoreColor(entry.verifiedScore), fontWeight: 700 }}>
                          v{entry.verifiedScore}
                        </span>
                      )}
                      {entry.severityCounts.critical > 0 && (
                        <span className="sevBadge CRITICAL">{entry.severityCounts.critical} crit</span>
                      )}
                      {entry.severityCounts.high > 0 && (
                        <span className="sevBadge HIGH">{entry.severityCounts.high} high</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ FINDINGS TAB ══════════════ */}
      {!isSimple && activeView === 'findings' && (
        <FindingsTable findings={findings} />
      )}

      {/* ══════════════ SHADOW DENY TAB ══════════════ */}
      {!isSimple && activeView === 'shadow_deny' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="diagShadowInfo">
            <strong>Shadow Deny Monitor</strong> — фиксирует попытки записи в защищённые узлы RTDB.
            За 48ч до enforcement убедитесь, что нормальные пользователи не задеты новыми правилами.
          </div>

          {/* Alert >10 за час */}
          {(() => {
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            const count = shadowDenyEvents.filter(ev => (ev.timestamp ?? 0) >= oneHourAgo).length;
            if (count <= 10) return null;
            return (
              <div className="diagShadowAlert">
                <span style={{ fontSize: 20 }}>⚠</span>
                <span>
                  АЛЕРТ: {count} deny-событий за последний час. Возможна проблема с правилами или атака.
                  <button
                    onClick={() => { window.location.hash = 'app_rules'; }}
                    style={{
                      marginLeft: 12, padding: '3px 10px', borderRadius: 6,
                      border: 'none', background: 'rgba(255,255,255,0.2)',
                      color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    Просмотреть правила →
                  </button>
                </span>
              </div>
            );
          })()}

          {/* Filters */}
          <div className="diagFilters">
            <input
              className="diagFilterInput"
              type="text"
              placeholder="Фильтр по path…"
              value={shadowDenyFilter.path}
              onChange={e => setShadowDenyFilter(f => ({ ...f, path: e.target.value }))}
              style={{ width: 200 }}
            />
            <input
              className="diagFilterInput"
              type="text"
              placeholder="Фильтр по UID…"
              value={shadowDenyFilter.uid}
              onChange={e => setShadowDenyFilter(f => ({ ...f, uid: e.target.value }))}
              style={{ width: 200 }}
            />
            <select
              className="diagFilterSelect"
              value={shadowDenyFilter.operation}
              onChange={e => setShadowDenyFilter(f => ({ ...f, operation: e.target.value }))}
            >
              <option value="">Все операции</option>
              <option value="write">write</option>
              <option value="read">read</option>
            </select>
            {(shadowDenyFilter.path || shadowDenyFilter.uid || shadowDenyFilter.operation) && (
              <button
                className="diagGroupByBtn"
                onClick={() => setShadowDenyFilter({ path: '', uid: '', operation: '' })}
              >
                Сбросить
              </button>
            )}
          </div>

          {/* Table */}
          {shadowDenyEvents.length === 0 ? (
            <div className="diagEmpty">
              Нет событий shadow_deny. База в порядке или логирование ещё не запущено.
            </div>
          ) : (() => {
            const filtered = shadowDenyEvents.filter(ev => {
              if (shadowDenyFilter.path && !ev.path.toLowerCase().includes(shadowDenyFilter.path.toLowerCase())) return false;
              if (shadowDenyFilter.uid &&
                !ev.uid.toLowerCase().includes(shadowDenyFilter.uid.toLowerCase()) &&
                !ev.targetUid.toLowerCase().includes(shadowDenyFilter.uid.toLowerCase())) return false;
              if (shadowDenyFilter.operation && ev.operation !== shadowDenyFilter.operation) return false;
              return true;
            });

            return (
              <>
                <p style={{ margin: 0, fontSize: 12, color: '#8a9ab0' }}>
                  Показано: {filtered.length} из {shadowDenyEvents.length}
                </p>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        {['Время', 'UID', 'Target UID', 'Путь', 'Операция', 'Было → Стало', 'Версия', 'Действия'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(ev => (
                        <tr key={ev.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {ev.timestamp ? formatTime(ev.timestamp) : '–'}
                          </td>
                          <td><code style={{ fontSize: 11 }}>{ev.uid || '–'}</code></td>
                          <td style={{ color: ev.uid !== ev.targetUid ? '#c62828' : undefined }}>
                            <code style={{ fontSize: 11 }}>{ev.targetUid || '–'}</code>
                            {ev.uid !== ev.targetUid && (
                              <span title="UID пытался изменить чужую роль" style={{ marginLeft: 4 }}>⚠</span>
                            )}
                          </td>
                          <td><code style={{ fontSize: 11 }}>{ev.path || '–'}</code></td>
                          <td>
                            <span className="sevBadge HIGH">{ev.operation}</span>
                          </td>
                          <td>
                            <code style={{ fontSize: 11 }}>
                              {ev.prevValue ?? 'null'} → {ev.newValue ?? 'null'}
                            </code>
                          </td>
                          <td style={{ color: '#8a9ab0', fontSize: 12 }}>{ev.appVersion}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="diagGroupByBtn"
                              onClick={() => { window.location.hash = 'app_rules'; }}
                            >
                              Правило →
                            </button>
                            <button
                              className="diagGroupByBtn"
                              onClick={() => { void navigator.clipboard.writeText(ev.path || ''); }}
                              style={{ marginLeft: 4 }}
                            >
                              Копировать
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
