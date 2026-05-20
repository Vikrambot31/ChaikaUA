/**
 * Tests for authSlice
 */

import authReducer, { setUser, logout } from '../redux/slices/authSlice';

describe('authSlice', () => {
  const initialState = {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    fcmToken: null,
    isBootstrapped: false,
  };

  it('should return initial state', () => {
    expect(authReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('should handle setUser', () => {
    const user = {
      id: '123',
      name: 'Test User',
      email: 'test@example.com',
      phone: '+380501234567',
      daysUsed: 0,
      registeredAt: new Date(),
      isActive: true,
      city: 'Чайка',
      registrationStatus: 'complete' as const,
    };

    const actual = authReducer(initialState, setUser(user));
    expect(actual.user).toEqual(user);
    expect(actual.isAuthenticated).toBe(true);
  });

  it('should handle logout', () => {
    const stateWithUser = {
      ...initialState,
      user: {
        id: '123',
        name: 'Test User',
        email: 'test@example.com',
        phone: '+380501234567',
        daysUsed: 0,
        registeredAt: new Date(),
        isActive: true,
        city: 'Чайка',
        registrationStatus: 'complete' as const,
      },
      isAuthenticated: true,
    };

    const actual = authReducer(stateWithUser, logout());
    expect(actual.user).toBeNull();
    expect(actual.isAuthenticated).toBe(false);
    expect(actual.isBootstrapped).toBe(true);
  });
});
