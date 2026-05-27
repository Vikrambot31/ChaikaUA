import { useEffect, useMemo, useState } from 'react';
import { usePhotoApproval } from '../hooks/usePhotoApproval';
import {
  approvePhoto,
  rejectPhoto,
  deletePhoto,
  deletePhotos,
  resolvePhotoUrl,
  type PhotoRecord,
} from '../services/photoApprovalService';

const PhotoThumb = ({
  photo,
  onOpenLightbox,
}: {
  photo: PhotoRecord;
  onOpenLightbox: (url: string) => void;
}) => {
  const [src, setSrc] = useState<string>(photo.imageUri);

  useEffect(() => {
    let cancelled = false;
    if (!/^https?:\/\//i.test(photo.imageUri) || photo.storagePath) {
      resolvePhotoUrl(photo).then((url) => {
        if (!cancelled) setSrc(url);
      }).catch(() => {/* keep original */});
    }
    return () => { cancelled = true; };
  }, [photo]);

  return (
    <button
      type="button"
      onClick={() => onOpenLightbox(src)}
      style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
      title="Открыть фото"
    >
      <img
        src={src}
        alt=""
        style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
      />
    </button>
  );
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
    >
      ×
    </button>
  </div>
);

const dateTime = (ts: number) =>
  ts
    ? new Date(ts).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const getSourceLabel = (photo: PhotoRecord): string =>
  photo.sourceScreenLabel || photo.sourceScreen || 'Источник неизвестен';

const getStatusLabel = (status: PhotoRecord['status']): string => {
  if (status === 'approved') return 'Одобрено';
  if (status === 'rejected') return 'Отклонено';
  return 'Ожидает';
};

export const PhotoApprovalPage = () => {
  const { photos: allPhotos, loading, error, refresh } = usePhotoApproval();
  const [localPhotos, setLocalPhotos] = useState<PhotoRecord[] | null>(null);
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const photos = localPhotos ?? allPhotos;
  const [uidFilter, setUidFilter] = useState('');

  const handleRefresh = async () => {
    setLocalPhotos(null);
    setSelectedIds([]);
    setActionError('');
    await refresh();
  };

  const counts = {
    all: photos.length,
    pending: photos.filter((p) => p.status === 'pending').length,
    approved: photos.filter((p) => p.status === 'approved').length,
    rejected: photos.filter((p) => p.status === 'rejected').length,
  };

  const shownByStatus = filter === 'all' ? photos : photos.filter((p) => p.status === filter);
  const shown = uidFilter.trim()
    ? shownByStatus.filter((p) => (p.uploadedBy ?? '').toLowerCase().includes(uidFilter.trim().toLowerCase()))
    : shownByStatus;
  const shownIds = shown.map((p) => p.id);
  const selectedInShown = selectedIds.filter((id) => shownIds.includes(id));
  const allShownSelected = shown.length > 0 && selectedInShown.length === shown.length;
  const idMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const FILTER_TABS: { key: Filter; label: string }[] = [
    { key: 'pending', label: `Ожидают (${counts.pending})` },
    { key: 'approved', label: `Одобрены (${counts.approved})` },
    { key: 'rejected', label: `Отклонены (${counts.rejected})` },
    { key: 'all', label: `Все (${counts.all})` },
  ];

  const patchStatus = (id: string, status: 'approved' | 'rejected', extra?: Partial<PhotoRecord>) => {
    setLocalPhotos((prev) =>
      (prev ?? allPhotos).map((p) => (p.id === id ? { ...p, status, moderatedAt: Date.now(), ...extra } : p)),
    );
  };

  const removeLocal = (id: string) => {
    setLocalPhotos((prev) => (prev ?? allPhotos).filter((p) => p.id !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  };

  const handleApprove = async (photo: PhotoRecord) => {
    setBusyId(photo.id);
    setActionError('');
    try {
      await approvePhoto(photo.id);
      patchStatus(photo.id, 'approved');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось одобрить фото.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (photo: PhotoRecord, reason: string) => {
    setBusyId(photo.id);
    setActionError('');
    try {
      await rejectPhoto(photo.id, reason);
      patchStatus(photo.id, 'rejected', { moderationReason: reason.trim() || 'rejected' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отклонить фото.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteOne = async (photo: PhotoRecord) => {
    setBusyId(photo.id);
    setActionError('');
    try {
      await deletePhoto(photo.id);
      removeLocal(photo.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить фото.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedInShown.length === 0) return;
    setBulkBusy(true);
    setActionError('');
    try {
      await deletePhotos(selectedInShown);
      selectedInShown.forEach((id) => removeLocal(id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить выбранные фото.');
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  };

  return (
    <section>
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Модерация</p>
          <h2>Одобрение фото</h2>
          <p style={{ color: '#5d6f8b', fontSize: 13, marginTop: 4 }}>
            Фото из community_photos. Таблица показывает экран-источник каждого фото.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {counts.pending > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#F57F17',
                borderRadius: 10,
                padding: '8px 16px',
              }}
            >
              <span style={{ fontSize: 20 }}>!</span>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {counts.pending} ожидают одобрения
              </span>
            </div>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleRefresh()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #3a4b59',
              background: '#1a2435',
              color: '#c8d6e8',
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {error ? <p className="formError">{error}</p> : null}
      {actionError ? <p className="formError">{actionError}</p> : null}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Фильтр по UID / uploadedBy..."
          value={uidFilter}
          onChange={(e) => setUidFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #253040', background: '#141b24', color: '#c8d6e8', fontSize: 13, minWidth: 240 }}
        />
        {uidFilter && (
          <button
            type="button"
            onClick={() => setUidFilter('')}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #253040', background: '#1a2435', color: '#c8d6e8', fontSize: 12, cursor: 'pointer' }}
          >
            Сбросить
          </button>
        )}
        {uidFilter && (
          <span style={{ color: '#5d6f8b', fontSize: 12 }}>Показано: {shown.length} из {shownByStatus.length}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              border: filter === tab.key ? '1px solid #4b7f9e' : '1px solid #253040',
              background: filter === tab.key ? '#4b7f9e' : '#141b24',
              color: filter === tab.key ? '#fff' : '#c8d6e8',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
              padding: '7px 14px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              border: '1px solid #253040',
              background: '#141b24',
              color: '#c8d6e8',
              cursor: 'pointer',
            }}
          >
            {allShownSelected ? 'Снять выбор' : 'Выбрать все'}
          </button>
          <button
            type="button"
            disabled={bulkBusy || selectedInShown.length === 0}
            onClick={() => void handleDeleteSelected()}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              border: '1px solid #7a1e1e',
              background: '#3b1717',
              color: '#ffb3b3',
              cursor: bulkBusy || selectedInShown.length === 0 ? 'not-allowed' : 'pointer',
              opacity: bulkBusy || selectedInShown.length === 0 ? 0.6 : 1,
            }}
          >
            {bulkBusy ? 'Удаление...' : `Удалить выбранные (${selectedInShown.length})`}
          </button>
          {selectedInShown.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedIds((prev) => prev.filter((id) => !shownIds.includes(id)))}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                border: '1px solid #3a4b59',
                background: 'none',
                color: '#c8d6e8',
                cursor: 'pointer',
              }}
            >
              Очистить выбор
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && photos.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>Загрузка...</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>
          {filter === 'pending' ? 'Нет фото на одобрение' : 'Нет фото в этой категории'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>Выбор</th>
                <th style={{ width: 88 }}>Фото</th>
                <th>Детали</th>
                <th style={{ minWidth: 210 }}>Экран-источник</th>
                <th style={{ minWidth: 120 }}>Статус</th>
                <th style={{ minWidth: 140 }}>Загружено</th>
                <th style={{ minWidth: 240 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((photo) => {
                const p = idMap.get(photo.id) ?? photo;
                const sourceLabel = getSourceLabel(p);
                const sourceDetail = [p.sourceScreen, p.sourceFeature].filter(Boolean).join(' / ');
                const rowBusy = bulkBusy || busyId === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        disabled={rowBusy}
                      />
                    </td>
                    <td>
                      <PhotoThumb photo={p} onOpenLightbox={setLightboxUrl} />
                    </td>
                    <td>
                      <strong>{p.title || 'Фото'}</strong>
                      {p.uploadedBy ? <small style={{ display: 'block' }}>{p.uploadedBy}</small> : null}
                      {p.moderationReason ? (
                        <small style={{ display: 'block', color: '#e88' }}>{`Причина: ${p.moderationReason}`}</small>
                      ) : null}
                    </td>
                    <td>
                      <span>{sourceLabel}</span>
                      {sourceDetail ? <small style={{ display: 'block' }}>{sourceDetail}</small> : null}
                    </td>
                    <td>
                      <span className={`pill ${p.status === 'approved' ? 'good' : p.status === 'rejected' ? 'danger' : ''}`}>
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td>
                      <span>{dateTime(p.uploadedAt)}</span>
                      {p.moderatedAt ? <small style={{ display: 'block' }}>{`Проверено: ${dateTime(p.moderatedAt)}`}</small> : null}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {p.status !== 'approved' ? (
                          <button
                            type="button"
                            className="smallButton"
                            disabled={rowBusy}
                            onClick={() => void handleApprove(p)}
                          >
                            Одобрить
                          </button>
                        ) : null}
                        {p.status !== 'rejected' ? (
                          <button
                            type="button"
                            className="smallButton dangerButton"
                            disabled={rowBusy}
                            onClick={() => {
                              const reason = window.prompt('Причина отклонения (необязательно):', p.moderationReason || '') || '';
                              void handleReject(p, reason);
                            }}
                          >
                            Отклонить
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="smallButton dangerButton"
                          disabled={rowBusy}
                          onClick={() => {
                            const confirmed = window.confirm(`Удалить фото "${p.title || p.id}"?`);
                            if (confirmed) void handleDeleteOne(p);
                          }}
                        >
                          Удалить
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
