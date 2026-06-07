import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  persistStore,
  persistReducer,
  createMigrate,
  createTransform,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import type { PersistedState } from 'redux-persist/es/types';
import authReducer from './slices/authSlice';
import { normalizeLanguage } from './slices/languageSlice';
import placesReducer from './slices/placesSlice';
import requestsReducer from './slices/requestsSlice';
import electricityReducer from './slices/electricitySlice';
import helpRequestsReducer from './slices/helpRequestsSlice';
import languageReducer from './slices/languageSlice';
import subscriptionReducer from './slices/subscriptionSlice';
import osbbReducer from './slices/osbbSlice';
import networkReducer from './slices/networkSlice';

// Ліміт кількості записів, що зберігаються в AsyncStorage.
// Запобігає накопиченню 10–50 МБ після тривалого використання.
const MAX_PERSISTED_ITEMS = 200;

const RetentionTransform = createTransform(
  (inboundState: unknown) => {
    const s = inboundState as Record<string, unknown>;
    return {
      ...s,
      ...(Array.isArray(s.items) ? { items: s.items.slice(0, MAX_PERSISTED_ITEMS) } : {}),
      ...(Array.isArray(s.todayItems) ? { todayItems: s.todayItems.slice(0, MAX_PERSISTED_ITEMS) } : {}),
      ...(Array.isArray(s.approved) ? { approved: s.approved.slice(0, MAX_PERSISTED_ITEMS) } : {}),
    };
  },
  null,
  { whitelist: ['helpRequests', 'requests'] },
);

const sanitizeObject = (state: PersistedState): PersistedState =>
  (state && typeof state === 'object'
    ? { ...(state as Record<string, unknown>) }
    : {}) as PersistedState;

const persistMigrations = {
  1: (state: PersistedState) => sanitizeObject(state),
  4: (state: PersistedState) => {
    const next = sanitizeObject(state) as PersistedState & Record<string, unknown>;
    if ('current' in next) {
      next.current = normalizeLanguage(next.current);
    }
    // Add new subscription fields if missing (migration for subscription slice v4)
    if (!('status' in next)) {
      // Derive status from plan for legacy persisted data
      const plan = next.plan;
      next.status = (plan === 'premium' || plan === 'premium_plus') ? 'active' : 'free';
    }
    if (!('trialUsed' in next)) {
      next.trialUsed = false;
    }
    if (!('paymentMethod' in next)) {
      next.paymentMethod = null;
    }
    return next;
  },
  2: (state: PersistedState) => {
    const next = sanitizeObject(state) as PersistedState & Record<string, unknown>;
    return next;
  },
  3: (state: PersistedState) => {
    const next = sanitizeObject(state) as PersistedState & Record<string, unknown>;

    if ('plan' in next && next.plan !== 'free' && next.plan !== 'premium' && next.plan !== 'premium_plus') {
      next.plan = 'free';
    }

    if ('expiresAt' in next && next.expiresAt !== null && typeof next.expiresAt !== 'string') {
      next.expiresAt = null;
    }

    if ('activatedAt' in next && next.activatedAt !== null && typeof next.activatedAt !== 'string') {
      next.activatedAt = null;
    }

    if ('isAuthenticated' in next && typeof next.isAuthenticated !== 'boolean') {
      next.isAuthenticated = false;
    }

    if ('user' in next && next.user !== null && typeof next.user !== 'object') {
      next.user = null;
    }

    if ('buildingId' in next && next.buildingId !== null && typeof next.buildingId !== 'string') {
      next.buildingId = null;
    }

    if ('role' in next && next.role !== 'resident' && next.role !== 'osbb_manager') {
      next.role = 'resident';
    }

    if ('viewMode' in next && next.viewMode !== 'extended' && next.viewMode !== 'simple') {
      next.viewMode = 'extended';
    }

    return next;
  },
};

const persistedAuthReducer = persistReducer(
  {
    key: 'auth',
    storage: AsyncStorage,
    version: 3,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['user', 'isAuthenticated'],
  },
  authReducer
);

const persistedRequestsReducer = persistReducer(
  {
    key: 'requests',
    storage: AsyncStorage,
    version: 3,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['items', 'approved'],
    transforms: [RetentionTransform],
  },
  requestsReducer
);

const persistedHelpReducer = persistReducer(
  {
    key: 'helpRequests',
    storage: AsyncStorage,
    version: 3,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['items', 'todayItems'],
    transforms: [RetentionTransform],
  },
  helpRequestsReducer
);

const persistedLanguageReducer = persistReducer(
  {
    key: 'language',
    storage: AsyncStorage,
    version: 4,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['current'],
  },
  languageReducer
);

// Підписка зберігається між сесіями — щоб Premium не скидався при перезапуску
const persistedSubscriptionReducer = persistReducer(
  {
    key: 'subscription',
    storage: AsyncStorage,
    version: 4,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['plan', 'status', 'expiresAt', 'activatedAt', 'trialUsed', 'paymentMethod'],
  },
  subscriptionReducer
);

// ОСББ — зберігаємо вибір будинку та роль між сесіями
const persistedOsbbReducer = persistReducer(
  {
    key: 'osbb',
    storage: AsyncStorage,
    version: 3,
    migrate: createMigrate(persistMigrations, { debug: false }),
    whitelist: ['buildingId', 'street', 'houseNumber', 'apartment', 'role', 'isSetupDone', 'viewMode'],
  },
  osbbReducer
);

export const store = configureStore({
  reducer: {
    auth: persistedAuthReducer,
    places: placesReducer,
    requests: persistedRequestsReducer,
    electricity: electricityReducer,
    helpRequests: persistedHelpReducer,
    language: persistedLanguageReducer,
    subscription: persistedSubscriptionReducer,
    osbb: persistedOsbbReducer,
    network: networkReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
