/**
 * rateLimiter.ts вЂ” РїСЂРѕСЃС‚РѕР№ rate limiting РґР»СЏ С„РѕСЂРј.
 *
 * РҐСЂР°РЅРёС‚ timestamp РїРѕСЃР»РµРґРЅРµР№ РѕС‚РїСЂР°РІРєРё РїРѕ РєР»СЋС‡Сѓ РІ РїР°РјСЏС‚Рё.
 * РџРѕСЃР»Рµ СЂРµСЃС‚Р°СЂС‚Р° РїСЂРёР»РѕР¶РµРЅРёСЏ СЃС‡С‘С‚С‡РёРєРё СЃР±СЂР°СЃС‹РІР°СЋС‚СЃСЏ (СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ).
 *
 * РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:
 *   const limiter = useRateLimiter('help_request', 60_000); // 1 РјРёРЅ cooldown
 *   if (!limiter.canSubmit()) { ... show cooldown message ... }
 *   await limiter.recordSubmit();
 */

const lastSubmitTimes: Record<string, number> = {};

export interface RateLimiter {
  /** РџСЂРѕРІРµСЂСЏРµС‚, РјРѕР¶РЅРѕ Р»Рё РѕС‚РїСЂР°РІРёС‚СЊ С„РѕСЂРјСѓ РїСЂСЏРјРѕ СЃРµР№С‡Р°СЃ */
  canSubmit: () => boolean;
  /** Р’РѕР·РІСЂР°С‰Р°РµС‚ РѕСЃС‚Р°РІС€РµРµСЃСЏ РІСЂРµРјСЏ РѕР¶РёРґР°РЅРёСЏ РІ СЃРµРєСѓРЅРґР°С… (0 РµСЃР»Рё РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІР»СЏС‚СЊ) */
  cooldownSecondsLeft: () => number;
  /** Р—Р°РїРёСЃС‹РІР°РµС‚ РІСЂРµРјСЏ РїРѕСЃР»РµРґРЅРµР№ РѕС‚РїСЂР°РІРєРё */
  recordSubmit: () => void;
}

/**
 * Простий rate limiter для конкретної форми.
 * @param key     РЈРЅРёРєР°Р»СЊРЅС‹Р№ РєР»СЋС‡ С„РѕСЂРјС‹
 * @param cooldownMs РњРёРЅРёРјР°Р»СЊРЅС‹Р№ РёРЅС‚РµСЂРІР°Р» РјРµР¶РґСѓ РѕС‚РїСЂР°РІРєР°РјРё (РјСЃ)
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
  helpRequest: createRateLimiter('help_request', 60_000),      // 1 РјРёРЅ
  lostFound: createRateLimiter('lost_found', 120_000),          // 2 РјРёРЅ
  buySell: createRateLimiter('buy_sell', 120_000),              // 2 РјРёРЅ
  contacts: createRateLimiter('contacts', 120_000),             // 2 РјРёРЅ
  osbbCollection: createRateLimiter('osbb_collection', 60_000), // 1 РјРёРЅ
  osbbTopic: createRateLimiter('osbb_topic', 30_000),           // 30 СЃРµРє
} as const;
