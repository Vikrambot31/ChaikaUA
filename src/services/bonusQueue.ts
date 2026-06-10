/**
 * Offline Bonus Queue
 *
 * Проблема, которую решает этот модуль:
 *   Redux восстанавливает состояние пользователя из AsyncStorage мгновенно,
 *   но Firebase Auth восстанавливает сессию асинхронно (< 1–3 сек).
 *   В этот промежуток нажатие на бонусную кнопку → Cloud Function получает
 *   пустой/анонимный токен → возвращает auth_required.
 *
 * Решение:
 *   Если auth.currentUser нет — сохраняем действие в AsyncStorage-очередь.
 *   При появлении реального пользователя (onAuthStateChanged) — дренируем очередь.
 *   Все Cloud Functions идемпотентны (already_helped, already_closed и т.д.),
 *   поэтому повторные вызовы безопасны.
 *
 * Использование:
 *   import { tryBonusOrEnqueue, drainBonusQueue } from './bonusQueue';
 *
 *   // В хендлере кнопки:
 *   const queued = await tryBonusOrEnqueue(
 *     { type: 'close_request', payload: { requestId: request.id } },
 *     () => closeRequestWithBonus(request.id),
 *   );
 *   if (queued) Toast.show({ type: 'info', text1: 'Буде зараховано після синхронізації' });
 *
 *   // В App.tsx onAuthStateChanged після dispatch(setUser(...)):
 *   drainBonusQueue().catch(() => {});
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase-core';
import {
  awardGratitudeBonus,
  awardHelpRespondBonus,
  awardMilestoneBonus,
  awardProfileThanksBonus,
  closeRequestWithBonus,
  confirmHelperForRequest,
} from './bonusService';

const QUEUE_STORAGE_KEY = '@bonus_queue_v1';
const MAX_QUEUE_SIZE = 20;
const MAX_RETRY_COUNT = 3;
const MAX_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export type BonusQueueItemType =
  | 'help_respond'
  | 'close_request'
  | 'confirm_helper'
  | 'gratitude'
  | 'profile_thanks'
  | 'milestone';

export type BonusQueueItem = {
  id: string;
  type: BonusQueueItemType;
  payload: Record<string, string>;
  createdAt: number;
  retries: number;
  ownerUid: string; // защита от применения чужих бонусов
};

// ─── Хранение очереди ─────────────────────────────────────────────────────────

const loadQueue = async (): Promise<BonusQueueItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveQueue = async (queue: BonusQueueItem[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Молча игнорируем — худшее что случится: бонус не зачтётся
  }
};

// ─── Генерация ID ─────────────────────────────────────────────────────────────

const makeId = (): string =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── Добавление в очередь ─────────────────────────────────────────────────────

export const enqueueBonusAction = async (
  type: BonusQueueItemType,
  payload: Record<string, string>,
): Promise<void> => {
  const uid = auth.currentUser?.uid;
  // Не ставим в очередь если нет UID даже в auth объекте
  // (анонимный имеет uid, но isAnonymous=true — используем Redux uid из payload)
  const ownerUid = uid || payload.userId || '';
  if (!ownerUid) return;

  const queue = await loadQueue();

  // Deduplicate: не добавляем если такое же действие с таким же payload уже есть
  const duplicate = queue.find(
    (item) =>
      item.type === type &&
      JSON.stringify(item.payload) === JSON.stringify(payload),
  );
  if (duplicate) return;

  // Ограничение размера очереди
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift(); // убираем самый старый
  }

  queue.push({
    id: makeId(),
    type,
    payload,
    createdAt: Date.now(),
    retries: 0,
    ownerUid,
  });

  await saveQueue(queue);
};

// ─── Выполнение одного действия ───────────────────────────────────────────────

const executeQueueItem = async (item: BonusQueueItem): Promise<boolean> => {
  try {
    switch (item.type) {
      case 'help_respond':
        await awardHelpRespondBonus(item.payload.requestId);
        break;
      case 'close_request':
        await closeRequestWithBonus(item.payload.requestId);
        break;
      case 'confirm_helper':
        await confirmHelperForRequest(item.payload.requestId, item.payload.helperUid);
        break;
      case 'gratitude':
        await awardGratitudeBonus(item.payload.requestId, item.payload.helperUid);
        break;
      case 'profile_thanks':
        await awardProfileThanksBonus(item.payload.targetUid);
        break;
      case 'milestone':
        await awardMilestoneBonus(
          item.payload.milestone as 'profile_complete' | 'first_request' | 'first_response',
        );
        break;
      default:
        return true; // неизвестный тип — убираем из очереди
    }
    return true;
  } catch (error: unknown) {
    // Идемпотентные ответы ("already_*") — считаем успехом, убираем из очереди
    const msg = String((error as { message?: string })?.message || '').toLowerCase();
    if (
      msg.includes('already') ||
      msg.includes('already_helped') ||
      msg.includes('already_closed') ||
      msg.includes('already_responded')
    ) {
      return true;
    }
    return false;
  }
};

// ─── Дренирование очереди ─────────────────────────────────────────────────────

let isDraining = false;

export const drainBonusQueue = async (): Promise<void> => {
  if (isDraining) return;

  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;

  isDraining = true;
  try {
    let queue = await loadQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    const uid = user.uid;

    // Фильтруем: только действия этого юзера, не просроченные, с запасом ретраев
    const eligible = queue.filter(
      (item) =>
        item.ownerUid === uid &&
        now - item.createdAt < MAX_TTL_MS &&
        item.retries < MAX_RETRY_COUNT,
    );

    // Удаляем просроченные и чужие из очереди
    queue = queue.filter(
      (item) =>
        item.ownerUid === uid &&
        now - item.createdAt < MAX_TTL_MS &&
        item.retries < MAX_RETRY_COUNT,
    );

    const processed: string[] = [];
    const failed: string[] = [];

    for (const item of eligible) {
      const ok = await executeQueueItem(item);
      if (ok) {
        processed.push(item.id);
      } else {
        failed.push(item.id);
      }
    }

    // Убираем успешные, инкрементируем ретраи провалившихся
    const remaining = queue
      .filter((item) => !processed.includes(item.id))
      .map((item) =>
        failed.includes(item.id) ? { ...item, retries: item.retries + 1 } : item,
      );

    await saveQueue(remaining);
  } finally {
    isDraining = false;
  }
};

// ─── Очистка очереди при логауте ──────────────────────────────────────────────

export const clearBonusQueueForUser = async (uid: string): Promise<void> => {
  const queue = await loadQueue();
  const remaining = queue.filter((item) => item.ownerUid !== uid);
  await saveQueue(remaining);
};

// ─── Хелпер: попробовать сразу или поставить в очередь ───────────────────────
//
//   Используется в хендлерах:
//     const queued = await tryBonusOrEnqueue(
//       { type: 'close_request', payload: { requestId } },
//       () => closeRequestWithBonus(requestId),
//     );
//     if (queued) Toast.show({ type: 'info', text1: 'Буде зараховано після синхронізації' });

export const tryBonusOrEnqueue = async (
  queueItem: { type: BonusQueueItemType; payload: Record<string, string> },
  fn: () => Promise<unknown>,
): Promise<boolean> => {
  const user = auth.currentUser;

  if (user && !user.isAnonymous) {
    // Firebase Auth готов — вызываем напрямую, очередь не нужна
    await fn();
    return false;
  }

  // Auth не готов — ставим в очередь
  await enqueueBonusAction(queueItem.type, queueItem.payload);
  return true; // true = действие поставлено в очередь
};

/**
 * Оптимистичный вариант: немедленно ставит действие в очередь,
 * затем запускает дренирование в фоне (fire-and-forget).
 * Никогда не бросает ошибок — UI всегда показывает успех.
 */
export const enqueueAndDrainAsync = (
  type: BonusQueueItemType,
  payload: Record<string, string>,
): void => {
  enqueueBonusAction(type, payload)
    .then(() => drainBonusQueue())
    .catch(() => {}); // тихий сбой — очередь сохранится и дренируется при следующем старте
};
