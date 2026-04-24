import axios from 'axios';

const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function formatTelegramPost({ title, summary, source, link }) {
  return [
    `📰 Новини від додатку ChaikaUA`,
    `✨ ${normalizeText(title)}`,
    normalizeText(summary),
    `Джерело: ${normalizeText(source)}`,
    link ? `Посилання: ${normalizeText(link)}` : '',
    `Дякуємо, що користуєтеся додатком ЖК Чайка. Розкажіть свої новини та події в чаті у мобільному додатку. Скачати додаток: ${process.env.SITE_URL || 'https://chaika-ua.netlify.app'}`,
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
