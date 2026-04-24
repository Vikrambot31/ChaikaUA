import axios from 'axios';

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function buildPrompt(item) {
  return [
    'Ти редактор новин ЖК Чайка.',
    'Зроби коротке резюме українською мовою у 1-2 реченнях.',
    'Бери тільки новини, що стосуються Києва, Київської області, Бучанського району, Софіївської Борщагівки, Житомирської траси або Чайки.',
    'Не пиши про Росію, світову політику, міжнародні теми чи загальну повістку, якщо вона не має прямого локального впливу.',
    'У резюме обов’язково поясни, як ця новина може стосуватися Чайки або мешканців району.',
    'Якщо новина локальна, але прямої інформації саме по Чайці немає, так і напиши: для Чайки окремих оновлень поки немає.',
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
    timeout: 15000,
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
