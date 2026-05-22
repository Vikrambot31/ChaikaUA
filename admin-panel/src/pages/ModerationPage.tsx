import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { InfoHint } from '../components/InfoHint';
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

const sectionLabel = (key: ModerationSectionKey): string =>
  MODERATION_SECTIONS.find((section) => section.key === key)?.label || key;

export const ModerationPage = ({ user, initialStatusFilter = 'pending', archiveMode = false }: ModerationPageProps) => {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [sectionFilter, setSectionFilter] = useState<'all' | ModerationSectionKey>('all');
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [visibleLimit, setVisibleLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewBroken, setPreviewBroken] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setItems(await loadModerationItems());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить данные модерации.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => getModerationSummary(items), [items]);

  const filteredItems = useMemo(
    () => {
      const normalizedSearch = search.trim().toLowerCase();
      return items
        .filter((item) =>
          (statusFilter === 'all' || item.status === statusFilter) &&
          (sectionFilter === 'all' || item.section === sectionFilter),
        )
        .filter((item) => {
          if (!normalizedSearch) return true;
          return [
            item.title,
            item.subtitle,
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
    [items, search, sectionFilter, sortOrder, statusFilter],
  );

  const visibleItems = filteredItems.slice(0, visibleLimit);

  const runAction = async (item: ModerationItem, action: 'approved' | 'rejected' | 'delete') => {
    if (action === 'delete') {
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
        await moderateItem(item, action);
        setMessage(action === 'approved' ? 'Запись одобрена.' : 'Запись отклонена.');
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить действие модерации.');
    } finally {
      setBusyActions((prev) => { const next = new Set(prev); next.delete(actionId); return next; });
    }
  };

  const openPreview = (item: ModerationItem) => {
    setPreviewTitle(item.title);
    setPreviewUrl(item.mediaUrl || item.photoUrl || null);
    setPreviewBroken(false);
  };

  const closePreview = () => {
    setPreviewUrl(null);
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

      <div className="filtersRow">
        <label className="field">
          <span>Статус</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Все</option>
            <option value="pending">Ожидают</option>
            <option value="approved">Одобрены</option>
            <option value="rejected">Отклонены</option>
            <option value="expired">Просрочены</option>
          </select>
        </label>
        <label className="field">
          <span>Раздел</span>
          <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as 'all' | ModerationSectionKey)}>
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
            placeholder="Название, userId, email, deviceId"
          />
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
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Запись</th>
                <th>Раздел</th>
                <th>Пользователь</th>
                <th>Время</th>
                <th>Статус</th>
                <th>Медиа</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.path}>
                  <td>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle || item.id}</small>
                  </td>
                  <td>{sectionLabel(item.section)}</td>
                  <td>
                    <span>{item.email || item.userId || '-'}</span>
                    {item.deviceId ? <small>{item.deviceId}</small> : null}
                  </td>
                  <td>{item.timestampLabel}</td>
                  <td><span className={`pill ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'danger' : ''}`}>{item.status}</span></td>
                  <td>
                    {item.mediaUrl ? (
                      <button type="button" className="mediaPreview" onClick={() => openPreview(item)}>
                        <img src={item.mediaUrl} alt="" />
                        <span>Открыть</span>
                      </button>
                    ) : item.photoUrl ? (
                      <button type="button" className="smallButton" onClick={() => openPreview(item)}>
                        Открыть URL
                      </button>
                    ) : '-'}
                  </td>
                  <td className="moderationActions">
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
                        onClick={() => void runAction(item, 'rejected')}
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
                  </td>
                </tr>
              ))}
              {!loading && !filteredItems.length ? (
                <tr><td colSpan={7}>Записей по фильтру не найдено.</td></tr>
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
      {previewUrl ? (
        <div className="previewOverlay" onClick={closePreview}>
          <div className="previewDialog" onClick={(event) => event.stopPropagation()}>
            <div className="previewHeader">
              <strong>{previewTitle || 'Медиа'}</strong>
              <button type="button" className="smallButton dangerButton" onClick={closePreview}>Закрыть</button>
            </div>
            {!previewBroken ? (
              <>
                <img
                  className="previewMedia"
                  src={previewUrl}
                  alt=""
                  onError={() => setPreviewBroken(true)}
                />
                <a className="tableLink" href={previewUrl} target="_blank" rel="noreferrer">Открыть в новой вкладке</a>
              </>
            ) : (
              <div>
                <p className="formError">Не удалось загрузить медиа в предпросмотре.</p>
                <a className="tableLink" href={previewUrl} target="_blank" rel="noreferrer">Попробовать открыть напрямую</a>
                <p><small>{previewUrl}</small></p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};
