import { off, onValue, ref } from 'firebase/database';
import { database } from '../firebase-core';

export const EMERGENCY_ACCESS_PATH = 'security_config/emergency_access/current';

export type EmergencyAccessCurrent = {
  enabled: boolean;
  mode: string;
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
};

const normalizeEmergencyAccess = (value: unknown): EmergencyAccessCurrent | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<EmergencyAccessCurrent>;
  return {
    enabled: raw.enabled === true,
    mode: typeof raw.mode === 'string' ? raw.mode : '',
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
  };
};

export const isEmergencyAccessActive = (current: EmergencyAccessCurrent | null): boolean =>
  Boolean(current?.enabled && current.expiresAt > Date.now());

export const subscribeEmergencyAccess = (
  callback: (current: EmergencyAccessCurrent | null) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  const currentRef = ref(database, EMERGENCY_ACCESS_PATH);
  const unsubscribe = onValue(
    currentRef,
    (snapshot) => callback(normalizeEmergencyAccess(snapshot.val())),
    (error) => onError?.(error),
  );

  return () => {
    off(currentRef);
    unsubscribe();
  };
};
