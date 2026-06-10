import { get, ref, query, orderByChild, limitToLast } from 'firebase/database';
import { database } from '../firebase/firebase';

export type FeatureRatingSummary = {
  avgRating: number;
  avgUsability: number;
  avgUsefulness: number;
  totalVotes: number;
  monthlyAvg: number;
  monthlyVotes: number;
  lastUpdated: number;
};

export type FeatureRatingEntry = {
  screenId: string;
  rating: number;
  ratingUsability: number;
  ratingUsefulness: number;
  comment: string | null;
  platform: 'android' | 'ios';
  appVersion: string;
  createdAt: number;
};

export type StarDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type MonthlyPoint = {
  month: string; // "2026-06"
  avgRating: number;
  votes: number;
};

export type ScreenAnalytics = {
  entries: FeatureRatingEntry[];
  starDistribution: StarDistribution;
  monthlyTrend: MonthlyPoint[];
  androidCount: number;
  iosCount: number;
  withCommentCount: number;
};

export async function fetchAllSummaries(): Promise<Record<string, FeatureRatingSummary>> {
  const snapshot = await get(ref(database, 'feature_ratings_summary'));
  return (snapshot.val() as Record<string, FeatureRatingSummary> | null) ?? {};
}

export async function fetchComments(screenId: string, limit = 30): Promise<FeatureRatingEntry[]> {
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

  entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return entries;
}

/** Fetches all entries for a screen and computes full analytics */
export async function fetchScreenAnalytics(screenId: string): Promise<ScreenAnalytics> {
  // Fetch all entries (no limit — needed for accurate stats)
  const snapshot = await get(ref(database, `feature_ratings/${screenId}`));
  const entries: FeatureRatingEntry[] = [];

  if (snapshot.exists()) {
    snapshot.forEach((child) => {
      const val = child.val() as FeatureRatingEntry | null;
      if (val && typeof val.rating === 'number') {
        entries.push({ ...val, screenId });
      }
    });
  }

  entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Star distribution
  const starDistribution: StarDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let androidCount = 0;
  let iosCount = 0;
  let withCommentCount = 0;

  for (const e of entries) {
    const star = Math.round(e.rating) as 1 | 2 | 3 | 4 | 5;
    if (star >= 1 && star <= 5) starDistribution[star]++;
    if (e.platform === 'android') androidCount++;
    else iosCount++;
    if (e.comment?.trim()) withCommentCount++;
  }

  // Monthly trend
  const monthMap: Record<string, { sum: number; count: number }> = {};
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) monthMap[key] = { sum: 0, count: 0 };
    monthMap[key].sum += e.rating;
    monthMap[key].count++;
  }

  const monthlyTrend: MonthlyPoint[] = Object.entries(monthMap)
    .map(([month, { sum, count }]) => ({
      month,
      avgRating: Math.round((sum / count) * 100) / 100,
      votes: count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { entries, starDistribution, monthlyTrend, androidCount, iosCount, withCommentCount };
}
