import { useState } from 'react';
import { usePhotoTestMonitor } from '../hooks/usePhotoTestMonitor';
import type { PhotoSession } from '../services/photoTestService';

const dateTime = (ts: number) => (ts ? new Date(ts).toLocaleString('ru-RU') : '-');

const typeClass = (type: string) => {
  if (type === 'error') return 'pill danger';
  if (type === 'success') return 'pill good';
  return 'pill';
};

const SessionCard = ({ session, index }: { session: PhotoSession; index: number }) => {
  const [open, setOpen] = useState(index === 0);

  const hasErrors = session.log.some((e) => e.type === 'error');
  const errorCount = session.log.filter((e) => e.type === 'error').length;

  return (
    <div
      style={{
        border: `1px solid ${hasErrors ? '#7a1e1e' : '#253040'}`,
        borderRadius: 8,
        marginBottom: 12,
        background: hasErrors ? '#1a1010' : '#141b24',
        overflow: 'hidden',
      }}
    >
      {/* Session header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18 }}>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: '#e8f0fe', fontWeight: 700, fontSize: 13 }}>
            {dateTime(session.sentAt)}
          </span>
          <span style={{ color: '#5d6f8b', fontSize: 12, marginLeft: 12 }}>
            {session.platform} · {session.deviceInfo}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span className="pill good" style={{ fontSize: 11 }}>
            ✓ {session.successPhotos}
          </span>
          {session.failedPhotos > 0 && (
            <span className="pill danger" style={{ fontSize: 11 }}>
              ✗ {session.failedPhotos}
            </span>
          )}
          {errorCount > 0 && (
            <span className="pill danger" style={{ fontSize: 11 }}>
              {errorCount} ошибок
            </span>
          )}
          <span className="pill" style={{ fontSize: 11 }}>
            {session.log.length} строк
          </span>
        </span>
      </button>

      {/* Log entries */}
      {open && (
        <div
          style={{
            borderTop: '1px solid #253040',
            padding: '10px 16px 14px',
            maxHeight: 400,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {session.log.length === 0 ? (
            <p style={{ color: '#5d6f8b' }}>Лог пуст</p>
          ) : (
            session.log.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '3px 0',
                  borderBottom: '1px solid #1e2a38',
                  background:
                    entry.type === 'error'
                      ? 'rgba(180,40,40,0.08)'
                      : entry.type === 'success'
                      ? 'rgba(40,140,60,0.06)'
                      : 'transparent',
                }}
              >
                <span style={{ color: '#3d5166', minWidth: 56, flexShrink: 0 }}>
                  {entry.time}
                </span>
                <span className={typeClass(entry.type)} style={{ fontSize: 10, flexShrink: 0 }}>
                  {entry.type.toUpperCase()}
                </span>
                <span
                  style={{
                    color:
                      entry.type === 'error'
                        ? '#e05050'
                        : entry.type === 'success'
                        ? '#5dc877'
                        : '#c8d6e8',
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}
                >
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const PhotoTestMonitorPage = () => {
  const { sessions, error } = usePhotoTestMonitor();
  const [search, setSearch] = useState('');

  const filtered = sessions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.deviceInfo.toLowerCase().includes(q) ||
      s.platform.toLowerCase().includes(q) ||
      s.log.some((e) => e.message.toLowerCase().includes(q))
    );
  });

  const totalErrors = sessions.reduce(
    (sum, s) => sum + s.log.filter((e) => e.type === 'error').length,
    0,
  );
  const totalSuccess = sessions.reduce((sum, s) => sum + s.successPhotos, 0);
  const totalFailed = sessions.reduce((sum, s) => sum + s.failedPhotos, 0);

  return (
    <section>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Диагностика</p>
          <h2>Монитор ошибок по фото</h2>
          <p style={{ color: '#5d6f8b', fontSize: 13, marginTop: 4 }}>
            Логи из экрана «Тест фото» мобильного приложения · путь: diagnostics/photo_test_logs
          </p>
        </div>
      </div>

      {error ? <p className="formError">{error}</p> : null}

      {/* Stats row */}
      <div className="statsRow" style={{ marginBottom: 20 }}>
        <div className="statCard">
          <p className="statLabel">Сессий</p>
          <p className="statValue">{sessions.length}</p>
        </div>
        <div className="statCard">
          <p className="statLabel">Фото загружено</p>
          <p className="statValue">{totalSuccess}</p>
        </div>
        <div className="statCard">
          <p className="statLabel">Фото с ошибкой</p>
          <p className="statValue" style={{ color: totalFailed > 0 ? '#e05050' : undefined }}>
            {totalFailed}
          </p>
        </div>
        <div className="statCard">
          <p className="statLabel">Строк ошибок</p>
          <p className="statValue" style={{ color: totalErrors > 0 ? '#e05050' : undefined }}>
            {totalErrors}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="searchInput"
          placeholder="Поиск по логу, устройству, платформе..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 500 }}
        />
      </div>

      {/* Sessions */}
      {sessions.length === 0 ? (
        <div className="emptyState">
          <p>Нет данных. Нажмите «Отправить лог» на экране «Тест фото» в приложении.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#5d6f8b' }}>Ничего не найдено по запросу «{search}»</p>
      ) : (
        filtered.map((session, i) => (
          <SessionCard key={session.id} session={session} index={i} />
        ))
      )}
    </section>
  );
};
