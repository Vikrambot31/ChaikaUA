import axios from 'axios';

const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function getSourceLabel(link = '', source = '') {
  const normalizedLink = normalizeText(link);
  if (!normalizedLink) {
    return normalizeText(source);
  }

  try {
    const hostname = new URL(normalizedLink).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return normalizeText(source || normalizedLink);
  }
}

function getAppLabel() {
  return getSourceLabel(process.env.SITE_URL || 'https://chaika-ua.netlify.app', 'ChaikaUA');
}

export function formatTelegramPost({ title, summary, source, link }) {
  return [
    `📰 Новини від додатку ChaikaUA`,
    `✨ ${normalizeText(title)}`,
    `🧾 ${normalizeText(summary)}`,
    `📍 Джерело: ${normalizeText(source)}`,
    link ? `🔗 Посилання: ${getSourceLabel(link, source)}` : '',
    `💬 Розкажіть свої новини та події в чаті у мобільному додатку.`,
    `📲 Додаток: ${getAppLabel()}`,
  ].filter(Boolean).join('\n');
}

export async function sendTelegramMessage(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  }

  const res = await axios.post(`${BASE()}/sendMessage`, {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: true,
  });

  return res.data;
}

export async function sendTelegramPhoto(photoUrl, caption) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  }

  const res = await axios.post(`${BASE()}/sendPhoto`, {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    photo: photoUrl,
    caption,
  });

  return res.data;
}
