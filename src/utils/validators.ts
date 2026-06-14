import { validatePhone as validatePhoneResult } from './rulesEngine';

/**
 * УТИЛИТЫ ДЛЯ ВАЛИДАЦИИ ДАННЫХ — Chaika Life
 * Источник: Gemini Coding Partner
 * Используются в формах регистрации, создания заявок и профиля.
 */

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

export const validatePhone = (phone: string): boolean => {
  return validatePhoneResult(phone).valid;
};

export const normalizeUkrainianPhoneStrict = (phone: string): string | null => {
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (/^380\d{9}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^0\d{9}$/.test(digits)) {
    return `+38${digits}`;
  }

  return null;
};

export const isNotEmpty = (text: string): boolean => {
  return text.trim().length > 0;
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8
    && /[A-Za-zА-Яа-яІіЇїЄєҐґ]/u.test(password)
    && /\d/.test(password)
    && /[^A-Za-zА-Яа-яІіЇїЄєҐґ\d]/u.test(password);
};

export const validateName = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= 2 && /^[A-Za-zА-ЯҐЄІЇа-яґєії\u2019'\- ]+$/u.test(trimmed);
};

export const validateRequestDescription = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 130;
};
