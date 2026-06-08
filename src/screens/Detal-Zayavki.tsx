import React, { useEffect, useMemo, useState } from 'react';
import MiniTabBar from '../components/MiniTabBar';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import { database, firebaseChatAPI } from '../firebase-config';
import type { RootState } from '../redux/store';
import type { Request } from '../types/app';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { showUserError } from '../utils/userFacingErrors';
import { profilePermissionService, type ContactReason } from '../services/profilePermissionService';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { getRequestTopicLabel } from '../data/categories';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { loadProfileRecord } from '../services/authProfileService';
import {
  awardGratitudeBonus,
  awardHelpRespondBonus,
  awardMilestoneBonus,
  checkIfHelped,
  closeRequestWithBonus,
  confirmHelperForRequest,
  subscribeHelpConfirmations,
  subscribeHelpResponses,
  type HelpConfirmation,
  type HelpResponse,
} from '../services/bonusService';
import Toast from 'react-native-toast-message';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import ContactReasonModal from '../components/ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';

type RequestDetailParams = {
  request: Request;
};

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    headerTitle: 'Деталі заявки',
    fallbackName: 'Сусід',
    description: 'Опис',
    contact: 'Контакт',
    connect: "Хочу зв'язатися",
    connectPending: 'Запит надіслано',
    connectApproved: "Зв'язок дозволено",
    connectDenied: 'Запит відхилено',
    connectCant: 'Не вдалося надіслати запит',
    connectSentTitle: 'Запит надіслано',
    connectSentBody: 'Користувач побачить ваш запит і зможе відкрити доступ до контактів.',
    backToList: 'Повернутися до списку заявок',
    numberTitle: 'Номер',
    justNow: 'щойно',
    minAgo: 'хв тому',
    hourAgo: 'год тому',
    dayAgo: 'д тому',
    delete: 'Видалити мою заявку',
    deleteTitle: 'Видалити заявку?',
    deleteBody: 'Вона буде видалена з чату заявок.',
    deleteSuccess: 'Заявку видалено',
    deleteError: 'Не вдалося видалити заявку',
    cancel: 'Скасувати',
    ok: 'OK',
    categories: {
      repair: 'Ремонт',
      medical: 'Медицина',
      cleaning: 'Прибирання',
      delivery: 'Доставка',
      other: 'Інше',
    },
    alreadyHelped: 'Ви вже відгукнулись',
    helpError: 'Не вдалося надіслати відгук',
  },
  ru: {
    headerTitle: 'Детали заявки',
    fallbackName: 'Сосед',
    description: 'Описание',
    contact: 'Контакт',
    connect: 'Хочу связаться',
    connectPending: 'Запрос отправлен',
    connectApproved: 'Связь разрешена',
    connectDenied: 'Запрос отклонен',
    connectCant: 'Не удалось отправить запрос',
    connectSentTitle: 'Запрос отправлен',
    connectSentBody: 'Пользователь увидит ваш запрос и сможет открыть доступ к контактам.',
    backToList: 'Вернуться к списку заявок',
    numberTitle: 'Номер',
    justNow: 'только что',
    minAgo: 'мин назад',
    hourAgo: 'ч назад',
    dayAgo: 'д назад',
    delete: 'Удалить мою заявку',
    deleteTitle: 'Удалить заявку?',
    deleteBody: 'Она будет удалена из чата заявок.',
    deleteSuccess: 'Заявка удалена',
    deleteError: 'Не удалось удалить заявку',
    cancel: 'Отмена',
    ok: 'OK',
    categories: {
      repair: 'Ремонт',
      medical: 'Медицина',
      cleaning: 'Уборка',
      delivery: 'Доставка',
      other: 'Другое',
    },
    alreadyHelped: 'Вы уже откликнулись',
    helpError: 'Не удалось отправить отклик',
  },
  en: {
    headerTitle: 'Request Details',
    fallbackName: 'Neighbor',
    description: 'Description',
    contact: 'Contact',
    connect: 'I want to connect',
    connectPending: 'Request sent',
    connectApproved: 'Connection approved',
    connectDenied: 'Request denied',
    connectCant: 'Cannot send request',
    connectSentTitle: 'Request sent',
    connectSentBody: 'This user will see your request and can grant access to contacts.',
    backToList: 'Back to request list',
    numberTitle: 'Phone number',
    justNow: 'just now',
    minAgo: 'min ago',
    hourAgo: 'h ago',
    dayAgo: 'd ago',
    delete: 'Delete my request',
    deleteTitle: 'Delete request?',
    deleteBody: 'It will be removed from the request chat.',
    deleteSuccess: 'Request deleted',
    deleteError: 'Failed to delete request',
    cancel: 'Cancel',
    ok: 'OK',
    categories: {
      repair: 'Repair',
      medical: 'Medical',
      cleaning: 'Cleaning',
      delivery: 'Delivery',
      other: 'Other',
    },
    alreadyHelped: 'You already responded',
    helpError: 'Could not send response',
  },
} as const;

const FUNCTION_ERROR_MESSAGES: Record<Lang, Record<string, string>> = {
  ua: {
    max_helpers_confirmed: 'Вже підтверджено 3 помічники для цієї заявки.',
    flagged_for_review: 'Відмічено для перевірки модератором.',
    help_not_confirmed: 'Спочатку підтвердіть допомогу цього користувача.',
    helper_not_responded: 'Цей користувач не відгукнувся на заявку.',
    request_not_found: 'Заявку не знайдено.',
    only_author_can_confirm: 'Підтверджувати помічника може тільки автор.',
    only_author_can_close: 'Закрити заявку може тільки автор.',
    only_author_can_thank: 'Дякувати може тільки автор.',
    auth_required: 'Необхідно авторизуватись.',
    weekly_limit_help: 'Тижневий ліміт бонусів допомоги вичерпано.',
    weekly_limit_total: 'Тижневий ліміт бонусів вичерпано.',
    accrual_blocked: 'Нарахування бонусів тимчасово заблоковано для цього акаунту.',
  },
  ru: {
    max_helpers_confirmed: 'Уже подтверждено 3 помощника для этой заявки.',
    flagged_for_review: 'Помечено для проверки модератором.',
    help_not_confirmed: 'Сначала подтвердите помощь этого пользователя.',
    helper_not_responded: 'Этот пользователь не откликнулся на заявку.',
    request_not_found: 'Заявка не найдена.',
    only_author_can_confirm: 'Подтверждать помощника может только автор.',
    only_author_can_close: 'Закрыть заявку может только автор.',
    only_author_can_thank: 'Благодарить может только автор.',
    auth_required: 'Необходимо авторизоваться.',
    weekly_limit_help: 'Недельный лимит бонусов помощи исчерпан.',
    weekly_limit_total: 'Недельный лимит бонусов исчерпан.',
    accrual_blocked: 'Начисление бонусов временно заблокировано для этого аккаунта.',
  },
  en: {
    max_helpers_confirmed: 'Already confirmed 3 helpers for this request.',
    flagged_for_review: 'Flagged for moderator review.',
    help_not_confirmed: 'Please confirm this helper first.',
    helper_not_responded: 'This user has not responded to the request.',
    request_not_found: 'Request not found.',
    only_author_can_confirm: 'Only the author can confirm a helper.',
    only_author_can_close: 'Only the author can close the request.',
    only_author_can_thank: 'Only the author can send thanks.',
    auth_required: 'Authentication required.',
    weekly_limit_help: 'Weekly help bonus limit reached.',
    weekly_limit_total: 'Weekly bonus limit reached.',
    accrual_blocked: 'Bonus accrual is temporarily blocked for this account.',
  },
};

const parseFunctionError = (error: unknown, fallback: string, language: Lang): string => {
  const msg = String((error as any)?.message || '').toLowerCase().replace(/functions\//g, '');
  return FUNCTION_ERROR_MESSAGES[language]?.[msg] || fallback;
};

const AVATAR_COLORS = ['#C77A5D', '#D8AF59', '#7E9D69', '#5F84B4', '#A56B55'];
const RTDB_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;
const toSafeRtdbKey = (value: string): string => (value ?? '').replace(RTDB_FORBIDDEN_KEY_CHARS, '_').trim();

const getGenderShortLabel = (gender?: string) => {
  if (gender === 'male') return 'M';
  if (gender === 'female') return 'F';
  return '';
};

const formatHelperTime = (timestamp: number) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const CONTACT_ACTION_TEXT = {
  ua: { call: 'Зателефонувати', viber: 'Viber', copy: 'Копія', profile: 'Профіль' },
  ru: { call: 'Позвонить', viber: 'Viber', copy: 'Копия', profile: 'Профиль' },
  en: { call: 'Call', viber: 'Viber', copy: 'Copy', profile: 'Profile' },
} as const;

const HELP_FLOW_TEXT = {
  ua: {
    respond: 'Можу допомогти',
    responded: 'Відгук надіслано',
    respondSuccess: 'Відгук надіслано. +5 бонусів довіри, якщо тижневий ліміт дозволяє.',
    respondFlagged: 'Відгук надіслано, але бонус очікує перевірки.',
    confirmHelp: 'Підтвердити допомогу',
    confirmed: 'Підтверджено',
    confirmSuccess: 'Помічника підтверджено. +20 бонусів, якщо ліміти дозволяють.',
    thank: 'Подякувати',
    thanked: 'Подяку надіслано',
    thanksSuccess: 'Подяку надіслано. +10 бонусів, якщо ліміти дозволяють.',
    closeSolved: 'Закрити як вирішену',
    closed: 'Заявку закрито',
    alreadyClosed: 'Заявку вже закрито раніше.',
    closeSuccess: 'Заявку закрито. +5 бонусів, якщо ліміти дозволяють.',
    helpersTitle: 'Помічники',
    helpersEmpty: 'Поки ніхто не відгукнувся.',
    flagged: 'Перевірка',
    bonusError: 'Не вдалося оновити бонуси допомоги',
  },
  ru: {
    respond: 'Могу помочь',
    responded: 'Отклик отправлен',
    respondSuccess: 'Отклик отправлен. +5 бонусов доверия, если лимит недели позволяет.',
    respondFlagged: 'Отклик отправлен, но бонус ожидает проверки.',
    confirmHelp: 'Подтвердить помощь',
    confirmed: 'Подтверждено',
    confirmSuccess: 'Помощник подтвержден. +20 бонусов, если лимиты позволяют.',
    thank: 'Поблагодарить',
    thanked: 'Спасибо отправлено',
    thanksSuccess: 'Благодарность отправлена. +10 бонусов, если лимиты позволяют.',
    closeSolved: 'Закрыть как решенную',
    closed: 'Заявка закрыта',
    alreadyClosed: 'Заявка уже была закрыта ранее.',
    closeSuccess: 'Заявка закрыта. +5 бонусов, если лимиты позволяют.',
    helpersTitle: 'Помощники',
    helpersEmpty: 'Пока никто не откликнулся.',
    flagged: 'Проверка',
    bonusError: 'Не удалось обновить бонусы помощи',
  },
  en: {
    respond: 'I can help',
    responded: 'Response sent',
    respondSuccess: 'Response sent. +5 trust bonuses if weekly limit allows.',
    respondFlagged: 'Response sent, but bonus is waiting for review.',
    confirmHelp: 'Confirm help',
    confirmed: 'Confirmed',
    confirmSuccess: 'Helper confirmed. +20 bonuses if limits allow.',
    thank: 'Thank',
    thanked: 'Thanks sent',
    thanksSuccess: 'Thanks sent. +10 bonuses if limits allow.',
    closeSolved: 'Close as solved',
    closed: 'Request closed',
    alreadyClosed: 'Request was already closed.',
    closeSuccess: 'Request closed. +5 bonuses if limits allow.',
    helpersTitle: 'Helpers',
    helpersEmpty: 'No helpers have responded yet.',
    flagged: 'Review',
    bonusError: 'Could not update help bonuses',
  },
} as const;

const RequestDetailScreen = ({
  route,
  navigation,
}: {
  route: RouteProp<{ RequestDetail: RequestDetailParams }, 'RequestDetail'>;
  navigation: NavigationProp<ParamListBase>;
}) => {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const helpText = HELP_FLOW_TEXT[language];
  const contactActionText = CONTACT_ACTION_TEXT[language];
  const { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest } = useContactRequest();
  const { request } = route.params;
  const [deleting, setDeleting] = useState(false);
  const [accessStatus, setAccessStatus] = useState<'pending' | 'approved' | 'denied' | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileAge, setProfileAge] = useState<number | undefined>();
  const [profileGender, setProfileGender] = useState('');
  const [requestLikes, setRequestLikes] = useState(0);
  const [helpStatus, setHelpStatus] = useState<'idle' | 'sending' | 'helped' | 'already'>('idle');
  const [helpResponses, setHelpResponses] = useState<HelpResponse[]>([]);
  const [helpConfirmations, setHelpConfirmations] = useState<HelpConfirmation[]>([]);
  const [helperNames, setHelperNames] = useState<Record<string, string>>({});
  const [busyHelperUid, setBusyHelperUid] = useState<string | null>(null);
  const [thankedHelpers, setThankedHelpers] = useState<Record<string, boolean>>({});
  const [closingRequest, setClosingRequest] = useState(false);
  const [requestSolved, setRequestSolved] = useState(request.status === 'closed');
  const helperIds = useMemo(() => helpResponses.map((item) => item.helperUid).filter(Boolean), [helpResponses]);
  const avatarByUserId = useUserAvatarMap([request.userId, ...helperIds].filter(Boolean));
  const resolvedAvatarUri = (request.userId && avatarByUserId[request.userId]) || pickUserAvatarUri({ userPhotoURL: request.userPhotoURL, startAvatarKey: request.startAvatarKey }) || pickUserAvatarUri(request);
  const displayName = profileName || request.name || text.fallbackName;
  const ageGenderLabel = [
    typeof profileAge === 'number' ? String(profileAge) : '',
    getGenderShortLabel(profileGender),
  ].filter(Boolean).join(' / ');

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return text.justNow;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return `${minutes} ${text.minAgo}`;
    if (hours < 24) return `${hours} ${text.hourAgo}`;
    return `${days} ${text.dayAgo}`;
  };

  useEffect(() => {
    const loadAccess = async () => {
      if (!currentUser?.id || !request.userId || currentUser.id === request.userId) {
        setAccessStatus(null);
        setAccessLoading(false);
        return;
      }
      try {
        const [access, privacyMode] = await Promise.all([
          profilePermissionService.checkAccess(request.userId, currentUser.id),
          profilePermissionService.getPrivacyMode(request.userId),
        ]);
        setAccessStatus(privacyMode === 'open' ? 'approved' : access);
      } catch {
        // keep existing accessStatus on network error
      } finally {
        setAccessLoading(false);
      }
    };
    void loadAccess();
  }, [currentUser?.id, request.userId]);

  useEffect(() => {
    let cancelled = false;

    const loadProfileMeta = async () => {
      if (!request.userId) {
        setProfileName('');
        setProfileAge(undefined);
        setProfileGender('');
        return;
      }

      try {
        const profile = await loadProfileRecord(request.userId);
        if (cancelled) return;
        setProfileName(profile?.name || '');
        setProfileAge(profile?.age);
        setProfileGender(profile?.gender || '');
      } catch {
        if (cancelled) return;
        setProfileName('');
        setProfileAge(undefined);
        setProfileGender('');
      }
    };

    void loadProfileMeta();
    return () => {
      cancelled = true;
    };
  }, [request.userId]);

  useEffect(() => {
    if (!request.id) {
      setRequestLikes(0);
      return;
    }
    const likesRef = ref(database, `feed_likes/requests/${toSafeRtdbKey(request.id)}`);
    const unsubscribe = onValue(likesRef, (snapshot) => {
      const value = snapshot.val();
      setRequestLikes(value && typeof value === 'object' ? Object.keys(value).length : 0);
    }, () => { setRequestLikes(0); });
    return unsubscribe;
  }, [request.id]);

  useEffect(() => {
    if (!request.id) return;
    const statusRef = ref(database, `requests/${request.id}/status`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.val() === 'closed') setRequestSolved(true);
    }, () => {});
    return unsubStatus;
  }, [request.id]);

  useEffect(() => {
    const unsubResponses = subscribeHelpResponses(request.id, setHelpResponses);
    const unsubConfirmations = subscribeHelpConfirmations(request.id, setHelpConfirmations);
    return () => {
      unsubResponses();
      unsubConfirmations();
    };
  }, [request.id]);

  useEffect(() => {
    if (helperIds.length === 0) {
      setHelperNames({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        helperIds.map(async (uid) => {
          try {
            const profile = await loadProfileRecord(uid);
            return [uid, profile?.name || uid.slice(0, 6)] as const;
          } catch {
            return [uid, uid.slice(0, 6)] as const;
          }
        }),
      );
      if (!cancelled) setHelperNames(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [helperIds]);

  const canRequestContact = Boolean(request.userId && request.userId !== currentUser?.id);
  const canOpenProfile = Boolean(request.userId && request.userId !== currentUser?.id);

  const isOwnRequest = useMemo(() => {
    if (!currentUser) return false;
    // Primary: compare Firebase user ID (reliable, works with masked phone)
    if (request.userId && currentUser.id) {
      return request.userId === currentUser.id;
    }
    // Fallback: name match (phone is masked in Firebase so digits comparison is unreliable)
    const sameName = Boolean(currentUser.name?.trim()) && currentUser.name.trim().toLowerCase() === (request.name || '').trim().toLowerCase();
    return sameName;
  }, [currentUser, request.userId, request.name]);

  const phoneVisible = isOwnRequest || accessStatus === 'approved';
  // For own request: use real phone from auth profile (request.phone is always masked in RTDB)
  const callPhone = isOwnRequest ? (currentUser?.phone || request.phone) : request.phone;
  const hasPhone = phoneVisible && Boolean(callPhone?.trim());
  const canContact = canRequestContact || hasPhone;

  const handleCopyPhone = async () => {
    if (!callPhone) return;
    await Clipboard.setStringAsync(callPhone);
    Alert.alert(text.numberTitle, callPhone);
  };

  const handleProfile = () => {
    if (!canOpenProfile || !request.userId) return;
    navigation.navigate('ViewUserProfile', { userId: request.userId });
  };

  const handleSendContactRequest = async (reason: ContactReason) => {
    await sendRequest(reason);
    if (currentUser?.id && request.userId && currentUser.id !== request.userId) {
      try {
        const [access, privacyMode] = await Promise.all([
          profilePermissionService.checkAccess(request.userId, currentUser.id),
          profilePermissionService.getPrivacyMode(request.userId),
        ]);
        setAccessStatus(privacyMode === 'open' ? 'approved' : access);
      } catch {
        // ignore — status label will stay as-is
      }
    }
  };

  const handleContact = () => {
    if (canRequestContact && request.userId) {
      if (accessStatus === 'pending') {
        Toast.show({ type: 'info', text1: text.connectPending });
        return;
      }
      if (accessStatus === 'approved') {
        Toast.show({ type: 'success', text1: text.connectApproved });
        return;
      }
      void openModal({
        userId: request.userId,
        name: displayName,
        photoURL: resolvedAvatarUri,
        sourceType: 'help',
        sourceId: request.id,
        sourceTitle: (request.text || request.description || '').slice(0, 60),
      });
      return;
    }

    if (!hasPhone) return;
    Alert.alert(text.connect, displayName, [
      { text: contactActionText.call, onPress: () => { void safeCallPhone(callPhone, language); } },
      { text: contactActionText.viber, onPress: () => { void safeOpenViber(callPhone, language); } },
      { text: text.cancel, style: 'cancel' },
    ]);
  };

  useEffect(() => {
    if (!currentUser?.id || !request.id || isOwnRequest) return;
    let cancelled = false;
    void checkIfHelped(request.id).then((helped) => {
      if (!cancelled && helped) setHelpStatus('already');
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, request.id, isOwnRequest]);

  const handleHelp = async () => {
    if (!request.id || helpStatus !== 'idle') return;
    setHelpStatus('sending');
    try {
      const result = await awardHelpRespondBonus(request.id);
      if (result.status === 'already_helped' || result.status === 'already_responded') {
        setHelpStatus('already');
        Alert.alert(text.ok, text.alreadyHelped);
      } else if (result.status === 'flagged') {
        setHelpStatus('helped');
        Alert.alert(text.ok, helpText.respondFlagged);
      } else {
        setHelpStatus('helped');
        Alert.alert(text.ok, helpText.respondSuccess);
        awardMilestoneBonus('first_response').catch(() => {});
      }
    } catch (error) {
      setHelpStatus('idle');
      Alert.alert(text.ok, parseFunctionError(error, text.helpError, language));
    }
  };

  const confirmedHelperIds = useMemo(
    () => new Set(helpConfirmations.map((item) => item.helperUid)),
    [helpConfirmations],
  );

  const handleConfirmHelper = async (helperUid: string) => {
    if (!request.id || busyHelperUid) return;
    setBusyHelperUid(helperUid);
    try {
      const result = await confirmHelperForRequest(request.id, helperUid);
      if (result.ok) {
        Alert.alert(text.ok, helpText.confirmSuccess);
      } else {
        const knownMsg = FUNCTION_ERROR_MESSAGES[language]?.[result.status || ''];
        Alert.alert(text.ok, knownMsg || helpText.bonusError);
      }
    } catch (error) {
      Alert.alert(text.ok, parseFunctionError(error, helpText.bonusError, language));
    } finally {
      setBusyHelperUid(null);
    }
  };

  const handleThankHelper = async (helperUid: string) => {
    if (!request.id || busyHelperUid) return;
    setBusyHelperUid(helperUid);
    try {
      const result = await awardGratitudeBonus(request.id, helperUid);
      setThankedHelpers((prev) => ({ ...prev, [helperUid]: true }));
      Alert.alert(text.ok, result.awarded ? helpText.thanksSuccess : helpText.thanked);
    } catch (error) {
      Alert.alert(text.ok, parseFunctionError(error, helpText.bonusError, language));
    } finally {
      setBusyHelperUid(null);
    }
  };

  const handleCloseSolved = async () => {
    if (!request.id || closingRequest || requestSolved) return;
    setClosingRequest(true);
    try {
      const result = await closeRequestWithBonus(request.id);
      setRequestSolved(true);
      if (result.status === 'already_closed') {
        Alert.alert(text.ok, helpText.alreadyClosed);
      } else {
        Alert.alert(text.ok, result.ok ? helpText.closeSuccess : helpText.closed);
      }
    } catch (error) {
      Alert.alert(text.ok, parseFunctionError(error, helpText.bonusError, language));
    } finally {
      setClosingRequest(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(text.deleteTitle, text.deleteBody, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.delete,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeleting(true);
            const result = await firebaseChatAPI.deleteRequest(request.id);
            setDeleting(false);
            if (!result.success) {
              showUserError(language, 'delete', result.error || text.deleteError);
              return;
            }

            Alert.alert(text.ok, text.deleteSuccess, [
              { text: text.ok, onPress: () => navigation.goBack() },
            ]);
          })();
        },
      },
    ]);
  };

  const avatarColor = AVATAR_COLORS[(request.name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length] || '#C77A5D';
  const categoryLabel = getRequestTopicLabel(
    { category: request.category, group: request.group, subcategory: request.subcategory },
    language,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.profileRow}>
          <MiniUserAvatar
            uri={resolvedAvatarUri}
            name={displayName}
            size={62}
            borderRadius={31}
            backgroundColor={avatarColor}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.nameText}>{displayName}</Text>
            <View style={styles.profileMetaRow}>
              {ageGenderLabel ? <Text style={styles.profileMetaText}>{ageGenderLabel}</Text> : null}
              <View style={styles.ratingPill}>
                <MaterialCommunityIcons name="heart" size={12} color="#7A1E5C" />
                <Text style={styles.ratingText}>{requestLikes}</Text>
              </View>
            </View>
            <Text style={styles.categoryText}>{categoryLabel}</Text>
            <Text style={styles.timeText}>{getTimeAgo(request.timestamp ?? request.createdAt ?? Date.now())}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{text.description}</Text>
          <Text style={styles.requestText}>{request.text || request.description}</Text>
        </View>

        {(request.photoUri || request.photoStoragePath) ? (
          <View style={styles.card}>
            <AppPhotoImage
              uri={request.photoUri}
              storagePath={request.photoStoragePath}
              style={styles.requestPhoto}
              resizeMode="contain"
              debugLabel={`RequestDetails:${request.id}`}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{text.contact}</Text>
          <Text style={styles.phoneText}>{phoneVisible ? (callPhone || '—') : '***'}</Text>
          <View style={styles.contactActions}>
            <TouchableOpacity
              style={[styles.smallAction, !canOpenProfile && styles.disabledContactAction]}
              onPress={handleProfile}
              disabled={!canOpenProfile}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons name="account-circle-outline" size={16} color={canOpenProfile ? '#fff' : '#9F958E'} />
              <Text style={[styles.smallActionText, !canOpenProfile && styles.disabledContactText]}>{contactActionText.profile}</Text>
            </TouchableOpacity>
            {phoneVisible ? (
              <>
                <TouchableOpacity
                  style={[styles.smallAction, !hasPhone && styles.disabledContactAction]}
                  onPress={() => void safeCallPhone(callPhone, language)}
                  disabled={!hasPhone}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="phone-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                  <Text style={[styles.smallActionText, !hasPhone && styles.disabledContactText]}>{contactActionText.call}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallAction, !hasPhone && styles.disabledContactAction]}
                  onPress={() => void safeOpenViber(callPhone, language)}
                  disabled={!hasPhone}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="message-text-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                  <Text style={[styles.smallActionText, !hasPhone && styles.disabledContactText]}>{contactActionText.viber}</Text>
                </TouchableOpacity>
                {hasPhone ? (
                  <TouchableOpacity style={styles.smallActionAlt} onPress={() => void handleCopyPhone()} activeOpacity={0.82}>
                    <MaterialCommunityIcons name="content-copy" size={16} color="#403933" />
                    <Text style={styles.smallActionAltText}>{contactActionText.copy}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.contactBtn, (!canContact || accessLoading) && styles.disabledContactAction]}
          onPress={handleContact}
          disabled={!canContact || accessLoading}
          activeOpacity={0.86}
        >
          <Text style={[styles.contactBtnText, !canContact && styles.disabledContactText]}>{text.connect}</Text>
        </TouchableOpacity>

        {!isOwnRequest && accessStatus ? (
          <Text style={styles.connectStatusText}>
            {accessStatus === 'approved' ? text.connectApproved : accessStatus === 'pending' ? text.connectPending : text.connectDenied}
          </Text>
        ) : null}

        {isOwnRequest ? (
          <View style={styles.card}>
            <View style={styles.helpPanelHeader}>
              <View style={styles.helpPanelTitleRow}>
                <MaterialCommunityIcons name="account-heart-outline" size={20} color={SCREEN_THEME.woodGreenDark} />
                <Text style={styles.helpPanelTitle}>{helpText.helpersTitle}</Text>
              </View>
              <Text style={styles.helpPanelCount}>{helpResponses.length}</Text>
            </View>

            {helpResponses.length === 0 ? (
              <Text style={styles.helperEmptyText}>{helpText.helpersEmpty}</Text>
            ) : helpResponses.map((response) => {
              const isConfirmed = confirmedHelperIds.has(response.helperUid);
              const isBusy = busyHelperUid === response.helperUid;
              const helperAvatar = avatarByUserId[response.helperUid];
              return (
                <View key={response.helperUid} style={styles.helperRow}>
                  <MiniUserAvatar
                    uri={helperAvatar}
                    name={helperNames[response.helperUid] || response.helperUid}
                    size={42}
                    borderRadius={21}
                    backgroundColor={SCREEN_THEME.enamelBlue}
                  />
                  <View style={styles.helperInfo}>
                    <Text style={styles.helperName} numberOfLines={1}>{helperNames[response.helperUid] || response.helperUid}</Text>
                    <Text style={styles.helperMeta}>
                      {response.flagged ? helpText.flagged : formatHelperTime(response.at)}
                    </Text>
                  </View>
                  {response.flagged ? (
                    <View style={styles.flaggedPill}>
                      <Text style={styles.flaggedPillText}>{helpText.flagged}</Text>
                    </View>
                  ) : isConfirmed ? (
                    <View style={styles.helperActions}>
                      <View style={styles.confirmedPill}>
                        <MaterialCommunityIcons name="check" size={13} color="#2E6B38" />
                        <Text style={styles.confirmedPillText}>{helpText.confirmed}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.thankButton, (isBusy || thankedHelpers[response.helperUid]) && styles.actionButtonDisabled]}
                        onPress={() => void handleThankHelper(response.helperUid)}
                        disabled={isBusy || thankedHelpers[response.helperUid]}
                        activeOpacity={0.82}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#7A1E5C" />
                        ) : (
                          <Text style={styles.thankButtonText}>{thankedHelpers[response.helperUid] ? helpText.thanked : `${helpText.thank} +10`}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.confirmHelperButton, isBusy && styles.actionButtonDisabled]}
                      onPress={() => void handleConfirmHelper(response.helperUid)}
                      disabled={isBusy}
                      activeOpacity={0.82}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color="#FFF9EE" />
                      ) : (
                        <Text style={styles.confirmHelperButtonText}>{helpText.confirmHelp} +20</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {!isOwnRequest && currentUser?.id ? (
          <TouchableOpacity
            style={[
              styles.helpButton,
              (helpStatus === 'helped' || helpStatus === 'already') && styles.helpButtonDone,
              helpStatus === 'sending' && styles.actionButtonDisabled,
            ]}
            onPress={() => void handleHelp()}
            disabled={helpStatus !== 'idle'}
            activeOpacity={0.82}
          >
            {helpStatus === 'sending' ? (
              <ActivityIndicator color="#FFF9EE" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={helpStatus === 'helped' || helpStatus === 'already' ? 'check-circle' : 'handshake'}
                  size={18}
                  color="#FFF9EE"
                />
                <Text style={styles.helpButtonText}>
                  {helpStatus === 'helped' || helpStatus === 'already' ? helpText.responded : helpText.respond}
                </Text>
                <MaterialCommunityIcons name="circle-multiple" size={14} color="#FFD54F" />
                <Text style={styles.helpBonusHint}>+5</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {isOwnRequest ? (
          <TouchableOpacity
            style={[styles.closeSolvedButton, (closingRequest || requestSolved) && styles.actionButtonDisabled]}
            onPress={() => void handleCloseSolved()}
            disabled={closingRequest || requestSolved}
            activeOpacity={0.84}
          >
            {closingRequest ? (
              <ActivityIndicator color="#FFF9EE" />
            ) : (
              <>
                <MaterialCommunityIcons name={requestSolved ? 'check-circle' : 'check-decagram-outline'} size={18} color="#FFF9EE" />
                <Text style={styles.closeSolvedButtonText}>{requestSolved ? helpText.closed : `${helpText.closeSolved} +5`}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {isOwnRequest ? (
          <TouchableOpacity style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]} onPress={handleDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#FFF9EE" />
            ) : (
              <>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFF9EE" />
                <Text style={styles.deleteButtonText}>{text.delete}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>{text.backToList}</Text>
        </TouchableOpacity>
      </ScrollView>
      <MiniTabBar />
      <ContactReasonModal
        visible={modalVisible}
        pending={pending}
        target={currentTarget}
        onSelect={(reason) => void handleSendContactRequest(reason)}
        onClose={closeModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1E1BC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0C89A' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  headerSpacer: { width: 42 },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  profileInfo: { flex: 1 },
  nameText: { fontSize: 19, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 4 },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  profileMetaText: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '800' },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F7E7F0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#E5C0D5' },
  ratingText: { fontSize: 12, color: '#7A1E5C', fontWeight: '900' },
  categoryText: { fontSize: 13, color: SCREEN_THEME.terracottaDark, fontWeight: '800', marginBottom: 2 },
  timeText: { fontSize: 12, color: SCREEN_THEME.textMuted },
  card: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  cardLabel: { fontSize: 12, color: SCREEN_THEME.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '800' },
  requestText: { fontSize: 15, color: SCREEN_THEME.textPrimary, lineHeight: 23 },
  requestPhoto: { width: '100%', height: 220, borderRadius: 18, backgroundColor: '#E7DDD0' },
  phoneText: { fontSize: 18, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginBottom: 10 },
  contactActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#403933',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  smallActionAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8DDD3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionAltText: { color: '#403933', fontSize: 12, fontWeight: '900' },
  disabledContactAction: { backgroundColor: '#E1D7CF' },
  disabledContactText: { color: '#9F958E' },
  contactBtn: { alignItems: 'center', backgroundColor: '#7A1E5C', borderRadius: 16, paddingVertical: 14, marginBottom: 12 },
  contactBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  actionButtonDisabled: { opacity: 0.7 },
  connectStatusText: { marginBottom: 10, textAlign: 'center', color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  helpPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  helpPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helpPanelTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  helpPanelCount: {
    minWidth: 28,
    textAlign: 'center',
    color: '#FFF9EE',
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 13,
    fontWeight: '900',
  },
  helperEmptyText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(123, 86, 56, 0.12)',
  },
  helperInfo: {
    flex: 1,
    minWidth: 0,
  },
  helperName: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  helperMeta: {
    color: SCREEN_THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  helperActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  confirmHelperButton: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmHelperButtonText: {
    color: '#FFF9EE',
    fontSize: 12,
    fontWeight: '900',
  },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E3F2E5',
  },
  confirmedPillText: {
    color: '#2E6B38',
    fontSize: 11,
    fontWeight: '900',
  },
  thankButton: {
    minHeight: 32,
    borderRadius: 10,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7E7F0',
    borderWidth: 1,
    borderColor: '#E5C0D5',
  },
  thankButtonText: {
    color: '#7A1E5C',
    fontSize: 11,
    fontWeight: '900',
  },
  flaggedPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#FFF3CE',
    borderWidth: 1,
    borderColor: '#E8C66F',
  },
  flaggedPillText: {
    color: '#8A6A1D',
    fontSize: 11,
    fontWeight: '900',
  },
  deleteButton: {
    backgroundColor: '#C85D4A',
    borderRadius: 18,
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#A04635',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  deleteButtonDisabled: { opacity: 0.72 },
  deleteButtonText: { color: '#FFF9EE', fontSize: 15, fontWeight: '900' },
  helpButton: {
    backgroundColor: '#2196F3',
    borderRadius: 18,
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#1976D2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  helpButtonDone: {
    backgroundColor: '#66BB6A',
    borderColor: '#4CAF50',
  },
  helpButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  helpBonusHint: {
    color: '#FFD54F',
    fontSize: 13,
    fontWeight: '900',
  },
  closeSolvedButton: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 18,
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#49613B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  closeSolvedButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  backButton: { alignItems: 'center', paddingVertical: 12 },
  backButtonText: { color: SCREEN_THEME.textSecondary, fontSize: 14, fontWeight: '800' },
});

export default RequestDetailScreen;
