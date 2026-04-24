import 'dotenv/config';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem, isEmptySummary } from './ai.js';
import { formatTelegramPost, sendTelegramMessage, sendTelegramPhoto } from './telegram.js';
import { loadPublishedItems, savePublishedItem, hasDailyRunFor, saveDailyRunEntry, saveFeedItem } from './storage.js';
import { getPlacesPostOfDay } from './cafes.js';

const RUN_MODE = process.env.RUN_MODE || 'cron';
const POST_TYPE = process.env.POST_TYPE || 'all';

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

  const news = await getLatestNews(10);
  const placesPost = getPlacesPostOfDay();

  const pendingPosts = [];

  if ((POST_TYPE === 'all' || POST_TYPE === 'places') && placesPost && !hasDailyRunFor('places', today)) {
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

  if ((POST_TYPE === 'all' || POST_TYPE === 'news') && news.length && !hasDailyRunFor('news', today)) {
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
    saveFeedItem({
      id: post.key,
      title: post.meta?.title || post.meta?.name || '',
      shortText: post.type === 'news'
        ? post.text.split('\n').slice(2, 3).join(' ').replace(/^🧾\s*/, '')
        : post.text.split('\n').slice(1, 4).join(' '),
      sourceName: post.type === 'news' ? (post.meta?.source || 'ChaikaUA') : 'ChaikaUA',
      sourceUrl: process.env.SITE_URL || 'https://chaika-ua.netlify.app',
      publishedAt: new Date().toISOString(),
      priority: post.type === 'news' ? 'important' : 'info',
      aiGenerated: true,
      postType: post.type,
    });
    saveDailyRunEntry({
      type: post.type,
      date: today,
      publishedAt: new Date().toISOString(),
      key: post.key,
    });
    console.log(`Published: ${post.type}`);
  }
}

if (RUN_MODE === 'once') {
  await publishDaily();
} else {
  cron.schedule('0 7 * * *', async () => {
    try {
      process.env.POST_TYPE = 'news';
      await publishDaily();
    } catch (error) {
      console.error(error);
    }
  }, { timezone: 'Europe/Kyiv' });

  cron.schedule('0 11 * * *', async () => {
    try {
      process.env.POST_TYPE = 'places';
      await publishDaily();
    } catch (error) {
      console.error(error);
    }
  }, { timezone: 'Europe/Kyiv' });

  console.log('Chaika server bot started');
}
