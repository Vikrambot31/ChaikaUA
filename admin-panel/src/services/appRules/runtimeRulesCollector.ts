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
      name: 'Додаток увімкнено',
      status: boolStatus(config.app_enabled ?? config.appEnabled),
      risk: boolRisk(config.app_enabled ?? config.appEnabled),
      actualValue: boolLabel(config.app_enabled ?? config.appEnabled),
      explanation: 'Якщо вимкнено — AppAccessGuard показує екран недоступності для всіх звичайних користувачів.',
      evidence: `app_enabled=${String(config.app_enabled ?? config.appEnabled)}`,
      source,
      tags: ['runtime', 'app_control', 'app_enabled'],
      updatedAt: generatedAt,
      zone: 'monitor',
    },
    {
      id: 'runtime:maintenance_mode',
      sectionId: 'security',
      category: 'runtime',
      name: 'Режим обслуговування',
      status: boolStatus(config.maintenance_mode ?? config.maintenanceMode, true),
      risk: boolRisk(config.maintenance_mode ?? config.maintenanceMode, true),
      actualValue: boolLabel(config.maintenance_mode ?? config.maintenanceMode),
      explanation: 'Активний maintenance mode закриває додаток для користувачів без bypass-доступу.',
      evidence: `maintenance_mode=${String(config.maintenance_mode ?? config.maintenanceMode)}`,
      source,
      tags: ['runtime', 'maintenance'],
      updatedAt: generatedAt,
      zone: 'monitor',
    },
    {
      id: 'runtime:force_update_required',
      sectionId: 'security',
      category: 'runtime',
      name: 'Примусове оновлення',
      status: boolStatus(config.force_update_required, true),
      risk: boolRisk(config.force_update_required, true),
      actualValue: boolLabel(config.force_update_required),
      explanation: 'При увімкненні AppAccessGuard показує ForceUpdateScreen усім користувачам.',
      evidence: `force_update_required=${String(config.force_update_required)}`,
      source,
      tags: ['runtime', 'force_update'],
      updatedAt: generatedAt,
      zone: 'monitor',
    },
    {
      id: 'runtime:allow_new_devices',
      sectionId: 'access',
      category: 'device auth',
      name: 'Нові пристрої',
      status: boolStatus(config.allow_new_devices),
      risk: config.allow_new_devices === false ? 'medium' : boolRisk(config.allow_new_devices),
      actualValue: config.allow_new_devices === true
        ? 'Нові пристрої дозволяються автоматично'
        : boolLabel(config.allow_new_devices),
      explanation: 'Флаг впливає на первинний запис authorized_devices при вході користувача.',
      evidence: `allow_new_devices=${String(config.allow_new_devices)}`,
      source,
      tags: ['runtime', 'devices'],
      updatedAt: generatedAt,
      zone: 'monitor',
    },
    {
      id: 'runtime:beta_mode_enabled',
      sectionId: 'access',
      category: 'runtime',
      name: 'Бета-режим',
      status: boolStatus(config.beta_mode_enabled),
      risk: boolRisk(config.beta_mode_enabled),
      actualValue: boolLabel(config.beta_mode_enabled),
      explanation: 'Флаг присутній в runtime-конфізі і доступний додатку.',
      evidence: `beta_mode_enabled=${String(config.beta_mode_enabled)}`,
      source,
      tags: ['runtime', 'beta'],
      updatedAt: generatedAt,
      zone: 'reference',
    },
    {
      id: 'runtime:minimum_required_version',
      sectionId: 'limits',
      category: 'version',
      name: 'Мінімальна версія додатку',
      status: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string' ? 'active' : 'missing',
      risk: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string' ? 'low' : 'medium',
      actualValue: typeof (config.minimum_required_version ?? config.minAppVersion) === 'string'
        ? String(config.minimum_required_version ?? config.minAppVersion)
        : 'Правило не знайдено',
      explanation: 'Версія порівнюється в AppAccessGuard і може увімкнути обовʼязкове оновлення.',
      evidence: `minimum_required_version=${String(config.minimum_required_version ?? config.minAppVersion)}`,
      source,
      tags: ['runtime', 'version'],
      updatedAt: generatedAt,
      zone: 'monitor',
    },
  ];

  const featureFlags = runtime.featureFlags ?? {};
  const featureSource = createSource('runtime_config', 'feature_flags', runtime.featureFlagsPath);

  Object.entries(featureFlags).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      items.push({
        id: `feature:${key}`,
        sectionId: 'security',
        category: 'feature flags',
        name: `Feature flag: ${key}`,
        status: 'active',
        risk: 'low',
        actualValue: JSON.stringify(value),
        explanation: 'Флаг прочитано з feature_flags.',
        evidence: `${key}=${JSON.stringify(value)}`,
        source: featureSource,
        tags: ['feature_flags', key],
        updatedAt: generatedAt,
        zone: 'reference',
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
        explanation: 'Флаг прочитано з feature_flags.',
        evidence: `${key}=${JSON.stringify(value)}`,
        source: featureSource,
        tags: ['feature_flags', key],
        updatedAt: generatedAt,
        zone: 'reference',
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
      actualValue: 'Не знайдено',
      explanation: 'Feature flags не завантажено або сервер недоступний.',
      evidence: runtime.errors.join('; ') || 'feature_flags порожній або відсутній',
      source: featureSource,
      tags: ['feature_flags', 'missing'],
      updatedAt: generatedAt,
      zone: 'action',
    });
  }

  return items;
};
