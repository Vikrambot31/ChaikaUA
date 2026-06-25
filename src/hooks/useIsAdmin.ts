import { useEffect, useState } from 'react';
import { subscribeCurrentUserSecurityRole, type SecurityRole } from '../services/securityRoles';

/**
 * Returns true when the current Firebase user has the 'admin' role
 * in user_roles/{uid}/role (RTDB). Subscribes to live updates.
 */
export const useIsAdmin = (userId: string | undefined): boolean => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const unsubscribe = subscribeCurrentUserSecurityRole((snapshot: { role: SecurityRole }) => {
      setIsAdmin(snapshot.role === 'admin');
    });
    return unsubscribe;
  }, [userId]);

  return isAdmin;
};
