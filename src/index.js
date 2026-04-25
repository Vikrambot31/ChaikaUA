import 'dotenv/config';
import axios from 'axios';
import cron from 'node-cron';
import { getLatestNews } from './news.js';
import { summarizeNewsItem, isEmptySummary } from './ai.js';
import { formatTelegramPost, sendTelegramMessage, sendTelegramPhoto } from './telegram.js';
import { loadPublishedItems, savePublishedItem, hasDailyRunFor, saveDailyRunEntry, saveFeedItem } from './storage.js';
import { getPlacesPostOfDay } from './cafes.js';

const RUN_MODE = process.env.RUN_MODE || 'cron';
const POST_TYPE = process.env.POST_TYPE || 'all';
const FORCE_FEED_SYNC = String(process.env.FORCE_FEED_SYNC || '').toLowerCase() === 'true';

function extractFeedText(post) {
  return String(post.text || '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed
        && !/^📰/.test(trimmed)
        && !/^✨/.test(trimmed)
        && !/^📍/.test(trimmed)
        && !/^🔗/.test(trimmed)
        && !/^📲/.test(trimmed)
        && !/^💬/.test(trimmed);
    })
    .join(' ')
    .replace(/^🧾\s*/, '')
    .trim();
}

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

async function fetchOgImage(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'ChaikaUA-NewsBot/1.0 (+https://chaika-ua.netlify.app)' },
      responseType: 'text',
    });
    const html = String(res.data || '');
    const match = html.match(/<meta[^>]+(?:property="og:image"|name="og:image")[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property="og:image"|name="og:image")/i);
    const imageUrl = match ? match[1].trim() : null;
    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return null;
    return imageUrl;
  } catch {
    return null;
  }
}

function alreadyPublished(item) {
  const published = loadPublishedItems();
  const key = getNewsKey(item);
  return published.some((entry) => entry.key === key);
}

async function publishDaily() {
  const today = getTodayDate();
  const shouldRunNewsToday = !hasDailyRunFor('news', today) || FORCE_FEED_SYNC;
  const shouldRunPlacesToday = !hasDailyRunFor('places', today) || FORCE_FEED_SYNC;

  const shouldPublishPlaces = POST_TYPE === 'all' || POST_TYPE === 'places';
  const shouldPublishNews = POST_TYPE === 'all' || POST_TYPE === 'news';
  const news = shouldPublishNews ? await getLatestNews(10) : [];
  const placesPost = shouldPublishPlaces ? getPlacesPostOfDay() : null;

  const pendingPosts = [];

  if (shouldPublishPlaces && placesPost && shouldRunPlacesToday) {
    const placesKey = getTodayKey(`places-${placesPost.items.map((item) => item.name).join('-')}`);
    if (!alreadyPublished({ link: placesKey, title: placesPost.title, date: new Date().toISOString() }) || FORCE_FEED_SYNC) {
      pendingPosts.push({
        type: 'places',
        key: placesKey,
        text: placesPost.text,
        meta: placesPost,
      });
    }
  }

  let newsPostAdded = false;
  if (shouldPublishNews && shouldRunNewsToday && news.length) {
    for (const item of news.slice(0, 3)) {
      if (alreadyPublished(item) && !FORCE_FEED_SYNC) continue;

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

      const imageUrl = await fetchOgImage(item.link).catch(() => null);

      pendingPosts.push({
        type: 'news',
        key: getNewsKey(item),
        text,
        imageUrl: imageUrl || '',
        meta: item,
      });
      newsPostAdded = true;

      break;
    }
  }

  if (shouldPublishNews && shouldRunNewsToday && !newsPostAdded) {
    const calmKey = getTodayKey('news-calm-report');
    const calmText = 'На Чайці сьогодні все мирно і спокійно — і це теж гарна новина для всіх.\n\n#ЖКЧайка #Ірпінь #КиївськаОбласть';
    if (!alreadyPublished({ link: calmKey, title: calmText, date: new Date().toISOString() }) || FORCE_FEED_SYNC) {
      pendingPosts.push({
        type: 'news',
        key: calmKey,
        text: calmText,
        meta: {
          title: calmText,
          link: process.env.SITE_URL || 'https://chaika-ua.netlify.app',
          source: 'ChaikaUA',
        },
      });
    }
  }

  for (const post of pendingPosts.slice(0, 2)) {
    const postImageUrl = post.imageUrl || (post.type === 'places' ? post.meta?.imageUrl : '');
    const result = FORCE_FEED_SYNC
      ? { result: { message_id: null } }
      : postImageUrl
        ? await sendTelegramPhoto(postImageUrl, post.text)
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
      shortText: extractFeedText(post),
      sourceName: post.type === 'news' ? (post.meta?.source || 'ChaikaUA') : 'ChaikaUA',
      sourceUrl: post.type === 'news'
        ? (post.meta?.link || process.env.SITE_URL || 'https://chaika-ua.netlify.app')
        : (process.env.SITE_URL || 'https://chaika-ua.netlify.app'),
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
    console.log(`${FORCE_FEED_SYNC ? 'Synced feed' : 'Published'}: ${post.type}`);
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
