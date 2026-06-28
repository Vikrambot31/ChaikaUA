jest.mock('../utils/rulesEngine', () => ({
  validatePhone: (phone: string) => ({
    valid: /^\+380\d{9}$/.test(phone.replace(/[^\d+]/g, '')),
  }),
}));

import {
  validateEmail,
  normalizeUkrainianPhoneStrict,
  isNotEmpty,
  validatePassword,
  validateName,
  validateRequestDescription,
} from '../utils/validators';

describe('validators', () => {
  describe('validateEmail', () => {
    it('accepts valid email', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });

    it('rejects email without @', () => {
      expect(validateEmail('userexample.com')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validateEmail('')).toBe(false);
    });

    it('trims whitespace', () => {
      expect(validateEmail('  user@example.com  ')).toBe(true);
    });
  });

  describe('normalizeUkrainianPhoneStrict', () => {
    it('normalizes +380 format', () => {
      expect(normalizeUkrainianPhoneStrict('+380501234567')).toBe('+380501234567');
    });

    it('normalizes 0XX format to +380', () => {
      expect(normalizeUkrainianPhoneStrict('0501234567')).toBe('+380501234567');
    });

    it('strips non-digit characters', () => {
      expect(normalizeUkrainianPhoneStrict('+38 (050) 123-45-67')).toBe('+380501234567');
    });

    it('returns null for non-Ukrainian numbers', () => {
      expect(normalizeUkrainianPhoneStrict('+1234567890')).toBeNull();
    });

    it('returns null for too short numbers', () => {
      expect(normalizeUkrainianPhoneStrict('050123')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeUkrainianPhoneStrict('')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('accepts valid password with letter, digit, special char', () => {
      expect(validatePassword('MyPass1!')).toBe(true);
    });

    it('accepts password with Cyrillic characters', () => {
      expect(validatePassword('Пароль1!')).toBe(true);
    });

    it('rejects password shorter than 8 chars', () => {
      expect(validatePassword('Pa1!')).toBe(false);
    });

    it('rejects password without digit', () => {
      expect(validatePassword('MyPasswo!')).toBe(false);
    });

    it('rejects password without special char', () => {
      expect(validatePassword('MyPasswo1')).toBe(false);
    });

    it('rejects password without letter', () => {
      expect(validatePassword('12345678!')).toBe(false);
    });
  });

  describe('validateName', () => {
    it('accepts valid Ukrainian name', () => {
      expect(validateName('Іван')).toBe(true);
    });

    it('accepts name with apostrophe', () => {
      expect(validateName("Ів'ян")).toBe(true);
    });

    it('accepts name with hyphen', () => {
      expect(validateName('Анна-Марія')).toBe(true);
    });

    it('rejects single character', () => {
      expect(validateName('A')).toBe(false);
    });

    it('rejects name with digits', () => {
      expect(validateName('Ivan123')).toBe(false);
    });

    it('trims whitespace before validation', () => {
      expect(validateName('  Іван  ')).toBe(true);
    });
  });

  describe('validateRequestDescription', () => {
    it('accepts valid description', () => {
      expect(validateRequestDescription('Потрібна допомога')).toBe(true);
    });

    it('rejects empty description', () => {
      expect(validateRequestDescription('')).toBe(false);
      expect(validateRequestDescription('   ')).toBe(false);
    });

    it('rejects description over 130 chars', () => {
      expect(validateRequestDescription('x'.repeat(131))).toBe(false);
    });

    it('accepts description at exactly 130 chars', () => {
      expect(validateRequestDescription('x'.repeat(130))).toBe(true);
    });
  });

  describe('isNotEmpty', () => {
    it('returns true for non-empty string', () => {
      expect(isNotEmpty('hello')).toBe(true);
    });

    it('returns false for whitespace-only string', () => {
      expect(isNotEmpty('   ')).toBe(false);
    });
  });
});
