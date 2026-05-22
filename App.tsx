import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { AppState, Image, Platform } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth, fcmAPI } from './src/firebase-config';
import { ensureFirebaseAuth, isAnonymousFirebaseUser } from './src/firebase-auth-session';
import { setUser, logout, selectAuthBootstrapped, selectUser, setAuthBootstrapped } from './src/redux/slices/authSlice';
import { useFCMToken } from './src/hooks/useFCMToken';
import { useNetworkMonitor } from './src/hooks/useNetworkMonitor';
import OfflineBanner from './src/components/OfflineBanner';
import RootNavigator from './src/navigation/RootNavigator';
import { store, persistor } from './src/redux/store';
import SplashAnimation from './src/components/SplashAnimation';
import ErrorBoundary from './src/components/ErrorBoundary';
import FirstLaunchOnboarding from './src/components/FirstLaunchOnboarding';
import LanguagePickerOnboarding from './src/components/LanguagePickerOnboarding';
import { STORAGE_KEYS } from './src/utils/constants';
import ForceUpdateScreen from './src/components/ForceUpdateScreen';
import { checkAppVersion, VersionCheckResult } from './src/services/appVersion';
import { loadProfileRecord, mapFirebaseUserToAppUser } from './src/services/authProfileService';
import { getUserAccessControlStatus, subscribeUserAccessControlStatus } from './src/services/serviceModeration';
import { identifyCrashUser, initCrashReporting } from './src/services/crashReporting';
import { logClientError } from './src/utils/errorLogger';
import { initRuntimeMonitorGlobalHandlers, recordRuntimeTrace } from './src/services/runtimeMonitorService';
import { flushLiveDiagnostics, initLiveDiagnostics } from './src/services/liveDiagnosticsService';
import { signOutPrimarySession } from './src/services/authSessionService';
import AppAccessGuard from './src/components/AppAccessGuard';
import AccountResumeScreen from './src/components/AccountResumeScreen';
import StartupSyncBanner from './src/components/StartupSyncBanner';
import SoftInviteAccessGate from './src/components/SoftInviteAccessGate';
import {
  createDefaultRemoteConfigSnapshot,
  loadRemoteConfigSnapshot,
  RemoteConfigSnapshot,
} from './src/services/remoteConfig';
import { beginStartupSync, markStartupTaskReady } from './src/services/startupSync';
import { isSafePromiseTimeoutError, safePromiseTimeout } from './src/utils/safePromiseTimeout';
import { UploadQueue } from './src/photo-module';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const decodeBase64ToBinary = (input: string): string => {
  const clean = input.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  let output = '';
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = clean[i];
    const c2 = clean[i + 1];
    const c3 = clean[i + 2];
    const c4 = clean[i + 3];

    const n1 = BASE64_ALPHABET.indexOf(c1);
    const n2 = BASE64_ALPHABET.indexOf(c2);
    const n3 = c3 === '=' ? 0 : BASE64_ALPHABET.indexOf(c3);
    const n4 = c4 === '=' ? 0 : BASE64_ALPHABET.indexOf(c4);

    if (n1 < 0 || n2 < 0 || (c3 !== '=' && n3 < 0) || (c4 !== '=' && n4 < 0)) {
      throw new Error('Invalid base64 character');
    }

    const triple = (n1 << 18) | (n2 << 12) | (n3 << 6) | n4;
    output += String.fromCharCode((triple >> 16) & 0xff);
    if (c3 !== '=') output += String.fromCharCode((triple >> 8) & 0xff);
    if (c4 !== '=') output += String.fromCharCode(triple & 0xff);
  }

  return output;
};

const encodeBinaryToBase64 = (input: string): string => {
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i) & 0xff;
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) & 0xff : 0;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) & 0xff : 0;
    const triple = (a << 16) | (b << 8) | c;

    output += BASE64_ALPHABET[(triple >> 18) & 63];
    output += BASE64_ALPHABET[(triple >> 12) & 63];
    output += i + 1 < input.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    output += i + 2 < input.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return output;
};

const ensureBase64Polyfills = (): void => {
  if (typeof globalThis.atob !== 'function') {
    globalThis.atob = decodeBase64ToBinary;
  }
  if (typeof globalThis.btoa !== 'function') {
    globalThis.btoa = encodeBinaryToBase64;
  }
};

ensureBase64Polyfills();

try { beginStartupSync(); } catch {}
try { initCrashReporting(); } catch {}
try { initRuntimeMonitorGlobalHandlers(); } catch {}
try { initLiveDiagnostics(); } catch {}

const STARTUP_SECURITY_LOAD_TIMEOUT_MS = 8000;
const PROFILE_LOAD_TIMEOUT_MS = 8000;

// Register the background FCM handler once at startup.
if (Platform.OS !== 'web') {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async (message: { messageId?: string; data?: Record<string, unknown> } | undefined) => {
      try {
        // Background notifications are handled by the system automatically.
        void message;
      } catch (error) {
        void logClientError('fcm.backgroundMessageHandler', error, {
          messageId: message?.messageId ?? null,
          dataKeys: Object.keys(message?.data ?? {}),
        });
      }
    });
  } catch {}
}

type AppWithAuthSyncProps = {
  remoteConfigSnapshot: RemoteConfigSnapshot | null;
  onRemoteConfigSnapshot: (snapshot: RemoteConfigSnapshot) => void;
};

function AppWithAuthSync({ remoteConfigSnapshot, onRemoteConfigSnapshot }: AppWithAuthSyncProps) {
  const dispatch = useDispatch();
  const currentUser = useSelector(selectUser);
  const authBootstrapped = useSelector(selectAuthBootstrapped);
  const [resumeDecisionMade, setResumeDecisionMade] = useState(false);

  // Register the FCM token and subscribe to refreshes.
  useFCMToken(currentUser?.id);

  // Monitor Firebase connection state → drives OfflineBanner.
  useNetworkMonitor();

  useEffect(() => {
    identifyCrashUser(currentUser?.id ?? null);
    void flushLiveDiagnostics();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    void UploadQueue.process();
    const intervalId = setInterval(() => {
      void UploadQueue.process();
    }, 25000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void UploadQueue.process();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    return subscribeUserAccessControlStatus(currentUser.id, (accessControl) => {
      if (!accessControl.isBlocked && !accessControl.isDeleted) {
        return;
      }

      void fcmAPI.removeTokenForUser(currentUser.id).catch((e: unknown) => logClientError('fcm.removeToken.blocked', e));
      void signOutPrimarySession().catch((e: unknown) => logClientError('auth.signOut.blocked', e));
      dispatch(logout());
      identifyCrashUser(null);
      void persistor.purge();
      Toast.show({
        type: 'error',
        text1: 'Access denied',
        text2: accessControl.reason || 'Your profile is blocked by moderation.',
      });
    });
  }, [currentUser?.id, dispatch]);

  useEffect(() => {
    dispatch(setAuthBootstrapped(false));
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      void recordRuntimeTrace({
        screen: 'AppAuthSync',
        action: 'firebase_auth_state_changed',
        status: user && !isAnonymousFirebaseUser(user) ? 'success' : 'progress',
        feature: 'auth',
        stage: 'onAuthStateChanged',
        details: {
          hasUser: Boolean(user),
          isAnonymous: Boolean(user?.isAnonymous),
          uid: user?.uid || 'none',
        },
      });
      if (!active) {
        return;
      }

      if (!user) {
        identifyCrashUser(null);
        dispatch(logout());
        void ensureFirebaseAuth().catch((error: unknown) => {
          void logClientError('auth.ensureGuestSession', error);
        });
        return;
      }

      if (isAnonymousFirebaseUser(user)) {
        identifyCrashUser(null);
        dispatch(logout());
        return;
      }

      try {
        // Force token refresh to detect expired Facebook/Google tokens early
        try {
          void recordRuntimeTrace({
            screen: 'AppAuthSync',
            action: 'firebase_token_refresh',
            status: 'start',
            feature: 'auth',
            stage: 'getIdToken',
            details: { uid: user.uid },
          });
          await user.getIdToken(true);
          void recordRuntimeTrace({
            screen: 'AppAuthSync',
            action: 'firebase_token_refresh',
            status: 'success',
            feature: 'auth',
            stage: 'getIdToken',
            details: { uid: user.uid },
          });
        } catch (tokenErr: unknown) {
          void recordRuntimeTrace({
            screen: 'AppAuthSync',
            action: 'firebase_token_refresh',
            status: 'fail',
            feature: 'auth',
            stage: 'getIdToken',
            error: tokenErr,
            details: { uid: user.uid },
          });
          const code = (tokenErr as { code?: string })?.code ?? '';
          if (
            code === 'auth/invalid-credential' ||
            code === 'auth/user-token-expired'
          ) {
            if (active) {
              void fcmAPI.removeTokenForUser(user.uid).catch((e: unknown) => logClientError('fcm.removeToken.tokenExpired', e));
              await signOutPrimarySession().catch((e: unknown) => logClientError('auth.signOut.tokenExpired', e));
              dispatch(logout());
              identifyCrashUser(null);
              void persistor.purge();
              Toast.show({
                type: 'info',
                text1: 'Сеанс завершено',
                text2: 'Будь ласка, увійдіть знову.',
              });
            }
            return;
          }
          // Non-critical token refresh error — continue with existing token
        }

        void recordRuntimeTrace({
          screen: 'AppAuthSync',
          action: 'moderation_access_check',
          status: 'start',
          feature: 'auth',
          stage: 'getUserAccessControlStatus',
          firebasePath: `users/${user.uid}/accessControl`,
        });
        const accessControl = await getUserAccessControlStatus(user.uid);
        void recordRuntimeTrace({
          screen: 'AppAuthSync',
          action: 'moderation_access_check',
          status: accessControl.isBlocked || accessControl.isDeleted ? 'fail' : 'success',
          feature: 'auth',
          stage: 'getUserAccessControlStatus',
          firebasePath: `users/${user.uid}/accessControl`,
          details: { isBlocked: accessControl.isBlocked, isDeleted: accessControl.isDeleted },
        });
        if (!active) {
          return;
        }

        if (accessControl.isBlocked || accessControl.isDeleted) {
          void fcmAPI.removeTokenForUser(user.uid).catch((e: unknown) => logClientError('fcm.removeToken.accessBlocked', e));
          await signOutPrimarySession().catch((e: unknown) => logClientError('auth.signOut.accessBlocked', e));
          dispatch(logout());
          identifyCrashUser(null);
          void persistor.purge();
          Toast.show({
            type: 'error',
            text1: 'Access denied',
            text2: accessControl.reason || 'Your profile is blocked by moderation.',
          });
          return;
        }

        void recordRuntimeTrace({
          screen: 'AppAuthSync',
          action: 'profile_load',
          status: 'start',
          feature: 'auth',
          stage: 'loadProfileRecord',
          firebasePath: `users/${user.uid}`,
        });
        try {
          const profile = await safePromiseTimeout(
            loadProfileRecord(user.uid),
            PROFILE_LOAD_TIMEOUT_MS,
            'AppAuthSync.loadProfileRecord',
          );
          if (active) {
            dispatch(setUser(mapFirebaseUserToAppUser(user, profile)));
            void recordRuntimeTrace({
              screen: 'AppAuthSync',
              action: 'profile_load',
              status: 'success',
              feature: 'auth',
              stage: 'loadProfileRecord',
              firebasePath: `users/${user.uid}`,
              details: { hasProfile: Boolean(profile) },
            });
          }
        } catch (profileError: unknown) {
          void recordRuntimeTrace({
            screen: 'AppAuthSync',
            action: 'profile_load',
            status: 'fail',
            feature: 'auth',
            stage: 'loadProfileRecord',
            firebasePath: `users/${user.uid}`,
            error: profileError,
            details: isSafePromiseTimeoutError(profileError)
              ? { timeoutMs: profileError.timeoutMs, source: profileError.source }
              : undefined,
          });
          throw profileError;
        }
      } catch (error: unknown) {
        void recordRuntimeTrace({
          screen: 'AppAuthSync',
          action: 'auth_bootstrap',
          status: 'fail',
          feature: 'auth',
          stage: 'onAuthStateChanged',
          error,
        });
        if (active) {
          dispatch(setUser(mapFirebaseUserToAppUser(user, null)));
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [dispatch]);

  useEffect(() => {
    if (authBootstrapped) {
      markStartupTaskReady('auth');
    }
  }, [authBootstrapped]);

  if (!resumeDecisionMade && currentUser !== null) {
    return (
      <AccountResumeScreen
        user={currentUser}
        onContinue={() => setResumeDecisionMade(true)}
        onSwitch={async () => {
          await signOutPrimarySession({ resumeAnonymous: true }).catch((e: unknown) => logClientError('auth.signOut.switchAccount', e));
          dispatch(logout());
          await persistor.purge().catch(() => undefined);
          setResumeDecisionMade(true);
        }}
      />
    );
  }

  if (!authBootstrapped) {
    return <SplashAnimation />;
  }

  return (
    <>
      <ErrorBoundary showDetails={__DEV__}>
        <AppAccessGuard
          initialRemoteConfigSnapshot={remoteConfigSnapshot}
          onRemoteConfigSnapshot={onRemoteConfigSnapshot}
        >
          <SoftInviteAccessGate>
            <RootNavigator />
          </SoftInviteAccessGate>
        </AppAccessGuard>
      </ErrorBoundary>
      <OfflineBanner />
      <StartupSyncBanner />
      <Toast />
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isCheckingFirstLaunch, setIsCheckingFirstLaunch] = useState(true);
  const [isPreparingStartupImages, setIsPreparingStartupImages] = useState(true);
  const [isCheckingVersion, setIsCheckingVersion] = useState(true);
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult | null>(null);
  const [isLoadingRemoteConfig, setIsLoadingRemoteConfig] = useState(true);
  const [remoteConfigSnapshot, setRemoteConfigSnapshot] = useState<RemoteConfigSnapshot | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  // The splash screen closes when the intro animation finishes.

  useEffect(() => {
    const preloadStartupImages = async () => {
      try {
        const sources = [
          require('./assets/WEBP-version/Logo-Chaika LIFE.webp'),
          require('./assets/WEBP-version/intro1.webp'),
          require('./assets/WEBP-version/intro2.webp'),
          require('./assets/WEBP-version/intro3.webp'),
        ];

        await Promise.all(
          sources.map((source) => {
            const resolved = Image.resolveAssetSource(source);
            return resolved?.uri ? Image.prefetch(resolved.uri) : Promise.resolve(true);
          })
        );
      } catch {
        // Static assets still load from the bundle; prefetch is only an optimization.
      } finally {
        setIsPreparingStartupImages(false);
      }
    };

    void preloadStartupImages();
  }, []);

  useEffect(() => {
    const loadFirstLaunchState = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.IS_FIRST_LAUNCH);
        setShowOnboarding(stored !== 'false');
      } catch (error) {
        if (__DEV__) {
          console.warn('Unable to load first-launch state', error);
        }
        setShowOnboarding(true);
      } finally {
        setIsCheckingFirstLaunch(false);
      }
    };

    void loadFirstLaunchState();
  }, []);

  const runVersionCheck = async () => {
    setIsCheckingVersion(true);
    setIsLoadingRemoteConfig(true);
    try {
      const [result, remoteConfig] = await Promise.all([
        checkAppVersion(),
        loadRemoteConfigSnapshot(),
      ]);
      setVersionCheck(result);
      setRemoteConfigSnapshot(remoteConfig);
    } catch (error) {
      if (__DEV__) {
        console.warn('Unable to check app version', error);
      }
      setVersionCheck(null);
      try {
        const fallbackRemoteConfig = await loadRemoteConfigSnapshot();
        setRemoteConfigSnapshot(fallbackRemoteConfig);
      } catch {
        setRemoteConfigSnapshot(null);
      }
    } finally {
      setIsCheckingVersion(false);
      setIsLoadingRemoteConfig(false);
    }
  };

  useEffect(() => {
    void runVersionCheck();
  }, []);

  useEffect(() => {
    if (!isCheckingVersion && !isLoadingRemoteConfig) {
      markStartupTaskReady('remoteConfig');
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setVersionCheck((current) => current ?? null);
      setRemoteConfigSnapshot((current) => current ?? createDefaultRemoteConfigSnapshot());
      setIsCheckingVersion(false);
      setIsLoadingRemoteConfig(false);
      markStartupTaskReady('remoteConfig');
    }, STARTUP_SECURITY_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [isCheckingVersion, isLoadingRemoteConfig]);

  const handleOnboardingDone = () => {
    setShowLanguagePicker(true);
  };

  const handleLanguagePickerDone = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.IS_FIRST_LAUNCH, 'false');
    } catch (error) {
      if (__DEV__) {
        console.warn('Unable to persist first-launch state', error);
      }
    } finally {
      setShowOnboarding(false);
      setShowLanguagePicker(false);
    }
  };

  return (
    <SafeAreaProvider>
      <Provider store={store}>
        {showSplash || isCheckingFirstLaunch || isPreparingStartupImages || isCheckingVersion || isLoadingRemoteConfig ? (
          <SplashAnimation onFinish={() => setShowSplash(false)} />
        ) : versionCheck?.requiresUpdate ? (
          <ForceUpdateScreen result={versionCheck} onRetry={runVersionCheck} />
        ) : showOnboarding && !showLanguagePicker ? (
          <FirstLaunchOnboarding onDone={handleOnboardingDone} />
        ) : showLanguagePicker ? (
          <LanguagePickerOnboarding onDone={handleLanguagePickerDone} />
        ) : (
          <AppWithAuthSync
            remoteConfigSnapshot={remoteConfigSnapshot}
            onRemoteConfigSnapshot={setRemoteConfigSnapshot}
          />
        )}
      </Provider>
    </SafeAreaProvider>
  );
}
