export const RATING_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RatingAggregate = {
  rating: number;
  votes: number;
};

export type LastRatingMap = Record<string, string>;
export type UserRatingMap = Record<string, number>;
export type DailyRatingUsage = {
  date: string;
  count: number;
};

export const DAILY_PLACE_RATING_LIMIT = 5;

export const getRatingDaysLeft = (lastRatedAt?: string): number => {
  if (!lastRatedAt) return 0;
  const lastTime = new Date(lastRatedAt).getTime();
  if (!Number.isFinite(lastTime)) return 0;

  const remaining = RATING_COOLDOWN_MS - (Date.now() - lastTime);
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : 0;
};

export const canRateNow = (lastRatedAt?: string): boolean => getRatingDaysLeft(lastRatedAt) === 0;

export const addWeightedRating = (current: RatingAggregate, value: number): RatingAggregate => {
  const votes = Math.max(0, current.votes || 0);
  const rating = Number.isFinite(current.rating) ? current.rating : 0;
  const nextVotes = votes + 1;

  return {
    rating: (rating * votes + value) / nextVotes,
    votes: nextVotes,
  };
};

export const replaceWeightedRating = (current: RatingAggregate, nextValue: number, previousValue?: number): RatingAggregate => {
  if (!previousValue || previousValue < 1 || previousValue > 5) {
    return addWeightedRating(current, nextValue);
  }

  const votes = Math.max(1, current.votes || 1);
  const rating = Number.isFinite(current.rating) ? current.rating : 0;
  const nextRating = (rating * votes - previousValue + nextValue) / votes;

  return {
    rating: Math.max(0, Math.min(5, nextRating)),
    votes,
  };
};

export const getLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeDailyRatingUsage = (usage?: DailyRatingUsage | null): DailyRatingUsage => {
  const today = getLocalDateKey();
  if (!usage || usage.date !== today) return { date: today, count: 0 };
  return { date: today, count: Math.max(0, usage.count || 0) };
};

export const canUseDailyRating = (usage?: DailyRatingUsage | null): boolean => {
  return normalizeDailyRatingUsage(usage).count < DAILY_PLACE_RATING_LIMIT;
};

export const recordDailyRatingUse = (usage?: DailyRatingUsage | null): DailyRatingUsage => {
  const normalized = normalizeDailyRatingUsage(usage);
  return { ...normalized, count: normalized.count + 1 };
};
