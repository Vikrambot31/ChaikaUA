import type { InviteRequestSnapshot } from '../services/sponsorService';
import type { SecurityRole } from '../services/securityRoles';

/**
 * Returns true if the user has a trusted resident status that grants
 * full access to internal app features.
 *
 * Trusted statuses: approved, temporary_access, whitelist_access, bypass flag.
 * Admin/moderator roles are handled separately via isTrustedSecurityRole().
 */
export const isTrustedUser = (snapshot: InviteRequestSnapshot | null): boolean => (
  snapshot?.bypass === true ||
  snapshot?.status === 'approved' ||
  snapshot?.status === 'temporary_access' ||
  snapshot?.accessStatus === 'approved' ||
  snapshot?.accessStatus === 'temporary_access' ||
  snapshot?.accessStatus === 'whitelist_access' ||
  snapshot?.userAccess?.status === 'temporary_access' ||
  snapshot?.userAccess?.status === 'approved'
);

/**
 * Returns true if the user's platform role grants trusted-level bypass.
 * Admins and moderators always get trusted access regardless of invite status.
 */
export const isTrustedSecurityRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';
