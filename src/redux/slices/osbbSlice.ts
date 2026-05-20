import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OsbbRole = 'resident' | 'osbb_manager';
export type OsbbViewMode = 'extended' | 'simple';
export type OsbbMembershipStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface OsbbState {
  buildingId: string | null;
  street: string | null;
  houseNumber: string | null;
  apartment: string | null;
  role: OsbbRole;
  managerName: string | null;
  managerPhone: string | null;
  managerVerificationStatus: 'none' | 'pending' | 'approved';
  membershipStatus: OsbbMembershipStatus;
  membershipRole: 'resident' | 'manager';
  isSetupDone: boolean;
  viewMode: OsbbViewMode;
}

const initialState: OsbbState = {
  buildingId: null,
  street: null,
  houseNumber: null,
  apartment: null,
  role: 'resident',
  managerName: null,
  managerPhone: null,
  managerVerificationStatus: 'none',
  membershipStatus: 'none',
  membershipRole: 'resident',
  isSetupDone: false,
  viewMode: 'extended',
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const osbbSlice = createSlice({
  name: 'osbb',
  initialState,
  reducers: {
    /**
     * Sets the building that the user belongs to and marks setup as complete.
     */
    setOsbbBuilding(
      state,
      action: PayloadAction<{
        buildingId: string;
        street: string;
        houseNumber: string;
        apartment: string;
        role?: OsbbRole;
        managerName?: string;
        managerPhone?: string;
      }>
    ) {
      state.buildingId = action.payload.buildingId;
      state.street = action.payload.street;
      state.houseNumber = action.payload.houseNumber;
      state.apartment = action.payload.apartment;
      state.role = action.payload.role ?? 'resident';
      state.managerName = action.payload.managerName ?? null;
      state.managerPhone = action.payload.managerPhone ?? null;
      state.managerVerificationStatus =
        action.payload.role === 'osbb_manager' ? 'pending' : 'none';
      state.membershipRole = action.payload.role === 'osbb_manager' ? 'manager' : 'resident';
      state.membershipStatus = action.payload.role === 'osbb_manager' ? 'pending' : 'approved';
      state.isSetupDone = true;
    },

    setOsbbMembership(
      state,
      action: PayloadAction<{
        status: OsbbMembershipStatus;
        role: 'resident' | 'manager';
      }>
    ) {
      state.membershipStatus = action.payload.status;
      state.membershipRole = action.payload.role;
      state.role = action.payload.role === 'manager' ? 'osbb_manager' : 'resident';
      state.managerVerificationStatus = action.payload.role === 'manager'
        ? action.payload.status === 'approved' ? 'approved' : 'pending'
        : 'none';
    },

    /**
     * Changes the ОСББ role of the current user.
     */
    setOsbbRole(state, action: PayloadAction<OsbbRole>) {
      state.role = action.payload;
    },

    setOsbbViewMode(state, action: PayloadAction<OsbbViewMode>) {
      state.viewMode = action.payload;
    },

    resetOsbbSetup() {
      return initialState;
    },
  },
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const { setOsbbBuilding, setOsbbMembership, setOsbbRole, setOsbbViewMode, resetOsbbSetup } = osbbSlice.actions;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Returns true once the user has selected their building. */
export const selectOsbbIsSetupDone = (state: RootState): boolean =>
  state.osbb.isSetupDone;

/** Returns the full ОСББ slice state (building id, street, house, apartment, role). */
export const selectOsbbBuilding = (state: RootState): OsbbState => state.osbb;

/** Returns true when the current user has the osbb_manager role. */
export const selectIsOsbbManager = (state: RootState): boolean =>
  state.osbb.membershipRole === 'manager' && state.osbb.membershipStatus === 'approved';

export const selectCanManageOsbb = selectIsOsbbManager;

export const selectOsbbViewMode = (state: RootState): OsbbViewMode =>
  state.osbb.viewMode ?? 'extended';

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export default osbbSlice.reducer;
