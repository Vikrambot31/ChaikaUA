import * as Crypto from 'expo-crypto';

/**
 * Генерирует криптографически безопасный случайный hex-суффикс (12 символов).
 * Заменяет Math.random().toString(36) для имён файлов и ID.
 */
export function randomSuffix(): string {
  const bytes = Crypto.getRandomBytes(6);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Генерирует полный уникальный ID: timestamp + crypto suffix.
 * Пример: "1714200000000_a3f9b2c1d4e5"
 */
export function uniqueId(): string {
  return `${Date.now()}_${randomSuffix()}`;
}
