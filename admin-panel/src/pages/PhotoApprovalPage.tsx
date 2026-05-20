import { useEffect, useMemo, useRef, useState } from 'react';
import { usePhotoApproval } from '../hooks/usePhotoApproval';
import { storage } from '../firebase/firebase';
import {
  approvePhoto,
  rejectPhoto,
  deletePhoto,
  deletePhotos,
  resolvePhotoUrl,
  resolvePhotoAccessUrl,
  resolvePhotoDataUrl,
  type PhotoRecord,
} from '../services/photoApprovalService';

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

const PhotoCard = ({
  photo,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onDelete,
  onRemoved,
}: {
  photo: PhotoRecord;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRemoved: () => void;
}) => {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState('');
  const [imgSrc, setImgSrc] = useState(photo.imageUri);
  const [imgFailed, setImgFailed] = useState(false);
  const [imageErrorText, setImageErrorText] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const autoRefreshTriedRef = useRef(false);
  const dataUrlTriedRef = useRef(false);

  const handleApprove = async () => {
    setBusy(true);
    setCardError('');
    try {
      await onApprove();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Не удалось одобрить.');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setCardError('');
    try {
      await onReject(reason);
      setRejectMode(false);
      setReason('');
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Не удалось отклонить.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete();
      onRemoved();
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshUrl = async () => {
    if (!photo.storagePath) return;
    autoRefreshTriedRef.current = true;
    setUrlBusy(true);
    setCardError('');
    setImageErrorText('');
    try {
      const fresh = await resolvePhotoUrl(photo);
      setImgSrc(fresh);
      setImgFailed(false);
    } catch (err) {
      console.error('handleRefreshUrl failed:', err);
      try {
        const fresh = await resolvePhotoAccessUrl(photo);
        setImgSrc(fresh);
        setImgFailed(false);
      } catch (err2) {
        console.error('handleRefreshUrl (fallback) failed:', err2);
        setCardError('Не удалось обновить URL.');
      }
    } finally {
      setUrlBusy(false);
    }
  };

  const handleDataUrlFallback = async () => {
    if (!photo.storagePath || dataUrlTriedRef.current) return;
    dataUrlTriedRef.current = true;
    setUrlBusy(true);
    setCardError('');
    setImageErrorText('Пробую прочитать файл через серверный fallback...');
    try {
      const dataUrl = await resolvePhotoDataUrl(photo);
      setImgSrc(dataUrl);
      setImgFailed(false);
      setImageErrorText('');
    } catch (err) {
      console.error('handleDataUrlFallback failed:', err);
      setImageErrorText('Файл найден, но не читается даже через серверный fallback. Вероятно, файл в Storage повреждён. Удалите это фото и загрузите заново после обновления приложения.');
      setImgFailed(true);
    } finally {
      setUrlBusy(false);
    }
  };

  useEffect(() => {
    if (photo.storagePath && !autoRefreshTriedRef.current) {
      void handleRefreshUrl();
    } else if (!photo.storagePath && photo.imageUri && !/^https?:\/\//i.test(photo.imageUri)) {
      const sp = photo.imageUri;
      const bucket = typeof storage.app.options.storageBucket === 'string' ? storage.app.options.storageBucket : '';
      const encoded = sp.split('/').map(encodeURIComponent).join('%2F');
      setImgSrc(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`);
    }
  }, [photo.id, photo.storagePath]);

  const handleImageError = () => {
    if (photo.storagePath && !autoRefreshTriedRef.current) {
      autoRefreshTriedRef.current = true;
      setImgFailed(true);
      setImageErrorText('Пробую получить свежий доступ к файлу...');
      void handleRefreshUrl();
      return;
    }
    if (photo.storagePath && !dataUrlTriedRef.current) {
      setImgFailed(true);
      void handleDataUrlFallback();
      return;
    }
    setImageErrorText('Файл найден, но браузер не может прочитать изображение. Вероятно, файл в Storage повреждён или загружен не как JPEG. Удалите это фото и загрузите заново после обновления приложения.');
    setImgFailed(true);
  };

  const statusStyle =
    photo.status === 'approved'
      ? { border: '1px solid #2e7d32', background: '#f1f8f2' }
      : photo.status === 'rejected'
        ? { border: '1px solid #7a1e1e', background: '#fdf1f1' }
        : { border: '1px solid #253040', background: '#141b24' };

  return (
    <div
      style={{
        ...statusStyle,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative' }}>
        {imgFailed ? (
          <div
            style={{
              width: '100%',
              aspectRatio: '1',
              background: '#1a2030',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: '#5d6f8b', fontSize: 12 }}>{'Фото недоступно'}</span>
            {imageErrorText && (
              <span style={{ color: '#8bb2d6', fontSize: 10, maxWidth: 170, textAlign: 'center', lineHeight: 1.35 }}>
                {imageErrorText}
              </span>
            )}
            {photo.storagePath && (
              <button
                type="button"
                disabled={urlBusy}
                onClick={() => void handleRefreshUrl()}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #4b7f9e',
                  background: '#1a2d3d',
                  color: '#7ab8d8',
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: urlBusy ? 0.6 : 1,
                }}
              >
                {urlBusy ? 'Загрузка...' : 'Обновить URL'}
              </button>
            )}
          </div>
        ) : (
          <img
            src={imgSrc}
            alt=""
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
            onError={handleImageError}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            background:
              photo.status === 'approved'
                ? '#2e7d32'
                : photo.status === 'rejected'
                  ? '#c62828'
                  : '#F57F17',
            color: '#fff',
          }}
        >
          {photo.status === 'approved'
            ? 'Одобрено'
            : photo.status === 'rejected'
              ? 'Отклонено'
              : 'Ожидает'}
        </div>
        <label
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(20,27,36,0.86)',
            border: '1px solid #3a4b59',
            borderRadius: 6,
            padding: '3px 8px',
            color: '#e8f0fe',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            disabled={busy}
            style={{ cursor: 'pointer' }}
          />
          {'Выбрать'}
        </label>
      </div>

      <div
        style={{
          padding: '10px 12px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {photo.title && (
          <p
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 13,
              color: '#e8f0fe',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {photo.title}
          </p>
        )}
        {photo.uploadedBy && (
          <p style={{ margin: 0, fontSize: 11, color: '#8bb2d6' }}>{photo.uploadedBy}</p>
        )}
        <p style={{ margin: 0, fontSize: 11, color: '#5d6f8b' }}>{dateTime(photo.uploadedAt)}</p>
        {photo.moderationReason && (
          <p style={{ margin: 0, fontSize: 11, color: '#e88', fontStyle: 'italic' }}>
            {'Причина: '}
            {photo.moderationReason}
          </p>
        )}
        {photo.moderatedAt ? (
          <p style={{ margin: 0, fontSize: 10, color: '#3d5166' }}>
            {'Проверено: '}
            {dateTime(photo.moderatedAt)}
          </p>
        ) : null}

        {cardError && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#e05050' }}>{cardError}</p>
        )}

        {photo.status === 'pending' && !rejectMode && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleApprove()}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: '#2e7d32',
                color: '#fff',
                fontWeight: 800,
                fontSize: 12,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {'✓ Одобрить'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectMode(true)}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: '#c62828',
                color: '#fff',
                fontWeight: 800,
                fontSize: 12,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {'✗ Отклонить'}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDelete()}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '6px 0',
            borderRadius: 6,
            border: '1px solid #7a1e1e',
            background: '#3b1717',
            color: '#ffb3b3',
            fontWeight: 800,
            fontSize: 12,
            cursor: 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {'Удалить фото'}
        </button>

        {photo.status === 'pending' && rejectMode && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <input
              type="text"
              placeholder="Причина отклонения (необязательно)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid #7a1e1e',
                background: '#1a1010',
                color: '#e8f0fe',
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReject()}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 6,
                  border: 'none',
                  background: '#c62828',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {'Подтвердить'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setRejectMode(false);
                  setReason('');
                }}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 6,
                  border: '1px solid #3a4b59',
                  background: 'none',
                  color: '#c8d6e8',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {'Отмена'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const PhotoApprovalPage = () => {
  const { photos: allPhotos, loading, error, refresh } = usePhotoApproval();
  const [localPhotos, setLocalPhotos] = useState<PhotoRecord[] | null>(null);
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Use locally-patched copy after actions so UI updates immediately without re-fetching
  const photos = localPhotos ?? allPhotos;

  // Sync local copy when upstream reloads
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

  const shown = filter === 'all' ? photos : photos.filter((p) => p.status === filter);
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
    setActionError('');
    await approvePhoto(photo.id);
    patchStatus(photo.id, 'approved');
  };

  const handleReject = async (photo: PhotoRecord, reason: string) => {
    setActionError('');
    await rejectPhoto(photo.id, reason);
    patchStatus(photo.id, 'rejected', { moderationReason: reason.trim() || 'rejected' });
  };

  const handleDeleteOne = async (photo: PhotoRecord) => {
    setActionError('');
    try {
      await deletePhoto(photo.id);
      removeLocal(photo.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить фото.');
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
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Модерация</p>
          <h2>Одобрение фото</h2>
          <p style={{ color: '#5d6f8b', fontSize: 13, marginTop: 4 }}>
            {'Фото из community_photos.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {counts.pending > 0 && (
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
              <span style={{ fontSize: 20 }}>{'!'}</span>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {counts.pending} {'ожидают одобрения'}
              </span>
            </div>
          )}
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

      {shown.length > 0 && (
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
          {selectedInShown.length > 0 && (
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
              {'Очистить выбор'}
            </button>
          )}
        </div>
      )}

      {loading && photos.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>{'Загрузка...'}</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#5d6f8b' }}>
          {filter === 'pending' ? 'Нет фото на одобрение' : 'Нет фото в этой категории'}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
          }}
        >
          {shown.map((photo) => {
            const p = idMap.get(photo.id) ?? photo;
            return (
              <PhotoCard
                key={p.id}
                photo={p}
                selected={selectedIds.includes(p.id)}
                onToggleSelect={() => toggleSelect(p.id)}
                onApprove={() => handleApprove(p)}
                onReject={(r) => handleReject(p, r)}
                onDelete={() => handleDeleteOne(p)}
                onRemoved={() => removeLocal(p.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};
