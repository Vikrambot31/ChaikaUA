// =============================================================
//  Violation Service — счётчик нарушений и прощения пользователей
// =============================================================
//
//  Firebase RTDB путь: user_pardons/{uid}
//  Когда админ «прощает» пользователя — записывается метка времени.
//  Нарушения (rejected items) старше этой метки не учитываются в счётчике.
//
//  Уровни:
//    0 — чисто (< 2 нарушений)
//    1 — предупреждение, жёлтый флаг (ровно 2 нарушения)
//    2 — подозрение, красный флаг (3+ нарушений) → можно забанить
// =============================================================

import { ref, set, remove, onValue, type Unsubscribe } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
import { getServerNow } from './yellowListService';

export type UserPardon = {
  uid: string;
  displayName: string;
  pardonedAt: number;
  pardonedBy: string;
};

const PARDONS_PATH = 'user_pardons';

/**
 * Сбросить все нарушения пользователя.
 * Записывает метку времени — все rejected-записи раньше этой метки
 * больше не учитываются в счётчике нарушений.
 */
export async function pardonUser(uid: string, displayName: string, adminUid: string): Promise<void> {
  if (LOCAL_MODE) {
    console.log('[LOCAL_MODE] pardonUser:', uid);
    return;
  }
  const data: UserPardon = {
    uid,
    displayName,
    pardonedAt: getServerNow(),
    pardonedBy: adminUid,
  };
  await set(ref(database, `${PARDONS_PATH}/${uid}`), data);
}

/**
 * Удалить запись о прощении (вернуть полную историю нарушений).
 */
export async function removePardon(uid: string): Promise<void> {
  if (LOCAL_MODE) return;
  await remove(ref(database, `${PARDONS_PATH}/${uid}`));
}

/**
 * Подписка на карту прощений: uid → timestamp прощения.
 * Используется в ModerationPage для подсчёта актуальных нарушений.
 */
export function subscribeUserPardons(callback: (pardons: Map<string, number>) => void): Unsubscribe {
  if (LOCAL_MODE) {
    callback(new Map());
    return () => {};
  }
  return onValue(ref(database, PARDONS_PATH), (snap) => {
    const map = new Map<string, number>();
    if (snap.exists()) {
      const data = snap.val() as Record<string, UserPardon>;
      for (const [uid, entry] of Object.entries(data)) {
        map.set(uid, entry.pardonedAt);
      }
    }
    callback(map);
  });
}
