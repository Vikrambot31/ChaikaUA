import { useEffect, useState } from 'react';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';

// В LOCAL_MODE проверяем доступность json-server вместо Firebase RTDB
export const useFirebaseConnection = (): boolean | null => {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (LOCAL_MODE) {
      // Пингуем локальный сервер
      const check = () => {
        fetch(`${LOCAL_API}/config`)
          .then(() => setConnected(true))
          .catch(() => setConnected(false));
      };
      check();
      const interval = window.setInterval(check, 10_000);
      return () => window.clearInterval(interval);
    }

    // Production: слушаем Firebase .info/connected
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const { onValue, ref } = await import('firebase/database');
      const { database } = await import('../firebase/firebase');
      const connectedRef = ref(database, '.info/connected');
      unsubscribe = onValue(connectedRef, (snapshot) => {
        setConnected(snapshot.val() === true);
      });
    })();
    return () => unsubscribe?.();
  }, []);

  return connected;
};
