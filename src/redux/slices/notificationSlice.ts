import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface NotificationState {
  hasContactRequest: boolean;
  hasSupportReply: boolean;
  hasSubscriptionChanged: boolean;
}

const initialState: NotificationState = {
  hasContactRequest: false,
  hasSupportReply: false,
  hasSubscriptionChanged: false,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setHasContactRequest: (state, action: PayloadAction<boolean>) => {
      state.hasContactRequest = action.payload;
    },
    setHasSupportReply: (state, action: PayloadAction<boolean>) => {
      state.hasSupportReply = action.payload;
    },
    setHasSubscriptionChanged: (state, action: PayloadAction<boolean>) => {
      state.hasSubscriptionChanged = action.payload;
    },
    clearAllProfileNotifications: (state) => {
      state.hasContactRequest = false;
      state.hasSupportReply = false;
      state.hasSubscriptionChanged = false;
    },
  },
});

export const {
  setHasContactRequest,
  setHasSupportReply,
  setHasSubscriptionChanged,
  clearAllProfileNotifications,
} = notificationSlice.actions;

export const selectHasContactRequest = (state: { notifications: NotificationState }) => state.notifications.hasContactRequest;
export const selectHasSupportReply = (state: { notifications: NotificationState }) => state.notifications.hasSupportReply;
export const selectHasSubscriptionChanged = (state: { notifications: NotificationState }) => state.notifications.hasSubscriptionChanged;
export const selectHasAnyProfileNotification = (state: { notifications: NotificationState }) =>
  state.notifications.hasContactRequest || state.notifications.hasSupportReply || state.notifications.hasSubscriptionChanged;

export default notificationSlice.reducer;
