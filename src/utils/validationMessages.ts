/**
 * Валидация форм и сообщений об ошибках
 */

import { translations, Language } from '../i18n/translations';

export interface ValidationError {
  field: string;
  message: string;
  tip?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export class FormValidator {
  private static language: Language = 'ua';

  static setLanguage(lang: Language): void {
    this.language = lang;
  }

  private static t(key: keyof typeof translations.ua.errors): string {
    return translations[this.language].errors[key];
  }

  // Валидация имени
  static validateName(name: string): ValidationError | null {
    if (!name || name.trim().length === 0) {
      return {
        field: 'name',
        message: this.t('nameRequired'),
        tip: this.t('checkName'),
      };
    }

    if (name.trim().length < 2) {
      return {
        field: 'name',
        message: this.t('nameTooShort'),
        tip: this.t('checkName'),
      };
    }

    if (name.trim().length > 50) {
      return {
        field: 'name',
        message: this.t('nameTooLong'),
        tip: this.t('checkName'),
      };
    }

    return null;
  }

  // Валідація номеру телефону
  static validatePhone(phone: string): ValidationError | null {
    if (!phone || phone.trim().length === 0) {
      return {
        field: 'phone',
        message: this.t('phoneRequired'),
        tip: this.t('checkPhone'),
      };
    }

    // Видалити всі не цифри
    const digitsOnly = phone.replace(/\D/g, '');

    if (digitsOnly.length < 10) {
      return {
        field: 'phone',
        message: this.t('phoneTooShort'),
        tip: this.t('checkPhone'),
      };
    }

    if (digitsOnly.length > 13) {
      return {
        field: 'phone',
        message: this.t('phoneTooLong'),
        tip: this.t('checkPhone'),
      };
    }

    return null;
  }

  // Валідація email
  static validateEmail(email: string): ValidationError | null {
    if (!email || email.trim().length === 0) {
      return {
        field: 'email',
        message: this.t('emailRequired'),
        tip: 'user@example.com',
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        field: 'email',
        message: this.t('emailInvalid'),
        tip: 'user@example.com',
      };
    }

    return null;
  }

  // Валідація пароля
  static validatePassword(password: string): ValidationError | null {
    if (!password || password.length === 0) {
      return {
        field: 'password',
        message: this.t('passwordRequired'),
        tip: this.t('checkData'),
      };
    }

    if (password.length < 8) {
      return {
        field: 'password',
        message: this.t('passwordTooShort'),
        tip: this.t('checkData'),
      };
    }

    if (password.length > 50) {
      return {
        field: 'password',
        message: this.t('passwordTooLong'),
        tip: this.t('checkData'),
      };
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      return {
        field: 'password',
        message: this.t('passwordWeak'),
        tip: 'MyPassword123',
      };
    }

    return null;
  }

  // Валідація опису/повідомлення
  static validateDescription(text: string, minLength = 10, maxLength = 500): ValidationError | null {
    if (!text || text.trim().length === 0) {
      return {
        field: 'description',
        message: this.t('descriptionRequired'),
        tip: this.t('checkData'),
      };
    }

    if (text.trim().length < minLength) {
      return {
        field: 'description',
        message: this.t('descriptionTooShort'),
        tip: this.t('checkData'),
      };
    }

    if (text.trim().length > maxLength) {
      return {
        field: 'description',
        message: this.t('descriptionTooLong'),
        tip: this.t('checkData'),
      };
    }

    return null;
  }

  // Валідація заявки
  static validateRequest(data: {
    name?: string;
    phone?: string;
    description?: string;
  }): ValidationResult {
    const errors: ValidationError[] = [];

    if (data.name !== undefined) {
      const nameError = this.validateName(data.name);
      if (nameError) errors.push(nameError);
    }

    if (data.phone !== undefined) {
      const phoneError = this.validatePhone(data.phone);
      if (phoneError) errors.push(phoneError);
    }

    if (data.description !== undefined) {
      const descError = this.validateDescription(data.description);
      if (descError) errors.push(descError);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Валідація реєстрації
  static validateRegistration(data: {
    email?: string;
    password?: string;
    name?: string;
    phone?: string;
  }): ValidationResult {
    const errors: ValidationError[] = [];

    if (data.email !== undefined) {
      const emailError = this.validateEmail(data.email);
      if (emailError) errors.push(emailError);
    }

    if (data.password !== undefined) {
      const passwordError = this.validatePassword(data.password);
      if (passwordError) errors.push(passwordError);
    }

    if (data.name !== undefined) {
      const nameError = this.validateName(data.name);
      if (nameError) errors.push(nameError);
    }

    if (data.phone !== undefined) {
      const phoneError = this.validatePhone(data.phone);
      if (phoneError) errors.push(phoneError);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Отримати перше повідомлення про помилку
  static getFirstErrorMessage(errors: ValidationError[]): string | null {
    if (errors.length === 0) return null;
    return errors[0].message;
  }

  // Отримати поради для поля
  static getFieldTip(errors: ValidationError[], field: string): string | null {
    const error = errors.find((e) => e.field === field);
    return error?.tip || null;
  }
}

export default FormValidator;
