import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { InfoHint } from '../components/InfoHint';
import type { AdminPageKey } from '../components/AppShell';
import { firebaseConfig } from '../firebase/firebase';
import { useDashboard } from '../hooks/useDashboard';
import { updateSecurityAppControl } from '../services/securityService';
import { loadInviteAccessState, type InviteAccessMode } from '../services/inviteAccessService';
import { computeAccessStats, getModeDescription } from '../services/accessControlService';

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
  const { connected, config, stats, activities, issues, error } = useDashboard();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [accessSummary, setAccessSummary] = useState<AccessSummary | null>(null);

  useEffect(() => {
    loadInviteAccessState().then((state) => {
      const s = computeAccessStats(state.requests);
      setAccessSummary({
        enabled: state.flag.enabled,
        mode: state.flag.mode,
        trusted: s.trusted,
        pending: s.pendingSponsor,
        needsReview: s.needsReview,
      });
    }).catch(() => {/* non-critical */});
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

      <div className="statsGrid">
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
          </dl>
        </article>

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
    </section>
  );
};
