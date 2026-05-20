export const RATING_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RatingAggregate = {
  rating: number;
  votes: number;
};

export type LastRatingMap = Record<string, string>;

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
