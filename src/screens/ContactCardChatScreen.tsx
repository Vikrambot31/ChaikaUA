import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniUserAvatar from '../components/MiniUserAvatar';
import UserCardActionBar from '../components/UserCardActionBar';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { selectUser } from '../redux/slices/authSlice';
import { selectIsPremium } from '../redux/slices/subscriptionSlice';
import type { RootState } from '../redux/store';
import type { Comment } from '../types/app';
import type { ContactReason } from '../services/profilePermissionService';
import { firebaseChatAPI } from '../firebase-config';
import { getProfileRequestContextLabel, getProfileRequestStatusLabel } from '../utils/profileRequestMeta';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import {
  CONTACT_CARD_AUTO_DELETE_DAYS,
  buildContactCardChatId,
  getContactCardMessageLimit,
  sendContactCardMessage,
  subscribeContactCardMessages,
} from '../services/contactCardChatService';

type Props = NativeStackScreenProps<RootStackParamList, 'ContactCardChatScreen'>;
type Lang = 'ua' | 'ru' | 'en';

const ACCENT = '#7A1E5C';

const REASON_LABELS: Record<ContactReason, Record<Lang, string>> = {
  acquaintance: { ua: 'Просто знайомство', ru: 'Просто знакомство', en: 'Just getting acquainted' },
  by_listing: { ua: 'По оголошенню / заявці', ru: 'По объявлению / заявке', en: 'About a listing / request' },
  by_services: { ua: 'По послугах', ru: 'По услугам', en: 'About services' },
  by_issue: { ua: 'По проблемі', ru: 'По проблеме', en: 'About an issue' },
};

const getReasonLabel = (reason: ContactReason | undefined, language: Lang): string | null => {
  if (!reason) return null;
  return REASON_LABELS[reason]?.[language] ?? null;
};

const META_LABELS: Record<Lang, { screen: string; reason: string }> = {
  ua: { screen: 'Екран', reason: 'Причина' },
  ru: { screen: 'Экран', reason: 'Причина' },
  en: { screen: 'Screen', reason: 'Reason' },
};

const sanitizeFirebaseKey = (key: string) => key.replace(/[.#$[\]:]/g, '_');

const formatTimeShort = (iso: string) => {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}, ${hours}:${mins}`;
};

const TEXT: Record<Lang, {
  title: string;
  topic: string;
  limit: (count: number, limit: number) => string;
  premiumHint: string;
  premiumButton: string;
  autoDelete: string;
  placeholder: string;
  empty: string;
  sendError: string;
  limitError: string;
  longError: string;
  sourceUnavailable: string;
  sourceError: string;
}> = {
  ua: {
    title: '\u0427\u0430\u0442 \u043f\u043e \u043a\u0430\u0440\u0442\u0446\u0456',
    topic: '\u0422\u0435\u043c\u0430',
    limit: (count, limit) => `\u041f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u044c: ${count} / ${limit}`,
    premiumHint: '\u0412\u0456\u0434\u043a\u0440\u0438\u0439\u0442\u0435 \u0434\u043e 500 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u044c \u043f\u043e \u043a\u043e\u0436\u043d\u0456\u0439 \u043a\u0430\u0440\u0442\u0446\u0456 \u0437 \u0430\u0432\u0442\u043e\u0432\u0438\u0434\u0430\u043b\u0435\u043d\u043d\u044f\u043c \u0437\u0430 39 \u0433\u0440\u043d/\u043c\u0456\u0441.',
    premiumButton: '\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 500',
    autoDelete: `\u0410\u0432\u0442\u043e\u0432\u0438\u0434\u0430\u043b\u0435\u043d\u043d\u044f: ${CONTACT_CARD_AUTO_DELETE_DAYS} \u0434\u043d\u0456\u0432`,
    placeholder: '\u041d\u0430\u043f\u0438\u0448\u0456\u0442\u044c \u0443\u0442\u043e\u0447\u043d\u0435\u043d\u043d\u044f...',
    empty: '\u041f\u043e\u043a\u0438 \u043d\u0435\u043c\u0430\u0454 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u044c',
    sendError: '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043d\u0430\u0434\u0456\u0441\u043b\u0430\u0442\u0438 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u043d\u044f.',
    limitError: '\u041b\u0456\u043c\u0456\u0442 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u044c \u0432\u0438\u0447\u0435\u0440\u043f\u0430\u043d\u043e.',
    longError: '\u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 500 \u0441\u0438\u043c\u0432\u043e\u043b\u0456\u0432.',
    sourceUnavailable: '\u0426\u044f \u0437\u0430\u044f\u0432\u043a\u0430 \u0431\u0456\u043b\u044c\u0448\u0435 \u043d\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0443 \u043f\u0443\u0431\u043b\u0456\u0447\u043d\u0456\u0439 \u0441\u0442\u0440\u0456\u0447\u0446\u0456.',
    sourceError: '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0432\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0443.',
  },
  ru: {
    title: '\u0427\u0430\u0442 \u043f\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435',
    topic: '\u0422\u0435\u043c\u0430',
    limit: (count, limit) => `\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439: ${count} / ${limit}`,
    premiumHint: '\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0434\u043e 500 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u043f\u043e \u043a\u0430\u0436\u0434\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u0441 \u0430\u0432\u0442\u043e\u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435\u043c \u0437\u0430 39 \u0433\u0440\u043d/\u043c\u0435\u0441.',
    premiumButton: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c 500',
    autoDelete: `\u0410\u0432\u0442\u043e\u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435: ${CONTACT_CARD_AUTO_DELETE_DAYS} \u0434\u043d\u0435\u0439`,
    placeholder: '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0443\u0442\u043e\u0447\u043d\u0435\u043d\u0438\u0435...',
    empty: '\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439',
    sendError: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435.',
    limitError: '\u041b\u0438\u043c\u0438\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u0438\u0441\u0447\u0435\u0440\u043f\u0430\u043d.',
    longError: '\u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 500 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.',
    sourceUnavailable: '\u042d\u0442\u0430 \u0437\u0430\u044f\u0432\u043a\u0430 \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0432 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u043e\u0439 \u043b\u0435\u043d\u0442\u0435.',
    sourceError: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443.',
  },
  en: {
    title: 'Card chat',
    topic: 'Topic',
    limit: (count, limit) => `Messages: ${count} / ${limit}`,
    premiumHint: 'Unlock up to 500 messages per card with auto-delete for 39 UAH/month.',
    premiumButton: 'Unlock 500',
    autoDelete: `Auto-delete: ${CONTACT_CARD_AUTO_DELETE_DAYS} days`,
    placeholder: 'Write a clarification...',
    empty: 'No messages yet',
    sendError: 'Failed to send the message.',
    limitError: 'Message limit reached.',
    longError: 'Maximum 500 characters.',
    sourceUnavailable: 'This request is no longer available in the public feed.',
    sourceError: 'Failed to open the request.',
  },
};

const formatMessageTime = (value: number) => {
  if (!value) return '';
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function ContactCardChatScreen({ navigation, route }: Props) {
  const currentUser = useSelector(selectUser);
  const isPremium = useSelector(selectIsPremium);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const t = TEXT[language];
  const [messages, setMessages] = useState<Comment[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingSource, setOpeningSource] = useState(false);
  const listRef = useRef<FlatList<Comment>>(null);

  const { request } = route.params;
  const targetUserId = request.targetUserId;
  const requesterId = request.requesterId;
  const chatId = useMemo(
    () => buildContactCardChatId(targetUserId, requesterId, request.sourceId),
    [request.sourceId, requesterId, targetUserId],
  );
  const limit = getContactCardMessageLimit(isPremium);
  const isLimitReached = messageCount >= limit;
  const otherName = currentUser?.id === requesterId ? request.targetName : request.requesterName;
  const topic = request.sourceTitle || request.context;
  const canOpenSourceRequest = Boolean(request.sourceId && (request.sourceType === 'help' || request.context === 'help'));

  // Card data — same as feed card
  const isIncoming = currentUser?.id === targetUserId;
  const cardPhoto = isIncoming ? request.requesterPhotoURL : (request.targetPhotoURL || '');
  const cardName = isIncoming ? request.requesterName : (request.targetName?.trim() || 'Unknown');
  const cardUserId = isIncoming ? request.requesterId : (request.targetUserId ?? '');
  const reasonLabel = getReasonLabel(request.reason as ContactReason | undefined, language);
  const contextLabel = getProfileRequestContextLabel(request.context, language);
  const sourceTitleText = request.sourceTitle?.trim();
  const descText = sourceTitleText || reasonLabel || contextLabel || null;
  const sourceMetaText = contextLabel ? `${META_LABELS[language].screen}: ${contextLabel}` : null;
  const reasonMetaText = reasonLabel && reasonLabel !== descText ? `${META_LABELS[language].reason}: ${reasonLabel}` : null;
  const statusLabel = getProfileRequestStatusLabel(request.status, language);
  const statusIcon = request.status === 'approved' ? 'check-circle' : request.status === 'denied' ? 'close-circle-outline' : 'clock-outline';
  const statusIconColor = request.status === 'approved' ? '#2D7A46' : request.status === 'denied' ? '#A73737' : '#8A6D2A';
  const cardPhone = isIncoming ? request.requesterPhone : request.sharedContact;
  const hasContact = request.status === 'approved' && !!cardPhone;
  const callLabel = language === 'en' ? 'Call' : language === 'ru' ? 'Позвонить' : 'Подзвонити';

  const handleCallContact = useCallback(() => {
    if (!cardPhone) return;
    Alert.alert(
      language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатися",
      cardPhone,
      [
        { text: callLabel, onPress: () => void safeCallPhone(cardPhone, language) },
        { text: 'Viber', onPress: () => void safeOpenViber(cardPhone, language) },
        { text: language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати', style: 'cancel' },
      ],
    );
  }, [cardPhone, language, callLabel]);

  useEffect(() => {
    setLoading(true);
    return subscribeContactCardMessages(chatId, currentUser?.id || '', (nextMessages, totalCount) => {
      setMessages(nextMessages);
      setMessageCount(totalCount);
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
  }, [chatId, currentUser?.id]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      Alert.alert(t.longError);
      return;
    }
    if (isLimitReached) {
      Alert.alert(t.limitError);
      return;
    }

    setSending(true);
    try {
      await sendContactCardMessage(
        chatId,
        trimmed,
        currentUser?.name || (language === 'en' ? 'User' : '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c'),
        isPremium,
        currentUser?.startAvatarKey,
      );
      setDraft('');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      Alert.alert(code === 'message_limit_reached' ? t.limitError : t.sendError);
    } finally {
      setSending(false);
    }
  }, [chatId, currentUser?.name, currentUser?.startAvatarKey, draft, isLimitReached, isPremium, language, sending, t.limitError, t.longError, t.sendError]);

  const handleOpenSourceRequest = useCallback(async () => {
    if (!canOpenSourceRequest || !request.sourceId || openingSource) return;
    setOpeningSource(true);
    try {
      const result = await firebaseChatAPI.getRequestById(request.sourceId);
      if (!result.success || !result.data) {
        Alert.alert(t.sourceUnavailable);
        return;
      }
      const sourceRequest = result.data;
      const isPublic = sourceRequest.isApproved || sourceRequest.status === 'approved' || sourceRequest.status === 'closed';
      if (!isPublic) {
        Alert.alert(t.sourceUnavailable);
        return;
      }
      navigation.navigate('RequestDetail', { request: sourceRequest });
    } catch {
      Alert.alert(t.sourceError);
    } finally {
      setOpeningSource(false);
    }
  }, [canOpenSourceRequest, navigation, openingSource, request.sourceId, t.sourceError, t.sourceUnavailable]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>{t.title}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{otherName || request.requesterName}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('SubscriptionScreen')} style={styles.premiumIcon} activeOpacity={0.85}>
            <MaterialCommunityIcons name="crown-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* User card — same as feed card */}
        <View style={styles.card}>
          <View style={styles.cardIncoming}>
            {cardPhoto ? (
              <AppPhotoImage uri={cardPhoto} style={styles.avatarMedium} resizeMode="cover" debugLabel={`ContactCardChat:${cardUserId}`} />
            ) : (
              <MiniUserAvatar name={cardName} size={56} borderRadius={14} backgroundColor="#6A8BA5" />
            )}
            <View style={styles.incomingRight}>
              <View style={styles.incomingNameRow}>
                <Text style={styles.incomingName} numberOfLines={1}>{cardName}</Text>
                <View style={styles.incomingDateBadge}>
                  <Text style={styles.incomingDateText}>{formatTimeShort(request.requestedAt)}</Text>
                </View>
              </View>
              {descText ? (
                <View style={styles.descriptionBox}>
                  <Text style={styles.descriptionText} numberOfLines={2}>{descText}</Text>
                </View>
              ) : null}
              {(sourceMetaText || reasonMetaText) ? (
                <View style={styles.contextMetaWrap}>
                  {sourceMetaText ? (
                    <View style={styles.contextMetaPill}>
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={12} color="#6F4D5F" />
                      <Text style={styles.contextMetaText} numberOfLines={1}>{sourceMetaText}</Text>
                    </View>
                  ) : null}
                  {reasonMetaText ? (
                    <View style={styles.contextMetaPill}>
                      <MaterialCommunityIcons name="message-question-outline" size={12} color="#6F4D5F" />
                      <Text style={styles.contextMetaText} numberOfLines={1}>{reasonMetaText}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={[
            styles.responseStatusBox,
            request.status === 'approved'
              ? styles.responseStatusApproved
              : request.status === 'denied'
                ? styles.responseStatusDenied
                : styles.responseStatusPending,
          ]}>
            <View style={styles.responseStatusTitleRow}>
              <MaterialCommunityIcons name={statusIcon} size={18} color={statusIconColor} />
              <Text style={[
                styles.responseStatusTitle,
                request.status === 'denied' && styles.responseStatusDeniedTitle,
                request.status === 'pending' && styles.responseStatusPendingTitle,
              ]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <UserCardActionBar
            avatarUri={cardPhoto}
            name={cardName}
            userId={cardUserId}
            currentUserId={currentUser?.id}
            language={language}
            onProfile={cardUserId ? () => navigation.navigate('ViewUserProfile', { userId: cardUserId }) : undefined}
            onContact={hasContact ? handleCallContact : undefined}
            contactDisabled={!hasContact}
            likePath="feed_likes/profile_requests"
            likeId={`${cardUserId}_${sanitizeFirebaseKey(request.requestedAt)}`}
          />
        </View>

        <View style={styles.topicBox}>
          <TouchableOpacity
            onPress={() => { void handleOpenSourceRequest(); }}
            disabled={!canOpenSourceRequest || openingSource}
            style={styles.topicHeaderPressable}
            activeOpacity={0.82}
          >
            <View style={styles.topicTitleRow}>
              <Text style={styles.topicLabel}>{t.topic}</Text>
              {canOpenSourceRequest ? (
                openingSource ? (
                  <ActivityIndicator size="small" color={ACCENT} />
                ) : (
                  <MaterialCommunityIcons name="open-in-new" size={16} color={ACCENT} />
                )
              ) : null}
            </View>
            <Text style={[styles.topicText, canOpenSourceRequest && styles.topicTextLink]} numberOfLines={2}>{topic}</Text>
          </TouchableOpacity>
          <View style={styles.limitRow}>
            <Text style={[styles.limitText, isLimitReached && styles.limitTextDanger]}>{t.limit(messageCount, limit)}</Text>
            {isPremium ? <Text style={styles.autoDeleteText}>{t.autoDelete}</Text> : null}
          </View>
          {!isPremium ? (
            <TouchableOpacity style={styles.premiumBox} onPress={() => navigation.navigate('SubscriptionScreen')} activeOpacity={0.85}>
              <Text style={styles.premiumText}>{t.premiumHint}</Text>
              <View style={styles.premiumButton}>
                <Text style={styles.premiumButtonText}>{t.premiumButton}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ACCENT} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messagesList, messages.length === 0 && styles.messagesListEmpty]}
            ListEmptyComponent={<Text style={styles.emptyText}>{t.empty}</Text>}
            renderItem={({ item }) => {
              const isOwn = item.uid === currentUser?.id;
              return (
                <View style={[styles.messageBubble, isOwn ? styles.messageOwn : styles.messageOther]}>
                  <Text style={[styles.messageName, isOwn && styles.messageOwnName]}>{item.name}</Text>
                  <Text style={[styles.messageText, isOwn && styles.messageOwnText]}>{item.text}</Text>
                  <Text style={[styles.messageTime, isOwn && styles.messageOwnTime]}>{formatMessageTime(item.createdAt)}</Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={isLimitReached ? t.limitError : t.placeholder}
            placeholderTextColor="#A09080"
            style={[styles.input, isLimitReached && styles.inputDisabled]}
            multiline
            maxLength={500}
            editable={!isLimitReached && !sending}
          />
          <TouchableOpacity
            onPress={() => { void handleSend(); }}
            disabled={isLimitReached || sending || draft.trim().length === 0}
            style={[styles.sendButton, (isLimitReached || sending || draft.trim().length === 0) && styles.sendButtonDisabled]}
            activeOpacity={0.85}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  keyboard: { flex: 1 },
  header: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTextBox: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  headerSubtitle: { color: '#F4DCEB', fontSize: 12, fontWeight: '700', marginTop: 2 },
  premiumIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topicBox: {
    margin: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#E8D8C6',
  },
  topicHeaderPressable: {
    borderRadius: 8,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  topicLabel: { color: '#8A756A', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  topicText: { color: '#392D2D', fontSize: 15, fontWeight: '900' },
  topicTextLink: { color: ACCENT },
  limitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  limitText: { color: '#2F6F4E', fontSize: 13, fontWeight: '900' },
  limitTextDanger: { color: '#A73737' },
  autoDeleteText: { color: '#6F5D54', fontSize: 12, fontWeight: '800' },
  premiumBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#F4E7F0',
    borderWidth: 1,
    borderColor: '#D9B6CD',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumText: { flex: 1, color: '#5A2147', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  premiumButton: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  premiumButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  // Card — feed card replica
  card: {
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    padding: 8,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  cardIncoming: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  avatarMedium: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  incomingRight: {
    flex: 1,
    gap: 5,
  },
  incomingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  incomingName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D2520',
    flexShrink: 1,
  },
  incomingDateBadge: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
  },
  incomingDateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3D5D87',
  },
  descriptionBox: {
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: ACCENT,
    minHeight: 42,
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 19,
    fontWeight: '900',
  },
  contextMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contextMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: '#F1E5EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  contextMetaText: {
    flexShrink: 1,
    color: '#6F4D5F',
    fontSize: 11,
    fontWeight: '800',
  },
  responseStatusBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    marginBottom: 7,
  },
  responseStatusApproved: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A8D5B5',
  },
  responseStatusDenied: {
    backgroundColor: '#FFF1EF',
    borderColor: '#E7B6AE',
  },
  responseStatusPending: {
    backgroundColor: '#FFF7E3',
    borderColor: '#E6C982',
  },
  responseStatusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responseStatusTitle: {
    color: '#2D7A46',
    fontSize: 13,
    fontWeight: '900',
  },
  responseStatusDeniedTitle: {
    color: '#A73737',
  },
  responseStatusPendingTitle: {
    color: '#8A6D2A',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesList: { paddingHorizontal: 12, paddingBottom: 14 },
  messagesListEmpty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#8A756A', fontSize: 14, fontWeight: '800' },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 9,
    borderWidth: 1,
  },
  messageOwn: { alignSelf: 'flex-end', backgroundColor: ACCENT, borderColor: ACCENT },
  messageOther: { alignSelf: 'flex-start', backgroundColor: '#FFFDF9', borderColor: '#E7D8C6' },
  messageName: { color: '#7A6258', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  messageOwnName: { color: '#F8DDEF' },
  messageText: { color: '#2F2929', fontSize: 15, lineHeight: 20 },
  messageOwnText: { color: '#fff' },
  messageTime: { color: '#9B897E', fontSize: 10, fontWeight: '700', alignSelf: 'flex-end', marginTop: 4 },
  messageOwnTime: { color: '#F1CDE3' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E7D8C6',
    backgroundColor: '#F7F3EE',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCCAB9',
    backgroundColor: '#FFFDF9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2F2929',
    fontSize: 15,
  },
  inputDisabled: { backgroundColor: '#EFE8DF' },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  sendButtonDisabled: { backgroundColor: '#C8B9C3' },
});
