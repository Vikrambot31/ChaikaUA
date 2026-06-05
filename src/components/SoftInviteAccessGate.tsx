import React from 'react';
import { TrustedAccessContext } from '../contexts/TrustedAccessContext';

type SoftInviteAccessGateProps = {
  children: React.ReactNode;
};

/**
 * Access gate — all users (including guests) get full trusted access.
 * Trust tree is preserved in admin panel for analytics only and does
 * not affect screen visibility or feature access.
 */
export default function SoftInviteAccessGate({ children }: SoftInviteAccessGateProps) {
  return (
    <TrustedAccessContext.Provider
      value={{
        isTrusted: true,          // All users — including guests — can view all screens
        isLoading: false,
        hasPendingInvite: false,
        openInviteAccess: undefined,
      }}
    >
      {children}
    </TrustedAccessContext.Provider>
  );
}
