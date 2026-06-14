import { useEffect, useState, useCallback } from 'react';
import { onValue, ref } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { database } from '../firebase-core';
import { selectUser } from '../redux/slices/authSlice';
import type { ProfileViewRequest } from '../services/profilePermissionService';

export interface InboxItem {
  id: string;
  type: 'contact_request';
  requesterName: string;
  requesterPhotoURL: string;
  requesterId: string;
  reason?: string;
  context: string;
  sourceTitle?: string;
  sourceId?: string;
  sourceType?: string;
  timestamp: number;
  status: string;
}

const INBOX_LAST_SEEN_KEY = '@chaika:inbox_last_seen_at:';

export function useInboxNotifications() {
  const user = useSelector(selectUser);
  const userId = user?.id;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  // Use state (not ref) so that the unread-count effect re-runs when storage finishes loading
  const [lastSeenLoaded, setLastSeenLoaded] = useState(false);

  // Load last seen timestamp from AsyncStorage
  useEffect(() => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      setLastSeenAt(0);
      setLastSeenLoaded(false);
      return;
    }
    void (async () => {
      const stored = await AsyncStorage.getItem(`${INBOX_LAST_SEEN_KEY}${userId}`);
      setLastSeenAt(stored ? Number(stored) : 0);
      setLastSeenLoaded(true);
    })();
  }, [userId]);

  // Subscribe to incoming contact requests in realtime
  useEffect(() => {
    if (!userId) return;
    const requestsRef = ref(database, `profileViewRequests/${userId}`);
    const hiddenRef = ref(database, `users/${userId}/profileRequestsArchive`);

    let requestsData: Record<string, ProfileViewRequest> | null = null;
    let hiddenKeys: Set<string> = new Set();

    const buildItems = () => {
      if (!requestsData) {
        setItems([]);
        return;
      }
      const inboxItems: InboxItem[] = Object.entries(requestsData)
        .filter(([key, r]) => r.status === 'pending' && !hiddenKeys.has(key))
        .map(([key, r]) => ({
          id: key,
          type: 'contact_request' as const,
          requesterName: r.requesterName || '',
          requesterPhotoURL: r.requesterPhotoURL || '',
          requesterId: r.requesterId || key,
          reason: r.reason,
          context: r.context || 'lyudi',
          sourceTitle: r.sourceTitle,
          sourceId: r.sourceId,
          sourceType: r.sourceType,
          timestamp: new Date(r.requestedAt).getTime() || 0,
          status: r.status,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setItems(inboxItems);
    };

    const unsubRequests = onValue(
      requestsRef,
      (snap) => {
        requestsData = snap.exists() ? (snap.val() as Record<string, ProfileViewRequest>) : null;
        buildItems();
      },
      () => {
        requestsData = null;
        buildItems();
      },
    );

    const unsubHidden = onValue(
      hiddenRef,
      (snap) => {
        hiddenKeys = snap.exists() ? new Set(Object.keys(snap.val())) : new Set();
        buildItems();
      },
      () => {
        hiddenKeys = new Set();
      },
    );

    return () => {
      unsubRequests();
      unsubHidden();
    };
  }, [userId]);

  // Recompute unread count whenever items or lastSeenAt changes — but only after storage loaded
  useEffect(() => {
    if (!lastSeenLoaded) return;
    const count = items.filter((item) => item.timestamp > lastSeenAt).length;
    setUnreadCount(count);
  }, [items, lastSeenAt, lastSeenLoaded]);

  const markAllSeen = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    setLastSeenAt(now);
    setUnreadCount(0);
    void AsyncStorage.setItem(`${INBOX_LAST_SEEN_KEY}${userId}`, String(now));
  }, [userId]);

  return {
    items,
    unreadCount,
    totalCount: items.length,
    markAllSeen,
  };
}
