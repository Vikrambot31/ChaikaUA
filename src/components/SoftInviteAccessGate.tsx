import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { COLORS } from '../utils/constants';
import { selectUser } from '../redux/slices/authSlice';
import InviteAccessScreen from '../screens/InviteAccessScreen';
import PendingApprovalScreen from '../screens/PendingApprovalScreen';
import {
  getMyInviteRequestStatus,
  isValidSponsorPhone,
  type InviteRequestSnapshot,
} from '../services/sponsorService';

type SoftInviteAccessGateProps = {
  children: React.ReactNode;
};

const REFRESH_ON_ACTIVE_THROTTLE_MS = 15000;

const shouldShowInviteRequest = (snapshot: InviteRequestSnapshot | null): boolean =>
  snapshot?.featureEnabled === true && (snapshot.status === 'none' || snapshot.status === 'cancelled');

const shouldShowPending = (snapshot: InviteRequestSnapshot | null): boolean =>
  snapshot?.featureEnabled === true && (
    snapshot.status === 'pending' ||
    snapshot.status === 'pending_sponsor' ||
    snapshot.status === 'needs_manual_review' ||
    snapshot.status === 'denied' ||
    snapshot.status === 'auto_denied'
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
  return new Date(expiresAt).toLocaleString();
};

export default function SoftInviteAccessGate({ children }: SoftInviteAccessGateProps) {
  const user = useSelector(selectUser);
  const [snapshot, setSnapshot] = useState<InviteRequestSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const requesterPhone = user?.phone || '';

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
      setSnapshot({ featureEnabled: false, status: 'disabled' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDismissedForSession(false);
    void refresh();
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

  if (!user?.id || dismissedForSession || snapshot?.featureEnabled !== true) {
    return <>{children}</>;
  }

  if (hasRuntimeAccess(snapshot)) {
    if (!hasTemporaryAccess(snapshot)) {
      return <>{children}</>;
    }

    const expiresLabel = formatTempAccessUntil(snapshot.userAccess?.temp_expires_at);
    return (
      <View style={styles.runtimeAccessRoot}>
        {children}
        <View pointerEvents="none" style={styles.tempAccessBanner}>
          <Text style={styles.tempAccessTitle}>Доступ тимчасово активовано</Text>
          <Text style={styles.tempAccessText}>
            Може знадобитися додаткова перевірка{expiresLabel ? ` до ${expiresLabel}` : ''}.
          </Text>
        </View>
      </View>
    );
  }

  if (loading && snapshot === null) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isValidSponsorPhone(requesterPhone)) {
    return <>{children}</>;
  }

  if (shouldShowInviteRequest(snapshot)) {
    return (
      <InviteAccessScreen
        requesterPhone={requesterPhone}
        onSubmitted={() => {
          void refresh();
        }}
        onContinue={() => setDismissedForSession(true)}
      />
    );
  }

  if (shouldShowPending(snapshot)) {
    return (
      <PendingApprovalScreen
        initialStatus={snapshot}
        onRefreshStatus={setSnapshot}
        onCreateNewRequest={() => setSnapshot({ featureEnabled: true, status: 'none' })}
        onContinue={() => setDismissedForSession(true)}
      />
    );
  }

  return <>{children}</>;
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
