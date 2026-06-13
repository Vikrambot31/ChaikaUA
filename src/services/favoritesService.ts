import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@chaika_favorites';

export type FavoriteSource = 'lyudi' | 'kids' | 'food' | 'beauty' | 'sport' | 'places' | 'jobs';

export interface FavoriteItem {
  id: string;
  source: FavoriteSource;
  addedAt: number;
}

let cache: FavoriteItem[] | null = null;

async function readAll(): Promise<FavoriteItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) { cache = []; return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { cache = []; return []; }
    cache = parsed.filter(
      (item: unknown): item is FavoriteItem =>
        typeof item === 'object' && item !== null &&
        typeof (item as FavoriteItem).id === 'string' &&
        typeof (item as FavoriteItem).source === 'string' &&
        typeof (item as FavoriteItem).addedAt === 'number',
    );
    return cache;
  } catch {
    cache = [];
    return [];
  }
}

async function persist(items: FavoriteItem[]): Promise<void> {
  cache = items;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // silent — toast handled by caller
  }
}

export async function getFavorites(source?: FavoriteSource): Promise<FavoriteItem[]> {
  const all = await readAll();
  return source ? all.filter((item) => item.source === source) : all;
}

export async function isFavorite(id: string, source: FavoriteSource): Promise<boolean> {
  const all = await readAll();
  return all.some((item) => item.id === id && item.source === source);
}

export async function addFavorite(id: string, source: FavoriteSource): Promise<void> {
  const all = await readAll();
  if (all.some((item) => item.id === id && item.source === source)) return;
  await persist([...all, { id, source, addedAt: Date.now() }]);
}

export async function removeFavorite(id: string, source: FavoriteSource): Promise<void> {
  const all = await readAll();
  await persist(all.filter((item) => !(item.id === id && item.source === source)));
}

export async function toggleFavorite(id: string, source: FavoriteSource): Promise<boolean> {
  const all = await readAll();
  const exists = all.some((item) => item.id === id && item.source === source);
  if (exists) {
    await persist(all.filter((item) => !(item.id === id && item.source === source)));
    return false;
  }
  await persist([...all, { id, source, addedAt: Date.now() }]);
  return true;
}

/** Reset cache so next read fetches from disk (e.g. after focus) */
export function invalidateFavoritesCache(): void {
  cache = null;
}
