import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GuestRegisterBanner from '../components/GuestRegisterBanner';
import { useGuestGuard } from '../hooks/useGuestGuard';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { increment, onValue, ref, update } from 'firebase/database';
import { useSelector } from 'react-redux';

import AppPhotoImage from '../components/AppPhotoImage';
import MiniTabBar from '../components/MiniTabBar';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { logClientError } from '../utils/errorLogger';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';
import { getUserCommunityPhotosForMonth, COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT } from '../utils/communityPhotoLimits';
import { useAppTheme } from '../hooks/useAppTheme';

const SCREEN_ID = 'SoulPhotosScreen';
const STORAGE_PATH = 'community_photos';
const SOUL_PHOTO_DRAFT_KEY = '@chaika:soul_photo_draft';
const MAX_ITEMS = 60;
const NUM_COLUMNS = 3;
const GRID_GAP = 7;

type Lang = 'ua' | 'ru' | 'en';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
type CategoryId = 'style' | 'cars' | 'places' | 'animals' | 'unusual';
type TabId = 'all' | CategoryId;

type CategoryDef = {
  id: CategoryId;
  icon: string;
  ua: string;
  ru: string;
  en: string;
};

const CATEGORIES: CategoryDef[] = [
  { id: 'style',   icon: 'tshirt-crew-outline',   ua: 'Люди на стилі',         ru: 'Люди на стиле',          en: 'People in Style' },
  { id: 'cars',    icon: 'car-outline',            ua: 'Авто Чайки',            ru: 'Авто Чайки',             en: 'Chaika Cars' },
  { id: 'places',  icon: 'image-outline',          ua: 'Люди і красиві місця',  ru: 'Люди и красивые места',  en: 'People & Places' },
  { id: 'animals', icon: 'paw-outline',            ua: 'Тварини Чайки',         ru: 'Животные Чайки',         en: 'Chaika Animals' },
  { id: 'unusual', icon: 'star-shooting-outline',  ua: 'Незвичайне на Чайці',   ru: 'Необычное на Чайке',     en: 'Unusual on Chaika' },
];

const getCategoryLabel = (cat: CategoryDef, lang: Lang): string => cat[lang];

// ---------------------------------------------------------------------------
// UI text
// ---------------------------------------------------------------------------
const UI_TEXT = {
  ua: {
    title: 'Фото для душі',
    approvedNote: 'Схвалені модератором фото',
    pending: 'на модерації',
    awaitConfirm: 'чекаю відправки',
    choose: 'Вибрати фото',
    send: 'Відправити на модерацію',
    sending: 'Фото вже на модерації',
    upload: (p: number) => `завантаження ${p}%`,
    descTitle: 'Опис фото',
    descPlaceholder: 'Опис до 5 слів',
    addressPlaceholder: 'Адреса місця',
    login: 'Увійдіть, щоб додати фото',
    empty: 'Поки немає фото в цій категорії',
    loadError: 'Не вдалося завантажити фото',
    uploadError: 'Не вдалося завантажити фото. Спробуйте ще раз.',
    tabAll: 'Всі',
    categoryLabel: 'Категорія',
    categoryRequired: 'Спочатку оберіть категорію вище \u2191',
    submitBtn: 'Відправити на модерацію',
    submitting: 'Надсилаємо...',
    uploadingLabel: 'Фото завантажується...',
    approved: 'схвалено',
    limitUsed: (used: number, limit: number) => `Використано ${used} з ${limit} фото цього місяця`,
    limitExhausted: (limit: number) => `Ліміт вичерпано: ${limit}/${limit} фото цього місяця`,
    swipeBtn: 'Листати',
    swipeBack: '← Фото',
    swipeDoneTitle: 'Усі фото переглянуто',
    swipeDoneSub: (n: number) => `Вподобано: ${n}`,
    swipeRestart: 'Почати знову',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛІ →',
  },
  ru: {
    title: 'Фото для Души',
    approvedNote: 'Одобренные модератором фото',
    pending: 'на модерации',
    awaitConfirm: 'ждёт отправки',
    choose: 'Выбрать фото',
    send: 'Отправить на модерацию',
    sending: 'Фото уже на модерации',
    upload: (p: number) => `загрузка ${p}%`,
    descTitle: 'Описание фото',
    descPlaceholder: 'Описание до 5 слов',
    addressPlaceholder: 'Адрес места',
    login: 'Войдите, чтобы добавить фото',
    empty: 'Пока нет фото в этой категории',
    loadError: 'Не удалось загрузить фото',
    uploadError: 'Не удалось загрузить фото. Попробуйте ещё раз.',
    tabAll: 'Все',
    categoryLabel: 'Категория',
    categoryRequired: 'Сначала выберите категорию выше \u2191',
    submitBtn: 'Отправить на модерацию',
    submitting: 'Отправляем...',
    uploadingLabel: 'Фото загружается...',
    approved: 'одобрено',
    limitUsed: (used: number, limit: number) => `Использовано ${used} из ${limit} фото в этом месяце`,
    limitExhausted: (limit: number) => `Лимит исчерпан: ${limit}/${limit} фото в этом месяце`,
    swipeBtn: 'Листать',
    swipeBack: '← Фото',
    swipeDoneTitle: 'Все фото просмотрены',
    swipeDoneSub: (n: number) => `Понравилось: ${n}`,
    swipeRestart: 'Начать снова',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛЬШЕ →',
  },
  en: {
    title: 'Photos for the Soul',
    approvedNote: 'Photos approved by moderators',
    pending: 'in moderation',
    awaitConfirm: 'awaiting submission',
    choose: 'Choose photo',
    send: 'Submit for moderation',
    sending: 'Photo is in moderation',
    upload: (p: number) => `uploading ${p}%`,
    descTitle: 'Photo description',
    descPlaceholder: 'Up to 5 words',
    addressPlaceholder: 'Place address',
    login: 'Sign in to add a photo',
    empty: 'No photos in this category yet',
    loadError: 'Could not load photos',
    uploadError: 'Failed to upload photo. Please try again.',
    tabAll: 'All',
    categoryLabel: 'Category',
    categoryRequired: 'First choose a category above \u2191',
    submitBtn: 'Submit for moderation',
    submitting: 'Submitting...',
    uploadingLabel: 'Photo is uploading...',
    approved: 'approved',
    limitUsed: (used: number, limit: number) => `Used ${used} of ${limit} photos this month`,
    limitExhausted: (limit: number) => `Limit reached: ${limit}/${limit} photos this month`,
    swipeBtn: 'Swipe',
    swipeBack: '← Photos',
    swipeDoneTitle: 'All photos viewed',
    swipeDoneSub: (n: number) => `Liked: ${n}`,
    swipeRestart: 'Start again',
    swipeLikeLabel: 'LIKE ♥',
    swipePassLabel: 'NEXT →',
  },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending' | 'saved';
  category?: CategoryId;
  local?: boolean;
  uploading?: boolean;
  progress?: number;
  description?: string;
  author?: string;
  likes?: number;
};

type RawPhoto = {
  imageUri?: unknown;
  thumbnailUrl?: unknown;
  storagePath?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
  sourceScreen?: unknown;
  uid?: unknown;
  userId?: unknown;
  description?: unknown;
  uploadedBy?: unknown;
  likes?: unknown;
  category?: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const timestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const clampProgress = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};


const isValidCategoryId = (val: string): val is CategoryId =>
  CATEGORIES.some((c) => c.id === val);

// ---------------------------------------------------------------------------
// SoulTile
// ---------------------------------------------------------------------------
const SoulTile = memo(function SoulTile({
  item,
  size,
  pendingLabel,
  approvedLabel,
  uploadLabel,
}: {
  item: SoulPhoto;
  size: number;
  pendingLabel: string;
  approvedLabel: string;
  uploadLabel: (p: number) => string;
}) {
  const progress = clampProgress(item.progress ?? (item.uploading ? 0 : 100));
  const isApproved = item.status === 'approved';
  const isSaved = item.status === 'saved';
  const showLabel = (item.status === 'pending' || isSaved || isApproved) && !item.uploading;

  return (
    <View style={[styles.tile, isApproved ? styles.approvedTile : (isSaved ? styles.savedTile : styles.pendingTile), { width: size, height: size }]}>
      {item.uri ? (
        <AppPhotoImage
          uri={item.uri}
          storagePath={item.storagePath}
          style={styles.tileImage}
          resizeMode="cover"
          debugLabel={`SoulPhoto:${item.id}`}
          showDebugInfo={false}
        />
      ) : (
        <View style={styles.grayExample} />
      )}

      {item.uploading ? (
        <View style={styles.uploadLayer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(7, progress)}%` }]} />
          </View>
          <Text style={styles.progressText}>{uploadLabel(progress)}</Text>
        </View>
      ) : null}

      {showLabel ? (
        <View style={[styles.pendingLabel, isApproved && styles.approvedLabel]}>
          <Text style={[styles.pendingText, isApproved && styles.approvedText]}>
            {isApproved ? approvedLabel : pendingLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SoulPhotosScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const { bannerVisible: guestBannerVisible, hideBanner: hideGuestBanner, guard: guestGuard } = useGuestGuard();
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const { colors, isDark } = useAppTheme();
  const [remotePhotos, setRemotePhotos] = useState<SoulPhoto[]>([]);
  const [pickedPhotos, setPickedPhotos] = useState<Record<string, UploadedPhoto>>({});
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<SoulPhoto | null>(null);

  // Active tab for gallery filtering
  const [activeTab, setActiveTab] = useState<TabId>('all');
  // Category chosen for new upload
  const [uploadCategory, setUploadCategory] = useState<CategoryId | null>(null);

  // Deferred moderation: track which rtdbIds have been submitted by the user
  const [submittedRtdbIds, setSubmittedRtdbIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [monthlyUsed, setMonthlyUsed] = useState<number | null>(null);
  const [uploadFormVisible, setUploadFormVisible] = useState(false);

  // Swipe mode
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [likedPhotoIds, setLikedPhotoIds] = useState<string[]>([]);
  const everLikedRef = useRef<Set<string>>(new Set());
  const swipePosition = useRef(new Animated.ValueXY()).current;

  // Pulsing animation for the submit button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    void ensureFirebaseAuth()
      .then(() => {
        if (!active) return;
        const currentUid = user?.id ?? '';

        // Single listener on community_photos — partitions into approved + own pending/saved
        const photosRef = ref(database, 'community_photos');
        unsub = onValue(
          photosRef,
          (snapshot) => {
            try {
              const value = snapshot.val() as unknown;
              const approved: SoulPhoto[] = [];
              const pending: SoulPhoto[] = [];

              if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
                  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
                  const photo = raw as RawPhoto;
                  const sourceScreen = clean(photo.sourceScreen);
                  if (sourceScreen && sourceScreen !== SCREEN_ID) return;

                  const status = clean(photo.status);
                  const description = clean(photo.description);
                  const author = clean(photo.uploadedBy);
                  const likes = typeof photo.likes === 'number' ? photo.likes : 0;
                  const categoryRaw = clean(photo.category);
                  const category: CategoryId | undefined = isValidCategoryId(categoryRaw) ? categoryRaw : undefined;
                  const base: SoulPhoto = {
                    id,
                    uri: clean(photo.thumbnailUrl) || clean(photo.imageUri),
                    storagePath: clean(photo.storagePath),
                    createdAt: timestamp(photo.createdAt) || timestamp(photo.uploadedAt),
                    status: status === 'approved' ? 'approved' : (status === 'saved' ? 'saved' : 'pending'),
                    category,
                    ...(description ? { description } : {}),
                    ...(author ? { author } : {}),
                    likes,
                  };

                  if (status === 'approved') {
                    approved.push(base);
                  } else if ((status === 'pending' || status === 'saved') && currentUid) {
                    const owner = clean(photo.uid) || clean(photo.userId);
                    if (owner === currentUid) {
                      pending.push(base);
                    }
                  }
                });
              }

              if (!active) return;
              const combined = [...approved, ...pending]
                .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
                .slice(0, MAX_ITEMS);
              setRemotePhotos(combined);
              setLoading(false);
            } catch (error) {
              void logClientError('SoulPhotosScreen.photosListener', error);
            }
          },
          (error) => {
            void logClientError('SoulPhotosScreen.photosListenerError', error);
            if (active) setLoadError(true);
          },
        );
      })
      .catch((error) => {
        void logClientError('SoulPhotosScreen.auth', error);
        if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
      });

    return () => {
      active = false;
      unsub?.();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void getUserCommunityPhotosForMonth(user.id).then((photos) => {
      setMonthlyUsed(photos.length);
    }).catch(() => {});
  }, [user?.id]);

  // Restore draft after Android activity-kill
  useEffect(() => {
    void AsyncStorage.getItem(SOUL_PHOTO_DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw) as Partial<{
          uploadCategory: CategoryId | null;
          description: string;
          address: string;
        }>;
        if (draft.uploadCategory) setUploadCategory(draft.uploadCategory);
        if (draft.description) setDescription(draft.description);
        if (draft.address) setAddress(draft.address);
        if (draft.uploadCategory || draft.address) setUploadFormVisible(true);
      } catch { /* ignore invalid */ }
    }).catch(() => {});
  }, []);

  // Save draft when form fields change
  useEffect(() => {
    if (!uploadCategory && !description && !address) return;
    const timer = setTimeout(() => {
      const draft = { uploadCategory, description, address };
      void AsyncStorage.setItem(SOUL_PHOTO_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [uploadCategory, description, address]);

  const handlePhotosChange = useCallback((photos: UploadedPhoto[]) => {
    setPickedPhotos((current) => {
      const next = { ...current };
      for (const photo of photos) {
        if (photo.status === 'error') {
          delete next[photo.photoId];
        } else {
          next[photo.photoId] = photo;
        }
      }
      return next;
    });
  }, []);

  // Photos that finished uploading to Storage (current session)
  const donePhotos = useMemo(
    () => Object.values(pickedPhotos).filter((p) => p.status === 'done'),
    [pickedPhotos],
  );

  // Own photos from RTDB still in 'saved' status (survived remount / activity-kill)
  const savedRemotePhotos = useMemo(
    () => remotePhotos.filter((p) => p.status === 'saved' && !submittedRtdbIds.has(p.id)),
    [remotePhotos, submittedRtdbIds],
  );

  // Show upload form once user has photos in session or saved remotely
  useEffect(() => {
    if (Object.values(pickedPhotos).length > 0 || savedRemotePhotos.length > 0) {
      setUploadFormVisible(true);
    }
  }, [pickedPhotos, savedRemotePhotos]);

  // True when at least one photo (session OR RTDB) needs to be submitted
  const hasUnsubmitted = useMemo(
    () =>
      donePhotos.some((p) => p.rtdbId && !submittedRtdbIds.has(p.rtdbId)) ||
      savedRemotePhotos.length > 0,
    [donePhotos, submittedRtdbIds, savedRemotePhotos],
  );

  const isUploading = useMemo(
    () => Object.values(pickedPhotos).some((p) => p.status === 'uploading'),
    [pickedPhotos],
  );

  // Start/stop pulse when submit button becomes available
  useEffect(() => {
    if (hasUnsubmitted) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 650, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        ]),
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
      pulseAnim.setValue(1);
    }
    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [hasUnsubmitted, pulseAnim]);

  // Submit the uploaded photos to moderation queue
  const submitToModeration = useCallback(async () => {
    if (submitting || !user?.id) return;

    // Collect IDs: current-session done photos + RTDB saved photos (survived remount)
    const sessionIds = donePhotos
      .filter((p) => p.rtdbId && !submittedRtdbIds.has(p.rtdbId))
      .map((p) => p.rtdbId!);
    const remoteIds = savedRemotePhotos.map((p) => p.id);
    const allIds = [...new Set([...sessionIds, ...remoteIds])];
    if (allIds.length === 0) return;

    setSubmitting(true);
    try {
      const batch: Record<string, unknown> = {};
      const now = Date.now();
      for (const id of allIds) {
        batch[`community_photos/${id}/status`] = 'pending';
        batch[`community_photos/${id}/moderationStatus`] = 'pending';
        batch[`community_photos/${id}/updatedAt`] = now;
        if (uploadCategory) batch[`community_photos/${id}/category`] = uploadCategory;
        if (description.trim()) batch[`community_photos/${id}/description`] = description.trim();
        if (address.trim()) batch[`community_photos/${id}/locationLabel`] = address.trim();
      }
      await update(ref(database), batch);
      setSubmittedRtdbIds((prev) => new Set([...prev, ...allIds]));
      void AsyncStorage.removeItem(SOUL_PHOTO_DRAFT_KEY).catch(() => {});
      if (user?.id) {
        void getUserCommunityPhotosForMonth(user.id).then((photos) => {
          setMonthlyUsed(photos.length);
        }).catch(() => {});
      }
    } catch (error) {
      void logClientError('SoulPhotosScreen.submitToModeration', error);
      Alert.alert('', text.uploadError);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, user?.id, donePhotos, savedRemotePhotos, submittedRtdbIds, uploadCategory, description, address]);

  const data = useMemo<SoulPhoto[]>(() => {
    const remotePaths = new Set(remotePhotos.map((photo) => photo.storagePath).filter(Boolean));
    const local = Object.values(pickedPhotos)
      .filter((photo) => !photo.storagePath || !remotePaths.has(photo.storagePath))
      .map<SoulPhoto>((photo) => ({
        id: photo.photoId,
        uri: photo.localUri || photo.thumbUri || photo.downloadUrl,
        storagePath: photo.storagePath,
        createdAt: Number.MAX_SAFE_INTEGER,
        status: 'pending',
        category: uploadCategory ?? undefined,
        local: true,
        uploading: photo.status === 'uploading',
        progress: photo.progress,
      }));

    const all = [...local, ...remotePhotos].slice(0, MAX_ITEMS);
    if (activeTab === 'all') return all;
    return all.filter((p) => p.category === activeTab);
  }, [pickedPhotos, remotePhotos, activeTab, uploadCategory]);

  const pendingCount = data.filter((photo) => photo.status === 'pending').length;
  const hasUploadedLocal = Object.values(pickedPhotos).some((photo) => photo.status === 'done');

  // ── Swipe mode ──────────────────────────────────────────────────────────────
  const swipeItems = useMemo(() => data.filter((p) => p.status === 'approved' && !!p.uri && !p.local), [data]);
  const swipeItemsRef = useRef(swipeItems);
  swipeItemsRef.current = swipeItems;
  const swipeIndexRef = useRef(swipeIndex);
  swipeIndexRef.current = swipeIndex;

  const handleLikePhoto = useCallback(async (photoId: string) => {
    if (everLikedRef.current.has(photoId)) return;
    everLikedRef.current.add(photoId);
    setLikedPhotoIds((prev) => [...prev, photoId]);
    try {
      await update(ref(database), { [`community_photos/${photoId}/likes`]: increment(1) });
    } catch (e) {
      void logClientError('SoulPhotosScreen.likePhoto', e);
    }
  }, []);

  const advanceSwipe = useCallback(() => {
    swipePosition.setValue({ x: 0, y: 0 });
    setSwipeIndex((prev) => prev + 1);
  }, [swipePosition]);

  const handleSwipeRight = useCallback(() => {
    const item = swipeItemsRef.current[swipeIndexRef.current];
    if (!item) return;
    void handleLikePhoto(item.id);
    Animated.timing(swipePosition, { toValue: { x: 600, y: 0 }, duration: 260, useNativeDriver: false }).start(advanceSwipe);
  }, [advanceSwipe, handleLikePhoto, swipePosition]);

  const handleSwipeLeft = useCallback(() => {
    Animated.timing(swipePosition, { toValue: { x: -600, y: 0 }, duration: 260, useNativeDriver: false }).start(advanceSwipe);
  }, [advanceSwipe, swipePosition]);

  const handleSwipeRightRef = useRef(handleSwipeRight);
  handleSwipeRightRef.current = handleSwipeRight;
  const handleSwipeLeftRef = useRef(handleSwipeLeft);
  handleSwipeLeftRef.current = handleSwipeLeft;

  const swipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: swipePosition.x, dy: swipePosition.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dx }) => {
        if (dx > 100) {
          handleSwipeRightRef.current();
        } else if (dx < -100) {
          handleSwipeLeftRef.current();
        } else {
          Animated.spring(swipePosition, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;
  // ────────────────────────────────────────────────────────────────────────────

  const gridPadding = 12;
  const tileSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: SoulPhoto }) => {
      const pendingLabel = item.status === 'saved' ? text.awaitConfirm : text.pending;
      if (!item.local && !item.uploading && item.uri) {
        return (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewPhoto(item)}>
            <SoulTile item={item} size={tileSize} pendingLabel={pendingLabel} approvedLabel={text.approved} uploadLabel={text.upload} />
          </TouchableOpacity>
        );
      }
      return <SoulTile item={item} size={tileSize} pendingLabel={pendingLabel} approvedLabel={text.approved} uploadLabel={text.upload} />;
    },
    [text.approved, text.awaitConfirm, text.pending, text.upload, tileSize],
  );

  // ---------------------------------------------------------------------------
  // Category tabs (gallery filter)
  // ---------------------------------------------------------------------------
  const categoryTabs = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsScroll}
      contentContainerStyle={styles.tabsContent}
    >
      <TouchableOpacity
        activeOpacity={0.78}
        style={[styles.tab, activeTab === 'all' && styles.tabActive]}
        onPress={() => setActiveTab('all')}
      >
        <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>{text.tabAll}</Text>
      </TouchableOpacity>
      {CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          activeOpacity={0.78}
          style={[styles.tab, activeTab === cat.id && styles.tabActive]}
          onPress={() => setActiveTab(cat.id)}
        >
          <MaterialCommunityIcons
            name={cat.icon as any}
            size={14}
            color={activeTab === cat.id ? '#fff' : '#75684F'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === cat.id && styles.tabTextActive]}>
            {getCategoryLabel(cat, language)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // ---------------------------------------------------------------------------
  // Category picker (upload panel)
  // ---------------------------------------------------------------------------
  const categoryPicker = (
    <View style={styles.pickerBlock}>
      <Text style={styles.pickerLabel}>{text.categoryLabel}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerRow}
      >
        {CATEGORIES.map((cat) => {
          const active = uploadCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.78}
              style={[styles.pickerChip, active && styles.pickerChipActive]}
              onPress={() => setUploadCategory(cat.id)}
            >
              <MaterialCommunityIcons
                name={cat.icon as any}
                size={15}
                color={active ? '#fff' : '#75684F'}
              />
              <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                {getCategoryLabel(cat, language)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.78}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: isDark ? '#F5E8F0' : undefined }]}>{text.title}</Text>
      <Text style={[styles.subtitle, { color: isDark ? '#F5E8F0' : undefined }]}>{text.approvedNote}</Text>
      {categoryTabs}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Upload panel
  // ---------------------------------------------------------------------------
  const uploadPanel = (
    <View style={styles.uploadPanel}>
      <TouchableOpacity
        style={dushiSwipeStyles.swipeEntryBtn}
        onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeIndex(0); setLikedPhotoIds([]); setSwipeMode(true); }}
        activeOpacity={0.86}
      >
        <MaterialCommunityIcons name="cards" size={18} color="#453321" />
        <Text style={dushiSwipeStyles.swipeEntryBtnText}>{text.swipeBtn}</Text>
      </TouchableOpacity>

      {/* Photo upload button — always visible */}
      {user ? (
        <View style={styles.realPickerWrap}>
          <PhotoUploadField
            uid={user.id}
            userName={user.name ?? user.email ?? ''}
            maxPhotos={Math.min(1, Math.max(0, COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT - (monthlyUsed ?? 0)))}
            storagePath={STORAGE_PATH}
            onPhotosChange={handlePhotosChange}
            hideSelectedPreview
            metadata={{
              title: text.title,
              description: description.trim(),
              sourceScreen: SCREEN_ID,
              sourceScreenLabel: text.title,
              sourceFeature: 'soul_photos_upload',
              locationLabel: address.trim(),
              locationType: address.trim() ? 'place' : undefined,
              category: uploadCategory ?? undefined,
              moderationDeferred: true,
            }}
          />
        </View>
      ) : (
        <TouchableOpacity
          style={styles.loginButton}
          onPress={guestGuard(() => {})}
          activeOpacity={0.82}
        >
          <MaterialCommunityIcons name="login" size={19} color="#fff" />
          <Text style={styles.actionText}>{text.login}</Text>
        </TouchableOpacity>
      )}

      {/* Category + address form — appears after photo is loaded into grid */}
      {uploadFormVisible && (
        <>
          {categoryPicker}
          <View style={styles.descriptionRow}>
            <View style={styles.descriptionIcon}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color="#fff" />
            </View>
            <View style={styles.descriptionFields}>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder={text.addressPlaceholder}
                placeholderTextColor="#9B9183"
                style={styles.input}
                maxLength={80}
              />
            </View>
          </View>
        </>
      )}

      {monthlyUsed !== null && (
        <View style={[styles.limitBadge, monthlyUsed >= COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT && styles.limitBadgeExhausted]}>
          <MaterialCommunityIcons
            name={monthlyUsed >= COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT ? 'lock-outline' : 'calendar-month-outline'}
            size={14}
            color={monthlyUsed >= COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT ? '#C0392B' : '#665A52'}
          />
          <Text style={[styles.limitBadgeText, monthlyUsed >= COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT && styles.limitBadgeTextExhausted]}>
            {monthlyUsed >= COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT
              ? text.limitExhausted(COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT)
              : text.limitUsed(monthlyUsed, COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT)}
          </Text>
        </View>
      )}

      {/* Uploading indicator */}
      {isUploading && (
        <View style={styles.statusBadge}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.submitText}>{text.uploadingLabel}</Text>
        </View>
      )}

      {/* Pulsing submit button — shown when photo is ready but not yet sent */}
      {hasUnsubmitted && !isUploading && (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => void submitToModeration()}
            disabled={submitting}
            activeOpacity={0.82}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="send-check-outline" size={18} color="#fff" />
            )}
            <Text style={styles.submitButtonText}>
              {submitting ? text.submitting : text.submitBtn}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Sent badge — shown after user pressed submit */}
      {!hasUnsubmitted && !isUploading && (hasUploadedLocal || pendingCount > 0) && (
        <View style={styles.statusBadge}>
          <MaterialCommunityIcons name="clock-outline" size={16} color="#fff" />
          <Text style={styles.submitText}>{text.sending}</Text>
        </View>
      )}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  const empty = (
    <View style={styles.empty}>
      {loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
      ) : (
        <>
          <MaterialCommunityIcons
            name={loadError ? 'wifi-alert' : 'tag-heart-outline'}
            size={38}
            color="#8D735A"
          />
          <Text style={styles.emptyText}>{loadError ? text.loadError : text.empty}</Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <FlatList
        style={styles.photoList}
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
      {uploadPanel}
      {/* Soul photo swipe overlay */}
      {swipeMode ? (() => {
        const swipeCard = swipeItems[swipeIndex];
        const swipeDone = swipeIndex >= swipeItems.length;
        const swipeRotation = swipePosition.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-10deg', '0deg', '10deg'] });
        const likeOpacity = swipePosition.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
        const passOpacity = swipePosition.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        const catLabel = swipeCard?.category ? CATEGORIES.find((c) => c.id === swipeCard.category)?.[language] : undefined;
        return (
          <View style={dushiSwipeStyles.overlay}>
            <TouchableOpacity style={dushiSwipeStyles.backBtn} onPress={() => setSwipeMode(false)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#C97959" />
              <Text style={dushiSwipeStyles.backBtnText}>{text.swipeBack}</Text>
            </TouchableOpacity>
            {swipeDone ? (
              <View style={dushiSwipeStyles.doneBox}>
                <Text style={dushiSwipeStyles.doneTitle}>{text.swipeDoneTitle}</Text>
                <Text style={dushiSwipeStyles.doneSub}>{text.swipeDoneSub(likedPhotoIds.length)}</Text>
                <TouchableOpacity style={dushiSwipeStyles.restartBtn} onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeIndex(0); setLikedPhotoIds([]); }} activeOpacity={0.85}>
                  <Text style={dushiSwipeStyles.restartBtnText}>{text.swipeRestart}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {swipeItems[swipeIndex + 1] ? (
                  <View style={[dushiSwipeStyles.card, dushiSwipeStyles.cardBack]} pointerEvents="none" />
                ) : null}
                <Animated.View
                  style={[dushiSwipeStyles.card, { transform: [{ translateX: swipePosition.x }, { translateY: swipePosition.y }, { rotate: swipeRotation }] }]}
                  {...swipePanResponder.panHandlers}
                >
                  <AppPhotoImage
                    uri={swipeCard?.uri}
                    storagePath={swipeCard?.storagePath}
                    style={dushiSwipeStyles.photo}
                    resizeMode="cover"
                    debugLabel={`SoulSwipe:${swipeCard?.id}`}
                    showDebugInfo={false}
                  />
                  <Animated.View style={[dushiSwipeStyles.likeOverlay, { opacity: likeOpacity }]}>
                    <Text style={dushiSwipeStyles.likeText}>{text.swipeLikeLabel}</Text>
                  </Animated.View>
                  <Animated.View style={[dushiSwipeStyles.passOverlay, { opacity: passOpacity }]}>
                    <Text style={dushiSwipeStyles.passText}>{text.swipePassLabel}</Text>
                  </Animated.View>
                  <View style={dushiSwipeStyles.infoBar}>
                    {catLabel ? <Text style={dushiSwipeStyles.catLabel}>{catLabel}</Text> : null}
                    {swipeCard?.description ? <Text style={dushiSwipeStyles.descText} numberOfLines={2}>{swipeCard.description}</Text> : null}
                    <View style={dushiSwipeStyles.metaRow}>
                      {swipeCard?.author ? <Text style={dushiSwipeStyles.authorText}>{swipeCard.author}</Text> : null}
                      {(swipeCard?.likes ?? 0) > 0 ? <Text style={dushiSwipeStyles.likesCount}>{`❤ ${swipeCard?.likes}`}</Text> : null}
                    </View>
                  </View>
                </Animated.View>
                <View style={dushiSwipeStyles.actions}>
                  <TouchableOpacity style={dushiSwipeStyles.passBtn} onPress={handleSwipeLeft} activeOpacity={0.85}>
                    <MaterialCommunityIcons name="close" size={40} color="#453321" />
                  </TouchableOpacity>
                  <TouchableOpacity style={dushiSwipeStyles.likeBtn} onPress={handleSwipeRight} activeOpacity={0.85}>
                    <MaterialCommunityIcons name="heart" size={48} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={dushiSwipeStyles.counter}>{swipeIndex + 1} / {swipeItems.length}</Text>
              </>
            )}
          </View>
        );
      })() : null}
      {!swipeMode && <MiniTabBar />}
      <GuestRegisterBanner visible={guestBannerVisible} onClose={hideGuestBanner} />
      <VideoLoadingOverlay visible={loading} />
      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto ? (
            <>
              <AppPhotoImage
                uri={previewPhoto.uri}
                storagePath={previewPhoto.storagePath}
                style={styles.previewImage}
                resizeMode="contain"
                debugLabel={`SoulPhotoPreview:${previewPhoto.id}`}
                showDebugInfo={false}
              />
              <View style={styles.previewCaption}>
                {previewPhoto.description ? (
                  <Text style={styles.previewCaptionText}>{previewPhoto.description}</Text>
                ) : null}
                {previewPhoto.author ? (
                  <Text style={styles.previewMetaText}>{previewPhoto.author}</Text>
                ) : null}
                {(previewPhoto.likes ?? 0) > 0 ? (
                  <Text style={styles.previewMetaText}>{`❤ ${previewPhoto.likes}`}</Text>
                ) : null}
                {previewPhoto.createdAt > 0 ? (
                  <Text style={styles.previewMetaText}>
                    {new Date(previewPhoto.createdAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6E9C9' },
  photoList: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 14 },

  // Header
  header: {
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8BF8B',
    backgroundColor: '#FFF8E9',
  },
  title: {
    color: '#453321',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: '#75684F',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Category tabs (gallery filter)
  tabsScroll: {
    marginTop: 10,
    marginHorizontal: -12,
  },
  tabsContent: {
    paddingHorizontal: 12,
    gap: 7,
    paddingBottom: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D8BF8B',
    backgroundColor: '#FFF8E9',
  },
  tabActive: {
    backgroundColor: '#C97959',
    borderColor: '#C97959',
  },
  tabIcon: {
    marginRight: 1,
  },
  tabText: {
    color: '#75684F',
    fontSize: 12,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#fff',
  },

  // Grid
  row: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#858584',
  },
  approvedTile: {
    borderWidth: 1,
    borderColor: '#6F766B',
  },
  pendingTile: {
    borderWidth: 2,
    borderColor: '#22B14C',
  },
  savedTile: {
    borderWidth: 2,
    borderColor: '#E8A33D',
  },
  tileImage: { width: '100%', height: '100%' },
  grayExample: { width: '100%', height: '100%', backgroundColor: '#858584' },
  uploadLayer: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E5E0D2',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22B14C',
  },
  progressText: {
    marginTop: 4,
    color: '#21A347',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  pendingLabel: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    minHeight: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  approvedLabel: {
    backgroundColor: 'rgba(38, 95, 71, 0.88)',
  },
  pendingText: {
    color: '#77746E',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  approvedText: {
    color: '#fff',
  },

  // Upload panel
  uploadPanel: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 9,
    borderTopWidth: 2,
    borderTopColor: '#D8BF8B',
    backgroundColor: '#F6E9C9',
  },

  // Category picker
  pickerBlock: {
    gap: 6,
  },
  pickerLabel: {
    color: '#6D5740',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerRow: {
    gap: 7,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D8BF8B',
    backgroundColor: '#FFF8E9',
  },
  pickerChipActive: {
    backgroundColor: '#C97959',
    borderColor: '#C97959',
  },
  pickerChipText: {
    color: '#75684F',
    fontSize: 12,
    fontWeight: '800',
  },
  pickerChipTextActive: {
    color: '#fff',
  },

  // Description row
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  descriptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C97959',
  },
  descriptionFields: { flex: 1, gap: 7 },
  descriptionTitle: {
    color: '#6D5740',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E0C796',
    backgroundColor: '#FFF8E9',
    color: '#453321',
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  // Upload button area
  realPickerWrap: {
    overflow: 'hidden',
  },
  pickerDisabled: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D8BF8B',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBlocker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 14,
  },
  pickerBlockerText: {
    color: '#B8860B',
    fontSize: 14,
    fontWeight: '700',
  },

  loginButton: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C97959',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  statusBadge: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#8FA77A',
    opacity: 0.88,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C97959',
    shadowColor: '#C97959',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },

  // Empty state
  empty: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#75684F',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  // Preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewCaption: {
    marginTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  previewCaptionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewMetaText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF8E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0C796',
  },
  limitBadgeExhausted: {
    backgroundColor: '#FDE8E6',
    borderColor: '#E8A09A',
  },
  limitBadgeText: {
    color: '#665A52',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  limitBadgeTextExhausted: {
    color: '#C0392B',
  },
});

const dushiSwipeStyles = StyleSheet.create({
  swipeEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#F0D98A',
    borderWidth: 1,
    borderColor: '#D8BF8B',
  },
  swipeEntryBtnText: {
    color: '#453321',
    fontSize: 15,
    fontWeight: '900',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2A1A0A',
    zIndex: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 110,
  },
  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(42,26,10,0.85)',
    borderWidth: 1,
    borderColor: '#C97959',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
  },
  backBtnText: { color: '#C97959', fontSize: 13, fontWeight: '800' },
  card: {
    width: 320,
    height: 460,
    borderRadius: 24,
    backgroundColor: '#3B2211',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C97959',
    elevation: 12,
    shadowColor: '#C97959',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  cardBack: {
    position: 'absolute',
    transform: [{ scale: 0.95 }],
    opacity: 0.6,
  },
  photo: { width: '100%', height: '100%', position: 'absolute' },
  likeOverlay: {
    position: 'absolute',
    top: 32,
    left: 24,
    backgroundColor: 'rgba(201,121,89,0.92)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    transform: [{ rotate: '-12deg' }],
  },
  likeText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  passOverlay: {
    position: 'absolute',
    top: 32,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#FFF8E9',
    transform: [{ rotate: '12deg' }],
  },
  passText: { color: '#FFF8E9', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  infoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(42,26,10,0.82)',
    padding: 14,
    gap: 4,
  },
  catLabel: {
    color: '#F0D98A',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  descText: { color: '#FFF8E9', fontSize: 14, fontWeight: '700', lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  authorText: { color: '#D8BF8B', fontSize: 13, fontWeight: '700', flex: 1 },
  likesCount: { color: '#C97959', fontSize: 13, fontWeight: '800' },
  actions: {
    position: 'absolute',
    bottom: -95,
    flexDirection: 'row',
    gap: 40,
    alignSelf: 'center',
    alignItems: 'center',
  },
  passBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF8E9',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  likeBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#C97959',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#C97959',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  counter: { position: 'absolute', top: 60, alignSelf: 'center', color: '#D8BF8B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  doneBox: { alignItems: 'center', gap: 12, padding: 32 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: '#FFF8E9', textAlign: 'center' },
  doneSub: { fontSize: 16, color: '#C97959', fontWeight: '700' },
  restartBtn: { backgroundColor: '#C97959', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  restartBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
