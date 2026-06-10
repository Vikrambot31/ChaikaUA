import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast, { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth, fcmAPI } from './src/firebase-config';
import {
  bootstrapAuth,
  isAnonymousFirebaseUser,
  isAuthBootstrapTimeoutError,
  resetAuthBootstrap,
} from './src/firebase-auth-session';
import { setUser, logout, selectAuthBootstrapped, selectUser, setAuthBootstrapped } from './src/redux/slices/authSlice';
import { checkExpiry } from './src/redux/slices/subscriptionSlice';
import { selectIsOnline } from './src/redux/slices/networkSlice';
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
import { identifyCrashUser, initCrashReporting } from './src/services/crashReporting';
import { logClientError } from './src/utils/errorLogger';
import { initRuntimeMonitorGlobalHandlers, recordRuntimeTrace } from './src/services/runtimeMonitorService';
import { flushLiveDiagnostics, initLiveDiagnostics } from './src/services/liveDiagnosticsService';
import { initConsoleErrorCapture } from './src/services/crashDiagnosticsService';
import { signOutPrimarySession } from './src/services/authSessionService';
import { drainBonusQueue, clearBonusQueueForUser } from './src/services/bonusQueue';
import AppAccessGuard from './src/components/AppAccessGuard';
import AccountResumeScreen from './src/components/AccountResumeScreen';
import { PremiumActivatedModal } from './src/components/PremiumActivatedModal';
import { useSubscriptionSync } from './src/hooks/useSubscriptionSync';
import { BusinessApprovalModal } from './src/components/BusinessApprovalModal';
import { useBusinessClaimSync } from './src/hooks/useBusinessClaimSync';
import StartupSyncBanner from './src/components/StartupSyncBanner';
import SoftInviteAccessGate from './src/components/SoftInviteAccessGate';
import TactileButton from './src/components/TactileButton';
import {
  createDefaultRemoteConfigSnapshot,
  loadRemoteConfigSnapshot,
  RemoteConfigSnapshot,
} from './src/services/remoteConfig';
import { beginStartupSync, markStartupTaskReady } from './src/services/startupSync';
import { initSessionLifecycle } from './src/services/sessionLifecycleService';
import { initFreezeWatchdog } from './src/services/freezeWatchdogService';
import { isSafePromiseTimeoutError, safePromiseTimeout } from './src/utils/safePromiseTimeout';
import { UploadQueue } from './src/photo-module';
import { LOCAL_MODE, getCurrentLocalUser } from './src/local/LOCAL_MODE';
import { awardDailyLoginBonus } from './src/services/bonusService';
import type { User } from './src/types/app';

// Web: center the phone container in the browser viewport.
// Expo dev server ignores web/index.html, so we inject styles via JS.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  (() => {
    const applyWebLayout = () => {
      document.body.style.setProperty('display', 'flex', 'important');
      document.body.style.setProperty('justify-content', 'center', 'important');
      document.body.style.setProperty('align-items', 'flex-start', 'important');
      document.body.style.setProperty('background-color', '#d6cfc6', 'important');
      document.body.style.setProperty('overflow', 'hidden', 'important');
      const root = document.getElementById('root');
      if (root) {
        root.style.setProperty('width', '430px', 'important');
        root.style.setProperty('max-width', '430px', 'important');
        root.style.setProperty('min-width', '320px', 'important');
        root.style.setProperty('height', '100vh', 'important');
        root.style.setProperty('overflow', 'hidden', 'important');
        root.style.setProperty('background-color', '#f7f3ee', 'important');
        root.style.setProperty('box-shadow', '0 0 40px rgba(0,0,0,0.25)', 'important');
        root.style.setProperty('flex-shrink', '0', 'important');
      }
    };
    applyWebLayout();
    // Re-apply after a tick in case RNW resets styles during bootstrap
    setTimeout(applyWebLayout, 0);
    setTimeout(applyWebLayout, 100);
  })();
}

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

try { beginStartupSync(); } catch (e) { console.warn('[startup] beginStartupSync failed:', e); }
try { initCrashReporting(); } catch (e) { console.warn('[startup] initCrashReporting failed:', e); }
try { initRuntimeMonitorGlobalHandlers(); } catch (e) { console.warn('[startup] initRuntimeMonitorGlobalHandlers failed:', e); }
try { initLiveDiagnostics(); } catch (e) { console.warn('[startup] initLiveDiagnostics failed:', e); }
try { initConsoleErrorCapture(); } catch (e) { console.warn('[startup] initConsoleErrorCapture failed:', e); }
try { initFreezeWatchdog(); } catch (e) { console.warn('[startup] initFreezeWatchdog failed:', e); }
void initSessionLifecycle().catch((e) => console.warn('[startup] initSessionLifecycle failed:', e));

const STARTUP_SECURITY_LOAD_TIMEOUT_MS = 8000;
const PROFILE_LOAD_TIMEOUT_MS = 8000;
const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#2F8F46' }}
      contentContainerStyle={{ paddingHorizontal: 14 }}
      text1Style={{ fontSize: 14, fontWeight: '800' }}
      text2Style={{ fontSize: 12, fontWeight: '600' }}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#B93A32' }}
      contentContainerStyle={{ paddingHorizontal: 14 }}
      text1Style={{ fontSize: 14, fontWeight: '800' }}
      text2Style={{ fontSize: 12, fontWeight: '600' }}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#3B6C8F' }}
      contentContainerStyle={{ paddingHorizontal: 14 }}
      text1Style={{ fontSize: 14, fontWeight: '800' }}
      text2Style={{ fontSize: 12, fontWeight: '600' }}
    />
  ),
  warning: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#C78116' }}
      contentContainerStyle={{ paddingHorizontal: 14 }}
      text1Style={{ fontSize: 14, fontWeight: '800' }}
      text2Style={{ fontSize: 12, fontWeight: '600' }}
    />
  ),
};

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

function AuthOfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.authOfflineRoot}>
      <View style={styles.authOfflinePanel}>
        <Text style={styles.authOfflineTitle}>Нет подключения</Text>
        <Text style={styles.authOfflineText}>Проверьте подключение к интернету</Text>
        <TactileButton
          title="Повторить подключение"
          onPress={onRetry}
          style={styles.authOfflineButton}
        />
      </View>
    </View>
  );
}

function AppWithAuthSync({ remoteConfigSnapshot, onRemoteConfigSnapshot }: AppWithAuthSyncProps) {
  const dispatch = useDispatch();
  const currentUser = useSelector(selectUser);
  const authBootstrapped = useSelector(selectAuthBootstrapped);
  const isOnline = useSelector(selectIsOnline);
  const prevIsOnlineRef = useRef<boolean>(true);
  const [resumeDecisionMade, setResumeDecisionMade] = useState(false);
  const [authOffline, setAuthOffline] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);

  // Register the FCM token and subscribe to refreshes.
  useFCMToken(currentUser?.id);

  // Monitor Firebase connection state → drives OfflineBanner.
  useNetworkMonitor();

  // Realtime subscription listener: syncs user_subscription/{uid} → Redux.
  // Also triggers the "Premium activated" modal when admin grants premium live.
  const { showPremiumModal, dismissPremiumModal } = useSubscriptionSync(currentUser?.id);
  const { claimNotification, dismissClaimNotification } = useBusinessClaimSync(currentUser?.id);

  // Check subscription expiry once after Redux Persist rehydrates
  useEffect(() => {
    dispatch(checkExpiry());
  }, [dispatch]);

  // Drain offline bonus queue when network comes back online
  useEffect(() => {
    if (isOnline && !prevIsOnlineRef.current && currentUser?.id) {
      drainBonusQueue().catch(() => {});
    }
    prevIsOnlineRef.current = isOnline;
  }, [isOnline, currentUser?.id]);

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
      if (!UploadQueue.isEmpty()) void UploadQueue.process();
    }, 25000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void UploadQueue.process();
        // Re-check subscription expiry whenever app returns to foreground
        dispatch(checkExpiry());
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentUser?.id]);

  // access control subscription disabled

  useEffect(() => {
    // ─── LOCAL_MODE: пропускаем Firebase Auth, читаем currentUser из localhost:3001 ──
    if (LOCAL_MODE) {
      dispatch(setAuthBootstrapped(false));
      let cancelled = false;

      const loadLocalUser = () => {
        getCurrentLocalUser()
          .then((u) => {
            if (cancelled) return;
            const localUser: User = {
              id: u.id,
              name: u.name,
              email: u.email,
              phone: u.phone || '',
              daysUsed: 0,
              registeredAt: new Date().toISOString(),
              isActive: true,
              city: u.building || '',
              registrationStatus: 'complete',
              photoURL: undefined,
              photoURLs: [],
              provider: 'email',
              providerId: u.id,
            };
            dispatch(setUser(localUser));
            dispatch(setAuthBootstrapped(true));
          })
          .catch(() => {
            if (cancelled) return;
            console.warn('[LOCAL_MODE] Сервер недоступен — запусти: cd local-server && npm start');
            dispatch(setAuthBootstrapped(true));
          });
      };

      loadLocalUser();
      const timer = setInterval(loadLocalUser, 3000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
    // ─────────────────────────────────────────────────────────────────────────────

    if (authRetryKey === 0) {
      dispatch(setAuthBootstrapped(false));
    }
    setAuthOffline(false);
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const startAuthSync = async () => {
      try {
        await bootstrapAuth({ timeoutMs: AUTH_BOOTSTRAP_TIMEOUT_MS, force: authRetryKey > 0 });
      } catch (error) {
        if (isAuthBootstrapTimeoutError(error)) {
          if (active) {
            setAuthOffline(true);
          }
          return;
        }

        void logClientError('auth.bootstrapAuth', error);
      }

      if (!active) {
        return;
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
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
              clearBonusQueueForUser(user.uid).catch(() => {});
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
            drainBonusQueue().catch(() => {});
            awardDailyLoginBonus().catch(() => {});
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
          drainBonusQueue().catch(() => {});
        }
      }
      });
    };

    void startAuthSync();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authRetryKey, dispatch]);

  useEffect(() => {
    if (authBootstrapped) {
      markStartupTaskReady('auth');
    }
  }, [authBootstrapped]);

  if (authOffline) {
    return (
      <AuthOfflineScreen
        onRetry={() => {
          resetAuthBootstrap();
          setAuthOffline(false);
          setAuthRetryKey((value) => value + 1);
        }}
      />
    );
  }

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
      <Toast config={toastConfig} />
      <PremiumActivatedModal visible={showPremiumModal} onDismiss={dismissPremiumModal} />
      <BusinessApprovalModal notification={claimNotification} onDismiss={dismissClaimNotification} />
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
          require('./assets/WEBP-version/Logo-Chaika-LIFE.webp'),
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
        {showSplash ? (
          <SplashAnimation onFinish={() => setShowSplash(false)} />
        ) : isCheckingFirstLaunch || isPreparingStartupImages || isCheckingVersion || isLoadingRemoteConfig ? null
        : versionCheck?.requiresUpdate ? (
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

const styles = StyleSheet.create({
  authOfflineRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F2E8',
    padding: 24,
  },
  authOfflinePanel: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#FFFDF7',
    paddingHorizontal: 22,
    paddingVertical: 28,
    shadowColor: 'rgba(74, 61, 43, 0.28)',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  authOfflineTitle: {
    color: '#2D2A24',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  authOfflineText: {
    color: '#6E6558',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 22,
    textAlign: 'center',
  },
  authOfflineButton: {
    alignSelf: 'stretch',
  },
});
