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
import type { RootStackParamList } from '../navigation/RootNavigator';
import { selectUser } from '../redux/slices/authSlice';
import { selectIsPremium } from '../redux/slices/subscriptionSlice';
import type { RootState } from '../redux/store';
import type { Comment } from '../types/app';
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

        <View style={styles.topicBox}>
          <Text style={styles.topicLabel}>{t.topic}</Text>
          <Text style={styles.topicText} numberOfLines={2}>{topic}</Text>
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
  topicLabel: { color: '#8A756A', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  topicText: { color: '#392D2D', fontSize: 15, fontWeight: '900' },
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
