/**
 * Redux Selectors - централізовані селектори для всіх слайсів
 * Усі селектори в одному місці для легшого доступу
 */

import { RootState } from './store';
import { createSelector } from '@reduxjs/toolkit';
import type { HelpRequest, Request } from '../types/app';

// ============================================================
// AUTH SELECTORS
// ============================================================

export const selectAuthState = (state: RootState) => state.auth;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectUser = (state: RootState) => state.auth.user;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectAuthBootstrapped = (state: RootState) => state.auth.isBootstrapped;
export const selectUserId = (state: RootState) => state.auth.user?.id;
export const selectUserEmail = (state: RootState) => state.auth.user?.email;
export const selectUserName = (state: RootState) => state.auth.user?.name;
export const selectRegistrationStatus = (state: RootState) => state.auth.user?.registrationStatus ?? 'partial';
export const selectIsRegistrationComplete = (state: RootState) => state.auth.user?.registrationStatus === 'complete';

// ============================================================
// PLACES SELECTORS
// ============================================================

export const selectPlacesState = (state: RootState) => state.places;
export const selectAllPlaces = (state: RootState) => state.places.items;
export const selectFilteredPlaces = (state: RootState) => state.places.filtered;
export const selectPlacesLoading = (state: RootState) => state.places.loading;
export const selectPlacesError = (state: RootState) => state.places.error;
export const selectPlacesCount = (state: RootState) => state.places.items.length;
export const selectSearchQuery = (state: RootState) => state.places.searchQuery;
export const selectSelectedTypes = (state: RootState) => state.places.selectedTypes;

/**
 * Отримати місце за ID
 */
export const selectPlaceById = createSelector(
  [(state: RootState) => state.places.items, (_: RootState, id: string) => id],
  (items, id) => items.find((place) => place.id === id)
);

/**
 * Отримати кількість місць по типу
 */
export const selectPlacesByType = createSelector(
  [(state: RootState) => state.places.items, (_: RootState, type: string) => type],
  (items, type) => items.filter((place) => place.type === type)
);

/**
 * Перевірити чи є активні фільтри
 */
export const selectHasActiveFilters = createSelector(
  [(state: RootState) => state.places.searchQuery, (state: RootState) => state.places.selectedTypes],
  (searchQuery, selectedTypes) => searchQuery.length > 0 || selectedTypes.length > 0
);

// ============================================================
// REQUESTS SELECTORS
// ============================================================

export const selectRequestsState = (state: RootState) => state.requests;
export const selectAllRequests = (state: RootState) => state.requests.items;
export const selectApprovedRequests = (state: RootState) => state.requests.approved;
export const selectRequestsLoading = (state: RootState) => state.requests.loading;
export const selectRequestsError = (state: RootState) => state.requests.error;
export const selectRequestsCount = (state: RootState) => state.requests.approved.length;

/**
 * Отримати заявку за ID
 */
export const selectRequestById = createSelector(
  [(state: RootState) => state.requests.items, (_: RootState, id: string) => id],
  (items, id) => items.find((request: Request) => request.id === id)
);

/**
 * Отримати не одобрені заявки
 */
export const selectPendingRequests = createSelector(
  [(state: RootState) => state.requests.items],
  (items) => items.filter((request: Request) => !request.isApproved)
);

/**
 * Отримати кількість очікуючих заявок
 */
export const selectPendingRequestsCount = createSelector(
  [(state: RootState) => state.requests.items],
  (items) => items.filter((request: Request) => !request.isApproved).length
);

/**
 * Отримати останні заявки (N)
 */
export const selectRecentRequests: (state: RootState, limit?: number) => Request[] = createSelector(
  [(state: RootState) => state.requests.items, (_: RootState, limit = 5) => limit],
  (items, limit) => items.slice(0, limit)
);

// ============================================================
// ELECTRICITY SELECTORS
// ============================================================

export const selectElectricityState = (state: RootState) => state.electricity;
export const selectAllReports = (state: RootState) => state.electricity?.reports ?? [];
export const selectTodayReports = (state: RootState) => state.electricity?.todayReports ?? [];
export const selectElectricityLoading = (state: RootState) => state.electricity?.loading ?? false;
export const selectElectricityError = (state: RootState) => state.electricity?.error ?? null;

/**
 * Отримати статус по будинку
 */
export const selectStatusByBuilding = createSelector(
  [(state: RootState) => state.electricity?.todayReports ?? [], (_: RootState, buildingId: string) => buildingId],
  (reports, buildingId) => {
    const lastReport = reports.find((r) => r.buildingId === buildingId);
    return lastReport?.status ?? null;
  }
);

/**
 * Отримати звіти по будинку
 */
export const selectBuildingReports = createSelector(
  [(state: RootState) => state.electricity?.todayReports ?? [], (_: RootState, buildingId: string) => buildingId],
  (reports, buildingId) => reports.filter((r) => r.buildingId === buildingId)
);

/**
 * Отримати електрику "ВКЛ" будинки
 */
export const selectBuildingsWithElectricity = createSelector(
  [(state: RootState) => state.electricity?.todayReports ?? []],
  (reports) => {
    const buildings = new Set<string>();
    reports.filter((r) => r.status === 'on').forEach((r) => buildings.add(r.buildingId));
    return Array.from(buildings);
  }
);

/**
 * Отримати електрику "ВИМКЛ" будинки
 */
export const selectBuildingsWithoutElectricity = createSelector(
  [(state: RootState) => state.electricity?.todayReports ?? []],
  (reports) => {
    const buildings = new Set<string>();
    reports.filter((r) => r.status === 'off').forEach((r) => buildings.add(r.buildingId));
    return Array.from(buildings);
  }
);

// ============================================================
// HELP REQUESTS SELECTORS
// ============================================================

export const selectHelpRequestsState = (state: RootState) => state.helpRequests;
export const selectAllHelpRequests = (state: RootState) => state.helpRequests?.items ?? [];
export const selectTodayHelpRequests = (state: RootState) => state.helpRequests?.todayItems ?? [];
export const selectHelpRequestsLoading = (state: RootState) => state.helpRequests?.loading ?? false;
export const selectHelpRequestsError = (state: RootState) => state.helpRequests?.error ?? null;

/**
 * Отримати активні "гарячі" заявки
 */
export const selectActiveBurningRequests = createSelector(
  [(state: RootState) => state.helpRequests?.todayItems ?? []],
  (today) => {
    const nowIso = new Date().toISOString();
    return today.filter((r: HelpRequest) => r.isBurning && r.expiresAt > nowIso);
  }
);

/**
 * Отримати завершені заявки
 */
export const selectCompletedRequests = createSelector(
  [(state: RootState) => state.helpRequests?.items ?? []],
  (items) => items.filter((r: HelpRequest) => !r.isBurning)
);

/**
 * Отримати кількість активних заявок
 */
export const selectActiveBurningCount = createSelector(
  [(state: RootState) => state.helpRequests?.todayItems ?? []],
  (today) => {
    const nowIso = new Date().toISOString();
    return today.filter((r: HelpRequest) => r.isBurning && r.expiresAt > nowIso).length;
  }
);

/**
 * Отримати заявки за часами
 */
export const selectHelpRequestsByTime = createSelector(
  [(state: RootState) => state.helpRequests?.todayItems ?? [], (_: RootState, hours: number) => hours],
  (today, hours) => {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return today.filter((r: HelpRequest) => new Date(r.createdAt) > cutoffTime);
  }
);

/**
 * Отримати заявку за ID
 */
export const selectHelpRequestById = createSelector(
  [(state: RootState) => state.helpRequests?.items ?? [], (_: RootState, id: string) => id],
  (items, id) => items.find((request: HelpRequest) => request.id === id)
);

// ============================================================
// GLOBAL STATUS SELECTORS
// ============================================================

/**
 * Чи завантажується щось?
 */
export const selectIsLoading = (state: RootState) =>
  state.auth.loading ||
  state.places.loading ||
  state.requests.loading ||
  (state.electricity?.loading ?? false) ||
  (state.helpRequests?.loading ?? false);

/**
 * Чи є якихось помилок?
 */
export const selectHasErrors = (state: RootState) =>
  !!state.auth.error ||
  !!state.places.error ||
  !!state.requests.error ||
  !!(state.electricity?.error) ||
  !!(state.helpRequests?.error);

/**
 * Отримати всі помилки
 */
export const selectAllErrors = createSelector(
  [
    (state: RootState) => state.auth.error,
    (state: RootState) => state.places.error,
    (state: RootState) => state.requests.error,
    (state: RootState) => state.electricity?.error ?? null,
    (state: RootState) => state.helpRequests?.error ?? null,
  ],
  (auth, places, requests, electricity, helpRequests) => ({ auth, places, requests, electricity, helpRequests })
);

/**
 * Отримати перший доступний індекс помилки
 */
export const selectFirstError = (state: RootState) => {
  if (state.auth.error) return state.auth.error;
  if (state.places.error) return state.places.error;
  if (state.requests.error) return state.requests.error;
  if (state.electricity?.error) return state.electricity.error;
  if (state.helpRequests?.error) return state.helpRequests.error;
  return null;
};

/**
 * Отримати статус синхронізації
 */
export const selectSyncStatus = createSelector(
  [
    (state: RootState) => state.auth.isAuthenticated,
    (state: RootState) => state.auth.loading,
    (state: RootState) => state.places.items.length,
    (state: RootState) => state.places.loading,
    (state: RootState) => state.requests.items.length,
    (state: RootState) => state.requests.loading,
    (state: RootState) => state.electricity?.reports?.length ?? 0,
    (state: RootState) => state.electricity?.loading ?? false,
    (state: RootState) => state.helpRequests?.items?.length ?? 0,
    (state: RootState) => state.helpRequests?.loading ?? false,
  ],
  (authOk, authLoading, placesLen, placesLoading, reqLen, reqLoading, elecLen, elecLoading, helpLen, helpLoading) => ({
    authSynced: authOk && !authLoading,
    placesSynced: placesLen > 0 && !placesLoading,
    requestsSynced: reqLen >= 0 && !reqLoading,
    electricitySynced: elecLen >= 0 && !elecLoading,
    helpSynced: helpLen >= 0 && !helpLoading,
    allSynced: !authLoading && !placesLoading && !reqLoading && !elecLoading && !helpLoading,
  })
);

export default {
  // Auth
  selectAuthState,
  selectIsAuthenticated,
  selectUser,
  selectAuthLoading,
  selectAuthError,
  selectAuthBootstrapped,

  // Places
  selectPlacesState,
  selectAllPlaces,
  selectFilteredPlaces,
  selectPlacesLoading,
  selectPlacesError,
  selectPlaceById,

  // Requests
  selectRequestsState,
  selectAllRequests,
  selectApprovedRequests,
  selectRequestsLoading,
  selectRequestsError,
  selectPendingRequests,

  // Electricity
  selectElectricityState,
  selectAllReports,
  selectTodayReports,
  selectElectricityLoading,
  selectStatusByBuilding,

  // Help Requests
  selectHelpRequestsState,
  selectAllHelpRequests,
  selectTodayHelpRequests,
  selectActiveBurningRequests,

  // Global
  selectIsLoading,
  selectHasErrors,
  selectAllErrors,
  selectFirstError,
  selectSyncStatus,
};
