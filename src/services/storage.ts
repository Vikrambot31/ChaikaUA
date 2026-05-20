/**
 * Сервіс локального сховища - Chaika Life
 * Источник: Gemini Coding Partner
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../utils/constants';
import { secureGet, secureRemove, secureSet } from '../utils/secureStorage';

// --- AUTH TOKEN (encrypted) ---

export const saveToken = async (token: string): Promise<void> => {
  try {
    await secureSet(STORAGE_KEYS.AUTH_TOKEN, token);
  } catch {
  }
};

export const getToken = async (): Promise<string | null> => {
  try {
    return await secureGet(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
    return null;
  }
};

export const removeToken = async (): Promise<void> => {
  try {
    await secureRemove(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
  }
};

// --- USAGE STATISTICS ---

export const getDaysUsed = async (): Promise<number> => {
  try {
    const days = await AsyncStorage.getItem('@days_used');
    return days ? parseInt(days, 10) : 0;
  } catch (error) {
    return 0;
  }
};

export const incrementDaysUsed = async (): Promise<void> => {
  try {
    const currentDays = await getDaysUsed();
    await AsyncStorage.setItem('@days_used', (currentDays + 1).toString());
  } catch (error) {
  }
};

// --- SETTINGS ---

export const saveSettings = async (settings: object): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(settings);
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, jsonValue);
  } catch (error) {
  }
};

export const getSettings = async <T>(): Promise<T | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    return null;
  }
};

// --- SYSTEM ---

export const clearAll = async (): Promise<void> => {
  try {
    await AsyncStorage.clear();
  } catch (error) {
  }
};

