import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
const FILE_PATH = path.join(DATA_DIR, 'published-news.json');
const DAILY_FILE_PATH = path.join(DATA_DIR, 'daily-run.json');

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

export function loadDailyRunState() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DAILY_FILE_PATH)) return null;
    return JSON.parse(fs.readFileSync(DAILY_FILE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveDailyRunState(state) {
  ensureDataDir();
  fs.writeFileSync(DAILY_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
}
