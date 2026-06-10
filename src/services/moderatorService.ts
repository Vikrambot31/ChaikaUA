import { get, push, ref, set, remove, onValue, off } from 'firebase/database';
import { database } from '../firebase-core';
import { getCurrentUser } from '../firebase-auth-session';
import { normalizeSecurityRole, type SecurityRole } from './securityRoles';
import { logClientError, logClientEvent } from '../utils/errorLogger';

export interface ModeratorRecord {
  uid: string;
  role: SecurityRole;
  email?: string;
  name?: string;
  assignedAt: number;
  assignedBy: string;
}

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
type ApiVoidResult = { success: true } | { success: false; error: string };

export const getUserRole = async (uid: string): Promise<SecurityRole> => {
  try {
    const snapshot = await get(ref(database, `user_roles/${uid}/role`));
    return normalizeSecurityRole(snapshot.val());
  } catch (error) {
    // Fall back to cached role so a network error doesn't silently strip
    // admin/moderator privileges.
    void logClientError('moderatorService.getUserRole', error instanceof Error ? error : new Error(String(error)), { uid });
    const { getCachedSecurityRole } = await import('./securityRoles');
    const cached = await getCachedSecurityRole(uid);
    if (cached) {
      return cached.role;
    }
    return 'user';
  }
};

export const assignRole = async (
  targetUid: string,
  role: 'moderator' | 'admin',
  targetEmail?: string,
  targetName?: string,
): Promise<ApiVoidResult> => {
  try {
    const currentUser = getCurrentUser();
    const actorUid = currentUser?.uid ?? 'pin_operator';

    const record: Omit<ModeratorRecord, 'uid'> = {
      role,
      assignedAt: Date.now(),
      assignedBy: actorUid,
      ...(targetEmail ? { email: targetEmail } : {}),
      ...(targetName ? { name: targetName } : {}),
    };

    await set(ref(database, `user_roles/${targetUid}`), record);
    void push(ref(database, 'security_logs'), {
      event: 'role_assigned',
      targetUid,
      role,
      actorUid,
      timestamp: Date.now(),
    });
    void logClientEvent('role_assigned', { targetUid, role, actorUid });
    return { success: true };
  } catch (error: unknown) {
    void logClientError('moderatorService.assignRole', error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const revokeRole = async (targetUid: string): Promise<ApiVoidResult> => {
  try {
    const currentUser = getCurrentUser();
    const actorUid = currentUser?.uid ?? 'pin_operator';

    await remove(ref(database, `user_roles/${targetUid}/role`));
    void push(ref(database, 'security_logs'), {
      event: 'role_revoked',
      targetUid,
      actorUid,
      timestamp: Date.now(),
    });
    void logClientEvent('role_revoked', { targetUid, actorUid });
    return { success: true };
  } catch (error: unknown) {
    void logClientError('moderatorService.revokeRole', error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const getModeratorList = async (): Promise<ApiResult<ModeratorRecord[]>> => {
  try {
    const snapshot = await get(ref(database, 'user_roles'));
    const data = snapshot.val() as Record<string, Omit<ModeratorRecord, 'uid'>> | null;
    if (!data) return { success: true, data: [] };

    const list: ModeratorRecord[] = Object.entries(data)
      .filter(([, v]) => v.role === 'admin' || v.role === 'moderator')
      .map(([uid, v]) => ({ uid, ...v }));

    return { success: true, data: list };
  } catch (error: unknown) {
    void logClientError('moderatorService.getModeratorList', error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const subscribeModeratorList = (
  callback: (list: ModeratorRecord[]) => void,
): (() => void) => {
  const dbRef = ref(database, 'user_roles');

  onValue(dbRef, (snapshot) => {
    const data = snapshot.val() as Record<string, Omit<ModeratorRecord, 'uid'>> | null;
    if (!data) {
      callback([]);
      return;
    }
    const list: ModeratorRecord[] = Object.entries(data)
      .filter(([, v]) => v.role === 'admin' || v.role === 'moderator')
      .map(([uid, v]) => ({ uid, ...v }));
    callback(list);
  });

  return () => off(dbRef);
};
