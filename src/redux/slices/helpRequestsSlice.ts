import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { HelpRequest } from '../../types/app';
import { Request } from '../../types/app';

export interface HelpRequestsState {
  items: HelpRequest[];
  todayItems: HelpRequest[];
  loading: boolean;
  error: string | null;
}

const initialState: HelpRequestsState = {
  items: [],
  todayItems: [],
  loading: false,
  error: null,
};

const helpRequestsSlice = createSlice({
  name: 'helpRequests',
  initialState,
  reducers: {
    addHelpRequest: (state, action: PayloadAction<HelpRequest>) => {
      state.items.unshift(action.payload);
      // Додати до звітів на сьогодні
      state.todayItems.unshift(action.payload);
    },
    setHelpRequests: (state, action: PayloadAction<HelpRequest[]>) => {
      state.items = action.payload;
    },
    setTodayHelpRequests: (state, action: PayloadAction<HelpRequest[]>) => {
      state.todayItems = action.payload;
    },
    completeHelpRequest: (state, action: PayloadAction<string>) => {
      const request = state.items.find((r) => r.id === action.payload);
      if (request) {
        request.isBurning = false;
      }
      const todayRequest = state.todayItems.find((r) => r.id === action.payload);
      if (todayRequest) {
        todayRequest.isBurning = false;
      }
    },
    removeHelpRequest: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((r) => r.id !== action.payload);
      state.todayItems = state.todayItems.filter((r) => r.id !== action.payload);
    },
    clearExpiredRequests: (state) => {
      const now = new Date();
      state.items = state.items.filter((r) => r.expiresAt > now);
      state.todayItems = state.todayItems.filter((r) => r.expiresAt > now);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    syncFromRequests: (state, action: PayloadAction<Request[]>) => {
      const mapped = action.payload
        .filter((item) => item.group === 'help_neighbors' || item.category === 'help')
        .map((item) => {
          const createdAt = new Date(item.createdAt);
          const expiresAt = typeof item.expires_at === 'number'
            ? new Date(item.expires_at)
            : new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
          return {
            id: item.id,
            userId: item.userId,
            name: item.name,
            phone: item.phone,
            description: item.description || item.text || '',
            createdAt,
            expiresAt,
            isBurning: item.status !== 'rejected' && expiresAt > new Date(),
            moderationStatus: item.status,
            submittedForModerationAt: item.moderatedAt ? new Date(item.moderatedAt).toISOString() : undefined,
            moderatedAt: item.moderatedAt ? new Date(item.moderatedAt).toISOString() : undefined,
          } as HelpRequest;
        });
      const mappedIds = new Set(mapped.map((item) => item.id));
      const localOnly = state.items.filter((item) => !mappedIds.has(item.id));
      const merged = [...localOnly, ...mapped];
      state.items = merged;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      state.todayItems = merged.filter((item) => item.createdAt >= today);
    },
  },
});

export const {
  addHelpRequest,
  setHelpRequests,
  setTodayHelpRequests,
  completeHelpRequest,
  removeHelpRequest,
  clearExpiredRequests,
  setLoading,
  setError,
  clearError,
  syncFromRequests,
} = helpRequestsSlice.actions;

// Selectors
export const selectAllHelpRequests = (state: RootState) => state.helpRequests?.items ?? [];
export const selectTodayHelpRequests = (state: RootState) => state.helpRequests?.todayItems ?? [];
export const selectActiveBurningRequests = (state: RootState) => {
  const today = state.helpRequests?.todayItems ?? [];
  return today.filter((r: HelpRequest) => r.isBurning && r.expiresAt > new Date());
};
export const selectCompletedRequests = (state: RootState) => {
  const all = state.helpRequests?.items ?? [];
  return all.filter((r: HelpRequest) => !r.isBurning);
};

export const selectYesterdayHelpRequests = (state: RootState): HelpRequest[] => {
  const all = state.helpRequests?.items ?? [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  return all.filter((r: HelpRequest) => r.createdAt >= yesterdayStart && r.createdAt < todayStart);
};
export const selectHelpRequestsLoading = (state: RootState) => state.helpRequests?.loading ?? false;
export const selectHelpRequestsError = (state: RootState) => state.helpRequests?.error ?? null;

// Фільтри по часам
export const selectHelpRequestsByTime = (state: RootState, hours: number) => {
  const today = state.helpRequests?.todayItems ?? [];
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return today.filter((r: HelpRequest) => r.createdAt > cutoffTime);
};

export default helpRequestsSlice.reducer;
