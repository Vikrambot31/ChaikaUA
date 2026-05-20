import { normalizeText, sanitizeStoredText } from '../utils/textUtils';

export type ChaykaNewsTopic =
  | 'chaika'
  | 'bucha'
  | 'sophiivska_borshchahivka'
  | 'kyiv'
  | 'kyiv_region'
  | 'safety'
  | 'transport'
  | 'utilities'
  | 'weather'
  | 'infrastructure'
  | 'other';

export type ChaykaSourceHint = {
  name: string;
  url: string;
  description: string;
};

export type ChaykaNewsCandidate = {
  title: string;
  body: string;
  sourceName: string;
  sourceUrl?: string;
  publishedAt?: string;
};

export type ChaykaScoredNews = ChaykaNewsCandidate & {
  topics: ChaykaNewsTopic[];
  score: number;
  keep: boolean;
  reason: string;
};

export const CHAYKA_SOURCE_HINTS: ChaykaSourceHint[] = [
  {
    name: 'РљРёС—РІСЃСЊРєРёР№ РїРѕСЂС‚Р°Р»',
    url: 'https://kyivcity.gov.ua/',
    description: 'РћС„С–С†С–Р№РЅС– РјС–СЃСЊРєС– РЅРѕРІРёРЅРё, С‚СЂР°РЅСЃРїРѕСЂС‚, Р–РљР“, Р±РµР·РїРµРєР°, СѓРєСЂРёС‚С‚СЏ, СЂРµРјРѕРЅС‚Рё.',
  },
  {
    name: 'РЎСѓСЃРїС–Р»СЊРЅРµ РљРёС—РІ',
    url: 'https://suspilne.media/kyiv/',
    description: 'РќРѕРІРёРЅРё РљРёС”РІР° С‚Р° РѕР±Р»Р°СЃС‚С–, Р±РµР·РїРµРєР°, РєСЂРёРјС–РЅР°Р», С–РЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°, РІС–Р№РЅР°.',
  },
  {
    name: 'Р’РµС‡С–СЂРЅС–Р№ РљРёС—РІ',
    url: 'https://vechirniy.kyiv.ua/',
    description: 'РљРёС—РІСЃСЊРєС– РЅРѕРІРёРЅРё, СЂРµРјРѕРЅС‚Рё, РїРµСЂРµРєСЂРёС‚С‚СЏ, Р–РљР“, РјРµРґРёС†РёРЅР°, С‚СЂР°РЅСЃРїРѕСЂС‚.',
  },
  {
    name: 'Р’РµР»РёРєРёР№ РљРёС—РІ',
    url: 'https://bigkyiv.com.ua/',
    description: 'РњС–СЃСЊРєС– РЅРѕРІРёРЅРё С‚Р° РєРѕСЂРѕС‚РєС– РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ РїРѕ РљРёС”РІСѓ Р№ Р°РіР»РѕРјРµСЂР°С†С–С—.',
  },
  {
    name: 'РљРёС—РІСЃСЊРєР° РћР’Рђ',
    url: 'https://www.koda.gov.ua/',
    description: 'РћС„С–С†С–Р№РЅС– РЅРѕРІРёРЅРё РљРёС—РІСЃСЊРєРѕС— РѕР±Р»Р°СЃС‚С–, РіСЂРѕРјР°РґРё, Р±РµР·РїРµРєР°, СЃС‚С–Р№РєС–СЃС‚СЊ, Р–РљР“.',
  },
];

const TOPIC_RULES: Array<{ topic: ChaykaNewsTopic; keywords: string[]; bonus: number }> = [
  { topic: 'chaika', keywords: ['С‡Р°Р№РєР°', 'chayka', 'chaika', 'Р¶Рє С‡Р°Р№РєР°', 'РѕСЃР±Р± С‡Р°Р№РєР°'], bonus: 40 },
  { topic: 'bucha', keywords: ['Р±СѓС‡Р°', 'Р±СѓС‡Р°РЅ', 'Р±СѓС‡Р°РЅСЃСЊРєРёР№', 'bucha district', 'Р±СѓС‡Р°РЅСЃРєРёР№'], bonus: 28 },
  { topic: 'sophiivska_borshchahivka', keywords: ['СЃРѕС„С–С—РІ', 'СЃРѕС„РёРµРІ', 'Р±РѕСЂС‰Р°Рі', 'sophiiv', 'СЃРѕС„С–С—РІСЃСЊРєР°'], bonus: 24 },
  { topic: 'kyiv_region', keywords: ['РєРёС—РІСЃСЊРєР° РѕР±Р»Р°СЃС‚СЊ', 'РєРёС—РІС‰РёРЅР°', 'РѕР±Р»Р°СЃС‚СЊ', 'kyiv region', 'РєРёРµРІСЃРєР°СЏ РѕР±Р»Р°СЃС‚СЊ'], bonus: 20 },
  { topic: 'kyiv', keywords: ['РєРёС—РІ', 'РєРёРµРІ', 'kyiv'], bonus: 12 },
  { topic: 'safety', keywords: ['Р±РµР·РїРµРє', 'С‚СЂРёРІРѕРі', 'СѓРєСЂРёС‚', 'РїРѕРІС–С‚СЂСЏРЅ', 'СЃРёСЂРµРЅ', 'РѕР±СЃС‚СЂС–Р»', 'Р°С‚Р°РєР°', 'РїРѕР»С–С†С–СЏ', 'РїРѕР¶РµР¶', 'Р°РІР°СЂС–'], bonus: 18 },
  { topic: 'transport', keywords: ['С‚СЂР°РЅСЃРїРѕСЂС‚', 'РјР°СЂС€СЂСѓС‚', 'Р°РІС‚РѕР±СѓСЃ', 'Р·СѓРїРёРЅ', 'РїСЂРѕР±Рє', 'РїРµСЂРµРєСЂРёС‚', 'РґРѕСЂРѕРі', 'СЂСѓС…'], bonus: 14 },
  { topic: 'utilities', keywords: ['СЃРІС–С‚Р»', 'РІРѕРґР°', 'С‚РµРїР»Рѕ', 'РµР»РµРєС‚СЂРѕ', 'РіР°Р·', 'Р¶РєРі', 'РєРѕРјСѓРЅР°Р»', 'СЂРµРјРѕРЅС‚'], bonus: 16 },
  { topic: 'weather', keywords: ['РїРѕРіРѕРґ', 'РґРѕС‰', 'СЃРЅС–Рі', 'Р·Р°РјРѕСЂРѕР·', 'РІС–С‚РµСЂ', 'С€С‚РѕСЂРј', 'РіСЂРѕР·Р°'], bonus: 8 },
  { topic: 'infrastructure', keywords: ['СѓРєСЂРёС‚', 'РіРµРЅРµСЂР°С‚РѕСЂ', 'СЂРµРјРѕРЅС‚', 'С€Р»СЏС…РѕРїСЂРѕРІС–Рґ', 'РјС–СЃС‚', 'С€РєРѕР»', 'СЃР°РґРѕС‡', 'Р»С–РєР°СЂРЅ'], bonus: 10 },
];

const STOPWORDS = new Set(['Сѓ', 'С–', 'С‚Р°', 'РЅР°', 'Р·', 'РґРѕ', 'РїСЂРѕ', 'РґР»СЏ', 'the', 'and', 'or']);

const extractKeywords = (text: string) => {
  const tokens = normalizeText(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 12);
};

export const detectChaykaTopics = (candidate: ChaykaNewsCandidate): ChaykaNewsTopic[] => {
  const text = `${candidate.title} ${candidate.body} ${candidate.sourceName}`.toLowerCase();
  return TOPIC_RULES.filter((rule) => rule.keywords.some((keyword) => text.includes(keyword))).map((rule) => rule.topic);
};

export const scoreChaykaNewsCandidate = (candidate: ChaykaNewsCandidate): ChaykaScoredNews => {
  const topics = detectChaykaTopics(candidate);
  const text = `${candidate.title} ${candidate.body} ${candidate.sourceName}`.toLowerCase();
  const baseScore = topics.reduce((sum, topic) => sum + (TOPIC_RULES.find((rule) => rule.topic === topic)?.bonus ?? 0), 0);
  const interestBoost = ['Р°РІР°СЂ', 'РїРµСЂРµРєСЂРёС‚', 'РІС–РґРєР»СЋС‡', 'СЃРІС–С‚Р»', 'СѓРєСЂРёС‚', 'Р·Р°РіСЂРѕР·Р°', 'СЂРµРјРѕРЅС‚', 'Р±РµР·РїРµРє'].some((word) => text.includes(word)) ? 10 : 0;
  const localityBoost = /С‡Р°Р№Рє|Р±СѓС‡Р°РЅ|СЃРѕС„С–С—РІ|СЃРѕС„РёРµРІ/iu.test(text) ? 20 : 0;
  const score = Math.min(100, baseScore + interestBoost + localityBoost);
  const keep = score >= 18;

  const reason = keep
    ? topics.includes('chaika')
      ? 'РџСЂСЏРјР° Р·РіР°РґРєР° Р§Р°Р№РєРё Р°Р±Рѕ РћРЎР‘Р‘'
      : topics.includes('bucha')
        ? 'РџРѕРІвЂ™СЏР·Р°РЅРѕ Р· Р‘СѓС‡Р°РЅСЃСЊРєРёРј СЂР°Р№РѕРЅРѕРј'
        : 'РљРѕСЂРёСЃРЅР° РЅРѕРІРёРЅР° РґР»СЏ РљРёС”РІР°/РѕР±Р»Р°СЃС‚С–'
    : 'РќРёР·СЊРєР° СЂРµР»РµРІР°РЅС‚РЅС–СЃС‚СЊ РґР»СЏ Р§Р°Р№РєРё';

  return {
    ...candidate,
    sourceName: sanitizeStoredText(candidate.sourceName),
    title: sanitizeStoredText(candidate.title),
    body: sanitizeStoredText(candidate.body),
    publishedAt: candidate.publishedAt ?? new Date().toISOString(),
    sourceUrl: candidate.sourceUrl?.trim(),
    topics,
    score,
    keep,
    reason,
  };
};

export const filterChaykaNews = (items: ChaykaNewsCandidate[]) =>
  items
    .map(scoreChaykaNewsCandidate)
    .filter((item) => item.keep)
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt ?? '').getTime() - new Date(a.publishedAt ?? '').getTime());

export const buildChaykaAiPrompt = (candidate: ChaykaNewsCandidate) => {
  const keywords = extractKeywords(`${candidate.title} ${candidate.body}`);
  const topics = detectChaykaTopics(candidate).join(', ') || 'other';

  return [
    'РўС‹ СЂРµРґР°РєС‚РѕСЂ РЅРѕРІРѕСЃС‚РЅРѕР№ Р»РµРЅС‚С‹ Р–Рљ Р§Р°Р№РєР°.',
    'РўРІРѕСЏ Р·Р°РґР°С‡Р°: РїРѕ РёСЃС…РѕРґРЅРѕРјСѓ СЃРѕРѕР±С‰РµРЅРёСЋ СЃРґРµР»Р°С‚СЊ РєРѕСЂРѕС‚РєРѕРµ СЂРµР·СЋРјРµ РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ.',
    'РќСѓР¶РЅРѕ 1-2 РїСЂРµРґР»РѕР¶РµРЅРёСЏ, Р±РµР· РІРѕРґС‹, Р±РµР· РєРѕРїРёСЂРѕРІР°РЅРёСЏ РґРѕСЃР»РѕРІРЅРѕРіРѕ С‚РµРєСЃС‚Р°.',
    'Р•СЃР»Рё РЅРѕРІРѕСЃС‚СЊ РєР°СЃР°РµС‚СЃСЏ Р§Р°Р№РєРё, Р‘СѓС‡Р°РЅСЃРєРѕРіРѕ СЂР°Р№РѕРЅР°, РЎРѕС„РёРµРІСЃРєРѕР№ Р‘РѕСЂС‰Р°РіРѕРІРєРё, Р–РёС‚РѕРјРёСЂСЃРєРѕР№ С‚СЂР°СЃСЃС‹, РљРёРµРІР° РёР»Рё РљРёРµРІСЃРєРѕР№ РѕР±Р»Р°СЃС‚Рё, СЌС‚Рѕ СЃС‡РёС‚Р°РµС‚СЃСЏ РѕСЃРѕР±РµРЅРЅРѕ РїРѕР»РµР·РЅС‹Рј.',
    'Р•СЃР»Рё С„Р°РєС‚ РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅ, РЅРµ РїСЂРµРІСЂР°С‰Р°Р№ РµРіРѕ РІ СѓС‚РІРµСЂР¶РґРµРЅРёРµ.',
    `РСЃС‚РѕС‡РЅРёРє: ${candidate.sourceName}`,
    `РўРµРјС‹: ${topics}`,
    `РљР»СЋС‡РµРІС‹Рµ СЃР»РѕРІР°: ${keywords.join(', ') || 'РЅРµС‚'}`,
    `Р—Р°РіРѕР»РѕРІРѕРє: ${candidate.title}`,
    `РўРµРєСЃС‚: ${candidate.body}`,
    'Р’РµСЂРЅРё: Р·Р°РіРѕР»РѕРІРѕРє, РєСЂР°С‚РєРёР№ С‚РµРєСЃС‚, РёСЃС‚РѕС‡РЅРёРє Рё СЃСЃС‹Р»РєСѓ.'
  ].join('\n');
};

export const summarizeChaykaNews = (candidate: ChaykaNewsCandidate) => {
  const topics = detectChaykaTopics(candidate);
  const title = sanitizeStoredText(candidate.title || 'РќРѕРІРёРЅРё Р§Р°Р№РєРё');
  const source = sanitizeStoredText(candidate.sourceName || 'РСЃС‚РѕС‡РЅРёРє');
  const shortText = candidate.body.length <= 180
    ? candidate.body
    : `${candidate.body.slice(0, 177).trimEnd()}...`;

  return {
    title,
    shortText: sanitizeStoredText(shortText),
    sourceName: source,
    sourceUrl: candidate.sourceUrl?.trim(),
    topics,
    prompt: buildChaykaAiPrompt(candidate),
  };
};

