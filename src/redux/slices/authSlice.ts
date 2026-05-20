/**
 * Redux слайс для управления авторизацией
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { AuthState, User } from '../../types/app';

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
  fcmToken: null,
  isBootstrapped: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Установить пользователя
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isBootstrapped = true;
    },

    // Установить режим загрузки
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    // Установить ошибку
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },

    // Логаут
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.error = null;
      state.fcmToken = null;
      state.isBootstrapped = true;
    },

    // !>E@0=8BL FCM токен
    setFCMToken: (state, action: PayloadAction<string | null>) => {
      state.fcmToken = action.payload;
    },

    // Очистить ошибку
    clearError: (state) => {
      state.error = null;
    },

    setAuthBootstrapped: (state, action: PayloadAction<boolean>) => {
      state.isBootstrapped = action.payload;
    },

    // Обновить дни использования
    updateDaysUsed: (state, action: PayloadAction<number>) => {
      if (state.user) {
        state.user.daysUsed = action.payload;
      }
    },
  },
});

export const {
  setUser,
  setLoading,
  setError,
  setFCMToken,
  logout,
  clearError,
  setAuthBootstrapped,
  updateDaysUsed,
} = authSlice.actions;

// !5;5:B>@K
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectUser = (state: RootState) => state.auth.user;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectFCMToken = (state: RootState) => state.auth.fcmToken;
export const selectAuthBootstrapped = (state: RootState) => state.auth.isBootstrapped;
export const selectRegistrationStatus = (state: RootState) => state.auth.user?.registrationStatus ?? 'partial';
export const selectIsRegistrationComplete = (state: RootState) => state.auth.user?.registrationStatus === 'complete';

export default authSlice.reducer;
