import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GLOBAL_KEY = '@chaika:training:global';
const dismissKey = (screen: string) => `@chaika:training:dismissed:${screen}`;

/**
 * Lightweight training-hint system.
 *
 * - Global toggle persisted in AsyncStorage (default: ON for new users).
 * - Per-screen dismiss persisted forever once the user taps ✕.
 */
export function useTrainingMode(screenKey: string) {
  const [globalOn, setGlobalOn] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(GLOBAL_KEY),
      AsyncStorage.getItem(dismissKey(screenKey)),
    ])
      .then(([g, d]) => {
        if (!active) return;
        // Default to ON when user has never toggled global setting
        setGlobalOn(g !== 'off');
        setDismissed(d === '1');
      })
      .catch(() => {
        if (!active) return;
        setGlobalOn(true);
        setDismissed(false);
      });
    return () => { active = false; };
  }, [screenKey]);

  const isVisible = globalOn === true && dismissed === false;

  const dismiss = useCallback(() => {
    setDismissed(true);
    void AsyncStorage.setItem(dismissKey(screenKey), '1').catch(() => undefined);
  }, [screenKey]);

  const setGlobal = useCallback((on: boolean) => {
    setGlobalOn(on);
    void AsyncStorage.setItem(GLOBAL_KEY, on ? 'on' : 'off').catch(() => undefined);
  }, []);

  /* ── hint content visibility (tap badge → open, close → hide) ── */
  const [showHint, setShowHint] = useState(false);

  const openHint = useCallback(() => setShowHint(true), []);
  const closeHint = useCallback(() => setShowHint(false), []);

  return { isVisible, dismiss, showHint, openHint, closeHint, globalOn, setGlobal };
}
