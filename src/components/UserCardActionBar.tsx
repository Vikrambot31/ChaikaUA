import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { onValue, ref, runTransaction } from 'firebase/database';
import { database } from '../firebase-config';
import MiniUserAvatar from './MiniUserAvatar';
import { useSoftToast } from '../hooks/useSoftToast';

const RTDB_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;
const toSafeRtdbKey = (value: string): string => (value ?? '').replace(RTDB_FORBIDDEN_KEY_CHARS, '_').trim();

type Lang = 'ua' | 'ru' | 'en';

type Props = {
  avatarUri?: string;
  name?: string;
  userId?: string;
  currentUserId?: string;
  language?: Lang;
  onProfile?: () => void;
  onContact?: () => void;
  contactDisabled?: boolean;
  likePath?: string;
  likeId?: string;
  liked?: boolean;
  likeCount?: number;
  likeBusy?: boolean;
  onLike?: () => void;
  avatarBackgroundColor?: string;
  avatarSize?: number;
  showAvatar?: boolean;
  showProfile?: boolean;
  showContact?: boolean;
};

const labels = {
  ua: { profile: 'Профіль', contact: "Зв'язок", saveFailed: 'Не вдалося зберегти', retry: 'Натисніть лайк ще раз, щоб повторити' },
  ru: { profile: 'Профиль', contact: 'Связь', saveFailed: 'Не удалось сохранить', retry: 'Нажмите лайк ещё раз, чтобы повторить' },
  en: { profile: 'Profile', contact: 'Contact', saveFailed: 'Could not save', retry: 'Tap like again to retry' },
} as const;

export default function UserCardActionBar({
  avatarUri,
  name,
  userId,
  currentUserId,
  language = 'ua',
  onProfile,
  onContact,
  contactDisabled,
  likePath,
  likeId,
  liked,
  likeCount,
  likeBusy,
  onLike,
  avatarBackgroundColor = '#6A8BA5',
  avatarSize = 32,
  showAvatar = true,
  showProfile = true,
  showContact = true,
}: Props) {
  const [localLikes, setLocalLikes] = useState<Record<string, true>>({});
  const [localBusy, setLocalBusy] = useState(false);
  const { showError, showInfo } = useSoftToast();
  const safeLikeId = useMemo(() => (likeId ? toSafeRtdbKey(likeId) : undefined), [likeId]);
  const canUseLocalLike = Boolean(likePath && safeLikeId && currentUserId && liked === undefined && likeCount === undefined && !onLike);
  const needsAuth = !currentUserId && !onLike;

  useEffect(() => {
    if (!likePath || !safeLikeId || liked !== undefined || likeCount !== undefined) return;
    const unsubscribe = onValue(ref(database, `${likePath}/${safeLikeId}`), (snapshot) => {
      const value = snapshot.val();
      setLocalLikes(value && typeof value === 'object' ? value : {});
    });
    return unsubscribe;
  }, [likeCount, safeLikeId, likePath, liked]);

  const resolvedLiked = liked ?? Boolean(currentUserId && localLikes[currentUserId]);
  const resolvedCount = likeCount ?? Object.keys(localLikes).length;
  const resolvedBusy = Boolean(likeBusy);
  const t = labels[language] ?? labels.ua;
  const profileDisabled = !onProfile || !userId;
  const resolvedContactDisabled = contactDisabled || !onContact;

  const handleLocalLike = async () => {
    if (!canUseLocalLike || !likePath || !safeLikeId || !currentUserId || localBusy) return;
    const previousLikes = localLikes;
    const nextLikes = { ...previousLikes };
    if (nextLikes[currentUserId]) {
      delete nextLikes[currentUserId];
    } else {
      nextLikes[currentUserId] = true;
    }

    setLocalLikes(nextLikes);
    setLocalBusy(true);
    try {
      await runTransaction(ref(database, `${likePath}/${safeLikeId}/${currentUserId}`), (current) => (current ? null : true));
    } catch {
      setLocalLikes(previousLikes);
      showError(t.saveFailed, t.retry);
    } finally {
      setLocalBusy(false);
    }
  };

  const handleLike = () => {
    if (needsAuth) {
      showInfo(
        { ua: 'Потрібна реєстрація', ru: 'Требуется регистрация', en: 'Sign in required' },
        { ua: 'Лайкати можуть лише зареєстровані користувачі', ru: 'Лайкать могут только зарегистрированные пользователи', en: 'Only registered users can like' },
      );
      return;
    }
    if (onLike) {
      onLike();
      return;
    }
    void handleLocalLike();
  };

  const likeDisabled = resolvedBusy || localBusy;

  return (
    <View style={styles.row}>
      {showAvatar ? (
        <MiniUserAvatar
          uri={avatarUri || ''}
          name={name || ''}
          size={avatarSize}
          borderRadius={avatarSize / 3}
          backgroundColor={avatarBackgroundColor}
        />
      ) : null}

      {showProfile ? (
        <TouchableOpacity style={[styles.outlined, profileDisabled && styles.disabled]} onPress={(event) => { event.stopPropagation(); onProfile?.(); }} disabled={profileDisabled} activeOpacity={0.8}>
          <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color={profileDisabled ? '#B0A090' : '#7A1E5C'} />
          <Text style={[styles.outlinedText, profileDisabled && styles.disabledText]}>{t.profile}</Text>
        </TouchableOpacity>
      ) : null}

      {showContact ? (
        <TouchableOpacity style={[styles.outlined, resolvedContactDisabled && styles.disabled]} onPress={(event) => { event.stopPropagation(); onContact?.(); }} disabled={resolvedContactDisabled} activeOpacity={0.8}>
          <MaterialCommunityIcons name="message-text-outline" size={13} color={resolvedContactDisabled ? '#B0A090' : '#7A1E5C'} />
          <Text style={[styles.outlinedText, resolvedContactDisabled && styles.disabledText]}>{t.contact}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={[styles.like, resolvedLiked && styles.likeActive, likeDisabled && styles.disabled]} onPress={(event) => { event.stopPropagation(); handleLike(); }} disabled={likeDisabled} activeOpacity={0.8}>
        {resolvedBusy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name={resolvedLiked ? 'heart' : 'heart-outline'} size={14} color="#fff" />
            <Text style={styles.likeText}>{resolvedCount}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EDE5D8',
    paddingTop: 7,
    marginTop: 7,
  },
  outlined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D4B9A8',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  outlinedText: { fontSize: 11, fontWeight: '800', color: '#7A1E5C' },
  like: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 46,
    backgroundColor: '#7A1E5C',
    marginLeft: 'auto',
  },
  likeActive: { backgroundColor: '#B13A70' },
  likeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  disabled: { opacity: 0.45 },
  disabledText: { color: '#B0A090' },
});
