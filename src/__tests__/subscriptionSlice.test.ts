import subscriptionReducer, {
  hydrateSubscription,
  resetSubscription,
  selectIsBusinessPlus,
  selectIsPremium,
  selectIsPremiumPlus,
} from '../redux/slices/subscriptionSlice';

const activePremiumState = {
  plan: 'premium' as const,
  status: 'active' as const,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  activatedAt: new Date().toISOString(),
  trialUsed: false,
  paymentMethod: 'manual',
};

describe('subscriptionSlice', () => {
  it('does not trust persisted premium without an authenticated user', () => {
    const state = {
      auth: { isAuthenticated: false, user: null },
      subscription: activePremiumState,
    };

    expect(selectIsPremium(state)).toBe(false);
    expect(selectIsPremiumPlus(state)).toBe(false);
    expect(selectIsBusinessPlus(state)).toBe(false);
  });

  it('allows active premium only for an authenticated user', () => {
    const state = {
      auth: { isAuthenticated: true, user: { id: 'uid-1' } },
      subscription: activePremiumState,
    };

    expect(selectIsPremium(state)).toBe(true);
  });

  it('resets all subscription fields back to free', () => {
    const hydrated = subscriptionReducer(undefined, hydrateSubscription(activePremiumState));
    const reset = subscriptionReducer(hydrated, resetSubscription());

    expect(reset).toEqual({
      plan: 'free',
      status: 'free',
      expiresAt: null,
      activatedAt: null,
      trialUsed: false,
      paymentMethod: null,
    });
  });
});
