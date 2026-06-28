import {
  getRatingDaysLeft,
  canRateNow,
  addWeightedRating,
  replaceWeightedRating,
  canUseDailyRating,
  recordDailyRatingUse,
  normalizeDailyRatingUsage,
  getLocalDateKey,
  DAILY_PLACE_RATING_LIMIT,
  RATING_COOLDOWN_MS,
} from '../utils/monthlyRating';

describe('monthlyRating', () => {
  describe('getRatingDaysLeft', () => {
    it('returns 0 when no lastRatedAt is provided', () => {
      expect(getRatingDaysLeft()).toBe(0);
      expect(getRatingDaysLeft(undefined)).toBe(0);
    });

    it('returns 0 for an invalid date string', () => {
      expect(getRatingDaysLeft('not-a-date')).toBe(0);
    });

    it('returns 0 when cooldown has fully passed', () => {
      const longAgo = new Date(Date.now() - RATING_COOLDOWN_MS - 86400000).toISOString();
      expect(getRatingDaysLeft(longAgo)).toBe(0);
    });

    it('returns remaining days within cooldown', () => {
      const recent = new Date(Date.now() - 1000).toISOString();
      expect(getRatingDaysLeft(recent)).toBe(30);
    });

    it('returns 1 when less than a day remains', () => {
      const almostDone = new Date(Date.now() - RATING_COOLDOWN_MS + 3600000).toISOString();
      expect(getRatingDaysLeft(almostDone)).toBe(1);
    });
  });

  describe('canRateNow', () => {
    it('returns true when no previous rating exists', () => {
      expect(canRateNow()).toBe(true);
    });

    it('returns false during cooldown', () => {
      expect(canRateNow(new Date().toISOString())).toBe(false);
    });

    it('returns true after cooldown expires', () => {
      const expired = new Date(Date.now() - RATING_COOLDOWN_MS - 1000).toISOString();
      expect(canRateNow(expired)).toBe(true);
    });
  });

  describe('addWeightedRating', () => {
    it('calculates correct weighted average for first vote', () => {
      const result = addWeightedRating({ rating: 0, votes: 0 }, 5);
      expect(result).toEqual({ rating: 5, votes: 1 });
    });

    it('calculates correct weighted average for subsequent votes', () => {
      const result = addWeightedRating({ rating: 4, votes: 4 }, 5);
      expect(result.rating).toBeCloseTo(4.2);
      expect(result.votes).toBe(5);
    });

    it('handles NaN rating gracefully', () => {
      const result = addWeightedRating({ rating: NaN, votes: 2 }, 3);
      expect(result.rating).toBeCloseTo(1);
      expect(result.votes).toBe(3);
    });

    it('handles negative votes gracefully', () => {
      const result = addWeightedRating({ rating: 4, votes: -5 }, 3);
      expect(result.votes).toBe(1);
      expect(result.rating).toBe(3);
    });
  });

  describe('replaceWeightedRating', () => {
    it('replaces a valid previous vote', () => {
      const result = replaceWeightedRating({ rating: 4, votes: 2 }, 5, 3);
      expect(result.rating).toBeCloseTo(5);
      expect(result.votes).toBe(2);
    });

    it('falls back to addWeightedRating when previousValue is invalid', () => {
      const result = replaceWeightedRating({ rating: 4, votes: 2 }, 5, 0);
      expect(result.votes).toBe(3);
    });

    it('clamps result between 0 and 5', () => {
      const result = replaceWeightedRating({ rating: 1, votes: 1 }, 5, 1);
      expect(result.rating).toBeGreaterThanOrEqual(0);
      expect(result.rating).toBeLessThanOrEqual(5);
    });
  });

  describe('daily rating limits', () => {
    it('allows rating when no usage exists', () => {
      expect(canUseDailyRating()).toBe(true);
      expect(canUseDailyRating(null)).toBe(true);
    });

    it('resets count for stale dates', () => {
      const stale = { date: '2020-01-01', count: 100 };
      expect(canUseDailyRating(stale)).toBe(true);
    });

    it('blocks when daily limit is reached', () => {
      const today = getLocalDateKey();
      const maxed = { date: today, count: DAILY_PLACE_RATING_LIMIT };
      expect(canUseDailyRating(maxed)).toBe(false);
    });

    it('increments daily usage count', () => {
      const today = getLocalDateKey();
      const usage = { date: today, count: 2 };
      const result = recordDailyRatingUse(usage);
      expect(result.count).toBe(3);
      expect(result.date).toBe(today);
    });

    it('normalizes negative counts to 0', () => {
      const today = getLocalDateKey();
      const result = normalizeDailyRatingUsage({ date: today, count: -5 });
      expect(result.count).toBe(0);
    });
  });
});
