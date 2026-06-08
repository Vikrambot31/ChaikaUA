import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import {
  hydrateSubscription,
  normalizeServerSubscription,
  type ServerSubscriptionPayload,
} from '../redux/slices/subscriptionSlice';
import { setHasSubscriptionChanged } from '../redux/slices/notificationSlice';
import { database } from '../firebase-core';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

/**
 * Subscribes to user_subscription/{uid} in Firebase RTDB in real-time.
 * Dispatches hydrateSubscription whenever the server changes the record
 * (e.g. admin grants premium from the admin panel).
 *
 * Returns a flag that turns true the moment premium is activated while the
 * user is already online — used to show a "Premium activated!" modal.
 */
export function useSubscriptionSync(userId: string | null | undefined): {
  showPremiumModal: boolean;
  dismissPremiumModal: () => void;
} {
  const dispatch = useDispatch();
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Track per-session state inside the effect via refs so we don't need them
  // as effect deps (they change silently, not causing re-subscribes).
  const firstLoadDoneRef = useRef(false);
  const wasPremiumRef = useRef(false);

  useEffect(() => {
    // Never subscribe in local-dev mode — no real Firebase
    if (!userId || LOCAL_MODE) return undefined;

    // Reset per-user flags when the uid changes (login / account switch)
    firstLoadDoneRef.current = false;
    wasPremiumRef.current = false;

    const subRef = ref(database, `user_subscription/${userId}`);

    const unsub = onValue(
      subRef,
      (snap) => {
        const raw = snap.val() as ServerSubscriptionPayload | null;
        const normalized = normalizeServerSubscription(raw);

        const isNowPremium =
          (normalized.plan === 'premium' || normalized.plan === 'premium_plus') &&
          (normalized.status === 'active' || normalized.status === 'trial') &&
          normalized.expiresAt !== null &&
          new Date() < new Date(normalized.expiresAt);

        // Always sync Redux with the latest server state
        dispatch(hydrateSubscription(normalized));

        if (!firstLoadDoneRef.current) {
          // First snapshot after login: hydrate silently, no modal
          firstLoadDoneRef.current = true;
          wasPremiumRef.current = isNowPremium;
          return;
        }

        // Subsequent snapshots: show modal only on fresh premium grant
        if (!wasPremiumRef.current && isNowPremium) {
          setShowPremiumModal(true);
          dispatch(setHasSubscriptionChanged(true));
        }

        wasPremiumRef.current = isNowPremium;
      },
      (error) => {
        console.warn('[useSubscriptionSync] onValue error:', error);
      },
    );

    return unsub;
  }, [userId, dispatch]);

  const dismissPremiumModal = () => setShowPremiumModal(false);

  return { showPremiumModal, dismissPremiumModal };
}
