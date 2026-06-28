import { isTrustedUser, isTrustedSecurityRole } from '../utils/accessControl';

describe('accessControl', () => {
  describe('isTrustedUser', () => {
    it('returns true for any non-empty uid', () => {
      expect(isTrustedUser('user-123')).toBe(true);
    });

    it('returns false for null/undefined/empty', () => {
      expect(isTrustedUser(null)).toBe(false);
      expect(isTrustedUser(undefined)).toBe(false);
      expect(isTrustedUser('')).toBe(false);
    });
  });

  describe('isTrustedSecurityRole', () => {
    it('returns true for admin', () => {
      expect(isTrustedSecurityRole('admin')).toBe(true);
    });

    it('returns true for moderator', () => {
      expect(isTrustedSecurityRole('moderator')).toBe(true);
    });

    it('returns false for user role', () => {
      expect(isTrustedSecurityRole('user')).toBe(false);
    });
  });
});
