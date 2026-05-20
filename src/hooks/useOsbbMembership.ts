import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase-config';
import { setOsbbMembership, type OsbbMembershipStatus } from '../redux/slices/osbbSlice';
import type { RootState } from '../redux/store';
import { getCurrentUserSecurityRole } from '../services/securityRoles';

export const useOsbbMembership = () => {
  const dispatch = useDispatch();
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  const userId = useSelector((state: RootState) => state.auth.user?.id);

  useEffect(() => {
    if (!buildingId || !userId) return undefined;

    let disposed = false;
    let cleanup = () => {};

    void getCurrentUserSecurityRole()
      .then((roleSnapshot) => {
        if (disposed) {
          return;
        }

        if (roleSnapshot.role === 'admin') {
          dispatch(setOsbbMembership({
            status: 'approved',
            role: 'manager',
          }));
          return;
        }

        const memberRef = ref(database, `osbb_members/${buildingId}/${userId}`);
        const unsubscribe = onValue(memberRef, (snapshot) => {
          const value = snapshot.val() as { status?: string; role?: string } | null;
          if (!value || disposed) return;
          const status = value.status === 'approved' || value.status === 'pending' || value.status === 'rejected'
            ? value.status as OsbbMembershipStatus
            : 'none';
          dispatch(setOsbbMembership({
            status,
            role: value.role === 'manager' ? 'manager' : 'resident',
          }));
        });

        cleanup = unsubscribe;
      })
      .catch(() => {
        if (disposed) {
          return;
        }

        const memberRef = ref(database, `osbb_members/${buildingId}/${userId}`);
        const unsubscribe = onValue(memberRef, (snapshot) => {
          const value = snapshot.val() as { status?: string; role?: string } | null;
          if (!value || disposed) return;
          const status = value.status === 'approved' || value.status === 'pending' || value.status === 'rejected'
            ? value.status as OsbbMembershipStatus
            : 'none';
          dispatch(setOsbbMembership({
            status,
            role: value.role === 'manager' ? 'manager' : 'resident',
          }));
        });

        cleanup = unsubscribe;
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [buildingId, dispatch, userId]);
};
