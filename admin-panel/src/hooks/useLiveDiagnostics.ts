import { useEffect, useMemo, useState } from 'react';
import {
  filterLiveDiagnostics,
  subscribeLiveDiagnostics,
  type LiveDiagnosticEvent,
  type LiveDiagnosticsFilters,
} from '../services/liveDiagnosticsService';

const DEFAULT_FILTERS: LiveDiagnosticsFilters = {
  windowMs: 3 * 60 * 60 * 1000,
  deviceId: '',
  sessionId: '',
  level: '',
  eventType: '',
  search: '',
};

export function useLiveDiagnostics() {
  const [events, setEvents] = useState<LiveDiagnosticEvent[]>([]);
  const [filters, setFilters] = useState<LiveDiagnosticsFilters>(DEFAULT_FILTERS);
  const [paused, setPaused] = useState(false);
  const [bufferedEvents, setBufferedEvents] = useState<LiveDiagnosticEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeLiveDiagnostics((nextEvents) => {
      setError(null);
      if (paused) {
        setBufferedEvents(nextEvents);
        return;
      }
      setEvents(nextEvents);
      setBufferedEvents([]);
    }, (err) => setError(err.message));

    return unsubscribe;
  }, [paused]);

  useEffect(() => {
    if (!paused && bufferedEvents.length) {
      setEvents(bufferedEvents);
      setBufferedEvents([]);
    }
  }, [bufferedEvents, paused]);

  const filteredEvents = useMemo(() => filterLiveDiagnostics(events, filters), [events, filters]);

  const devices = useMemo(() => Array.from(new Set(events.map((event) => event.deviceId))).filter(Boolean).sort(), [events]);
  const sessions = useMemo(() => Array.from(new Set(events.map((event) => event.sessionId))).filter(Boolean).sort(), [events]);
  const eventTypes = useMemo(() => Array.from(new Set(events.map((event) => event.eventType))).filter(Boolean).sort(), [events]);
  const latestEvent = events[0];
  const isOnline = latestEvent ? Date.now() - latestEvent.at < 60_000 : false;

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return {
    events,
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
  };
}
