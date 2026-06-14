import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { SecurityRole } from '../services/authService';
import { InfoHint } from '../components/InfoHint';
import {
  grantTemporaryAccess,
  loadInviteAccessState,
  loadMoreRequests,
  moderateInviteRequest,
  setInviteAccessEnabled,
  setInviteAccessMode,
  type InviteAccessMode,
  type InviteAccessState,
  type InviteRequest,
  type InviteRequestStatus,
} from '../services/inviteAccessService';
import {
  computeAccessStats,
  getModeDescription,
  getTierClass,
  getTierFromStatus,
  getTierLabel,
} from '../services/accessControlService';
import {
  auditPublishRules,
  computeDenialAggregates,
  detectRisks,
  fetchSubmissionDenials,
  type DenialCategory,
  type DenialEntry,
  type DenialAggregates,
  type RulesAuditResult,
} from '../services/submissionDenialService';
import {
  subscribeManagedAuthorizedDevices,
  updateSecurityAppControl,
  setPersonalForceUpdate,
  type ManagedAuthorizedDevice,
} from '../services/securityService';
import {
  disableEmergencyDebugUnlock,
  enableEmergencyDebugUnlock,
  isEmergencyAccessActive,
  subscribeEmergencyAccess,
  type EmergencyAccessCurrent,
} from '../services/emergencyDebugService';
import {
  getApkDownloads,
  getCurrentVersionRegistry,
  type ApkDownloadRecord,
  type AppVersionRegistry,
} from '../services/apkVersionService';
import { useAuthAccess } from '../hooks/useAuthAccess';

type AccessControlPageProps = {
  role: SecurityRole;
  onNavigateToInvites: () => void;
};
type RequestFilter = 'all' | 'needs_manual_review' | 'pending' | 'approved' | 'denied';

const emptyState: InviteAccessState = {
  flag: { enabled: false, mode: 'disabled', updatedAt: 0, updatedBy: '', version: 0 },
  sponsors: [],
  requests: [],
  hasMore: false,
};

const dateTime = (value: number): string => (value ? new Date(value).toLocaleString() : '—');

const requestStatusLabel = (status: InviteRequestStatus): string => {
  if (status === 'approved') return 'одобрена';
  if (status === 'denied') return 'отклонена';
  if (status === 'cancelled') return 'отменена';
  if (status === 'needs_manual_review') return 'ручная проверка';
  if (status === 'pending_sponsor') return 'ждёт поручителя';
  if (status === 'auto_denied') return 'авто-отклонена';
  return 'ожидает';
};

const filterLabel = (filter: RequestFilter): string => {
  if (filter === 'needs_manual_review') return 'Требует проверки';
  if (filter === 'pending') return 'Ожидают';
  if (filter === 'approved') return 'Trusted';
  if (filter === 'denied') return 'Отклонены';
  return 'Все';
};

const formatInviteError = (error: unknown): string => {
  const err = error as { code?: unknown; message?: unknown };
  const code = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
  const message = error instanceof Error ? error.message : typeof err?.message === 'string' ? err.message : String(error || '');
  const normalized = `${code} ${message}`.toLowerCase();
  if (normalized.includes('invite access is not configured')) {
    return 'Не удалось выполнить: backend не настроен (INVITE_ACCESS_HASH_SECRET).';
  }
  if (normalized.includes('admin access required') || normalized.includes('permission-denied')) {
    return 'Требуется доступ администратора.';
  }
  if (normalized.includes('not-found')) {
    return 'Серверная функция ещё не задеплоена. Нужно обновить Firebase Functions.';
  }
  if (normalized.includes('internal')) {
    return 'Сервер вернул внутреннюю ошибку. Обычно это значит, что функция не задеплоена или упала на backend.';
  }
  return message || 'Действие не выполнено.';
};

const modeLabel = (mode: InviteAccessMode): string => {
  if (mode === 'soft') return 'SOFT';
  if (mode === 'medium') return 'MEDIUM';
  return 'DISABLED';
};

export const AccessControlPage = ({ role, onNavigateToInvites }: AccessControlPageProps) => {
  const [state, setState] = useState<InviteAccessState>(emptyState);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('needs_manual_review');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [tempUid, setTempUid] = useState('');
  const [tempHours, setTempHours] = useState(48);
  const [tempReason, setTempReason] = useState('');
  const [emergencyAccess, setEmergencyAccess] = useState<EmergencyAccessCurrent | null>(null);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('Ремонт и отладка APK');
  const [emergencyTtlMinutes, setEmergencyTtlMinutes] = useState(120);
  const [emergencyConfirmText, setEmergencyConfirmText] = useState('');

  const canModerate = role === 'admin' || role === 'moderator';
  const canManage = role === 'admin';

  const access = useAuthAccess();
  const actorUid = access.status === 'allowed' ? access.user.uid : '';

  const [devices, setDevices] = useState<ManagedAuthorizedDevice[]>([]);
  const [apkDownloads, setApkDownloads] = useState<Record<string, ApkDownloadRecord>>({});
  const [versionRegistry, setVersionRegistry] = useState<AppVersionRegistry | null>(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [devicesPage, setDevicesPage] = useState(0);
  const DEVICES_PAGE_SIZE = 20;

  // ── Denial Monitor state ──
  const [denials, setDenials] = useState<DenialEntry[]>([]);
  const [denialAggregates, setDenialAggregates] = useState<DenialAggregates | null>(null);
  const [denialRisks, setDenialRisks] = useState<string[]>([]);
  const [rulesAudit, setRulesAudit] = useState<RulesAuditResult[]>([]);
  const [denialLoading, setDenialLoading] = useState(false);
  const [denialFilter, setDenialFilter] = useState<DenialCategory | 'all'>('all');
  const [denialScreenFilter, setDenialScreenFilter] = useState('');
  const [denialPeriod, setDenialPeriod] = useState<'1h' | '24h' | '7d'>('24h');

  const autoRefreshRef = useRef({ loading, busyAction, refresh: async () => {} });
  autoRefreshRef.current.loading = loading;
  autoRefreshRef.current.busyAction = busyAction;

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setState(await loadInviteAccessState());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить данные доступа.');
    } finally {
      setLoading(false);
    }
  };

  autoRefreshRef.current.refresh = refresh;

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeEmergencyAccess(
      setEmergencyAccess,
      (error) => setMessage(error.message || 'Не удалось загрузить emergency debug статус.'),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!autoRefreshRef.current.loading && !autoRefreshRef.current.busyAction) {
        void autoRefreshRef.current.refresh();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    setVersionLoading(true);
    Promise.all([getApkDownloads(), getCurrentVersionRegistry()])
      .then(([downloads, registry]) => {
        if (!mounted) return;
        setApkDownloads(downloads);
        setVersionRegistry(registry);
      })
      .catch((err: unknown) => console.warn('[AccessControl] Failed to load APK/version data:', err))
      .finally(() => { if (mounted) setVersionLoading(false); });

    const unsub = subscribeManagedAuthorizedDevices(setDevices, (err) => console.warn('[AccessControl] devices:', err.message));
    return () => { mounted = false; unsub(); };
  }, []);

  // ── Denial monitor data ──
  useEffect(() => {
    let mounted = true;
    setDenialLoading(true);
    fetchSubmissionDenials()
      .then((entries) => {
        if (!mounted) return;
        setDenials(entries);
        setDenialAggregates(computeDenialAggregates(entries));
        setDenialRisks(detectRisks(entries));
      })
      .catch((err: unknown) => console.warn('[AccessControl] Failed to load denials:', err))
      .finally(() => { if (mounted) setDenialLoading(false); });
    setRulesAudit(auditPublishRules());
    return () => { mounted = false; };
  }, []);

  const refreshDenials = async () => {
    setDenialLoading(true);
    try {
      const entries = await fetchSubmissionDenials();
      setDenials(entries);
      setDenialAggregates(computeDenialAggregates(entries));
      setDenialRisks(detectRisks(entries));
    } catch (err) {
      console.warn('[AccessControl] Failed to refresh denials:', err);
    } finally {
      setDenialLoading(false);
    }
  };

  const periodMs = denialPeriod === '1h' ? 60 * 60 * 1000 : denialPeriod === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const filteredDenials = useMemo(() => {
    const since = Date.now() - periodMs;
    return denials.filter((d) => {
      if (d.at < since) return false;
      if (denialFilter !== 'all' && d.category !== denialFilter) return false;
      if (denialScreenFilter && !d.screen.toLowerCase().includes(denialScreenFilter.toLowerCase())) return false;
      return true;
    });
  }, [denials, denialFilter, denialScreenFilter, denialPeriod, periodMs]);

  const uniqueScreens = useMemo(() => [...new Set(denials.map((d) => d.screen).filter(Boolean))], [denials]);

  const rulesWarnings = useMemo(() => rulesAudit.filter((r) => r.warnings.length > 0), [rulesAudit]);

  const runAction = async (
    actionId: string,
    action: () => Promise<unknown>,
    success: string,
    options?: { alertOnError?: boolean },
  ) => {
    setBusyAction(actionId);
    setMessage(null);
    let ok = false;
    try {
      await action();
      setMessage(success);
      ok = true;
    } catch (error) {
      const msg = formatInviteError(error);
      setMessage(msg);
      if (options?.alertOnError !== false) {
        window.alert(msg);
      }
    } finally {
      setBusyAction(null);
    }
    if (ok) await refresh();
  };

  const stats = useMemo(() => computeAccessStats(state.requests), [state.requests]);

  const filteredRequests = useMemo((): InviteRequest[] => {
    if (requestFilter === 'all') return state.requests;
    if (requestFilter === 'pending') {
      return state.requests.filter((r) => r.status === 'pending' || r.status === 'pending_sponsor');
    }
    if (requestFilter === 'denied') {
      return state.requests.filter((r) => r.status === 'denied' || r.status === 'auto_denied');
    }
    return state.requests.filter((r) => r.status === requestFilter);
  }, [requestFilter, state.requests]);

  const needsAttentionCount = state.requests.filter((r) => r.status === 'needs_manual_review').length;

  const toggleFlag = () => {
    const next = !state.flag.enabled;
    if (!window.confirm(next ? 'Включить систему поручителей?' : 'Выключить систему поручителей?')) return;
    void runAction('flag', () => setInviteAccessEnabled(next), next ? 'Система включена.' : 'Система выключена.');
  };

  const changeMode = (mode: InviteAccessMode) => {
    if (mode === state.flag.mode) return;
    if (!window.confirm(`Переключить на ${modeLabel(mode)}?`)) return;
    void runAction(`mode:${mode}`, () => setInviteAccessMode(mode), `Режим: ${modeLabel(mode)}.`);
  };

  const moderate = (req: InviteRequest, action: 'approved' | 'denied') => {
    const label = action === 'approved' ? 'одобрить' : 'отклонить';
    if (!window.confirm(`Хотите ${label} заявку от ${req.requesterPhoneMasked}?`)) return;
    void runAction(
      `moderate:${req.id}`,
      () => moderateInviteRequest(req.id, action, moderationReason),
      `Заявка ${label === 'одобрить' ? 'одобрена' : 'отклонена'}.`,
    );
    setExpandedRequestId(null);
    setModerationReason('');
  };

  const grantTemp = () => {
    if (!tempUid.trim()) { setMessage('Введите UID пользователя.'); return; }
    if (!tempReason.trim()) { setMessage('Введите причину выдачи доступа.'); return; }
    if (tempHours < 1 || tempHours > 720) { setMessage('Часы: от 1 до 720.'); return; }
    void runAction(
      `temp:${tempUid}`,
      () => grantTemporaryAccess(tempUid.trim(), tempHours, tempReason),
      `Временный доступ выдан на ${tempHours}ч.`,
    );
    setTempUid('');
    setTempReason('');
    setTempHours(48);
  };

  const openEmergencyModal = () => {
    setEmergencyReason('Ремонт и отладка APK');
    setEmergencyTtlMinutes(360);
    setEmergencyConfirmText('');
    setEmergencyModalOpen(true);
  };

  const confirmEmergencyEnable = () => {
    if (!emergencyReason.trim()) {
      setMessage('Укажите причину включения emergency debug режима.');
      return;
    }
    if (emergencyConfirmText.trim() !== 'DEBUG') {
      setMessage('Для подтверждения введите DEBUG.');
      return;
    }

    void runAction(
      'emergency_enable',
      () => enableEmergencyDebugUnlock(emergencyReason.trim(), emergencyTtlMinutes),
      'Аварийный режим включен. Доступ обновлен, режим выключится автоматически.',
      { alertOnError: false },
    );
    setEmergencyModalOpen(false);
  };

  const confirmEmergencyDisable = () => {
    if (!window.confirm('Включить защиту обратно и снять emergency debug claim?')) return;
    void runAction(
      'emergency_disable',
      () => disableEmergencyDebugUnlock(),
      'Аварийный режим выключен. Защита включена обратно.',
      { alertOnError: false },
    );
  };

  const cmpVer = (a: string, b: string): number => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  };

  const forceUpdateAll = () => {
    if (!versionRegistry?.version) { setMessage('Версия реестра неизвестна.'); return; }
    if (!window.confirm(`Включить обязательное обновление до v${versionRegistry.version} для ВСЕХ пользователей?`)) return;
    void runAction(
      'force_update_all',
      () => updateSecurityAppControl({ force_update_required: true, minimum_required_version: versionRegistry.version }, actorUid),
      `Обязательное обновление v${versionRegistry.version} включено для всех.`,
    );
  };

  const clearForceUpdate = () => {
    if (!window.confirm('Снять обязательное обновление для всех?')) return;
    void runAction(
      'clear_force_update',
      () => updateSecurityAppControl({ force_update_required: false }, actorUid),
      'Обязательное обновление снято.',
    );
  };

  const setDeviceForceUpdate = (uid: string, deviceId: string, value: boolean) => {
    const label = value ? 'включить' : 'снять';
    if (!window.confirm(`Хотите ${label} форс-апдейт для этого устройства?`)) return;
    void runAction(
      `pfu:${uid}:${deviceId}`,
      () => setPersonalForceUpdate(uid, deviceId, value),
      value ? 'Форс-апдейт включен для устройства.' : 'Форс-апдейт снят.',
    );
  };

  // Latest device per uid (sorted by last_seen_at desc)
  const latestDeviceByUid = useMemo((): Map<string, ManagedAuthorizedDevice> => {
    const map = new Map<string, ManagedAuthorizedDevice>();
    for (const d of devices) {
      const existing = map.get(d.uid);
      const dTime = d.last_seen_at || d.created_at;
      if (!existing || dTime > (existing.last_seen_at || existing.created_at)) {
        map.set(d.uid, d);
      }
    }
    return map;
  }, [devices]);

  // All uids that have at least a device record OR a download record
  const trackedUids = useMemo((): string[] => {
    const set = new Set<string>([
      ...latestDeviceByUid.keys(),
      ...Object.keys(apkDownloads),
    ]);
    return Array.from(set).sort();
  }, [latestDeviceByUid, apkDownloads]);

  // Map uid → phone from invite requests
  const phoneByUid = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const req of state.requests) {
      if (req.requesterUid && req.requesterPhoneMasked && !map.has(req.requesterUid)) {
        map.set(req.requesterUid, req.requesterPhoneMasked);
      }
    }
    return map;
  }, [state.requests]);

  const emergencyActive = isEmergencyAccessActive(emergencyAccess);

  const loadMore = async () => {
    if (!state.hasMore || !state.requests.length) return;
    const oldest = state.requests[state.requests.length - 1].createdAt;
    setBusyAction('loadmore');
    try {
      const { requests: more, hasMore } = await loadMoreRequests(oldest);
      setState((prev) => ({ ...prev, requests: [...prev.requests, ...more], hasMore }));
    } catch {
      setMessage('Не удалось загрузить больше записей.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="accessControl">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">3-уровневая система</p>
          <div className="headingWithHint">
            <h2>Контроль доступа</h2>
            <InfoHint text="Управление уровнями Public / Registered / Trusted. Статистика заявок и быстрые действия модератора." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {needsAttentionCount > 0 && (
            <span className="status warning">{needsAttentionCount} требуют проверки</span>
          )}
          <span className={state.flag.enabled ? 'status active' : 'status warning'}>
            Система {state.flag.enabled ? `вкл · ${modeLabel(state.flag.mode)}` : 'выкл'}
          </span>
          <button type="button" className="smallButton" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {message && <p className="infoMessage">{message}</p>}

      <article
        className="panel"
        style={{
          marginBottom: 20,
          border: emergencyActive ? '2px solid #f06445' : '1px solid #bdd1f2',
          background: emergencyActive ? '#fff4ed' : '#f5fbff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>АВАРИЙНЫЙ РЕЖИМ РЕМОНТА APK</p>
            <h3 style={{ margin: '6px 0 8px', color: emergencyActive ? '#8f2d1f' : '#17446b' }}>
              Аварийный режим: {emergencyActive ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}
            </h3>
            <div
              style={{
                margin: '0 0 12px',
                padding: '14px 16px',
                borderRadius: 8,
                background: emergencyActive ? '#b42318' : '#125e66',
                color: '#fff',
                boxShadow: '0 8px 20px rgba(15, 30, 45, 0.14)',
              }}
            >
              <strong style={{ display: 'block', fontSize: 22, lineHeight: 1.15, letterSpacing: 0 }}>
                {emergencyActive ? 'ЗАЩИТА ДЛЯ РЕМОНТА ОТКЛЮЧЕНА' : 'ЗАЩИТА ВКЛЮЧЕНА'}
              </strong>
              <span style={{ display: 'block', marginTop: 6, fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,0.92)' }}>
                {emergencyActive
                  ? 'Внутренние блокировки APK временно сняты для владельца/админа. База не открыта всем пользователям.'
                  : 'Обычные ограничения приложения работают. Пользователи проходят стандартные проверки доступа.'}
              </span>
            </div>
            <p style={{ margin: '0 0 10px', color: '#5d6f8b', fontSize: 12, lineHeight: 1.45 }}>
              Режим временно снимает внутренние ограничения только для владельца и админов,
              чтобы быстро починить и проверить APK.
            </p>
            <dl className="details compactDetails" style={{ margin: 0 }}>
              <div><dt>Автоотключение</dt><dd>{emergencyAccess?.expiresAt ? dateTime(emergencyAccess.expiresAt) : '—'}</dd></div>
              <div><dt>Кто включил</dt><dd>{emergencyAccess?.enabledByEmail || '—'}</dd></div>
              <div><dt>Причина</dt><dd>{emergencyAccess?.reason || (emergencyActive ? '—' : 'Защита включена')}</dd></div>
            </dl>
            <p style={{ margin: '10px 0 0', color: '#5d6f8b', fontSize: 12, lineHeight: 1.45 }}>
              Автоотключение — когда режим сам выключится. Кто включил — аккаунт администратора. Причина — зачем включали ремонтный доступ.
            </p>
            {/* ── Bypass флаги ── */}
            {emergencyAccess && (
              <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 12 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: emergencyActive ? '#8f2d1f' : '#17446b' }}>
                  Bypass-флаги аварийного режима:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([
                    ['bypassDeviceAuthorization', 'Авторизация устройств'],
                    ['bypassForceUpdate', 'Принуд. обновление'],
                    ['bypassMaintenance', 'Режим обслуживания'],
                    ['bypassInviteAccess', 'Система приглашений'],
                    ['bypassUserAccess', 'Проверка доступа'],
                    ['bypassDiagnosticsRestrictions', 'Ограничения диагностики'],
                  ] as [keyof typeof emergencyAccess, string][]).map(([flag, label]) => (
                    <span
                      key={flag}
                      className={emergencyAccess[flag] ? 'pill warning' : 'pill'}
                      style={{ fontSize: 11 }}
                    >
                      {emergencyAccess[flag] ? '⚠ ' : '✓ '}{label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr)', gap: 12, flex: '1 1 520px' }}>
            <button
              type="button"
              className="smallButton"
              style={{
                minHeight: 74,
                fontSize: 15,
                fontWeight: 800,
                background: '#d9481f',
                borderColor: '#a62f18',
                color: '#fff',
                whiteSpace: 'normal',
              }}
              disabled={!canManage || Boolean(busyAction)}
              onClick={openEmergencyModal}
            >
              ОТКЛЮЧИТЬ ОГРАНИЧЕНИЯ ДЛЯ РЕМОНТА APK
            </button>
            <p style={{ margin: '6px 0 0', color: '#5d6f8b', fontSize: 12, lineHeight: 1.4 }}>
              Включает аварийный режим отладки после подтверждения: причина, время действия и код DEBUG.
            </p>
            <button
              type="button"
              className="smallButton"
              style={{
                minHeight: 74,
                fontSize: 15,
                fontWeight: 800,
                background: '#166a74',
                borderColor: '#0f4d56',
                color: '#fff',
                whiteSpace: 'normal',
              }}
              disabled={!canManage || Boolean(busyAction) || !emergencyAccess?.enabled}
              onClick={confirmEmergencyDisable}
            >
              ДЕАКТИВИРОВАТЬ ВСЕ BYPASS-ФЛАГИ
            </button>
            <p style={{ margin: '6px 0 0', color: '#5d6f8b', fontSize: 12, lineHeight: 1.4 }}>
              Немедленно деактивирует все bypass-флаги и возвращает стандартные ограничения.
            </p>
          </div>
        </div>
      </article>

      {emergencyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(6, 20, 35, 0.46)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div className="panel" style={{ width: 'min(620px, 100%)', margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Подтвердите аварийный режим ремонта APK</h3>
            <p style={{ color: '#4f6178', lineHeight: 1.55 }}>
              Вы включаете аварийный режим отладки. Он временно отключит внутренние ограничения приложения для владельца/админа, чтобы можно было ремонтировать APK. Режим автоматически выключится через выбранное время.
            </p>
            <div className="field">
              <span>Причина включения</span>
              <small style={{ color: '#5d6f8b' }}>
                Коротко опишите, что именно ремонтируете (например: "починка запуска APK").
              </small>
              <input
                type="text"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                disabled={Boolean(busyAction)}
              />
            </div>
            <div className="field">
              <span>Время действия</span>
              <small style={{ color: '#5d6f8b' }}>
                Время действия — сколько режим будет активен до автоотключения.
              </small>
              <select
                value={emergencyTtlMinutes}
                onChange={(e) => setEmergencyTtlMinutes(Number(e.target.value))}
                disabled={Boolean(busyAction)}
              >
                <option value={30}>30 минут</option>
                <option value={60}>1 час</option>
                <option value={120}>2 часа</option>
                <option value={240}>4 часа</option>
                <option value={360}>6 часов</option>
              </select>
            </div>
            <div className="field">
              <span>Подтверждение текстом: DEBUG</span>
              <small style={{ color: '#5d6f8b' }}>
                Защита от случайного включения: режим стартует только после ввода DEBUG.
              </small>
              <input
                type="text"
                value={emergencyConfirmText}
                onChange={(e) => setEmergencyConfirmText(e.target.value)}
                disabled={Boolean(busyAction)}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="smallButton"
                disabled={Boolean(busyAction)}
                onClick={() => setEmergencyModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="smallButton"
                style={{ background: '#d9481f', borderColor: '#a62f18' }}
                disabled={Boolean(busyAction) || !emergencyReason.trim() || emergencyConfirmText.trim() !== 'DEBUG'}
                onClick={confirmEmergencyEnable}
              >
                {busyAction === 'emergency_enable' ? 'Включаем...' : 'Включить аварийный режим'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tier Stats ──────────────────────────────────────────────────── */}
      <div className="statsGrid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <article className="metric metric-success">
          <span>Trusted</span>
          <strong>{stats.trusted}</strong>
        </article>
        <article className="metric metric-warning">
          <span>Ожидают</span>
          <strong>{stats.pendingSponsor}</strong>
        </article>
        <article className="metric metric-danger">
          <span>Проверка</span>
          <strong>{stats.needsReview}</strong>
        </article>
        <article className="metric metric-dark">
          <span>Отклонены</span>
          <strong>{stats.denied}</strong>
        </article>
        <article className="metric metric-info">
          <span>Всего заявок</span>
          <strong>{stats.total}</strong>
        </article>
      </div>

      {/* ── APK Version Tracking ──────────────────────────────────────────── */}
      <article className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div className="headingWithHint">
            <h3 style={{ margin: 0 }}>Версии APK</h3>
            <InfoHint text="Актуальная версия из реестра. Показывает, какую версию пользователи скачали и запустили." />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {versionRegistry ? (
              <span className="status active">
                Актуальная: v{versionRegistry.version} · {versionRegistry.buildStamp}
              </span>
            ) : (
              <span className="status warning">{versionLoading ? 'Загрузка...' : 'Реестр не найден'}</span>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  className="smallButton"
                  style={{ background: '#4a1414', borderColor: '#7a2a2a' }}
                  disabled={Boolean(busyAction) || !versionRegistry?.version}
                  onClick={forceUpdateAll}
                >
                  {busyAction === 'force_update_all' ? '...' : 'Обновление всем'}
                </button>
                <button
                  type="button"
                  className="smallButton"
                  disabled={Boolean(busyAction)}
                  onClick={clearForceUpdate}
                >
                  {busyAction === 'clear_force_update' ? '...' : 'Снять обновление'}
                </button>
              </>
            )}
          </div>
        </div>

        {trackedUids.length === 0 ? (
          <p style={{ color: '#5d6f8b' }}>{versionLoading ? 'Загрузка данных устройств...' : 'Нет данных об устройствах.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13, color: '#5d6f8b' }}>
              <span>Всего: {trackedUids.length} · Страница {devicesPage + 1} из {Math.ceil(trackedUids.length / DEVICES_PAGE_SIZE)}</span>
              <button
                type="button"
                className="smallButton"
                style={{ padding: '2px 10px', minHeight: 28, fontSize: 12 }}
                disabled={devicesPage === 0}
                onClick={() => setDevicesPage((p) => p - 1)}
              >
                ← Пред
              </button>
              <button
                type="button"
                className="smallButton"
                style={{ padding: '2px 10px', minHeight: 28, fontSize: 12 }}
                disabled={(devicesPage + 1) * DEVICES_PAGE_SIZE >= trackedUids.length}
                onClick={() => setDevicesPage((p) => p + 1)}
              >
                След →
              </button>
            </div>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Телефон / UID</th>
                  <th>Скачал APK</th>
                  <th>Запустил</th>
                  <th>Актуальна?</th>
                  <th>Платформа</th>
                  {canManage && <th>Действие</th>}
                </tr>
              </thead>
              <tbody>
                {trackedUids.slice(devicesPage * DEVICES_PAGE_SIZE, (devicesPage + 1) * DEVICES_PAGE_SIZE).map((uid) => {
                  const device = latestDeviceByUid.get(uid);
                  const download = apkDownloads[uid];
                  const phone = phoneByUid.get(uid);
                  const runningVer = device?.app_version ?? '—';
                  const downloadedVer = download?.version ?? '—';
                  const currentVer = versionRegistry?.version ?? '';
                  const hasPersonalForceUpdate = device?.personal_force_update === true;

                  let statusBadge: JSX.Element | string = '—';
                  if (currentVer) {
                    const runningOk = runningVer !== '—' && cmpVer(runningVer, currentVer) >= 0;
                    const downloadOk = downloadedVer !== '—' && cmpVer(downloadedVer, currentVer) >= 0;
                    if (runningOk && downloadOk) {
                      statusBadge = <span className="pill good">✓ Ок</span>;
                    } else if (runningVer === '—' && downloadedVer === '—') {
                      statusBadge = <span className="pill">—</span>;
                    } else {
                      statusBadge = <span className="pill warning">⚠ Старая</span>;
                    }
                  }

                  return (
                    <tr key={uid}>
                      <td>
                        <code style={{ fontSize: 12 }}>{phone ?? '—'}</code>
                        <small style={{ display: 'block', color: '#7a8fa8' }}>{uid.slice(0, 12)}...</small>
                      </td>
                      <td>{downloadedVer !== '—' ? <code style={{ fontSize: 12 }}>{downloadedVer}</code> : <span style={{ color: '#aaa' }}>—</span>}</td>
                      <td>{runningVer !== '—' ? <code style={{ fontSize: 12 }}>{runningVer}</code> : <span style={{ color: '#aaa' }}>—</span>}</td>
                      <td>{statusBadge}</td>
                      <td><small style={{ color: '#7a8fa8' }}>{device?.platform ?? '—'}</small></td>
                      {canManage && (
                        <td>
                          {device && (
                            hasPersonalForceUpdate ? (
                              <button
                                type="button"
                                className="smallButton"
                                style={{ padding: '0 8px', minHeight: 28, fontSize: 11 }}
                                disabled={busyAction === `pfu:${uid}:${device.device_id}`}
                                onClick={() => setDeviceForceUpdate(uid, device.device_id, false)}
                              >
                                {busyAction === `pfu:${uid}:${device.device_id}` ? '...' : 'Снять форс'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="smallButton"
                                style={{ background: '#4a1414', borderColor: '#7a2a2a', padding: '0 8px', minHeight: 28, fontSize: 11 }}
                                disabled={busyAction === `pfu:${uid}:${device.device_id}`}
                                onClick={() => setDeviceForceUpdate(uid, device.device_id, true)}
                              >
                                {busyAction === `pfu:${uid}:${device.device_id}` ? '...' : 'Форс-апд'}
                              </button>
                            )
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="grid accessControlGrid">

        {/* ── Mode Control ────────────────────────────────────────────────── */}
        <article className="panel">
          <div className="headingWithHint">
            <h3>Режим системы поручителей</h3>
            <InfoHint text="Режим определяет, как работает 3-уровневая система. Soft — мягкий вход. Hard — обязательное подтверждение." />
          </div>

          <div className="toggleList">
            <div className="toggleRow">
              <span>
                <strong>Система включена</strong>
                <small>Включает/выключает экраны поручителя в приложении</small>
              </span>
              <input
                type="checkbox"
                checked={state.flag.enabled}
                disabled={!canManage || Boolean(busyAction)}
                onChange={toggleFlag}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 10px', color: '#5d6f8b', fontSize: 13 }}>
              {getModeDescription(state.flag.mode)}
            </p>
          </div>

          {canManage && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['soft', 'medium'] as InviteAccessMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={state.flag.mode === m ? 'smallButton' : 'smallButton'}
                  style={state.flag.mode === m ? { borderColor: '#5ba3d8', background: '#24618e' } : {}}
                  disabled={Boolean(busyAction) || !state.flag.enabled}
                  onClick={() => changeMode(m)}
                >
                  {modeLabel(m)} {state.flag.mode === m ? '✓' : ''}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: '1px solid #eef3fb', paddingTop: 12 }}>
            <dl className="details compactDetails">
              <div><dt>Последнее обновление</dt><dd>{dateTime(state.flag.updatedAt)}</dd></div>
              <div><dt>Изменил</dt><dd style={{ fontSize: 12 }}>{state.flag.updatedBy || '—'}</dd></div>
              <div><dt>Активных поручителей</dt><dd>{state.sponsors.filter((s) => s.status === 'active').length}</dd></div>
            </dl>
            <button type="button" className="smallButton" style={{ marginTop: 10 }} onClick={onNavigateToInvites}>
              → Управление поручителями
            </button>
          </div>
        </article>

        {/* ── Grant Temp Access ──────────────────────────────────────────── */}
        <article className="panel">
          <div className="headingWithHint">
            <h3>Выдать временный доступ</h3>
            <InfoHint text="Выдаёт Trusted доступ пользователю напрямую по UID без прохождения системы поручителей." />
          </div>

          {canModerate ? (
            <>
              <div className="field">
                <span>UID пользователя</span>
                <input
                  type="text"
                  value={tempUid}
                  onChange={(e) => setTempUid(e.target.value)}
                  placeholder="uid123abc..."
                  disabled={Boolean(busyAction)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <span>Длительность (часы)</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={tempHours}
                    onChange={(e) => setTempHours(Number(e.target.value))}
                    disabled={Boolean(busyAction)}
                  />
                </div>
                <div className="field">
                  <span>Пресеты</span>
                  <select value={tempHours} onChange={(e) => setTempHours(Number(e.target.value))} disabled={Boolean(busyAction)}>
                    <option value={24}>24 часа (1 день)</option>
                    <option value={48}>48 часов (2 дня)</option>
                    <option value={72}>72 часа (3 дня)</option>
                    <option value={168}>168 ч (7 дней)</option>
                    <option value={336}>336 ч (2 недели)</option>
                    <option value={720}>720 ч (30 дней)</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <span>Причина</span>
                <input
                  type="text"
                  value={tempReason}
                  onChange={(e) => setTempReason(e.target.value)}
                  placeholder="Ручное одобрение модератором..."
                  disabled={Boolean(busyAction)}
                />
              </div>
              <button
                type="button"
                className="smallButton"
                style={{ marginTop: 4 }}
                disabled={Boolean(busyAction) || !tempUid.trim() || !tempReason.trim()}
                onClick={grantTemp}
              >
                {busyAction?.startsWith('temp:') ? 'Выдаём...' : `Выдать на ${tempHours}ч`}
              </button>
            </>
          ) : (
            <p>Требуется роль модератора или администратора.</p>
          )}
        </article>

        {/* ── Tier Explanation ───────────────────────────────────────────── */}
        <article className="panel">
          <div className="headingWithHint">
            <h3>Уровни доступа</h3>
            <InfoHint text="Что видит пользователь на каждом уровне в мобильном приложении." />
          </div>
          <dl className="details">
            <div>
              <dt><span className="pill">Public</span></dt>
              <dd>
                <small>Карта, новости, статус света, справка, о приложении. Без регистрации.</small>
              </dd>
            </div>
            <div>
              <dt><span className="pill warning">Registered</span></dt>
              <dd>
                <small>Свой профиль, подача заявки на поручителя, статус заявки. Чат, ОСББ, профили других — закрыты.</small>
              </dd>
            </div>
            <div>
              <dt><span className="pill good">Trusted</span></dt>
              <dd>
                <small>Полный доступ: чат, ОСББ, голосования, куплю-продам, потерял-нашёл, профили жителей, фото.</small>
              </dd>
            </div>
          </dl>
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: '#f0f7ff', border: '1px solid #bdd1f2' }}>
            <strong style={{ fontSize: 13 }}>Trusted статусы:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#607594', lineHeight: 1.7 }}>
              <li><code>approved</code> — одобрен через поручителя</li>
              <li><code>temporary_access</code> — временный ручной доступ</li>
              <li><code>whitelist_access</code> — вайтлист</li>
              <li><code>bypass</code> — принудительный флаг</li>
              <li>role: <code>admin</code> / <code>moderator</code> — всегда Trusted</li>
            </ul>
          </div>
        </article>

        {/* ── Requests Table ─────────────────────────────────────────────── */}
        <article className="panel" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="headingWithHint">
              <h3 style={{ margin: 0 }}>Заявки на доступ</h3>
              <InfoHint text="Заявки пользователей через систему поручителей. Последние 100 + пагинация." />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['needs_manual_review', 'pending', 'approved', 'denied', 'all'] as RequestFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="smallButton"
                  style={requestFilter === f ? { borderColor: '#5ba3d8', background: '#24618e' } : {}}
                  onClick={() => setRequestFilter(f)}
                >
                  {filterLabel(f)}
                  {f === 'needs_manual_review' && needsAttentionCount > 0 ? ` (${needsAttentionCount})` : ''}
                  {f === 'pending' ? ` (${stats.pendingSponsor})` : ''}
                  {f === 'approved' ? ` (${stats.trusted})` : ''}
                  {f === 'denied' ? ` (${stats.denied})` : ''}
                </button>
              ))}
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <p style={{ color: '#5d6f8b' }}>Нет заявок в этой категории.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Телефон</th>
                    <th>Поручитель</th>
                    <th>Статус</th>
                    <th>Риск</th>
                    <th>Дата</th>
                    <th>Решение</th>
                    {canModerate && <th>Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const tier = getTierFromStatus(req.status);
                    const isExpanded = expandedRequestId === req.id;
                    return (
                      <Fragment key={req.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}>
                          <td>
                            <code style={{ fontSize: 12 }}>{req.requesterPhoneMasked || '—'}</code>
                            <small>{req.requesterUid ? req.requesterUid.slice(0, 12) + '...' : ''}</small>
                          </td>
                          <td>
                            <code style={{ fontSize: 12 }}>{req.sponsorPhoneMasked || '—'}</code>
                            <small>{req.sponsorTrusted ? '✓ доверенный' : '○ не доверенный'}</small>
                          </td>
                          <td>
                            <span className={getTierClass(tier)}>{requestStatusLabel(req.status)}</span>
                          </td>
                          <td>
                            {req.riskScore > 0 ? (
                              <span className={req.riskLevel === 'high' ? 'pill danger' : req.riskLevel === 'medium' ? 'pill warning' : 'pill'}>
                                {req.riskLevel} ({req.riskScore})
                              </span>
                            ) : '—'}
                          </td>
                          <td><small>{dateTime(req.createdAt)}</small></td>
                          <td><small>{req.decisionReason || req.moderationReason || '—'}</small></td>
                          {canModerate && (
                            <td>
                              {(req.status === 'pending' || req.status === 'pending_sponsor' || req.status === 'needs_manual_review') && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    type="button"
                                    className="smallButton"
                                    style={{ background: '#144a2a', borderColor: '#2a7a4a', padding: '0 8px', minHeight: 30 }}
                                    disabled={busyAction === `moderate:${req.id}`}
                                    onClick={(e) => { e.stopPropagation(); moderate(req, 'approved'); }}
                                  >
                                    {busyAction === `moderate:${req.id}` ? '...' : '✓'}
                                  </button>
                                  <button
                                    type="button"
                                    className="smallButton"
                                    style={{ background: '#4a1414', borderColor: '#7a2a2a', padding: '0 8px', minHeight: 30 }}
                                    disabled={busyAction === `moderate:${req.id}`}
                                    onClick={(e) => { e.stopPropagation(); moderate(req, 'denied'); }}
                                  >
                                    ✗
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr key={`${req.id}-detail`}>
                            <td colSpan={canModerate ? 7 : 6} style={{ background: '#f8fbff', padding: '12px 16px' }}>
                              <dl className="details compactDetails" style={{ marginBottom: 12 }}>
                                <div><dt>UID</dt><dd><code style={{ fontSize: 11 }}>{req.requesterUid}</code></dd></div>
                                <div><dt>Режим при создании</dt><dd>{req.modeAtCreation}</dd></div>
                                <div><dt>Источник</dt><dd>{req.source || '—'}</dd></div>
                                <div><dt>Обновлено</dt><dd>{dateTime(req.updatedAt)}</dd></div>
                                {req.moderatedAt ? <div><dt>Модерировано</dt><dd>{dateTime(req.moderatedAt)} · {req.moderatedBy}</dd></div> : null}
                                {req.decisionSource ? <div><dt>Решение</dt><dd>{req.decisionSource} — {req.decisionReason}</dd></div> : null}
                              </dl>
                              {canModerate && (req.status === 'pending' || req.status === 'pending_sponsor' || req.status === 'needs_manual_review') && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                  <div className="field" style={{ margin: 0, flex: 1 }}>
                                    <span>Причина решения (необязательно)</span>
                                    <input
                                      type="text"
                                      value={moderationReason}
                                      onChange={(e) => setModerationReason(e.target.value)}
                                      placeholder="Укажите причину..."
                                      disabled={Boolean(busyAction)}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="smallButton"
                                    style={{ background: '#144a2a', borderColor: '#2a7a4a' }}
                                    disabled={busyAction === `moderate:${req.id}`}
                                    onClick={() => moderate(req, 'approved')}
                                  >
                                    {busyAction === `moderate:${req.id}` ? '...' : '✓ Одобрить'}
                                  </button>
                                  <button
                                    type="button"
                                    className="smallButton"
                                    style={{ background: '#4a1414', borderColor: '#7a2a2a' }}
                                    disabled={busyAction === `moderate:${req.id}`}
                                    onClick={() => moderate(req, 'denied')}
                                  >
                                    {busyAction === `moderate:${req.id}` ? '...' : '✗ Отклонить'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {state.hasMore && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="smallButton"
                disabled={busyAction === 'loadmore'}
                onClick={() => void loadMore()}
              >
                {busyAction === 'loadmore' ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </article>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── Монитор блокировок заявок ─────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <article className="panel" style={{ marginTop: 32 }}>
          <div className="headingWithHint" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3>Монитор блокировок заявок</h3>
            <button type="button" className="smallButton" disabled={denialLoading} onClick={() => void refreshDenials()}>
              {denialLoading ? 'Загрузка...' : 'Обновить'}
            </button>
          </div>

          {/* ── Aggregates ── */}
          {denialAggregates && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <span className="pill" style={{ background: '#1a1a2e', border: '1px solid #444' }}>
                Всего 24ч: <strong>{denialAggregates.total24h}</strong>
              </span>
              {denialAggregates.byCategory.permission_denied > 0 && (
                <span className="pill danger">permission_denied: {denialAggregates.byCategory.permission_denied}</span>
              )}
              {denialAggregates.byCategory.write_session_anonymous > 0 && (
                <span className="pill warning">anonymous: {denialAggregates.byCategory.write_session_anonymous}</span>
              )}
              {denialAggregates.byCategory.write_session_auth_mismatch > 0 && (
                <span className="pill warning">auth_mismatch: {denialAggregates.byCategory.write_session_auth_mismatch}</span>
              )}
              {denialAggregates.byCategory.yellow_list > 0 && (
                <span className="pill" style={{ background: '#4a3a00', border: '1px solid #8a7a00' }}>yellow_list: {denialAggregates.byCategory.yellow_list}</span>
              )}
              {denialAggregates.byCategory.daily_limit > 0 && (
                <span className="pill">daily_limit: {denialAggregates.byCategory.daily_limit}</span>
              )}
              {denialAggregates.byCategory.schema_mismatch > 0 && (
                <span className="pill danger">schema_mismatch: {denialAggregates.byCategory.schema_mismatch}</span>
              )}
            </div>
          )}

          {/* ── Risk Cards ── */}
          {denialRisks.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#2a1a1a', border: '1px solid #7a2a2a' }}>
              <strong style={{ fontSize: 13, color: '#ff6b6b' }}>Карточки рисков:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#ffa0a0', lineHeight: 1.7 }}>
                {denialRisks.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Filters ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={denialFilter} onChange={(e) => setDenialFilter(e.target.value as DenialCategory | 'all')} style={{ fontSize: 12 }}>
              <option value="all">Все категории</option>
              <option value="permission_denied">permission_denied</option>
              <option value="write_session_anonymous">write_session_anonymous</option>
              <option value="write_session_auth_mismatch">write_session_auth_mismatch</option>
              <option value="yellow_list">yellow_list</option>
              <option value="daily_limit">daily_limit</option>
              <option value="schema_mismatch">schema_mismatch</option>
              <option value="unknown">unknown</option>
            </select>
            <select value={denialScreenFilter} onChange={(e) => setDenialScreenFilter(e.target.value)} style={{ fontSize: 12 }}>
              <option value="">Все экраны</option>
              {uniqueScreens.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={denialPeriod} onChange={(e) => setDenialPeriod(e.target.value as '1h' | '24h' | '7d')} style={{ fontSize: 12 }}>
              <option value="1h">1 час</option>
              <option value="24h">24 часа</option>
              <option value="7d">7 дней</option>
            </select>
            <span style={{ fontSize: 11, color: '#888' }}>Показано: {filteredDenials.length}</span>
          </div>

          {/* ── Denials Table ── */}
          {filteredDenials.length > 0 ? (
            <div style={{ maxHeight: 460, overflowY: 'auto', marginTop: 10 }}>
              <table className="adminTable" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>UID</th>
                    <th>Экран</th>
                    <th>Path</th>
                    <th>Категория</th>
                    <th>Рекомендация</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDenials.slice(0, 100).map((d) => (
                    <tr key={d.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(d.at).toLocaleString()}</td>
                      <td title={d.authUid ? `auth: ${d.authUid}` : ''} style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.uid || '—'}{d.isAnonymous ? ' (anon)' : ''}
                      </td>
                      <td>{d.screen || '—'}</td>
                      <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.firebasePath || '—'}</td>
                      <td>
                        <span className={
                          d.category === 'permission_denied' || d.category === 'schema_mismatch' ? 'pill danger' :
                          d.category === 'write_session_anonymous' || d.category === 'write_session_auth_mismatch' ? 'pill warning' :
                          d.category === 'yellow_list' ? 'pill' :
                          'pill'
                        }>
                          {d.category}
                        </span>
                      </td>
                      <td style={{ fontSize: 10, color: '#aaa' }}>{d.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontSize: 12, marginTop: 10 }}>
              {denialLoading ? 'Загрузка...' : 'Нет отказов за выбранный период.'}
            </p>
          )}
        </article>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── Rules Consistency Audit ───────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <article className="panel" style={{ marginTop: 24 }}>
          <h3>Аудит Rules — publish-коллекции</h3>
          {rulesAudit.length > 0 ? (
            <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 10 }}>
              <table className="adminTable" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Коллекция</th>
                    <th>auth</th>
                    <th>!anon</th>
                    <th>userId</th>
                    <th>yellow</th>
                    <th>admin</th>
                    <th>status</th>
                    <th>Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesAudit.map((r) => {
                    const allOk = Object.values(r.checks).every(Boolean);
                    return (
                      <tr key={r.collection} style={allOk ? {} : { background: '#2a1a1a' }}>
                        <td><strong>{r.collection}</strong></td>
                        <td>{r.checks.authRequired ? '\u2705' : '\u274C'}</td>
                        <td>{r.checks.anonymousBlocked ? '\u2705' : '\u274C'}</td>
                        <td>{r.checks.userIdMatch ? '\u2705' : '\u274C'}</td>
                        <td>{r.checks.yellowListGuard ? '\u2705' : '\u274C'}</td>
                        <td>{r.checks.adminBypass ? '\u2705' : '\u274C'}</td>
                        <td>{r.checks.statusProtection ? '\u2705' : '\u274C'}</td>
                        <td style={{ fontSize: 10, color: '#ffa0a0', maxWidth: 200 }}>
                          {r.warnings.length > 0 ? r.warnings.join('; ') : <span style={{ color: '#5a5' }}>OK</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666', fontSize: 12 }}>Загрузка...</p>
          )}
          {rulesWarnings.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#2a2a1a', border: '1px solid #8a7a2a', fontSize: 12, color: '#ffd700' }}>
              {rulesWarnings.length} коллекций с предупреждениями — проверьте firebase.rules.json
            </div>
          )}
        </article>
      </div>
    </section>
  );
};
