import { useEffect, useMemo, useRef, useState } from 'react';
import type { SecurityRole } from '../services/authService';
import { InfoHint } from '../components/InfoHint';
import {
  createTrustedSponsor,
  grantTemporaryAccess,
  loadInviteAccessState,
  loadMoreRequests,
  moderateInviteRequest,
  setInviteAccessEnabled,
  setInviteAccessMode,
  updateTrustedSponsorStatus,
  type InviteAccessMode,
  type InviteAccessState,
  type InviteRequest,
  type InviteRequestStatus,
  type TrustedSponsor,
} from '../services/inviteAccessService';

type InviteAccessPageProps = {
  role: SecurityRole;
};

type RequestFilter = 'pending' | 'temporary_access' | 'needs_manual_review' | 'approved' | 'denied';
type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month';

const emptyState: InviteAccessState = {
  flag: {
    enabled: false,
    mode: 'disabled',
    updatedAt: 0,
    updatedBy: '',
    version: 0,
  },
  sponsors: [],
  requests: [],
  hasMore: false,
};

const getDateFilterBounds = (filter: DateFilter): { start: number; end: number } => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (filter === 'today') return { start: startOfToday, end: Infinity };
  if (filter === 'yesterday') return { start: startOfToday - 86400000, end: startOfToday };
  if (filter === 'week') return { start: startOfToday - 7 * 86400000, end: Infinity };
  if (filter === 'month') return { start: startOfToday - 30 * 86400000, end: Infinity };
  return { start: 0, end: Infinity };
};

const dateFilterLabel = (filter: DateFilter): string => {
  if (filter === 'today') return 'сегодня';
  if (filter === 'yesterday') return 'вчера';
  if (filter === 'week') return '7 дней';
  if (filter === 'month') return '30 дней';
  return 'все';
};

const PHONE_RE = /^\+380\d{9}$/;

const dateTime = (value: number): string => (value ? new Date(value).toLocaleString() : '-');

const statusClass = (enabled: boolean): string => (enabled ? 'status active' : 'status warning');

const requestTone = (status: InviteRequestStatus): string => {
  if (status === 'approved') return 'pill good';
  if (status === 'denied') return 'pill danger';
  if (status === 'temporary_access' || status === 'needs_manual_review' || status === 'pending_sponsor') return 'pill warning';
  return 'pill';
};

const sponsorTone = (sponsor: TrustedSponsor): string =>
  sponsor.status === 'active' ? 'pill good' : 'pill danger';

const requestStatusLabel = (status: InviteRequestStatus): string => {
  if (status === 'approved') return 'одобрена';
  if (status === 'denied') return 'отклонена';
  if (status === 'cancelled') return 'отменена';
  if (status === 'needs_manual_review') return 'ручная проверка';
  if (status === 'pending_sponsor') return 'ждёт поручителя';
  if (status === 'auto_denied') return 'авто-отклонена';
  if (status === 'temporary_access') return 'временный доступ';
  return 'ожидает';
};

const sponsorStatusLabel = (status: TrustedSponsor['status']): string =>
  status === 'active' ? 'активен' : 'отключен';

const requestFilterLabel = (status: RequestFilter): string => {
  if (status === 'approved') return 'одобренные';
  if (status === 'denied') return 'отклоненные';
  if (status === 'temporary_access') return 'временный доступ';
  if (status === 'needs_manual_review') return 'ручная проверка';
  return 'ожидающие';
};

const isOpenRequestStatus = (status: InviteRequestStatus): boolean =>
  status === 'pending' || status === 'pending_sponsor' || status === 'needs_manual_review';

const matchesRequestFilter = (item: InviteRequest, filter: RequestFilter): boolean => {
  if (filter === 'pending') return isOpenRequestStatus(item.status);
  return item.status === filter;
};

const modeLabel = (mode: InviteAccessMode): string => {
  if (mode === 'soft') return 'SOFT';
  if (mode === 'medium') return 'MEDIUM';
  return 'DISABLED';
};

const formatInviteError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.toLowerCase().includes('invite access is not configured')) {
    return 'Не удалось включить: на backend не настроен секрет хеширования поручителей (INVITE_ACCESS_HASH_SECRET / invite_access.hash_secret). Статус не изменился.';
  }
  if (message.toLowerCase().includes('admin access required') || message.toLowerCase().includes('permission-denied')) {
    return 'Не удалось выполнить действие: нужен доступ администратора. Статус не изменился.';
  }
  return message || 'Действие с приглашениями не выполнено. Статус не изменился.';
};

export const InviteAccessPage = ({ role }: InviteAccessPageProps) => {
  const [state, setState] = useState<InviteAccessState>(emptyState);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('pending');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [sponsorNote, setSponsorNote] = useState('');
  const [moderationReason, setModerationReason] = useState('');
  const [tempAccessHours, setTempAccessHours] = useState(24);
  const [tempAccessReason, setTempAccessReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canManageSponsors = role === 'admin';
  const canModerateRequests = role === 'admin' || role === 'moderator';

  const autoRefreshRef = useRef({ loading, busyAction, refresh: async () => {} });
  autoRefreshRef.current.loading = loading;
  autoRefreshRef.current.busyAction = busyAction;

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firebase не ответил за 10 секунд — проверьте соединение.')), 10_000),
      );
      const freshState = await Promise.race([loadInviteAccessState(), timeout]);
      setState(freshState);
      setDataLoaded(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Firebase недоступен';
      const isPermDenied = msg.toLowerCase().includes('permission_denied') || msg.toLowerCase().includes('permission denied');
      if (isPermDenied) {
        setMessage('Нет доступа к данным (permission_denied). Проверьте Firebase Rules или войдите под правильным аккаунтом.');
      } else {
        setMessage(`Не удалось загрузить данные: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  autoRefreshRef.current.refresh = refresh;

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!autoRefreshRef.current.loading && !autoRefreshRef.current.busyAction) {
        void autoRefreshRef.current.refresh();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => ({
    sponsorsActive: state.sponsors.filter((item) => item.status === 'active').length,
    pending: state.requests.filter((item) => isOpenRequestStatus(item.status)).length,
    manualReview: state.requests.filter((item) => item.status === 'needs_manual_review').length,
    temporaryAccess: state.requests.filter((item) => item.status === 'temporary_access').length,
    approved: state.requests.filter((item) => item.status === 'approved').length,
    denied: state.requests.filter((item) => item.status === 'denied').length,
  }), [state.requests, state.sponsors]);

  const filteredRequests = useMemo(() => {
    const { start, end } = getDateFilterBounds(dateFilter);
    return state.requests.filter(
      (item) => matchesRequestFilter(item, requestFilter) && item.createdAt >= start && item.createdAt < end,
    );
  }, [requestFilter, dateFilter, state.requests]);

  const runAction = async (actionId: string, action: () => Promise<void>, success: string) => {
    setBusyAction(actionId);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (error) {
      const formattedError = formatInviteError(error);
      setMessage(formattedError);
      window.alert(formattedError);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleFeatureFlag = () => {
    const nextEnabled = !state.flag.enabled;
    const confirmed = nextEnabled
      ? window.confirm('Включить прием заявок на доступ по приглашениям?')
      : window.confirm('Выключить прием заявок на доступ? Существующие заявки останутся видимыми.');
    if (!confirmed) return;

    void runAction(
      'flag',
      () => setInviteAccessEnabled(nextEnabled),
      nextEnabled ? 'Доступ по приглашениям включен.' : 'Доступ по приглашениям выключен.',
    );
  };

  const changeMode = (mode: InviteAccessMode) => {
    if (mode === state.flag.mode) {
      setMessage(dataLoaded
        ? `Режим уже установлен: ${modeLabel(mode)}.`
        : `Данные не загружены — Firebase офлайн. Обновите страницу после восстановления соединения.`);
      return;
    }
    const confirmed = window.confirm(`Переключить режим на ${modeLabel(mode)}? Изменения применятся сразу.`);
    if (!confirmed) return;

    void runAction(
      `mode:${mode}`,
      () => setInviteAccessMode(mode),
      `Режим переключен на ${modeLabel(mode)}.`,
    );
  };

  const addSponsor = () => {
    const phone = sponsorPhone.trim();
    if (!PHONE_RE.test(phone)) {
      setMessage('Телефон поручителя должен быть в формате +380XXXXXXXXX.');
      return;
    }

    void runAction(
      'add_sponsor',
      () => createTrustedSponsor(phone, sponsorNote),
      'Доверенный поручитель сохранен.',
    );
    setSponsorPhone('');
    setSponsorNote('');
  };

  const toggleSponsor = (sponsor: TrustedSponsor) => {
    const nextStatus = sponsor.status === 'active' ? 'disabled' : 'active';
    const confirmed = window.confirm(`${nextStatus === 'active' ? 'Включить' : 'Отключить'} поручителя ${sponsor.phoneMasked}?`);
    if (!confirmed) return;

    void runAction(
      `sponsor:${sponsor.id}`,
      () => updateTrustedSponsorStatus(sponsor.id, nextStatus, sponsor.note),
      nextStatus === 'active' ? 'Поручитель включен.' : 'Поручитель отключен.',
    );
  };

  const moderate = (request: InviteRequest, status: 'approved' | 'denied') => {
    const reason = moderationReason.trim();
    if (status === 'denied' && (reason.length < 10 || reason.length > 200)) {
      setMessage('Для отклонения укажите причину от 10 до 200 символов. Пользователь увидит её вместо пустого экрана.');
      return;
    }
    const confirmed = window.confirm(`${status === 'approved' ? 'Одобрить' : 'Отклонить'} заявку ${request.id}?`);
    if (!confirmed) return;

    void runAction(
      `request:${request.id}:${status}`,
      () => moderateInviteRequest(request.id, status, reason),
      status === 'approved' ? 'Заявка одобрена.' : 'Заявка отклонена.',
    );
  };

  const loadMore = async () => {
    if (!state.hasMore || loading || Boolean(busyAction)) return;
    setLoading(true);
    try {
      const oldest = state.requests.reduce((min, r) => Math.min(min, r.createdAt), Infinity);
      const { requests: more, hasMore: nextHasMore } = await loadMoreRequests(oldest);
      setState((prev) => ({ ...prev, requests: [...prev.requests, ...more], hasMore: nextHasMore }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить ещё заявки.');
    } finally {
      setLoading(false);
    }
  };

  const grantTempAccess = (request: InviteRequest) => {
    if (!request.requesterUid) {
      setMessage('Нельзя выдать временный доступ: у заявки нет requesterUid.');
      return;
    }
    if (request.status === 'approved') {
      setMessage('Этот пользователь уже имеет постоянный доступ. Временный доступ не нужен.');
      return;
    }

    const hours = Number(tempAccessHours);
    const reason = tempAccessReason.trim();
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      setMessage('Срок временного доступа должен быть от 1 до 168 часов.');
      return;
    }
    if (!reason) {
      setMessage('Укажите причину временного доступа.');
      return;
    }

    const confirmed = window.confirm(`Выдать временный доступ на ${hours} ч для ${request.requesterPhoneMasked || request.requesterUid}?`);
    if (!confirmed) return;

    void runAction(
      `request:${request.id}:temporary_access`,
      () => grantTemporaryAccess(request.requesterUid, hours, reason, request.id),
      'Временный доступ выдан без одобрения и без изменения trust_tree.',
    );
  };

  return (
    <section>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Доступ по приглашениям</p>
          <div className="headingWithHint">
            <h2>Доступ по приглашениям</h2>
            <InfoHint text="Отдельный админ-раздел для доверенных поручителей и модерации заявок на доступ." />
          </div>
        </div>
        <div className="actionWithHint">
          <button type="button" className="smallButton" disabled={loading} onClick={() => void refresh()}>
            Обновить
          </button>
          <InfoHint text="Перезагружает флаг функции, доверенных поручителей и заявки на доступ." />
        </div>
      </div>

      {message ? <p className="infoMessage">{message}</p> : null}
      {!loading && state.rulesNotConfigured && (
        <div style={{
          background: '#1a1a2e', color: '#a0b0d0', padding: '12px 16px', borderRadius: 6,
          marginBottom: 16, fontSize: 13, border: '1px solid #2a3a5a',
        }}>
          <strong style={{ color: '#c0d0f0' }}>Firebase Rules не настроены для этого раздела.</strong>
          {' '}Добавьте правила чтения для путей:{' '}
          <code style={{ background: '#0d1117', padding: '1px 5px', borderRadius: 3 }}>feature_flags/invite_access</code>,{' '}
          <code style={{ background: '#0d1117', padding: '1px 5px', borderRadius: 3 }}>trusted_sponsors</code>,{' '}
          <code style={{ background: '#0d1117', padding: '1px 5px', borderRadius: 3 }}>invite_requests</code>.
        </div>
      )}

      <div className="statsGrid">
        <article className="metric metric-primary"><span>Активные поручители</span><strong>{counts.sponsorsActive}</strong></article>
        <article className="metric metric-warning"><span>Ожидают</span><strong>{counts.pending}</strong></article>
        <article className="metric metric-warning"><span>Временный доступ</span><strong>{counts.temporaryAccess}</strong></article>
        <article className="metric metric-warning"><span>Ручная проверка</span><strong>{counts.manualReview}</strong></article>
        <article className="metric metric-success"><span>Одобрены</span><strong>{counts.approved}</strong></article>
        <article className="metric metric-danger"><span>Отклонены</span><strong>{counts.denied}</strong></article>
      </div>

      <div className="grid securityGrid inviteAccessGrid">
        <article className="panel">
          <div className="headingWithHint">
            <h3>Флаг функции</h3>
            <InfoHint text="Управляет тем, принимает ли submitInviteRequest новые заявки. По умолчанию выключен." />
          </div>
          <dl className="details compactDetails">
            <div><dt>Статус</dt><dd><span className={statusClass(state.flag.enabled)}>{state.flag.enabled ? 'ВКЛЮЧЕНО' : 'ВЫКЛЮЧЕНО'}</span></dd></div>
            <div><dt>Режим</dt><dd><strong>{modeLabel(state.flag.mode)}</strong></dd></div>
            <div><dt>Текущее состояние</dt><dd>{state.flag.enabled ? 'Новые заявки принимаются' : 'Новые заявки не принимаются'}</dd></div>
            <div><dt>Обновлено</dt><dd>{dateTime(state.flag.updatedAt)}</dd></div>
            <div><dt>Кем обновлено</dt><dd>{state.flag.updatedBy || '-'}</dd></div>
            <div><dt>Версия</dt><dd>{state.flag.version || '-'}</dd></div>
          </dl>
          <div className="actionWithHint">
            <button
              type="button"
              className={state.flag.enabled ? 'smallButton dangerButton inviteFlagButton' : 'smallButton inviteFlagButton'}
              disabled={!canManageSponsors || Boolean(busyAction)}
              onClick={toggleFeatureFlag}
            >
              {busyAction === 'flag'
                ? 'Изменяем статус...'
                : state.flag.enabled ? 'Выключить доступ по приглашениям' : 'Включить доступ по приглашениям'}
            </button>
            <InfoHint text="Включает или выключает приём новых заявок. При включении — выбранный режим активируется немедленно. При выключении — существующие заявки остаются, новые не принимаются. Только администратор." />
          </div>
          {!canManageSponsors ? <p className="mutedText">Только администратор может менять флаг системы приглашений.</p> : null}
          <div className="segmented" style={{ marginTop: 12 }}>
            {(['disabled', 'soft', 'medium'] as InviteAccessMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={state.flag.mode === mode ? 'active' : ''}
                disabled={!canManageSponsors || Boolean(busyAction)}
                onClick={() => changeMode(mode)}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
          <InfoHint
            content={(
              <div className="modeHint">
                <p className="modeHintTitle">Как работают режимы</p>
                <div className="modeHintList">
                  <div className="modeHintItem">
                    <span className="modeBadge mode-soft">Права доступа</span>
                    <p>
                      <strong>admin:</strong> может включать/выключать систему, переключать режимы, управлять поручителями и модерировать заявки.<br />
                      <strong>moderator:</strong> может только модерировать заявки (approve/deny/temporary access), без изменения флага, режима и списка поручителей.
                    </p>
                  </div>
                </div>
                <div className="modeHintList">
                  <div className="modeHintItem">
                    <span className="modeBadge mode-disabled">DISABLED</span>
                    <p>
                      Система отключена: новые заявки не принимаются.
                      Текущие заявки и история остаются доступными для просмотра и ручной обработки.
                    </p>
                  </div>
                  <div className="modeHintItem">
                    <span className="modeBadge mode-soft">SOFT</span>
                    <p>
                      Мягкий запуск: допускается гостевой поток, авто-одобрение включено.
                      Подходит для старта функции и низкого риска.
                    </p>
                  </div>
                  <div className="modeHintItem">
                    <span className="modeBadge mode-medium">MEDIUM</span>
                    <p>
                      Обязательная проверка заявки, безопасные случаи одобряются автоматически.
                      Для неоднозначных кейсов заявка уходит в ручную модерацию.
                    </p>
                  </div>
                </div>
                <p className="modeHintNote">Подсказка: рекомендуемый режим MEDIUM. Строгий блокирующий режим удалён, чтобы пользователи не попадали на пустой экран.</p>
              </div>
            )}
          />
        </article>

        <article className="panel">
          <div className="headingWithHint">
            <h3>Добавить доверенного поручителя</h3>
            <InfoHint text="Телефон должен быть строго в формате +380XXXXXXXXX. Backend хранит хешированный ключ и маскированное значение для отображения." />
          </div>
          <label className="field">
            <span>Телефон поручителя</span>
            <input
              value={sponsorPhone}
              onChange={(event) => setSponsorPhone(event.target.value)}
              placeholder="+380XXXXXXXXX"
            />
          </label>
          <label className="field">
            <span>Заметка</span>
            <input
              value={sponsorNote}
              onChange={(event) => setSponsorNote(event.target.value)}
              placeholder="Необязательная заметка администратора"
            />
          </label>
          <div className="actionWithHint">
            <button
              type="button"
              className="smallButton"
              disabled={!canManageSponsors || Boolean(busyAction)}
              onClick={addSponsor}
            >
              Добавить поручителя
            </button>
            <InfoHint text="Создаёт запись в trusted_sponsors с хешированным ключом телефона. Если поручитель уже существует — перезаписывает и переводит в статус active. Требуется формат +380XXXXXXXXX." />
          </div>
          {!canManageSponsors ? <p className="mutedText">Только администратор может добавлять или обновлять поручителей.</p> : null}
        </article>
      </div>

      <article className="panel tablePanel">
        <div className="tableHeader">
          <div className="headingWithHint">
            <h3>Доверенные поручители ({state.sponsors.length})</h3>
            <InfoHint text="Поручители читаются из trusted_sponsors. Включение и отключение выполняется через adminUpdateTrustedSponsor." />
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Телефон</th>
                <th>Статус</th>
                <th>Одобрено</th>
                <th>Последняя заявка</th>
                <th>Заметка</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {state.sponsors.map((sponsor) => (
                <tr key={sponsor.id}>
                  <td>
                    <strong>{sponsor.phoneMasked || sponsor.id}</strong>
                    <small>{sponsor.id}</small>
                  </td>
                  <td><span className={sponsorTone(sponsor)}>{sponsorStatusLabel(sponsor.status)}</span></td>
                  <td>{sponsor.approvedInviteCount}</td>
                  <td>{dateTime(sponsor.lastInviteAt)}</td>
                  <td>{sponsor.note || '-'}</td>
                  <td className="actionsCell">
                    <button
                      type="button"
                      className={sponsor.status === 'active' ? 'smallButton dangerButton' : 'smallButton'}
                      disabled={!canManageSponsors || Boolean(busyAction)}
                      onClick={() => toggleSponsor(sponsor)}
                    >
                      {sponsor.status === 'active' ? 'Отключить' : 'Включить'}
                    </button>
                    <InfoHint text="Включает или отключает поручителя через adminUpdateTrustedSponsor. Отключённый поручитель не блокирует существующие одобрения, но новые заявки с ним получат повышенный риск-скор." />
                  </td>
                </tr>
              ))}
              {!state.sponsors.length ? (
                <tr><td colSpan={6}>Доверенных поручителей пока нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel tablePanel">
        <div className="tableHeader inviteRequestsHeader">
          <div className="headingWithHint">
            <h3>Заявки на доступ ({filteredRequests.length})</h3>
            <InfoHint text="Одобрение и отклонение вызывают adminModerateInviteRequest. Эта страница не меняет механизм доступа в мобильном приложении." />
          </div>
          <div className="segmented">
            {(['pending', 'temporary_access', 'needs_manual_review', 'approved', 'denied'] as RequestFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                className={requestFilter === status ? 'active' : ''}
                onClick={() => setRequestFilter(status)}
              >
                {requestFilterLabel(status)}
              </button>
            ))}
          </div>
          <div className="segmented">
            {(['all', 'today', 'yesterday', 'week', 'month'] as DateFilter[]).map((df) => (
              <button
                key={df}
                type="button"
                className={dateFilter === df ? 'active' : ''}
                onClick={() => setDateFilter(df)}
              >
                {dateFilterLabel(df)}
              </button>
            ))}
          </div>
        </div>
        <label className="field inviteReasonField">
          <span>Причина модерации</span>
          <input
            value={moderationReason}
            onChange={(event) => setModerationReason(event.target.value)}
            placeholder="Для отклонения обязательно: 10-200 символов"
          />
        </label>
        <div className="grid twoColumnGrid">
          <label className="field">
            <span>Временный доступ, часов</span>
            <input
              type="number"
              min={1}
              max={168}
              value={tempAccessHours}
              onChange={(event) => setTempAccessHours(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Причина временного доступа</span>
            <input
              value={tempAccessReason}
              onChange={(event) => setTempAccessReason(event.target.value)}
              placeholder="Обязательно: проверка, тест, ожидание ручной проверки"
            />
          </label>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Заявитель</th>
                <th>Поручитель</th>
                <th>Статус</th>
                <th>Risk</th>
                <th>Создано</th>
                <th>Проверено</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.requesterPhoneMasked || request.requesterUid || '-'}</strong>
                    <small>{request.requesterUid || request.requesterPhoneHash}</small>
                  </td>
                  <td>
                    <span>{request.sponsorPhoneMasked || request.sponsorPhoneHash || '-'}</span>
                    <small>{request.sponsorTrusted ? 'доверенный поручитель' : 'не доверенный'}</small>
                  </td>
                  <td><span className={requestTone(request.status)}>{requestStatusLabel(request.status)}</span></td>
                  <td>
                    <strong>{request.riskScore || 0}</strong>
                    <small>{request.riskLevel || request.decisionSource || '-'}</small>
                  </td>
                  <td>{dateTime(request.createdAt)}</td>
                  <td>
                    <span>{dateTime(request.moderatedAt)}</span>
                    {request.temp_expires_at ? <small>истекает: {dateTime(request.temp_expires_at)}</small> : null}
                    {request.moderatedBy ? <small>{request.moderatedBy}</small> : null}
                  </td>
                  <td className="moderationActions">
                    {request.status !== 'approved' ? (
                      <>
                        <button
                          type="button"
                          className="smallButton"
                          disabled={!canModerateRequests || Boolean(busyAction)}
                          onClick={() => moderate(request, 'approved')}
                        >
                          Одобрить
                        </button>
                        <InfoHint text="Вызывает adminModerateInviteRequest(approved). Обновляет user_access → approved и создаёт узел в trust_tree. Действие необратимо без ручного вмешательства." />
                      </>
                    ) : null}
                    {request.status !== 'denied' ? (
                      <>
                        <button
                          type="button"
                          className="smallButton dangerButton"
                          disabled={!canModerateRequests || Boolean(busyAction)}
                          onClick={() => moderate(request, 'denied')}
                        >
                          Отклонить
                        </button>
                        <InfoHint text="Вызывает adminModerateInviteRequest(denied). Увеличивает denied_count пользователя. При достижении лимита (max_denied_before_block) — пользователь блокируется автоматически." />
                      </>
                    ) : null}
                    <>
                      <button
                        type="button"
                        className="smallButton"
                        disabled={!canManageSponsors || Boolean(busyAction)}
                        onClick={() => grantTempAccess(request)}
                      >
                        Временно
                      </button>
                      <InfoHint text="Вызывает grantTemporaryAccess. Даёт временный доступ без одобрения и без записи в trust_tree. Срок от 1 до 168 часов. Причина обязательна. Только администратор." />
                    </>
                  </td>
                </tr>
              ))}
              {!filteredRequests.length ? (
                <tr><td colSpan={7}>Нет заявок со статусом «{requestFilterLabel(requestFilter)}».</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {state.hasMore ? (
          <div className="actionWithHint" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="smallButton"
              disabled={loading || Boolean(busyAction)}
              onClick={() => void loadMore()}
            >
              {loading ? 'Загрузка...' : 'Загрузить ещё'}
            </button>
            <InfoHint text="Загружает следующие 100 заявок по дате создания (старше уже загруженных). Фильтр по статусу и дате применяется к уже загруженным данным." />
          </div>
        ) : null}
      </article>
    </section>
  );
};
