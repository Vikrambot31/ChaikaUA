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
  'жк чайка',
  'осбб чайка',
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
  'комунал',
  'перекрит',
  'безпек',
  'укрит',
  'світл',
  'Житомирськ',
  'Житомирская',
];

const BLOCKED_KEYWORDS = [
  'росі',
  'россия',
  'рф',
  'москва',
  'кремл',
  'сша',
  'європ',
  'китай',
  'ізраїл',
  'іран',
  'нато',
  'g20',
  'оон',
  'світ',
  'world',
  'україна і світ',
  'міжнарод',
  'одес',
  'львів',
  'харків',
  'дніпр',
  'запоріж',
  'терноп',
  'полтав',
  'чернів',
  'черніг',
  'суми',
  'кибер',
  'кібер',
  'cyber',
  'security',
  'штучний інтелект',
  'ai',
  'віртуал',
  'фінанс',
  'економік',
  'прем’єр',
  'президент',
  'вибор',
  'парламент',
  'міноборон',
];

const LOCALITY_KEYWORDS = [
  'чайка',
  'жк чайка',
  'осбб чайка',
  'буча',
  'бучан',
  'бучанський',
  'софіїв',
  'софиев',
  'борщаг',
  'житомирськ',
  'житомирская',
  'київ',
  'киев',
  'київська область',
  'киевская область',
  'київщина',
];

const IMPACT_KEYWORDS = [
  'світл',
  'відключ',
  'вода',
  'тепло',
  'газ',
  'жкг',
  'комунал',
  'ремонт',
  'перекрит',
  'дорог',
  'рух',
  'маршрут',
  'автобус',
  'транспорт',
  'укрит',
  'безпек',
  'тривог',
  'сирен',
  'пожеж',
  'авар',
  'шторм',
  'замороз',
  'погод',
  'генератор',
  'інфраструкт',
];

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function scoreNewsItem(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''} ${item.link || ''}`.toLowerCase();
  let score = 0;

  for (const blocked of BLOCKED_KEYWORDS) {
    if (text.includes(blocked)) {
      return 0;
    }
  }

  if (/чайк|жк чайк|осбб чайк/i.test(text)) score += 40;
  if (/бучан|буча/i.test(text)) score += 26;
  if (/софіїв|софиев|борщаг/i.test(text)) score += 24;
  if (/житомир|житомирськ/i.test(text)) score += 20;
  if (/безпек|укрит|тривог|поліц|пожеж|авар/i.test(text)) score += 18;
  if (/перекрит|ремонт|дорог|транспорт|авар|світл|вода|тепло|комунал/i.test(text)) score += 16;

  for (const keyword of KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += keyword.length >= 6 ? 3 : 1;
    }
  }

  return Math.min(score, 100);
}

export function isRelevantNews(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''} ${item.link || ''}`.toLowerCase();
  const hasLocality = hasAnyKeyword(text, LOCALITY_KEYWORDS);
  const hasImpact = hasAnyKeyword(text, IMPACT_KEYWORDS);

  if (!hasLocality) {
    return false;
  }

  if (!hasImpact && !/чайк|бучан|софіїв|софиев|борщаг/i.test(text)) {
    return false;
  }

  return scoreNewsItem(item) >= 24;
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
