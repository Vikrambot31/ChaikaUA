/**
 * Build-time metadata injected by scripts/build-core.ps1.
 * Provides instant answer to "what code is running on this device?"
 */
import { APP_VERSION, APP_BUILD_DATE } from './constants';

// These are injected by build-core.ps1 into constants.ts before each build.
// If they don't exist yet (dev mode), fallback to empty strings.
let APP_BUILD_STAMP = '';
let APP_COMMIT_HASH = '';
let APP_BUILD_MODE = '';

try {
  // Dynamic import to avoid crash if constants aren't injected yet
  const c = require('./constants');
  APP_BUILD_STAMP = c.APP_BUILD_STAMP || '';
  APP_COMMIT_HASH = c.APP_COMMIT_HASH || '';
  APP_BUILD_MODE = c.APP_BUILD_MODE || '';
} catch {}

export type BuildInfo = {
  appVersion: string;
  buildDate: string;
  buildStamp: string;
  commitHash: string;
  buildMode: string;
  source: 'embedded' | 'ota' | 'unknown';
  runtimeVersion: string;
  updateId: string;
};

/**
 * Reads the build manifest baked into the APK assets.
 * Falls back to constants.ts values if manifest is unavailable.
 */
export async function getBuildInfo(): Promise<BuildInfo> {
  // Primary source: constants.ts (always available, injected at build time)
  const info: BuildInfo = {
    appVersion: APP_VERSION || 'dev',
    buildDate: APP_BUILD_DATE || 'dev',
    buildStamp: APP_BUILD_STAMP || 'dev',
    commitHash: APP_COMMIT_HASH || 'dev',
    buildMode: APP_BUILD_MODE || 'dev',
    source: 'embedded',
    runtimeVersion: APP_VERSION || 'dev',
    updateId: 'none',
  };

  // `expo-updates` may be absent in some release profiles.
  // Avoid runtime require here to prevent Hermes "unknown module" crashes.
  info.source = 'embedded';

  return info;
}
