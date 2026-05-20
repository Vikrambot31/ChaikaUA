import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

export type ElectricityStatus = 'on' | 'off';

export interface ElectricityReport {
  id: string;
  buildingId: string;
  status: ElectricityStatus;
  createdAt: Date;
  userName: string;
  userPhone: string;
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  submittedForModerationAt?: string;
}

export interface ElectricityState {
  reports: ElectricityReport[];
  todayReports: ElectricityReport[];
  loading: boolean;
  error: string | null;
}

const initialState: ElectricityState = {
  reports: [],
  todayReports: [],
  loading: false,
  error: null,
};

const electricitySlice = createSlice({
  name: 'electricity',
  initialState,
  reducers: {
    addReport: (state, action: PayloadAction<ElectricityReport>) => {
      state.reports.push(action.payload);
      // Додати до звітів сьогодні
      state.todayReports.unshift(action.payload);
    },
    setReports: (state, action: PayloadAction<ElectricityReport[]>) => {
      state.reports = action.payload;
    },
    setTodayReports: (state, action: PayloadAction<ElectricityReport[]>) => {
      state.todayReports = action.payload;
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
    clearTodayReports: (state) => {
      state.todayReports = [];
    },
  },
});

export const {
  addReport,
  setReports,
  setTodayReports,
  setLoading,
  setError,
  clearError,
  clearTodayReports,
} = electricitySlice.actions;

export const selectAllReports = (state: RootState) => state.electricity?.reports ?? [];
export const selectTodayReports = (state: RootState) => state.electricity?.todayReports ?? [];
export const selectElectricityLoading = (state: RootState) => state.electricity?.loading ?? false;
export const selectElectricityError = (state: RootState) => state.electricity?.error ?? null;

// Получить статус по зданию
export const selectStatusByBuilding = (state: RootState, buildingId: string) => {
  const reports = state.electricity?.todayReports ?? [];
  const lastReport = reports.find((r) => r.buildingId === buildingId);
  return lastReport?.status ?? null;
};

// Получить последние репорты для здания
export const selectBuildingReports = (state: RootState, buildingId: string) => {
  const reports = state.electricity?.todayReports ?? [];
  return reports.filter((r) => r.buildingId === buildingId);
};

export default electricitySlice.reducer;
