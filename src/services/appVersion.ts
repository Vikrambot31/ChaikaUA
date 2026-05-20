import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { APP_VERSION } from '../utils/constants';

const VERSION_CACHE_KEY = '@chaika:remote_version_config_v1';
const DEFAULT_VERSION_CONFIG_URL = 'https://chaika-life.netlify.app/app-version.json';
const VERSION_CONFIG_TIMEOUT_MS = 4500;

export type RemoteAppVersionConfig = {
  latestVersion: string;
  minSupportedVersion: string;
  forceUpdate?: boolean;
  updateTitle?: string;
  updateText?: string;
  androidUrl?: string;
  iosUrl?: string;
  webUrl?: string;
  landingUrl?: string;
};

export type VersionCheckResult = {
  currentVersion: string;
  requiresUpdate: boolean;
  hasNewVersion: boolean;
  config?: RemoteAppVersionConfig;
  configUrl: string;
};

export const getCurrentAppVersion = (): string =>
  Application.nativeApplicationVersion || Constants.expoConfig?.version || APP_VERSION;

export const getVersionConfigUrl = (): string => {
  const extraUrl = Constants.expoConfig?.extra?.versionConfigUrl;
  return typeof extraUrl === 'string' && extraUrl.trim() ? extraUrl : DEFAULT_VERSION_CONFIG_URL;
};

export const compareVersions = (left: string, right: string): number => {
  const normalize = (value: string) =>
    value
      .split('.')
      .map((part) => Number.parseInt(part.replace(/[^0-9]/g, ''), 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const a = normalize(left);
  const b = normalize(right);
  const length = Math.max(a.length, b.length, 3);

  for (let index = 0; index < length; index += 1) {
    const current = a[index] ?? 0;
    const required = b[index] ?? 0;
    if (current > required) return 1;
    if (current < required) return -1;
  }

  return 0;
};

const isValidConfig = (value: unknown): value is RemoteAppVersionConfig => {
  const config = value as Partial<RemoteAppVersionConfig>;
  return Boolean(
    config &&
      typeof config.latestVersion === 'string' &&
      typeof config.minSupportedVersion === 'string'
  );
};

const loadCachedConfig = async (): Promise<RemoteAppVersionConfig | undefined> => {
  const raw = await AsyncStorage.getItem(VERSION_CACHE_KEY);
  if (!raw) return undefined;

  const parsed = JSON.parse(raw) as unknown;
  return isValidConfig(parsed) ? parsed : undefined;
};

const fetchRemoteConfig = async (url: string): Promise<RemoteAppVersionConfig> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERSION_CONFIG_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${url}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Version config request failed: ${response.status}`);
  }

  const parsed = (await response.json()) as unknown;
  if (!isValidConfig(parsed)) {
    throw new Error('Version config has invalid shape');
  }

  await AsyncStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(parsed));
  return parsed;
};

export const checkAppVersion = async (): Promise<VersionCheckResult> => {
  const currentVersion = getCurrentAppVersion();
  const configUrl = getVersionConfigUrl();
  let config: RemoteAppVersionConfig | undefined;

  try {
    config = await fetchRemoteConfig(configUrl);
  } catch {
    config = await loadCachedConfig();
  }

  if (!config) {
    return { currentVersion, requiresUpdate: false, hasNewVersion: false, configUrl };
  }

  const isBelowMinimum = compareVersions(currentVersion, config.minSupportedVersion) < 0;
  const hasNewVersion = compareVersions(currentVersion, config.latestVersion) < 0;
  const requiresUpdate = isBelowMinimum;

  return {
    currentVersion,
    requiresUpdate,
    hasNewVersion,
    config,
    configUrl,
  };
};
