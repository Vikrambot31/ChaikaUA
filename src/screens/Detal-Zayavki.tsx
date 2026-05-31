import React, { useEffect, useMemo, useState } from 'react';
import MiniTabBar from '../components/MiniTabBar';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, ParamListBase, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { get, ref } from 'firebase/database';
import { database, firebaseChatAPI } from '../firebase-config';
import type { RootState } from '../redux/store';
import type { Request } from '../types/app';
import TactileIcon from '../components/TactileIcon';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { showUserError } from '../utils/userFacingErrors';
import { profilePermissionService } from '../services/profilePermissionService';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { getRequestTopicLabel } from '../data/categories';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { loadProfileRecord } from '../services/authProfileService';

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
  },
} as const;

const AVATAR_COLORS = ['#C77A5D', '#D8AF59', '#7E9D69', '#5F84B4', '#A56B55'];
const RTDB_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;
const toSafeRtdbKey = (value: string): string => (value ?? '').replace(RTDB_FORBIDDEN_KEY_CHARS, '_').trim();

const getGenderShortLabel = (gender?: string) => {
  if (gender === 'male') return 'M';
  if (gender === 'female') return 'F';
  return '';
};

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
  const { request } = route.params;
  const [deleting, setDeleting] = useState(false);
  const [accessStatus, setAccessStatus] = useState<'pending' | 'approved' | 'denied' | null>(null);
  const [sendingConnect, setSendingConnect] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAge, setProfileAge] = useState<number | undefined>();
  const [profileGender, setProfileGender] = useState('');
  const [requestLikes, setRequestLikes] = useState(0);
  const avatarByUserId = useUserAvatarMap([request.userId]);
  const resolvedAvatarUri = (request.userId && avatarByUserId[request.userId]) || pickUserAvatarUri({ userPhotoURL: request.userPhotoURL, startAvatarKey: request.startAvatarKey }) || pickUserAvatarUri(request);
  const displayName = profileName || request.name || text.fallbackName;
  const ageGenderLabel = [
    typeof profileAge === 'number' ? String(profileAge) : '',
    getGenderShortLabel(profileGender),
  ].filter(Boolean).join(' / ');

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
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
        return;
      }
      const access = await profilePermissionService.checkAccess(request.userId, currentUser.id);
      setAccessStatus(access);
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
    let cancelled = false;

    const loadRequestLikes = async () => {
      if (!request.id) {
        setRequestLikes(0);
        return;
      }

      try {
        const likesSnap = await get(ref(database, `feed_likes/requests/${toSafeRtdbKey(request.id)}`));
        const likesValue = likesSnap.val();
        if (!cancelled) {
          setRequestLikes(likesValue && typeof likesValue === 'object' ? Object.keys(likesValue).length : 0);
        }
      } catch {
        if (!cancelled) setRequestLikes(0);
      }
    };

    void loadRequestLikes();
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const handleConnect = async () => {
    if (!currentUser?.id || !request.userId || currentUser.id === request.userId) {
      Alert.alert(text.connectCant, text.connectCant);
      return;
    }

    setSendingConnect(true);
    try {
      const result = await profilePermissionService.requestView(
        request.userId,
        {
          id: currentUser.id,
          name: currentUser.name || text.fallbackName,
          photoURL: currentUser.photoURL,
        },
        'help',
        {
          name: displayName,
          photoURL: resolvedAvatarUri,
        },
      );

      if (result === 'already_approved') {
        setAccessStatus('approved');
        return;
      }
      if (result === 'already_pending') {
        setAccessStatus('pending');
        return;
      }

      setAccessStatus('pending');
      Alert.alert(text.connectSentTitle, text.connectSentBody);
    } catch {
      Alert.alert(text.connectCant, text.connectCant);
    } finally {
      setSendingConnect(false);
    }
  };

  const handleCopyPhone = () => Alert.alert(text.numberTitle, request.phone);

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
          <View style={styles.phoneRow}>
            <Text style={styles.phoneText}>{request.phone}</Text>
            <TouchableOpacity onPress={handleCopyPhone} style={styles.copyBtn}>
              <TactileIcon icon="content-copy" size={38} iconSize={16} backgroundColor={SCREEN_THEME.enamelBlueDark} tint="#F6F9FF" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.callButton, sendingConnect && styles.actionButtonDisabled]}
          onPress={() => void handleConnect()}
          disabled={sendingConnect || isOwnRequest}
        >
          {sendingConnect ? (
            <ActivityIndicator color="#FFF9EE" />
          ) : (
            <>
              <TactileIcon icon="account-arrow-right-outline" size={42} iconSize={18} backgroundColor="#4F7A3D" tint="#F5FBEF" />
              <Text style={styles.callButtonText}>{text.connect}</Text>
            </>
          )}
        </TouchableOpacity>

        {!isOwnRequest && accessStatus ? (
          <Text style={styles.connectStatusText}>
            {accessStatus === 'approved' ? text.connectApproved : accessStatus === 'pending' ? text.connectPending : text.connectDenied}
          </Text>
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
  phoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phoneText: { fontSize: 18, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  copyBtn: { padding: 4 },
  callButton: { backgroundColor: SCREEN_THEME.woodGreen, borderRadius: 20, minHeight: 58, borderWidth: 1, borderColor: SCREEN_THEME.woodGreenDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  callButtonText: { color: '#FFF9EE', fontSize: 16, fontWeight: '900' },
  actionButtonDisabled: { opacity: 0.7 },
  connectStatusText: { marginBottom: 10, textAlign: 'center', color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
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
  backButton: { alignItems: 'center', paddingVertical: 12 },
  backButtonText: { color: SCREEN_THEME.textSecondary, fontSize: 14, fontWeight: '800' },
});

export default RequestDetailScreen;
