import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { InfoHint } from '../components/InfoHint';
import type { AdminPageKey } from '../components/AppShell';
import { firebaseConfig } from '../firebase/firebase';
import { useDashboardContext } from '../contexts/DashboardContext';
import { updateSecurityAppControl } from '../services/securityService';
import { loadInviteAccessState, type InviteAccessMode } from '../services/inviteAccessService';
import { computeAccessStats, getModeDescription } from '../services/accessControlService';
import { useViewMode } from '../contexts/ViewModeContext';
import { probeRulesLevel, type RulesProbeResult } from '../services/rulesProbeService';
import { fetchPermissionDeniedDetails, type PermissionDeniedEntry } from '../services/dashboardService';

type AccessSummary = {
  enabled: boolean;
  mode: InviteAccessMode;
  trusted: number;
  pending: number;
  needsReview: number;
};

const statusLabel = (connected: boolean | null): string => {
  if (connected === null) return 'ПРОВЕРКА';
  return connected ? 'АКТИВНО' : 'ПРЕДУПРЕЖДЕНИЕ';
};

const dateTime = (value: number): string => (value ? new Date(value).toLocaleString() : '-');
const healthClass = (ok: boolean): string => (ok ? 'healthText ok' : 'healthText danger');

type DashboardPageProps = {
  user: User;
  onNavigate: (page: AdminPageKey) => void;
};

export const DashboardPage = ({ user, onNavigate }: DashboardPageProps) => {
  const { connected, config, stats, activities, issues, error } = useDashboardContext();
  const { viewMode } = useViewMode();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(null);
  const [probeResult, setProbeResult] = useState<RulesProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [permDetails, setPermDetails] = useState<PermissionDeniedEntry[] | null>(null);
  const [permDetailsLoading, setPermDetailsLoading] = useState(false);
  const [probeBannerExpanded, setProbeBannerExpanded] = useState(false);
  const [showExtraMetrics, setShowExtraMetrics] = useState(false);

  const runProbe = useCallback(async () => {
    setProbing(true);
    try {
      const result = await probeRulesLevel(firebaseConfig.databaseURL ?? '');
      setProbeResult(result);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void runProbe();
    const interval = setInterval(() => { void runProbe(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [runProbe]);

  useEffect(() => {
    let mounted = true;
    loadInviteAccessState().then((state) => {
      if (!mounted) return;
      const s = computeAccessStats(state.requests);
      setAccessSummary({
        enabled: state.flag.enabled,
        mode: state.flag.mode,
        trusted: s.trusted,
        pending: s.pendingSponsor,
        needsReview: s.needsReview,
      });
    }).catch((err: unknown) => console.info('[Dashboard] Invite access summary skipped:', err));
    return () => { mounted = false; };
  }, []);

  const runQuickAction = async (action: 'maintenance' | 'disable_app' | 'enable_app') => {
    if (action === 'disable_app') {
      const confirmed = window.confirm('Отключить приложение для пользователей?');
      if (!confirmed) return;
    }

    setBusyAction(action);
    setActionMessage(null);
    try {
      if (action === 'maintenance') {
        const nextValue = !config?.maintenance_mode;
        await updateSecurityAppControl({ maintenance_mode: nextValue }, user.uid);
        setActionMessage(nextValue ? 'Режим обслуживания включен.' : 'Режим обслуживания отключен.');
      }
      if (action === 'disable_app') {
        await updateSecurityAppControl({ app_enabled: false }, user.uid);
        setActionMessage('Приложение отключено.');
      }
      if (action === 'enable_app') {
        await updateSecurityAppControl({ app_enabled: true }, user.uid);
        setActionMessage('Приложение включено.');
      }
    } catch (quickActionError) {
      setActionMessage(quickActionError instanceof Error ? quickActionError.message : 'Быстрое действие не выполнено.');
    } finally {
      setBusyAction(null);
    }
  };

  const isSimpleMode = viewMode === 'simple';

  const handleShowPermDetails = async () => {
    setPermDetailsLoading(true);
    try {
      const entries = await fetchPermissionDeniedDetails();
      setPermDetails(entries);
    } catch {
      setPermDetails([]);
    } finally {
      setPermDetailsLoading(false);
    }
  };

  return (
    <section className="dashboard">
      <div className="pageHeader">
        <div>
          <div className="headingWithHint">
            <h2>Панель</h2>
            <InfoHint text="Главный экран с состоянием системы, статистикой и быстрыми действиями." />
          </div>
        </div>
        {connected === false && (
          <span className="status warning">
            Firebase {statusLabel(connected)}
          </span>
        )}
        {connected === null && (
          <span className="status warning">
            Firebase ПЕРЕВІРКА
          </span>
        )}
      </div>

      {error ? <p className="formError">{error}</p> : null}
      {actionMessage ? <p className="infoMessage">{actionMessage}</p> : null}

      {/* Банер: стан Firebase Rules (анонімний HTTP-зонд) */}
      {(() => {
        if (!probeResult && probing) return null;
        if (!probeResult) return null;

        const checkedTimeStr = probeResult.checkedAt
          ? new Date(probeResult.checkedAt).toLocaleTimeString()
          : '';

        // SECURE — не показуємо банер взагалі (все гаразд)
        if (probeResult.level === 'SECURE') return null;

        // ERROR — мінімальна підказка
        if (probeResult.level === 'ERROR') {
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '8px 14px', marginBottom: 12, borderRadius: 6,
              background: '#f5f5f5', border: '1px solid #bdbdbd', fontSize: 12, color: '#616161',
            }}>
              <span>Не вдалося перевірити правила Firebase{probeResult.errorMessage ? ` — ${probeResult.errorMessage}` : ''}</span>
              <button type="button" onClick={() => { void runProbe(); }} disabled={probing}
                style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #bdbdbd', background: '#fff', color: '#424242', fontSize: 11, cursor: 'pointer' }}>
                {probing ? '...' : 'Повторити'}
              </button>
            </div>
          );
        }

        // OPEN — критичне попередження, розгорнуто
        if (probeResult.level === 'OPEN') {
          return (
            <div style={{ padding: '12px 18px', marginBottom: 16, borderRadius: 8, background: '#fce4ec', border: '2px solid #e53935' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ color: '#b71c1c', fontSize: 14 }}>База даних повністю відкрита — анонімний доступ увімкнено</strong>
                  <div style={{ fontSize: 12, color: '#b71c1c', marginTop: 4 }}>
                    Відкриті: {probeResult.openPaths.map((p) => (
                      <code key={p} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p}</code>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Перевірено о {checkedTimeStr}</div>
                </div>
                <button type="button" onClick={() => { void runProbe(); }} disabled={probing}
                  style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid #e53935', background: '#fff', color: '#b71c1c', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  {probing ? 'Перевірка...' : 'Перевірити знову'}
                </button>
              </div>
            </div>
          );
        }

        // PARTIAL — публічні лістинги відкриті навмисно, показуємо згорнутий рядок
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            padding: '7px 14px', marginBottom: 12, borderRadius: 6,
            background: '#fff8e1', border: '1px solid #ffca28', fontSize: 12,
          }}>
            <span style={{ color: '#795548' }}>
              Rules: <strong style={{ color: '#e65100' }}>PARTIAL</strong>
              {' — '}публічні лістинги навмисно відкриті ({probeResult.openPaths.length} з 4)
              <button type="button" onClick={() => setProbeBannerExpanded((v) => !v)}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: '#e65100', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                {probeBannerExpanded ? 'сховати' : 'деталі'}
              </button>
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#aaa' }}>{checkedTimeStr}</span>
              <button type="button" onClick={() => { void runProbe(); }} disabled={probing}
                style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #ffca28', background: '#fff', color: '#795548', fontSize: 11, cursor: 'pointer' }}>
                {probing ? '...' : '↻'}
              </button>
            </div>
            {probeBannerExpanded && (
              <div style={{ width: '100%', marginTop: 4, fontSize: 11, color: '#795548' }}>
                Відкриті: {probeResult.openPaths.map((p) => (
                  <code key={p} style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p}</code>
                ))}
                {probeResult.closedPaths.length > 0 && (
                  <span style={{ marginLeft: 8 }}>
                    Закриті: {probeResult.closedPaths.map((p) => (
                      <code key={p} style={{ background: 'rgba(0,0,0,0.04)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p}</code>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div className="statsGrid">
        <article className="metric metric-success"><span>Активні сьогодні</span><strong>{stats.activeUsersToday}</strong></article>
        <article className={stats.permissionDenied24h < 5 ? 'metric metric-info' : 'metric metric-danger'} style={{ cursor: 'pointer' }}>
          <span>permission_denied 24г</span>
          <strong>{stats.permissionDenied24h}</strong>
          {stats.permissionDenied24h > 0 && (
            <button
              type="button"
              onClick={() => { void handleShowPermDetails(); }}
              disabled={permDetailsLoading}
              style={{ marginTop: 6, fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.85 }}
            >
              {permDetailsLoading ? '...' : 'Деталі'}
            </button>
          )}
        </article>
        <article className={stats.activeSubscriptions <= 4 ? 'metric metric-success' : 'metric metric-warning'}><span>onValue підписок</span><strong>{stats.activeSubscriptions}</strong></article>
        <article className="metric metric-warning"><span>Pending фото</span><strong>{stats.pendingPhotos}</strong></article>
        <article className="metric metric-warning"><span>Pending invite</span><strong>{stats.pendingInviteRequests}</strong></article>
        <article className="metric metric-info"><span>Користувачі</span><strong>{stats.usersTotal}</strong></article>
        <article className="metric metric-primary"><span>Пристрої</span><strong>{stats.devicesTotal}</strong></article>
        <article className="metric metric-success"><span>Онлайн</span><strong>{stats.onlineDevices}</strong></article>
        <article className="metric metric-danger"><span>Заблоковані</span><strong>{stats.blockedDevices}</strong></article>
        <article className="metric metric-cyan"><span>Нові за 24г</span><strong>{stats.newDevices24h}</strong></article>
        <article className="metric metric-violet"><span>Всього модерації</span><strong>{stats.moderationTotal}</strong></article>
        <article className="metric metric-warning"><span>Очікують</span><strong>{stats.pending}</strong></article>
        {showExtraMetrics && (
          <>
            <article className="metric metric-primary"><span>Модерація, г</span><strong>{stats.moderationAvgHours ? stats.moderationAvgHours.toFixed(1) : '0'}</strong></article>
            <article className="metric metric-dark"><span>Відхилені</span><strong>{stats.rejected}</strong></article>
            <article className="metric metric-info"><span>Архів</span><strong>{stats.expired}</strong></article>
          </>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={() => setShowExtraMetrics((v) => !v)}
          style={{ background: 'none', border: 'none', fontSize: 12, color: '#607594', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          {showExtraMetrics ? 'Сховати додаткові метрики' : 'Показати додаткові метрики (модерація, архів, відхилені)'}
        </button>
      </div>

      <div className="grid dashboardGrid">
        <article className="panel">
          <div className="headingWithHint">
            <h3>Состояние системы</h3>
            <InfoHint text="Текущие ключевые флаги из security_config/app_control/current." />
          </div>
          <dl className="details compactDetails">
            <div><dt>Режим обслуговування</dt><dd className={healthClass(!Boolean(config?.maintenance_mode))}>{config?.maintenance_mode ? 'АКТИВНО' : 'ВИМКНЕНО'}</dd></div>
            <div><dt>Застосунок доступний</dt><dd className={healthClass(Boolean(config?.app_enabled))}>{config?.app_enabled ? 'АКТИВНО' : 'ВИМКНЕНО'}</dd></div>
            <div><dt>Примусове оновлення</dt><dd className={healthClass(!Boolean(config?.force_update_required))}>{config?.force_update_required ? 'АКТИВНО' : 'ВИМКНЕНО'}</dd></div>
            <div><dt>Мінімальна версія</dt><dd>{config?.minimum_required_version || '-'}</dd></div>
            <div><dt>Нові пристрої</dt><dd className={healthClass(Boolean(config?.allow_new_devices))}>{config?.allow_new_devices ? 'ДОЗВОЛЕНІ' : 'ЗАБЛОКОВАНІ'}</dd></div>
          </dl>
        </article>

        {!isSimpleMode && (
          <article className="panel">
            <div className="headingWithHint">
              <h3>Быстрые действия</h3>
              <InfoHint text="Переходы в разделы и быстрые переключения критичных режимов." />
            </div>
            <details>
              <summary className="smallButton">Показать/скрыть параметры Firebase</summary>
              <dl className="details" style={{ marginTop: 12 }}>
                <div><dt>Project ID</dt><dd>{firebaseConfig.projectId}</dd></div>
                <div><dt>Realtime DB</dt><dd>{firebaseConfig.databaseURL}</dd></div>
                <div><dt>Storage</dt><dd>{firebaseConfig.storageBucket}</dd></div>
              </dl>
            </details>
            <div className="quickActions">
              <div className="actionWithHint">
                <button type="button" className="smallButton" onClick={() => onNavigate('moderation')}>Модерація</button>
                <InfoHint text="Заявки та контент для approve/reject/delete." />
              </div>
              <div className="actionWithHint">
                <button type="button" className="smallButton" onClick={() => onNavigate('security')}>Безпека</button>
                <InfoHint text="Конфігурація безпеки та пристрої." />
              </div>
              <div className="actionWithHint">
                <button type="button" className="smallButton" onClick={() => onNavigate('ai_diagnostics')}>Shadow Deny</button>
                <InfoHint text="Аналіз анонімного доступу та тіньових заборон." />
              </div>
              <div className="actionWithHint">
                <button type="button" className="smallButton" disabled={Boolean(busyAction)} onClick={() => void runQuickAction('maintenance')}>
                  {config?.maintenance_mode ? 'Вимкнути обслуговування' : 'Увімкнути обслуговування'}
                </button>
                <InfoHint text="Перемикає maintenance_mode для всього застосунку." />
              </div>
              <div className="actionWithHint">
                <button
                  type="button"
                  className={config?.app_enabled ? 'smallButton dangerButton' : 'smallButton'}
                  disabled={Boolean(busyAction)}
                  onClick={() => void runQuickAction(config?.app_enabled ? 'disable_app' : 'enable_app')}
                >
                  {config?.app_enabled ? 'Вимкнути застосунок' : 'Увімкнути застосунок'}
                </button>
                <InfoHint text="Змінює app_enabled. При вимкненні користувачі не зможуть увійти." />
              </div>
            </div>
          </article>
        )}

        <article className="panel">
          <div className="headingWithHint">
            <h3>Последняя активность</h3>
            <InfoHint text="Последние события из security_logs/client_events." />
          </div>
          <div className="logList">
            {activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="logItem">
                <strong>{activity.action}</strong>
                <span>{dateTime(activity.time)}</span>
                <small>{activity.email || '-'} {activity.deviceId ? `· ${activity.deviceId}` : ''}</small>
              </div>
            ))}
            {!activities.length ? <p style={{ color: '#607594', fontSize: 13 }}>Немає нещодавньої активності.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="headingWithHint">
            <h3>Проблемы</h3>
            <InfoHint text="Сводка по рискам: denied/blocked devices, overflow модерации и системные флаги." />
          </div>
          <div className="logList">
            {issues.map((issue) => (
              <div key={issue.id} className="logItem issueItem">
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </div>
            ))}
            {!issues.length ? <p style={{ color: '#607594', fontSize: 13 }}>✅ Проблем не виявлено</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="headingWithHint">
            <h3>Контроль доступа</h3>
            <InfoHint text="Состояние 3-уровневой системы: Public / Registered / Trusted." />
          </div>
          {accessSummary ? (
            <>
              <dl className="details compactDetails" style={{ marginBottom: 12 }}>
                <div>
                  <dt>Система</dt>
                  <dd>
                    <span className={accessSummary.enabled ? 'status active' : 'status warning'} style={{ fontSize: 11 }}>
                      {accessSummary.enabled ? `ВКЛ · ${accessSummary.mode.toUpperCase()}` : 'ВЫКЛ'}
                    </span>
                  </dd>
                </div>
                <div><dt>Trusted пользователей</dt><dd className={healthClass(accessSummary.trusted > 0)}>{accessSummary.trusted}</dd></div>
                <div><dt>Ожидают одобрения</dt><dd className={healthClass(accessSummary.pending === 0)}>{accessSummary.pending}</dd></div>
                <div>
                  <dt>Требуют проверки</dt>
                  <dd className={healthClass(accessSummary.needsReview === 0)}>
                    {accessSummary.needsReview > 0 ? `${accessSummary.needsReview} ⚠` : '0'}
                  </dd>
                </div>
              </dl>
              <p style={{ fontSize: 12, color: '#607594', margin: '0 0 12px' }}>
                {getModeDescription(accessSummary.mode)}
              </p>
            </>
          ) : (
            <p style={{ color: '#5d6f8b' }}>Загрузка...</p>
          )}
          <div className="quickActions">
            <div className="actionWithHint">
              <button type="button" className="smallButton" onClick={() => onNavigate('access_control')}>
                Контроль доступа
              </button>
              <InfoHint text="Статистика по уровням, заявки, выдача временного доступа." />
            </div>
            <div className="actionWithHint">
              <button type="button" className="smallButton" onClick={() => onNavigate('invite_access')}>
                Управление поручителями
              </button>
              <InfoHint text="Доверенные поручители и полный список заявок." />
            </div>
          </div>
        </article>
      </div>
      {permDetails !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Подробности permission_denied"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 8px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPermDetails(null); }}
        >
          <div style={{ background: '#111827', borderRadius: 12, padding: '24px 24px', width: '100%', maxWidth: 1400, boxShadow: '0 8px 60px rgba(0,0,0,0.7)', border: '1px solid #1e3a5f' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: 18 }}>permission_denied — подробный лог за 24ч</h3>
                <p style={{ margin: '4px 0 0', color: '#607594', fontSize: 13 }}>
                  {permDetails.length === 0 ? 'Записей нет' : `${permDetails.length} случаев · источники: diagnostics/runtime_moderation + ops/errors`}
                </p>
              </div>
              <button type="button" onClick={() => setPermDetails(null)}
                style={{ background: 'none', border: 'none', color: '#607594', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
            </div>

            {permDetails.length === 0 ? (
              <p style={{ color: '#607594', textAlign: 'center', padding: '40px 0' }}>Записей не найдено за последние 24ч</p>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1e3a5f' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#cdd8f0', tableLayout: 'auto' }}>
                  <thead>
                    <tr style={{ background: '#0f1829', color: '#7a90b0', textAlign: 'left', position: 'sticky', top: 0 }}>
                      {['Когда', 'Сев.', 'Экран', 'Действие', 'Firebase путь', 'Фича / Этап', 'Код / FB код', 'UID', 'Сеть', 'Устройство', 'Версия', 'Повт.', 'Сообщение'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #1e3a5f', fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permDetails.map((entry, i) => {
                      const sevColor = entry.severity === 'critical' ? '#ff5555' : entry.severity === 'warning' ? '#ffaa00' : '#4499ff';
                      const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
                      return (
                        <>
                          <tr key={entry.id} style={{ borderBottom: entry.breadcrumbs.length ? 'none' : '1px solid #162030', background: rowBg }}>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#7a90b0', fontSize: 11 }}>
                              {entry.at ? new Date(entry.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                            </td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: sevColor, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{entry.severity}</span>
                              {entry.slowOp && <span style={{ marginLeft: 4, color: '#ff9900', fontSize: 10 }}>⚡slow</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#7fb3ff', whiteSpace: 'nowrap', maxWidth: 180 }}>
                              {entry.screen}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#aaccff', whiteSpace: 'nowrap', maxWidth: 160 }}>
                              {entry.action !== '-' ? entry.action : <span style={{ color: '#3d5070' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#ff8888', maxWidth: 220, wordBreak: 'break-all' }}>
                              {entry.firebasePath !== '-' ? entry.firebasePath : <span style={{ color: '#3d5070' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {entry.feature !== '-' && <span style={{ color: '#66ddaa' }}>{entry.feature}</span>}
                              {entry.feature !== '-' && entry.stage !== '-' && <span style={{ color: '#3d5070' }}> / </span>}
                              {entry.stage !== '-' && <span style={{ color: '#88bbdd' }}>{entry.stage}</span>}
                              {entry.feature === '-' && entry.stage === '-' && <span style={{ color: '#3d5070' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', color: '#ff9999' }}>
                              {entry.code !== '-' && <span>{entry.code}</span>}
                              {entry.firebaseCode !== '-' && <span style={{ color: '#cc7777', marginLeft: 4 }}>({entry.firebaseCode})</span>}
                              {entry.code === '-' && entry.firebaseCode === '-' && <span style={{ color: '#3d5070' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#99aacc', maxWidth: 140, wordBreak: 'break-all' }}>
                              {entry.uid !== '-' ? entry.uid : <span style={{ color: '#3d5070' }}>анон</span>}
                            </td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 11 }}>
                              <span style={{ color: entry.networkState === 'offline' || entry.networkState === 'none' ? '#ff5555' : '#88bbdd' }}>
                                {entry.networkState !== '-' ? entry.networkState : <span style={{ color: '#3d5070' }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 11, whiteSpace: 'nowrap', color: '#7a90b0' }}>
                              {entry.deviceInfo !== '-' ? entry.deviceInfo : <span style={{ color: '#3d5070' }}>—</span>}
                              {entry.androidVersion !== '-' && entry.androidVersion && (
                                <span style={{ color: '#556677', marginLeft: 4 }}>({entry.androidVersion})</span>
                              )}
                              {entry.appMode === 'debug' && <span style={{ color: '#ffaa00', marginLeft: 4, fontSize: 10 }}>DEV</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 11, whiteSpace: 'nowrap', color: '#5d7a9a' }}>
                              {entry.appVersion !== '-' ? entry.appVersion : <span style={{ color: '#3d5070' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: entry.repeatCount > 1 ? '#ffaa00' : '#3d5070' }}>
                              {entry.repeatCount > 1 ? `×${entry.repeatCount}` : '1'}
                              {entry.durationMs !== undefined && (
                                <div style={{ fontSize: 10, color: '#5d7a9a', fontWeight: 400 }}>{entry.durationMs}ms</div>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 11, color: '#c0cce0', maxWidth: 280, wordBreak: 'break-word' }}>
                              {entry.humanMessage !== '-' && entry.humanMessage !== entry.rawMessage
                                ? <><span style={{ color: '#99ccff' }}>{entry.humanMessage.slice(0, 80)}{entry.humanMessage.length > 80 ? '…' : ''}</span><br /></>
                                : null}
                              <span style={{ color: '#7a8fa8' }}>{entry.rawMessage.slice(0, 100)}{entry.rawMessage.length > 100 ? '…' : ''}</span>
                            </td>
                          </tr>
                          {entry.breadcrumbs.length > 0 && (
                            <tr key={`${entry.id}-bc`} style={{ borderBottom: '1px solid #162030', background: rowBg }}>
                              <td colSpan={13} style={{ padding: '2px 12px 10px 28px' }}>
                                <div style={{ fontSize: 10, color: '#3d5580', marginBottom: 3 }}>↳ breadcrumbs ({entry.breadcrumbs.length}):</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                  {entry.breadcrumbs.slice(-8).map((bc, bi) => (
                                    <span key={bi} style={{ fontSize: 10, color: '#4a6280', fontFamily: 'monospace' }}>
                                      <span style={{ color: '#3d5070' }}>{new Date(bc.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                      {' '}<span style={{ color: '#5577aa' }}>[{bc.category}]</span>
                                      {' '}<span style={{ color: '#6688aa' }}>{bc.message.slice(0, 60)}</span>
                                      {bc.screen && <span style={{ color: '#334455' }}> @{bc.screen}</span>}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#3d5070' }}>
                Источники: diagnostics/runtime_moderation (UID, breadcrumbs, firebasePath, networkState) + ops/errors (fallback)
              </p>
              <button type="button" onClick={() => setPermDetails(null)}
                style={{ padding: '7px 20px', borderRadius: 6, border: '1px solid #2d4060', background: 'transparent', color: '#607594', cursor: 'pointer', fontSize: 13 }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
