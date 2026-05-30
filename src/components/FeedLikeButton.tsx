import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { onValue, ref, runTransaction } from 'firebase/database';
import { database } from '../firebase-config';
import { useSoftToast } from '../hooks/useSoftToast';

type Props = {
  currentUserId?: string;
  likePath: string;
  likeId: string;
  style?: StyleProp<ViewStyle>;
  stopPropagation?: boolean;
};

export default function FeedLikeButton({
  currentUserId,
  likePath,
  likeId,
  style,
  stopPropagation = true,
}: Props) {
  const [likes, setLikes] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState(false);
  const { showError, showInfo } = useSoftToast();

  useEffect(() => {
    if (!likePath || !likeId) return;
    const unsubscribe = onValue(ref(database, `${likePath}/${likeId}`), (snapshot) => {
      const value = snapshot.val();
      setLikes(value && typeof value === 'object' ? value : {});
    });
    return unsubscribe;
  }, [likeId, likePath]);

  const liked = Boolean(currentUserId && likes[currentUserId]);
  const count = Object.keys(likes).length;

  const handlePress = async (event?: GestureResponderEvent) => {
    if (stopPropagation) event?.stopPropagation();
    if (!currentUserId) {
      showInfo('Sign in required', 'Only registered users can like');
      return;
    }
    if (busy) return;

    const previousLikes = likes;
    const nextLikes = { ...previousLikes };
    if (nextLikes[currentUserId]) {
      delete nextLikes[currentUserId];
    } else {
      nextLikes[currentUserId] = true;
    }

    setLikes(nextLikes);
    setBusy(true);
    try {
      await runTransaction(ref(database, `${likePath}/${likeId}/${currentUserId}`), (current) => (current ? null : true));
    } catch {
      setLikes(previousLikes);
      showError('Could not save', 'Tap like again to retry');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, liked && styles.buttonActive, busy && styles.buttonDisabled, style]}
      onPress={handlePress}
      disabled={busy}
      activeOpacity={0.82}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <MaterialCommunityIcons name={liked ? 'heart' : 'heart-outline'} size={15} color="#fff" />
          <Text style={styles.count}>{count}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#7A1E5C',
  },
  buttonActive: {
    backgroundColor: '#B13A70',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  count: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
});
