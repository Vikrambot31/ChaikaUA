import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useSelector } from 'react-redux';
import SplashAnimation from './SplashAnimation';
import MaintenanceScreen from './MaintenanceScreen';
import ForceUpdateScreen from './ForceUpdateScreen';
import { compareVersions, getCurrentAppVersion, VersionCheckResult } from '../services/appVersion';
import {
  createDefaultRemoteConfigSnapshot,
  loadRemoteConfigSnapshot,
  RemoteConfigSnapshot,
  subscribeRemoteConfigSnapshot,
} from '../services/remoteConfig';
import {
  DeviceAuthorizationStatus,
  subscribeAuthorizedDeviceStatus,
} from '../services/deviceAuth';
import { selectUser } from '../redux/slices/authSlice';
import { logSecurityAuditEvent } from '../services/securityAuditLogger';
import { ensureAuthorizedDeviceSession, isPrimaryServiceEmail } from '../firebase-auth-session';
import { auth } from '../firebase-config';
import { getCurrentUserSecurityRole } from '../services/securityRoles';
import { markStartupTaskReady } from '../services/startupSync';
import {
  PERSONAL_UPDATE_LOCK_MESSAGE,
  subscribeCurrentUserUpdateLock,
  type UserUpdateLockRecord,
} from '../services/securityAdminService';

type AppAccessGuardProps = {
  children: React.ReactNode;
  initialRemoteConfigSnapshot?: RemoteConfigSnapshot | null;
  onRemoteConfigSnapshot?: (snapshot: RemoteConfigSnapshot) => void;
};

const createUnknownDeviceStatus = (): DeviceAuthorizationStatus => ({
  deviceId: null,
  status: 'unknown',
  record: null,
  usesSecureStore: false,
});

const FOREGROUND_REFRESH_THROTTLE_MS = 4000;
const DEVICE_REFRESH_TIMEOUT_MS = 5000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);

const toVersionCheckResult = (snapshot: RemoteConfigSnapshot): VersionCheckResult => ({
  currentVersion: getCurrentAppVersion(),
  requiresUpdate: true,
  hasNewVersion: true,
  configUrl: 'rtdb://security_config/app_control/current',
  config: {
    latestVersion: snapshot.config.minimum_required_version,
    minSupportedVersion: snapshot.config.minimum_required_version,
    forceUpdate: snapshot.config.force_update_required,
    updateTitle: 'Update required',
    updateText: snapshot.config.maintenance_message || 'Please update the app to continue using Chaika Life.',
  },
});

const toPersonalUpdateResult = (lock: UserUpdateLockRecord): VersionCheckResult => {
  const currentVersion = getCurrentAppVersion();
  return {
    currentVersion,
    requiresUpdate: true,
    hasNewVersion: true,
    configUrl: `rtdb://user_update_locks/${lock.uid}`,
    config: {
      latestVersion: lock.required_version,
      minSupportedVersion: lock.required_version,
      forceUpdate: true,
      updateTitle: 'Обновите приложение',
      updateText: lock.message || PERSONAL_UPDATE_LOCK_MESSAGE,
      landingUrl: 'https://chaika-life.netlify.app/',
    },
  };
};

const toPersonalDeviceUpdateResult = (uid: string | null, deviceId: string | null): VersionCheckResult => {
  const currentVersion = getCurrentAppVersion();
  return {
    currentVersion,
    requiresUpdate: true,
    hasNewVersion: true,
    configUrl: `rtdb://authorized_devices/${uid ?? 'unknown'}/${deviceId ?? 'unknown'}`,
    config: {
      latestVersion: currentVersion,
      minSupportedVersion: currentVersion,
      forceUpdate: true,
      updateTitle: 'Оновіть додаток',
      updateText: 'Для вашого пристрою доступне обовʼязкове оновлення застосунку.',
      landingUrl: 'https://chaika-life.netlify.app/',
    },
  };
};

const AppAccessGuard: React.FC<AppAccessGuardProps> = ({
  children,
  initialRemoteConfigSnapshot,
  onRemoteConfigSnapshot,
}) => {
  const currentUser = useSelector(selectUser);
  const [isBypassUser, setIsBypassUser] = useState(() => isPrimaryServiceEmail(auth.currentUser));
  const [remoteSnapshot, setRemoteSnapshot] = useState<RemoteConfigSnapshot>(
    initialRemoteConfigSnapshot ?? createDefaultRemoteConfigSnapshot(),
  );
  const [isRemoteReady, setIsRemoteReady] = useState(Boolean(initialRemoteConfigSnapshot));
  const [deviceStatus, setDeviceStatus] = useState<DeviceAuthorizationStatus>(createUnknownDeviceStatus());
  const [personalUpdateLock, setPersonalUpdateLock] = useState<UserUpdateLockRecord | null>(null);
  const deviceUnsubscribeRef = useRef<null | (() => void)>(null);
  const updateLockUnsubscribeRef = useRef<null | (() => void)>(null);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(currentUser?.id ?? null);
  const allowNewDevicesRef = useRef(remoteSnapshot.config.allow_new_devices);
  const onRemoteConfigSnapshotRef = useRef(onRemoteConfigSnapshot);
  const deviceSubscriptionUidRef = useRef<string | null>(null);
  const deviceRefreshRequestIdRef = useRef(0);
  const lastForegroundRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!initialRemoteConfigSnapshot) {
      return;
    }

    setRemoteSnapshot(initialRemoteConfigSnapshot);
    setIsRemoteReady(true);
  }, [initialRemoteConfigSnapshot]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

  useEffect(() => {
    const firebaseUser = auth.currentUser;
    if (isPrimaryServiceEmail(firebaseUser)) {
      setIsBypassUser(true);
      return;
    }
    if (!currentUser?.id) {
      setIsBypassUser(false);
      return;
    }
    let active = true;
    void getCurrentUserSecurityRole().then((snapshot) => {
      if (active) {
        setIsBypassUser(snapshot.role === 'admin' || snapshot.role === 'moderator');
      }
    }).catch(() => {
      if (active) {
        // Never lock out primary service email even if role check fails
        if (!isPrimaryServiceEmail(auth.currentUser)) {
          setIsBypassUser(false);
        }
      }
    });
    return () => { active = false; };
  }, [currentUser?.id]);

  useEffect(() => {
    allowNewDevicesRef.current = remoteSnapshot.config.allow_new_devices;
  }, [remoteSnapshot.config.allow_new_devices]);

  useEffect(() => {
    onRemoteConfigSnapshotRef.current = onRemoteConfigSnapshot;
  }, [onRemoteConfigSnapshot]);

  const applyRemoteSnapshot = (snapshot: RemoteConfigSnapshot) => {
    if (!mountedRef.current) {
      return;
    }

    setRemoteSnapshot(snapshot);
    setIsRemoteReady(true);
    onRemoteConfigSnapshotRef.current?.(snapshot);
  };

  const refreshRemoteConfig = async () => {
    const snapshot = await loadRemoteConfigSnapshot();
    applyRemoteSnapshot(snapshot);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;

    // If no initial snapshot was provided at mount time, do an explicit load so
    // the remote config is available before the first RTDB push arrives.
    // This check is intentionally evaluated once at mount (deps: []), not on
    // every prop change. Restarting the subscription on every
    // initialRemoteConfigSnapshot reference change would create a feedback loop:
    // the subscription callback updates App-level state → new prop reference →
    // effect re-runs → subscription restarts → immediate onValue fire → repeat.
    if (!initialRemoteConfigSnapshot) {
      void loadRemoteConfigSnapshot().then((snapshot) => {
        if (!active) {
          return;
        }

        applyRemoteSnapshot(snapshot);
      });
    }

    const unsubscribe = subscribeRemoteConfigSnapshot((snapshot) => {
      if (!active) {
        return;
      }

      applyRemoteSnapshot(snapshot);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const refreshDeviceStatus = async () => {
    const currentUid = currentUserIdRef.current;
    if (!currentUid) {
      deviceUnsubscribeRef.current?.();
      deviceUnsubscribeRef.current = null;
      deviceSubscriptionUidRef.current = null;
      setDeviceStatus(createUnknownDeviceStatus());
      return;
    }

    const requestId = deviceRefreshRequestIdRef.current + 1;
    deviceRefreshRequestIdRef.current = requestId;

    try {
      const synced = await withTimeout(
        ensureAuthorizedDeviceSession({
          allowNewDevices: allowNewDevicesRef.current,
        }),
        DEVICE_REFRESH_TIMEOUT_MS,
        'device_status_timeout',
      );

      if (!mountedRef.current || requestId !== deviceRefreshRequestIdRef.current || currentUserIdRef.current !== currentUid) {
        return;
      }

      setDeviceStatus(synced);

      if (deviceSubscriptionUidRef.current !== currentUid) {
        deviceUnsubscribeRef.current?.();
        deviceUnsubscribeRef.current = null;

        const newUnsub = await subscribeAuthorizedDeviceStatus(currentUid, (status) => {
          if (!mountedRef.current || currentUserIdRef.current !== currentUid) {
            return;
          }
          setDeviceStatus(status);
        });

        // Guard: component may have unmounted or user may have changed during the await.
        // If so, immediately unsubscribe to prevent an orphaned RTDB listener.
        if (!mountedRef.current || currentUserIdRef.current !== currentUid) {
          newUnsub();
          return;
        }

        deviceUnsubscribeRef.current = newUnsub;
        deviceSubscriptionUidRef.current = currentUid;
      }
    } catch {
      if (!mountedRef.current || requestId !== deviceRefreshRequestIdRef.current) {
        return;
      }

      setDeviceStatus((previous) => (
        previous.status === 'unknown'
          ? {
            ...previous,
            error: 'device_status_timeout',
          }
          : previous
      ));
    }
  };

  useEffect(() => {
    void refreshDeviceStatus();

    return () => {
      deviceUnsubscribeRef.current?.();
      deviceUnsubscribeRef.current = null;
      deviceSubscriptionUidRef.current = null;
    };
  }, [currentUser?.id, remoteSnapshot.config.allow_new_devices]);

  useEffect(() => {
    updateLockUnsubscribeRef.current?.();
    updateLockUnsubscribeRef.current = null;

    if (!currentUser?.id) {
      setPersonalUpdateLock(null);
      return undefined;
    }

    updateLockUnsubscribeRef.current = subscribeCurrentUserUpdateLock(
      currentUser.id,
      (lock) => {
        if (mountedRef.current && currentUserIdRef.current === currentUser.id) {
          setPersonalUpdateLock(lock);
        }
      },
      () => {
        if (mountedRef.current) {
          setPersonalUpdateLock(null);
        }
      },
    );

    return () => {
      updateLockUnsubscribeRef.current?.();
      updateLockUnsubscribeRef.current = null;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    // Mark ready when status is resolved (not 'unknown'), when there's an error,
    // or when there is no authenticated user to check (device auth is not applicable).
    if (deviceStatus.status !== 'unknown' || Boolean(deviceStatus.error) || !currentUserIdRef.current) {
      markStartupTaskReady('deviceAuth');
    }
  }, [deviceStatus.error, deviceStatus.status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return;
      }

      const now = Date.now();
      if (now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_THROTTLE_MS) {
        return;
      }

      lastForegroundRefreshAtRef.current = now;
      void refreshRemoteConfig();
      void refreshDeviceStatus();
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const requiresRemoteForceUpdate = useMemo(() => {
    const currentVersion = getCurrentAppVersion();
    const isBelowMinimum = compareVersions(currentVersion, remoteSnapshot.config.minimum_required_version) < 0;
    return remoteSnapshot.config.force_update_required || isBelowMinimum;
  }, [remoteSnapshot.config.force_update_required, remoteSnapshot.config.minimum_required_version]);

  const requiresPersonalUpdate = useMemo(() => {
    if (!personalUpdateLock?.force_update_required) {
      return false;
    }

    return compareVersions(getCurrentAppVersion(), personalUpdateLock.required_version) < 0;
  }, [personalUpdateLock?.force_update_required, personalUpdateLock?.required_version]);

  const requiresPersonalDeviceUpdate = useMemo(
    () => deviceStatus.record?.personal_force_update === true,
    [deviceStatus.record?.personal_force_update],
  );

  useEffect(() => {
    if (deviceStatus.status === 'blocked') {
      void logSecurityAuditEvent('blocked_access_attempt', {
        scope: 'app_guard',
      });
    }
  }, [deviceStatus.status]);

  if (!isRemoteReady) {
    return <SplashAnimation />;
  }

  if (!isBypassUser && personalUpdateLock && requiresPersonalUpdate) {
    return (
      <ForceUpdateScreen
        result={toPersonalUpdateResult(personalUpdateLock)}
        onRetry={() => {
          void refreshRemoteConfig();
        }}
      />
    );
  }

  if (!isBypassUser && requiresPersonalDeviceUpdate) {
    return (
      <ForceUpdateScreen
        result={toPersonalDeviceUpdateResult(currentUser?.id ?? null, deviceStatus.deviceId)}
        onRetry={() => {
          void refreshDeviceStatus();
        }}
      />
    );
  }

  if (!isBypassUser && remoteSnapshot.config.app_enabled === false) {
    return (
      <MaintenanceScreen
        message={remoteSnapshot.config.maintenance_message || 'The application is temporarily disabled.'}
        onRetry={() => {
          void refreshRemoteConfig();
        }}
      />
    );
  }

  if (!isBypassUser && remoteSnapshot.config.maintenance_mode) {
    return (
      <MaintenanceScreen
        message={remoteSnapshot.config.maintenance_message || 'Maintenance is in progress.'}
        onRetry={() => {
          void refreshRemoteConfig();
        }}
      />
    );
  }

  if (!isBypassUser && requiresRemoteForceUpdate) {
    return (
      <ForceUpdateScreen
        result={toVersionCheckResult(remoteSnapshot)}
        onRetry={() => {
          void refreshRemoteConfig();
        }}
      />
    );
  }

  // Device pending/blocked checks are disabled during development.
  // Re-enable for production by restoring the original blocks here.

  return <>{children}</>;
};

export default AppAccessGuard;

