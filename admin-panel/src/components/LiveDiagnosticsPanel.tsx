import { useEffect, useMemo, useState } from 'react';
import { useLiveDiagnostics } from '../hooks/useLiveDiagnostics';
import {
  buildArchiveFileName,
  buildErrorArchiveText,
  setRuntimeDiagnosticsControl,
  subscribeRuntimeDiagnosticsControl,
  type LiveDiagnosticEvent,
  type LiveDiagnosticLevel,
} from '../services/liveDiagnosticsService';

const WINDOW_OPTIONS = [
  { label: '15 мин', value: 15 * 60 * 1000 },
  { label: '1 час', value: 60 * 60 * 1000 },
  { label: '3 часа', value: 3 * 60 * 60 * 1000 },
];

const LEVEL_LABELS: Record<LiveDiagnosticLevel, string> = {
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

const formatTime = (at: number): string => {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) {
    return '--:--:--';
  }
  try {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--:--';
  }
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{"error":"Failed to serialize JSON"}';
  }
};

const copyText = async (text: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API недоступен в текущем контексте браузера.');
  }
  await navigator.clipboard.writeText(text);
};

const downloadTextFile = (fileName: string, text: string): void => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const LiveDiagnosticsPanel = () => {
  const {
    filteredEvents,
    filters,
    setFilters,
    paused,
    setPaused,
    devices,
    sessions,
    eventTypes,
    latestEvent,
    isOnline,
    error,
    resetFilters,
  } = useLiveDiagnostics();
  const [selectedEvent, setSelectedEvent] = useState<LiveDiagnosticEvent | null>(null);
  const [archivePreview, setArchivePreview] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [runtimeEnabled, setRuntimeEnabled] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);

  const stats = useMemo(() => {
    const counts = { info: 0, warn: 0, error: 0, fatal: 0 };
    filteredEvents.forEach((event) => {
      counts[event.level] += 1;
    });
    return counts;
  }, [filteredEvents]);

  const archiveText = useMemo(
    () => buildErrorArchiveText(filteredEvents, filters),
    [filteredEvents, filters],
  );

  const handleExport = () => {
    downloadTextFile(buildArchiveFileName(), archiveText);
    setArchivePreview(archiveText);
  };

  const handleCopyErrors = async () => {
    try {
      await copyText(archiveText);
      setArchivePreview(archiveText);
      setCopyStatus('Скопировано');
    } catch (err) {
      setCopyStatus(err instanceof Error ? err.message : 'Не удалось скопировать');
    } finally {
      setTimeout(() => setCopyStatus(''), 2200);
    }
  };

  const handleResetFilters = () => {
    resetFilters();
    setPaused(false);
    setSelectedEvent(null);
    setArchivePreview('');
    setCopyStatus('Фильтры очищены');
    setTimeout(() => setCopyStatus(''), 1400);
  };

  useEffect(() => {
    const unsubscribe = subscribeRuntimeDiagnosticsControl((enabled) => {
      setRuntimeEnabled(enabled);
    }, () => {
      setRuntimeEnabled(false);
    });
    return unsubscribe;
  }, []);

  const handleToggleRuntime = async () => {
    setRuntimeBusy(true);
    try {
      await setRuntimeDiagnosticsControl(!runtimeEnabled);
      setCopyStatus(!runtimeEnabled ? 'Диагностика включена' : 'Диагностика остановлена');
      setTimeout(() => setCopyStatus(''), 1500);
    } catch (err) {
      setCopyStatus(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setCopyStatus(''), 4000);
    } finally {
      setRuntimeBusy(false);
    }
  };

  return (
    <section className="liveDiagnostics">
      <div className="liveDiagnosticsHeader">
        <div>
          <p className="eyebrow">Live Diagnostics</p>
          <h3>Диагностика устройства</h3>
          <p className="liveDiagnosticsSub">
            Живой поток шагов мобильного приложения, ошибки, контекст и экспорт для анализа ИИ.
          </p>
          <p className="liveDiagnosticsLastEvent">
            {latestEvent
              ? `Последнее событие: ${formatTime(latestEvent.at)} · ${latestEvent.deviceId} · ${latestEvent.sessionId} · ${latestEvent.eventType}`
              : 'Последнее событие: пока нет данных'}
          </p>
        </div>
        <div className={`deviceStatus ${isOnline ? 'online' : 'offline'}`}>
          <span />
          {isOnline ? 'online' : 'offline'}
          {latestEvent ? <small>{formatTime(latestEvent.at)}</small> : null}
        </div>
      </div>

      {error ? <div className="releaseError">Ошибка диагностики: {error}</div> : null}

      <div className="diagnosticStats">
        <div><strong>{filteredEvents.length}</strong><span>событий</span></div>
        <div><strong>{stats.warn}</strong><span>warn</span></div>
        <div><strong>{stats.error}</strong><span>error</span></div>
        <div><strong>{stats.fatal}</strong><span>fatal</span></div>
      </div>

      <div className="diagnosticToolbar">
        <div className="segmented">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filters.windowMs === option.value ? 'active' : ''}
              onClick={() => setFilters((prev) => ({ ...prev, windowMs: option.value }))}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="smallButton" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Продолжить поток' : 'Пауза потока'}
        </button>
        <button
          type="button"
          className={`smallButton ${runtimeEnabled ? 'dangerButton' : ''}`}
          onClick={() => void handleToggleRuntime()}
          disabled={runtimeBusy}
        >
          {runtimeBusy ? 'Сохранение...' : runtimeEnabled ? 'Остановить диагностику' : 'Запуск диагностики'}
        </button>
        <button type="button" className="smallButton" onClick={handleResetFilters}>Очистить фильтр</button>
        <button type="button" className="smallButton" onClick={handleExport}>Экспорт TXT</button>
        <button type="button" className="smallButton" onClick={() => void handleCopyErrors()}>
          {copyStatus || 'Копировать ошибки'}
        </button>
      </div>

      <div className="diagnosticFilters">
        <label>
          Устройство
          <select value={filters.deviceId} onChange={(e) => setFilters((prev) => ({ ...prev, deviceId: e.target.value }))}>
            <option value="">Все</option>
            {devices.map((device) => <option key={device} value={device}>{device}</option>)}
          </select>
        </label>
        <label>
          Session
          <select value={filters.sessionId} onChange={(e) => setFilters((prev) => ({ ...prev, sessionId: e.target.value }))}>
            <option value="">Все</option>
            {sessions.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>
        </label>
        <label>
          Уровень
          <select value={filters.level} onChange={(e) => setFilters((prev) => ({ ...prev, level: e.target.value }))}>
            <option value="">Все</option>
            {Object.keys(LEVEL_LABELS).map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label>
          Тип события
          <select value={filters.eventType} onChange={(e) => setFilters((prev) => ({ ...prev, eventType: e.target.value }))}>
            <option value="">Все</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="diagnosticSearch">
          Поиск
          <input
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder="message, details, stacktrace..."
          />
        </label>
      </div>

      <div className="diagnosticFeed">
        {filteredEvents.length === 0 ? (
          <p className="releaseEmpty">Нет событий в выбранном окне. Откройте приложение на устройстве и выполните действие.</p>
        ) : filteredEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            className={`diagnosticEvent diagnostic-${event.level}`}
            onClick={() => setSelectedEvent(event)}
          >
            <span className="diagnosticTime">{formatTime(event.at)}</span>
            <span className="diagnosticLevel">{event.level}</span>
            <span className="diagnosticMain">
              <strong>{event.eventType}</strong>
              <small>{event.screen || '-'} {event.action ? `· ${event.action}` : ''}</small>
              <span>{event.message}</span>
            </span>
            <span className="diagnosticDevice">{event.deviceId}</span>
          </button>
        ))}
      </div>

      {archivePreview ? (
        <details className="archivePreview" open>
          <summary>Предпросмотр TXT-архива</summary>
          <textarea readOnly value={archivePreview} rows={10} />
        </details>
      ) : null}

      {selectedEvent ? (
        <div className="diagnosticModal" role="dialog" aria-modal="true">
          <div className="diagnosticModalCard">
            <div className="previewHeader">
              <h3>{selectedEvent.eventType}</h3>
              <button type="button" className="smallButton" onClick={() => setSelectedEvent(null)}>Закрыть</button>
            </div>
            <pre>{safeStringify(selectedEvent.raw)}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
};
