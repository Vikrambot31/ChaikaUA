import 'dotenv/config';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem, isEmptySummary } from './ai.js';
import { formatTelegramPost, sendTelegramMessage } from './telegram.js';
import { loadPublishedItems, savePublishedItem } from './storage.js';
import { buildOffersDigest } from './offers.js';
import { getCoffeeSpotOfDay } from './cafes.js';

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
  const offer = buildOffersDigest();
  const coffee = getCoffeeSpotOfDay();

  const pendingPosts = [];

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

  } else {
    for (const item of news.slice(0, 3)) {
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

      pendingPosts.push({
        type: 'news',
        key: getNewsKey(item),
        text,
        meta: item,
      });
    }
  }

  if (offer) {
    pendingPosts.push({
      type: 'offer',
      key: 'offer-digest',
      text: formatTelegramPost({
        title: offer.title,
        summary: offer.summary,
        source: offer.source,
        link: offer.link,
      }),
      meta: offer,
    });
  }

  if (coffee) {
    pendingPosts.push({
      type: 'coffee',
      key: `coffee-${coffee.name}`,
      text: [
        '☕ Де сьогодні випити каву на Чайці',
        `Місце дня: ${coffee.name}`,
        `Адреса: ${coffee.address}`,
        'Коротко: одна з найкращих точок для швидкої кави поруч із домом.',
        `Джерело: ${process.env.SITE_URL || 'ChaikaUA'}`,
        'Дякуємо, що користуєтеся додатком ЖК Чайка.',
        'Розкажіть свої новини та події в чаті у мобільному додатку.',
      ].join('\n\n'),
      meta: coffee,
    });
  }

  for (const post of pendingPosts.slice(0, 3)) {
    const result = await sendTelegramMessage(post.text);
    savePublishedItem({
      key: post.key,
      publishedAt: new Date().toISOString(),
      telegramMessageId: result?.result?.message_id || null,
      type: post.type,
      title: post.meta?.title || post.meta?.name || '',
      link: post.meta?.link || '',
    });
    console.log(`Published: ${post.type}`);
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
