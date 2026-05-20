import { useEffect } from 'react';
import { onValue, ref } from 'firebase/database';
import { useDispatch } from 'react-redux';
import { database } from '../firebase-core';
import { setOnlineStatus } from '../redux/slices/networkSlice';
import type { AppDispatch } from '../redux/store';
import { setRuntimeMonitorNetworkState } from '../services/runtimeMonitorService';
import { setSnapshotNetworkState } from '../services/stateSnapshotService';
import { markStartupTaskReady } from '../services/startupSync';

const OFFLINE_DEBOUNCE_MS = 3000;

/**
 * Subscribes to Firebase RTDB .info/connected and syncs the result
 * into Redux networkSlice. Mount once at the app root.
 */
export function useNetworkMonitor() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;
    let startupMarkedReady = false;

    const unsubscribe = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      if (!startupMarkedReady) {
        startupMarkedReady = true;
        markStartupTaskReady('firebase');
      }

      if (isConnected) {
        if (offlineTimer) {
          clearTimeout(offlineTimer);
          offlineTimer = null;
        }
        setRuntimeMonitorNetworkState('online');
        setSnapshotNetworkState('online');
        dispatch(setOnlineStatus(true));
        return;
      }

      if (offlineTimer) {
        return;
      }

      // RTDB socket can briefly flap while internet is still available.
      // Wait a bit before showing offline to reduce false negatives.
      offlineTimer = setTimeout(() => {
        setRuntimeMonitorNetworkState('offline');
        setSnapshotNetworkState('offline');
        dispatch(setOnlineStatus(false));
        offlineTimer = null;
      }, OFFLINE_DEBOUNCE_MS);
    });

    return () => {
      if (offlineTimer) {
        clearTimeout(offlineTimer);
      }
      unsubscribe();
    };
  }, [dispatch]);
}
