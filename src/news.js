import axios from 'axios';
import Parser from 'rss-parser';
import { ACTIVE_RSS_SOURCES } from './sources.js';

const parser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'ChaikaUA-NewsBot/1.0 (+https://chaika-ua.netlify.app)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: ['content:encoded', 'description'],
  },
});

const LOCAL_KEYWORDS = [
  'чайка',
  'жк чайка',
  'буча',
  'бучан',
  'софіївська борщагівка',
  'софиевская борщаговка',
  'житомирська траса',
  'житомирское шоссе',
  'київ',
  'киев',
  'київська область',
  'киевская область',
];

const IMPACT_KEYWORDS = [
  'світло',
  'електро',
  'відключ',
  'вода',
  'тепло',
  'жкг',
  'комунал',
  'перекрит',
  'рух',
  'транспорт',
  'авар',
  'безпек',
  'безопас',
  'укрит',
  'тривог',
  'погод',
  'інфраструкт',
  'медицина',
  'школ',
  'садок',
];

const BLOCK_KEYWORDS = [
  'сша',
  'евросоюз',
  'nato',
  'нато',
  'ізраїл',
  'израиль',
  'сирія',
  'сирия',
  'китай',
  'африка',
  'європа',
  'европа',
  'криптовалют',
  'біткоїн',
  'биткоин',
  'шоубіз',
  'шоубизнес',
];

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildItemText(item) {
  return normalizeText(`${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`);
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function scoreItem(item) {
  const text = buildItemText(item);
  let score = 0;

  if (containsAny(text, LOCAL_KEYWORDS)) score += 3;
  if (containsAny(text, IMPACT_KEYWORDS)) score += 2;
  if (containsAny(text, BLOCK_KEYWORDS)) score -= 4;
  if (/повітрян|тривог|обстріл|дтп|авар|відключ|ремонт|перекрит/i.test(text)) score += 1;

  return score;
}

export function isRelevantNews(item) {
  const text = buildItemText(item);
  const hasLocal = containsAny(text, LOCAL_KEYWORDS);
  const hasImpact = containsAny(text, IMPACT_KEYWORDS);
  const blocked = containsAny(text, BLOCK_KEYWORDS);
  if (blocked && !hasLocal) return false;
  return hasLocal || (hasImpact && /\bкиїв|киев|область|обл\b/i.test(text));
}

function normalizeDate(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.date;
  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function cleanItem(item, sourceUrl) {
  const sourceHost = (() => {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      return sourceUrl;
    }
  })();

  return {
    title: String(item.title || '').trim(),
    link: String(item.link || '').trim(),
    source: sourceHost,
    date: normalizeDate(item),
    contentSnippet: String(item.contentSnippet || '').trim(),
    content: String(item['content:encoded'] || item.content || item.description || '').trim(),
  };
}

async function readSource(rssUrl) {
  try {
    const response = await axios.get(rssUrl, {
      timeout: 12000,
      headers: {
        'User-Agent': 'ChaikaUA-NewsBot/1.0 (+https://chaika-ua.netlify.app)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      responseType: 'text',
    });
    const feed = await parser.parseString(String(response.data || ''));
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map((item) => cleanItem(item, rssUrl));
  } catch (error) {
    console.log(`[news] failed ${rssUrl}: ${error.message}`);
    return [];
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\wа-яёіїєґ\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function dedupe(items) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const item of items) {
    const linkKey = (item.link || '').toLowerCase().trim();
    const titleKey = normalizeTitle(item.title);
    if (!titleKey) continue;
    if (linkKey && seenLinks.has(linkKey)) continue;
    if (seenTitles.has(titleKey)) continue;
    if (linkKey) seenLinks.add(linkKey);
    seenTitles.add(titleKey);
    out.push(item);
  }
  return out;
}

export async function getLatestNews(limit = 10) {
  const sourceUrls = ACTIVE_RSS_SOURCES.filter(Boolean);
  const loaded = await Promise.all(sourceUrls.map((url) => readSource(url)));
  const flattened = loaded.flat();

  const relevant = flattened
    .filter((item) => item.title && item.link)
    .filter((item) => isRelevantNews(item))
    .map((item) => ({ ...item, _score: scoreItem(item) }));

  const sorted = dedupe(relevant)
    .sort((a, b) => {
      const byScore = b._score - a._score;
      if (byScore !== 0) return byScore;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    })
    .slice(0, Math.max(1, limit))
    .map(({ _score, ...item }) => item);

  for (const url of sourceUrls) {
    const count = sorted.filter((item) => item.link.includes(new URL(url).hostname)).length;
    console.log(`[news] source ${url} -> ${count} relevant`);
  }

  return sorted;
}
