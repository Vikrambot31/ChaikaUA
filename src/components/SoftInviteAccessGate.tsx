import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { COLORS } from '../utils/constants';
import { selectUser } from '../redux/slices/authSlice';
import InviteAccessScreen from '../screens/InviteAccessScreen';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import InviteAccessIntroSlides from './InviteAccessIntroSlides';
import {
  getMyInviteRequestStatus,
  isValidSponsorPhone,
  subscribeMyInviteAccessStatus,
  type InviteRequestSnapshot,
} from '../services/sponsorService';
import { TrustedAccessContext } from '../contexts/TrustedAccessContext';
import { isPrimaryServiceEmail } from '../firebase-auth-session';
import { auth } from '../firebase-core';
import { getCurrentUserSecurityRole } from '../services/securityRoles';
import {
  isEmergencyAccessActive,
  subscribeEmergencyAccess,
  type EmergencyAccessCurrent,
} from '../services/emergencyAccess';

type SoftInviteAccessGateProps = {
  children: React.ReactNode;
};

const REFRESH_ON_ACTIVE_THROTTLE_MS = 15000;

const shouldShowInviteRequest = (snapshot: InviteRequestSnapshot | null): boolean =>
  snapshot?.featureEnabled === true && snapshot.status === 'cancelled';

const shouldShowPending = (snapshot: InviteRequestSnapshot | null): snapshot is InviteRequestSnapshot =>
  snapshot?.featureEnabled === true && (
    snapshot.status === 'denied' ||
    snapshot.status === 'auto_denied' ||
    snapshot.accessStatus === 'blocked'
  );

const hasPendingInvite = (snapshot: InviteRequestSnapshot | null): boolean =>
  snapshot?.featureEnabled === true && (
    snapshot.status === 'pending' ||
    snapshot.status === 'pending_sponsor' ||
    snapshot.status === 'needs_manual_review'
  );

const hasRuntimeAccess = (snapshot: InviteRequestSnapshot | null): boolean => (
  snapshot?.bypass === true ||
  snapshot?.status === 'approved' ||
  snapshot?.status === 'temporary_access' ||
  snapshot?.accessStatus === 'approved' ||
  snapshot?.accessStatus === 'temporary_access' ||
  snapshot?.accessStatus === 'whitelist_access' ||
  snapshot?.userAccess?.status === 'temporary_access'
);

const hasTemporaryAccess = (snapshot: InviteRequestSnapshot | null): boolean => (
  snapshot?.status === 'temporary_access' ||
  snapshot?.accessStatus === 'temporary_access' ||
  snapshot?.userAccess?.status === 'temporary_access'
);

const formatTempAccessUntil = (expiresAt?: number): string => {
  if (!expiresAt) return '';
  return new Date(expiresAt).toLocaleString('uk-UA');
};

export default function SoftInviteAccessGate({ children }: SoftInviteAccessGateProps) {
  const user = useSelector(selectUser);
  const [snapshot, setSnapshot] = useState<InviteRequestSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [forcedInviteVisible, setForcedInviteVisible] = useState(false);
  const [inviteIntroSeen, setInviteIntroSeen] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const [emergencyAccess, setEmergencyAccess] = useState<EmergencyAccessCurrent | null>(null);
  const [isPrivilegedUser, setIsPrivilegedUser] = useState(() => isPrimaryServiceEmail(auth.currentUser));
  const wasInviteRequiredRef = useRef(false);
  const previousAccessStatusRef = useRef<string | null>(null);
  const requesterPhone = user?.phone || '';
  const inviteRequired = shouldShowInviteRequest(snapshot);
  const showInviteFlow = forcedInviteVisible || inviteRequired;

  const openInviteAccess = () => {
    setDismissedForSession(false);
    setInviteIntroSeen(true);
    setForcedInviteVisible(true);
  };

  const trustedValue = (isTrusted: boolean, isLoading: boolean, pendingInvite: boolean) => ({
    isTrusted,
    isLoading,
    hasPendingInvite: pendingInvite,
    openInviteAccess,
  });

  const refresh = async () => {
    if (!user?.id) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    try {
      const next = await getMyInviteRequestStatus();
      setSnapshot(next);
      setLastRefreshAt(Date.now());
    } catch {
      setSnapshot({ featureEnabled: true, status: 'none', accessStatus: 'not_started' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDismissedForSession(false);
    setInviteIntroSeen(false);
    void refresh();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    return subscribeMyInviteAccessStatus(() => {
      void refresh();
    });
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = subscribeEmergencyAccess(
      setEmergencyAccess,
      () => setEmergencyAccess(null),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isPrimaryServiceEmail(auth.currentUser)) {
      setIsPrivilegedUser(true);
      return;
    }
    if (!user?.id) {
      setIsPrivilegedUser(false);
      return;
    }

    let active = true;
    void getCurrentUserSecurityRole().then((roleSnapshot) => {
      if (active) {
        setIsPrivilegedUser(roleSnapshot.role === 'admin' || roleSnapshot.role === 'moderator');
      }
    }).catch(() => {
      if (active) {
        setIsPrivilegedUser(false);
      }
    });

    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      if (Date.now() - lastRefreshAt < REFRESH_ON_ACTIVE_THROTTLE_MS) {
        return;
      }
      void refresh();
    });

    return () => subscription.remove();
  }, [lastRefreshAt, user?.id]);

  useEffect(() => {
    if (inviteRequired && !wasInviteRequiredRef.current) {
      setInviteIntroSeen(false);
    }
    wasInviteRequiredRef.current = inviteRequired;
  }, [inviteRequired]);

  useEffect(() => {
    const current = snapshot?.accessStatus || snapshot?.status || snapshot?.userAccess?.status || null;
    const previous = previousAccessStatusRef.current;
    if (previous === 'approved' && current && current !== 'approved') {
      Alert.alert(
        'Ваш доступ был изменён',
        snapshot?.moderationReason || snapshot?.userAccess?.manual_grant_reason || 'Доступ изменён. Можно продолжить просмотр доступных разделов и уточнить детали у поручителя.',
        [{ text: 'Понятно' }],
      );
    }
    if (current) {
      previousAccessStatusRef.current = current;
    }
  }, [snapshot?.accessStatus, snapshot?.status, snapshot?.userAccess?.status, snapshot?.moderationReason, snapshot?.userAccess?.manual_grant_reason]);

  // ── No user (not logged in) ──────────────────────────────────────────────
  // Auth guards handle redirect; trusted = false but irrelevant since there's
  // no authenticated session.
  if (!user?.id) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(false, false, false)}>
        {children}
      </TrustedAccessContext.Provider>
    );
  }

  if (
    isPrivilegedUser &&
    isEmergencyAccessActive(emergencyAccess) &&
    emergencyAccess?.bypassInviteAccess
  ) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(true, false, false)}>
        {children}
      </TrustedAccessContext.Provider>
    );
  }

  // в"Ђв"Ђ User skipped the invite gate ("Continue without request") в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  // They are Registered but NOT Trusted. Show app with restricted access
  // and an amber banner explaining the limitation.
  if (dismissedForSession) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(false, false, false)}>
        <View style={styles.runtimeAccessRoot}>
          {children}
          <View pointerEvents="none" style={styles.registeredBanner}>
            <Text style={styles.registeredBannerTitle}>Обмежений доступ</Text>
            <Text style={styles.registeredBannerText}>Для повного доступу потрібна перевірка заявки або підтвердження поручителя. Поки доступні базові розділи.</Text>
          </View>
        </View>
      </TrustedAccessContext.Provider>
    );
  }

  // в"Ђв"Ђ Snapshot still loading (null = not yet fetched) в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  // Propagate isLoading: true so GuardedScreen shows a spinner instead of
  // the AccessRestrictedScreen while we wait for the server response.
  if (snapshot === null) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(false, true, false)}>
        {children}
      </TrustedAccessContext.Provider>
    );
  }

  // в"Ђв"Ђ Feature disabled globally в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  // When featureEnabled is false/undefined the invite system is turned off вЂ"
  // no restrictions apply.
  if (snapshot!.featureEnabled !== true) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(true, false, false)}>
        {children}
      </TrustedAccessContext.Provider>
    );
  }

  // в"Ђв"Ђ User has full runtime access (approved / whitelist / bypass) в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  if (hasRuntimeAccess(snapshot)) {
    if (!hasTemporaryAccess(snapshot)) {
      return (
        <TrustedAccessContext.Provider value={trustedValue(true, false, false)}>
          {children}
        </TrustedAccessContext.Provider>
      );
    }

    const expiresLabel = formatTempAccessUntil(snapshot?.userAccess?.temp_expires_at);
    return (
      <TrustedAccessContext.Provider value={trustedValue(true, false, false)}>
        <View style={styles.runtimeAccessRoot}>
          {children}
          <View pointerEvents="none" style={styles.tempAccessBanner}>
            <Text style={styles.tempAccessTitle}>Доступ тимчасово активовано</Text>
            <Text style={styles.tempAccessText}>Може знадобитися додаткова перевірка{expiresLabel ? ` до ${expiresLabel}` : ""}.</Text>
          </View>
        </View>
      </TrustedAccessContext.Provider>
    );
  }

  if (loading && snapshot === null) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (shouldShowPending(snapshot)) {
    return (
      <PendingApprovalScreen
        initialStatus={snapshot!}
        onRefreshStatus={setSnapshot}
        onCreateNewRequest={() => {
          setSnapshot({ featureEnabled: true, status: 'none' });
          setForcedInviteVisible(true);
        }}
        allowContinue={false}
        onContinue={() => {}}
      />
    );
  }

  // в"Ђв"Ђ User without a valid +380 phone and no approved access в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  // Let them use the app as a guest, but never grant trusted access implicitly.
  if (!isValidSponsorPhone(requesterPhone)) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(false, false, false)}>
        <View style={styles.runtimeAccessRoot}>
          {children}
          <View pointerEvents="none" style={styles.registeredBanner}>
            <Text style={styles.registeredBannerTitle}>Обмежений доступ</Text>
            <Text style={styles.registeredBannerText}>Для повного доступу потрібна перевірка заявки або підтвердження поручителя. Поки доступні базові розділи.</Text>
          </View>
        </View>
      </TrustedAccessContext.Provider>
    );
  }

  if (showInviteFlow) {
    if (!inviteIntroSeen) {
      return <InviteAccessIntroSlides onDone={() => setInviteIntroSeen(true)} />;
    }

    return (
      <InviteAccessScreen
        requesterPhone={requesterPhone}
        allowContinue
        onSubmitted={() => {
          setForcedInviteVisible(false);
          void refresh();
        }}
        onContinue={() => {
          setForcedInviteVisible(false);
          setDismissedForSession(true);
        }}
      />
    );
  }

  if (hasPendingInvite(snapshot)) {
    return (
      <TrustedAccessContext.Provider value={trustedValue(false, false, true)}>
        <PendingApprovalScreen
          initialStatus={snapshot}
          onRefreshStatus={setSnapshot}
          onCreateNewRequest={() => {
            setSnapshot({ featureEnabled: true, status: 'none' });
            setForcedInviteVisible(true);
          }}
          allowContinue
          onContinue={() => setDismissedForSession(true)}
        />
      </TrustedAccessContext.Provider>
    );
  }

  // в"Ђв"Ђ Guest access fallback: no approved/temporary/whitelist status в"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђв"Ђ
  return (
    <TrustedAccessContext.Provider value={trustedValue(false, false, false)}>
      <View style={styles.runtimeAccessRoot}>
        {children}
        <View pointerEvents="none" style={styles.registeredBanner}>
          <Text style={styles.registeredBannerTitle}>Обмежений доступ</Text>
          <Text style={styles.registeredBannerText}>Для повного доступу потрібна перевірка заявки або підтвердження поручителя. Поки доступні базові розділи.</Text>
        </View>
      </View>
    </TrustedAccessContext.Provider>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FB',
  },
  runtimeAccessRoot: {
    flex: 1,
  },
  // Amber banner shown when user skipped the invite gate (Registered, not Trusted)
  registeredBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(180, 100, 0, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  registeredBannerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  registeredBannerText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 3,
  },
  // Blue banner shown for temporary_access users
  tempAccessBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(23, 84, 135, 0.94)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tempAccessTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  tempAccessText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 3,
  },
});
