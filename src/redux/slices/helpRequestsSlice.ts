import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { HelpRequest } from '../../types/app';
import { Request } from '../../types/app';

export interface HelpRequestsState {
  items: HelpRequest[];
  todayItems: HelpRequest[];
  hiddenIds: string[];
  loading: boolean;
  error: string | null;
}

const initialState: HelpRequestsState = {
  items: [],
  todayItems: [],
  hiddenIds: [],
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
      if (!state.hiddenIds.includes(action.payload)) {
        state.hiddenIds.push(action.payload);
      }
      state.items = state.items.filter((r) => r.id !== action.payload);
      state.todayItems = state.todayItems.filter((r) => r.id !== action.payload);
    },
    clearExpiredRequests: (state) => {
      const nowIso = new Date().toISOString();
      state.items = state.items.filter((r) => r.expiresAt > nowIso);
      state.todayItems = state.todayItems.filter((r) => r.expiresAt > nowIso);
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
      const now = new Date();
      const mapped = action.payload
        .filter((item) => item.group === 'help_neighbors' || item.group === 'care' || item.category === 'help' || item.category === 'care')
        .map((item) => {
          const createdAtDate = new Date(item.createdAt);
          const expiresAtDate = typeof item.expires_at === 'number'
            ? new Date(item.expires_at)
            : new Date(createdAtDate.getTime() + 24 * 60 * 60 * 1000);
          return {
            id: item.id,
            userId: item.userId,
            name: item.name,
            phone: item.phone,
            description: item.description || item.text || '',
            category: item.category,
            group: item.group,
            subcategory: item.subcategory,
            photoUri: item.photoUri,
            photoStoragePath: item.photoStoragePath,
            createdAt: createdAtDate.toISOString(),
            expiresAt: expiresAtDate.toISOString(),
            isBurning: item.status !== 'rejected' && expiresAtDate > now,
            moderationStatus: item.status,
            submittedForModerationAt: item.moderatedAt ? new Date(item.moderatedAt).toISOString() : undefined,
            moderatedAt: item.moderatedAt ? new Date(item.moderatedAt).toISOString() : undefined,
          } as HelpRequest;
        });
      const merged = mapped.filter((item) => !state.hiddenIds.includes(item.id));
      state.items = merged;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      state.todayItems = merged.filter((item) => item.createdAt >= today.toISOString());
    },
  },
  extraReducers: (builder) => {
    builder.addCase('auth/logout', (state) => {
      state.items = [];
      state.todayItems = [];
      state.hiddenIds = [];
    });
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
  const nowIso = new Date().toISOString();
  return today.filter((r: HelpRequest) => r.isBurning && r.expiresAt > nowIso);
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
  const todayIso = todayStart.toISOString();
  const yesterdayIso = yesterdayStart.toISOString();
  return all.filter((r: HelpRequest) => r.createdAt >= yesterdayIso && r.createdAt < todayIso);
};
export const selectHelpRequestsLoading = (state: RootState) => state.helpRequests?.loading ?? false;
export const selectHelpRequestsError = (state: RootState) => state.helpRequests?.error ?? null;

// Фільтри по часам
export const selectHelpRequestsByTime = (state: RootState, hours: number) => {
  const today = state.helpRequests?.todayItems ?? [];
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return today.filter((r: HelpRequest) => r.createdAt > cutoffIso);
};

export default helpRequestsSlice.reducer;
