import { containsBannedWords, getBannedWords } from '../utils/rulesEngine';

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const censorText = (text: string): string => {
  let censored = text;

  getBannedWords().forEach((word) => {
    const regex = new RegExp(escapeRegExp(word), 'gi');
    censored = censored.replace(regex, '***');
  });

  return censored;
};

export const BANNED_WORDS = getBannedWords();
export { containsBannedWords };
