import { useMemo, useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { useErrorMonitor } from '../hooks/useErrorMonitor';

const dateTime = (value: number): string => (value ? new Date(value).toLocaleString() : '-');

const severityClass = (severity: string): string => {
  if (severity === 'critical') return 'pill danger';
  if (severity === 'warning') return 'pill';
  return 'pill good';
};

/** Groups errors into 1-hour buckets for the last 24 hours. */
const buildHourlyBuckets = (timestamps: number[]): { label: string; count: number }[] => {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const buckets: { label: string; count: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const start = now - (i + 1) * HOUR_MS;
    const end = now - i * HOUR_MS;
    const hour = new Date(end).getHours().toString().padStart(2, '0') + ':00';
    const count = timestamps.filter((t) => t >= start && t < end).length;
    buckets.push({ label: hour, count });
  }
  return buckets;
};

export const ErrorMonitorPage = () => {
  const { dedupedRuntimeErrors, userReports, error } = useErrorMonitor();
  const [mode, setMode] = useState<'runtime' | 'reports'>('runtime');
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Collect unique appVersions for the version dropdown
  const availableVersions = useMemo(() => {
    const set = new Set<string>();
    dedupedRuntimeErrors.forEach((item) => {
      if (item.sample.appVersion && item.sample.appVersion !== '-') {
        set.add(item.sample.appVersion);
      }
    });
    return Array.from(set).sort().reverse();
  }, [dedupedRuntimeErrors]);

  const filteredRuntime = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dedupedRuntimeErrors.filter((item) => {
      if (versionFilter && item.sample.appVersion !== versionFilter) return false;
      if (severityFilter === 'slow' && !item.sample.slowOp) return false;
      if (severityFilter && severityFilter !== 'slow' && item.sample.severity !== severityFilter) return false;
      if (!q) return true;
      return [
        item.sample.shortType,
        item.sample.screen,
        item.sample.rawMessage,
        item.sample.humanMessage,
        item.sample.uid,
        item.sample.firebasePath,
        item.sample.stage,
        item.sample.code,
        item.sample.appVersion,
        item.sample.sessionId,
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [dedupedRuntimeErrors, search, versionFilter, severityFilter]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return userReports;
    return userReports.filter((report) => [
      report.uid,
      report.userName,
      report.id,
      ...report.errors.flatMap((item) => [item.functionName, item.message, item.source]),
    ].some((value) => value.toLowerCase().includes(q)));
  }, [search, userReports]);

  const totalRuntimeRepeats = dedupedRuntimeErrors.reduce((sum, item) => sum + item.duplicates, 0);
  const totalReportErrors = userReports.reduce((sum, report) => sum + report.errorCount, 0);

  // Hourly error trend (last 24 h) using latestAt timestamps
  const hourlyBuckets = useMemo(() => {
    const timestamps = dedupedRuntimeErrors.map((item) => item.latestAt);
    return buildHourlyBuckets(timestamps);
  }, [dedupedRuntimeErrors]);

  const maxBucket = Math.max(...hourlyBuckets.map((b) => b.count), 1);

  return (
    <section>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Диагностика</p>
          <div className="headingWithHint">
            <h2>Монитор ошибок</h2>
            <InfoHint text="Показывает runtime ошибки и пользовательские отчеты из diagnostics/runtime_moderation и diagnostics/user_reports." />
          </div>
        </div>
      </div>

      {error ? <p className="formError">{error}</p> : null}

      <div className="statsGrid">
        <article className="metric metric-danger"><span>Типов runtime ошибок</span><strong>{dedupedRuntimeErrors.length}</strong></article>
        <article className="metric metric-warning"><span>Повторов runtime</span><strong>{totalRuntimeRepeats}</strong></article>
        <article className="metric metric-primary"><span>Отчетов пользователей</span><strong>{userReports.length}</strong></article>
        <article className="metric metric-dark"><span>Ошибок в отчетах</span><strong>{totalReportErrors}</strong></article>
      </div>

      {/* Error trend chart — hourly buckets for last 24 h */}
      <article className="panel" style={{ marginBottom: '1.5rem' }}>
        <div className="tableHeader">
          <div className="headingWithHint">
            <h3>Тренд ошибок (последние 24 ч)</h3>
            <InfoHint text="Количество уникальных типов ошибок с lastAt попадающим в каждый час. Помогает увидеть всплески." />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px', padding: '0 8px 4px', overflowX: 'auto' }}>
          {hourlyBuckets.map((bucket) => (
            <div
              key={bucket.label}
              title={`${bucket.label}: ${bucket.count} ошибок`}
              style={{
                flex: '0 0 auto',
                width: '28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: `${Math.max(2, Math.round((bucket.count / maxBucket) * 64))}px`,
                  backgroundColor: bucket.count > 0 ? '#DC2626' : '#E5E7EB',
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.2s',
                }}
              />
              <span style={{ fontSize: '9px', color: '#9CA3AF', marginTop: '2px', transform: 'rotate(-45deg)', transformOrigin: 'top center', whiteSpace: 'nowrap' }}>
                {bucket.label}
              </span>
            </div>
          ))}
        </div>
      </article>

      <div className="filtersRow errorFiltersRow">
        <label className="field">
          <span>Режим</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as 'runtime' | 'reports')}>
            <option value="runtime">Runtime ошибки</option>
            <option value="reports">Отчеты пользователей</option>
          </select>
        </label>
        {mode === 'runtime' && (
          <label className="field">
            <span>Версия приложения</span>
            <select value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)}>
              <option value="">Все версии</option>
              {availableVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        {mode === 'runtime' && (
          <label className="field">
            <span>Тип</span>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="">Все</option>
              <option value="critical">critical — краши</option>
              <option value="warning">warning — предупреждения</option>
              <option value="slow">slow — медленные операции</option>
              <option value="info">info</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Поиск</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Экран, UID, причина, версия, session"
          />
        </label>
      </div>

      {mode === 'runtime' ? (
        <article className="panel tablePanel">
          <div className="tableHeader">
            <div className="headingWithHint">
              <h3>Runtime ошибки ({filteredRuntime.length})</h3>
              <InfoHint text="Ошибки сгруппированы по fingerprint, чтобы одинаковые сбои не засоряли список." />
            </div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ошибка</th>
                  <th>Экран</th>
                  <th>Последняя</th>
                  <th>Повторы</th>
                  <th>Пользователи</th>
                  <th>Детали</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuntime.map((item) => (
                  <tr key={item.fingerprint}>
                    <td>
                      <span className={severityClass(item.sample.severity)}>{item.sample.severity}</span>
                      {item.sample.slowOp ? (
                        <span className="pill" style={{ backgroundColor: '#F59E0B', color: '#fff', marginLeft: '4px' }}>
                          slow {item.sample.durationMs ? `${Math.round(item.sample.durationMs / 1000)}s` : ''}
                        </span>
                      ) : null}
                      <strong>{item.sample.shortType}</strong>
                      <small>{item.sample.humanMessage || item.sample.rawMessage || '-'}</small>
                    </td>
                    <td>{item.sample.screen}</td>
                    <td>{dateTime(item.latestAt)}</td>
                    <td>{item.duplicates}</td>
                    <td>{item.usersCount}</td>
                    <td>
                      <small>{item.sample.rawMessage || '-'}</small>
                      {item.sample.firebasePath ? <small>{item.sample.firebasePath}</small> : null}
                      {item.sample.stage ? <small>Этап: {item.sample.stage}</small> : null}
                      {item.sample.code ? <small>Код: {item.sample.code}</small> : null}
                      {item.sample.appVersion && item.sample.appVersion !== '-' ? (
                        <small style={{ color: '#6366F1' }}>v{item.sample.appVersion}</small>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!filteredRuntime.length ? <tr><td colSpan={6}>Runtime ошибок пока нет.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="panel tablePanel">
          <div className="tableHeader">
            <div className="headingWithHint">
              <h3>Отчеты пользователей ({filteredReports.length})</h3>
              <InfoHint text="Это отправленные пользователями отчеты из diagnostics/user_reports." />
            </div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Время</th>
                  <th>Ошибок</th>
                  <th>Последние ошибки</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <strong>{report.userName || '-'}</strong>
                      <small>{report.uid || report.id}</small>
                    </td>
                    <td>{dateTime(report.submittedAt)}</td>
                    <td>{report.errorCount}</td>
                    <td>
                      {report.errors.slice(0, 5).map((item, index) => (
                        <small key={`${report.id}:${index}`}>
                          {item.functionName || '-'}: {item.message || '-'}
                        </small>
                      ))}
                      {!report.errors.length ? <small>Нет подробностей</small> : null}
                    </td>
                  </tr>
                ))}
                {!filteredReports.length ? <tr><td colSpan={4}>Отчетов пользователей пока нет.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
};
