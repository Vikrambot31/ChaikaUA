/**
 * rateLimiter.ts - simple in-memory rate limiting for forms.
 *
 * Stores the last submit timestamp by key. Counters reset after app restart.
 *
 * Usage:
 *   const limiter = useRateLimiter('help_request', 60_000); // 1 min cooldown
 *   if (!limiter.canSubmit()) { ... show cooldown message ... }
 *   await limiter.recordSubmit();
 */

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
      lastSubmitTimes[key] = Date.now();
    },
  };
}

// Pre-built limiters for known forms
export const RATE_LIMITERS = {
  helpRequest: createRateLimiter('help_request', 60_000),      // 1 min
  lostFound: createRateLimiter('lost_found', 120_000),          // 2 min
  buySell: createRateLimiter('buy_sell', 120_000),              // 2 min
  contacts: createRateLimiter('contacts', 120_000),             // 2 min
  osbbCollection: createRateLimiter('osbb_collection', 60_000), // 1 min
  osbbTopic: createRateLimiter('osbb_topic', 30_000),           // 30 sec
} as const;
