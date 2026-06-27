import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, get } from 'firebase/database';

export type SubscriptionPlan = 'free' | 'premium' | 'premium_plus' | 'business_plus';
export type SubscriptionStatus = 'free' | 'trial' | 'active' | 'expired';

export interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  expiresAt: string | null;
  activatedAt: string | null;
  trialUsed: boolean;
  paymentMethod: string | null;
}

export interface ServerSubscriptionPayload {
  plan?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  activatedAt?: unknown;
  isActive?: unknown;
  trialUsed?: unknown;
  paymentMethod?: unknown;
}

const initialState: SubscriptionState = {
  plan: 'free',
  status: 'free',
  expiresAt: null,
  activatedAt: null,
  trialUsed: false,
  paymentMethod: null,
};

const normalizePlan = (value: unknown): SubscriptionPlan => {
  if (value === 'premium' || value === 'premium_plus' || value === 'business_plus') {
    return value;
  }
  return 'free';
};

const normalizeStatus = (value: unknown): SubscriptionStatus => {
  if (value === 'trial' || value === 'active' || value === 'expired') {
    return value;
  }
  return 'free';
};

const normalizeIso = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const normalizeServerSubscription = (
  payload: ServerSubscriptionPayload | null | undefined,
): SubscriptionState => {
  const plan = normalizePlan(payload?.plan);
  const status = normalizeStatus(payload?.status);
  const expiresAt = normalizeIso(payload?.expiresAt);
  const activatedAt = normalizeIso(payload?.activatedAt);
  const isActive = payload?.isActive === true;
  const trialUsed = payload?.trialUsed === true;
  const paymentMethod = typeof payload?.paymentMethod === 'string' ? payload.paymentMethod : null;

  // Legacy path: if status not present but isActive+plan tells us it's active
  const resolvedStatus: SubscriptionStatus = status !== 'free'
    ? status
    : (plan !== 'free' && isActive ? 'active' : 'free');

  if (resolvedStatus === 'free') {
    return {
      plan: 'free',
      status: 'free',
      expiresAt: null,
      activatedAt: null,
      trialUsed,
      paymentMethod: null,
    };
  }

  // Expired: preserve plan and activatedAt so UI can show "Your <Plan> has expired"
  if (resolvedStatus === 'expired') {
    return {
      plan,
      status: 'expired',
      expiresAt,
      activatedAt,
      trialUsed,
      paymentMethod,
    };
  }

  return {
    plan,
    status: resolvedStatus,
    expiresAt,
    activatedAt,
    trialUsed,
    paymentMethod,
  };
};

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    hydrateSubscription(state, action: PayloadAction<SubscriptionState>) {
      state.plan = action.payload.plan;
      state.status = action.payload.status ?? 'free';
      state.expiresAt = action.payload.expiresAt;
      state.activatedAt = action.payload.activatedAt;
      state.trialUsed = action.payload.trialUsed ?? false;
      state.paymentMethod = action.payload.paymentMethod ?? null;
    },
    cancelPlan(state) {
      state.plan = 'free';
      state.status = 'free';
      state.expiresAt = null;
      state.activatedAt = null;
    },
    resetSubscription(state) {
      state.plan = 'free';
      state.status = 'free';
      state.expiresAt = null;
      state.activatedAt = null;
      state.trialUsed = false;
      state.paymentMethod = null;
    },
    checkExpiry(state) {
      if (state.expiresAt && new Date() > new Date(state.expiresAt)) {
        // Preserve plan and expiresAt so UI can show "Your <Plan> has expired"
        state.status = 'expired';
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase('auth/logout', () => initialState);
  },
});

export const { hydrateSubscription, cancelPlan, resetSubscription, checkExpiry } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;

// ── Selectors ──

export const selectPlan = (state: { subscription: SubscriptionState }) =>
  state.subscription.plan;

export const selectSubscriptionStatus = (state: { subscription: SubscriptionState }) =>
  state.subscription.status;

/** True if user has active or trial premium AND it has not expired locally.
 * business_plus inherits all premium limits. */
export const selectIsPremium = (state: { subscription: SubscriptionState; auth?: { isAuthenticated?: boolean; user?: { id?: string } | null } }): boolean => {
  if (!state.auth?.isAuthenticated || !state.auth.user?.id) return false;
  const { plan, status, expiresAt } = state.subscription;
  if (plan !== 'premium' && plan !== 'premium_plus' && plan !== 'business_plus') return false;
  if (status !== 'active' && status !== 'trial') return false;
  if (!expiresAt) return false;
  return new Date() < new Date(expiresAt);
};

export const selectIsPremiumPlus = (state: { subscription: SubscriptionState; auth?: { isAuthenticated?: boolean; user?: { id?: string } | null } }) =>
  Boolean(state.auth?.isAuthenticated && state.auth.user?.id && state.subscription.plan === 'premium_plus');

/** True if user has active business_plus subscription */
export const selectIsBusinessPlus = (state: { subscription: SubscriptionState; auth?: { isAuthenticated?: boolean; user?: { id?: string } | null } }): boolean => {
  if (!state.auth?.isAuthenticated || !state.auth.user?.id) return false;
  const { plan, status, expiresAt } = state.subscription;
  if (plan !== 'business_plus') return false;
  if (status !== 'active' && status !== 'trial') return false;
  if (!expiresAt) return false;
  return new Date() < new Date(expiresAt);
};

export const selectExpiresAt = (state: { subscription: SubscriptionState }) =>
  state.subscription.expiresAt;

export const selectTrialUsed = (state: { subscription: SubscriptionState }) =>
  state.subscription.trialUsed;

/** Returns number of full days until subscription expires, or null if no active subscription */
export const selectDaysLeft = (state: { subscription: SubscriptionState }): number | null => {
  const { expiresAt, status } = state.subscription;
  if (!expiresAt || (status !== 'active' && status !== 'trial')) return null;
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
};

// ── Callables ──

type GetSubscriptionResponse = SubscriptionState & { isActive: boolean };
type ActivateSubscriptionResponse = SubscriptionState & { ok: boolean };

const getSubscriptionCallable = () => {
  const { firebaseApp } = require('../../firebase-core') as typeof import('../../firebase-core');
  return httpsCallable<Record<string, never>, GetSubscriptionResponse>(
    getFunctions(firebaseApp),
    'getUserSubscription',
  );
};

const activatePromoCallable = () => {
  const { firebaseApp } = require('../../firebase-core') as typeof import('../../firebase-core');
  return httpsCallable<{ plan: SubscriptionPlan }, ActivateSubscriptionResponse>(
    getFunctions(firebaseApp),
    'activatePromoPremium',
  );
};

const activateTrialCallable = () => {
  const { firebaseApp } = require('../../firebase-core') as typeof import('../../firebase-core');
  return httpsCallable<Record<string, never>, { ok: boolean; expiresAt: string }>(
    getFunctions(firebaseApp),
    'activateTrialPremium',
  );
};

const cancelSubscriptionCallable = () => {
  const { firebaseApp } = require('../../firebase-core') as typeof import('../../firebase-core');
  return httpsCallable<Record<string, never>, GetSubscriptionResponse>(
    getFunctions(firebaseApp),
    'cancelUserSubscription',
  );
};

export async function fetchServerSubscription(): Promise<SubscriptionState> {
  const callable = getSubscriptionCallable();
  const result = await callable({});
  return normalizeServerSubscription(result.data);
}

export async function tryActivateFreePremium(plan: SubscriptionPlan): Promise<boolean> {
  if (plan === 'free') {
    return false;
  }

  try {
    const callable = activatePromoCallable();
    const result = await callable({ plan });
    const subscription = normalizeServerSubscription({
      ...result.data,
      isActive: result.data?.ok === true,
    });
    return subscription.plan === plan;
  } catch (err) {
    console.warn('[tryActivateFreePremium] failed silently:', err);
    return false;
  }
}

export async function cancelServerSubscription(): Promise<SubscriptionState> {
  const callable = cancelSubscriptionCallable();
  const result = await callable({});
  return normalizeServerSubscription(result.data);
}

/** Read subscription directly from Firebase RTDB and dispatch to Redux */
export async function loadSubscriptionFromFirebase(uid: string): Promise<SubscriptionState> {
  const { firebaseApp } = require('../../firebase-core') as typeof import('../../firebase-core');
  const db = getDatabase(firebaseApp);
  const snap = await get(ref(db, `user_subscription/${uid}`));
  const raw = snap.val();
  return normalizeServerSubscription(raw);
}

/** Call activateTrialPremium Cloud Function */
export async function callActivateTrialPremium(): Promise<{ ok: boolean; expiresAt: string }> {
  const callable = activateTrialCallable();
  const result = await callable({});
  return result.data;
}
