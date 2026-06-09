import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { InfoHint } from '../components/InfoHint';
import { useSecurityControl } from '../hooks/useSecurityControl';
import {
  getModeratorRoles,
  updateManagedDeviceStatus,
  updateSecurityAppControl,
  type ModeratorRoleRecord,
  type RemoteAppControlConfig,
} from '../services/securityService';

type SecurityPageProps = {
  user: User;
};

type ToggleKey =
  | 'app_enabled'
  | 'maintenance_mode'
  | 'force_update_required'
  | 'allow_new_devices'
  | 'beta_mode_enabled';

const dateTime = (value: number): string => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const statusTone = (active: boolean): string => (active ? 'status active' : 'status warning');

const controlLabels: Record<ToggleKey, string> = {
  app_enabled: 'Приложение включено',
  maintenance_mode: 'Режим обслуживания',
  force_update_required: 'Принудительное обновление',
  allow_new_devices: 'Разрешить новые устройства',
  beta_mode_enabled: 'Бета-режим',
};

const controlHealthy = (field: ToggleKey, value: boolean): boolean => {
  if (field === 'maintenance_mode') return !value;
  if (field === 'force_update_required') return !value;
  return value;
};

const ToggleRow = ({
  config,
  field,
  busy,
  onToggle,
}: {
  config: RemoteAppControlConfig;
  field: ToggleKey;
  busy: boolean;
  onToggle: (field: ToggleKey, value: boolean) => void;
}) => (
  <label className="toggleRow">
    <span>
      <strong>{controlLabels[field]}</strong>
      <small className={controlHealthy(field, config[field]) ? 'healthText ok' : 'healthText danger'}>
        {config[field] ? 'АКТИВНО' : 'ВЫКЛЮЧЕНО'}
      </small>
    </span>
    <input
      checked={config[field]}
      disabled={busy}
      onChange={(event) => onToggle(field, event.target.checked)}
      type="checkbox"
    />
  </label>
);

type UserLastSeenRow = {
  key: string;
  name: string;
  uid: string;
  lastSeenAt: number;
  deviceId: string;
  isBlocked: boolean;
  isAllowed: boolean;
};

export const SecurityPage = ({ user }: SecurityPageProps) => {
  const { config, devices, logs, errors } = useSecurityControl();
  const [minimumVersion, setMinimumVersion] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [optimisticConfig, setOptimisticConfig] = useState<Partial<RemoteAppControlConfig>>({});
  const [moderatorRoles, setModeratorRoles] = useState<ModeratorRoleRecord[]>([]);

  useEffect(() => {
    getModeratorRoles()
      .then(setModeratorRoles)
      .catch(() => { /* non-critical */ });
  }, []);

  const blockedCount = useMemo(() => devices.filter((device) => device.is_blocked).length, [devices]);
  const onlineCount = useMemo(() => {
    const threshold = Date.now() - 15 * 60 * 1000;
    return devices.filter((device) => device.last_seen_at >= threshold && !device.is_blocked).length;
  }, [devices]);

  const uniqueUsers = useMemo<UserLastSeenRow[]>(() => {
    const byUid = new Map<string, UserLastSeenRow>();

    devices.forEach((device) => {
      const rawName = (device.email || '').trim();
      const name = rawName || device.uid;
      const lastSeenAt = device.last_seen_at || device.created_at || 0;
      const current = byUid.get(device.uid);

      if (!current || lastSeenAt > current.lastSeenAt) {
        byUid.set(device.uid, {
          key: device.uid,
          name,
          uid: device.uid,
          lastSeenAt,
          deviceId: device.device_id,
          isBlocked: device.is_blocked,
          isAllowed: device.is_allowed,
        });
      }
    });

    return Array.from(byUid.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }, [devices]);

  const patchConfig = async (patch: Partial<RemoteAppControlConfig>, action: string) => {
    setBusyAction(action);
    setMessage(null);
    try {
      const result = await updateSecurityAppControl(patch, user.uid);
      setMessage(result.changed ? 'Конфигурация безопасности обновлена.' : 'Изменений для сохранения нет.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обновить конфигурацию безопасности.');
    } finally {
      setBusyAction(null);
      setOptimisticConfig({});
    }
  };

  const toggleConfig = (field: ToggleKey, value: boolean) => {
    setOptimisticConfig((prev) => ({ ...prev, [field]: value }));
    void patchConfig({ [field]: value }, field);
  };

  const saveMinimumVersion = () => {
    const value = minimumVersion.trim();
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (value && !versionRegex.test(value)) {
      setMessage('Неверный формат версии. Используйте формат X.Y.Z (например 1.2.3).');
      return;
    }
    void patchConfig({ minimum_required_version: value || undefined }, 'minimum_version');
  };

  const blockUserDevice = (item: UserLastSeenRow) => {
    const confirmed = window.confirm(`Заблокировать устройство ${item.deviceId} у пользователя ${item.name}?`);
    if (!confirmed) return;

    const action = `block:${item.uid}:${item.deviceId}`;
    setBusyAction(action);
    setMessage(null);
    void updateManagedDeviceStatus(item.uid, item.deviceId, { is_allowed: false, is_blocked: true })
      .then(() => setMessage('Устройство заблокировано.'))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Не удалось заблокировать устройство.'))
      .finally(() => setBusyAction(null));
  };

  const unblockUserDevice = (item: UserLastSeenRow) => {
    const confirmed = window.confirm(`Разблокировать устройство ${item.deviceId} у пользователя ${item.name}?`);
    if (!confirmed) return;

    const action = `unblock:${item.uid}:${item.deviceId}`;
    setBusyAction(action);
    setMessage(null);
    void updateManagedDeviceStatus(item.uid, item.deviceId, { is_allowed: true, is_blocked: false })
      .then(() => setMessage('Устройство разблокировано.'))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Не удалось разблокировать устройство.'))
      .finally(() => setBusyAction(null));
  };

  return (
    <section>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Управление в реальном времени</p>
          <div className="headingWithHint">
            <h2>Безопасность</h2>
            <InfoHint text="Управление режимами приложения, устройствами и журналом безопасности." />
          </div>
        </div>
        <span className={statusTone(Boolean(config?.app_enabled && !config?.maintenance_mode))}>
          {config?.app_enabled ? (config.maintenance_mode ? 'ПРЕДУПРЕЖДЕНИЕ' : 'АКТИВНО') : 'ВЫКЛЮЧЕНО'}
        </span>
      </div>

      {errors.length ? (
        <div className="noticeList">
          {errors.map((item) => <p key={item} className="formError">{item}</p>)}
        </div>
      ) : null}
      {message ? <p className="infoMessage">{message}</p> : null}

      <div className="statsGrid">
        <article className="metric metric-primary"><span>Всего устройств</span><strong>{devices.length}</strong></article>
        <article className="metric metric-success"><span>Онлайн</span><strong>{onlineCount}</strong></article>
        <article className="metric metric-danger"><span>Заблокировано</span><strong>{blockedCount}</strong></article>
        <article className="metric metric-violet"><span>Записей в журнале</span><strong>{logs.length}</strong></article>
      </div>

      <div className="grid securityGrid">
        <article className="panel">
          <div className="headingWithHint">
            <h3>Управление приложением</h3>
            <InfoHint text="Изменяет security_config/app_control/current в Firebase." />
          </div>
          {config ? (
            <>
              <div className="toggleList">
                {(['app_enabled', 'maintenance_mode', 'force_update_required', 'allow_new_devices', 'beta_mode_enabled'] as ToggleKey[]).map((field) => (
                  <ToggleRow
                    key={field}
                    config={{ ...config, ...optimisticConfig }}
                    field={field}
                    busy={Boolean(busyAction)}
                    onToggle={toggleConfig}
                  />
                ))}
              </div>
              <div className="inlineEdit">
                <label className="field">
                  <span>Минимальная обязательная версия</span>
                  <input
                    value={minimumVersion}
                    placeholder={config.minimum_required_version || '0.0.0'}
                    onChange={(event) => setMinimumVersion(event.target.value)}
                  />
                </label>
                <button type="button" className="smallButton" disabled={busyAction === 'minimum_version'} onClick={saveMinimumVersion}>
                  Сохранить
                </button>
              </div>
              <dl className="details compactDetails">
                <div><dt>Версия конфига</dt><dd>{config.config_version}</dd></div>
                <div><dt>Обновлено</dt><dd>{dateTime(config.updated_at)}</dd></div>
                <div><dt>Кем обновлено</dt><dd>{config.updated_by || '-'}</dd></div>
              </dl>
            </>
          ) : (
            <p>Загрузка конфигурации...</p>
          )}
        </article>

        <article className="panel">
          <div className="headingWithHint">
            <h3>Последние события безопасности</h3>
            <InfoHint text="Показываются последние записи из security_logs/client_events." />
          </div>
          <div className="logList">
            {logs.slice(0, 12).map((log) => (
              <div key={`${log.partition}:${log.id}`} className="logItem">
                <strong>{log.event_type}</strong>
                <span>{dateTime(log.created_at)}</span>
                <small>{log.uid || '-'} {log.device_id ? `· ${log.device_id}` : ''}</small>
              </div>
            ))}
            {!logs.length ? <p>Журнал безопасности пуст.</p> : null}
          </div>
        </article>
      </div>

      {/* ── Moderator Online Status ──────────────────────────────────────── */}
      <article className="panel" style={{ marginBottom: 20 }}>
        <div className="headingWithHint" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Онлайн-статус модераторов</h3>
          <InfoHint text="Показывает модераторов и администраторов из user_roles. Статус online рассчитывается по last_seen_at устройства (< 5 мин)." />
        </div>
        {moderatorRoles.length === 0 ? (
          <p style={{ color: '#5d6f8b', fontSize: 13 }}>Модераторы не найдены в user_roles. Возможно, у всех роль user.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>UID</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Последний вход</th>
                  <th>Устройство</th>
                </tr>
              </thead>
              <tbody>
                {moderatorRoles.map(({ uid, role }) => {
                  const modDevices = devices.filter((d) => d.uid === uid);
                  const latestDevice = modDevices.reduce<typeof modDevices[0] | null>((best, d) => {
                    if (!best) return d;
                    return (d.last_seen_at || 0) > (best.last_seen_at || 0) ? d : best;
                  }, null);
                  const lastSeen = latestDevice?.last_seen_at ?? 0;
                  const isOnline = lastSeen > 0 && Date.now() - lastSeen < 5 * 60 * 1000;
                  const isRecent = !isOnline && lastSeen > 0 && Date.now() - lastSeen < 30 * 60 * 1000;
                  const onlineBadge = isOnline
                    ? <span className="pill good">● Онлайн</span>
                    : isRecent
                    ? <span className="pill warning">○ Недавно</span>
                    : <span className="pill">○ Офлайн</span>;
                  return (
                    <tr key={uid}>
                      <td><small style={{ fontFamily: 'monospace' }}>{uid.slice(0, 16)}…</small></td>
                      <td>
                        <span className={role === 'admin' ? 'pill good' : 'pill warning'}>{role}</span>
                      </td>
                      <td>{onlineBadge}</td>
                      <td style={{ color: '#5d6f8b', fontSize: 12 }}>{lastSeen ? dateTime(lastSeen) : '—'}</td>
                      <td style={{ color: '#5d6f8b', fontSize: 12 }}>{latestDevice?.platform ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel tablePanel">
        <div className="headingWithHint">
          <h3>Авторизованные устройства</h3>
          <InfoHint text="Уникальные пользователи из authorized_devices с временем последнего входа." />
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>UID</th>
                <th>Последний вход</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {uniqueUsers.map((item) => (
                <tr key={item.key}>
                  <td><strong>{item.name}</strong></td>
                  <td><small>{item.uid}</small></td>
                  <td>{dateTime(item.lastSeenAt)}</td>
                  <td>
                    <span className={item.isBlocked ? 'pill danger' : item.isAllowed ? 'pill good' : 'pill'}>
                      {item.isBlocked ? 'заблокировано' : item.isAllowed ? 'разрешено' : 'ожидает'}
                    </span>
                  </td>
                  <td className="actionsCell">
                    {item.isBlocked ? (
                      <button
                        type="button"
                        className="smallButton"
                        disabled={Boolean(busyAction)}
                        onClick={() => unblockUserDevice(item)}
                      >
                        Разблокировать
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="smallButton dangerButton"
                        disabled={Boolean(busyAction)}
                        onClick={() => blockUserDevice(item)}
                      >
                        Блокировать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!uniqueUsers.length ? (
                <tr><td colSpan={5}>Пользователи не найдены.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
};
