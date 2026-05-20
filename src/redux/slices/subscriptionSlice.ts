import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type SubscriptionPlan = 'free' | 'premium' | 'premium_plus';

export interface SubscriptionState {
  plan: SubscriptionPlan;
  expiresAt: string | null;
  activatedAt: string | null;
}

interface ServerSubscriptionPayload {
  plan?: unknown;
  expiresAt?: unknown;
  activatedAt?: unknown;
  isActive?: unknown;
}

const initialState: SubscriptionState = {
  plan: 'free',
  expiresAt: null,
  activatedAt: null,
};

const normalizePlan = (value: unknown): SubscriptionPlan => {
  if (value === 'premium' || value === 'premium_plus') {
    return value;
  }
  return 'free';
};

const normalizeIso = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const normalizeServerSubscription = (
  payload: ServerSubscriptionPayload | null | undefined,
): SubscriptionState => {
  const plan = normalizePlan(payload?.plan);
  const expiresAt = normalizeIso(payload?.expiresAt);
  const activatedAt = normalizeIso(payload?.activatedAt);
  const isActive = payload?.isActive === true;

  if (plan === 'free' || !isActive) {
    return {
      plan: 'free',
      expiresAt: null,
      activatedAt: null,
    };
  }

  return {
    plan,
    expiresAt,
    activatedAt,
  };
};

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    activatePlan(state, action: PayloadAction<SubscriptionPlan>) {
      state.plan = action.payload;
      state.activatedAt = new Date().toISOString();
      const exp = new Date();
      exp.setDate(exp.getDate() + 30);
      state.expiresAt = exp.toISOString();
    },
    hydrateSubscription(state, action: PayloadAction<SubscriptionState>) {
      state.plan = action.payload.plan;
      state.expiresAt = action.payload.expiresAt;
      state.activatedAt = action.payload.activatedAt;
    },
    cancelPlan(state) {
      state.plan = 'free';
      state.expiresAt = null;
      state.activatedAt = null;
    },
    checkExpiry(state) {
      if (state.expiresAt && new Date() > new Date(state.expiresAt)) {
        state.plan = 'free';
        state.expiresAt = null;
      }
    },
  },
});

export const { activatePlan, hydrateSubscription, cancelPlan, checkExpiry } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;

export const selectPlan = (state: { subscription: SubscriptionState }) =>
  state.subscription.plan;
export const selectIsPremium = (state: { subscription: SubscriptionState }) =>
  state.subscription.plan === 'premium' || state.subscription.plan === 'premium_plus';
export const selectIsPremiumPlus = (state: { subscription: SubscriptionState }) =>
  state.subscription.plan === 'premium_plus';
export const selectExpiresAt = (state: { subscription: SubscriptionState }) =>
  state.subscription.expiresAt;

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
  } catch {
    return false;
  }
}

export async function cancelServerSubscription(): Promise<SubscriptionState> {
  const callable = cancelSubscriptionCallable();
  const result = await callable({});
  return normalizeServerSubscription(result.data);
}
