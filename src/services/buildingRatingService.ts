import { onValue, ref, runTransaction } from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth, requireWriteSession } from '../firebase-auth-session';

export type BuildingRatingCategoryKey = 'cleaning' | 'elevator' | 'electricity' | 'services';

export type UserBuildingRating = Record<BuildingRatingCategoryKey, number> & {
  ratedAt: string;
};

export type BuildingRatingValue = {
  cleaning: number;
  elevator: number;
  electricity: number;
  services: number;
  votes: number;
  complaints: number;
  voterIds?: Record<string, string>;
  voterRatings?: Record<string, UserBuildingRating>;
  updatedAt?: string;
};

export type BuildingRatingsByBuilding = Record<string, BuildingRatingValue>;

const PATH = 'stats/building_ratings';

const emptyRating = (): BuildingRatingValue => ({
  cleaning: 0,
  elevator: 0,
  electricity: 0,
  services: 0,
  votes: 0,
  complaints: 0,
  voterIds: {},
  voterRatings: {},
});

const normalizeNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const normalizeRating = (value: unknown): BuildingRatingValue => {
  const raw = value && typeof value === 'object' ? value as Partial<BuildingRatingValue> : {};
  const voterIds = raw.voterIds && typeof raw.voterIds === 'object' ? raw.voterIds : {};
  const voterRatings = raw.voterRatings && typeof raw.voterRatings === 'object' ? raw.voterRatings : {};

  return {
    cleaning: normalizeNumber(raw.cleaning),
    elevator: normalizeNumber(raw.elevator),
    electricity: normalizeNumber(raw.electricity),
    services: normalizeNumber(raw.services),
    votes: normalizeNumber(raw.votes),
    complaints: normalizeNumber(raw.complaints),
    voterIds,
    voterRatings,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
};

export const getLocalDateKey = (value: Date | string = new Date()): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getUserBuildingRating = (
  rating: BuildingRatingValue | null | undefined,
  userId: string | null | undefined,
): UserBuildingRating | null => {
  if (!rating || !userId) return null;
  const stored = rating.voterRatings?.[userId];
  if (stored) return stored;
  const legacyRatedAt = rating.voterIds?.[userId];
  return legacyRatedAt ? {
    cleaning: 0,
    elevator: 0,
    electricity: 0,
    services: 0,
    ratedAt: legacyRatedAt,
  } : null;
};

export const canSubmitBuildingRatingToday = (
  rating: BuildingRatingValue | null | undefined,
  userId: string | null | undefined,
): boolean => {
  const userRating = getUserBuildingRating(rating, userId);
  if (!userRating?.ratedAt) return true;
  return getLocalDateKey(userRating.ratedAt) !== getLocalDateKey();
};

const replaceAverageValue = (average: number, votes: number, previousValue: number, nextValue: number): number => {
  if (votes <= 0) return nextValue;
  return Math.max(0, Math.min(5, (average * votes - previousValue + nextValue) / votes));
};

export const subscribeBuildingRatings = (
  callback: (ratings: BuildingRatingsByBuilding) => void,
  onError?: (error: unknown) => void,
): (() => void) => {
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  void ensureFirebaseAuth().then(() => {
    if (disposed) return;
    unsubscribe = onValue(ref(database, PATH), (snapshot) => {
      if (disposed) return;
      const raw = snapshot.val();
      if (!raw || typeof raw !== 'object') {
        callback({});
        return;
      }

      const ratings: BuildingRatingsByBuilding = {};
      Object.entries(raw as Record<string, unknown>).forEach(([buildingId, value]) => {
        ratings[buildingId] = normalizeRating(value);
      });
      callback(ratings);
    }, (error) => {
      if (!disposed) {
        callback({});
        onError?.(error);
      }
    });
  }).catch((error) => {
    if (!disposed) {
      callback({});
      onError?.(error);
    }
  });

  return () => {
    disposed = true;
    unsubscribe?.();
  };
};

export const submitBuildingRating = async (
  buildingId: string,
  ratings: Record<BuildingRatingCategoryKey, number>,
  expectedUserId?: string | null,
): Promise<void> => {
  const user = await requireWriteSession({
    expectedUserId,
    operation: 'submit_building_rating',
    screen: 'Reyting-Domov',
    requireRealUser: true,
  });
  const userId = String(user.uid);
  const now = new Date().toISOString();
  const itemRef = ref(database, `${PATH}/${buildingId}`);
  let transactionError: Error | null = null;

  const result = await runTransaction(itemRef, (current: BuildingRatingValue | null) => {
    const previous = normalizeRating(current ?? emptyRating());
    const previousUserRating = getUserBuildingRating(previous, userId);
    if (previousUserRating?.ratedAt && getLocalDateKey(previousUserRating.ratedAt) === getLocalDateKey(now)) {
      transactionError = new Error('already-voted-today');
      return current;
    }

    const previousVotes = Math.max(0, previous.votes || 0);
    const canReplacePrevious = Boolean(previousUserRating && previousUserRating.cleaning > 0);
    const nextVotes = canReplacePrevious ? Math.max(1, previousVotes) : previousVotes + 1;
    const nextUserRating: UserBuildingRating = {
      cleaning: ratings.cleaning,
      elevator: ratings.elevator,
      electricity: ratings.electricity,
      services: ratings.services,
      ratedAt: now,
    };

    return {
      ...previous,
      cleaning: canReplacePrevious
        ? replaceAverageValue(previous.cleaning, nextVotes, previousUserRating!.cleaning, ratings.cleaning)
        : (previous.cleaning * previousVotes + ratings.cleaning) / nextVotes,
      elevator: canReplacePrevious
        ? replaceAverageValue(previous.elevator, nextVotes, previousUserRating!.elevator, ratings.elevator)
        : (previous.elevator * previousVotes + ratings.elevator) / nextVotes,
      electricity: canReplacePrevious
        ? replaceAverageValue(previous.electricity, nextVotes, previousUserRating!.electricity, ratings.electricity)
        : (previous.electricity * previousVotes + ratings.electricity) / nextVotes,
      services: canReplacePrevious
        ? replaceAverageValue(previous.services, nextVotes, previousUserRating!.services, ratings.services)
        : (previous.services * previousVotes + ratings.services) / nextVotes,
      votes: nextVotes,
      voterIds: {
        ...(previous.voterIds || {}),
        [userId]: now,
      },
      voterRatings: {
        ...(previous.voterRatings || {}),
        [userId]: nextUserRating,
      },
      updatedAt: now,
    };
  });

  if (transactionError) {
    throw transactionError;
  }

  if (!result.committed) {
    throw new Error('rating-not-committed');
  }
};
