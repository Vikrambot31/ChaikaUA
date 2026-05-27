import type { AppRuleItem, AppRulesRuntimeState } from '../../types/appRules';
import { createSource } from './rulesRegistry';
import { LOCAL_API, LOCAL_MODE } from '../../local/LOCAL_MODE';
import { get, ref } from 'firebase/database';
import { database } from '../../firebase/firebase';

// LOCAL_MODE=true  → читаем из json-server (localhost:3001)
// LOCAL_MODE=false → читаем из Firebase RTDB

const LOCAL_APP_CONTROL_PATH = 'app_control';
const LOCAL_FEATURE_FLAGS_PATH = 'feature_flags';

const FIREBASE_APP_CONTROL_PATH = 'security_config/app_control/current';
const FIREBASE_FEATURE_FLAGS_PATH = 'feature_flags';

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readLocalEndpoint = async (endpoint: string): Promise<{ value: Record<string, unknown> | null; error?: string }> => {
  try {
    const res = await fetch(`${LOCAL_API}/${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${endpoint}`);
    const data: unknown = await res.json();
    return { value: toRecord(data) };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const readFirebaseEndpoint = async (path: string): Promise<{ value: Record<string, unknown> | null; error?: string }> => {
  try {
    const snapshot = await get(ref(database, path));
    return { value: toRecord(snapshot.val()) };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const collectRuntimeRules = async (): Promise<AppRulesRuntimeState> => {
  const loadedAt = Date.now();

  if (LOCAL_MODE) {
    const [appControl, featureFlags] = await Promise.all([
      readLocalEndpoint(LOCAL_APP_CONTROL_PATH),
      readLocalEndpoint(LOCAL_FEATURE_FLAGS_PATH),
    ]);
    return {
      appControl: appControl.value,
      featureFlags: featureFlags.value,
      securityConfig: appControl.value,
      appControlPath: `${LOCAL_API}/${LOCAL_APP_CONTROL_PATH}`,
      featureFlagsPath: `${LOCAL_API}/${LOCAL_FEATURE_FLAGS_PATH}`,
      loadedAt,
      errors: [appControl.error, featureFlags.error].filter((item): item is string => Boolean(item)),
    };
  }

  // Production: Firebase RTDB
  const [appControl, featureFlags] = await Promise.all([
    readFirebaseEndpoint(FIREBASE_APP_CONTROL_PATH),
    readFirebaseEndpoint(FIREBASE_FEATURE_FLAGS_PATH),
  ]);

  return {
    appControl: appControl.value,
    featureFlags: featureFlags.value,
    securityConfig: appControl.value,
    appControlPath: FIREBASE_APP_CONTROL_PATH,
    featureFlagsPath: FIREBASE_FEATURE_FLAGS_PATH,
    loadedAt,
    errors: [appControl.error, featureFlags.error].filter((item): item is string => Boolean(item)),
  };
};

const boolLabel = (value: unknown): string => {
  if (value === true) return 'Включено';
  if (value === false) return 'Выключено';
  return 'Правило не найдено';
};

const boolStatus = (value: unknown, dangerWhenTrue = false): AppRuleItem['status'] => {
  if (typeof value !== 'boolean') return 'missing';
  if (dangerWhenTrue && value) return 'warning';
  return 'active';
};

const boolRisk = (value: unknown, dangerWhenTrue = false): AppRuleItem['risk'] => {
  if (typeof value !== 'boolean') return 'medium';
  if (dangerWhenTrue && value) return 'medium';
  return 'low';
};

export const buildRuntimeRuleItems = (
  runtime: AppRulesRuntimeState,
  generatedAt: number,
): AppRuleItem[] => {
  const config = runtime.appControl ?? {};
  const source = createSource('runtime_config', 'app_control', runtime.appControlPath);

  const items: AppRuleItem[] = [
    {
      id: 'runtime:app_enabled',
      sectionId: 'security',
      category: 'runtime',
      name: 'Приложение включено',
      status: boolStatus(config.app_enabled ?? config.appEnabled),
      risk: boolRisk(config.app_enabled ?? config.appEnabled),
      actualValue: boolLabel(config.app_enabled ?? config.appEnabled),
      explanation: 'Если выключено, AppAccessGuard показывает экран недоступности для обычных пользователей.',
      evidence: `app_enabled=${String(config.app_enabled ?? config.appEnabled)}`,
      source,
      tags: ['runtime', 'app_control', 'app_enabled'],
      updatedAt: generatedAt,
    },
    {
      id: 'runtime:maintenance_mode',
      sectionId: 'security',
      category: 'runtime',
      name: 'Режим обслуживания',
      status: boolStatus(config.maintenance_mode ?? config.maintenanceMode, true),
      risk: boolRisk(config.maintenance_mode ?? config.maintenanceMode, true),
      actualValue: boolLabel(config.maintenance_mode ?? config.maintenanceMode),
      explanation: 'Активный maintenance mode закрывает приложение для пользователей без bypass-доступа.',
      evidence: `maintenance_mode=${String(config.maintenance_mode ?? config.maintenanceMode)}`,
      source,
      tags: ['runtime', 'maintenance'],
      updatedAt: generatedAt,
    },
    {
      id: 'runtime:force_update_required',
      sectionId: 'security',
      category: 'runtime',
      name: 'Принудительное обновление',
      status: boolStatus(config.force_update_required, true),
      risk: boolRisk(config.force_update_required, true),
      actualValue: boolLabel(config.force_update_required),
      explanation: 'При включении AppAccessGuard показывает ForceUpdateScreen.',
      evidence: `force_update_required=${String(config.force_update_required)}`,
      source,
      tags: ['runtime', 'force_update'],
      updatedAt: generatedAt,
    },
    {
      id: 'runtime:allow_new_devices',
      sectionId: 'access',
      category: 'device auth',
      name: 'Новые устройства',
      status: boolStatus(config.allow_new_devices),
      risk: config.allow_new_devices === false ? 'medium' : boolRisk(config.allow_new_devices),
      actualValue: config.allow_new_devices === true
        ? 'Новые устройства разрешаются автоматически'
        : boolLabel(config.allow_new_devices),
      explanation: 'Флаг влияет на первичную запись authorized_devices при входе пользователя.',
      evidence: `allow_new_devices=${String(config.allow_new_devices)}`,
      source,
      tags: ['runtime', 'devices'],
      updatedAt: generatedAt,
    },
    {
      id: 'runtime:beta_mode_enabled',
      sectionId: 'access',
      category: 'runtime',
      name: 'Бета-режим',
      status: boolStatus(config.beta_mode_enabled),
      risk: boolRisk(config.beta_mode_enabled),
      actualValue: boolLabel(config.beta_mode_enabled),
      explanation: 'Флаг присутствует в runtime-конфиге и доступен приложению.',
      evidence: `beta_mode_enabled=${String(config.beta_mode_enabled)}`,
      source,
      tags: ['runtime', 'beta'],
      updatedAt: generatedAt,
    },
    {
      id: 'runtime:minimum_required_version',
      sectionId: 'limits',
      category: 'version',
      name: 'Минимальная версия приложения',
      status: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string' ? 'active' : 'missing',
      risk: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string' ? 'low' : 'medium',
      actualValue: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string'
        ? String(config.minimum_required_version ?? config.minAppVersion)
        : 'Правило не найдено',
      explanation: 'Версия сравнивается в AppAccessGuard и может включить обязательное обновление.',
      evidence: `minimum_required_version=${String(config.minimum_required_version ?? config.minAppVersion)}`,
      source,
      tags: ['runtime', 'version'],
      updatedAt: generatedAt,
    },
  ];

  const featureFlags = runtime.featureFlags ?? {};
  const featureSource = createSource('runtime_config', 'feature_flags', runtime.featureFlagsPath);

  Object.entries(featureFlags).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Вложенный объект (например, invite_access) — показываем как один элемент
      items.push({
        id: `feature:${key}`,
        sectionId: 'security',
        category: 'feature flags',
        name: `Feature flag: ${key}`,
        status: 'active',
        risk: 'low',
        actualValue: JSON.stringify(value),
        explanation: 'Флаг прочитан из локального конфига feature_flags.',
        evidence: `${key}=${JSON.stringify(value)}`,
        source: featureSource,
        tags: ['feature_flags', key],
        updatedAt: generatedAt,
      });
    } else {
      items.push({
        id: `feature:${key}`,
        sectionId: 'security',
        category: 'feature flags',
        name: `Feature flag: ${key}`,
        status: typeof value === 'boolean' ? 'active' : 'info',
        risk: 'low',
        actualValue: typeof value === 'boolean' ? boolLabel(value) : JSON.stringify(value),
        explanation: 'Флаг прочитан из локального конфига feature_flags.',
        evidence: `${key}=${JSON.stringify(value)}`,
        source: featureSource,
        tags: ['feature_flags', key],
        updatedAt: generatedAt,
      });
    }
  });

  if (!Object.keys(featureFlags).length) {
    items.push({
      id: 'feature:missing',
      sectionId: 'security',
      category: 'feature flags',
      name: 'Feature flags',
      status: 'missing',
      risk: 'medium',
      actualValue: 'Правило не найдено',
      explanation: 'В локальном конфиге не найден активный набор feature_flags или сервер недоступен.',
      evidence: runtime.errors.join('; ') || 'feature_flags пуст или отсутствует',
      source: featureSource,
      tags: ['feature_flags', 'missing'],
      updatedAt: generatedAt,
    });
  }

  return items;
};
