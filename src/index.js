import 'dotenv/config';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem, isEmptySummary } from './ai.js';
import { formatTelegramPost, sendTelegramMessage, sendTelegramPhoto } from './telegram.js';
import { loadPublishedItems, savePublishedItem, loadDailyRunState, saveDailyRunState } from './storage.js';
import { getPlacesPostOfDay } from './cafes.js';

const RUN_MODE = process.env.RUN_MODE || 'cron';

function getTodayKey(prefix) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `${prefix}-${date}`;
}

function getTodayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getNewsKey(item) {
  return item.link || `${item.title}-${item.date}`;
}

function alreadyPublished(item) {
  const published = loadPublishedItems();
  const key = getNewsKey(item);
  return published.some((entry) => entry.key === key);
}

async function publishDaily() {
  const today = getTodayDate();
  const dailyState = loadDailyRunState();
  if (dailyState?.date === today) {
    console.log(`Daily publication already completed for ${today}`);
    return;
  }

  const news = await getLatestNews(10);
  const placesPost = getPlacesPostOfDay();

  const pendingPosts = [];

  if (placesPost) {
    const placesKey = getTodayKey(`places-${placesPost.items.map((item) => item.name).join('-')}`);
    if (!alreadyPublished({ link: placesKey, title: placesPost.title, date: new Date().toISOString() })) {
      pendingPosts.push({
        type: 'places',
        key: placesKey,
        text: placesPost.text,
        meta: placesPost,
      });
    }
  }

  if (news.length) {
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

      break;
    }
  }

  for (const post of pendingPosts.slice(0, 2)) {
    const result = post.type === 'places' && post.meta?.imageUrl
      ? await sendTelegramPhoto(post.meta.imageUrl, post.text)
      : await sendTelegramMessage(post.text);

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

  saveDailyRunState({
    date: today,
    publishedAt: new Date().toISOString(),
    postCount: Math.min(pendingPosts.length, 2),
  });
}

if (RUN_MODE === 'once') {
  await publishDaily();
} else {
  cron.schedule('0 8 * * *', async () => {
    try {
      await publishDaily();
    } catch (error) {
      console.error(error);
    }
  }, { timezone: 'Europe/Kyiv' });

  console.log('Chaika server bot started');
}
