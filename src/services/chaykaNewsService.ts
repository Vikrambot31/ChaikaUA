import { sanitizeStoredText } from '../utils/textUtils';
import { filterChaykaNews, summarizeChaykaNews, type ChaykaNewsCandidate } from './chaykaNewsIntelligence';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { get, limitToLast, orderByChild, query, ref } from 'firebase/database';
import { database } from '../firebase-core';

export type ChaykaNewsPriority = 'urgent' | 'important' | 'info';

export type ChaykaNewsItem = {
  id: string;
  title: string;
  shortText: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  priority: ChaykaNewsPriority;
  aiGenerated: boolean;
};

export type ChaykaNewsFeedItem = ChaykaNewsItem & {
  body: string;
  date: string;
};

export type ChaykaNewsLoadStatus = 'remote' | 'cache' | 'empty' | 'unavailable';

export type ChaykaNewsFeedResult = {
  items: ChaykaNewsFeedItem[];
  status: ChaykaNewsLoadStatus;
  fromCache: boolean;
};

export type ChaykaNewsFeedListener = (result: ChaykaNewsFeedResult) => void;
export type ChaykaNewsFeedErrorListener = (error: unknown) => void;

type RawChaykaNewsItem = Partial<Omit<ChaykaNewsItem, 'priority' | 'aiGenerated'>> & {
  priority?: string;
  aiGenerated?: boolean;
  body?: string;
  date?: string;
  createdAt?: number;
};

const CHAYKA_NEWS_CACHE_KEY = 'chayka_news_cache_v1';
const DEFAULT_CHAYKA_NEWS_URL = 'https://raw.githubusercontent.com/Vikrambot31/ChaikaUA/main/data/feed.json';
const DEFAULT_CHAYKA_NEWS_CDN_URL = 'https://cdn.jsdelivr.net/gh/Vikrambot31/ChaikaUA@main/data/feed.json';
const CHAYKA_NEWS_DB_PATH = 'chayka_news/publications';
const CHAYKA_NEWS_TIMEOUT_MS = 6500;
const CHAYKA_NEWS_ACTIVE_LIMIT = 200;
const CHAYKA_NEWS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHAYKA_NEWS_POLL_MS = Math.max(
  30_000,
  Number(process.env.EXPO_PUBLIC_CHAYKA_NEWS_POLL_MS || 60_000) || 60_000
);
const CHAYKA_NEWS_SOURCE_URLS = [
  process.env.EXPO_PUBLIC_CHAYKA_NEWS_URL,
  process.env.EXPO_PUBLIC_CHAYKA_NEWS_RSS_URL,
  process.env.EXPO_PUBLIC_CHAYKA_NEWS_JSON_URL,
  DEFAULT_CHAYKA_NEWS_URL,
  DEFAULT_CHAYKA_NEWS_CDN_URL,
]
  .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  .map((value) => value.trim())
  .filter((value, index, urls) => urls.indexOf(value) === index);

const isPriority = (value: string | undefined): value is ChaykaNewsPriority =>
  value === 'urgent' || value === 'important' || value === 'info';

const makeStableId = (item: RawChaykaNewsItem): string => {
  const base = item.sourceUrl || `${item.sourceName || 'source'}-${item.title || ''}-${item.publishedAt || ''}`;
  return `chayka-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
};

const getTimestamp = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatNewsDate = (value: string): string => {
  const time = getTimestamp(value);
  return time > 0 ? new Date(time).toLocaleDateString('uk-UA') : '';
};

const withCacheBust = (url: string): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_chaika_ts=${Date.now()}`;
};

const fetchTextWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAYKA_NEWS_TIMEOUT_MS);

  try {
    return await fetch(withCacheBust(url), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json, application/rss+xml, text/xml, application/xml, text/plain',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const normalizeChaykaNews = (items: RawChaykaNewsItem[]): ChaykaNewsItem[] => {
  const seen = new Set<string>();

  return items
    .map((item) => {
      const sourceUrl = typeof item.sourceUrl === 'string' ? item.sourceUrl.trim() : '';
      const shortText = sanitizeStoredText(item.shortText || item.body || '');
      const publishedAt = typeof item.publishedAt === 'string'
        ? item.publishedAt
        : typeof item.date === 'string'
          ? item.date
          : new Date().toISOString();
      const normalized: ChaykaNewsItem = {
        id: sanitizeStoredText(item.id || makeStableId(item)),
        title: sanitizeStoredText(item.title || 'Новини Чайки'),
        shortText,
        sourceName: sanitizeStoredText(item.sourceName || 'Джерело не вказано'),
        sourceUrl,
        publishedAt,
        priority: isPriority(item.priority) ? item.priority : 'info',
        aiGenerated: item.aiGenerated ?? true,
      };

      return normalized;
    })
    .filter((item) => {
      const publishedAt = getTimestamp(item.publishedAt);
      if (publishedAt > 0 && publishedAt + CHAYKA_NEWS_TTL_MS < Date.now()) {
        return false;
      }
      const dedupeKey = item.id || item.sourceUrl || `${item.title}-${item.publishedAt}`;
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return item.shortText.length > 0;
    })
    .sort((a, b) => getTimestamp(b.publishedAt) - getTimestamp(a.publishedAt))
    .slice(0, CHAYKA_NEWS_ACTIVE_LIMIT);
};

export const loadChaykaNewsDetailed = async (): Promise<{ status: ChaykaNewsLoadStatus; fromCache: boolean; items: ChaykaNewsItem[] }> => {
  const remote = await loadChaykaNewsFromRemote();
  if (remote.status === 'success') {
    if (remote.items.length > 0) {
      await persistChaykaNewsCache(remote.items);
      return { status: 'remote', fromCache: false, items: remote.items };
    }
    // Remote returned 200 OK but items array is empty — still check database and cache.
  }

  const database = await loadChaykaNewsFromDatabase();
  if (database.items.length > 0) {
    await persistChaykaNewsCache(database.items);
    return { status: 'remote', fromCache: false, items: database.items };
  }

  const cached = await loadChaykaNewsFromCache();
  if (cached.length > 0) {
    return { status: 'cache', fromCache: true, items: cached };
  }

  // If at least one source was reachable (remote responded with 200, or DB connected but was empty)
  // → data simply doesn't exist yet; show "no news" rather than a connection error.
  const anyReachable = remote.status === 'success' || database.reachable;
  return { status: anyReachable ? 'empty' : 'unavailable', fromCache: false, items: [] };
};

export const loadChaykaNews = async (): Promise<ChaykaNewsItem[]> => {
  const result = await loadChaykaNewsDetailed();
  return result.items;
};

export const loadChaykaNewsFeed = async (): Promise<ChaykaNewsFeedItem[]> => {
  const result = await loadChaykaNewsFeedDetailed();
  return result.items;
};

export const loadChaykaNewsFeedDetailed = async (): Promise<ChaykaNewsFeedResult> => {
  const result = await loadChaykaNewsDetailed();

  return {
    status: result.status,
    fromCache: result.fromCache,
    items: result.items.map((item) => ({
      ...item,
      body: item.shortText,
      date: formatNewsDate(item.publishedAt),
    })),
  };
};

const getFeedSignature = (result: ChaykaNewsFeedResult): string =>
  `${result.status}:${result.items.map((item) => `${item.id}:${item.publishedAt}`).join('|')}`;

export const subscribeChaykaNewsFeedRealtime = (
  onUpdate: ChaykaNewsFeedListener,
  onError?: ChaykaNewsFeedErrorListener,
  pollMs = CHAYKA_NEWS_POLL_MS
): (() => void) => {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSignature = '';

  const tick = async () => {
    try {
      const result = await loadChaykaNewsFeedDetailed();
      const signature = getFeedSignature(result);
      if (signature !== lastSignature) {
        lastSignature = signature;
        onUpdate(result);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  void tick();
  timer = setInterval(() => {
    if (!stopped && AppState.currentState === 'active') {
      void tick();
    }
  }, pollMs);
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (!stopped && state === 'active') {
      void tick();
    }
  });

  return () => {
    stopped = true;
    appStateSubscription.remove();
    if (timer) {
      clearInterval(timer);
    }
  };
};

export const buildTelegramPost = (item: ChaykaNewsItem): string => {
  const sourceLine = item.sourceUrl ? `Джерело: ${item.sourceName} ${item.sourceUrl}` : `Джерело: ${item.sourceName}`;
  return `${item.title}\n\n${item.shortText}\n\n${sourceLine}`;
};

const normalizeRemotePayload = (payload: unknown): RawChaykaNewsItem[] => {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.filter(Boolean) as RawChaykaNewsItem[];
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items.filter(Boolean) as RawChaykaNewsItem[];
    }
    if (Array.isArray(record.data)) {
      return record.data.filter(Boolean) as RawChaykaNewsItem[];
    }
  }

  return [];
};

const mapDatabasePublication = ([id, item]: [string, RawChaykaNewsItem]): RawChaykaNewsItem => {
  const publishedAt = typeof item.publishedAt === 'string'
    ? item.publishedAt
    : typeof item.createdAt === 'number'
      ? new Date(item.createdAt).toISOString()
      : typeof item.date === 'string'
        ? item.date
        : new Date().toISOString();

  return {
    ...item,
    id: item.id || id,
    publishedAt,
  };
};

const loadChaykaNewsFromDatabase = async (): Promise<{ items: ChaykaNewsItem[]; reachable: boolean }> => {
  try {
    const snapshot = await get(query(ref(database, CHAYKA_NEWS_DB_PATH), orderByChild('createdAt'), limitToLast(CHAYKA_NEWS_ACTIVE_LIMIT)));
    const raw = snapshot.val() as Record<string, RawChaykaNewsItem> | null;
    if (!raw) return { items: [], reachable: true };

    return { items: normalizeChaykaNews(Object.entries(raw).map((entry) => mapDatabasePublication(entry))), reachable: true };
  } catch {
    return { items: [], reachable: false };
  }
};

const loadChaykaNewsFromRemote = async (): Promise<{ status: 'success' | 'unavailable'; items: ChaykaNewsItem[] }> => {
  for (const url of CHAYKA_NEWS_SOURCE_URLS) {
    try {
      const response = await fetchTextWithTimeout(url);
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      let rawItems: RawChaykaNewsItem[] = [];
      if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const parsed = JSON.parse(text) as unknown;
        rawItems = normalizeRemotePayload(parsed);
      } else {
        // Minimal RSS/Atom fallback: keep the payload as one summarized item if no JSON parser is available.
        rawItems = [{
          id: `remote-${Date.now()}`,
          title: 'Новини Чайки',
          shortText: sanitizeStoredText(text).slice(0, 220),
          sourceName: new URL(url).hostname,
          sourceUrl: url,
          publishedAt: new Date().toISOString(),
          priority: 'info',
          aiGenerated: true,
        }];
      }

      const normalized = normalizeChaykaNews(rawItems.map((item) => ({
        ...item,
        sourceUrl: item.sourceUrl || url,
        sourceName: item.sourceName || new URL(url).hostname,
      })));

      return { status: 'success', items: normalized };
    } catch {
      continue;
    }
  }

  return { status: 'unavailable', items: [] };
};

const persistChaykaNewsCache = async (items: ChaykaNewsItem[]) => {
  try {
    await AsyncStorage.setItem(CHAYKA_NEWS_CACHE_KEY, JSON.stringify(items));
  } catch {
    // Ignore cache write failures.
  }
};

const loadChaykaNewsFromCache = async (): Promise<ChaykaNewsItem[]> => {
  try {
    const value = await AsyncStorage.getItem(CHAYKA_NEWS_CACHE_KEY);
    if (!value) return [];

    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return normalizeChaykaNews(parsed as RawChaykaNewsItem[]);
  } catch {
    return [];
  }
};

export const processChaykaCandidates = (items: ChaykaNewsCandidate[]) => {
  const filtered = filterChaykaNews(items);

  return filtered.map((item, index) => {
    const summary = summarizeChaykaNews(item);
    const priority: ChaykaNewsPriority = item.score >= 60 ? 'important' : 'info';
    const id = makeStableId({
      sourceUrl: summary.sourceUrl || item.sourceUrl || '',
      sourceName: summary.sourceName,
      title: summary.title,
      publishedAt: item.publishedAt ?? new Date().toISOString(),
    });
    return {
      id: id || `chayka-auto-${index}`,
      title: summary.title,
      shortText: summary.shortText,
      sourceName: summary.sourceName,
      sourceUrl: summary.sourceUrl || item.sourceUrl || '',
      publishedAt: item.publishedAt ?? new Date().toISOString(),
      priority,
      aiGenerated: true,
      topics: summary.topics,
      prompt: summary.prompt,
      telegramPost: buildTelegramPost({
        id: id || `chayka-auto-${index}`,
        title: summary.title,
        shortText: summary.shortText,
        sourceName: summary.sourceName,
        sourceUrl: summary.sourceUrl || item.sourceUrl || '',
        publishedAt: item.publishedAt ?? new Date().toISOString(),
        priority,
        aiGenerated: true,
      }),
    };
  });
};
