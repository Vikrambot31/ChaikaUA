/**
 * Session Lifecycle Service
 *
 * Detects ungraceful app terminations (crashes, OOM kills, force-close
 * from task manager while app is in foreground).
 *
 * How it works:
 *   1. On launch: check AsyncStorage for a previous session marker.
 *      If the marker shows the app was "active" (not gracefully backgrounded)
 *      and the last heartbeat is older than CRASH_WINDOW_MS → previous session
 *      died ungracefully. Report it via recordRuntimeMonitorError.
 *   2. Write a fresh marker for the current session.
 *   3. Update lastHeartbeat every HEARTBEAT_INTERVAL_MS so we can tell the
 *      difference between "crash" and "phone off for 3 hours".
 *   4. On AppState → background/inactive: set status: 'graceful' so a normal
 *      swipe-away is not misclassified as a crash.
 *   5. On AppState → active (resume): restore status: 'active'.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { getSessionId } from './sessionService';
import { recordRuntimeMonitorError } from './runtimeMonitorService';

const STORAGE_KEY = '@chaika:session_lifecycle';
const HEARTBEAT_INTERVAL_MS = 60_000; // update AsyncStorage every 60 s
const CRASH_WINDOW_MS = 150_000;      // >2.5 min without heartbeat = likely crash

type SessionMarker = {
  sessionId: string;
  openedAt: number;
  lastHeartbeat: number;
  /** 'active' while in foreground, 'graceful' when backgrounded normally. */
  status: 'active' | 'graceful';
};

// Mutable so the heartbeat closure always reads the latest values.
let currentMarker: SessionMarker | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let initialized = false;

// ─── AsyncStorage helpers ──────────────────────────────────────────────────────

const writeMarker = async (marker: SessionMarker): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // Best-effort — never throw from lifecycle tracking
  }
};

const readMarker = async (): Promise<SessionMarker | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionMarker;
    if (
      typeof parsed?.sessionId !== 'string' ||
      typeof parsed?.openedAt !== 'number' ||
      typeof parsed?.lastHeartbeat !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const clearMarker = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
};

// ─── AppState handler ──────────────────────────────────────────────────────────

const handleAppStateChange = (nextState: AppStateStatus): void => {
  if (!currentMarker) return;

  if (nextState === 'background' || nextState === 'inactive') {
    // Normal background transition — mark graceful so next-launch won't alarm.
    currentMarker = { ...currentMarker, status: 'graceful', lastHeartbeat: Date.now() };
  } else if (nextState === 'active') {
    // Resumed from background — session is active again.
    currentMarker = { ...currentMarker, status: 'active', lastHeartbeat: Date.now() };
  }

  void writeMarker(currentMarker);
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Call once at app startup (before user interaction).
 * Checks for ungraceful termination, then opens the current session marker.
 */
export const initSessionLifecycle = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;

  // 1. Check previous session.
  const prev = await readMarker();
  if (prev) {
    const timeSinceHeartbeat = Date.now() - prev.lastHeartbeat;
    const looksLikeCrash =
      prev.status === 'active' && timeSinceHeartbeat > CRASH_WINDOW_MS;

    if (looksLikeCrash) {
      await recordRuntimeMonitorError({
        screen: 'SessionLifecycleService',
        error: new Error('Ungraceful app termination detected'),
        extra: {
          previousSessionId: prev.sessionId,
          openedAt: prev.openedAt,
          lastHeartbeat: prev.lastHeartbeat,
          timeSinceHeartbeatMs: timeSinceHeartbeat,
          terminationType: 'ungraceful',
        },
        source: 'runtime',
      });
    }
  }

  await clearMarker();

  // 2. Open new session marker.
  const now = Date.now();
  currentMarker = {
    sessionId: getSessionId(),
    openedAt: now,
    lastHeartbeat: now,
    status: 'active',
  };
  await writeMarker(currentMarker);

  // 3. Heartbeat: keep lastHeartbeat fresh so crash window is meaningful.
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!currentMarker) return;
    currentMarker = { ...currentMarker, lastHeartbeat: Date.now() };
    void writeMarker(currentMarker);
  }, HEARTBEAT_INTERVAL_MS);

  // 4. AppState listener.
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
};

/**
 * Stops the heartbeat and AppState listener.
 * Call only if you need to tear down (e.g., in tests).
 */
export const teardownSessionLifecycle = (): void => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  appStateSubscription?.remove();
  appStateSubscription = null;
  initialized = false;
};
