import { get, set, update, push, remove, ref } from 'firebase/database';
import { database } from '../firebase-core';

export async function safeRead<T = unknown>(path: string, defaultValue: T | null = null): Promise<T | null> {
  try {
    const snap = await get(ref(database, path));
    return (snap.val() as T) ?? defaultValue;
  } catch (err) {
    console.error(`[Firebase] Read failed: ${path}`, err);
    return defaultValue;
  }
}

export async function safeWrite(path: string, value: unknown): Promise<boolean> {
  try {
    await set(ref(database, path), value);
    return true;
  } catch (err) {
    console.error(`[Firebase] Write failed: ${path}`, err);
    return false;
  }
}

export async function safeUpdate(path: string, value: object): Promise<boolean> {
  try {
    await update(ref(database, path), value);
    return true;
  } catch (err) {
    console.error(`[Firebase] Update failed: ${path}`, err);
    return false;
  }
}

export async function safePush(path: string, value: unknown): Promise<string | null> {
  try {
    const newRef = push(ref(database, path), value);
    return newRef.key;
  } catch (err) {
    console.error(`[Firebase] Push failed: ${path}`, err);
    return null;
  }
}

export async function safeRemove(path: string): Promise<boolean> {
  try {
    await remove(ref(database, path));
    return true;
  } catch (err) {
    console.error(`[Firebase] Remove failed: ${path}`, err);
    return false;
  }
}
