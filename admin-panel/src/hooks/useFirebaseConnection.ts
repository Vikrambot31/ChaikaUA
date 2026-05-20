import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase/firebase';

export const useFirebaseConnection = (): boolean | null => {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    return onValue(connectedRef, (snapshot) => {
      setConnected(snapshot.val() === true);
    });
  }, []);

  return connected;
};
