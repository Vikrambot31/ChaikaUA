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
    name: 'Київський портал',
    url: 'https://kyivcity.gov.ua/',
    description: 'Офіційні міські новини, транспорт, ЖКГ, безпека, укриття, ремонти.',
  },
  {
    name: 'Суспільне Київ',
    url: 'https://suspilne.media/kyiv/',
    description: 'Новини Києва та області, безпека, кримінал, інфраструктура, війна.',
  },
  {
    name: 'Вечірній Київ',
    url: 'https://vechirniy.kyiv.ua/',
    description: 'Київські новини, ремонти, перекриття, ЖКГ, медицина, транспорт.',
  },
  {
    name: 'Великий Київ',
    url: 'https://bigkyiv.com.ua/',
    description: 'Міські новини та короткі повідомлення по Києву й агломерації.',
  },
  {
    name: 'Київська ОВА',
    url: 'https://www.koda.gov.ua/',
    description: 'Офіційні новини Київської області, громади, безпека, стійкість, ЖКГ.',
  },
];

const TOPIC_RULES: Array<{ topic: ChaykaNewsTopic; keywords: string[]; bonus: number }> = [
  { topic: 'chaika', keywords: ['чайка', 'chayka', 'chaika', 'жк чайка', 'осбб чайка'], bonus: 40 },
  { topic: 'bucha', keywords: ['буча', 'бучан', 'бучанський', 'bucha district', 'бучанский'], bonus: 28 },
  { topic: 'sophiivska_borshchahivka', keywords: ['софіїв', 'софиев', 'борща', 'sophiiv', 'софіївська'], bonus: 24 },
  { topic: 'kyiv_region', keywords: ['київська область', 'київщина', 'область', 'kyiv region', 'киевская область'], bonus: 20 },
  { topic: 'kyiv', keywords: ['київ', 'киев', 'kyiv'], bonus: 12 },
  { topic: 'safety', keywords: ['безпек', 'тривог', 'укрит', 'повітрян', 'сирен', 'обстріл', 'атака', 'поліція', 'пожеж', 'аварі'], bonus: 18 },
  { topic: 'transport', keywords: ['транспорт', 'маршрут', 'автобус', 'зупин', 'пробк', 'перекрит', 'дорог', 'рух'], bonus: 14 },
  { topic: 'utilities', keywords: ['світл', 'вода', 'тепло', 'електро', 'газ', 'жкг', 'комунал', 'ремонт'], bonus: 16 },
  { topic: 'weather', keywords: ['погод', 'дощ', 'сніг', 'замороз', 'вітер', 'шторм', 'гроза'], bonus: 8 },
  { topic: 'infrastructure', keywords: ['укрит', 'генератор', 'ремонт', 'шляхопровід', 'міст', 'школ', 'садоч', 'лікарн'], bonus: 10 },
];

const STOPWORDS = new Set(['у', 'і', 'та', 'на', 'з', 'до', 'про', 'для', 'the', 'and', 'or']);

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
  const interestBoost = ['авар', 'перекрит', 'відключ', 'світл', 'укрит', 'загроза', 'ремонт', 'безпек'].some((word) => text.includes(word)) ? 10 : 0;
  const localityBoost = /чайк|бучан|софіїв|софиев/iu.test(text) ? 20 : 0;
  const score = Math.min(100, baseScore + interestBoost + localityBoost);
  const keep = score >= 18;

  const reason = keep
    ? topics.includes('chaika')
      ? 'Пряма згадка Чайки або ОСББ'
      : topics.includes('bucha')
        ? "Пов'язано з Бучанським районом"
        : 'Корисна новина для Києва/області'
    : 'Низька релевантність для Чайки';

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
    'Ты редактор новостной ленты ЖК Чайка.',
    'Твоя задача: по исходному сообщению сделать короткое резюме на русском языке.',
    'Нужно 1-2 предложения, без воды, без копирования дословного текста.',
    'Если новость касается Чайки, Бучанского района, Софиевской Борщаговки, Житомирской трассы, Киева или Киевской области, это считается особенно полезным.',
    'Если факт не подтвержден, не превращай его в утверждение.',
    `Источник: ${candidate.sourceName}`,
    `Темы: ${topics}`,
    `Ключевые слова: ${keywords.join(', ') || 'нет'}`,
    `Заголовок: ${candidate.title}`,
    `Текст: ${candidate.body}`,
    'Верни: заголовок, краткий текст, источник и ссылку.'
  ].join('\n');
};

export const summarizeChaykaNews = (candidate: ChaykaNewsCandidate) => {
  const topics = detectChaykaTopics(candidate);
  const title = sanitizeStoredText(candidate.title || 'Новини Чайки');
  const source = sanitizeStoredText(candidate.sourceName || 'Источник');
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

