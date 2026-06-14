import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AppTheme = 'light' | 'dark';

export interface ThemeState {
  current: AppTheme;
}

const VALID_THEMES: AppTheme[] = ['light', 'dark'];

export function normalizeTheme(value: unknown): AppTheme {
  if (typeof value === 'string' && (VALID_THEMES as string[]).includes(value)) {
    return value as AppTheme;
  }
  return 'dark';
}

const initialState: ThemeState = {
  current: 'dark',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<AppTheme>) => {
      state.current = normalizeTheme(action.payload);
    },
  },
});

export const { setTheme } = themeSlice.actions;
export default themeSlice.reducer;
