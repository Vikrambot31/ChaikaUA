import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { auth } from '../firebase-config';
import { database } from '../firebase-core';
import { useTranslation } from '../i18n/useTranslation';
import { COMMENTS_PATH, subscribeComments, submitComment } from '../services/commentService';
import type { Comment } from '../types/app';
import { pickUserAvatarUri, resolveUserAvatarMap } from '../utils/userAvatar';
import MiniUserAvatar from './MiniUserAvatar';
import ContactReasonModal from './ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';
import { useAppTheme } from '../hooks/useAppTheme';

interface Props {
  requestId: string;
  requestAuthorUid: string;
  isRequestClosed: boolean;
  collectionPath?: string;
  contactSourceType?: string;
}

const ACCENT = '#7A1E5C';
const MAX_COMMENT_LENGTH = 250;
const MIN_COMMENT_LENGTH = 3;
const COMMENT_COUNTER_THRESHOLD = 200;
const COOLDOWN_MS = 30000;
const MAX_USER_COMMENTS_WHEN_OTHERS_EXIST = 2;

const CommentSection: React.FC<Props> = ({ requestId, requestAuthorUid, isRequestClosed, collectionPath = COMMENTS_PATH, contactSourceType = 'help' }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const firebaseUser = auth.currentUser;
  const isAuthenticated = !!firebaseUser && !firebaseUser.isAnonymous;

  const [comments, setComments] = useState<Comment[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [limitReached, setLimitReached] = useState(false);
  const { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest } = useContactRequest();

  const commentUids = useMemo(
    () => [...new Set(comments.map((c) => c.uid))].sort().join(','),
    [comments],
  );

  useEffect(() => {
    if (!commentUids) return;
    resolveUserAvatarMap(database, commentUids.split(',')).then(setAvatarMap);
  }, [commentUids]);

  const cooldownRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSubmitRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeComments(requestId, (updatedComments) => {
      setComments(updatedComments);
      const ownPending = updatedComments.some(
        (c) => c.uid === currentUser?.id && c.status === 'pending',
      );
      setHasPending(ownPending);

      const visibleComments = updatedComments.filter((c) => c.status !== 'pending');
      let ownConsecutiveComments = 0;
      for (let i = visibleComments.length - 1; i >= 0; i -= 1) {
        if (visibleComments[i].uid !== currentUser?.id) break;
        ownConsecutiveComments += 1;
      }
      setLimitReached(ownConsecutiveComments >= MAX_USER_COMMENTS_WHEN_OTHERS_EXIST);
    }, collectionPath);
    return unsubscribe;
  }, [requestId, currentUser?.id, collectionPath]);

  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_COMMENT_LENGTH;
  const isTooShort = inputText.length > 0 && inputText.length < MIN_COMMENT_LENGTH;
  const showCounter = charCount > COMMENT_COUNTER_THRESHOLD;
  const canSend =
    !sending &&
    !cooldownActive &&
    !hasPending &&
    !isRequestClosed &&
    isAuthenticated &&
    inputText.length >= MIN_COMMENT_LENGTH &&
    !isOverLimit &&
    !limitReached;

  const handleSend = async () => {
    if (!canSend || !currentUser?.id) return;

    const now = Date.now();
    if (now - lastSubmitRef.current < COOLDOWN_MS) {
      setCooldownActive(true);
      setTimeout(() => setCooldownActive(false), COOLDOWN_MS - (now - lastSubmitRef.current));
      return;
    }

    setSending(true);
    try {
      await submitComment(
        requestId,
        inputText.trim(),
        currentUser.name || 'Unknown',
        currentUser.startAvatarKey,
        collectionPath,
      );
      setInputText('');
      lastSubmitRef.current = Date.now();

      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      setCooldownActive(true);
      cooldownRef.current = setTimeout(() => {
        setCooldownActive(false);
      }, COOLDOWN_MS);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);

  const renderComment = ({ item }: { item: Comment }) => {
    const isAuthor = item.uid === requestAuthorUid;
    const isOwn = item.uid === currentUser?.id;
    const isPending = item.status === 'pending';
    const avatarUri = isOwn ? pickUserAvatarUri(currentUser) : (avatarMap[item.uid] || '');

    const handleContact = () => {
      if (isOwn || !item.uid) return;
      openModal({
        userId: item.uid,
        name: item.name,
        photoURL: avatarUri || undefined,
        sourceType: contactSourceType as any,
        sourceId: requestId,
        sourceTitle: item.text.slice(0, 60),
      });
    };

    return (
      <View style={styles.commentRow}>
        {isOwn ? (
          <MiniUserAvatar uri={avatarUri} name={item.name} size={52} backgroundColor="#4B7F9E" />
        ) : (
          <TouchableOpacity onPress={handleContact} activeOpacity={0.7}>
            <MiniUserAvatar uri={avatarUri} name={item.name} size={52} backgroundColor="#4B7F9E" />
          </TouchableOpacity>
        )}
        <View style={[styles.commentBody, { backgroundColor: colors.cardBg, borderColor: colors.uiBorder }]}>
          <View style={styles.commentHeader}>
            <Text style={[styles.commentName, { color: colors.textPrimary }]}>{item.name}</Text>
            {isAuthor && (
              <View style={styles.authorBadge}>
                <Text style={styles.authorBadgeText}>{t.comments.authorBadge}</Text>
              </View>
            )}
            <Text style={[styles.commentTime, { color: colors.textMuted }]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {!isOwn && (
              <TouchableOpacity onPress={handleContact} style={styles.replyBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="reply-outline" size={16} color={colors.accentText} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.commentText, { color: colors.textPrimary }]}>{item.text}</Text>
          {isPending && isOwn && (
            <View style={styles.pendingRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={colors.accentText} />
              <Text style={[styles.pendingText, { color: colors.textMuted }]}>{t.comments.pendingPublish}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.comments.empty}</Text>
  );

  const getInputPlaceholder = () => {
    if (isRequestClosed) return t.comments.closedForComments;
    if (!isAuthenticated) return t.comments.loginRequired;
    if (cooldownActive) return t.comments.cooldown;
    if (hasPending) return t.comments.pendingLabel;
    if (limitReached) return t.comments.limitReached;
    return t.comments.inputPlaceholder;
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.uiBorder }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t.comments.title} ({comments.length})
      </Text>

      <FlatList
        data={comments}
        renderItem={renderComment}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        scrollEnabled={false}
      />

      {!isRequestClosed && (
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.uiBorder,
                color: isDark ? '#2B1A24' : colors.textPrimary,
              },
              (!isAuthenticated || isRequestClosed || cooldownActive || hasPending || limitReached) && styles.inputDisabled,
              (!isAuthenticated || isRequestClosed || cooldownActive || hasPending || limitReached) && {
                backgroundColor: colors.inputDisabledBg,
                color: colors.textMuted,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={getInputPlaceholder()}
            placeholderTextColor={colors.placeholder}
            editable={isAuthenticated && !isRequestClosed && !cooldownActive && !hasPending && !limitReached && !sending}
            multiline
            maxLength={MAX_COMMENT_LENGTH}
          />
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>{t.comments.send}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {showCounter && (
        <Text style={[styles.counter, { color: colors.textMuted }, isOverLimit && styles.counterError]}>
          {charCount}/{MAX_COMMENT_LENGTH}
        </Text>
      )}

      {isTooShort && (
        <Text style={styles.hint}>{t.comments.minLength}</Text>
      )}

      {limitReached && (
        <Text style={styles.limitHint}>{t.comments.limitReached}</Text>
      )}

      <ContactReasonModal
        visible={modalVisible}
        pending={pending}
        target={currentTarget}
        onSelect={sendRequest}
        onClose={closeModal}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  commentBody: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  commentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  authorBadge: {
    backgroundColor: ACCENT,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  authorBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  commentTime: {
    fontSize: 11,
    color: '#999',
  },
  replyBtn: {
    marginLeft: 4,
    padding: 2,
  },
  commentText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 18,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    paddingVertical: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    backgroundColor: '#FFF',
  },
  inputDisabled: {
    backgroundColor: '#F0F0F0',
  },
  sendButton: {
    backgroundColor: ACCENT,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  counter: {
    textAlign: 'right',
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  counterError: {
    color: '#D32F2F',
  },
  hint: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 2,
  },
  limitHint: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 2,
    fontStyle: 'italic',
  },
});

export default CommentSection;
