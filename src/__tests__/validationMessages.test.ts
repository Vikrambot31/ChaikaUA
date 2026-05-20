/**
 * Tests for FormValidator utility
 */

import { FormValidator } from '../utils/validationMessages';

describe('FormValidator', () => {
  describe('validateName', () => {
    it('should return error for empty name', () => {
      const result = FormValidator.validateName('');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('name');
    });

    it('should return error for name too short', () => {
      const result = FormValidator.validateName('A');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('коротке');
    });

    it('should return error for name too long', () => {
      const result = FormValidator.validateName('A'.repeat(51));
      expect(result).not.toBeNull();
      expect(result?.message).toContain('довге');
    });

    it('should return null for valid name', () => {
      const result = FormValidator.validateName('Іван Петренко');
      expect(result).toBeNull();
    });
  });

  describe('validatePhone', () => {
    it('should return error for empty phone', () => {
      const result = FormValidator.validatePhone('');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('phone');
    });

    it('should return error for phone too short', () => {
      const result = FormValidator.validatePhone('123');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('короткий');
    });

    it('should return null for valid phone', () => {
      const result = FormValidator.validatePhone('+380501234567');
      expect(result).toBeNull();
    });

    it('should handle phone with spaces and dashes', () => {
      const result = FormValidator.validatePhone('+380 50 123 45 67');
      expect(result).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it('should return error for empty email', () => {
      const result = FormValidator.validateEmail('');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('email');
    });

    it('should return error for invalid email format', () => {
      const result = FormValidator.validateEmail('invalid-email');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('формат');
    });

    it('should return null for valid email', () => {
      const result = FormValidator.validateEmail('user@example.com');
      expect(result).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return error for empty password', () => {
      const result = FormValidator.validatePassword('');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('password');
    });

    it('should return error for password too short', () => {
      const result = FormValidator.validatePassword('Pass1');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('короткий');
    });

    it('should return error for password without uppercase', () => {
      const result = FormValidator.validatePassword('password123');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('великі літери');
    });

    it('should return error for password without lowercase', () => {
      const result = FormValidator.validatePassword('PASSWORD123');
      expect(result).not.toBeNull();
    });

    it('should return error for password without numbers', () => {
      const result = FormValidator.validatePassword('Password');
      expect(result).not.toBeNull();
    });

    it('should return null for valid password', () => {
      const result = FormValidator.validatePassword('MyPassword123');
      expect(result).toBeNull();
    });
  });

  describe('validateDescription', () => {
    it('should return error for empty description', () => {
      const result = FormValidator.validateDescription('');
      expect(result).not.toBeNull();
      expect(result?.field).toBe('description');
    });

    it('should return error for description too short', () => {
      const result = FormValidator.validateDescription('Short', 10);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('короткий');
    });

    it('should return error for description too long', () => {
      const result = FormValidator.validateDescription('A'.repeat(501), 10, 500);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('довгий');
    });

    it('should return null for valid description', () => {
      const result = FormValidator.validateDescription('This is a valid description with enough text');
      expect(result).toBeNull();
    });
  });

  describe('validateRequest', () => {
    it('should validate all fields', () => {
      const result = FormValidator.validateRequest({
        name: 'Іван',
        phone: '+380501234567',
        description: 'Valid description with enough text',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid fields', () => {
      const result = FormValidator.validateRequest({
        name: 'A',
        phone: '123',
        description: 'Short',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getFirstErrorMessage', () => {
    it('should return null for empty errors', () => {
      const result = FormValidator.getFirstErrorMessage([]);
      expect(result).toBeNull();
    });

    it('should return first error message', () => {
      const errors = [
        { field: 'name', message: 'Error 1' },
        { field: 'phone', message: 'Error 2' },
      ];
      const result = FormValidator.getFirstErrorMessage(errors);
      expect(result).toBe('Error 1');
    });
  });
});
