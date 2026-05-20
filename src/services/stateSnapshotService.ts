/**
 * State Snapshot Service
 * Captures a complete snapshot of app state at the moment of a critical error.
 * Attached to error reports so admins can see exactly what was happening:
 * network status, current screen, app foreground state, recent actions.
 *
 * Usage — call from runtimeMonitorService or ErrorBoundary:
 *   const snapshot = captureStateSnapshot();
 *   // attach to error extra.stateSnapshot
 *
 * Call these setters from relevant app code:
 *   setSnapshotNetworkState('wifi')        — from network listener
 *   setSnapshotCurrentScreen('HomeScreen') — from navigation (auto-done via RootNavigator)
 */

import { AppState, Platform } from 'react-native';
import { getBreadcrumbs, formatBreadcrumbs } from './breadcrumbService';
import { getSessionId } from './sessionService';

export interface StateSnapshot {
  capturedAt: number;
  sessionId: string;
  appState: string;       // 'active' | 'background' | 'inactive'
  platform: string;
  osVersion: string;
  networkState: string;
  currentScreen: string;
  breadcrumbsText: string; // formatted last 30 actions
  breadcrumbsCount: number;
}

let currentNetworkState = 'unknown';
let currentScreen = 'unknown';

export const setSnapshotNetworkState = (state: string): void => {
  currentNetworkState = String(state || 'unknown');
};

export const setSnapshotCurrentScreen = (screen: string): void => {
  currentScreen = String(screen || 'unknown');
};

export const captureStateSnapshot = (): StateSnapshot => {
  const crumbs = getBreadcrumbs();
  return {
    capturedAt: Date.now(),
    sessionId: getSessionId(),
    appState: AppState.currentState || 'unknown',
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    networkState: currentNetworkState,
    currentScreen,
    breadcrumbsText: formatBreadcrumbs(crumbs),
    breadcrumbsCount: crumbs.length,
  };
};

export const formatStateSnapshot = (snapshot: StateSnapshot): string => {
  const time = new Date(snapshot.capturedAt).toLocaleString('ru-RU');
  return [
    `=== State Snapshot [${time}] ===`,
    `Session:       ${snapshot.sessionId}`,
    `App State:     ${snapshot.appState}`,
    `Platform:      ${snapshot.platform} ${snapshot.osVersion}`,
    `Network:       ${snapshot.networkState}`,
    `Screen:        ${snapshot.currentScreen}`,
    ``,
    `--- Breadcrumbs (last ${snapshot.breadcrumbsCount} actions) ---`,
    snapshot.breadcrumbsText || '(no breadcrumbs)',
  ].join('\n');
};
