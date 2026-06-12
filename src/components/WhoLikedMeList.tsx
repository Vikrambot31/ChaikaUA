import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, query, ref, limitToFirst } from 'firebase/database';
import { database } from '../firebase-config';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import MiniUserAvatar from './MiniUserAvatar';
import { pickUserAvatarUri } from '../utils/userAvatar';

type Lang = 'ua' | 'ru' | 'en';

type LikerProfile = {
  userId: string;
  name: string;
  avatarUri: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  listingId: string;
  currentUserId: string;
  blockedUserIds: Set<string>;
  language: Lang;
  onViewProfile: (userId: string) => void;
  profileCache?: Map<string, { name?: string; avatarUri?: string }>;
};

const UI_TEXT = {
  ua: {
    title: 'Хто мене лайкнув',
    empty: 'Ще немає лайкiв. Тримайте анкету активною!',
    close: 'Закрити',
  },
  ru: {
    title: 'Кто меня лайкнул',
    empty: 'Пока нет лайков. Держите анкету активной!',
    close: 'Закрыть',
  },
  en: {
    title: 'Who Liked Me',
    empty: 'No likes yet. Keep your profile active!',
    close: 'Close',
  },
} as const;

const LIKERS_LIMIT = 50;
const PROFILE_BATCH_SIZE = 10;
const PROFILE_FETCH_TIMEOUT_MS = 5_000;

async function fetchLikerProfiles(
  userIds: string[],
  profileCache?: Map<string, { name?: string; avatarUri?: string }>,
): Promise<LikerProfile[]> {
  const results: LikerProfile[] = [];
  const unknownIds: string[] = [];

  for (const uid of userIds) {
    const cached = profileCache?.get(uid);
    if (cached) {
      results.push({ userId: uid, name: cached.name || '', avatarUri: cached.avatarUri || '' });
    } else {
      unknownIds.push(uid);
    }
  }

  // Batch-fetch unknown profiles in chunks of PROFILE_BATCH_SIZE
  for (let i = 0; i < unknownIds.length; i += PROFILE_BATCH_SIZE) {
    const chunk = unknownIds.slice(i, i + PROFILE_BATCH_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (uid) => {
        const snap = await Promise.race([
          get(ref(database, `users/${uid}`)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('profile-timeout')), PROFILE_FETCH_TIMEOUT_MS),
          ),
        ]);
        const data = snap.val() as Record<string, unknown> | null;
        const name = typeof data?.name === 'string' ? data.name.trim() : '';
        const avatarUri = pickUserAvatarUri(data);
        return { userId: uid, name, avatarUri: avatarUri || '' } satisfies LikerProfile;
      }),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }

  return results;
}

export default function WhoLikedMeList({
  visible,
  onClose,
  listingId,
  currentUserId,
  blockedUserIds,
  language,
  onViewProfile,
  profileCache,
}: Props) {
  const text = UI_TEXT[language];
  const [loading, setLoading] = useState(false);
  const [likers, setLikers] = useState<LikerProfile[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!visible || !listingId) {
      setFetched(false);
      setLikers([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        await ensureFirebaseAuth();
        const likesQuery = query(
          ref(database, `feed_likes/contacts/${listingId}`),
          limitToFirst(LIKERS_LIMIT),
        );
        const snap = await get(likesQuery);
        if (cancelled) return;

        const rawData = snap.val();
        if (!rawData || typeof rawData !== 'object') {
          setLikers([]);
          setFetched(true);
          return;
        }

        const allUserIds = Object.keys(rawData).filter(
          (uid) => uid !== currentUserId && !blockedUserIds.has(uid),
        );

        if (allUserIds.length === 0) {
          setLikers([]);
          setFetched(true);
          return;
        }

        const profiles = await fetchLikerProfiles(allUserIds, profileCache);
        if (cancelled) return;
        setLikers(profiles);
        setFetched(true);
      } catch (err) {
        console.warn('[WhoLikedMeList] load failed:', err);
        if (!cancelled) {
          setLikers([]);
          setFetched(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [visible, listingId, currentUserId, blockedUserIds, profileCache]);

  const renderItem = useCallback(({ item }: { item: LikerProfile }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onViewProfile(item.userId)}
      activeOpacity={0.82}
    >
      <MiniUserAvatar
        uri={item.avatarUri}
        name={item.name}
        size={44}
        borderRadius={14}
        backgroundColor="#6A8BA5"
      />
      <Text style={styles.rowName} numberOfLines={1}>{item.name || item.userId.slice(0, 8)}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#78716C" />
    </TouchableOpacity>
  ), [onViewProfile]);

  const keyExtractor = useCallback((item: LikerProfile) => item.userId, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{text.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.75}>
              <Text style={styles.closeText}>{text.close}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#CA8A04" />
            </View>
          ) : fetched && likers.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="heart-outline" size={48} color="#CA8A04" />
              <Text style={styles.emptyText}>{text.empty}</Text>
            </View>
          ) : (
            <FlatList
              data={likers}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(97,46,81,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '80%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: '#E8D9B5',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#CA8A04',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D9B5',
  },
  title: {
    color: '#612e51',
    fontSize: 17,
    fontWeight: '900',
    flex: 1,
    paddingRight: 8,
    letterSpacing: 0.3,
  },
  closeBtn: {
    backgroundColor: '#612e51',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  closeText: {
    color: '#CA8A04',
    fontWeight: '800',
    fontSize: 12,
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyBox: {
    paddingVertical: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#44403C',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EDD6',
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#612e51',
  },
});
