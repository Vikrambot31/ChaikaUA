/**
 * Freeze Watchdog Service
 *
 * Detects when the JavaScript thread is blocked (ANR / UI freeze).
 *
 * How it works:
 *   A setInterval fires every TICK_INTERVAL_MS. Each tick measures how much
 *   time actually passed since the previous tick. If the JS thread was blocked
 *   (e.g. a synchronous heavy operation, an ANR), the interval fires late.
 *   If the delay exceeds FREEZE_THRESHOLD_MS we log it as a runtime error.
 *
 * False-positive prevention:
 *   - The watchdog pauses when the app goes to background (backgrounded apps
 *     have their JS loop suspended on both iOS and Android — that is normal).
 *   - On resume, lastTickAt is reset so the background gap is not counted.
 *   - Only delays > FREEZE_THRESHOLD_MS are reported (normal event-loop
 *     latency is < 100 ms; a true freeze is multiple seconds).
 *
 * Firebase cost: one write per detected freeze only — not on every tick.
 */

import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { recordRuntimeMonitorError } from './runtimeMonitorService';

const TICK_INTERVAL_MS = 5_000;    // watchdog checks every 5 s
const FREEZE_THRESHOLD_MS = 4_000; // extra delay beyond TICK_INTERVAL_MS before alarm
// i.e. total elapsed > 5s + 4s = 9s before we report

let tickTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let lastTickAt = 0;
let running = false;
let initialized = false;

// ─── Watchdog tick ─────────────────────────────────────────────────────────────

const onTick = (): void => {
  const now = Date.now();

  if (lastTickAt > 0) {
    const elapsed = now - lastTickAt;
    const drift = elapsed - TICK_INTERVAL_MS;

    if (drift > FREEZE_THRESHOLD_MS) {
      void recordRuntimeMonitorError({
        screen: 'FreezeWatchdog',
        error: new Error(`JS thread freeze detected: ${Math.round(drift / 1000)}s`),
        extra: {
          freezeDurationMs: drift,
          totalElapsedMs: elapsed,
          expectedIntervalMs: TICK_INTERVAL_MS,
          detectedAt: now,
        },
        source: 'runtime',
      });
    }
  }

  lastTickAt = now;
};

// ─── Start / Stop ──────────────────────────────────────────────────────────────

const startWatchdog = (): void => {
  if (running) return;
  running = true;
  lastTickAt = Date.now(); // reset baseline so first tick is clean
  tickTimer = setInterval(onTick, TICK_INTERVAL_MS);
};

const stopWatchdog = (): void => {
  if (!running) return;
  running = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
};

// ─── AppState handler ──────────────────────────────────────────────────────────

const handleAppStateChange = (nextState: AppStateStatus): void => {
  if (nextState === 'background' || nextState === 'inactive') {
    // Suspend watchdog — backgrounded JS loop pause is normal, not a freeze.
    stopWatchdog();
  } else if (nextState === 'active') {
    // Reset baseline on resume so the background gap doesn't trigger alarm.
    lastTickAt = Date.now();
    startWatchdog();
  }
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Call once at app startup.
 * Starts the heartbeat and subscribes to AppState changes.
 */
export const initFreezeWatchdog = (): void => {
  if (initialized) return;
  initialized = true;

  startWatchdog();

  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
};

/**
 * Stops all timers and listeners.
 * Call only if you need to tear down (e.g., in tests).
 */
export const teardownFreezeWatchdog = (): void => {
  stopWatchdog();
  appStateSubscription?.remove();
  appStateSubscription = null;
  initialized = false;
};
