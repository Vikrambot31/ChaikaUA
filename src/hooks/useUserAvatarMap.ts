import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { database } from '../firebase-config';
import { resolveUserAvatarMap } from '../utils/userAvatar';

export const useUserAvatarMap = (rawUserIds: Array<string | undefined | null>): Record<string, string> => {
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});

  const userIdKey = useMemo(
    () => Array.from(new Set(rawUserIds.filter((id): id is string => Boolean(id)))).sort().join('|'),
    [rawUserIds],
  );

  useFocusEffect(
    useCallback(() => {
      const userIds = userIdKey ? userIdKey.split('|') : [];
      if (userIds.length === 0) return undefined;

      let active = true;
      void resolveUserAvatarMap(database, userIds).then((resolved) => {
        if (!active) return;
        setAvatarByUserId((prev) => ({ ...prev, ...resolved }));
      }).catch(() => undefined);

      return () => {
        active = false;
      };
    }, [userIdKey]),
  );

  return avatarByUserId;
};
