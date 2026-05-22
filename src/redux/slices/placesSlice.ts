import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { getPlaces } from '../../services/api';
import { Place, PlaceType, PlacesState } from '../../types/app';
import { safeLogError } from '../../utils/errorLogger';

const initialState: PlacesState = {
  items: [],
  loading: false,
  error: null,
  filtered: [],
  searchQuery: '',
  selectedTypes: [],
  lastFetchedAt: null,
};

const applyFilters = (state: PlacesState) => {
  const query = state.searchQuery.trim().toLocaleLowerCase('uk-UA');
  const hasSelectedTypes = state.selectedTypes.length > 0;
  const categoryAliases: Record<string, string> = {
    shop: 'магазин товары',
    school: 'школа школы',
    kindergarten: 'детский сад детские сады дети',
    cafe: 'кафе',
    restaurant: 'ресторан рестораны еда',
    salon: 'салон салоны',
    pharmacy: 'аптека аптеки',
    service: 'услуги частные услуги сервис',
  };

  state.filtered = state.items.filter((place) => {
    const byAlias = categoryAliases[place.type] ?? '';
    const matchesSearch =
      query.length === 0 ||
      place.name.toLocaleLowerCase('uk-UA').includes(query) ||
      place.address.toLocaleLowerCase('uk-UA').includes(query) ||
      byAlias.includes(query) ||
      place.type.toLocaleLowerCase('uk-UA').includes(query);
    const matchesType = !hasSelectedTypes || state.selectedTypes.includes(place.type);
    return matchesSearch && matchesType;
  });
};

const PLACES_CACHE_TTL_MS = 30 * 60 * 1000;

export const fetchPlaces = createAsyncThunk<Place[], { force?: boolean } | undefined, { state: RootState; rejectValue: string }>(
  'places/fetchPlaces',
  async (_, { rejectWithValue }) => {
    try {
      const response = await getPlaces();
      if (!response.success || !response.data) {
        return rejectWithValue(response.error ?? 'Failed to fetch places');
      }
      return response.data;
    } catch (error) {
      console.warn('[placesSlice] fetchPlaces failed', error instanceof Error ? error.message : String(error));
      safeLogError('placesSlice.fetchPlaces', error);
      return rejectWithValue('Не удалось загрузить места. Проверьте интернет и попробуйте еще раз.');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) {
        return true;
      }
      const { places } = getState();
      if (!places.lastFetchedAt || places.items.length === 0) {
        return true;
      }
      return Date.now() - places.lastFetchedAt > PLACES_CACHE_TTL_MS;
    },
  }
);

const placesSlice = createSlice({
  name: 'places',
  initialState,
  reducers: {
    setPlaces: (state, action: PayloadAction<Place[]>) => {
      state.items = action.payload;
      state.loading = false;
      state.error = null;
      state.lastFetchedAt = Date.now();
      applyFilters(state);
    },
    setFiltered: (state, action: PayloadAction<Place[]>) => {
      state.filtered = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    addPlace: (state, action: PayloadAction<Place>) => {
      state.items.push(action.payload);
      applyFilters(state);
    },
    updatePlace: (state, action: PayloadAction<Place>) => {
      const index = state.items.findIndex((p) => p.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = action.payload;
        applyFilters(state);
      }
    },
    filterByTypes: (state, action: PayloadAction<PlaceType[]>) => {
      state.selectedTypes = action.payload;
      applyFilters(state);
    },
    filterBySearch: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
      applyFilters(state);
    },
    clearFilters: (state) => {
      state.searchQuery = '';
      state.selectedTypes = [];
      applyFilters(state);
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlaces.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlaces.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
        state.error = null;
        state.lastFetchedAt = Date.now();
        applyFilters(state);
      })
      .addCase(fetchPlaces.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to fetch places';
      });
  },
});

export const {
  setPlaces,
  setFiltered,
  setLoading,
  setError,
  addPlace,
  updatePlace,
  filterByTypes,
  filterBySearch,
  clearFilters,
  clearError,
} = placesSlice.actions;

export const selectAllPlaces = (state: RootState) => state.places.items;
export const selectFilteredPlaces = (state: RootState) => state.places.filtered;
export const selectPlacesLoading = (state: RootState) => state.places.loading;
export const selectPlacesError = (state: RootState) => state.places.error;
export const selectPlacesCount = (state: RootState) => state.places.items.length;

export default placesSlice.reducer;

