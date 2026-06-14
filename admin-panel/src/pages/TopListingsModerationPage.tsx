import { useEffect, useMemo, useState } from 'react';
import {
  loadTopListings,
  approveTopListing,
  rejectTopListing,
  deleteTopListing,
  resolveTopListingPhotoUrl,
  type TopListingCollection,
  type TopListingRecord,
  type TopListingStatus,
} from '../services/topListingsAdminService';

const COLLECTIONS: Array<{ key: TopListingCollection; label: string }> = [
  { key: 'food_top_listings', label: 'Їжа на Чайці' },
  { key: 'beauty_top_listings', label: 'Салони Краси' },
  { key: 'children_top_listings', label: 'Все для Дітей' },
];

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const BATCH_CONCURRENCY = 5;

const fmtDate = (s: string) => {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const Lightbox = ({ url, onClose }: { url: string; onClose: () => void }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'zoom-out',
    }}
  >
    <img
      src={url}
      alt=""
      onClick={(e) => e.stopPropagation()}
      style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 8px 40px #000a' }}
    />
    <button
      type="button"
      onClick={onClose}
      style={{
        position: 'fixed', top: 20, right: 24,
        background: 'none', border: 'none', color: '#fff',
        fontSize: 32, cursor: 'pointer', lineHeight: 1,
      }}
    >×</button>
  </div>
);

const PhotoThumb = ({
  record,
  onOpenLightbox,
}: {
  record: TopListingRecord;
  onOpenLightbox: (url: string) => void;
}) => {
  const [src, setSrc] = useState<string>(record.photoUri);

  useEffect(() => {
    let cancelled = false;
    if (!/^https?:\/\//i.test(record.photoUri) || record.photoStoragePath) {
      resolveTopListingPhotoUrl(record).then((url) => {
        if (!cancelled && url) setSrc(url);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [record]);

  if (!src) return <span style={{ color: '#5d6f8b', fontSize: 12 }}>немає фото</span>;

  return (
    <button
      type="button"
      onClick={() => onOpenLightbox(src)}
      style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
      title="Відкрити фото"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
      />
    </button>
  );
};

type CollectionState = {
  items: TopListingRecord[];
  loading: boolean;
  error: string;
};

export const TopListingsModerationPage = () => {
  const [activeCollection, setActiveCollection] = useState<TopListingCollection>('food_top_listings');
  const [collectionData, setCollectionData] = useState<Record<TopListingCollection, CollectionState>>({
    food_top_listings: { items: [], loading: false, error: '' },
    beauty_top_listings: { items: [], loading: false, error: '' },
    children_top_listings: { items: [], loading: false, error: '' },
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [actionError, setActionError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TopListingRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadCollection = async (collection: TopListingCollection) => {
    setCollectionData((prev) => ({
      ...prev,
      [collection]: { ...prev[collection], loading: true, error: '' },
    }));
    try {
      const items = await loadTopListings(collection);
      setCollectionData((prev) => ({
        ...prev,
        [collection]: { items, loading: false, error: '' },
      }));
    } catch (err) {
      setCollectionData((prev) => ({
        ...prev,
        [collection]: {
          ...prev[collection],
          loading: false,
          error: err instanceof Error ? err.message : 'Помилка завантаження',
        },
      }));
    }
  };

  // Load all collections on mount
  useEffect(() => {
    void loadCollection('food_top_listings');
    void loadCollection('beauty_top_listings');
    void loadCollection('children_top_listings');
  }, []);

  const currentState = collectionData[activeCollection];
  const allItems = currentState.items;

  const counts: Record<StatusFilter, number> = {
    all: allItems.length,
    pending: allItems.filter((i) => i.moderationStatus === 'pending').length,
    approved: allItems.filter((i) => i.moderationStatus === 'approved').length,
    rejected: allItems.filter((i) => i.moderationStatus === 'rejected').length,
  };

  const shown =
    statusFilter === 'all'
      ? allItems
      : allItems.filter((i) => i.moderationStatus === statusFilter);

  const shownIds = shown.map((i) => i.id);
  const selectedInShown = selectedIds.filter((id) => shownIds.includes(id));
  const allShownSelected = shown.length > 0 && selectedInShown.length === shown.length;
  const idMap = useMemo(
    () => new Map(allItems.map((i) => [i.id, i])),
    [allItems],
  );

  const totalPending =
    collectionData.food_top_listings.items.filter((i) => i.moderationStatus === 'pending').length +
    collectionData.beauty_top_listings.items.filter((i) => i.moderationStatus === 'pending').length +
    collectionData.children_top_listings.items.filter((i) => i.moderationStatus === 'pending').length;

  const patchStatus = (id: string, status: TopListingStatus) => {
    setCollectionData((prev) => ({
      ...prev,
      [activeCollection]: {
        ...prev[activeCollection],
        items: prev[activeCollection].items.map((i) =>
          i.id === id ? { ...i, moderationStatus: status } : i,
        ),
      },
    }));
  };

  const removeItem = (id: string) => {
    setCollectionData((prev) => ({
      ...prev,
      [activeCollection]: {
        ...prev[activeCollection],
        items: prev[activeCollection].items.filter((i) => i.id !== id),
      },
    }));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  };

  const handleApprove = async (record: TopListingRecord) => {
    setBusyId(record.id);
    setActionError('');
    try {
      await approveTopListing(record);
      patchStatus(record.id, 'approved');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося схвалити запис.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (record: TopListingRecord, reason: string) => {
    setBusyId(record.id);
    setActionError('');
    try {
      await rejectTopListing(record, reason);
      patchStatus(record.id, 'rejected');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося відхилити запис.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (record: TopListingRecord) => {
    setBusyId(record.id);
    setActionError('');
    try {
      await deleteTopListing(record);
      removeItem(record.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося видалити запис.');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveAll = async () => {
    if (shown.length === 0) return;
    const confirmed = window.confirm(`Схвалити всі ${shown.length} записів у поточному фільтрі?`);
    if (!confirmed) return;
    setBulkBusy(true);
    setBulkProgress({ current: 0, total: shown.length });
    setActionError('');
    try {
      const ids = shown.map((i) => i.id);
      for (let i = 0; i < ids.length; i += BATCH_CONCURRENCY) {
        const chunk = ids.slice(i, i + BATCH_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (id) => {
            const record = idMap.get(id);
            if (record) {
              await approveTopListing(record);
              patchStatus(id, 'approved');
            }
          }),
        );
        setBulkProgress({ current: Math.min(i + BATCH_CONCURRENCY, ids.length), total: ids.length });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Помилка масового схвалення.');
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedInShown.length === 0) return;
    setBulkBusy(true);
    setBulkProgress({ current: 0, total: selectedInShown.length });
    setActionError('');
    try {
      for (let i = 0; i < selectedInShown.length; i += BATCH_CONCURRENCY) {
        const chunk = selectedInShown.slice(i, i + BATCH_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (id) => {
            const record = idMap.get(id);
            if (record) {
              await approveTopListing(record);
              patchStatus(id, 'approved');
            }
          }),
        );
        setBulkProgress({
          current: Math.min(i + BATCH_CONCURRENCY, selectedInShown.length),
          total: selectedInShown.length,
        });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Помилка масового схвалення.');
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedInShown.length === 0) return;
    const confirmed = window.confirm(`Видалити ${selectedInShown.length} вибраних записів?`);
    if (!confirmed) return;
    setBulkBusy(true);
    setBulkProgress({ current: 0, total: selectedInShown.length });
    setActionError('');
    try {
      for (let i = 0; i < selectedInShown.length; i += BATCH_CONCURRENCY) {
        const chunk = selectedInShown.slice(i, i + BATCH_CONCURRENCY);
        await Promise.allSettled(
          chunk.map(async (id) => {
            const record = idMap.get(id);
            if (record) {
              await deleteTopListing(record);
              removeItem(id);
            }
          }),
        );
        setBulkProgress({
          current: Math.min(i + BATCH_CONCURRENCY, selectedInShown.length),
          total: selectedInShown.length,
        });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Помилка видалення.');
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  };

  const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
    { key: 'pending', label: `Очікують (${counts.pending})` },
    { key: 'approved', label: `Схвалено (${counts.approved})` },
    { key: 'rejected', label: `Відхилено (${counts.rejected})` },
    { key: 'all', label: `Всі (${counts.all})` },
  ];

  return (
    <section>
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}

      {rejectTarget ? (
        <div
          onClick={() => { setRejectTarget(null); setRejectReason(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#1a2435', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }}
          >
            <h3 style={{ color: '#c8d6e8', marginTop: 0, marginBottom: 16, fontSize: 16 }}>
              Причина відхилення
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {['Не відповідає темі', 'Дублікат', 'Неправильна інформація', 'Спам / реклама', 'Неприйнятний контент'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRejectReason(preset)}
                  style={{
                    textAlign: 'left', padding: '7px 12px', borderRadius: 8,
                    border: rejectReason === preset ? '1px solid #4b7f9e' : '1px solid #253040',
                    background: rejectReason === preset ? '#253f54' : '#141b24',
                    color: '#c8d6e8', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Або введіть власну причину..."
              rows={2}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #253040', background: '#141b24',
                color: '#c8d6e8', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid #253040',
                  background: '#141b24', color: '#c8d6e8', cursor: 'pointer', fontSize: 13,
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleReject(rejectTarget, rejectReason);
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#7a1e1e', color: '#ffb3b3', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pageHeader">
        <div>
          <p className="eyebrow">Модерація</p>
          <h2>Місця від користувачів</h2>
          <p style={{ color: '#5d6f8b', fontSize: 13, marginTop: 4 }}>
            Пропозиції «додати місце» з екранів Їжа на Чайці, Салони Краси, Все для Дітей.
            Нові записи отримують статус <strong style={{ color: '#c8d6e8' }}>pending</strong> і
            невидимі публіці до схвалення.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {totalPending > 0 ? (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#F57F17', borderRadius: 10, padding: '8px 16px',
              }}
            >
              <span style={{ fontSize: 20 }}>!</span>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {totalPending} очікують схвалення
              </span>
            </div>
          ) : null}
          <button
            type="button"
            disabled={currentState.loading}
            onClick={() => void loadCollection(activeCollection)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #3a4b59',
              background: '#1a2435', color: '#c8d6e8', fontWeight: 700, fontSize: 13,
              cursor: currentState.loading ? 'not-allowed' : 'pointer',
              opacity: currentState.loading ? 0.6 : 1,
            }}
          >
            {currentState.loading ? 'Завантаження...' : 'Оновити'}
          </button>
        </div>
      </div>

      {/* Collection tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {COLLECTIONS.map((col) => {
          const pending = collectionData[col.key].items.filter(
            (i) => i.moderationStatus === 'pending',
          ).length;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => {
                setActiveCollection(col.key);
                setSelectedIds([]);
                setStatusFilter('all');
              }}
              style={{
                padding: '8px 18px', borderRadius: 8, fontWeight: 800, fontSize: 14,
                border: activeCollection === col.key ? '1px solid #4b7f9e' : '1px solid #253040',
                background: activeCollection === col.key ? '#4b7f9e' : '#141b24',
                color: activeCollection === col.key ? '#fff' : '#c8d6e8',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {col.label}
              {pending > 0 ? (
                <span style={{
                  marginLeft: 8, background: '#e53935', color: '#fff',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800,
                }}>
                  {pending}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {currentState.error ? <p className="formError">{currentState.error}</p> : null}
      {actionError ? <p className="formError">{actionError}</p> : null}

      {bulkProgress ? (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#1a2435', borderRadius: 10, border: '1px solid #253040' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#c8d6e8' }}>
            <span>Обробка...</span>
            <span>{bulkProgress.current} / {bulkProgress.total}</span>
          </div>
          <div style={{ height: 6, background: '#253040', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
              background: '#4b7f9e', borderRadius: 3, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      ) : null}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setStatusFilter(tab.key); setSelectedIds([]); }}
            style={{
              padding: '7px 16px', borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: statusFilter === tab.key ? '1px solid #4b7f9e' : '1px solid #253040',
              background: statusFilter === tab.key ? '#253f54' : '#141b24',
              color: statusFilter === tab.key ? '#a8d4f0' : '#c8d6e8',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk action toolbar */}
      {shown.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleApproveAll()}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: '1px solid #1e5e3b', background: '#1e7d42', color: '#fff',
              cursor: bulkBusy ? 'not-allowed' : 'pointer', opacity: bulkBusy ? 0.6 : 1,
            }}
          >
            {bulkBusy ? 'Обробка...' : `✓ Схвалити всі (${shown.length})`}
          </button>
          <button
            type="button"
            onClick={() => {
              if (allShownSelected) {
                setSelectedIds((prev) => prev.filter((id) => !shownIds.includes(id)));
              } else {
                setSelectedIds((prev) => [...new Set([...prev, ...shownIds])]);
              }
            }}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: '1px solid #253040', background: '#141b24', color: '#c8d6e8', cursor: 'pointer',
            }}
          >
            {allShownSelected ? 'Зняти вибір' : 'Вибрати всі'}
          </button>
          <button
            type="button"
            disabled={bulkBusy || selectedInShown.length === 0}
            onClick={() => void handleApproveSelected()}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: '1px solid #1e5e3b', background: '#173b25', color: '#b3ffd1',
              cursor: bulkBusy || selectedInShown.length === 0 ? 'not-allowed' : 'pointer',
              opacity: bulkBusy || selectedInShown.length === 0 ? 0.6 : 1,
            }}
          >
            {bulkBusy ? 'Обробка...' : `Схвалити вибрані (${selectedInShown.length})`}
          </button>
          <button
            type="button"
            disabled={bulkBusy || selectedInShown.length === 0}
            onClick={() => void handleDeleteSelected()}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: '1px solid #7a1e1e', background: '#3b1717', color: '#ffb3b3',
              cursor: bulkBusy || selectedInShown.length === 0 ? 'not-allowed' : 'pointer',
              opacity: bulkBusy || selectedInShown.length === 0 ? 0.6 : 1,
            }}
          >
            {bulkBusy ? 'Обробка...' : `Видалити вибрані (${selectedInShown.length})`}
          </button>
          {selectedInShown.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedIds((prev) => prev.filter((id) => !shownIds.includes(id)))}
              style={{
                padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                border: '1px solid #3a4b59', background: 'none', color: '#c8d6e8', cursor: 'pointer',
              }}
            >
              Очистити вибір
            </button>
          ) : null}
        </div>
      ) : null}

      {currentState.loading && allItems.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>Завантаження...</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>
          {statusFilter === 'pending' ? 'Немає записів на схвалення' : 'Немає записів у цій категорії'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>Вибір</th>
                <th style={{ width: 80 }}>Фото</th>
                <th>Назва / Опис</th>
                <th style={{ minWidth: 120 }}>Статус</th>
                <th style={{ minWidth: 130 }}>Подано</th>
                <th style={{ minWidth: 130 }}>userId</th>
                <th style={{ minWidth: 240 }}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((record) => {
                const r = idMap.get(record.id) ?? record;
                const rowBusy = bulkBusy || busyId === r.id;
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        disabled={rowBusy}
                      />
                    </td>
                    <td>
                      <PhotoThumb record={r} onOpenLightbox={setLightboxUrl} />
                    </td>
                    <td>
                      <strong style={{ display: 'block' }}>{r.title || '—'}</strong>
                      {r.description ? (
                        <small style={{ color: '#8ca3b8', whiteSpace: 'pre-wrap' }}>
                          {r.description.length > 120 ? r.description.slice(0, 120) + '...' : r.description}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`pill ${r.moderationStatus === 'approved' ? 'good' : r.moderationStatus === 'rejected' ? 'danger' : ''}`}
                      >
                        {r.moderationStatus === 'approved'
                          ? 'Схвалено'
                          : r.moderationStatus === 'rejected'
                          ? 'Відхилено'
                          : 'Очікує'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12 }}>{fmtDate(r.submittedForModerationAt || r.createdAt)}</span>
                    </td>
                    <td>
                      <small style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.userId || '—'}</small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.moderationStatus !== 'approved' ? (
                          <button
                            type="button"
                            className="smallButton"
                            disabled={rowBusy}
                            onClick={() => void handleApprove(r)}
                          >
                            Схвалити
                          </button>
                        ) : null}
                        {r.moderationStatus !== 'rejected' ? (
                          <button
                            type="button"
                            className="smallButton dangerButton"
                            disabled={rowBusy}
                            onClick={() => { setRejectTarget(r); setRejectReason(''); }}
                          >
                            Відхилити
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="smallButton dangerButton"
                          disabled={rowBusy}
                          onClick={() => {
                            const confirmed = window.confirm(`Видалити запис "${r.title || r.id}"?`);
                            if (confirmed) void handleDelete(r);
                          }}
                        >
                          Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
