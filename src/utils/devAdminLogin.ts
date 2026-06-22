/**
 * DEV ADMIN AUTO-LOGIN — only for web preview (localhost)
 *
 * First launch: shows a prompt for the admin password.
 * Password is saved in localStorage → auto-login on subsequent launches.
 * Uses real Firebase Auth → all admin features work.
 *
 * Only active when: Platform.OS === 'web' && __DEV__
 */

import { Platform } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase-core';

// sessionStorage: cleared when browser tab is closed, password never persists to disk
const STORAGE_KEY = 'dev_admin_credentials';
const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : localStorage;
const ADMIN_EMAIL = 'vikramsave@ukr.net';

export const isDevAdminMode = (): boolean =>
  Platform.OS === 'web' && __DEV__;

/** Try auto-login with saved credentials. Returns true if signed in. */
export const tryDevAdminAutoLogin = async (): Promise<boolean> => {
  if (!isDevAdminMode()) return false;

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return false;

    const { email, password } = JSON.parse(saved);
    if (!email || !password) return false;

    await signInWithEmailAndPassword(auth, email, password);
    console.log('[DevAdmin] Auto-login successful as', email);
    return true;
  } catch (error) {
    console.warn('[DevAdmin] Auto-login failed:', error);
    // Clear invalid credentials
    storage.removeItem(STORAGE_KEY);
    return false;
  }
};

/** Sign in with password and save for future auto-login. */
export const devAdminLogin = async (password: string): Promise<void> => {
  const credential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  if (credential.user) {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ email: ADMIN_EMAIL, password }),
    );
    console.log('[DevAdmin] Login saved. Next time will auto-login.');
  }
};

/** Clear saved dev credentials. */
export const clearDevAdminCredentials = (): void => {
  storage.removeItem(STORAGE_KEY);
};

/** Get saved admin email (for display). */
export const getSavedDevAdminEmail = (): string | null => {
  if (!isDevAdminMode()) return null;
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved).email || null;
  } catch {
    return null;
  }
};
