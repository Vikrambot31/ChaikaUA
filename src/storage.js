import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
const FILE_PATH = path.join(DATA_DIR, 'published-news.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadPublishedItems() {
  try {
    ensureDataDir();
    if (!fs.existsSync(FILE_PATH)) return [];
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function savePublishedItem(item) {
  ensureDataDir();
  const current = loadPublishedItems();
  current.unshift(item);
  fs.writeFileSync(FILE_PATH, JSON.stringify(current.slice(0, 500), null, 2), 'utf8');
}
