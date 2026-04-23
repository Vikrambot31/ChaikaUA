import 'dotenv/config';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem } from './ai.js';
import { formatTelegramPost, sendTelegramMessage } from './telegram.js';
import { loadPublishedItems, savePublishedItem } from './storage.js';

const RUN_MODE = process.env.RUN_MODE || 'cron';

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
  for (const item of news) {
    if (alreadyPublished(item)) continue;

    const summary = await summarizeNewsItem(item);
    const text = formatTelegramPost({
      title: item.title,
      summary,
      source: item.source,
      link: item.link,
    });

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
