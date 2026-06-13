import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { auth } from '../firebase-config';
import { useTranslation } from '../i18n/useTranslation';
import { COMMENTS_PATH, subscribeComments, submitComment } from '../services/commentService';
import type { Comment } from '../types/app';
import { pickUserAvatarUri } from '../utils/userAvatar';
import MiniUserAvatar from './MiniUserAvatar';

interface Props {
  requestId: string;
  requestAuthorUid: string;
  isRequestClosed: boolean;
  collectionPath?: string;
}

const ACCENT = '#7A1E5C';
const MAX_COMMENT_LENGTH = 500;
const MIN_COMMENT_LENGTH = 3;
const COOLDOWN_MS = 30000;

const CommentSection: React.FC<Props> = ({ requestId, requestAuthorUid, isRequestClosed, collectionPath = COMMENTS_PATH }) => {
  const { t } = useTranslation();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const firebaseUser = auth.currentUser;
  const isAuthenticated = !!firebaseUser && !firebaseUser.isAnonymous;

  const [comments, setComments] = useState<Comment[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [hasPending, setHasPending] = useState(false);

  const cooldownRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSubmitRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeComments(requestId, (updatedComments) => {
      setComments(updatedComments);
      const ownPending = updatedComments.some(
        (c) => c.uid === currentUser?.id && c.status === 'pending',
      );
      setHasPending(ownPending);
    }, collectionPath);
    return unsubscribe;
  }, [requestId, currentUser?.id, collectionPath]);

  const charCount = inputText.length;
  const isOverLimit = charCount > MAX_COMMENT_LENGTH;
  const isTooShort = inputText.length > 0 && inputText.length < MIN_COMMENT_LENGTH;
  const showCounter = charCount > 400;
  const canSend =
    !sending &&
    !cooldownActive &&
    !hasPending &&
    !isRequestClosed &&
    isAuthenticated &&
    inputText.length >= MIN_COMMENT_LENGTH &&
    !isOverLimit;

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

    return (
      <View style={styles.commentRow}>
        <MiniUserAvatar
          uri={pickUserAvatarUri({ startAvatarKey: item.avatarKey })}
          name={item.name}
          size={28}
          backgroundColor="#4B7F9E"
        />
        <View style={styles.commentBody}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentName}>{item.name}</Text>
            {isAuthor && (
              <View style={styles.authorBadge}>
                <Text style={styles.authorBadgeText}>{t.comments.authorBadge}</Text>
              </View>
            )}
            <Text style={styles.commentTime}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {isPending && isOwn ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.pendingText}>{t.comments.pendingLabel}</Text>
            </View>
          ) : (
            <Text style={styles.commentText}>{item.text}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <Text style={styles.emptyText}>{t.comments.empty}</Text>
  );

  const getInputPlaceholder = () => {
    if (isRequestClosed) return t.comments.closedForComments;
    if (!isAuthenticated) return t.comments.loginRequired;
    if (cooldownActive) return t.comments.cooldown;
    if (hasPending) return t.comments.pendingLabel;
    return t.comments.inputPlaceholder;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
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
              (!isAuthenticated || isRequestClosed || cooldownActive || hasPending) && styles.inputDisabled,
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={getInputPlaceholder()}
            placeholderTextColor="#999"
            editable={isAuthenticated && !isRequestClosed && !cooldownActive && !hasPending && !sending}
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
        <Text style={[styles.counter, isOverLimit && styles.counterError]}>
          {charCount}/{MAX_COMMENT_LENGTH}
        </Text>
      )}

      {isTooShort && (
        <Text style={styles.hint}>{t.comments.minLength}</Text>
      )}
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
    marginLeft: 'auto',
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
    color: '#999',
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
});

export default CommentSection;
