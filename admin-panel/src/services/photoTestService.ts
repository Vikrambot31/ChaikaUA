import { onValue, ref, remove } from 'firebase/database';
import { database } from '../firebase/firebase';

export type PhotoLogEntry = {
  time: string;
  type: 'step' | 'error' | 'success';
  message: string;
};

export type PhotoSession = {
  id: string;
  sentAt: number;
  deviceInfo: string;
  platform: string;
  totalPhotos: number;
  successPhotos: number;
  failedPhotos: number;
  log: PhotoLogEntry[];
};

export type PhotoTestState = {
  sessions: PhotoSession[];
};
const MAX_FEED_ITEMS = 50;

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');
const getNumber = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const normalizeLog = (raw: unknown): PhotoLogEntry[] => {
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw as Record<string, unknown>)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const type = r.type === 'error' ? 'error' : r.type === 'success' ? 'success' : 'step';
      return { time: getString(r.time), type, message: getString(r.message) } as PhotoLogEntry;
    })
    .filter((x): x is PhotoLogEntry => x !== null);
};

const normalizeSession = (id: string, raw: unknown): PhotoSession | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    id,
    sentAt: getNumber(r.sentAt),
    deviceInfo: getString(r.deviceInfo),
    platform: getString(r.platform),
    totalPhotos: getNumber(r.totalPhotos),
    successPhotos: getNumber(r.successPhotos),
    failedPhotos: getNumber(r.failedPhotos),
    log: normalizeLog(r.log),
  };
};

export const subscribePhotoTest = (
  onData: (state: PhotoTestState) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const dbRef = ref(database, 'diagnostics/photo_test_logs');

  const unsub = onValue(
    dbRef,
    (snap) => {
      const raw = snap.val() as Record<string, unknown> | null;
      if (!raw) {
        onData({ sessions: [] });
        return;
      }
      const sessions = Object.entries(raw)
        .map(([id, val]) => normalizeSession(id, val))
        .filter((s): s is PhotoSession => s !== null)
        .sort((a, b) => b.sentAt - a.sentAt);
      const staleSessions = sessions.slice(MAX_FEED_ITEMS);
      if (staleSessions.length) {
        void Promise.allSettled(
          staleSessions.map((session) => remove(ref(database, `diagnostics/photo_test_logs/${session.id}`))),
        );
      }

      onData({ sessions: sessions.slice(0, MAX_FEED_ITEMS) });
    },
    (err) => onError?.(err),
  );

  return () => unsub();
};
