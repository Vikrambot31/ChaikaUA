import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { InfoHint } from '../components/InfoHint';
import { AiAnalysisButton } from '../components/AiAnalysisButton';
import { EditRequestModal } from '../components/EditRequestModal';
import { RejectModal } from '../components/RejectModal';
import { analyzeText } from '../services/aiAnalysisService';
import { logDisagreement } from '../services/aiFeedbackService';
import { addToYellowList, subscribeYellowList, removeFromYellowList, getServerNow, type YellowListEntry } from '../services/yellowListService';
import type { AnalysisResult, AiVerdict } from '../types/ai';
import {
  deleteModerationItem,
  getModerationSummary,
  loadModerationItems,
  moderateItem,
  MODERATION_SECTIONS,
  type ModerationItem,
  type ModerationSectionKey,
  type ModerationStatus,
} from '../services/moderationService';

type ModerationPageProps = {
  user: User;
  initialStatusFilter?: StatusFilter;
  archiveMode?: boolean;
};

type StatusFilter = 'all' | ModerationStatus;
type AiVerdictFilter = 'all' | AiVerdict;
type PriorityFilter = 'all' | 'urgent' | 'standard' | 'low';
type MassAnalysisStrategy = 'oldest-first' | 'high-risk-first' | 'newest-first';

/** Target for the rejection modal — single item or batch */
type RejectTarget = { kind: 'single'; item: ModerationItem } | { kind: 'batch'; items: ModerationItem[] };

const HIGH_RISK_SECTIONS = new Set<ModerationSectionKey>(['buySell', 'jobs', 'lostFound']);
const AUTO_APPROVE_SECTIONS = new Set<ModerationSectionKey>(['requests', 'appSuggestions', 'contactsListings']);
const AUTO_APPROVE_MIN_TEXT_LENGTH = 20;

const sectionLabel = (key: ModerationSectionKey): string =>
  MODERATION_SECTIONS.find((section) => section.key === key)?.label || key;

export const ModerationPage = ({ user, initialStatusFilter = 'pending', archiveMode = false }: ModerationPageProps) => {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [sectionFilter, setSectionFilter] = useState<'all' | ModerationSectionKey>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewBroken, setPreviewBroken] = useState(false);

  // --- AI state ---
  const [aiResults, setAiResults] = useState<Map<string, AnalysisResult>>(new Map());
  const [aiVerdictFilter, setAiVerdictFilter] = useState<AiVerdictFilter>('all');
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(() => {
    try { return localStorage.getItem('aiAutoApprove') === 'true'; } catch { return false; }
  });
  const [massAnalyzing, setMassAnalyzing] = useState(false);
  const [massStrategy, setMassStrategy] = useState<MassAnalysisStrategy>('oldest-first');
  const [massProgress, setMassProgress] = useState({ current: 0, total: 0 });
  const massCancelRef = useRef(false);

  // --- Yellow List state ---
  const [yellowList, setYellowList] = useState<Map<string, YellowListEntry>>(new Map());
  const [showYellowListTab, setShowYellowListTab] = useState(true);

  useEffect(() => {
    const unsub = subscribeYellowList((entries) => {
      const map = new Map<string, YellowListEntry>();
      for (const e of entries) map.set(e.uid, e);
      setYellowList(map);
    });
    return unsub;
  }, []);

  // Множество userId у которых есть хотя бы одна отклонённая заявка
  const rejectedUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.status === 'rejected' && item.userId) set.add(item.userId);
    }
    return set;
  }, [items]);

  const isUserFlagged = (item: ModerationItem): boolean => {
    if (!item.userId) return false;
    // Пользователь помечен если: у него есть отклонённая заявка ИЛИ AI пометил ИЛИ он в жёлтом списке
    if (rejectedUserIds.has(item.userId)) return true;
    if (isUserInYellowList(item.userId)) return true;
    const aiResult = aiResults.get(item.path);
    return Boolean(aiResult && (aiResult.verdict === 'review' || aiResult.verdict === 'suspicious'));
  };

  const isUserInYellowList = (uid: string): boolean => {
    const entry = yellowList.get(uid);
    return Boolean(entry && entry.active && entry.bannedUntil > getServerNow());
  };

  const handleAddToYellowList = async (item: ModerationItem) => {
    const aiResult = aiResults.get(item.path);
    const confirmed = window.confirm(
      `Добавить "${item.userName || item.userId}" в жёлтый список?\n\nБан на отправку заявок на 14 дней.\nПользователь сохранит доступ к чтению ленты и другим экранам.`
    );
    if (!confirmed) return;
    try {
      await addToYellowList({
        uid: item.userId,
        displayName: item.userName || item.userId,
        reason: aiResult ? `AI: ${aiResult.verdict} (${Math.round(aiResult.confidence * 100)}%) — ${aiResult.explanation || ''}`.slice(0, 300) : 'Manual moderator decision',
        bannedBy: user.uid,
        itemPath: item.path,
        section: item.section,
      });
      setMessage(`${item.userName || item.userId} добавлен в жёлтый список на 14 дней.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка добавления в жёлтый список.');
    }
  };

  const handleRemoveFromYellowList = async (uid: string, name: string) => {
    const confirmed = window.confirm(`Снять бан с "${name}"?`);
    if (!confirmed) return;
    try {
      await removeFromYellowList(uid);
      setMessage(`Бан снят с ${name}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Ошибка снятия бана.');
    }
  };

  const toggleAutoApprove = (enabled: boolean) => {
    setAutoApproveEnabled(enabled);
    try { localStorage.setItem('aiAutoApprove', String(enabled)); } catch { /* noop */ }
  };

  const onAiResult = useCallback((itemPath: string, result: AnalysisResult) => {
    setAiResults((prev) => new Map(prev).set(itemPath, result));
  }, []);

  // Авто-одобрение: когда AI вернул approve с высоким confidence
  useEffect(() => {
    if (!autoApproveEnabled) return;
    for (const [path, result] of aiResults) {
      if (result.verdict !== 'approve') continue;
      if (result.confidence < 0.95 || result.confidence >= 1.0) continue;
      if (busyActions.has(`approved:${path}`)) continue;
      const item = items.find((i) => i.path === path);
      if (!item || item.status !== 'pending') continue;
      if (!AUTO_APPROVE_SECTIONS.has(item.section)) continue;
      const text = (item.subtitle || item.title || '').trim();
      if (text.length < AUTO_APPROVE_MIN_TEXT_LENGTH) continue;
      // Одобрить
      void runAction(item, 'approved');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResults, autoApproveEnabled, busyActions]);

  // AI stats
  const aiStats = useMemo(() => {
    let approve = 0, review = 0, suspicious = 0;
    for (const r of aiResults.values()) {
      if (r.verdict === 'approve') approve++;
      else if (r.verdict === 'review') review++;
      else if (r.verdict === 'suspicious') suspicious++;
    }
    return { approve, review, suspicious, total: aiResults.size };
  }, [aiResults]);

  // Масс-анализ
  const startMassAnalysis = async () => {
    const pending = items.filter((i) => i.status === 'pending' && !aiResults.has(i.path));
    if (!pending.length) { setMessage('Нет pending-записей для анализа.'); return; }

    // Сортировка по стратегии
    const sorted = [...pending];
    if (massStrategy === 'oldest-first') sorted.sort((a, b) => a.timestamp - b.timestamp);
    else if (massStrategy === 'newest-first') sorted.sort((a, b) => b.timestamp - a.timestamp);
    else if (massStrategy === 'high-risk-first') sorted.sort((a, b) => {
      const aRisk = HIGH_RISK_SECTIONS.has(a.section) ? 0 : 1;
      const bRisk = HIGH_RISK_SECTIONS.has(b.section) ? 0 : 1;
      return aRisk - bRisk || a.timestamp - b.timestamp;
    });

    const batch = sorted.slice(0, 20);
    setMassAnalyzing(true);
    setMassProgress({ current: 0, total: batch.length });
    massCancelRef.current = false;

    let failedCount = 0;
    for (let i = 0; i < batch.length; i++) {
      if (massCancelRef.current) break;
      try {
        const result = await analyzeText(batch[i]);
        onAiResult(batch[i].path, result);
      } catch {
        failedCount++;
      }
      setMassProgress({ current: i + 1, total: batch.length });
      if (i < batch.length - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setMassAnalyzing(false);
    if (massCancelRef.current) {
      setMessage('Масс-анализ отменён.');
    } else if (failedCount > 0) {
      setMessage(`Масс-анализ завершён: ${batch.length - failedCount} успешно, ${failedCount} ошибок.`);
    } else {
      setMessage('Масс-анализ завершён.');
    }
  };

  const cancelMassAnalysis = () => { massCancelRef.current = true; };

  // --- Edit modal state ---
  const [editModalItem, setEditModalItem] = useState<ModerationItem | null>(null);

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setItems(await loadModerationItems());
      setSelectedPaths(new Set());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить данные модерации.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const summary = useMemo(() => getModerationSummary(items), [items]);

  const filteredItems = useMemo(
    () => {
      const normalizedSearch = search.trim().toLowerCase();
      const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
      const toTs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
      return items
        .filter((item) =>
          (statusFilter === 'all' || item.status === statusFilter) &&
          (sectionFilter === 'all' || item.section === sectionFilter) &&
          (priorityFilter === 'all' || item.priority === priorityFilter) &&
          item.timestamp >= fromTs &&
          item.timestamp <= toTs,
        )
        .filter((item) => {
          if (aiVerdictFilter === 'all') return true;
          const aiResult = aiResults.get(item.path);
          return aiResult?.verdict === aiVerdictFilter;
        })
        .filter((item) => {
          if (!normalizedSearch) return true;
          return [
            item.title,
            item.subtitle,
            item.userName,
            item.userId,
            item.email,
            item.deviceId,
            item.id,
            item.path,
            sectionLabel(item.section),
          ].some((value) => value.toLowerCase().includes(normalizedSearch));
        })
        .sort((left, right) => sortOrder === 'newest' ? right.timestamp - left.timestamp : left.timestamp - right.timestamp);
    },
    [items, search, sectionFilter, sortOrder, statusFilter, aiVerdictFilter, aiResults, priorityFilter, dateFrom, dateTo],
  );

  const visibleItems = filteredItems.slice(0, visibleLimit);
  const selectedItems = visibleItems.filter((item) => selectedPaths.has(item.path));
  const approvableSelectedItems = selectedItems.filter((item) => item.status !== 'approved');
  const rejectableSelectedItems = selectedItems.filter((item) => item.status !== 'rejected');
  const deletableSelectedItems = selectedItems;

  const runAction = async (
    item: ModerationItem,
    action: 'approved' | 'rejected' | 'delete',
    options?: { skipDeleteConfirm?: boolean; reason?: string },
  ) => {
    if (action === 'delete' && !options?.skipDeleteConfirm) {
      const confirmed = window.confirm(`Удалить запись "${item.title}" из раздела ${sectionLabel(item.section)}?`);
      if (!confirmed) return;
    }

    const actionId = `${action}:${item.path}`;
    setBusyActions((prev) => new Set(prev).add(actionId));
    setMessage(null);
    try {
      if (action === 'delete') {
        await deleteModerationItem(item);
        setMessage('Запись удалена.');
      } else {
        await moderateItem(item, action, options?.reason);
        setMessage(action === 'approved' ? 'Запись одобрена.' : 'Запись отклонена.');

        // Disagreement logging: если AI дал вердикт и модератор пошёл против
        const aiResult = aiResults.get(item.path);
        if (aiResult) {
          const aiExpectedAction = aiResult.verdict === 'approve' ? 'approved' : 'rejected';
          if (aiExpectedAction !== action) {
            logDisagreement({
              itemPath: item.path,
              section: item.section,
              textTruncated: (item.subtitle || item.title || '').slice(0, 200),
              aiVerdict: aiResult.verdict,
              aiConfidence: aiResult.confidence,
              humanAction: action,
              moderatorUid: user.uid,
              timestamp: Date.now(),
            }).catch(() => { /* silent — не блокируем модерацию */ });
          }
        }
      }
      setItems((current) => current.filter((candidate) => candidate.path !== item.path));
      setSelectedPaths((current) => {
        const next = new Set(current);
        next.delete(item.path);
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить действие модерации.');
    } finally {
      setBusyActions((prev) => { const next = new Set(prev); next.delete(actionId); return next; });
    }
  };

  const toggleSelected = (item: ModerationItem) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  };

  const approveSelected = async () => {
    // Фиксируем список на момент нажатия — не допускаем каскадного одобрения
    const itemsToApprove = [...approvableSelectedItems];
    if (!itemsToApprove.length) {
      setMessage('Нет выбранных записей для одобрения.');
      return;
    }
    const confirmed = window.confirm(`Одобрить ${itemsToApprove.length} выбранных записей?`);
    if (!confirmed) return;
    for (const item of itemsToApprove) {
      await runAction(item, 'approved');
    }
  };

  const deleteSelected = async () => {
    // Фиксируем список на момент нажатия — не допускаем каскадного удаления
    const itemsToDelete = [...deletableSelectedItems];
    if (!itemsToDelete.length) {
      setMessage('Нет выбранных записей для удаления.');
      return;
    }
    const confirmed = window.confirm(`Удалить ${itemsToDelete.length} выбранных записей?`);
    if (!confirmed) return;
    for (const item of itemsToDelete) {
      await runAction(item, 'delete', { skipDeleteConfirm: true });
    }
  };

  const openPreview = (item: ModerationItem, startIndex = 0) => {
    const urls = item.mediaUrls.length > 0 ? item.mediaUrls : (item.mediaUrl ? [item.mediaUrl] : []);
    setPreviewUrls(urls);
    setPreviewIndex(startIndex);
    setPreviewTitle(item.title);
    setPreviewBroken(false);
  };

  const closePreview = () => {
    setPreviewUrls([]);
    setPreviewIndex(0);
    setPreviewTitle('');
    setPreviewBroken(false);
  };

  return (
    <section>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Сервисная модерация</p>
          <div className="headingWithHint">
            <h2>{archiveMode ? 'Архив' : 'Модерация'}</h2>
            <InfoHint text={archiveMode ? 'Просроченные записи остаются доступными администратору: их можно восстановить или удалить.' : 'Проверка контента и заявок: approve, reject, delete по текущим Firebase путям.'} />
          </div>
        </div>
        <div className="actionWithHint">
          <button type="button" className="smallButton" disabled={loading} onClick={() => void refresh()}>
            Обновить
          </button>
          <InfoHint text="Повторно загружает данные модерации из Firebase." />
        </div>
      </div>

      {message ? <p className="infoMessage">{message}</p> : null}

      <div className="statsGrid">
        <article className="metric metric-primary"><span>Всего</span><strong>{summary.total}</strong></article>
        <article className="metric metric-warning"><span>Ожидают</span><strong>{summary.pending}</strong></article>
        <article className="metric metric-success"><span>Одобрены</span><strong>{summary.approved}</strong></article>
        <article className="metric metric-dark"><span>Отклонены</span><strong>{summary.rejected}</strong></article>
        <article className="metric metric-info"><span>Просрочены</span><strong>{summary.expired}</strong></article>
      </div>

      {aiStats.total > 0 ? (
        <div className="statsGrid">
          <article className="metric metric-success"><span>AI: к одобрению</span><strong>{aiStats.approve}</strong></article>
          <article className="metric metric-warning"><span>AI: проверить</span><strong>{aiStats.review}</strong></article>
          <article className="metric metric-danger"><span>AI: подозрительно</span><strong>{aiStats.suspicious}</strong></article>
          <article className="metric metric-info"><span>AI: проанализировано</span><strong>{aiStats.total}</strong></article>
        </div>
      ) : null}

      <div className="filtersRow">
        <label className="toggleRow">
          <span>
            <strong>AI авто-одобрение</strong>
            <small>Авто-одобрять при confidence &ge; 95% (только безопасные разделы)</small>
          </span>
          <input type="checkbox" checked={autoApproveEnabled} onChange={(e) => toggleAutoApprove(e.target.checked)} />
        </label>
      </div>

      <div className="filtersRow">
        <label className="field">
          <span>Статус</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setSelectedPaths(new Set()); }}>
            <option value="all">Все</option>
            <option value="pending">Ожидают</option>
            <option value="approved">Одобрены</option>
            <option value="rejected">Отклонены</option>
            <option value="expired">Просрочены</option>
          </select>
        </label>
        <label className="field">
          <span>Раздел</span>
          <select value={sectionFilter} onChange={(event) => { setSectionFilter(event.target.value as 'all' | ModerationSectionKey); setSelectedPaths(new Set()); }}>
            <option value="all">Все разделы</option>
            {MODERATION_SECTIONS.map((section) => (
              <option key={section.key} value={section.key}>{section.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Поиск</span>
          <input
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setVisibleLimit(100);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                setSearch(value);
              }, 300);
            }}
            placeholder="Название, имя, userId, email, deviceId"
          />
        </label>
        <label className="field">
          <span>Приоритет</span>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}>
            <option value="all">Все</option>
            <option value="urgent">Срочные</option>
            <option value="standard">Стандартные</option>
            <option value="low">Низкие</option>
          </select>
        </label>
        <label className="field">
          <span>AI вердикт</span>
          <select value={aiVerdictFilter} onChange={(event) => setAiVerdictFilter(event.target.value as AiVerdictFilter)}>
            <option value="all">Все</option>
            <option value="approve">AI: одобрить</option>
            <option value="review">AI: проверить</option>
            <option value="suspicious">AI: подозрительно</option>
          </select>
        </label>
        <label className="field">
          <span>Дата от</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Дата до</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label className="field">
          <span>Сортировка</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}>
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </select>
        </label>
      </div>

      <article className="panel tablePanel">
        <div className="tableHeader">
          <div className="headingWithHint">
            <h3>{loading ? 'Загрузка модерации...' : `Записи (${filteredItems.length})`}</h3>
            <InfoHint text="Показываются элементы по фильтру. Кнопки справа меняют статус или удаляют запись." />
          </div>
          <span>{Math.min(visibleItems.length, filteredItems.length)} показано</span>
        </div>
        <div className="moderationBatchBar">
          <span>Выбрано: {selectedPaths.size}</span>
          <button
            type="button"
            className="smallButton"
            disabled={!filteredItems.length || busyActions.size > 0}
            onClick={() => setSelectedPaths(new Set(visibleItems.map((item) => item.path)))}
          >
            Выбрать все
          </button>
          <button
            type="button"
            className="smallButton"
            disabled={selectedPaths.size === 0 || busyActions.size > 0}
            onClick={() => setSelectedPaths(new Set())}
          >
            Снять выбор
          </button>
          <button
            type="button"
            className="smallButton"
            disabled={!approvableSelectedItems.length || busyActions.size > 0}
            onClick={() => void approveSelected()}
          >
            Одобрить все
          </button>
          <button
            type="button"
            className="smallButton dangerButton"
            disabled={!rejectableSelectedItems.length || busyActions.size > 0}
            onClick={() => setRejectTarget({ kind: 'batch', items: [...rejectableSelectedItems] })}
          >
            Отклонить выбранные
          </button>
          <button
            type="button"
            className="smallButton dangerButton"
            disabled={!deletableSelectedItems.length || busyActions.size > 0}
            onClick={() => void deleteSelected()}
          >
            Удалить все
          </button>
          <span className="batchSeparator" />
          <select
            value={massStrategy}
            onChange={(e) => setMassStrategy(e.target.value as MassAnalysisStrategy)}
            disabled={massAnalyzing}
          >
            <option value="oldest-first">Сначала старые</option>
            <option value="high-risk-first">Сначала рискованные</option>
            <option value="newest-first">Сначала новые</option>
          </select>
          <button
            type="button"
            className="smallButton"
            disabled={massAnalyzing || busyActions.size > 0}
            onClick={() => void startMassAnalysis()}
          >
            {massAnalyzing ? `AI анализ (${massProgress.current}/${massProgress.total})` : 'AI анализ все pending'}
          </button>
          {massAnalyzing ? (
            <button type="button" className="smallButton dangerButton" onClick={cancelMassAnalysis}>
              Отмена
            </button>
          ) : null}
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Выбор</th>
                <th>Запись</th>
                <th>Раздел</th>
                <th>Пользователь</th>
                <th>Время</th>
                <th>Статус</th>
                <th>Медиа</th>
                <th>AI</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.path}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(item.path)}
                      onChange={() => toggleSelected(item)}
                      disabled={busyActions.size > 0}
                      aria-label={`Выбрать ${item.title}`}
                    />
                  </td>
                  <td>
                    <strong>
                      {item.title}
                      {item.editedAt ? <small className="editedBadge">ред.</small> : null}
                    </strong>
                    <small>{item.subtitle || item.id}</small>
                  </td>
                  <td>{sectionLabel(item.section)}</td>
                  <td className={isUserFlagged(item) ? 'ylFlaggedCell' : ''}>
                    {isUserFlagged(item) ? (
                      <div className="ylFlaggedUser">
                        <span className="ylWarningIcon">&#9888;</span>
                        <strong className="ylFlaggedName">{item.userName || '-'}</strong>
                        {isUserInYellowList(item.userId) ? (
                          <span className="ylBadge" title={`В жёлтом списке до ${new Date(yellowList.get(item.userId)!.bannedUntil).toLocaleDateString()}`}>&#128683; ЗАБАНЕН</span>
                        ) : (
                          <span className="ylSuspectBadge">ПОДОЗРЕНИЕ</span>
                        )}
                      </div>
                    ) : (
                      <strong>{item.userName || '-'}</strong>
                    )}
                    <small>{item.email || item.userId || '-'}</small>
                    {item.deviceId ? <small>{item.deviceId}</small> : null}
                  </td>
                  <td>{item.timestampLabel}</td>
                  <td><span className={`pill ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'danger' : ''}`}>{item.status}</span></td>
                  <td>
                    {item.mediaUrls.length > 0 ? (
                      <div className="mediaGallery">
                        {item.mediaUrls.map((url, idx) => (
                          <button key={idx} type="button" className="mediaPreview" onClick={() => openPreview(item, idx)}>
                            <img src={url} alt="" />
                          </button>
                        ))}
                      </div>
                    ) : item.photoUrl ? (
                      <button type="button" className="smallButton" onClick={() => openPreview(item)}>
                        Открыть URL
                      </button>
                    ) : item.photoUrls.length > 0 ? (
                      <span title={`Медиа есть (${item.photoUrls.length} шт.), но не загрузилось из Storage`}>&#9888; Медиа недоступно</span>
                    ) : '-'}
                  </td>
                  <td>
                    <AiAnalysisButton item={item} onResult={onAiResult} />
                  </td>
                  <td className="moderationActions">
                    {item.status !== 'rejected' && item.status !== 'expired' ? (
                      <button
                        type="button"
                        className="smallButton"
                        disabled={busyActions.size > 0}
                        onClick={() => setEditModalItem(item)}
                        title="Редактировать"
                      >
                        Ред.
                      </button>
                    ) : null}
                    {item.status !== 'approved' ? (
                      <button
                        type="button"
                        className="smallButton"
                        disabled={busyActions.size > 0}
                        onClick={() => void runAction(item, 'approved')}
                      >
                        {item.status === 'expired' ? 'Восстановить' : 'Одобрить'}
                      </button>
                    ) : null}
                    {item.status !== 'rejected' ? (
                      <button
                        type="button"
                        className="smallButton dangerButton"
                        disabled={busyActions.size > 0}
                        onClick={() => setRejectTarget({ kind: 'single', item })}
                      >
                        Отклонить
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="smallButton dangerButton"
                      disabled={busyActions.size > 0}
                      onClick={() => void runAction(item, 'delete')}
                    >
                      Удалить
                    </button>
                    {item.userId && isUserFlagged(item) ? (
                      isUserInYellowList(item.userId) ? (
                        <button type="button" className="ylBtnBanned" disabled title={`В жёлтом списке до ${new Date(yellowList.get(item.userId)!.bannedUntil).toLocaleDateString()}`}>
                          &#128683; ЗАБАНЕН
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ylBtnBan"
                          disabled={busyActions.size > 0}
                          onClick={() => void handleAddToYellowList(item)}
                          title="Добавить в жёлтый список — бан на заявки 14 дней"
                        >
                          &#9888; ЗАБАНИТЬ
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && !filteredItems.length ? (
                <tr><td colSpan={9}>Записей по фильтру не найдено.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {visibleItems.length < filteredItems.length ? (
          <button
            type="button"
            className="smallButton loadMoreButton"
            onClick={() => setVisibleLimit((current) => current + 100)}
          >
            Показать еще
          </button>
        ) : null}
      </article>
      {previewUrls.length > 0 ? (
        <div className="previewOverlay" onClick={closePreview}>
          <div className="previewDialog" onClick={(event) => event.stopPropagation()}>
            <div className="previewHeader">
              <strong>{previewTitle || 'Медиа'}{previewUrls.length > 1 ? ` (${previewIndex + 1} / ${previewUrls.length})` : ''}</strong>
              <button type="button" className="smallButton dangerButton" onClick={closePreview}>Закрыть</button>
            </div>
            {!previewBroken ? (
              <>
                <img
                  className="previewMedia"
                  src={previewUrls[previewIndex]}
                  alt=""
                  onError={() => setPreviewBroken(true)}
                />
                {previewUrls.length > 1 && (
                  <div className="previewNav">
                    <button type="button" className="smallButton" disabled={previewIndex === 0} onClick={() => { setPreviewBroken(false); setPreviewIndex((i) => i - 1); }}>&#8592;</button>
                    <button type="button" className="smallButton" disabled={previewIndex === previewUrls.length - 1} onClick={() => { setPreviewBroken(false); setPreviewIndex((i) => i + 1); }}>&#8594;</button>
                  </div>
                )}
                <a className="tableLink" href={previewUrls[previewIndex]} target="_blank" rel="noreferrer">Открыть в новой вкладке</a>
              </>
            ) : (
              <div>
                <p className="formError">Не удалось загрузить медиа в предпросмотре.</p>
                {previewUrls.length > 1 && (
                  <div className="previewNav">
                    <button type="button" className="smallButton" disabled={previewIndex === 0} onClick={() => { setPreviewBroken(false); setPreviewIndex((i) => i - 1); }}>&#8592;</button>
                    <button type="button" className="smallButton" disabled={previewIndex === previewUrls.length - 1} onClick={() => { setPreviewBroken(false); setPreviewIndex((i) => i + 1); }}>&#8594;</button>
                  </div>
                )}
                <a className="tableLink" href={previewUrls[previewIndex]} target="_blank" rel="noreferrer">Попробовать открыть напрямую</a>
                <p><small>{previewUrls[previewIndex]}</small></p>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {/* --- Yellow List Table — всегда видна если есть забаненные --- */}
      {yellowList.size > 0 ? (
        <article className="ylSection">
          <div className="ylSectionHeader">
            <span className="ylSectionTitle">&#128683; Жёлтый список ({yellowList.size})</span>
            <button
              type="button"
              className="smallButton"
              onClick={() => setShowYellowListTab(!showYellowListTab)}
            >
              {showYellowListTab ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
          {showYellowListTab ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Причина</th>
                    <th>Забанен</th>
                    <th>Истекает</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {[...yellowList.values()].map((entry) => {
                    const isActive = entry.active && entry.bannedUntil > getServerNow();
                    return (
                      <tr key={entry.uid} className={isActive ? 'ylBannedRow' : ''}>
                        <td><strong className={isActive ? 'ylFlaggedName' : ''}>{entry.displayName}</strong><br /><small>{entry.uid}</small></td>
                        <td><small>{entry.reason}</small></td>
                        <td>{new Date(entry.bannedAt).toLocaleDateString()}</td>
                        <td>{new Date(entry.bannedUntil).toLocaleDateString()}</td>
                        <td><span className={`pill ${isActive ? 'danger' : 'good'}`}>{isActive ? 'Активен' : 'Истёк'}</span></td>
                        <td>
                          {isActive ? (
                            <button type="button" className="smallButton ylUnbanBtn" onClick={() => void handleRemoveFromYellowList(entry.uid, entry.displayName)}>
                              Снять бан
                            </button>
                          ) : (
                            <button type="button" className="smallButton dangerButton" onClick={() => void removeFromYellowList(entry.uid)}>
                              Удалить запись
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
      ) : null}

      {editModalItem ? (
        <EditRequestModal
          item={editModalItem}
          aiResult={aiResults.get(editModalItem.path) || null}
          onClose={() => setEditModalItem(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((i) => i.path === updated.path ? updated : i));
            setEditModalItem(null);
            setMessage('Запись отредактирована.');
          }}
          onSavedAndApproved={(updated) => {
            setItems((prev) => prev.filter((i) => i.path !== updated.path));
            setEditModalItem(null);
            setMessage('Запись отредактирована и одобрена.');
          }}
        />
      ) : null}

      {rejectTarget ? (
        <RejectModal
          count={rejectTarget.kind === 'single' ? 1 : rejectTarget.items.length}
          onCancel={() => setRejectTarget(null)}
          onConfirm={async (reason) => {
            const target = rejectTarget;
            setRejectTarget(null);
            if (target.kind === 'single') {
              await runAction(target.item, 'rejected', { reason });
            } else {
              for (const item of target.items) {
                await runAction(item, 'rejected', { reason });
              }
            }
          }}
        />
      ) : null}
    </section>
  );
};
