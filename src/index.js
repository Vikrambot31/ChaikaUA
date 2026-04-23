import 'dotenv/config';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem, isEmptySummary } from './ai.js';
import { formatTelegramPost, sendTelegramMessage } from './telegram.js';
import { loadPublishedItems, savePublishedItem } from './storage.js';

const RUN_MODE = process.env.RUN_MODE || 'cron';
const SEND_HEARTBEAT = String(process.env.SEND_HEARTBEAT || '').toLowerCase() === 'true';

function getNewsKey(item) {
  return item.link || `${item.title}-${item.date}`;
}

function alreadyPublished(item) {
  const published = loadPublishedItems();
  const key = getNewsKey(item);
  return published.some((entry) => entry.key === key);
}

async function publishDaily() {
  const news = await getLatestNews(10);
  if (!news.length) {
    console.log('No relevant news found, skipping run');

    if (SEND_HEARTBEAT) {
      const heartbeatText = [
        '📰 Новини від додатку ChaikaUA',
        'Бот і Telegram-зв’язок працюють коректно. Сьогодні релевантних новин не знайдено.',
        `Джерело: ${process.env.SITE_URL || 'ChaikaUA'}`,
        'Дякуємо, що користуєтеся додатком ЖК Чайка.',
      ].join('\n\n');

      await sendTelegramMessage(heartbeatText);
      console.log('Sent heartbeat message');
    }

    return;
  }

  for (const item of news) {
    if (alreadyPublished(item)) continue;

    let summary = '';
    try {
      summary = await Promise.race([
        summarizeNewsItem(item),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 15000)),
      ]);
    } catch (error) {
      console.log(`AI skip for ${item.title}: ${error.message}`);
      continue;
    }

    if (isEmptySummary(summary)) {
      console.log(`Skipped empty summary for: ${item.title}`);
      continue;
    }

    const cleanedSummary = String(summary).replace(/\s+/g, ' ').trim();
    if (!cleanedSummary || cleanedSummary.length < 10) {
      console.log(`Skipped too short summary for: ${item.title}`);
      continue;
    }

    const text = formatTelegramPost({
      title: item.title,
      summary: cleanedSummary,
      source: item.source,
      link: item.link,
    });

    if (!text || !String(text).trim()) {
      console.log(`Skipped empty telegram post for: ${item.title}`);
      continue;
    }

    const result = await sendTelegramMessage(text);

    savePublishedItem({
      key: getNewsKey(item),
      publishedAt: new Date().toISOString(),
      telegramMessageId: result?.result?.message_id || null,
      source: item.source,
      title: item.title,
      link: item.link,
    });

    console.log(`Published: ${item.title}`);
  }
}

if (RUN_MODE === 'once') {
  await publishDaily();
} else {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await publishDaily();
    } catch (error) {
      console.error(error);
    }
  }, { timezone: 'Europe/Kyiv' });

  console.log('Chaika server bot started');
}
