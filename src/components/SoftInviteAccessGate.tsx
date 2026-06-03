import React from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../redux/slices/authSlice';
import { TrustedAccessContext } from '../contexts/TrustedAccessContext';

type SoftInviteAccessGateProps = {
  children: React.ReactNode;
};

/**
 * Access gate — any authenticated user gets full trusted access.
 * No invite system, no banners, no blocking screens.
 */
export default function SoftInviteAccessGate({ children }: SoftInviteAccessGateProps) {
  const user = useSelector(selectUser);

  return (
    <TrustedAccessContext.Provider
      value={{
        isTrusted: Boolean(user?.id),
        isLoading: false,
        hasPendingInvite: false,
        openInviteAccess: undefined,
      }}
    >
      {children}
    </TrustedAccessContext.Provider>
  );
}
