/**
 * Utilities for text handling and encoding protection
 */

/**
 * Safe text display - protection against encoding issues
 * Replaces incorrect characters with correct ones
 */
export const safeText = (text: string): string => {
  if (!text) return '';

  return text
    .replace(/\uFFFD/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .normalize('NFC')
    .trim();
};

/**
 * Check text encoding validity
 */
export const isValidEncoding = (text: string): boolean => {
  if (!text) return true;

  return !text.includes('\uFFFD');
};

/**
 * Normalize text for safe storage
 */
export const normalizeText = (text: string): string => {
  if (!text) return '';

  return safeText(text)
    .trim()
    .replace(/\s+/g, ' ');
};

export const normalizeMultilineText = (text: string): string => {
  if (!text) return '';

  return safeText(text)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
};

export const normalizeEmailText = (text: string): string => {
  if (!text) return '';

  return safeText(text)
    .toLowerCase()
    .replace(/\s+/g, '');
};

export const normalizePhoneText = (text: string): string => {
  if (!text) return '';

  const cleaned = safeText(text).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return `+${cleaned.slice(1).replace(/\+/g, '')}`;
  }
  return cleaned.replace(/\+/g, '');
};

export const normalizePersonName = (text: string): string => {
  if (!text) return '';

  return safeText(text)
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}'’\-. ]/gu, '')
    .trim();
};

/**
 * Safe extraction of first character (for avatars)
 */
export const getFirstChar = (text: string): string => {
  if (!text) return '?';

  const normalized = safeText(text);
  return normalized.charAt(0).toUpperCase() || '?';
};

/**
 * Ensure UTF-8 encoding for text
 */
export const ensureUTF8 = (text: string): string => {
  if (!text) return '';

  if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') {
    console.warn('[textUtils.ensureUTF8] TextEncoder/TextDecoder unavailable; returning original text.');
    return text;
  }

  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const bytes = encoder.encode(text);
    return decoder.decode(bytes);
  } catch (error) {
    console.warn('[textUtils.ensureUTF8] UTF-8 normalization failed; returning original text.', error);
    return text;
  }
};

export const sanitizeStoredText = (text: string): string => ensureUTF8(normalizeText(text));
