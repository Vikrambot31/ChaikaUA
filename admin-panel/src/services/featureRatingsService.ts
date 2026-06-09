import { get, ref, query, orderByChild, limitToLast } from 'firebase/database';
import { database } from '../firebase/firebase';

export type FeatureRatingSummary = {
  avgRating: number;
  totalVotes: number;
  monthlyAvg: number;
  monthlyVotes: number;
  lastUpdated: number;
};

export type FeatureRatingEntry = {
  screenId: string;
  rating: number;
  comment: string | null;
  platform: 'android' | 'ios';
  appVersion: string;
  createdAt: number;
};

export async function fetchAllSummaries(): Promise<Record<string, FeatureRatingSummary>> {
  const snapshot = await get(ref(database, 'feature_ratings_summary'));
  return (snapshot.val() as Record<string, FeatureRatingSummary> | null) ?? {};
}

export async function fetchComments(screenId: string, limit = 20): Promise<FeatureRatingEntry[]> {
  const q = query(
    ref(database, `feature_ratings/${screenId}`),
    orderByChild('createdAt'),
    limitToLast(limit),
  );
  const snapshot = await get(q);
  const entries: FeatureRatingEntry[] = [];

  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      const val = child.val() as FeatureRatingEntry | null;
      if (val && typeof val.rating === 'number') {
        entries.push({ ...val, screenId });
      }
    });
  }

  // Newest first
  entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return entries;
}
