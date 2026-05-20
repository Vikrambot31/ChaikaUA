import { normalizeRemoteAppControlConfig, validateRemoteAppControlConfig } from './securityConfigValidator';

describe('securityConfigValidator', () => {
  describe('normalizeRemoteAppControlConfig', () => {
    it('keeps invalid boolean strings from enabling security-sensitive flags', () => {
      const result = normalizeRemoteAppControlConfig({
        app_enabled: 'true',
        maintenance_mode: 'false',
        force_update_required: true,
        allow_new_devices: 'true',
        beta_mode_enabled: false,
        minimum_required_version: '1.0.0',
        config_version: 1,
        updated_at: Date.now(),
        maintenance_message: 'test',
      });

      expect(typeof result.app_enabled).toBe('boolean');
      expect(result.app_enabled).toBe(true);
      expect(typeof result.maintenance_mode).toBe('boolean');
      expect(result.maintenance_mode).toBe(false);
      expect(typeof result.force_update_required).toBe('boolean');
      expect(result.force_update_required).toBe(true);
      expect(result.allow_new_devices).toBe(false);
    });

    it('should convert number version to string', () => {
      const result = normalizeRemoteAppControlConfig({
        minimum_required_version: 123,
        app_enabled: true,
        maintenance_mode: false,
        force_update_required: false,
        allow_new_devices: true,
        beta_mode_enabled: false,
        config_version: 1,
        updated_at: Date.now(),
        maintenance_message: '',
      });

      expect(typeof result.minimum_required_version).toBe('string');
      expect(result.minimum_required_version).toBe('0.0.0');
    });

    it('should handle missing fields with defaults', () => {
      const result = normalizeRemoteAppControlConfig({});

      expect(result.app_enabled).toBe(true);
      expect(result.maintenance_mode).toBe(false);
      expect(result.force_update_required).toBe(false);
      expect(result.allow_new_devices).toBe(true);
      expect(result.beta_mode_enabled).toBe(false);
      expect(result.minimum_required_version).toBe('0.0.0');
      expect(result.config_version).toBe(1);
      expect(result.updated_at).toBe(0);
    });
  });

  describe('validateRemoteAppControlConfig', () => {
    it('should validate correct config', () => {
      const config = {
        app_enabled: true,
        maintenance_mode: false,
        maintenance_message: 'test',
        minimum_required_version: '1.0.0',
        force_update_required: false,
        allow_new_devices: true,
        beta_mode_enabled: false,
        config_version: 1,
        updated_at: Date.now(),
      };

      const result = validateRemoteAppControlConfig(config);
      expect(result.isValid).toBe(true);
      if (!result.isValid) {
        expect(result.errors).toEqual([]);
      }
    });

    it('should validate config with invalid boolean types after safe normalization', () => {
      const config = {
        app_enabled: 'true',
        maintenance_mode: 'false',
        maintenance_message: 'test',
        minimum_required_version: '1.0.0',
        force_update_required: true,
        allow_new_devices: 'true',
        beta_mode_enabled: false,
        config_version: 1,
        updated_at: Date.now(),
      };

      const result = validateRemoteAppControlConfig(config);
      expect(result.isValid).toBe(true);
      expect(typeof result.config.app_enabled).toBe('boolean');
      expect(typeof result.config.maintenance_mode).toBe('boolean');
      expect(result.config.allow_new_devices).toBe(false);
    });

    it('should not enable privileged flags from invalid boolean strings', () => {
      const config = {
        app_enabled: 'true',
        maintenance_mode: 'false',
        maintenance_message: 'Maintenance in progress',
        minimum_required_version: '1.2.3',
        force_update_required: 'true',
        allow_new_devices: 'false',
        beta_mode_enabled: 'true',
        config_version: 5,
        updated_at: 1234567890,
        updated_by: 'admin-user',
      };

      const result = validateRemoteAppControlConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.config.app_enabled).toBe(true);
      expect(result.config.maintenance_mode).toBe(false);
      expect(result.config.force_update_required).toBe(false);
      expect(result.config.allow_new_devices).toBe(false);
      expect(result.config.beta_mode_enabled).toBe(false);
    });

    it('should return normalized config even when validation might report errors', () => {
      const config = {
        app_enabled: 'true',
        maintenance_mode: 'false',
        maintenance_message: 'test',
        minimum_required_version: '1.0.0',
        force_update_required: true,
        allow_new_devices: true,
        beta_mode_enabled: false,
        config_version: 1,
        updated_at: Date.now(),
      };

      const result = validateRemoteAppControlConfig(config);
      expect(result.config).toBeDefined();
      expect(result.config.app_enabled).toBe(true);
      expect(result.config.maintenance_mode).toBe(false);
    });
  });
});
