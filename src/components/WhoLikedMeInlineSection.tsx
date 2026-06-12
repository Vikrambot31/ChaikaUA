import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { get, query, ref, limitToFirst, orderByChild, equalTo } from 'firebase/database';
import { database } from '../firebase-config';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { parseLikeEntry } from '../utils/likeUtils';
import { pickUserAvatarUri } from '../utils/userAvatar';
import MiniUserAvatar from './MiniUserAvatar';

type Lang = 'ua' | 'ru' | 'en';

type LikerRow = {
  userId: string;
  name: string;
  avatarUri: string;
  age: string;
  likedAt: number;
};

type Props = {
  listingId: string;
  currentUserId: string;
  language: Lang;
  blockedUserIds?: Set<string>;
  onViewProfile: (userId: string) => void;
};

const UI_TEXT = {
  ua: {
    title: 'Хто мене лайкнув',
    empty: 'Поки що лайків немає. Тримайте анкету активною!',
    showMore: (n: number) => `Показати ще ${n}`,
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
    showMore: (n: number) => `Показать ещё ${n}`,
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
    showMore: (n: number) => `Show ${n} more`,
    years: 'y.o.',
    justNow: 'just now',
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    daysAgo: (n: number) => `${n}d ago`,
    monthsAgo: (n: number) => `${n}mo ago`,
  },
} as const;

const LIKERS_LIMIT = 30;
const PAGE_SIZE = 20;
const PROFILE_BATCH = 10;
const FETCH_TIMEOUT_MS = 5_000;

type UITextBlock = {
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  monthsAgo: (n: number) => string;
};

function formatLikeTime(t: number, text: UITextBlock): string | null {
  if (t <= 0) return null;
  const diff = Date.now() - t;
  if (diff < 60_000) return text.justNow;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return text.minutesAgo(mins);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return text.hoursAgo(hours);
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return text.daysAgo(days);
  const months = Math.floor(days / 30);
  return text.monthsAgo(months);
}

async function fetchWithTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS),
    ),
  ]);
}

async function fetchLikerRows(
  userIds: string[],
  timestamps: Record<string, number>,
): Promise<LikerRow[]> {
  const rows: LikerRow[] = [];

  for (let i = 0; i < userIds.length; i += PROFILE_BATCH) {
    const chunk = userIds.slice(i, i + PROFILE_BATCH);
    const settled = await Promise.allSettled(
      chunk.map(async (uid) => {
        // Fetch user profile (name + avatar)
        const userSnap = await fetchWithTimeout(get(ref(database, `users/${uid}`)));
        const userData = userSnap.val() as Record<string, unknown> | null;
        const name = typeof userData?.name === 'string' ? userData.name.trim() : '';
        const avatarUri = pickUserAvatarUri(userData) || '';

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

        return {
          userId: uid,
          name,
          avatarUri,
          age,
          likedAt: timestamps[uid] ?? 0,
        } satisfies LikerRow;
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') rows.push(result.value);
    }
  }

  // Sort by likedAt descending (newest first); legacy (t=0) at end
  rows.sort((a, b) => {
    if (a.likedAt === 0 && b.likedAt === 0) return 0;
    if (a.likedAt === 0) return 1;
    if (b.likedAt === 0) return -1;
    return b.likedAt - a.likedAt;
  });

  return rows;
}

export default function WhoLikedMeInlineSection({
  listingId,
  currentUserId,
  language,
  blockedUserIds,
  onViewProfile,
}: Props) {
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LikerRow[]>([]);
  const [fetched, setFetched] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!listingId || !currentUserId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        await ensureFirebaseAuth();
        const snap = await get(ref(database, `feed_likes/contacts/${listingId}`));
        if (cancelled) return;

        const rawData = snap.val();
        if (!rawData || typeof rawData !== 'object') {
          setRows([]);
          setFetched(true);
          return;
        }

        const blocked = blockedUserIds ?? new Set<string>();
        const timestamps: Record<string, number> = {};
        const userIds: string[] = [];

        for (const [uid, val] of Object.entries(rawData as Record<string, unknown>)) {
          if (uid === currentUserId || blocked.has(uid)) continue;
          const entry = parseLikeEntry(val);
          if (!entry.liked) continue;
          userIds.push(uid);
          if (entry.t > 0) timestamps[uid] = entry.t;
        }

        if (userIds.length === 0) {
          setRows([]);
          setFetched(true);
          return;
        }

        // Sort by timestamp (newest first) BEFORE slicing so we fetch the most recent likers
        userIds.sort((a, b) => {
          const ta = timestamps[a] ?? 0;
          const tb = timestamps[b] ?? 0;
          if (ta === 0 && tb === 0) return 0;
          if (ta === 0) return 1;
          if (tb === 0) return -1;
          return tb - ta;
        });
        const limited = userIds.slice(0, LIKERS_LIMIT);
        const profiles = await fetchLikerRows(limited, timestamps);
        if (cancelled) return;
        setRows(profiles);
        setFetched(true);
      } catch (err) {
        console.warn('[WhoLikedMeInlineSection] load failed:', err);
        if (!cancelled) {
          setRows([]);
          setFetched(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [listingId, currentUserId, blockedUserIds]);

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const visibleRows = rows.slice(0, visibleCount);
  const remaining = rows.length - visibleCount;

  if (!fetched && !loading) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="heart" size={18} color="#CA8A04" />
        <Text style={styles.title}>
          {text.title}
          {fetched && rows.length > 0 ? ` (${rows.length})` : ''}
        </Text>
      </View>

      {/* Loading */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#CA8A04" />
        </View>
      ) : fetched && rows.length === 0 ? (
        /* Empty */
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="heart-outline" size={36} color="#CA8A04" />
          <Text style={styles.emptyText}>{text.empty}</Text>
        </View>
      ) : (
        /* List */
        <>
          {visibleRows.map((item) => {
            const timeLabel = formatLikeTime(item.likedAt, text);
            return (
              <TouchableOpacity
                key={item.userId}
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
                    {item.age ? (
                      <Text style={styles.rowAge}> · {item.age} {text.years}</Text>
                    ) : null}
                  </Text>
                  {timeLabel ? (
                    <Text style={styles.rowTime}>{timeLabel}</Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#78716C" />
              </TouchableOpacity>
            );
          })}

          {/* Show more */}
          {remaining > 0 ? (
            <TouchableOpacity style={styles.showMoreBtn} onPress={handleShowMore} activeOpacity={0.8}>
              <Text style={styles.showMoreText}>{text.showMore(Math.min(remaining, PAGE_SIZE))}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: '#FFF8EC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8D9B5',
    paddingBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D9B5',
  },
  title: {
    color: '#612e51',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyBox: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#44403C',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
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
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  showMoreText: {
    color: '#CA8A04',
    fontSize: 13,
    fontWeight: '800',
  },
});
