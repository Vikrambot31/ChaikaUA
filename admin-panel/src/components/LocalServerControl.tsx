import { useEffect, useState, useRef } from 'react';

const CONTROLLER = 'http://localhost:3002';
const POLL_MS = 2000;

type ServerStatus = {
  running: boolean;
  uptime: number;
  dbPort: number;
  logs: string[];
};

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}м`;
  return `${Math.floor(seconds / 3600)}ч ${Math.floor((seconds % 3600) / 60)}м`;
};

export const LocalServerControl = () => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [controllerOnline, setControllerOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = () => {
    fetch(`${CONTROLLER}/status`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.json())
      .then((data: ServerStatus) => {
        setStatus(data);
        setControllerOnline(true);
      })
      .catch(() => {
        setControllerOnline(false);
        setStatus(null);
      });
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const action = async (endpoint: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${CONTROLLER}/${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      setTimeout(fetchStatus, 600);
    } catch {
      // контроллер недоступен
    } finally {
      setTimeout(() => setBusy(false), 800);
    }
  };

  // ── Контроллер не запущен ─────────────────────────────────────────────────
  if (controllerOnline === false) {
    return (
      <div style={styles.root}>
        <span style={{ ...styles.dot, background: '#555' }} />
        <span style={styles.label}>Локальный сервер</span>
        <span style={{ ...styles.badge, background: '#333', color: '#888' }}>КОНТРОЛЛЕР ВЫКЛ</span>
        <button
          type="button"
          style={styles.infoBtn}
          onClick={() => setShowInfo(v => !v)}
          title="Как запустить"
        >?</button>
        {showInfo && (
          <div style={styles.tooltip}>
            <strong>Запусти контроллер в терминале:</strong>
            <code style={styles.code}>cd local-server && npm run controller</code>
            <span style={{ opacity: 0.7, fontSize: 11 }}>Контроллер (порт 3002) управляет БД (порт 3001). Запусти один раз — и кнопки заработают.</span>
          </div>
        )}
      </div>
    );
  }

  const running = status?.running ?? false;

  return (
    <div style={styles.root}>
      {/* Индикатор */}
      <span style={{ ...styles.dot, background: running ? '#4caf50' : '#f44336', boxShadow: running ? '0 0 6px #4caf5088' : 'none' }} />

      {/* Лейбл */}
      <span style={styles.label}>Локальный сервер</span>

      {/* Статус */}
      <span style={{ ...styles.badge, background: running ? '#1a3a1a' : '#3a1a1a', color: running ? '#81c784' : '#ef9a9a' }}>
        {running ? `АКТИВЕН${status?.uptime ? ' · ' + formatUptime(status.uptime) : ''}` : 'ВЫКЛЮЧЕН'}
      </span>

      {/* Кнопки управления */}
      {running ? (
        <>
          <button type="button" style={{ ...styles.btn, ...styles.btnWarn }} onClick={() => void action('restart')} disabled={busy} title="Перезапустить json-server (сбросить состояние)">
            ↺ Перезапуск
          </button>
          <button type="button" style={{ ...styles.btn, ...styles.btnDanger }} onClick={() => void action('stop')} disabled={busy} title="Остановить локальную БД">
            ◼ Стоп
          </button>
        </>
      ) : (
        <button type="button" style={{ ...styles.btn, ...styles.btnGreen }} onClick={() => void action('start')} disabled={busy} title="Запустить локальную БД на порту 3001">
          ▶ Запустить
        </button>
      )}

      {/* Кнопка логов */}
      <button type="button" style={styles.infoBtn} onClick={() => setShowLogs(v => !v)} title="Показать логи сервера">
        {showLogs ? '▲' : '▼'}
      </button>

      {/* Инфо */}
      <button type="button" style={styles.infoBtn} onClick={() => setShowInfo(v => !v)} title="Что это такое">?</button>

      {/* Выпадающий блок: логи */}
      {showLogs && (
        <div style={styles.logsPanel}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#a0c4ff' }}>Логи json-server:</div>
          {(status?.logs ?? []).length === 0
            ? <div style={{ opacity: 0.5 }}>Нет логов</div>
            : (status?.logs ?? []).map((l, i) => <div key={i} style={{ opacity: 0.85, fontSize: 11 }}>{l}</div>)
          }
        </div>
      )}

      {/* Выпадающий блок: описание */}
      {showInfo && (
        <div style={styles.tooltip}>
          <strong style={{ color: '#a0c4ff' }}>Локальный сервер разработки</strong>
          <p style={{ margin: '6px 0 4px' }}>
            Это <b>json-server</b> на порту <b>3001</b> — локальная замена Firebase для разработки.
            Все экраны мобильного приложения читают и пишут данные сюда, без обращений к Firebase.
          </p>
          <p style={{ margin: '4px 0' }}>
            <b>Запустить:</b> нажми кнопку ▶ Запустить<br />
            <b>Остановить:</b> кнопка ◼ Стоп<br />
            <b>Перезапустить:</b> сбрасывает соединения, не трогает db.json
          </p>
          <p style={{ margin: '4px 0', opacity: 0.6, fontSize: 11 }}>
            Контроллер (порт 3002) должен быть запущен:<br />
            <code>cd local-server && npm run controller</code>
          </p>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
    flexWrap: 'wrap',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s',
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: '#c0d0ff',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 6px',
    borderRadius: 3,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  btn: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    border: 'none',
    whiteSpace: 'nowrap',
  },
  btnGreen: {
    background: '#1b4d1b',
    color: '#81c784',
    border: '1px solid #2e7d32',
  },
  btnWarn: {
    background: '#3a2a00',
    color: '#ffcc80',
    border: '1px solid #5a4000',
  },
  btnDanger: {
    background: '#3a1a1a',
    color: '#ef9a9a',
    border: '1px solid #6a2020',
  },
  infoBtn: {
    background: 'transparent',
    border: '1px solid #3a3a6a',
    color: '#8888aa',
    borderRadius: 4,
    width: 20,
    height: 20,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  },
  logsPanel: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    background: '#0d0d1a',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    padding: 10,
    zIndex: 100,
    minWidth: 360,
    maxWidth: 500,
    maxHeight: 200,
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#c0c0d0',
    lineHeight: 1.6,
    boxShadow: '0 4px 20px #00000088',
  },
  tooltip: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    background: '#0d0d1a',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    padding: 12,
    zIndex: 100,
    width: 320,
    fontSize: 12,
    color: '#c0c0d0',
    lineHeight: 1.5,
    boxShadow: '0 4px 20px #00000088',
  },
  code: {
    display: 'block',
    background: '#1a1a2e',
    padding: '4px 8px',
    borderRadius: 4,
    margin: '6px 0',
    fontSize: 11,
    color: '#a0c4ff',
    fontFamily: 'monospace',
  },
};
