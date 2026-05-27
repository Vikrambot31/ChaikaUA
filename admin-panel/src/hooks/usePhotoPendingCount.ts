import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export const usePhotoPendingCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (LOCAL_MODE) return;
    const photosRef = ref(database, 'community_photos');
    return onValue(photosRef, (snap) => {
      if (!snap.exists()) { setCount(0); return; }
      const val = snap.val() as Record<string, { status?: string }>;
      setCount(Object.values(val).filter((p) => !p.status || p.status === 'pending').length);
    });
  }, []);

  return count;
};
