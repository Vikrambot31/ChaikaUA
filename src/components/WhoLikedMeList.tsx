import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, query, ref, limitToFirst, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import MiniUserAvatar from './MiniUserAvatar';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { parseLikeEntry } from '../utils/likeUtils';

type Lang = 'ua' | 'ru' | 'en';

type LikerProfile = {
  userId: string;
  name: string;
  avatarUri: string;
  age: string;
  likedAt: number;
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
    years: 'р.',
    justNow: 'щойно',
    minutesAgo: (n: number) => `${n} хв тому`,
    hoursAgo: (n: number) => `${n} год тому`,
    daysAgo: (n: number) => `${n} дн тому`,
    monthsAgo: (n: number) => `${n} міс тому`,
  },
  ru: {
    title: 'Кто меня лайкнул',
    empty: 'Пока нет лайков. Держите анкету активной!',
    close: 'Закрыть',
    years: 'л.',
    justNow: 'только что',
    minutesAgo: (n: number) => `${n} мин назад`,
    hoursAgo: (n: number) => `${n} ч назад`,
    daysAgo: (n: number) => `${n} дн назад`,
    monthsAgo: (n: number) => `${n} мес назад`,
  },
  en: {
    title: 'Who Liked Me',
    empty: 'No likes yet. Keep your profile active!',
    close: 'Close',
    years: 'y.o.',
    justNow: 'just now',
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    daysAgo: (n: number) => `${n}d ago`,
    monthsAgo: (n: number) => `${n}mo ago`,
  },
};

type UITextBlock = {
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  monthsAgo: (n: number) => string;
};

function formatLikeTime(t: number, txt: UITextBlock): string | null {
  if (t <= 0) return null;
  const diff = Date.now() - t;
  if (diff < 60_000) return txt.justNow;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return txt.minutesAgo(mins);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return txt.hoursAgo(hours);
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return txt.daysAgo(days);
  return txt.monthsAgo(Math.floor(days / 30));
}

const LIKERS_LIMIT = 50;
const PROFILE_BATCH_SIZE = 10;
const PROFILE_FETCH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('profile-timeout')), PROFILE_FETCH_TIMEOUT_MS),
    ),
  ]);
}

async function fetchLikerProfiles(
  userIds: string[],
  timestamps: Record<string, number>,
  profileCache?: Map<string, { name?: string; avatarUri?: string }>,
): Promise<LikerProfile[]> {
  const results: LikerProfile[] = [];
  const unknownIds: string[] = [];

  for (const uid of userIds) {
    const cached = profileCache?.get(uid);
    if (cached) {
      results.push({ userId: uid, name: cached.name || '', avatarUri: cached.avatarUri || '', age: '', likedAt: timestamps[uid] ?? 0 });
    } else {
      unknownIds.push(uid);
    }
  }

  // Batch-fetch unknown profiles in chunks of PROFILE_BATCH_SIZE
  for (let i = 0; i < unknownIds.length; i += PROFILE_BATCH_SIZE) {
    const chunk = unknownIds.slice(i, i + PROFILE_BATCH_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (uid) => {
        const snap = await fetchWithTimeout(get(ref(database, `users/${uid}`)));
        const data = snap.val() as Record<string, unknown> | null;
        const name = typeof data?.name === 'string' ? data.name.trim() : '';
        const avatarUri = pickUserAvatarUri(data) || '';

        // Fetch age from the user's own contacts_listing
        let age = '';
        try {
          const listingQuery = query(
            ref(database, 'contacts_listings'),
            orderByChild('userId'),
            equalTo(uid),
            limitToFirst(1),
          );
          const listingSnap = await fetchWithTimeout(get(listingQuery));
          if (listingSnap.exists()) {
            const entries = listingSnap.val() as Record<string, Record<string, unknown>>;
            const first = Object.values(entries)[0];
            if (first && typeof first.price === 'string' && first.price.trim()) {
              age = first.price.trim();
            }
          }
        } catch {
          // age stays empty — non-critical
        }

        return { userId: uid, name, avatarUri, age, likedAt: timestamps[uid] ?? 0 } satisfies LikerProfile;
      }),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }

  // Sort by likedAt descending (newest first); legacy (t=0) at end
  results.sort((a, b) => {
    if (a.likedAt === 0 && b.likedAt === 0) return 0;
    if (a.likedAt === 0) return 1;
    if (b.likedAt === 0) return -1;
    return b.likedAt - a.likedAt;
  });

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

        const allUserIds: string[] = [];
        const timestamps: Record<string, number> = {};
        for (const [uid, val] of Object.entries(rawData as Record<string, unknown>)) {
          if (uid === currentUserId || blockedUserIds.has(uid)) continue;
          const entry = parseLikeEntry(val);
          if (!entry.liked) continue;
          allUserIds.push(uid);
          if (entry.t > 0) timestamps[uid] = entry.t;
        }

        if (allUserIds.length === 0) {
          setLikers([]);
          setFetched(true);
          return;
        }

        const profiles = await fetchLikerProfiles(allUserIds, timestamps, profileCache);
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

  const renderItem = useCallback(({ item }: { item: LikerProfile }) => {
    const timeLabel = formatLikeTime(item.likedAt, text);
    return (
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
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name || item.userId.slice(0, 8)}
            {item.age ? <Text style={styles.rowAge}> · {item.age} {text.years}</Text> : null}
          </Text>
          {timeLabel ? <Text style={styles.rowTime}>{timeLabel}</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#78716C" />
      </TouchableOpacity>
    );
  }, [onViewProfile, text]);

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
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#612e51',
  },
  rowAge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78716C',
  },
  rowTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E8E80',
    marginTop: 2,
  },
});
