import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export const usePhotoPendingCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (LOCAL_MODE) return;
    let communityCount = 0;
    let userPhotosCount = 0;
    let requestPhotosCount = 0;
    const publish = () => setCount(communityCount + userPhotosCount + requestPhotosCount);

    const unsubscribeCommunity = onValue(ref(database, 'community_photos'), (snap) => {
      if (!snap.exists()) { communityCount = 0; publish(); return; }
      const val = snap.val() as Record<string, { status?: string; moderationStatus?: string }>;
      communityCount = Object.values(val).filter((p) => (p.moderationStatus || p.status || 'pending') === 'pending').length;
      publish();
    });

    const unsubscribeUserPhotos = onValue(ref(database, 'user_photos'), (snap) => {
      if (!snap.exists()) { userPhotosCount = 0; publish(); return; }
      const val = snap.val() as Record<string, Record<string, { status?: string; moderationStatus?: string }>>;
      userPhotosCount = Object.values(val).reduce((total, photos) => (
        total + Object.values(photos || {}).filter((p) => (p.moderationStatus || p.status) === 'pending').length
      ), 0);
      publish();
    });

    const unsubscribeRequestPhotos = onValue(ref(database, 'request_photos'), (snap) => {
      if (!snap.exists()) { requestPhotosCount = 0; publish(); return; }
      const val = snap.val() as Record<string, Record<string, { status?: string; moderationStatus?: string }>>;
      requestPhotosCount = Object.values(val).reduce((total, photos) => (
        total + Object.values(photos || {}).filter((p) => (p.moderationStatus || p.status) === 'pending').length
      ), 0);
      publish();
    });

    return () => {
      unsubscribeCommunity();
      unsubscribeUserPhotos();
      unsubscribeRequestPhotos();
    };
  }, []);

  return count;
};
