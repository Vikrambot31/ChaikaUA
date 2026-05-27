import { get, ref } from 'firebase/database';
import { database } from '../firebase-core';
import { CACHE_TTL, cacheGet, cacheSet } from './cacheLayer';

export type ValidationResult = {
  valid: boolean;
  message?: string;
};

type SponsorPhoneResult = { normalized: string } | { error: string };

const PHONE_RE = /^\+380\d{9}$/;
const BANNED_WORDS_CACHE_KEY = 'rules_engine:banned_words';
const BANNED_WORDS_TTL_MS = 30 * 60 * 1000;

export const DEFAULT_BANNED_WORDS: string[] = [
  'хуй',
  'пизд',
  'ебат',
  'ёбат',
  'бляд',
  'сука',
  'курва',
  'мудак',
  'гандон',
  'чмо',
  'спам',
  'реклама',
  'продам дешево',
  'куплю дешево',
];

let activeBannedWords = DEFAULT_BANNED_WORDS;

const normalizeWords = (value: unknown): string[] => {
  const rawWords = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];

  const words = rawWords
    .map((word) => String(word || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(words));
};

export const validatePhone = (phone: string): ValidationResult => {
  const valid = PHONE_RE.test(String(phone || '').trim());
  return valid ? { valid: true } : { valid: false, message: 'Формат: +380XXXXXXXXX' };
};

export const normalizeSponsorPhone = (phone: string): SponsorPhoneResult => {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalizedDigits = digits.startsWith('0') ? `380${digits.slice(1)}` : digits;
  const normalized = `+${normalizedDigits}`;

  if (!PHONE_RE.test(normalized)) {
    return { error: 'Формат: +380XXXXXXXXX (9 цифр после 380)' };
  }

  return { normalized };
};

export const normalizeSponsorPhoneValue = (phone: string): string => {
  const result = normalizeSponsorPhone(phone);
  return 'normalized' in result ? result.normalized : String(phone || '').trim();
};

export const validateTextLength = (text: string, min: number, max: number): ValidationResult => {
  const length = String(text || '').trim().length;
  if (length < min) return { valid: false, message: `Минимум ${min} символов` };
  if (length > max) return { valid: false, message: `Максимум ${max} символов` };
  return { valid: true };
};

export const refreshBannedWordsFromSecurityConfig = async (): Promise<string[]> => {
  const cached = await cacheGet<string[]>(BANNED_WORDS_CACHE_KEY);
  if (cached && cached.length > 0) {
    activeBannedWords = cached;
    return activeBannedWords;
  }

  try {
    const snapshot = await get(ref(database, 'security_config/content_moderation/banned_words'));
    const words = normalizeWords(snapshot.val());
    if (words.length > 0) {
      activeBannedWords = words;
      await cacheSet(BANNED_WORDS_CACHE_KEY, words, BANNED_WORDS_TTL_MS);
    }
  } catch {
    await cacheSet(BANNED_WORDS_CACHE_KEY, activeBannedWords, CACHE_TTL.securityConfig).catch(() => undefined);
  }

  return activeBannedWords;
};

export const getBannedWords = (): string[] => activeBannedWords;

export const containsBannedWords = (text: string): boolean => {
  const lowerText = String(text || '').toLowerCase();
  return activeBannedWords.some((word) => lowerText.includes(word));
};

export const validatePrice = (price: string): ValidationResult => {
  const value = String(price || '').trim().toLowerCase();
  if (value === 'договорная' || value === 'бесплатно') return { valid: true };
  if (/^\d+([.,]\d{1,2})?$/.test(value) && Number(value.replace(',', '.')) >= 0) return { valid: true };
  return { valid: false, message: 'Укажите число, «договорная» или «бесплатно»' };
};

export const formatPhoneForConfirmation = (phone: string): string => {
  const result = normalizeSponsorPhone(phone);
  if (!('normalized' in result)) return String(phone || '').trim();
  const digits = result.normalized.slice(1);
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
};
