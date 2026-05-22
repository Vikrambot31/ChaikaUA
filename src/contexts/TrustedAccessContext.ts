import React from 'react';

export type TrustedAccessContextValue = {
  /**
   * True if the current user has a trusted resident status (approved,
   * temporary_access, whitelist_access, bypass, admin, or moderator).
   * Defaults to false so a missing provider never grants full access.
   */
  isTrusted: boolean;
  /**
   * True while the invite snapshot is being fetched from the server on
   * initial mount. GuardedScreen uses this to show a loading indicator
   * rather than flashing the AccessRestrictedScreen prematurely.
   */
  isLoading: boolean;
  /** True while an invite request is submitted but not approved yet. */
  hasPendingInvite: boolean;
  /** Opens the invite request flow from a trusted-only restriction screen. */
  openInviteAccess?: () => void;
};

export const TrustedAccessContext = React.createContext<TrustedAccessContextValue>({
  isTrusted: false,
  isLoading: false,
  hasPendingInvite: false,
});
