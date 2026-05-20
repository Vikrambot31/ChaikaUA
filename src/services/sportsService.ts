import { get, onValue, ref, set, Unsubscribe } from 'firebase/database';
import { database } from '../firebase-core';

export type SportKey = 'basketball' | 'football' | 'tennis_big' | 'tennis_small';

export type SportPlayer = {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  addedAt: string;
};

export type SportTodayEntry = {
  id: string;
  name: string;
  phone?: string;
  time: string;
  updatedAt: string;
};

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toList = <T extends { id: string }>(value: unknown): T[] => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, Omit<T, 'id'>>).map(([id, item]) => ({ ...item, id } as T));
};

export const sportsService = {
  getPlayers: async (sport: SportKey): Promise<SportPlayer[]> => {
    const snap = await get(ref(database, `sports/${sport}/players`));
    return toList<SportPlayer>(snap.val()).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  },

  savePlayer: async (sport: SportKey, player: Omit<SportPlayer, 'addedAt'>): Promise<void> => {
    const existingSnap = await get(ref(database, `sports/${sport}/players/${player.id}`));
    const existing = existingSnap.val() as Partial<SportPlayer> | null;
    await set(ref(database, `sports/${sport}/players/${player.id}`), {
      name: player.name,
      phone: player.phone || '',
      rating: player.rating ?? existing?.rating ?? 0,
      addedAt: new Date().toISOString(),
    });
  },

  getTodayEntries: async (sport: SportKey): Promise<SportTodayEntry[]> => {
    const snap = await get(ref(database, `sports/${sport}/days/${todayKey()}`));
    return toList<SportTodayEntry>(snap.val()).sort((a, b) => a.time.localeCompare(b.time));
  },

  saveTodayEntry: async (sport: SportKey, entry: Omit<SportTodayEntry, 'updatedAt'>): Promise<void> => {
    await set(ref(database, `sports/${sport}/days/${todayKey()}/${entry.id}`), {
      name: entry.name,
      phone: entry.phone || '',
      time: entry.time,
      updatedAt: new Date().toISOString(),
    });
  },

  subscribePlayers: (sport: SportKey, onChange: (items: SportPlayer[]) => void): Unsubscribe => {
    return onValue(ref(database, `sports/${sport}/players`), (snap) => {
      onChange(toList<SportPlayer>(snap.val()).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)));
    });
  },

  subscribeTodayEntries: (sport: SportKey, onChange: (items: SportTodayEntry[]) => void): Unsubscribe => {
    return onValue(ref(database, `sports/${sport}/days/${todayKey()}`), (snap) => {
      onChange(toList<SportTodayEntry>(snap.val()).sort((a, b) => a.time.localeCompare(b.time)));
    });
  },
};
