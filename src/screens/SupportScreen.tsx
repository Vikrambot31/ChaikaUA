import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { selectUser } from '../redux/selectors';
import { selectIsOnline } from '../redux/slices/networkSlice';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import { SUPPORT_CATEGORIES, MAX_MESSAGE_LENGTH } from '../constants/supportCategories';
import {
  subscribeToUserTicket,
  subscribeToTicketMessages,
  createTicket,
  sendUserMessage,
  markTicketReadByUser,
  hasUnreadAdminReply,
} from '../services/supportService';
import type { SupportTicket, SupportMessage, SupportCategory } from '../types/support';
import { ensureFirebaseAuth } from '../firebase-auth-session';

const UI_TEXT = {
  ua: {
    title: 'Служба Підтримки',
    selectCategory: 'Виберіть тему',
    inputPlaceholder: 'Опишіть ваше питання (до 500 символів)',
    send: 'Відправити',
    chars: 'Символів',
    statusOpen: 'Відкрито',
    statusClosed: 'Закрито',
    ticketClosed: 'Звернення закрито. Ви можете створити нове.',
    newTicket: 'Нове звернення',
    accountNotice: 'Щоб писати в службу підтримки, спочатку потрібно отримати статус користувача з акаунтом. Для цього пройдіть реєстрацію.',
    noConnection: "Немає з'єднання з Інтернетом",
    sendError: 'Не вдалося відправити повідомлення',
    you: 'Ви',
    support: 'Підтримка',
  },
  ru: {
    title: 'Служба Поддержки',
    selectCategory: 'Выберите тему',
    inputPlaceholder: 'Опишите ваш вопрос (до 500 символов)',
    send: 'Отправить',
    chars: 'Символов',
    statusOpen: 'Открыто',
    statusClosed: 'Закрыто',
    ticketClosed: 'Обращение закрыто. Вы можете создать новое.',
    newTicket: 'Новое обращение',
    accountNotice: 'Чтобы писать в службу поддержки, сначала нужно получить статус пользователя с аккаунтом. Для этого пройдите регистрацию.',
    noConnection: 'Нет подключения к Интернету',
    sendError: 'Не удалось отправить сообщение',
    you: 'Вы',
    support: 'Поддержка',
  },
  en: {
    title: 'Support',
    selectCategory: 'Select a topic',
    inputPlaceholder: 'Describe your question (up to 500 characters)',
    send: 'Send',
    chars: 'Characters',
    statusOpen: 'Open',
    statusClosed: 'Closed',
    ticketClosed: 'This ticket is closed. You can create a new one.',
    newTicket: 'New ticket',
    accountNotice: 'To write to support, you first need user-with-account status. Please complete registration.',
    noConnection: 'No internet connection',
    sendError: 'Failed to send message',
    you: 'You',
    support: 'Support',
  },
} as const;

const CATEGORY_LABELS: Record<string, Record<SupportCategory, string>> = {
  ua: {
    registration: 'Реєстрація та вхід', profile: 'Редагування профілю', photo: 'Завантаження фото',
    verification: 'Верифікація акаунту', guarantor: 'Система поручительства', requests: 'Створення оголошень',
    moderation: 'Модерація контенту', chat: 'Онлайн чат', notifications: 'Сповіщення (push)',
    payment: 'Оплата та бонуси', dating: 'Знайомства', business: 'Бізнес-каталог',
    osbb: 'ОСББ та будинок', map: 'Карта та геолокація', privacy: 'Приватність та безпека',
    bug_report: 'Помилка в додатку', feature_request: 'Пропозиція нової функції',
    account_delete: 'Видалення акаунту', language: 'Мова інтерфейсу', other: 'Інше питання',
  },
  ru: {
    registration: 'Регистрация и вход', profile: 'Редактирование профиля', photo: 'Загрузка фото',
    verification: 'Верификация аккаунта', guarantor: 'Система поручительства', requests: 'Создание объявлений',
    moderation: 'Модерация контента', chat: 'Онлайн чат', notifications: 'Уведомления (push)',
    payment: 'Оплата и бонусы', dating: 'Знакомства', business: 'Бизнес-каталог',
    osbb: 'ОСМД и дом', map: 'Карта и геолокация', privacy: 'Приватность и безопасность',
    bug_report: 'Ошибка в приложении', feature_request: 'Предложение новой функции',
    account_delete: 'Удаление аккаунта', language: 'Язык интерфейса', other: 'Другой вопрос',
  },
  en: {
    registration: 'Registration & login', profile: 'Profile editing', photo: 'Photo upload',
    verification: 'Account verification', guarantor: 'Guarantor system', requests: 'Creating announcements',
    moderation: 'Content moderation', chat: 'Online chat', notifications: 'Push notifications',
    payment: 'Payment & bonuses', dating: 'Dating', business: 'Business catalog',
    osbb: 'HOA & building', map: 'Map & geolocation', privacy: 'Privacy & security',
    bug_report: 'App bug report', feature_request: 'Feature request',
    account_delete: 'Account deletion', language: 'Interface language', other: 'Other question',
  },
};

type Props = { navigation: { goBack: () => void } };

const SupportScreen: React.FC<Props> = ({ navigation }) => {
  const user = useSelector(selectUser);
  const isOnline = useSelector(selectIsOnline);
  const { language } = useTranslation();
  const text = UI_TEXT[language] || UI_TEXT.ua;
  const catLabels = CATEGORY_LABELS[language] || CATEGORY_LABELS.ua;

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void ensureFirebaseAuth()
      .then((firebaseUser) => {
        if (active) {
          setSupportUserId(firebaseUser?.uid ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setSupportUserId(null);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  // Subscribe to user's ticket
  useEffect(() => {
    if (!supportUserId) {
      setLoading(false);
      return;
    }
    let settled = false;
    const unsub = subscribeToUserTicket(supportUserId, (t) => {
      settled = true;
      setTicket(t);
      if (t) setSelectedCategory(t.category);
      setLoading(false);
    });
    // Safety timeout: if callback never fires (permission error), stop spinner
    const timeout = setTimeout(() => {
      if (!settled) setLoading(false);
    }, 8000);
    return () => { unsub(); clearTimeout(timeout); };
  }, [supportUserId]);

  // Subscribe to messages
  useEffect(() => {
    if (!ticket?.ticketId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToTicketMessages(ticket.ticketId, (msgs) => {
      setMessages(msgs);
    });
    return unsub;
  }, [ticket?.ticketId]);

  // Mark as read when opening
  useEffect(() => {
    if (ticket && hasUnreadAdminReply(ticket)) {
      markTicketReadByUser(ticket.ticketId);
    }
  }, [ticket?.ticketId, ticket?.lastAdminMessage]);

  const isClosed = ticket?.status === 'closed';
  const canSend =
    !sending &&
    isOnline &&
    Boolean(supportUserId) &&
    messageText.trim().length > 0 &&
    messageText.length <= MAX_MESSAGE_LENGTH &&
    (ticket != null || selectedCategory != null);

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    setSending(true);
    try {
      if (!ticket && selectedCategory) {
        await createTicket(selectedCategory, messageText.trim(), user?.name || 'User');
      } else if (ticket) {
        await sendUserMessage(ticket.ticketId, messageText.trim());
      }
      setMessageText('');
    } catch (e: any) {
      Alert.alert(text.sendError, e?.message || '');
    } finally {
      setSending(false);
    }
  }, [canSend, user?.name, ticket, selectedCategory, messageText, text.sendError]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderMessage = ({ item }: { item: SupportMessage }) => {
    const isUser = item.senderRole === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAdmin]}>
        <Text style={[styles.bubbleSender, isUser ? styles.bubbleSenderUser : styles.bubbleSenderAdmin]}>
          {isUser ? text.you : text.support}
        </Text>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAdmin]}>
          {item.text}
        </Text>
        <Text style={[styles.bubbleTime, isUser ? styles.bubbleTimeUser : styles.bubbleTimeAdmin]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={navigation.goBack} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <View style={{ width: 42 }} />
      </View>

      <View style={styles.accountNotice}>
        <MaterialCommunityIcons name="account-check-outline" size={18} color="#7C5A16" />
        <Text style={styles.accountNoticeText}>{text.accountNotice}</Text>
      </View>

      {/* Category picker */}
      {!ticket ? (
        <View style={styles.categorySection}>
          <TouchableOpacity
            style={styles.categoryButton}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryButtonText, !selectedCategory && styles.categoryPlaceholder]}>
              {selectedCategory ? catLabels[selectedCategory] : text.selectCategory}
            </Text>
            <MaterialCommunityIcons
              name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={SCREEN_THEME.textSecondary}
            />
          </TouchableOpacity>
          {showCategoryPicker && (
            <View style={styles.categoryList}>
              {SUPPORT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.categoryItem, selectedCategory === cat.key && styles.categoryItemActive]}
                  onPress={() => {
                    setSelectedCategory(cat.key);
                    setShowCategoryPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.categoryItemText,
                    selectedCategory === cat.key && styles.categoryItemTextActive,
                  ]}>
                    {catLabels[cat.key]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.ticketInfo}>
          <Text style={styles.ticketCategory}>{catLabels[ticket.category]}</Text>
          <View style={[styles.statusBadge, isClosed ? styles.statusClosed : styles.statusOpen]}>
            <Text style={styles.statusText}>{isClosed ? text.statusClosed : text.statusOpen}</Text>
          </View>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.messageId}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <MaterialCommunityIcons name="chat-outline" size={48} color={SCREEN_THEME.textMuted} />
          </View>
        }
      />

      {/* No connection banner */}
      {!isOnline && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="wifi-off" size={18} color="#B8860B" />
          <Text style={styles.warningText}>{text.noConnection}</Text>
        </View>
      )}

      {/* Input area */}
      <View style={styles.inputArea}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder={text.inputPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            value={messageText}
            onChangeText={setMessageText}
            maxLength={MAX_MESSAGE_LENGTH}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.charCounter, messageText.length > MAX_MESSAGE_LENGTH && styles.charCounterOver]}>
          {text.chars}: {messageText.length}/{MAX_MESSAGE_LENGTH}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1E1BC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
  },
  // Category
  accountNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  accountNoticeText: {
    flex: 1,
    color: '#7C5A16',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  categorySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  categoryButtonText: {
    fontSize: 15,
    color: SCREEN_THEME.textPrimary,
    flex: 1,
  },
  categoryPlaceholder: {
    color: SCREEN_THEME.textMuted,
  },
  categoryList: {
    marginTop: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    maxHeight: 300,
    overflow: 'hidden',
  },
  categoryItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4D0AB',
  },
  categoryItemActive: {
    backgroundColor: '#F1E1BC',
  },
  categoryItemText: {
    fontSize: 14,
    color: SCREEN_THEME.textPrimary,
  },
  categoryItemTextActive: {
    fontWeight: '600',
  },
  // Ticket info
  ticketInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ticketCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: SCREEN_THEME.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOpen: {
    backgroundColor: '#D4EDDA',
  },
  statusClosed: {
    backgroundColor: '#F8D7DA',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  // Messages
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  bubbleAdmin: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  bubbleSenderUser: {
    color: '#DBEAFE',
  },
  bubbleSenderAdmin: {
    color: '#6B7280',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextAdmin: {
    color: '#1F2937',
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  bubbleTimeUser: {
    color: '#BFDBFE',
  },
  bubbleTimeAdmin: {
    color: '#9CA3AF',
  },
  // Banners
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    flex: 1,
  },
  closedBanner: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F8D7DA',
    borderRadius: 12,
  },
  closedText: {
    fontSize: 13,
    color: '#721C24',
    textAlign: 'center',
    marginBottom: 10,
  },
  newTicketBtn: {
    backgroundColor: '#C8A45A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newTicketBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  // Input
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: SCREEN_THEME.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#A0AEC0',
  },
  charCounter: {
    fontSize: 11,
    color: SCREEN_THEME.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  charCounterOver: {
    color: '#EF4444',
    fontWeight: '600',
  },
});

export default SupportScreen;
