import { sanitizeStoredText } from '../utils/textUtils';

export type RemoteAppControlConfig = {
  app_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  minimum_required_version: string;
  force_update_required: boolean;
  allow_new_devices: boolean;
  beta_mode_enabled: boolean;
  config_version: number;
  updated_at: number;
  updated_by?: string;
  signature?: string;
};

export type RemoteConfigValidationResult =
  | { isValid: true; config: RemoteAppControlConfig }
  | { isValid: false; errors: string[]; config: RemoteAppControlConfig };

export const DEFAULT_REMOTE_APP_CONTROL_CONFIG: RemoteAppControlConfig = {
  app_enabled: true,
  maintenance_mode: false,
  maintenance_message: '',
  minimum_required_version: '0.0.0',
  force_update_required: false,
  allow_new_devices: true,
  beta_mode_enabled: false,
  config_version: 1,
  updated_at: 0,
};

const INVALID_BOOLEAN_FALLBACKS = {
  allow_new_devices: true,
  app_enabled: true,
  maintenance_mode: false,
  force_update_required: false,
  beta_mode_enabled: false,
} as const;

const normalizeVersion = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_REMOTE_APP_CONTROL_CONFIG.minimum_required_version;
  }

  const normalized = value.trim();
  return /^[0-9]+(\.[0-9A-Za-z-]+)*$/.test(normalized)
    ? normalized
    : DEFAULT_REMOTE_APP_CONTROL_CONFIG.minimum_required_version;
};

const normalizeMessage = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return sanitizeStoredText(value).slice(0, 280);
};

const normalizeBoolean = (value: unknown, fallback: boolean, invalidFallback = fallback): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  return value === undefined ? fallback : invalidFallback;
};

export const normalizeRemoteAppControlConfig = (value: unknown): RemoteAppControlConfig => {
  const raw = (value as Partial<RemoteAppControlConfig> | null) ?? {};

  return {
    app_enabled: normalizeBoolean(raw.app_enabled, DEFAULT_REMOTE_APP_CONTROL_CONFIG.app_enabled, INVALID_BOOLEAN_FALLBACKS.app_enabled),
    maintenance_mode: normalizeBoolean(raw.maintenance_mode, DEFAULT_REMOTE_APP_CONTROL_CONFIG.maintenance_mode, INVALID_BOOLEAN_FALLBACKS.maintenance_mode),
    maintenance_message: normalizeMessage(raw.maintenance_message),
    minimum_required_version: normalizeVersion(raw.minimum_required_version),
    force_update_required: normalizeBoolean(raw.force_update_required, DEFAULT_REMOTE_APP_CONTROL_CONFIG.force_update_required, INVALID_BOOLEAN_FALLBACKS.force_update_required),
    allow_new_devices: normalizeBoolean(raw.allow_new_devices, DEFAULT_REMOTE_APP_CONTROL_CONFIG.allow_new_devices, INVALID_BOOLEAN_FALLBACKS.allow_new_devices),
    beta_mode_enabled: normalizeBoolean(raw.beta_mode_enabled, DEFAULT_REMOTE_APP_CONTROL_CONFIG.beta_mode_enabled, INVALID_BOOLEAN_FALLBACKS.beta_mode_enabled),
    config_version: Number.isFinite(raw.config_version) ? Number(raw.config_version) : 1,
    updated_at: Number.isFinite(raw.updated_at) ? Number(raw.updated_at) : 0,
    updated_by: typeof raw.updated_by === 'string' ? sanitizeStoredText(raw.updated_by).slice(0, 120) : undefined,
    signature: typeof raw.signature === 'string' ? raw.signature.slice(0, 512) : undefined,
  };
};

export const validateRemoteAppControlConfig = (value: unknown): RemoteConfigValidationResult => {
  const errors: string[] = [];
  const config = normalizeRemoteAppControlConfig(value);

  // Validate the NORMALIZED config structure, not the raw input
  // (Raw input may have type mismatches that normalization corrects)
  if (typeof config.app_enabled !== 'boolean') {
    errors.push('app_enabled must be a boolean');
  }
  if (typeof config.maintenance_mode !== 'boolean') {
    errors.push('maintenance_mode must be a boolean');
  }
  if (typeof config.minimum_required_version !== 'string') {
    errors.push('minimum_required_version must be a string');
  }
  if (typeof config.force_update_required !== 'boolean') {
    errors.push('force_update_required must be a boolean');
  }
  if (typeof config.allow_new_devices !== 'boolean') {
    errors.push('allow_new_devices must be a boolean');
  }
  if (typeof config.beta_mode_enabled !== 'boolean') {
    errors.push('beta_mode_enabled must be a boolean');
  }

  if (errors.length > 0) {
    return { isValid: false, errors, config };
  }

  return { isValid: true, config };
};
