// =============================================================
//  Yellow List Service — управление жёлтым списком пользователей
// =============================================================

import { ref, get, set, remove, onValue, type Unsubscribe } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export type YellowListEntry = {
  uid: string;
  displayName: string;
  reason: string;
  bannedAt: number;
  bannedUntil: number;
  bannedBy: string;
  itemPath: string;
  section: string;
  active: boolean;
};

const YELLOW_LIST_PATH = 'yellow_list';
const BAN_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 дней

/**
 * Добавить пользователя в жёлтый список (бан на заявки 14 дней).
 */
export async function addToYellowList(entry: {
  uid: string;
  displayName: string;
  reason: string;
  bannedBy: string;
  itemPath: string;
  section: string;
}): Promise<void> {
  if (LOCAL_MODE) {
    console.log('[LOCAL_MODE] addToYellowList:', entry);
    return;
  }
  const now = Date.now();
  const data: YellowListEntry = {
    uid: entry.uid,
    displayName: entry.displayName,
    reason: entry.reason,
    bannedAt: now,
    bannedUntil: now + BAN_DURATION_MS,
    bannedBy: entry.bannedBy,
    itemPath: entry.itemPath,
    section: entry.section,
    active: true,
  };
  await set(ref(database, `${YELLOW_LIST_PATH}/${entry.uid}`), data);
}

/**
 * Снять бан (удалить из жёлтого списка).
 */
export async function removeFromYellowList(uid: string): Promise<void> {
  if (LOCAL_MODE) {
    console.log('[LOCAL_MODE] removeFromYellowList:', uid);
    return;
  }
  await remove(ref(database, `${YELLOW_LIST_PATH}/${uid}`));
}

/**
 * Проверить, есть ли пользователь в активном бане.
 */
export async function isUserBanned(uid: string): Promise<boolean> {
  if (LOCAL_MODE) return false;
  const snap = await get(ref(database, `${YELLOW_LIST_PATH}/${uid}`));
  if (!snap.exists()) return false;
  const entry = snap.val() as YellowListEntry;
  return entry.active && entry.bannedUntil > Date.now();
}

/**
 * Получить запись жёлтого списка для uid.
 */
export async function getYellowListEntry(uid: string): Promise<YellowListEntry | null> {
  if (LOCAL_MODE) return null;
  const snap = await get(ref(database, `${YELLOW_LIST_PATH}/${uid}`));
  if (!snap.exists()) return null;
  return snap.val() as YellowListEntry;
}

/**
 * Подписка на весь жёлтый список (для таблицы в админке).
 */
export function subscribeYellowList(callback: (entries: YellowListEntry[]) => void): Unsubscribe {
  if (LOCAL_MODE) {
    callback([]);
    return () => {};
  }
  return onValue(ref(database, YELLOW_LIST_PATH), (snap) => {
    const entries: YellowListEntry[] = [];
    if (snap.exists()) {
      const data = snap.val() as Record<string, YellowListEntry>;
      for (const [uid, entry] of Object.entries(data)) {
        entries.push({ ...entry, uid });
      }
    }
    // Сортировка: активные баны первыми, потом по дате
    entries.sort((a, b) => {
      const aActive = a.active && a.bannedUntil > Date.now() ? 0 : 1;
      const bActive = b.active && b.bannedUntil > Date.now() ? 0 : 1;
      return aActive - bActive || b.bannedAt - a.bannedAt;
    });
    callback(entries);
  });
}
