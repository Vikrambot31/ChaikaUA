/**
 * rateLimiter.ts - in-memory rate limiting for forms, persisted to AsyncStorage.
 *
 * Timestamps survive app restarts: recordSubmit() saves to AsyncStorage,
 * and each limiter restores its timestamp on module load.
 *
 * Usage:
 *   if (RATE_LIMITERS.helpRequest.cooldownSecondsLeft() > 0) { ... }
 *   RATE_LIMITERS.helpRequest.recordSubmit();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@chaika:rate_limiter:v1:';
const lastSubmitTimes: Record<string, number> = {};

export interface RateLimiter {
  /** Checks whether the form can be submitted now. */
  canSubmit: () => boolean;
  /** Returns remaining cooldown in seconds, or 0 if submit is allowed. */
  cooldownSecondsLeft: () => number;
  /** Records a submit timestamp. */
  recordSubmit: () => void;
}

/**
 * Simple rate limiter for a concrete form.
 * @param key Unique form key
 * @param cooldownMs Minimum interval between submits, in ms
 */
export function createRateLimiter(key: string, cooldownMs: number): RateLimiter {
  // Restore persisted timestamp on module load (fire-and-forget)
  void AsyncStorage.getItem(STORAGE_PREFIX + key).then((stored) => {
    if (stored && !lastSubmitTimes[key]) {
      const ts = Number(stored);
      if (!isNaN(ts) && ts > 0) lastSubmitTimes[key] = ts;
    }
  }).catch(() => {});

  return {
    canSubmit() {
      const last = lastSubmitTimes[key];
      if (!last) return true;
      return Date.now() - last >= cooldownMs;
    },
    cooldownSecondsLeft() {
      const last = lastSubmitTimes[key];
      if (!last) return 0;
      const remaining = cooldownMs - (Date.now() - last);
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    },
    recordSubmit() {
      const now = Date.now();
      lastSubmitTimes[key] = now;
      void AsyncStorage.setItem(STORAGE_PREFIX + key, String(now)).catch(() => {});
    },
  };
}

// Pre-built limiters for known forms
export const RATE_LIMITERS = {
  helpRequest: createRateLimiter('help_request', 30_000),      // 30 sec
  requestForm: createRateLimiter('request_form', 60_000),      // 1 min
  lostFound: createRateLimiter('lost_found', 120_000),          // 2 min
  buySell: createRateLimiter('buy_sell', 120_000),              // 2 min
  contacts: createRateLimiter('contacts', 120_000),             // 2 min
  osbbCollection: createRateLimiter('osbb_collection', 60_000), // 1 min
  osbbTopic: createRateLimiter('osbb_topic', 30_000),           // 30 sec
  profileViewRequest: createRateLimiter('profile_view_request', 30_000), // 30 sec
} as const;
