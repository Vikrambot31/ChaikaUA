import axios from 'axios';

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function buildPrompt(item) {
  return [
    'Ты редактор новостей ЖК Чайка.',
    'Сделай короткое резюме на русском языке в 1-2 предложения.',
    'Если новость касается Чайки, Бучанского района, Софиевской Борщаговки, Житомирской трассы, Киева или Киевской области, это особенно важно.',
    'Не копируй текст дословно, не выдумывай факты.',
    `Источник: ${item.source}`,
    `Заголовок: ${item.title}`,
    `Ссылка: ${item.link}`,
    `Содержимое: ${normalizeText(item.summary)}`,
  ].join('\n');
}

async function callAnthropic(item) {
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: buildPrompt(item) }],
  }, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  });

  const text = res.data?.content?.[0]?.text || '';
  return normalizeText(text) || `${item.title}. ${normalizeText(item.summary).slice(0, 160)}`;
}

export async function summarizeNewsItem(item) {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return await callAnthropic(item);
    }

    return `${normalizeText(item.title)}. ${normalizeText(item.summary).slice(0, 160)}`;
  } catch {
    return `${normalizeText(item.title)}. ${normalizeText(item.summary).slice(0, 160)}`;
  }
}
