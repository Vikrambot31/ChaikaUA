import Parser from 'rss-parser';

const parser = new Parser({ timeout: 3500 });

export const RSS_FEEDS = [
  'https://kyivcity.gov.ua/news/rss/',
  'https://suspilne.media/kyiv/rss/all.rss',
  'https://vechirniy.kyiv.ua/rss/',
  'https://bigkyiv.com.ua/feed/',
  'https://www.koda.gov.ua/rss',
  'https://ukrinform.ua/rss/block-lastnews',
  'https://www.pravda.com.ua/rss/view_news/',
];

const KEYWORDS = [
  'чайка',
  'chayka',
  'chaika',
  'буча',
  'бучан',
  'софіїв',
  'софиев',
  'борщаг',
  'київ',
  'kyiv',
  'київщина',
  'область',
  'безпек',
  'укрит',
  'перекрит',
  'ремонт',
  'світл',
  'вода',
  'тепло',
  'транспорт',
  'дорог',
  'жкг',
  'аварі',
  'Житомирськ',
  'Житомирская',
];

export function scoreNewsItem(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''} ${item.link || ''}`.toLowerCase();
  let score = 0;

  for (const keyword of KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += keyword.length >= 6 ? 4 : 2;
    }
  }

  if (/чайк|бучан|софіїв|софиев/i.test(text)) score += 18;
  if (/перекрит|ремонт|авар|укрит|безпек|світл|вода|тепло|транспорт/i.test(text)) score += 8;

  return Math.min(score, 100);
}

export function isRelevantNews(item) {
  return scoreNewsItem(item) >= 10;
}

export async function getLatestNews(limit = 10) {
  const settled = await Promise.allSettled(
    RSS_FEEDS.map(async (url) => {
      console.log(`[news] loading ${url}`);
      const feed = await parser.parseURL(url);
      const items = (feed.items || []).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        date: item.pubDate || item.isoDate || new Date().toISOString(),
        source: feed.title || new URL(url).hostname,
        summary: item.contentSnippet || item.content || '',
        score: scoreNewsItem(item),
      }));

      return items.filter(isRelevantNews);
    })
  );

  const collected = settled
    .flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`[news] ok ${RSS_FEEDS[index]}`);
        return result.value;
      }

      console.log(`[news] skip ${RSS_FEEDS[index]}`);
      return [];
    });

  const unique = new Map();
  for (const item of collected) {
    const key = item.link || `${item.title}-${item.date}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return Array.from(unique.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}
