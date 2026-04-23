import axios from 'axios';

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function buildPrompt(item) {
  return [
    'Ти редактор новин ЖК Чайка.',
    'Зроби коротке резюме українською мовою у 1-2 реченнях.',
    'Якщо новина стосується Чайки, Бучанського району, Софіївської Борщагівки, Житомирської траси, Києва або Київської області, це особливо важливо.',
    'Не копіюй текст дослівно, не вигадуй факти.',
    `Джерело: ${item.source}`,
    `Заголовок: ${item.title}`,
    `Посилання: ${item.link}`,
    `Зміст: ${normalizeText(item.summary)}`,
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

export function isEmptySummary(summary) {
  return !normalizeText(summary || '').trim();
}
