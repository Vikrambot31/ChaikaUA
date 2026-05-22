/**
 * Redux slice for authentication state.
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
    // Set user
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isBootstrapped = true;
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    // Set auth error
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },

    // Logout
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.error = null;
      state.fcmToken = null;
      state.isBootstrapped = true;
    },

    // Set FCM token
    setFCMToken: (state, action: PayloadAction<string | null>) => {
      state.fcmToken = action.payload;
    },

    // Clear auth error
    clearError: (state) => {
      state.error = null;
    },

    setAuthBootstrapped: (state, action: PayloadAction<boolean>) => {
      state.isBootstrapped = action.payload;
    },

    // Update days used
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

// Selectors
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectUser = (state: RootState) => state.auth.user;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectFCMToken = (state: RootState) => state.auth.fcmToken;
export const selectAuthBootstrapped = (state: RootState) => state.auth.isBootstrapped;
export const selectRegistrationStatus = (state: RootState) => state.auth.user?.registrationStatus ?? 'partial';
export const selectIsRegistrationComplete = (state: RootState) => state.auth.user?.registrationStatus === 'complete';

export default authSlice.reducer;
