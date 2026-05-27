import { getFunctions, httpsCallable } from 'firebase/functions';
import { off, onValue, ref } from 'firebase/database';
import { auth, database, firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE, localGet } from '../local/LOCAL_MODE';

export const EMERGENCY_ACCESS_PATH = 'security_config/emergency_access/current';

export type EmergencyAccessCurrent = {
  enabled: boolean;
  mode: 'owner_debug_unlock' | string;
  reason: string;
  enabledByUid: string;
  enabledByEmail: string;
  enabledAt: number;
  expiresAt: number;
  allowAnonymousRead: boolean;
  bypassDeviceAuthorization: boolean;
  bypassForceUpdate: boolean;
  bypassMaintenance: boolean;
  bypassInviteAccess: boolean;
  bypassUserAccess: boolean;
  bypassDiagnosticsRestrictions: boolean;
  disabledAt?: number;
  disabledByUid?: string;
  disabledByEmail?: string;
  disabledReason?: string;
};

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

const normalizeEmergencyAccess = (value: unknown): EmergencyAccessCurrent | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<EmergencyAccessCurrent>;
  return {
    enabled: raw.enabled === true,
    mode: typeof raw.mode === 'string' ? raw.mode : 'owner_debug_unlock',
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    enabledByUid: typeof raw.enabledByUid === 'string' ? raw.enabledByUid : '',
    enabledByEmail: typeof raw.enabledByEmail === 'string' ? raw.enabledByEmail : '',
    enabledAt: Number(raw.enabledAt || 0),
    expiresAt: Number(raw.expiresAt || 0),
    allowAnonymousRead: raw.allowAnonymousRead === true,
    bypassDeviceAuthorization: raw.bypassDeviceAuthorization === true,
    bypassForceUpdate: raw.bypassForceUpdate === true,
    bypassMaintenance: raw.bypassMaintenance === true,
    bypassInviteAccess: raw.bypassInviteAccess === true,
    bypassUserAccess: raw.bypassUserAccess === true,
    bypassDiagnosticsRestrictions: raw.bypassDiagnosticsRestrictions === true,
    disabledAt: Number(raw.disabledAt || 0) || undefined,
    disabledByUid: typeof raw.disabledByUid === 'string' ? raw.disabledByUid : undefined,
    disabledByEmail: typeof raw.disabledByEmail === 'string' ? raw.disabledByEmail : undefined,
    disabledReason: typeof raw.disabledReason === 'string' ? raw.disabledReason : undefined,
  };
};

export const isEmergencyAccessActive = (current: EmergencyAccessCurrent | null): boolean =>
  Boolean(current?.enabled && current.expiresAt > Date.now());

export const subscribeEmergencyAccess = (
  onData: (current: EmergencyAccessCurrent | null) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  // LOCAL_MODE: fetch emergency_access from local json-server once
  if (LOCAL_MODE) {
    localGet<Record<string, unknown>>('/emergency_access')
      .then((raw) => onData(normalizeEmergencyAccess(raw)))
      .catch((err: unknown) => {
        // If resource not found, emit null (no active emergency access)
        onData(null);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {};
  }

  const currentRef = ref(database, EMERGENCY_ACCESS_PATH);
  const unsubscribe = onValue(
    currentRef,
    (snapshot) => onData(normalizeEmergencyAccess(snapshot.val())),
    (error) => onError?.(error),
  );

  return () => {
    off(currentRef);
    unsubscribe();
  };
};

export const enableEmergencyDebugUnlock = async (
  reason: string,
  ttlMinutes: number,
): Promise<EmergencyAccessCurrent> => {
  // LOCAL_MODE: return stub enabled state
  if (LOCAL_MODE) {
    const now = Date.now();
    return {
      enabled: true,
      mode: 'owner_debug_unlock',
      reason,
      enabledByUid: 'local-admin',
      enabledByEmail: 'admin@test.local',
      enabledAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000,
      allowAnonymousRead: false,
      bypassDeviceAuthorization: false,
      bypassForceUpdate: false,
      bypassMaintenance: false,
      bypassInviteAccess: false,
      bypassUserAccess: false,
      bypassDiagnosticsRestrictions: false,
    };
  }

  const callable = httpsCallable<{ reason: string; ttlMinutes: number }, { current: EmergencyAccessCurrent }>(
    functions!,
    'enableEmergencyDebugUnlock',
  );
  const result = await callable({ reason, ttlMinutes });
  await auth.currentUser?.getIdToken(true);
  return normalizeEmergencyAccess(result.data.current) as EmergencyAccessCurrent;
};

export const disableEmergencyDebugUnlock = async (): Promise<EmergencyAccessCurrent | null> => {
  // LOCAL_MODE: return stub disabled state
  if (LOCAL_MODE) {
    return null;
  }

  const callable = httpsCallable<Record<string, never>, { current: EmergencyAccessCurrent }>(
    functions!,
    'disableEmergencyDebugUnlock',
  );
  const result = await callable({});
  await auth.currentUser?.getIdToken(true);
  return normalizeEmergencyAccess(result.data.current);
};
