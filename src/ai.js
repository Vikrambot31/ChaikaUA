import axios from 'axios';

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

const CHAIKA_PROMPT = `Ти редактор Telegram-каналу ЖК Чайка (Ірпінь, Київська обл.).
Завдання: написати 1 пост до 35 слів — без заголовку, без підпису, без вступу.

Правила:
1. ПЕРШИЙ рядок — конкретний факт, що стосується Чайки / Ірпеня / Бучанського р-ну.
2. Якщо прямого зв'язку немає — одне речення «що це означає для мешканців Чайки».
3. Жодного канцеляриту, жодних кліше типу «слід зазначити» або «у зв'язку з цим».
4. Після тексту — порожній рядок, потім теги: #ЖКЧайка #Ірпінь #КиївськаОбласть + 1 тематичний тег.

Поверни ТІЛЬКИ текст поста. Без лапок, без коментарів.`;

function buildFallbackPost(item) {
  const title = normalizeText(item.title).slice(0, 120);
  return normalizeText(
    `${title} — може стосуватися мешканців Ірпеня та Чайки. ` +
    `#ЖКЧайка #Ірпінь #КиївськаОбласть #Новини`,
  );
}

function buildPrompt(item) {
  return [
    CHAIKA_PROMPT,
    '',
    'Новина:',
    `Джерело: ${item.source}`,
    `Заголовок: ${item.title}`,
    `Опис: ${normalizeText(item.summary || item.contentSnippet || '').slice(0, 400)}`,
  ].join('\n');
}

async function callAnthropic(item) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: buildPrompt(item) }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 12000,
    },
  );

  const text = response.data?.content?.[0]?.text || '';
  return normalizeText(text) || buildFallbackPost(item);
}

export async function summarizeNewsItem(item) {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      return await callAnthropic(item);
    }
    return buildFallbackPost(item);
  } catch {
    return buildFallbackPost(item);
  }
}

export function isEmptySummary(summary) {
  return !normalizeText(summary || '').trim();
}
