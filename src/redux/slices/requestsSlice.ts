import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { createRequest, deleteRequestById, getRequests } from '../../services/api';
import { Request, RequestFormData, RequestsState } from '../../types/app';
import { safeLogError } from '../../utils/errorLogger';

const initialState: RequestsState = {
  items: [],
  loading: false,
  error: null,
  approved: [],
};

const sortNewestFirst = (items: Request[]) =>
  [...items].sort((a, b) => b.createdAt - a.createdAt);

const postRequestWithRetry = async (payload: RequestFormData, retries = 1): Promise<Request> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await createRequest(payload);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to submit request');
      }
      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to submit request');
};

export const submitRequest = createAsyncThunk<Request, RequestFormData, { rejectValue: string }>(
  'requests/submitRequest',
  async (payload, { rejectWithValue }) => {
    try {
      return await postRequestWithRetry(payload, 1);
    } catch (error) {
      console.warn('[requestsSlice] submitRequest failed', error instanceof Error ? error.message : String(error));
      safeLogError('requestsSlice.submitRequest', error);
      return rejectWithValue('Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.');
    }
  }
);

export const fetchRequests = createAsyncThunk<Request[], void, { rejectValue: string }>(
  'requests/fetchRequests',
  async (_, { rejectWithValue }) => {
    try {
      const response = await getRequests();
      if (!response.success || !response.data) {
        return rejectWithValue(response.error ?? 'Не удалось загрузить заявки. Проверьте интернет и попробуйте ещё раз.');
      }
      return response.data;
    } catch (error) {
      console.warn('[requestsSlice] fetchRequests failed', error instanceof Error ? error.message : String(error));
      safeLogError('requestsSlice.fetchRequests', error);
      return rejectWithValue('Не удалось загрузить заявки. Проверьте интернет и попробуйте ещё раз.');
    }
  }
);

export const deleteRequest = createAsyncThunk<string, string, { rejectValue: string }>(
  'requests/deleteRequest',
  async (requestId, { rejectWithValue }) => {
    try {
      const response = await deleteRequestById(requestId);
      if (!response.success) {
        return rejectWithValue(response.error ?? 'Не удалось удалить заявку. Попробуйте ещё раз.');
      }
      return requestId;
    } catch (error) {
      console.warn('[requestsSlice] deleteRequest failed', error instanceof Error ? error.message : String(error));
      safeLogError('requestsSlice.deleteRequest', error, { requestId });
      return rejectWithValue('Не удалось удалить заявку. Попробуйте ещё раз.');
    }
  }
);

const requestsSlice = createSlice({
  name: 'requests',
  initialState,
  reducers: {
    setRequests: (state, action: PayloadAction<Request[]>) => {
      state.items = sortNewestFirst(action.payload);
      state.loading = false;
      state.error = null;
    },
    setApproved: (state, action: PayloadAction<Request[]>) => {
      state.approved = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    addRequest: (state, action: PayloadAction<Request>) => {
      state.items = sortNewestFirst([action.payload, ...state.items]);
      if (action.payload.isApproved) {
        state.approved.push(action.payload);
      }
    },
    updateRequest: (state, action: PayloadAction<Request>) => {
      const index = state.items.findIndex((r) => r.id === action.payload.id);
      if (index === -1) {
        if (__DEV__) {
          console.warn('[requestsSlice] updateRequest target not found:', action.payload.id);
        }
        return;
      }
      state.items[index] = action.payload;

      const approvedIndex = state.approved.findIndex((r) => r.id === action.payload.id);
      if (approvedIndex !== -1 && action.payload.isApproved) {
        state.approved[approvedIndex] = action.payload;
      } else if (approvedIndex !== -1 && !action.payload.isApproved) {
        state.approved.splice(approvedIndex, 1);
      }
    },
    approveRequest: (state, action: PayloadAction<string>) => {
      const request = state.items.find((r) => r.id === action.payload);
      if (request) {
        request.isApproved = true;
        if (!state.approved.find((r) => r.id === action.payload)) {
          state.approved.push(request);
        }
      }
    },
    rejectRequest: (state, action: PayloadAction<string>) => {
      state.approved = state.approved.filter((r) => r.id !== action.payload);
    },
    removeRequestLocal: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((r) => r.id !== action.payload);
      state.approved = state.approved.filter((r) => r.id !== action.payload);
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitRequest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(submitRequest.fulfilled, (state, action) => {
        state.items = sortNewestFirst([action.payload, ...state.items]);
        state.loading = false;
        state.error = null;
      })
      .addCase(submitRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to submit request';
      })
      .addCase(fetchRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRequests.fulfilled, (state, action) => {
        state.items = sortNewestFirst(action.payload);
        state.approved = action.payload.filter((request) => request.isApproved);
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to fetch requests';
      })
      .addCase(deleteRequest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteRequest.fulfilled, (state, action) => {
        state.items = state.items.filter((r) => r.id !== action.payload);
        state.approved = state.approved.filter((r) => r.id !== action.payload);
        state.loading = false;
        state.error = null;
      })
      .addCase(deleteRequest.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to delete request';
      });
  },
});

export const {
  setRequests,
  setApproved,
  setLoading,
  setError,
  addRequest,
  updateRequest,
  approveRequest,
  rejectRequest,
  removeRequestLocal,
  clearError,
} = requestsSlice.actions;

export const selectAllRequests = (state: RootState) => state.requests.items;
export const selectApprovedRequests = (state: RootState) => state.requests.approved;
export const selectRequestsLoading = (state: RootState) => state.requests.loading;
export const selectRequestsError = (state: RootState) => state.requests.error;
export const selectRequestsCount = (state: RootState) => state.requests.approved.length;

export default requestsSlice.reducer;
