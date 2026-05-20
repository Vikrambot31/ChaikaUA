/**
 * Basic local content moderation helpers for user-generated text.
 */

const BANNED_WORDS: string[] = [
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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const containsBannedWords = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some((word) => lowerText.includes(word));
};

export const censorText = (text: string): string => {
  let censored = text;

  BANNED_WORDS.forEach((word) => {
    const regex = new RegExp(escapeRegExp(word), 'gi');
    censored = censored.replace(regex, '***');
  });

  return censored;
};

export { BANNED_WORDS };
