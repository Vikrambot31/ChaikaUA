import type { SecurityRole } from '../services/securityRoles';

/**
 * Any authenticated user is trusted — no invite system restrictions.
 * Pass uid (user.id) to determine if the user is authenticated.
 */
export const isTrustedUser = (uid: string | null | undefined): boolean =>
  Boolean(uid);

/**
 * Returns true if the user's platform role grants trusted-level bypass.
 * Admins and moderators always get trusted access.
 */
export const isTrustedSecurityRole = (role: SecurityRole): boolean =>
  role === 'admin' || role === 'moderator';
