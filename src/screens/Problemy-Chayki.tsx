import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ref, onValue, query, orderByChild, equalTo, runTransaction, get, limitToLast } from 'firebase/database';
import { database } from '../firebase-core';

import { NavigationProp, useNavigation } from '@react-navigation/native';
import MiniTabBar from '../components/MiniTabBar';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import { sanitizeStoredText } from '../utils/textUtils';
import { firebaseChatAPI } from '../firebase-config';
import { showUserError } from '../utils/userFacingErrors';
import { BUILDINGS } from '../data/buildings';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { pickUserAvatarUri } from '../utils/userAvatar';
import AppPhotoImage from '../components/AppPhotoImage';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';

type Problem = {
  id: string;
  title: string;
  category: string;
  userId?: string;
  name?: string;
  phone?: string;
  age?: string;
  street?: string;
  house?: string;
  avatarUri?: string;
  photoUri?: string;
  photoStoragePath?: string;
  votes: number;
  hasVoted: boolean;
};

type RawProblem = Omit<Problem, 'votes' | 'hasVoted'> & {
  createdAtMs: number | null;
};

const FIREBASE_PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

const decodePushIdTimestamp = (id: string): number | null => {
  if (id.length < 8) return null;
  let timestamp = 0;
  for (let i = 0; i < 8; i += 1) {
    const index = FIREBASE_PUSH_CHARS.indexOf(id[i]);
    if (index < 0) return null;
    timestamp = (timestamp * 64) + index;
  }
  return Number.isFinite(timestamp) ? timestamp : null;
};

const toTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && value.trim() !== '') {
      return asNumber > 1e12 ? asNumber : asNumber * 1000;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const mapToDetailData = (item: Problem): DetailItemData => ({
  id: item.id,
  title: item.title,
  phone: item.phone,
  photoUri: item.photoUri,
  photoStoragePath: item.photoStoragePath,
  address: [item.street, item.house].filter(Boolean).join(', '),
  votesCount: item.votes,
  hasVoted: item.hasVoted,
  category: item.category,
  userId: item.userId,
  sourceType: 'help',
  sourceId: item.id,
});

const CLEAN_PROBLEMS_TEXT = {
  ua: {
    all: 'Усі',
    yard: 'Двір',
    cleaning: 'Прибирання',
    infrastructure: 'Інфраструктура',
    electricity: 'Електрика',
    safety: 'Безпека',
    error: 'Помилка',
    fillTitle: 'Вкажіть назву проблеми',
    sentTitle: 'Надіслано',
    sent: 'Проблему надіслано на модерацію. Після схвалення вона зʼявиться в активності та чаті заявок.',
    headerTitle: 'Проблеми Чайки',
    headerSubtitle: 'Повідомляйте про проблеми та підтримуйте важливі питання голосами',
    formTitle: 'Нова проблема',
    titlePlaceholder: 'Назва проблеми',
    addPhoto: 'Додати фото',
    selectedPhoto: 'Обране фото',
    add: 'Додати',
    addRequest: 'Додати заявку',
    votes: 'голосів',
    emptyTitle: 'Проблем немає',
    emptySubtitle: 'У Чайці все спокійно',
    street: 'Вулиця',
    building: 'Будинок',
    today: 'Сьогодні',
    last7Days: 'За 7 днів',
    profile: 'Профіль',
    call: 'Подзвонити',
  },
  ru: {
    all: 'Все',
    yard: 'Двор',
    cleaning: 'Уборка',
    infrastructure: 'Инфраструктура',
    electricity: 'Электрика',
    safety: 'Безопасность',
    error: 'Ошибка',
    fillTitle: 'Укажите название проблемы',
    sentTitle: 'Отправлено',
    sent: 'Проблема отправлена на модерацию. После одобрения она появится в активности и чате заявок.',
    headerTitle: 'Проблемы Чайки',
    headerSubtitle: 'Сообщайте о проблемах и поддерживайте важные вопросы голосами',
    formTitle: 'Новая проблема',
    titlePlaceholder: 'Название проблемы',
    addPhoto: 'Добавить фото',
    selectedPhoto: 'Выбранное фото',
    add: 'Добавить',
    addRequest: 'Добавить заявку',
    votes: 'голосов',
    emptyTitle: 'Проблем нет',
    emptySubtitle: 'В Чайке все спокойно',
    street: 'Улица',
    building: 'Дом',
    today: 'Сегодня',
    last7Days: 'За 7 дней',
    profile: 'Профиль',
    call: 'Позвонить',
  },
  en: {
    all: 'All',
    yard: 'Yard',
    cleaning: 'Cleaning',
    infrastructure: 'Infrastructure',
    electricity: 'Electricity',
    safety: 'Safety',
    error: 'Error',
    fillTitle: 'Enter the problem title',
    sentTitle: 'Sent',
    sent: 'The problem was sent for moderation. After approval it will appear in activity and request chat.',
    headerTitle: 'Chaika Life Problems',
    headerSubtitle: 'Report issues and support the most important local concerns with votes',
    formTitle: 'New problem',
    titlePlaceholder: 'Problem title',
    addPhoto: 'Add photo',
    selectedPhoto: 'Selected photo',
    add: 'Add',
    addRequest: 'Add request',
    votes: 'votes',
    emptyTitle: 'No problems',
    emptySubtitle: 'Everything is calm in Chaika Life',
    street: 'Street',
    building: 'Building',
    today: 'Today',
    last7Days: 'Last 7 days',
    profile: 'Profile',
    call: 'Call',
  },
} as const;

// Lookup: any language's category label to canonical index (0-4)
const CATEGORY_LOOKUP = new Map<string, number>();
(['ua', 'ru', 'en'] as const).forEach((lang) => {
  const t = CLEAN_PROBLEMS_TEXT[lang];
  [t.yard, t.cleaning, t.infrastructure, t.electricity, t.safety].forEach((label, idx) => {
    CATEGORY_LOOKUP.set(label.toLowerCase(), idx);
  });
});
const normalizeCategory = (v: string): number =>
  CATEGORY_LOOKUP.get(v.toLowerCase()) ?? -1;

const toClean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const parseStreetOnly = (building: unknown): string => {
  const clean = toClean(building);
  if (!clean) return '';
  const [streetName] = clean.split(',');
  return streetName?.trim() || '';
};

const parseHouseOnly = (building: unknown): string => {
  const clean = toClean(building);
  if (!clean) return '';
  const [, ...houseParts] = clean.split(',');
  return houseParts.join(',').trim();
};

const parseAge = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const raw = toClean(value);
  if (!raw) return '';
  const digits = raw.match(/\d{1,3}/u);
  return digits?.[0] ?? '';
};

export default function ChaikaProblemsScreen() {
const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = CLEAN_PROBLEMS_TEXT[language];
  const streetLabel = text.street;
  const houseLabel = text.building;
  const categories = useMemo(
    () => [text.all, text.yard, text.cleaning, text.infrastructure, text.electricity, text.safety],
    [text]
  );
  const formCategories = useMemo(
    () => [text.yard, text.cleaning, text.infrastructure, text.electricity, text.safety],
    [text]
  );
  const streets = useMemo(
    () => Array.from(new Set(BUILDINGS.map((item) => item.street))),
    []
  );

  const [rawItems, setRawItems] = useState<RawProblem[]>([]);
  const [profileByUserId, setProfileByUserId] = useState<Record<string, { name?: string; phone?: string; age?: string; avatarUri?: string }>>({});
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const [voterMap, setVoterMap] = useState<Record<string, Record<string, true>>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(text.all);
  const [category, setCategory] = useState<string>(text.yard);
  const [street, setStreet] = useState<string>(streets[0] || '');
  const houses = useMemo(
    () => BUILDINGS.filter((item) => item.street === street).map((item) => item.houseNumber),
    [street]
  );
  const [house, setHouse] = useState<string>('');
  const [title, setTitle] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [isPublishFormVisible, setIsPublishFormVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [votingBusyId, setVotingBusyId] = useState<string | null>(null);
  const profileActionLabel = text.profile;
  const callActionLabel = text.call;

  useEffect(() => {
    setFilter(text.all);
    setCategory(text.yard);
  }, [language, text.all, text.yard]);

  useEffect(() => {
    if (houses.length === 0) {
      setHouse('');
      return;
    }
    if (!houses.includes(house)) {
      setHouse(houses[0]);
    }
  }, [house, houses]);

  // Subscribe to approved problems from Firebase
  useEffect(() => {
    const db = database;
    const requestsRef = query(ref(db, 'requests'), orderByChild('category'), equalTo('problem'), limitToLast(360));
    const unsub = onValue(
      requestsRef,
      (snapshot) => {
        setLoading(false);
        const raw = snapshot.val() as Record<string, any> | null;
        if (!raw) { setRawItems([]); return; }
        const problems = Object.entries(raw)
          .filter(([, v]) => v.status === 'approved')
          .map(([id, v]) => ({
            id,
            title: sanitizeStoredText(
              (typeof v.text === 'string' ? v.text : typeof v.description === 'string' ? v.description : '')
                .replace(/^\[[^\]]+\]\s*/u, '')
                .split('\n')[0]
                .trim()
            ),
            category: typeof v.subcategory === 'string' ? v.subcategory : '',
            userId: toClean(v.userId),
            name: toClean(v.name),
            phone: toClean(v.phone),
            age: parseAge(v.age),
            street: parseStreetOnly(v.building),
            house: parseHouseOnly(v.building),
            avatarUri: pickUserAvatarUri(v),
            photoUri: toClean(v.photoUri),
            photoStoragePath: toClean(v.photoStoragePath),
            createdAtMs:
              toTimestampMs(v.createdAt)
              ?? toTimestampMs(v.created_at)
              ?? toTimestampMs(v.timestamp)
              ?? toTimestampMs(v.date)
              ?? decodePushIdTimestamp(id),
          }))
          .filter((p) => p.title.length > 0)
          .sort((a, b) => b.id.localeCompare(a.id));
        setRawItems(problems);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    const ids = Array.from(
      new Set(rawItems.map((item) => toClean(item.userId)).filter((id) => id.length > 0)),
    ).filter((id) => !profileByUserId[id]);

    if (ids.length === 0) return;

    const db = database;
    let isMounted = true;

    void Promise.all(
      ids.map(async (uid) => {
        try {
          const snap = await get(ref(db, `users/${uid}`));
          const data = snap.val() as Record<string, unknown> | null;
          if (!data) return [uid, {}] as const;
          return [uid, {
            name: toClean(data.name),
            phone: toClean(data.phone),
            age: parseAge(data.age),
            avatarUri: pickUserAvatarUri(data),
          }] as const;
        } catch {
          return [uid, {}] as const;
        }
      }),
    ).then((resolved) => {
      if (!isMounted) return;
      const next: Record<string, { name?: string; age?: string; avatarUri?: string }> = {};
      resolved.forEach(([uid, profile]) => {
        next[uid] = profile;
      });
      setProfileByUserId((prev) => ({ ...prev, ...next }));
    });

    return () => {
      isMounted = false;
    };
  }, [profileByUserId, rawItems]);

  // Subscribe to votes
  useEffect(() => {
    const db = database;
    const votesRef = ref(db, 'problem_votes');
    const unsub = onValue(votesRef, (snapshot) => {
      const raw = snapshot.val() as Record<string, Record<string, true>> | null;
      setVoterMap(raw ?? {});
    });
    return unsub;
  }, []);

  const items = useMemo<Problem[]>(
    () => rawItems.map((item) => {
      const profile = item.userId ? profileByUserId[item.userId] : undefined;
      return {
        ...item,
        name: item.name || profile?.name || '',
        phone: item.phone || profile?.phone || '',
        age: item.age || profile?.age || '',
        avatarUri: item.avatarUri || profile?.avatarUri || '',
        votes: Object.keys(voterMap[item.id] ?? {}).length,
        hasVoted: !!(user?.id && voterMap[item.id]?.[user.id]),
      };
    }),
    [profileByUserId, rawItems, voterMap, user?.id]
  );

  const visible = useMemo(
    () => items.filter((item) => {
      if (filter === text.all) return true;
      const fi = normalizeCategory(filter);
      const ii = normalizeCategory(item.category);
      if (fi !== -1 && ii !== -1) return fi === ii;
      return item.category === filter;
    }),
    [filter, items, text.all]
  );

  const counters = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysStart = todayStart - (6 * 24 * 60 * 60 * 1000);
    let today = 0;
    let last7Days = 0;
    for (const item of rawItems) {
      if (!item.createdAtMs) continue;
      if (item.createdAtMs >= todayStart) today += 1;
      if (item.createdAtMs >= sevenDaysStart) last7Days += 1;
    }
    return { today, last7Days };
  }, [rawItems]);

  const todayLabel = text.today;
  const weekLabel = text.last7Days;

  const addProblem = async () => {
    const cleanTitle = sanitizeStoredText(title.trim());
    if (!cleanTitle) {
      Alert.alert(text.error, text.fillTitle);
      return;
    }
    if (!user?.id) {
      showUserError(language, 'auth', 'Authentication required');
      return;
    }

    setSubmitting(true);
    try {
    const resolvedPhotoUri = formPhotos[0]?.downloadUrl ?? '';
    const resolvedStoragePath = formPhotos[0]?.storagePath ?? '';

    const result = await firebaseChatAPI.addRequest({
      name: user.name || user.email || '',
      phone: user.phone || '',
      category: 'problem',
      group: 'problems',
      subcategory: category,
      building: `${street}, ${house}`,
      text: `[Problems] ${cleanTitle}`,
      description: `[Problems] ${cleanTitle}` + `\nAddress: ${street}, ${house}`,
      photoUri: resolvedPhotoUri,
      ...(resolvedStoragePath && /^requests\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|heic|heif)$/i.test(resolvedStoragePath)
        ? { photoStoragePath: resolvedStoragePath }
        : {}),
    });
    if (!result.success) {
      showUserError(language, 'send', result.error);
      return;
    }
    setTitle('');
    setFormPhotos([]);
    setIsPublishFormVisible(false);
    Alert.alert(text.sentTitle, text.sent);
    } finally {
      setSubmitting(false);
    }
  };

  const upvote = async (id: string) => {
    if (!user?.id || votingBusyId) return;
    setVotingBusyId(id);
    const db = database;
    const voteRef = ref(db, `problem_votes/${id}/${user.id}`);
    try {
      await runTransaction(voteRef, (current: boolean | null) => {
        if (current === true) return null;
        return true;
      });
    } catch {
      // ignore
    } finally {
      setVotingBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.headerTitle}</Text>
          <Text style={styles.headerSubtitle}>{text.headerSubtitle}</Text>
          <View style={styles.counterRow}>
            <View style={styles.counterItem}>
              <Text style={styles.counterValue}>{counters.today}</Text>
              <Text style={styles.counterLabel}>{todayLabel}</Text>
            </View>
            <View style={styles.counterItem}>
              <Text style={styles.counterValue}>{counters.last7Days}</Text>
              <Text style={styles.counterLabel}>{weekLabel}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.publishToggleBtn}
          onPress={() => setIsPublishFormVisible(true)}
          activeOpacity={0.86}
        >
          <Text style={styles.publishToggleBtnText}>{text.addRequest}</Text>
        </TouchableOpacity>

        {isPublishFormVisible ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{text.formTitle}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={text.titlePlaceholder}
              placeholderTextColor="#9A8F80"
              style={styles.input}
              maxLength={120}
            />
            <Text style={styles.fieldLabel}>{streetLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={street} onValueChange={setStreet} style={styles.picker}>
                {streets.map((item) => (
                  <Picker.Item key={item} label={item} value={item} />
                ))}
              </Picker>
            </View>
            <Text style={styles.fieldLabel}>{houseLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={house} onValueChange={setHouse} style={styles.picker}>
                {houses.map((item) => (
                  <Picker.Item key={item} label={item} value={item} />
                ))}
              </Picker>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {formCategories.map((currentCategory) => (
                <TouchableOpacity
                  key={currentCategory}
                  style={[styles.filter, category === currentCategory && styles.filterActive]}
                  onPress={() => setCategory(currentCategory)}
                >
                  <Text style={[styles.filterText, category === currentCategory && styles.filterTextActive]}>
                    {currentCategory}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <PhotoUploadField
              uid={user?.id ?? ''}
              userName={user?.name ?? ''}
              maxPhotos={3}
              storagePath="requests"
              onPhotosChange={(photos) => setFormPhotos(photos.filter((p) => p.status === 'done'))}
            />
            <TouchableOpacity style={[styles.addBtn, submitting && { opacity: 0.7 }]} onPress={addProblem} disabled={submitting} activeOpacity={0.85}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>{text.add}</Text>}
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {categories.map((currentCategory) => (
            <TouchableOpacity
              key={currentCategory}
              style={[styles.filter, filter === currentCategory && styles.filterActive]}
              onPress={() => setFilter(currentCategory)}
            >
              <Text style={[styles.filterText, filter === currentCategory && styles.filterTextActive]}>
                {currentCategory}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={SCREEN_THEME.terracotta} size="large" />
          </View>
        ) : visible.length > 0 ? (
          visible.map((problem) => (
            <TouchableOpacity
              key={problem.id}
              style={styles.item}
              onPress={() => navigation.navigate('ItemDetailScreen', { item: mapToDetailData(problem) })}
              activeOpacity={0.86}
            >
              <View style={styles.topRow}>
                <View style={styles.visualWrap}>
                  {problem.photoUri || problem.photoStoragePath ? (
                    <AppPhotoImage
                      uri={problem.photoUri}
                      storagePath={problem.photoStoragePath}
                      style={styles.cardPhoto}
                      resizeMode="cover"
                      debugLabel={`ProblemsCard:${problem.id}`}
                      showDebugInfo={false}
                    />
                  ) : (
                    <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                      <MaterialCommunityIcons name="image-off-outline" size={26} color="#B8A888" />
                    </View>
                  )}
                </View>

                <View style={styles.copy}>
                  <View style={styles.itemTitleBox}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{problem.title}</Text>
                  </View>

                  <View style={styles.addressRow}>
                    {!!problem.street && <Text style={styles.addressStreet} numberOfLines={1}>{problem.street}</Text>}
                    {!!problem.house && (
                      <View style={styles.houseBadge}>
                        <Text style={styles.houseBadgeText} numberOfLines={1}>{problem.house}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.personMetaRow}>
                    <Text style={styles.personMetaText} numberOfLines={1}>{problem.category} - {problem.votes} {text.votes}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.bottomActionsRow}>
                <View style={styles.leftBottomArea}>
                  <MiniUserAvatar uri={problem.avatarUri || ''} name={problem.name || ''} size={42} borderRadius={14} backgroundColor="#6A8BA5" />
                  <TouchableOpacity
                    style={[styles.actionPill, !problem.userId && styles.actionPillDisabled]}
                    onPress={(e) => { e.stopPropagation(); if (problem.userId) navigation.navigate('ViewUserProfile', { userId: problem.userId }); }}
                    disabled={!problem.userId}
                    activeOpacity={problem.userId ? 0.78 : 1}
                  >
                    <MaterialCommunityIcons name="badge-account-horizontal-outline" size={15} color="#7A1E5C" />
                    <Text style={styles.actionPillText} numberOfLines={1}>{profileActionLabel}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.rightBottomArea}>
                  <TouchableOpacity
                    style={[styles.actionPill, !problem.phone && styles.actionPillDisabled]}
                    onPress={(e) => { e.stopPropagation(); void safeCallPhone(problem.phone, language); }}
                    disabled={!problem.phone}
                    activeOpacity={problem.phone ? 0.78 : 1}
                  >
                    <MaterialCommunityIcons name="phone-outline" size={15} color="#7A1E5C" />
                    <Text style={styles.actionPillText} numberOfLines={1}>{callActionLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionPill, styles.viberPill, !problem.phone && styles.actionPillDisabled]}
                    onPress={(e) => { e.stopPropagation(); void safeOpenViber(problem.phone, language); }}
                    disabled={!problem.phone}
                    activeOpacity={problem.phone ? 0.78 : 1}
                  >
                    <MaterialCommunityIcons name="message-text-outline" size={15} color="#FFFFFF" />
                    <Text style={[styles.actionPillText, styles.viberPillText]} numberOfLines={1}>Viber</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteBtn, problem.hasVoted && styles.voteBtnVoted, (!user?.id || votingBusyId === problem.id) && styles.voteBtnDisabled]}
                    onPress={(e) => { e.stopPropagation(); void upvote(problem.id); }}
                    disabled={!user?.id || votingBusyId === problem.id}
                    activeOpacity={user?.id && votingBusyId !== problem.id ? 0.75 : 1}
                  >
                    {votingBusyId === problem.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name={problem.hasVoted ? 'heart' : 'heart-outline'} size={18} color="#FFFFFF" />
                        <Text style={styles.voteCount}>{problem.votes}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <TactileIcon icon="checkbox-marked-circle-outline" size={54} iconSize={26} backgroundColor="#403933" />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptySub}>{text.emptySubtitle}</Text>
          </View>
        )}
      </ScrollView>
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 32 },
  headerCard: {
    marginBottom: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  counterRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  counterItem: {
    flex: 1,
    backgroundColor: '#F3ECE4',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  counterValue: {
    color: SCREEN_THEME.terracottaDark,
    fontSize: 22,
    fontWeight: '900',
  },
  counterLabel: {
    marginTop: 2,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  publishToggleBtn: {
    backgroundColor: SCREEN_THEME.terracottaDark,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  publishToggleBtnText: { color: '#FFFFFF', fontWeight: '800' },
  formCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#1E1A17',
  },
  formTitle: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginBottom: 8 },
  fieldLabel: { marginTop: 10, marginBottom: 4, color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700' },
  input: {
    backgroundColor: '#F3ECE4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
  },
  pickerWrapper: {
    backgroundColor: '#F3ECE4',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1E1A17',
    overflow: 'hidden',
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  filters: { gap: 8, paddingVertical: 10 },
  filter: { borderRadius: 999, backgroundColor: '#F3ECE4', paddingHorizontal: 12, paddingVertical: 8 },
  filterActive: { backgroundColor: SCREEN_THEME.terracotta },
  filterText: { color: SCREEN_THEME.terracottaDark, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#FFFFFF' },
  addBtn: {
    marginTop: 8,
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoBtn: {
    marginTop: 4,
    backgroundColor: '#8C6A46',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoBtnText: { color: '#FFFFFF', fontWeight: '800' },
  selectedPhotoWrap: { marginTop: 10, marginBottom: 2 },
  selectedPhotoLabel: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  selectedPhotoThumb: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: '#FFF8EA' },
  addBtnText: { color: '#FFFFFF', fontWeight: '800' },
   item: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
  },
  visualWrap: {
    position: 'relative',
    width: '40%',
    minWidth: 118,
    maxWidth: 132,
    flexShrink: 0,
  },
  cardPhotoPlaceholder: {
    backgroundColor: '#F0E8D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
  },
  copy: { flex: 1, minWidth: 0 },
  itemTitleBox: {
    borderWidth: 1.5,
    borderColor: '#1E1A17',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#FFF8EA',
    minHeight: 52,
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  addressRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 22,
  },
  addressStreet: {
    color: '#4E4237',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  houseBadge: {
    backgroundColor: '#F7EBD5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: 46,
  },
  houseBadgeText: { color: '#4E4237', fontSize: 11, fontWeight: '900' },
  personMetaRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center' },
  personMetaText: { color: '#77695A', fontSize: 12, fontWeight: '800' },
  itemMeta: { marginTop: 2, color: SCREEN_THEME.textSecondary, fontSize: 12 },
  bottomActionsRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  leftBottomArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  rightBottomArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  personName: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  actionPill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D4B9A8',
    backgroundColor: '#FFF8EA',
    flexShrink: 1,
  },
  viberPill: {
    backgroundColor: '#7360F2',
    borderColor: '#7360F2',
  },
  actionPillDisabled: {
    opacity: 0.45,
  },
  actionPillText: {
    color: '#7A1E5C',
    fontSize: 11,
    fontWeight: '900',
    flexShrink: 1,
  },
  viberPillText: { color: '#FFFFFF' },
  voteBtn: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#24201D',
    borderRadius: 16,
    width: 54,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voteBtnVoted: {
    backgroundColor: '#8C7B6B',
  },
  voteBtnDisabled: {
    opacity: 0.5,
  },
  voteCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginTop: 14 },
  emptySub: { color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'center' },
});






