import { get, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp, storage } from '../firebase/firebase';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

export type TopListingStatus = 'pending' | 'approved' | 'rejected';

export type TopListingCollection = 'food_top_listings' | 'children_top_listings' | 'beauty_top_listings';

export type TopListingRecord = {
  id: string;
  collection: TopListingCollection;
  title: string;
  description: string;
  photoUri: string;
  photoStoragePath?: string;
  moderationStatus: TopListingStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt?: string;
  userId: string;
  language?: string;
};

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');

const normalizeStatus = (v: unknown): TopListingStatus => {
  if (v === 'approved' || v === 'rejected') return v;
  return 'pending';
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const normalizeRecord = (
  key: string,
  raw: unknown,
  collection: TopListingCollection,
): TopListingRecord | null => {
  if (!isRecord(raw)) return null;
  return {
    id: key,
    collection,
    title: getString(raw.title),
    description: getString(raw.description),
    photoUri: getString(raw.photoUri) || getString(raw.photoStoragePath),
    photoStoragePath: getString(raw.photoStoragePath) || undefined,
    moderationStatus: normalizeStatus(getString(raw.moderationStatus)),
    submittedForModerationAt: getString(raw.submittedForModerationAt),
    createdAt: getString(raw.createdAt),
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : undefined,
    userId: getString(raw.userId),
    language: getString(raw.language) || undefined,
  };
};

const SECTION_KEY: Record<TopListingCollection, string> = {
  food_top_listings: 'foodTopListings',
  children_top_listings: 'childrenTopListings',
  beauty_top_listings: 'beautyTopListings',
};

export const loadTopListings = async (
  collection: TopListingCollection,
): Promise<TopListingRecord[]> => {
  if (LOCAL_MODE) {
    const data = await fetch(`${LOCAL_API}/top_listings/${collection}`).then((r) =>
      r.json(),
    ) as Array<Record<string, unknown>>;
    return (data ?? []).map((r) => normalizeRecord(String(r.id), r, collection)).filter(
      (x): x is TopListingRecord => x !== null,
    );
  }

  const snap = await get(ref(database, collection));
  if (!snap.exists()) return [];

  return Object.entries(snap.val() as Record<string, unknown>)
    .map(([key, val]) => normalizeRecord(key, val, collection))
    .filter((x): x is TopListingRecord => x !== null)
    .sort((a, b) => {
      const ta = a.submittedForModerationAt || a.createdAt;
      const tb = b.submittedForModerationAt || b.createdAt;
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
};

export const approveTopListing = async (record: TopListingRecord): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/top_listings/${record.collection}/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderationStatus: 'approved' }),
    });
    return;
  }
  if (!functions) throw new Error('Firebase Functions не ініціалізовані.');
  const callable = httpsCallable<object, { ok: boolean }>(functions, 'adminModerateContentItem');
  await callable({
    section: SECTION_KEY[record.collection],
    path: `${record.collection}/${record.id}`,
    currentStatus: 'pending',
    action: 'approved',
  });
};

export const rejectTopListing = async (record: TopListingRecord, reason: string): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/top_listings/${record.collection}/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderationStatus: 'rejected', moderationReason: reason }),
    });
    return;
  }
  if (!functions) throw new Error('Firebase Functions не ініціалізовані.');
  const callable = httpsCallable<object, { ok: boolean }>(functions, 'adminModerateContentItem');
  await callable({
    section: SECTION_KEY[record.collection],
    path: `${record.collection}/${record.id}`,
    currentStatus: 'pending',
    action: 'rejected',
    reason: reason.trim() || undefined,
  });
};

export const deleteTopListing = async (record: TopListingRecord): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/top_listings/${record.collection}/${record.id}`, {
      method: 'DELETE',
    });
    return;
  }
  if (!functions) throw new Error('Firebase Functions не ініціалізовані.');
  const callable = httpsCallable<object, { ok: boolean }>(functions, 'adminDeleteContentItem');
  await callable({
    section: SECTION_KEY[record.collection],
    path: `${record.collection}/${record.id}`,
  });
};

const getStoragePath = (v: string): string | null => {
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return null;
  if (t.startsWith('file:') || t.startsWith('content:')) return null;
  if (/^(food_photos|beauty_photos|children_photos|community_photos|user_photos|uploads)\//i.test(t))
    return t;
  return null;
};

export const resolveTopListingPhotoUrl = async (record: TopListingRecord): Promise<string> => {
  const uri = record.photoUri;
  if (!uri) return '';

  if (/^https?:\/\//i.test(uri)) return uri;

  const sp = getStoragePath(record.photoStoragePath || '') || getStoragePath(uri);
  if (!sp) return uri;

  const bucket =
    typeof storage.app.options.storageBucket === 'string' ? storage.app.options.storageBucket : '';
  const encoded = sp.split('/').map(encodeURIComponent).join('%2F');
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch { /* ignore */ }

  return url;
};
