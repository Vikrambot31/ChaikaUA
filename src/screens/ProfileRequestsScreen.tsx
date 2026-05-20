import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { get, ref } from 'firebase/database';
import { ContactReason, ProfileViewRequest, ViewRequestStatus, profilePermissionService } from '../services/profilePermissionService';
import {
  PROFILE_REQUEST_CONTEXT_KEYS,
  getProfileRequestContextLabel,
  getProfileRequestStatusLabel,
} from '../utils/profileRequestMeta';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { database } from '../firebase-core';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';

type Lang = 'ua' | 'ru' | 'en';
type RequestsTab = 'incoming' | 'outgoing' | 'history';

const SEEN_KEY = '@chaika:outgoing_seen_contacts_v1';

const OUTGOING_STATUS: Record<string, Record<Lang, string>> = {
  pending:          { ua: 'Очікує відповіді',  ru: 'Ожидает ответа',    en: 'Awaiting response' },
  approved_contact: { ua: 'Контакт відкрито',  ru: 'Контакт открыт',   en: 'Contact open'      },
  approved:         { ua: 'Прийнято',           ru: 'Принято',           en: 'Accepted'          },
  denied:           { ua: 'Поки без відповіді', ru: 'Пока без ответа',  en: 'No response yet'   },
};

const PENDING_HINT: Record<Lang, string> = {
  ua: "Коли з'явиться значок телефону — користувач готовий з вами зв'язатися",
  ru: 'Когда появится значок телефона — пользователь готов с вами связаться',
  en: 'When a phone icon appears — the user is ready to contact you',
};

function BlinkingPhoneBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Animated.View style={[styles.blinkPhoneBtn, { opacity }]}>
        <MaterialCommunityIcons name="phone" size={14} color="#fff" />
        <Text style={styles.blinkPhoneBtnText}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
type StatusFilter = 'all' | ViewRequestStatus;
type ContextFilter = 'all' | 'lyudi' | 'help' | 'sport' | 'buysell' | 'job';

const ACCENT = '#7A1E5C';

const UI = {
  ua: {
    title: "Хочуть зв'язатись",
    tabIncoming: 'Вхідні',
    tabOutgoing: 'Вихідні',
    tabHistory: 'Історія',
    empty: 'Немає нових запитів',
    emptyOutgoing: 'Ви ще нікому не надсилали запити',
    emptyHistory: 'Історія запитів порожня',
    emptyHint: 'Тут з\'являться люди, які хочуть зв\'язатися з вами.',
    emptyHintOutgoing: 'Тут буде список профілів, яким ви надсилали запит на контакт.',
    emptyHintHistory: 'Тут буде видно усі ваші вхідні запити та їхні статуси.',
    notReady: 'Розділ буде доступний на наступному кроці.',
    filterStatus: 'Статус',
    filterContext: 'Розділ',
    filterAll: 'Усі',
    showHidden: 'Показати приховані',
    restore: 'Повернути',
    hide: 'Сховати',
    openSource: 'Відкрити джерело',
    sharedContact: 'Контакт',
    copy: 'Скопіювати',
    copyHintTitle: 'Копіювання',
    copyHintBody: 'Затримайте номер, щоб скопіювати його в буфер обміну.',
    approve: 'Дозволити',
    deny: 'Відхилити',
    errTitle: 'Помилка',
    errBody: 'Не вдалося відповісти. Спробуйте ще раз.',
    sourceBoxTitle: 'Джерело:',
    call: 'Подзвонити',
    callUnavailable: 'Немає телефону',
    viber: 'Viber',
    viberUnavailable: 'Немає Viber',
    reasonLabel: 'Причина:',
    sourceLabel: 'Розділ:',
    profileUnavailable: 'Профіль користувача недоступний',
    reasons: {
      acquaintance: 'Просто знайомство',
      by_listing: 'По оголошенню / заявці',
      by_services: 'По темі послуг',
      by_issue: 'По проблемі',
    },
  },
  ru: {
    title: 'Хотят связаться',
    tabIncoming: 'Входящие',
    tabOutgoing: 'Исходящие',
    tabHistory: 'История',
    empty: 'Нет новых запросов',
    emptyOutgoing: 'Вы еще никому не отправляли запросы',
    emptyHistory: 'История запросов пуста',
    emptyHint: 'Здесь появятся люди, которые хотят связаться с вами.',
    emptyHintOutgoing: 'Здесь будет список профилей, которым вы отправляли запрос на контакт.',
    emptyHintHistory: 'Здесь будут все входящие запросы и их статусы.',
    notReady: 'Раздел появится на следующем шаге.',
    filterStatus: 'Статус',
    filterContext: 'Раздел',
    filterAll: 'Все',
    showHidden: 'Показать скрытые',
    restore: 'Вернуть',
    hide: 'Скрыть',
    openSource: 'Открыть источник',
    sharedContact: 'Контакт',
    copy: 'Копировать',
    copyHintTitle: 'Копирование',
    copyHintBody: 'Зажмите номер, чтобы скопировать его в буфер обмена.',
    approve: 'Разрешить',
    deny: 'Отклонить',
    errTitle: 'Ошибка',
    errBody: 'Не удалось ответить. Попробуйте снова.',
    sourceBoxTitle: 'Источник:',
    call: 'Позвонить',
    callUnavailable: 'Нет телефона',
    viber: 'Viber',
    viberUnavailable: 'Нет Viber',
    reasonLabel: 'Причина:',
    sourceLabel: 'Раздел:',
    profileUnavailable: 'Профиль пользователя недоступен',
    reasons: {
      acquaintance: 'Просто знакомство',
      by_listing: 'По объявлению / заявке',
      by_services: 'По теме услуг',
      by_issue: 'По проблеме',
    },
  },
  en: {
    title: 'Contact requests',
    tabIncoming: 'Incoming',
    tabOutgoing: 'Outgoing',
    tabHistory: 'History',
    empty: 'No new requests',
    emptyOutgoing: 'You have not sent any requests yet',
    emptyHistory: 'No request history yet',
    emptyHint: 'People who want to contact you will appear here.',
    emptyHintOutgoing: 'Profiles you requested contact access to will appear here.',
    emptyHintHistory: 'All incoming requests and their statuses will appear here.',
    notReady: 'This section will be available in the next step.',
    filterStatus: 'Status',
    filterContext: 'Section',
    filterAll: 'All',
    showHidden: 'Show hidden',
    restore: 'Restore',
    hide: 'Hide',
    openSource: 'Open source',
    sharedContact: 'Contact',
    copy: 'Copy',
    copyHintTitle: 'Copy',
    copyHintBody: 'Press and hold the number to copy it.',
    approve: 'Allow',
    deny: 'Deny',
    errTitle: 'Error',
    errBody: 'Failed to respond. Please try again.',
    sourceBoxTitle: 'Source:',
    call: 'Call',
    callUnavailable: 'No phone',
    viber: 'Viber',
    viberUnavailable: 'No Viber',
    reasonLabel: 'Reason:',
    sourceLabel: 'Section:',
    profileUnavailable: 'User profile is unavailable',
    reasons: {
      acquaintance: 'Just getting acquainted',
      by_listing: 'About a listing / request',
      by_services: 'About services',
      by_issue: 'About a problem',
    },
  },
};

export default function ProfileRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const t = UI[language];
  const [requests, setRequests] = useState<ProfileViewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RequestsTab>('incoming');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Record<string, boolean>>({});
  const [incomingPhones, setIncomingPhones] = useState<Record<string, string>>({});
  const [incomingAges, setIncomingAges] = useState<Record<string, string>>({});
  const [incomingVotes, setIncomingVotes] = useState<Record<string, number>>({});
  const [seenContacts, setSeenContacts] = useState<Record<string, boolean>>({});

  const loadIncomingPhones = useCallback(async (incoming: ProfileViewRequest[]) => {
    const uniqueRequesterIds = Array.from(new Set(incoming.map((item) => item.requesterId).filter(Boolean)));
    if (uniqueRequesterIds.length === 0) {
      setIncomingPhones({});
      setIncomingAges({});
      setIncomingVotes({});
      return;
    }
    const pairs = await Promise.all(
      uniqueRequesterIds.map(async (requesterId) => {
        try {
          const [phoneSnap, ageSnap, votesSnap] = await Promise.all([
            get(ref(database, `users/${requesterId}/phone`)),
            get(ref(database, `users/${requesterId}/age`)),
            get(ref(database, `users/${requesterId}/ratingVotes`)),
          ]);
          const rawPhone = phoneSnap.val();
          const rawAge = ageSnap.val();
          const rawVotes = votesSnap.val();
          const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
          const age = rawAge !== null && rawAge !== undefined ? String(rawAge).trim() : '';
          const votes = typeof rawVotes === 'number' ? rawVotes : 0;
          return [requesterId, phone, age, votes] as const;
        } catch {
          return [requesterId, '', '', 0] as const;
        }
      })
    );
    setIncomingPhones(
      pairs.reduce<Record<string, string>>((acc, [requesterId, phone]) => {
        if (phone) acc[requesterId] = phone;
        return acc;
      }, {})
    );
    setIncomingAges(
      pairs.reduce<Record<string, string>>((acc, [requesterId, , age]) => {
        if (age) acc[requesterId] = age;
        return acc;
      }, {})
    );
    setIncomingVotes(
      pairs.reduce<Record<string, number>>((acc, [requesterId, , , votes]) => {
        acc[requesterId] = votes;
        return acc;
      }, {})
    );
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const hidden = await profilePermissionService.getHiddenRequestKeys(user.id);
      const reqs = activeTab === 'history'
        ? await profilePermissionService.getAllRequestsWithHistory(user.id)
        : activeTab === 'outgoing'
          ? await profilePermissionService.getOutgoingRequests(user.id)
          : await profilePermissionService.getAllRequests(user.id);
      setHiddenKeys(hidden);
      setRequests(reqs);
      if (activeTab === 'incoming') {
        await loadIncomingPhones(reqs);
      }
    } catch {
      Alert.alert(t.errTitle, t.errBody);
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadIncomingPhones, t.errBody, t.errTitle, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [hidden, incomingRequests, outgoingRequests, historyRequests] = await Promise.all([
          profilePermissionService.getHiddenRequestKeys(user.id),
          profilePermissionService.getAllRequests(user.id),
          profilePermissionService.getOutgoingRequests(user.id),
          profilePermissionService.getAllRequestsWithHistory(user.id),
        ]);
        if (cancelled) return;
        setHiddenKeys(hidden);
        if (incomingRequests.length > 0) {
          setActiveTab('incoming');
          setRequests(incomingRequests);
          await loadIncomingPhones(incomingRequests);
        } else if (outgoingRequests.length > 0) {
          setActiveTab('outgoing');
          setRequests(outgoingRequests);
        } else if (historyRequests.length > 0) {
          setActiveTab('history');
          setRequests(historyRequests);
        } else {
          setActiveTab('incoming');
          setRequests([]);
        }
        setTabInitialized(true);
      } catch {
        if (!cancelled) {
          Alert.alert(t.errTitle, t.errBody);
          setTabInitialized(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [loadIncomingPhones, t.errBody, t.errTitle, user?.id]);

  useEffect(() => {
    if (!tabInitialized) return;
    void load();
  }, [load, tabInitialized]);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        if (raw) setSeenContacts(JSON.parse(raw) as Record<string, boolean>);
      } catch { /* ignore */ }
    })();
  }, []);

  const markSeen = useCallback(async (key: string) => {
    setSeenContacts((prev) => {
      const next = { ...prev, [key]: true };
      void AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => { /* ignore */ });
      return next;
    });
  }, []);

  const formatTimeShort = (iso: string) => {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}, ${hours}:${mins}`;
  };

  const filteredRequests = requests.filter((item) => {
    if (activeTab === 'incoming') return true;
    const targetUserId = activeTab === 'outgoing' ? (item.targetUserId ?? '') : (user?.id ?? '');
    const hiddenKey = profilePermissionService.requestKey(targetUserId, item.requesterId);
    const isHidden = Boolean(hiddenKeys[hiddenKey]);
    if (!showHidden && isHidden) return false;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (contextFilter !== 'all' && item.context !== contextFilter) return false;
    return true;
  });

  const handleCall = async (phoneRaw?: string) => {
    await safeCallPhone(phoneRaw, language);
  };

  const handleViber = async (phoneRaw?: string) => {
    await safeOpenViber(phoneRaw, language);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'incoming' && styles.tabBtnActive]}
          onPress={() => setActiveTab('incoming')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'incoming' && styles.tabBtnTextActive]}>{t.tabIncoming}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'outgoing' && styles.tabBtnActive]}
          onPress={() => setActiveTab('outgoing')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'outgoing' && styles.tabBtnTextActive]}>{t.tabOutgoing}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>{t.tabHistory}</Text>
        </TouchableOpacity>
      </View>

      {activeTab !== 'incoming' ? (
        <View style={styles.filtersBlock}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t.filterStatus}</Text>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]} onPress={() => setStatusFilter('all')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>{t.filterAll}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]} onPress={() => setStatusFilter('pending')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('pending', language)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'approved' && styles.filterChipActive]} onPress={() => setStatusFilter('approved')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'approved' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('approved', language)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterChip, statusFilter === 'denied' && styles.filterChipActive]} onPress={() => setStatusFilter('denied')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, statusFilter === 'denied' && styles.filterChipTextActive]}>{getProfileRequestStatusLabel('denied', language)}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>{t.filterContext}</Text>
            <TouchableOpacity style={[styles.filterChip, contextFilter === 'all' && styles.filterChipActive]} onPress={() => setContextFilter('all')} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, contextFilter === 'all' && styles.filterChipTextActive]}>{t.filterAll}</Text>
            </TouchableOpacity>
            {PROFILE_REQUEST_CONTEXT_KEYS.map((key) => (
              <TouchableOpacity key={key} style={[styles.filterChip, contextFilter === key && styles.filterChipActive]} onPress={() => setContextFilter(key)} activeOpacity={0.85}>
                <Text style={[styles.filterChipText, contextFilter === key && styles.filterChipTextActive]}>{getProfileRequestContextLabel(key, language)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.filterRow}>
            <TouchableOpacity style={[styles.filterChip, showHidden && styles.filterChipActive]} onPress={() => setShowHidden((prev) => !prev)} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, showHidden && styles.filterChipTextActive]}>{t.showHidden}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : filteredRequests.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="bell-check-outline" size={52} color="#C0A898" />
          <Text style={styles.emptyText}>
            {activeTab === 'history' ? t.emptyHistory : activeTab === 'outgoing' ? t.emptyOutgoing : t.empty}
          </Text>
          <Text style={styles.emptyHint}>
            {activeTab === 'history' ? t.emptyHintHistory : activeTab === 'outgoing' ? t.emptyHintOutgoing : t.emptyHint}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => `${item.requesterId}_${item.requestedAt}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (activeTab === 'incoming') {
              const phone = item.requesterPhone?.trim() || incomingPhones[item.requesterId];
              const age = incomingAges[item.requesterId];
              const votes = incomingVotes[item.requesterId] ?? 0;
              const reasonText = item.reason ? t.reasons[item.reason as ContactReason] : null;
              const descriptionText = reasonText || item.sourceTitle || (age ? age : null);
              const votesLabel = language === 'en' ? 'votes' : language === 'ru' ? 'голосов' : 'голосів';
              return (
                <View style={styles.card}>
                  {/* Top: avatar + info */}
                  <View style={styles.cardIncoming}>
                    {item.requesterPhotoURL ? (
                      <AppPhotoImage
                        uri={item.requesterPhotoURL}
                        style={styles.avatarMedium}
                        resizeMode="cover"
                        debugLabel={`ProfileRequest:incoming:${item.requesterId}`}
                      />
                    ) : (
                      <MiniUserAvatar
                        name={item.requesterName}
                        size={56}
                        borderRadius={14}
                        backgroundColor="#6A8BA5"
                      />
                    )}

                    <View style={styles.incomingRight}>
                      {/* Name row */}
                      <View style={styles.incomingNameRow}>
                        <Text style={styles.incomingName} numberOfLines={1}>{item.requesterName}</Text>
                        <View style={styles.incomingNameSep} />
                        <Text style={styles.incomingVotesText}>{votes} {votesLabel}</Text>
                        <View style={styles.incomingDateBadge}>
                          <Text style={styles.incomingDateText}>{formatTimeShort(item.requestedAt)}</Text>
                        </View>
                      </View>

                      {/* Description box */}
                      {descriptionText ? (
                        <View style={styles.descriptionBox}>
                          <Text style={styles.descriptionText} numberOfLines={2}>{descriptionText}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Actions row */}
                  <View style={styles.incomingActionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtnOutlined}
                      onPress={() => navigation.navigate('ViewUserProfile', { userId: item.requesterId })}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color={ACCENT} />
                      <Text style={styles.actionBtnOutlinedText}>
                        {language === 'en' ? 'Profile' : language === 'ru' ? 'Профиль' : 'Профіль'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnOutlined, !phone && styles.actionBtnOutlinedDisabled]}
                      onPress={() => void handleCall(phone)}
                      disabled={!phone}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="phone-outline" size={13} color={phone ? ACCENT : '#B0A090'} />
                      <Text style={[styles.actionBtnOutlinedText, !phone && styles.actionBtnDisabledText]}>
                        {t.call}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnViber, !phone && styles.actionBtnViberDisabled]}
                      onPress={() => void handleViber(phone)}
                      disabled={!phone}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="message-text-outline" size={13} color="#fff" />
                      <Text style={styles.actionBtnViberText}>{t.viber}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtnHeart}
                      onPress={() => navigation.navigate('ViewUserProfile', { userId: item.requesterId })}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="heart-outline" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            const isOutgoing = activeTab === 'outgoing';
            const photo = isOutgoing ? item.targetPhotoURL : item.requesterPhotoURL;
            const displayName = isOutgoing
              ? (item.targetName?.trim() || item.targetUserId || 'Unknown user')
              : item.requesterName;
            const displayId = isOutgoing ? (item.targetUserId ?? '') : item.requesterId;
            const phone = item.sharedContact;
            const hasContact = item.status === 'approved' && !!phone;
            const seenKey = `${item.requesterId}_${item.targetUserId ?? ''}_${item.requestedAt}`;
            const isSeen = seenContacts[seenKey] ?? false;
            const showBlink = isOutgoing && hasContact && !isSeen;

            const outgoingStatusKey = hasContact ? 'approved_contact' : item.status;
            const outgoingStatusLabel = OUTGOING_STATUS[outgoingStatusKey]?.[language] ?? outgoingStatusKey;
            const outgoingStatusBgStyle = hasContact
              ? styles.outgoingStatusContact
              : item.status === 'approved'
                ? styles.outgoingStatusApproved
                : item.status === 'denied'
                  ? styles.outgoingStatusDenied
                  : styles.outgoingStatusPending;

            const descText: string | null = item.status === 'pending'
              ? PENDING_HINT[language]
              : (item.reason ? t.reasons[item.reason as ContactReason] : item.sourceTitle ?? null);

            const callLabel = language === 'en' ? 'Call' : language === 'ru' ? 'Позвонить' : 'Подзвонити';
            const blinkLabel = language === 'en' ? 'Contact ready!' : language === 'ru' ? 'Контакт готов!' : 'Контакт готовий!';

            return (
              <View style={[styles.card, item.status === 'denied' && styles.cardDimmed]}>
                {/* Top: avatar + info */}
                <View style={styles.cardIncoming}>
                  {photo ? (
                    <AppPhotoImage
                      uri={photo}
                      style={styles.avatarMedium}
                      resizeMode="cover"
                      debugLabel={`ProfileRequest:${isOutgoing ? 'out' : 'hist'}:${displayId}`}
                    />
                  ) : (
                    <MiniUserAvatar
                      name={displayName}
                      size={56}
                      borderRadius={14}
                      backgroundColor="#6A8BA5"
                    />
                  )}

                  <View style={styles.incomingRight}>
                    {/* Name row */}
                    <View style={styles.incomingNameRow}>
                      <Text style={styles.incomingName} numberOfLines={1}>{displayName}</Text>
                      <View style={[styles.outgoingStatusBadge, outgoingStatusBgStyle]}>
                        <Text style={styles.outgoingStatusText}>{outgoingStatusLabel}</Text>
                      </View>
                      <View style={styles.incomingDateBadge}>
                        <Text style={styles.incomingDateText}>{formatTimeShort(item.requestedAt)}</Text>
                      </View>
                    </View>

                    {/* Description / hint */}
                    {descText ? (
                      <View style={styles.descriptionBox}>
                        <Text style={[styles.descriptionText, item.status === 'pending' && styles.descriptionHint]} numberOfLines={2}>
                          {descText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Actions row */}
                <View style={styles.incomingActionsRow}>
                  <TouchableOpacity
                    style={styles.actionBtnOutlined}
                    onPress={() => navigation.navigate('ViewUserProfile', { userId: displayId })}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color={ACCENT} />
                    <Text style={styles.actionBtnOutlinedText}>
                      {language === 'en' ? 'Profile' : language === 'ru' ? 'Профиль' : 'Профіль'}
                    </Text>
                  </TouchableOpacity>

                  {showBlink ? (
                    <BlinkingPhoneBtn
                      label={blinkLabel}
                      onPress={() => {
                        void markSeen(seenKey);
                        Alert.alert(
                          language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : "Зв'язатися",
                          phone,
                          [
                            { text: callLabel, onPress: () => void handleCall(phone) },
                            { text: 'Viber',   onPress: () => void handleViber(phone) },
                            { text: language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати', style: 'cancel' },
                          ]
                        );
                      }}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.actionBtnOutlined, !phone && styles.actionBtnOutlinedDisabled]}
                        onPress={() => void handleCall(phone)}
                        disabled={!phone}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="phone-outline" size={13} color={phone ? ACCENT : '#B0A090'} />
                        <Text style={[styles.actionBtnOutlinedText, !phone && styles.actionBtnDisabledText]}>
                          {callLabel}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtnViber, !phone && styles.actionBtnViberDisabled]}
                        onPress={() => void handleViber(phone)}
                        disabled={!phone}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="message-text-outline" size={13} color="#fff" />
                        <Text style={styles.actionBtnViberText}>Viber</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  header: {
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: ACCENT,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#EFE3D3',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  tabBtnActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7A6D64',
  },
  tabBtnTextActive: {
    color: '#fff',
  },
  filtersBlock: { paddingHorizontal: 12, paddingBottom: 4, gap: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '800', color: '#6A5C54', marginRight: 2 },
  filterChip: {
    backgroundColor: '#F1E5D6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#6A5C54' },
  filterChipTextActive: { color: '#fff' },
  emptyText: { color: '#4A3D37', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyHint: { color: '#7A6D64', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  list: { padding: 14, paddingBottom: 100 },
  card: {
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    padding: 8,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTop: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  topLeft: { justifyContent: 'flex-start', paddingTop: 1 },
  avatar: { width: 26, height: 26, borderRadius: 9 },
  avatarFallback: { backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '900' },
  info: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { flex: 1, fontSize: 13, fontWeight: '800', color: '#2D2520' },
  phoneInlineAction: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#403933',
  },
  viberInlineAction: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7360F2',
  },
  phoneInlineActionDisabled: {
    opacity: 0.45,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#DDEAF0',
    color: '#3D5D87',
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPending: { backgroundColor: '#F0E8D8' },
  statusApproved: { backgroundColor: '#F5E8B8' },
  statusDenied: { backgroundColor: '#FBE1DE' },
  statusBadgeText: { fontSize: 10, fontWeight: '800', color: '#5B4D45' },
  listingAbout: { fontSize: 11, color: '#7A6D64', lineHeight: 14 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D6E3E',
  },
  phoneTextEmpty: {
    color: '#B0A090',
    fontWeight: '600',
  },
  // Incoming card — redesigned layout
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
  incomingNameSep: {
    width: 1,
    height: 12,
    backgroundColor: '#C8BAB0',
  },
  incomingVotesText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A6D64',
    flexShrink: 0,
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
    borderWidth: 1,
    borderColor: '#E0D5C8',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#FAF7F3',
  },
  descriptionText: {
    fontSize: 12,
    color: '#7A6D64',
    lineHeight: 17,
  },
  incomingActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtnOutlined: {
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
  actionBtnOutlinedDisabled: {
    opacity: 0.45,
  },
  actionBtnOutlinedText: {
    fontSize: 11,
    fontWeight: '800',
    color: ACCENT,
  },
  actionBtnDisabledText: {
    color: '#B0A090',
  },
  actionBtnViber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#7360F2',
  },
  actionBtnViberDisabled: {
    backgroundColor: '#CCBEB2',
  },
  actionBtnViberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  actionBtnHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C47F61',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto' as const,
  },
  // Outgoing / history card extras
  cardDimmed: {
    opacity: 0.65,
  },
  outgoingStatusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  outgoingStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3D4A3D',
  },
  outgoingStatusPending: {
    backgroundColor: '#F5F0E8',
    borderColor: '#E4D0AB',
  },
  outgoingStatusApproved: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A8D5B5',
  },
  outgoingStatusContact: {
    backgroundColor: '#D4EDDA',
    borderColor: '#7EC89A',
  },
  outgoingStatusDenied: {
    backgroundColor: '#EEEBE7',
    borderColor: '#D4C5B8',
  },
  descriptionHint: {
    color: '#9A8A7E',
    fontStyle: 'italic',
  },
  // Blinking phone button
  blinkPhoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#C47F61',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  blinkPhoneBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
