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
          <p className="eyebrow">Бета MVP</p>
          <div className="headingWithHint">
            <h2>Панель</h2>
            <InfoHint text="Главный экран с состоянием системы, статистикой и быстрыми действиями." />
          </div>
        </div>
        <span className={connected ? 'status active' : 'status warning'}>
          Firebase {statusLabel(connected)}
        </span>
      </div>

      {error ? <p className="formError">{error}</p> : null}
      {actionMessage ? <p className="infoMessage">{actionMessage}</p> : null}

      {/* Баннер: реальний стан Firebase rules (анонімний HTTP-зонд) */}
      {(() => {
        if (!probeResult && probing) {
          return (
            <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 8, background: '#f5f5f5', border: '1px solid #ccc', fontSize: 13, color: '#555' }}>
              Перевірка правил Firebase... (анонімний запит до RTDB REST API)
            </div>
          );
        }
        if (!probeResult) return null;

        const checkedTimeStr = probeResult.checkedAt
          ? new Date(probeResult.checkedAt).toLocaleTimeString()
          : '';

        if (probeResult.level === 'SECURE') {
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '10px 16px', marginBottom: 16, borderRadius: 8,
              background: '#e8f5e9', border: '1px solid #66bb6a', fontSize: 13,
            }}>
              <span style={{ color: '#2e7d32', fontWeight: 700 }}>
                Правила Firebase закриті — анонімний доступ заблокований
                <span style={{ fontWeight: 400, marginLeft: 8, color: '#388e3c' }}>Перевірено о {checkedTimeStr}</span>
              </span>
              <button type="button" onClick={() => { void runProbe(); }}
                disabled={probing}
                style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #66bb6a', background: '#fff', color: '#2e7d32', fontSize: 12, cursor: 'pointer' }}>
                {probing ? 'Перевірка...' : 'Перевірити знову'}
              </button>
            </div>
          );
        }

        if (probeResult.level === 'ERROR') {
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '10px 16px', marginBottom: 16, borderRadius: 8,
              background: '#f5f5f5', border: '1px solid #bdbdbd', fontSize: 13,
            }}>
              <span style={{ color: '#616161' }}>
                Не вдалося перевірити правила Firebase
                {probeResult.errorMessage ? ` — ${probeResult.errorMessage}` : ''}
              </span>
              <button type="button" onClick={() => { void runProbe(); }}
                disabled={probing}
                style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #bdbdbd', background: '#fff', color: '#424242', fontSize: 12, cursor: 'pointer' }}>
                {probing ? 'Перевірка...' : 'Повторити'}
              </button>
            </div>
          );
        }

        // OPEN або PARTIAL
        const isFullyOpen = probeResult.level === 'OPEN';
        const bg = isFullyOpen ? '#fce4ec' : '#fff3e0';
        const borderColor = isFullyOpen ? '#e53935' : '#fb8c00';
        const titleColor = isFullyOpen ? '#b71c1c' : '#e65100';
        const title = isFullyOpen
          ? 'База даних повністю відкрита — анонімний доступ увімкнено'
          : `База даних частково відкрита (${probeResult.openPaths.length} з 4 шляхів)`;

        return (
          <div style={{
            padding: '12px 18px', marginBottom: 20, borderRadius: 8,
            background: bg, border: `2px solid ${borderColor}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ color: titleColor, fontSize: 14 }}>{title}</strong>
                <div style={{ fontSize: 12, color: titleColor, marginTop: 4, lineHeight: 1.6 }}>
                  Відкриті шляхи (без авторизації):&nbsp;
                  {probeResult.openPaths.map((p) => (
                    <code key={p} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p}</code>
                  ))}
                </div>
                {probeResult.closedPaths.length > 0 && (
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                    Закриті:&nbsp;
                    {probeResult.closedPaths.map((p) => (
                      <code key={p} style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p}</code>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Перевірено о {checkedTimeStr} · Анонімний HTTP GET до RTDB REST API
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => { void runProbe(); }}
                  disabled={probing}
                  style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${borderColor}`, background: '#fff', color: titleColor, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  {probing ? 'Перевірка...' : 'Перевірити знову'}
                </button>
                <button type="button" onClick={() => onNavigate('ai_diagnostics')}
                  style={{ padding: '6px 14px', borderRadius: 5, border: `2px solid ${borderColor}`, background: titleColor, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  Shadow Deny
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="statsGrid">
        <article className="metric metric-success"><span>Активные сегодня</span><strong>{stats.activeUsersToday}</strong></article>
        <article className={stats.permissionDenied24h < 5 ? 'metric metric-info' : 'metric metric-danger'} style={{ cursor: 'pointer' }}>
          <span>permission_denied 24ч</span>
          <strong>{stats.permissionDenied24h}</strong>
          {stats.permissionDenied24h > 0 && (
            <button
              type="button"
              onClick={() => { void handleShowPermDetails(); }}
              disabled={permDetailsLoading}
              style={{ marginTop: 6, fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.85 }}
            >
              {permDetailsLoading ? 'Загрузка...' : 'Показать подробности'}
            </button>
          )}
        </article>
        <article className={stats.activeSubscriptions <= 4 ? 'metric metric-success' : 'metric metric-warning'}><span>onValue подписки</span><strong>{stats.activeSubscriptions}</strong></article>
        <article className="metric metric-warning"><span>Pending фото</span><strong>{stats.pendingPhotos}</strong></article>
        <article className="metric metric-warning"><span>Pending invite</span><strong>{stats.pendingInviteRequests}</strong></article>
        <article className="metric metric-primary"><span>Модерация, ч</span><strong>{stats.moderationAvgHours ? stats.moderationAvgHours.toFixed(1) : '0'}</strong></article>
        <article className={stats.rulesEnforcementLevel === 'SECURE' ? 'metric metric-success' : stats.rulesEnforcementLevel === 'OPEN' ? 'metric metric-danger' : 'metric metric-warning'}><span>Rules уровень</span><strong>{stats.rulesEnforcementLevel}</strong></article>
        <article className="metric metric-info"><span>Пользователи</span><strong>{stats.usersTotal}</strong></article>
        <article className="metric metric-primary"><span>Устройства</span><strong>{stats.devicesTotal}</strong></article>
        <article className="metric metric-success"><span>Онлайн устройства</span><strong>{stats.onlineDevices}</strong></article>
        <article className="metric metric-danger"><span>Заблокированные</span><strong>{stats.blockedDevices}</strong></article>
        <article className="metric metric-cyan"><span>Новые за 24ч</span><strong>{stats.newDevices24h}</strong></article>
        <article className="metric metric-violet"><span>Всего модерации</span><strong>{stats.moderationTotal}</strong></article>
        <article className="metric metric-warning"><span>Ожидают</span><strong>{stats.pending}</strong></article>
        <article className="metric metric-dark"><span>Отклонены</span><strong>{stats.rejected}</strong></article>
        <article className="metric metric-info"><span>Архив</span><strong>{stats.expired}</strong></article>
      </div>

      <div className="grid dashboardGrid">
        <article className="panel">
          <div className="headingWithHint">
            <h3>Состояние системы</h3>
            <InfoHint text="Текущие ключевые флаги из security_config/app_control/current." />
          </div>
          <dl className="details compactDetails">
            <div><dt>Режим обслуживания</dt><dd className={healthClass(!Boolean(config?.maintenance_mode))}>{config?.maintenance_mode ? 'АКТИВНО' : 'ВЫКЛЮЧЕНО'}</dd></div>
            <div><dt>Приложение доступно</dt><dd className={healthClass(Boolean(config?.app_enabled))}>{config?.app_enabled ? 'АКТИВНО' : 'ВЫКЛЮЧЕНО'}</dd></div>
            <div><dt>Принудительное обновление</dt><dd className={healthClass(!Boolean(config?.force_update_required))}>{config?.force_update_required ? 'АКТИВНО' : 'ВЫКЛЮЧЕНО'}</dd></div>
            <div><dt>Минимальная версия</dt><dd>{config?.minimum_required_version || '-'}</dd></div>
            <div><dt>Новые устройства</dt><dd className={healthClass(Boolean(config?.allow_new_devices))}>{config?.allow_new_devices ? 'РАЗРЕШЕНЫ' : 'ЗАПРЕЩЕНЫ'}</dd></div>
            <div><dt>Связь с Firebase</dt><dd className={healthClass(Boolean(connected))}>{statusLabel(connected)}</dd></div>
            <div><dt>Активные пользователи сегодня</dt><dd>{stats.activeUsersToday}</dd></div>
            <div>
              <dt>permission_denied за 24ч</dt>
              <dd className={healthClass(stats.permissionDenied24h < 5)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {stats.permissionDenied24h}
                {stats.permissionDenied24h > 0 && (
                  <button
                    type="button"
                    onClick={() => { void handleShowPermDetails(); }}
                    disabled={permDetailsLoading}
                    style={{ fontSize: 11, padding: '1px 8px', borderRadius: 4, border: '1px solid #888', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                  >
                    {permDetailsLoading ? '...' : 'подробности'}
                  </button>
                )}
              </dd>
            </div>
            <div><dt>onValue подписок активных</dt><dd className={healthClass(stats.activeSubscriptions <= 4)}>{stats.activeSubscriptions} / цель ≤4</dd></div>
            <div><dt>Pending фото</dt><dd>{stats.pendingPhotos}</dd></div>
            <div><dt>Pending invite заявок</dt><dd>{stats.pendingInviteRequests}</dd></div>
            <div><dt>Среднее время модерации</dt><dd>{stats.moderationAvgHours ? `${stats.moderationAvgHours.toFixed(1)} ч` : '-'}</dd></div>
            <div><dt>Firebase Rules уровень</dt><dd className={healthClass(stats.rulesEnforcementLevel === 'SECURE')}>{stats.rulesEnforcementLevel}</dd></div>
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
                <button type="button" className="smallButton" onClick={() => onNavigate('moderation')}>Открыть модерацию</button>
                <InfoHint text="Переход к заявкам и контенту для approve/reject/delete." />
              </div>
              <div className="actionWithHint">
                <button type="button" className="smallButton" onClick={() => onNavigate('security')}>Открыть безопасность</button>
                <InfoHint text="Переход к конфигурации безопасности и устройствам." />
              </div>
              <div className="actionWithHint">
                <button type="button" className="smallButton" disabled={Boolean(busyAction)} onClick={() => void runQuickAction('maintenance')}>
                  {config?.maintenance_mode ? 'Выключить обслуживание' : 'Включить обслуживание'}
                </button>
                <InfoHint text="Переключает maintenance_mode для всего приложения." />
              </div>
              <div className="actionWithHint">
                <button
                  type="button"
                  className={config?.app_enabled ? 'smallButton dangerButton' : 'smallButton'}
                  disabled={Boolean(busyAction)}
                  onClick={() => void runQuickAction(config?.app_enabled ? 'disable_app' : 'enable_app')}
                >
                  {config?.app_enabled ? 'Отключить приложение' : 'Включить приложение'}
                </button>
                <InfoHint text="Меняет флаг app_enabled. При отключении пользователи не смогут войти." />
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
            {activities.map((activity) => (
              <div key={activity.id} className="logItem">
                <strong>{activity.action}</strong>
                <span>{dateTime(activity.time)}</span>
                <small>{activity.email || '-'} {activity.deviceId ? `· ${activity.deviceId}` : ''}</small>
              </div>
            ))}
            {!activities.length ? <p>Нет недавней активности.</p> : null}
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
            {!issues.length ? <p>КРИТИЧЕСКИХ ПРОБЛЕМ НЕТ</p> : null}
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
