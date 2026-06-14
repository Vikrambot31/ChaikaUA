import { useEffect, useState } from 'react';
import { getDatabase, onValue, ref, remove } from 'firebase/database';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export interface BusinessClaimNotification {
  type: 'claim_approved' | 'claim_rejected';
  placeName: string;
  placeId: string;
  rejectReason?: string;
  timestamp: string;
}

/**
 * Listens to user_business_notifications/{uid} in Firebase RTDB.
 * Shows a modal whenever admin approves or rejects a business ownership claim.
 * The notification is deleted from RTDB when the user dismisses the modal.
 */
export function useBusinessClaimSync(userId: string | null | undefined): {
  claimNotification: BusinessClaimNotification | null;
  dismissClaimNotification: () => void;
} {
  const [claimNotification, setClaimNotification] = useState<BusinessClaimNotification | null>(null);

  useEffect(() => {
    if (!userId || LOCAL_MODE) return undefined;

    const { firebaseApp } = require('../firebase-core') as typeof import('../firebase-core');
    const db = getDatabase(firebaseApp);
    const notifRef = ref(db, `user_business_notifications/${userId}`);

    const unsub = onValue(
      notifRef,
      (snap) => {
        const data = snap.val() as (BusinessClaimNotification & { read?: boolean }) | null;
        if (data && !data.read && (data.type === 'claim_approved' || data.type === 'claim_rejected')) {
          setClaimNotification({
            type: data.type,
            placeName: data.placeName ?? '',
            placeId: data.placeId ?? '',
            rejectReason: data.rejectReason,
            timestamp: data.timestamp ?? '',
          });
        } else {
          setClaimNotification(null);
        }
      },
      (error) => {
        console.warn('[useBusinessClaimSync] onValue error:', error);
      },
    );

    return unsub;
  }, [userId]);

  const dismissClaimNotification = () => {
    setClaimNotification(null);
    if (!userId || LOCAL_MODE) return;
    const { firebaseApp } = require('../firebase-core') as typeof import('../firebase-core');
    const db = getDatabase(firebaseApp);
    // Delete the notification so it won't show again on next app open
    remove(ref(db, `user_business_notifications/${userId}`)).catch(() => {});
  };

  return { claimNotification, dismissClaimNotification };
}
