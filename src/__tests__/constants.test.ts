/**
 * Tests for constants
 */

import { COLORS, SIZES, STORAGE_KEYS, LIMITS, DEFAULT_REGION } from '../utils/constants';

describe('Constants', () => {
  describe('COLORS', () => {
    it('should have primary color', () => {
      expect(COLORS.primary).toBeDefined();
      expect(COLORS.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should have all required colors', () => {
      expect(COLORS.secondary).toBeDefined();
      expect(COLORS.background).toBeDefined();
      expect(COLORS.error).toBeDefined();
      expect(COLORS.success).toBeDefined();
    });
  });

  describe('SIZES', () => {
    it('should have base size', () => {
      expect(SIZES.base).toBe(8);
    });

    it('should have font sizes', () => {
      expect(SIZES.fontSmall).toBeLessThan(SIZES.fontRegular);
      expect(SIZES.fontRegular).toBeLessThan(SIZES.fontMedium);
      expect(SIZES.fontMedium).toBeLessThan(SIZES.fontLarge);
    });

    it('should have radius sizes', () => {
      expect(SIZES.radiusSmall).toBeLessThan(SIZES.radiusMedium);
      expect(SIZES.radiusMedium).toBeLessThan(SIZES.radiusLarge);
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all required keys', () => {
      expect(STORAGE_KEYS.AUTH_TOKEN).toBeDefined();
      expect(STORAGE_KEYS.USER_DATA).toBeDefined();
      expect(STORAGE_KEYS.SETTINGS).toBeDefined();
      expect(STORAGE_KEYS.IS_FIRST_LAUNCH).toBeDefined();
    });

    it('should have @ prefix for AsyncStorage keys', () => {
      Object.values(STORAGE_KEYS).forEach((key) => {
        expect(key).toMatch(/^@/);
      });
    });
  });

  describe('LIMITS', () => {
    it('should have request limits', () => {
      expect(LIMITS.MAX_REQUEST_LENGTH).toBeGreaterThan(0);
      expect(LIMITS.MAX_REQUEST_TITLE_LENGTH).toBeGreaterThan(0);
    });

    it('should have reasonable limits', () => {
      expect(LIMITS.MAX_REQUEST_LENGTH).toBeLessThan(1000);
      expect(LIMITS.MAX_IMAGE_UPLOAD_COUNT).toBeLessThanOrEqual(10);
    });
  });

  describe('DEFAULT_REGION', () => {
    it('should have valid coordinates', () => {
      expect(DEFAULT_REGION.latitude).toBeGreaterThan(0);
      expect(DEFAULT_REGION.longitude).toBeGreaterThan(0);
      expect(DEFAULT_REGION.latitudeDelta).toBeGreaterThan(0);
      expect(DEFAULT_REGION.longitudeDelta).toBeGreaterThan(0);
    });

    it('should be in Ukraine (Chaika)', () => {
      // Chaika is near Kyiv
      expect(DEFAULT_REGION.latitude).toBeGreaterThan(50);
      expect(DEFAULT_REGION.latitude).toBeLessThan(51);
      expect(DEFAULT_REGION.longitude).toBeGreaterThan(30);
      expect(DEFAULT_REGION.longitude).toBeLessThan(31);
    });
  });
});
