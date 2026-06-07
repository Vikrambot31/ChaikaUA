import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { onValue, ref, runTransaction } from 'firebase/database';
import { database } from '../firebase-config';
import MiniUserAvatar from './MiniUserAvatar';
import { useSoftToast } from '../hooks/useSoftToast';
import { resolveUserAvatarMap } from '../utils/userAvatar';

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
  showLikeAvatars?: boolean;
  contactLabel?: string;
  shareMessage?: string;
  isFav?: boolean;
  onToggleFavorite?: () => void;
};

const labels = {
  ua: { profile: 'Профіль', contact: "Зв'язок", saveFailed: 'Не вдалося зберегти', retry: 'Натисніть лайк ще раз, щоб повторити' },
  ru: { profile: 'Профиль', contact: 'Связь', saveFailed: 'Не удалось сохранить', retry: 'Нажмите лайк ещё раз, чтобы повторить' },
  en: { profile: 'Profile', contact: 'Contact', saveFailed: 'Could not save', retry: 'Tap like again to retry' },
} as const;

const authRequiredTitle = {
  ua: '\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044f',
  ru: '\u041d\u0443\u0436\u043d\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f',
  en: 'Registration required',
} as const;

const authRequiredBody = {
  ua: '\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044c, \u0449\u043e\u0431 \u0432\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u043f\u0440\u043e\u0444\u0456\u043b\u044c \u0430\u0431\u043e \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0438.',
  ru: '\u0412\u043e\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438\u043b\u0438 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b.',
  en: 'Sign in to open profiles or contacts.',
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
  showLikeAvatars = false,
  contactLabel,
  shareMessage,
  isFav,
  onToggleFavorite,
}: Props) {
  const [localLikes, setLocalLikes] = useState<Record<string, true>>({});
  const [likeAvatarByUserId, setLikeAvatarByUserId] = useState<Record<string, string>>({});
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
  const likeAvatarUserIds = useMemo(() => {
    if (!showLikeAvatars) return [];
    return Object.keys(localLikes).filter(Boolean).slice(0, 3);
  }, [localLikes, showLikeAvatars]);
  const resolvedBusy = Boolean(likeBusy);
  const t = labels[language] ?? labels.ua;
  const profileDisabled = !onProfile || !userId;
  const resolvedContactDisabled = contactDisabled || !onContact;
  const requireRegisteredUser = () => {
    if (currentUserId) return true;
    showInfo(authRequiredTitle, authRequiredBody);
    return false;
  };

  useEffect(() => {
    if (!showLikeAvatars || likeAvatarUserIds.length === 0) {
      setLikeAvatarByUserId({});
      return;
    }

    let active = true;
    void resolveUserAvatarMap(database, likeAvatarUserIds).then((resolved) => {
      if (active) setLikeAvatarByUserId(resolved);
    }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, [likeAvatarUserIds, showLikeAvatars]);

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
        <TouchableOpacity style={[styles.outlined, profileDisabled && styles.disabled]} onPress={(event) => { event.stopPropagation(); if (requireRegisteredUser()) onProfile?.(); }} disabled={profileDisabled} activeOpacity={0.8}>
          <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color={profileDisabled ? '#B0A090' : '#7A1E5C'} />
          <Text style={[styles.outlinedText, profileDisabled && styles.disabledText]}>{t.profile}</Text>
        </TouchableOpacity>
      ) : null}

      {showContact ? (
        <TouchableOpacity style={[styles.outlined, resolvedContactDisabled && styles.disabled]} onPress={(event) => { event.stopPropagation(); if (requireRegisteredUser()) onContact?.(); }} disabled={resolvedContactDisabled} activeOpacity={0.8}>
          <MaterialCommunityIcons name="message-text-outline" size={13} color={resolvedContactDisabled ? '#B0A090' : '#7A1E5C'} />
          <Text style={[styles.outlinedText, resolvedContactDisabled && styles.disabledText]}>{contactLabel ?? t.contact}</Text>
        </TouchableOpacity>
      ) : null}

      {shareMessage != null ? (
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(event) => { event.stopPropagation(); void Share.share({ message: shareMessage }); }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="share-variant-outline" size={18} color="#9E8E80" />
        </TouchableOpacity>
      ) : null}

      {onToggleFavorite != null ? (
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(event) => { event.stopPropagation(); onToggleFavorite(); }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={isFav ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={isFav ? '#C0533E' : '#9E8E80'}
          />
        </TouchableOpacity>
      ) : null}

      <View style={styles.likeCluster}>
        {showLikeAvatars && likeAvatarUserIds.length > 0 ? (
          <View style={styles.likeAvatarStack} pointerEvents="none">
            {likeAvatarUserIds.map((likeUserId, index) => (
              <View
                key={likeUserId}
                style={[
                  styles.likeAvatarWrap,
                  index > 0 && styles.likeAvatarOverlap,
                  { zIndex: likeAvatarUserIds.length - index },
                ]}
              >
                <MiniUserAvatar
                  uri={likeAvatarByUserId[likeUserId] || ''}
                  name=""
                  size={22}
                  borderRadius={11}
                  backgroundColor="#6A8BA5"
                />
              </View>
            ))}
          </View>
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
  },
  likeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  likeAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    marginRight: 5,
  },
  likeAvatarWrap: {
    width: 22,
    height: 22,
  },
  likeAvatarOverlap: {
    marginLeft: -8,
  },
  likeActive: { backgroundColor: '#B13A70' },
  likeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  disabled: { opacity: 0.45 },
  disabledText: { color: '#B0A090' },
});
