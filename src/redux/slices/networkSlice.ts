import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

export interface NetworkState {
  isOnline: boolean;
}

const initialState: NetworkState = {
  isOnline: true,
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setOnlineStatus(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
  },
});

export const { setOnlineStatus } = networkSlice.actions;
export const selectIsOnline = (state: RootState) => state.network.isOnline;
export default networkSlice.reducer;
