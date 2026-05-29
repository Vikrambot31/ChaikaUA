/**
 * TZ_4.4 — MyPhotosScreen
 *
 * Shows the user's personal photo library from user_photos/{uid}.
 * Photos are saved first (moderationStatus = 'not_submitted') and can be
 * selected later for public approval.
 *
 * In-flight (uploading/queued/error) photos come from local ImageStorage.
 * Saved/moderation-status photos come from a real-time RTDB listener.
 *
 * TZ_4.5 — Limit and review flow:
 *   • Up to 10 personal photos.
 *   • User selects saved/rejected photos and sends them for review manually.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { get, ref, query, orderByChild, onValue, update } from 'firebase/database';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import AppPhotoImage from '../components/AppPhotoImage';
import { database } from '../firebase-core';
import { photoService } from '../services/photoService';
import { safeLogError } from '../utils/errorLogger';
import { SCREEN_THEME } from '../utils/screenTheme';
import { showUserError } from '../utils/userFacingErrors';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from './ImageStorage';
import { PhotoSelector } from './PhotoSelector';
import { UploadQueue } from './UploadQueue';
import type { MyPhotosScreenParams, UserPhoto } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppLanguage = 'ua' | 'ru' | 'en';
type Navigation = {
  goBack: () => void;
  canGoBack?: () => boolean;
  navigate?: (screen: string) => void;
};
type Route = RouteProp<Record<string, MyPhotosScreenParams | undefined>, string>;
type PreviewPhoto = { uri: string; storagePath?: string };
const MAX_USER_PHOTOS = 10;
const SELECT_MODE_TEXT: Record<AppLanguage, {
  emptyNotice: string;
  waitNotice: string;
  chooseReady: string;
  waitTitle: string;
  waitBody: string;
}> = {
  ua: {
    emptyNotice: '\u0421\u043f\u043e\u0447\u0430\u0442\u043a\u0443 \u0434\u043e\u0434\u0430\u0439\u0442\u0435 \u0444\u043e\u0442\u043e \u0443 "\u041c\u043e\u0457 \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0456\u0457". \u041f\u043e\u0442\u0456\u043c \u043e\u0431\u0435\u0440\u0456\u0442\u044c \u0439\u043e\u0433\u043e \u0434\u043b\u044f \u0437\u0430\u044f\u0432\u043a\u0438.',
    waitNotice: '\u0414\u043e\u0447\u0435\u043a\u0430\u0439\u0442\u0435\u0441\u044f, \u043f\u043e\u043a\u0438 \u043d\u0430 \u0444\u043e\u0442\u043e \u0437\u02bc\u044f\u0432\u0438\u0442\u044c\u0441\u044f "\u0413\u043e\u0442\u043e\u0432\u043e".',
    chooseReady: '\u041e\u0431\u0435\u0440\u0456\u0442\u044c \u0444\u043e\u0442\u043e, \u044f\u043a\u0435 \u0445\u043e\u0447\u0435\u0442\u0435 \u043f\u0440\u0438\u043a\u0440\u0456\u043f\u0438\u0442\u0438 \u0434\u043e \u0437\u0430\u044f\u0432\u043a\u0438.',
    waitTitle: '\u0424\u043e\u0442\u043e \u0449\u0435 \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0443\u0454\u0442\u044c\u0441\u044f',
    waitBody: '\u0414\u043e\u0447\u0435\u043a\u0430\u0439\u0442\u0435\u0441\u044f \u0441\u0442\u0430\u0442\u0443\u0441\u0443 "\u0413\u043e\u0442\u043e\u0432\u043e" \u043d\u0430 \u0444\u043e\u0442\u043e, \u043f\u043e\u0442\u0456\u043c \u043d\u0430\u0442\u0438\u0441\u043d\u0456\u0442\u044c \u043d\u0430 \u043d\u044c\u043e\u0433\u043e.',
  },
  ru: {
    emptyNotice: '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0434\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0444\u043e\u0442\u043e \u0432 "\u041c\u043e\u0438 \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438". \u041f\u043e\u0442\u043e\u043c \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0435\u0433\u043e \u0434\u043b\u044f \u0437\u0430\u044f\u0432\u043a\u0438.',
    waitNotice: '\u0414\u043e\u0436\u0434\u0438\u0442\u0435\u0441\u044c, \u043f\u043e\u043a\u0430 \u043d\u0430 \u0444\u043e\u0442\u043e \u0431\u0443\u0434\u0435\u0442 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u043e "\u0413\u043e\u0442\u043e\u0432\u043e".',
    chooseReady: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043e\u0442\u043e, \u043a\u043e\u0442\u043e\u0440\u043e\u0435 \u0445\u043e\u0442\u0438\u0442\u0435 \u043f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u043a \u0437\u0430\u044f\u0432\u043a\u0435.',
    waitTitle: '\u0424\u043e\u0442\u043e \u0435\u0449\u0451 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044f',
    waitBody: '\u0414\u043e\u0436\u0434\u0438\u0442\u0435\u0441\u044c \u0441\u0442\u0430\u0442\u0443\u0441\u0430 "\u0413\u043e\u0442\u043e\u0432\u043e" \u043d\u0430 \u0444\u043e\u0442\u043e, \u043f\u043e\u0442\u043e\u043c \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043d\u0430 \u043d\u0435\u0433\u043e.',
  },
  en: {
    emptyNotice: 'First add a photo to My photos. Then choose it for the request.',
    waitNotice: 'Wait until the photo says "Ready".',
    chooseReady: 'Choose the photo you want to attach to the request.',
    waitTitle: 'Photo is still uploading',
    waitBody: 'Wait until the photo says "Ready", then tap it.',
  },
};

/** A photo record fetched from RTDB (user_photos/{uid} node). */
type RtdbPhoto = {
  id: string;
  storagePath: string;
  imageUri: string;
  status: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  uploadedAt: number;
  moderationReason?: string;
  title?: string;
};

// ─── i18n ─────────────────────────────────────────────────────────────────────

const UI_TEXT = {
  ua: {
    title: 'Мої фотографії',
    subtitle: 'Єдина галерея ваших фото в застосунку.',
    selectHint: 'Оберіть фото для цього розділу',
    add: 'Додати фото',
    camera: 'Камера',
    library: 'Галерея',
    cancel: 'Скасувати',
    emptyTitle: 'Фото ще немає',
    emptyText: 'Додайте фото один раз, потім використовуйте його в будь-якому розділі.',
    deleteTitle: 'Видалити фото?',
    deleteText: 'Фото буде приховано з вашої галереї.',
    yes: 'Так',
    no: 'Ні',
    queued: 'У черзі',
    uploading: 'Завантаження',
    uploaded: 'Готово',
    saved: 'Збережено',
    error: 'Помилка',
    limitReached: 'Можна зберегти до 10 фото. Видаліть одне фото, щоб додати нове.',
    sectionAll: 'Мої фото',
    sectionSaved: 'Збережено',
    sectionPending: 'На модерації',
    sectionApproved: 'Одобрені',
    sectionRejected: 'Відхилені',
    sectionUploading: 'Завантажуються',
    pendingBanner: 'Ваше фото перевіряється — нові завантаження тимчасово недоступні',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно тільки вам до одобрення',
    selectForReview: 'Оберіть фото для перевірки',
    submitForReview: 'Відправити на одобрення',
    submittingForReview: 'Відправляємо...',
  },
  ru: {
    title: 'Мои фотографии',
    subtitle: 'Единая галерея ваших фото в приложении.',
    selectHint: 'Выберите фото для этого раздела',
    add: 'Добавить фото',
    camera: 'Камера',
    library: 'Галерея',
    cancel: 'Отмена',
    emptyTitle: 'Фото пока нет',
    emptyText: 'Добавьте фото один раз, затем используйте его в любом разделе.',
    deleteTitle: 'Удалить фото?',
    deleteText: 'Фото будет скрыто из вашей галереи.',
    yes: 'Да',
    no: 'Нет',
    queued: 'В очереди',
    uploading: 'Загрузка',
    uploaded: 'Готово',
    saved: 'Сохранено',
    error: 'Ошибка',
    limitReached: 'Можно сохранить до 10 фото. Удалите одно фото, чтобы добавить новое.',
    sectionAll: 'Мои фото',
    sectionSaved: 'Сохранено',
    sectionPending: 'На модерации',
    sectionApproved: 'Одобренные',
    sectionRejected: 'Отклонённые',
    sectionUploading: 'Загружаются',
    pendingBanner: 'Ваше фото проверяется — новые загрузки временно недоступны',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно только вам до одобрения',
    selectForReview: 'Выберите фото для проверки',
    submitForReview: 'Отправить на одобрение',
    submittingForReview: 'Отправляем...',
  },
  en: {
    title: 'My photos',
    subtitle: 'One gallery for all your app photos.',
    selectHint: 'Choose a photo for this section',
    add: 'Add photo',
    camera: 'Camera',
    library: 'Gallery',
    cancel: 'Cancel',
    emptyTitle: 'No photos yet',
    emptyText: 'Add a photo once, then use it in any section.',
    deleteTitle: 'Delete photo?',
    deleteText: 'The photo will be hidden from your gallery.',
    yes: 'Yes',
    no: 'No',
    queued: 'Queued',
    uploading: 'Uploading',
    uploaded: 'Ready',
    saved: 'Saved',
    error: 'Error',
    limitReached: 'You can save up to 10 photos. Delete one photo to add another.',
    sectionAll: 'My photos',
    sectionSaved: 'Saved',
    sectionPending: 'Under review',
    sectionApproved: 'Approved',
    sectionRejected: 'Rejected',
    sectionUploading: 'Uploading',
    pendingBanner: 'Your photo is being reviewed — new uploads are temporarily unavailable',
    rejectedReason: 'Reason:',
    moderationNote: 'Only visible to you until approved',
    selectForReview: 'Select photos for review',
    submitForReview: 'Send for approval',
    submittingForReview: 'Sending...',
  },
} as const;

const statusColor: Record<UserPhoto['status'], string> = {
  queued: '#A66A00',
  uploading: SCREEN_THEME.enamelBlueDark,
  uploaded: SCREEN_THEME.woodGreenDark,
  error: SCREEN_THEME.terracottaDark,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch user's personal photos from RTDB user_photos/{uid} node. */
async function fetchUserPhotosFromRtdb(uid: string): Promise<RtdbPhoto[]> {
  try {
    const snap = await get(ref(database, `user_photos/${uid}`));
    if (!snap.exists()) return [];
    const raw = snap.val() as Record<string, Record<string, unknown>>;
    return Object.entries(raw)
      .map(([key, val]) => ({
        id: key,
        storagePath: typeof val.storagePath === 'string' ? val.storagePath : '',
        imageUri: typeof val.imageUri === 'string' ? val.imageUri : '',
        status: val.moderationStatus === 'not_submitted'
          ? 'not_submitted'
          : (val.moderationStatus === 'pending' || val.moderationStatus === 'approved' || val.moderationStatus === 'rejected')
            ? (val.moderationStatus as 'pending' | 'approved' | 'rejected')
            : (val.status === 'pending' || val.status === 'approved' || val.status === 'rejected')
              ? (val.status as 'pending' | 'approved' | 'rejected')
              : ('not_submitted' as const),
        uploadedAt: typeof val.uploadedAt === 'number' ? val.uploadedAt : 0,
        moderationReason: typeof val.moderationReason === 'string' ? val.moderationReason : undefined,
        title: typeof val.title === 'string' ? val.title : undefined,
      }))
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  } catch (err) {
    safeLogError('MyPhotosScreen.fetchUserPhotosFromRtdb', err, { uid });
    return [];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string; count: number; color?: string }> = ({
  label,
  count,
  color,
}) => (
  <View style={sStyles.sectionHeader}>
    <Text style={[sStyles.sectionLabel, color ? { color } : {}]}>{label}</Text>
    <View style={[sStyles.sectionBadge, color ? { backgroundColor: color } : {}]}>
      <Text style={sStyles.sectionBadgeText}>{count}</Text>
    </View>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

const MyPhotosScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const language = useSelector(
    (state: RootState) => state.language?.current ?? 'ua',
  ) as AppLanguage;
  const uid = useSelector((state: RootState) => state.auth.user?.id ?? '');
  const userName = useSelector((state: RootState) => state.auth.user?.name ?? '');
  const userEmail = useSelector((state: RootState) => state.auth.user?.email ?? '');
  const text = UI_TEXT[language] ?? UI_TEXT.ru;
  const selectText = SELECT_MODE_TEXT[language] ?? SELECT_MODE_TEXT.ru;
  const selectMode = Boolean(route.params?.selectMode);

  const [localPhotos, setLocalPhotos] = useState<UserPhoto[]>([]);
  const [rtdbPhotos, setRtdbPhotos] = useState<RtdbPhoto[]>([]);
  const [rtdbLoading, setRtdbLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [selectedForReview, setSelectedForReview] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);
  const selectedForAttachmentRef = useRef(false);

  const userId = uid || userEmail || 'local-user';

  // Derived moderation sections
  const savedPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'not_submitted'), [rtdbPhotos]);
  const pendingPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'pending'), [rtdbPhotos]);
  const approvedPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'approved'), [rtdbPhotos]);
  const rejectedPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'rejected'), [rtdbPhotos]);
  const rtdbPhotoKeys = useMemo(() => {
    const keys = new Set<string>();
    rtdbPhotos.forEach((photo) => {
      if (photo.storagePath) keys.add(photo.storagePath);
      if (photo.imageUri) keys.add(photo.imageUri);
    });
    return keys;
  }, [rtdbPhotos]);
  const displayedLocalPhotos = useMemo(() => localPhotos.filter((photo) => (
    photo.status !== 'uploaded' ||
    !((photo.storagePath && rtdbPhotoKeys.has(photo.storagePath)) || (photo.imageUrl && rtdbPhotoKeys.has(photo.imageUrl)))
  )), [localPhotos, rtdbPhotoKeys]);
  const totalPhotoCount = rtdbPhotos.length + displayedLocalPhotos.length;

  const limitReached = totalPhotoCount >= MAX_USER_PHOTOS;
  const addButtonDisabled = limitReached || adding;
  const selectedCount = selectedForReview.length;
  const hasUploadingLocalPhotos = displayedLocalPhotos.some((photo) => photo.status === 'queued' || photo.status === 'uploading');

  const handleBack = useCallback(() => {
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate?.('MainTabs');
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = ImageStorage.subscribe((items) =>
      setLocalPhotos(items.filter((item) => !item.deleted)),
    );
    return () => {
      unsubscribe();
      if (selectMode && !selectedForAttachmentRef.current) PhotoSelector.cancel();
    };
  }, [selectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time listener for RTDB photos — syncs when moderator approves/rejects
  useEffect(() => {
    if (!uid) {
      setRtdbPhotos([]);
      setRtdbLoading(false);
      return;
    }
    setRtdbLoading(true);

    const photosRef = query(
      ref(database, `user_photos/${uid}`),
      orderByChild('uploadedAt')
    );

    const unsubscribe = onValue(
      photosRef,
      async (_snapshot) => {
        try {
          const photos = await fetchUserPhotosFromRtdb(uid);
          setRtdbPhotos(photos);
          setRtdbLoading(false);
        } catch (err) {
          safeLogError('MyPhotosScreen.onValue', err, { uid });
          setRtdbLoading(false);
        }
      },
      (err) => {
        safeLogError('MyPhotosScreen.realtimeListener', err, { uid });
        setRtdbLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      void UploadQueue.process();
      return () => subscription.remove();
    }, [handleBack]),
  );

  const statusLabels = useMemo<Record<UserPhoto['status'], string>>(
    () => ({
      queued: text.queued,
      uploading: text.uploading,
      uploaded: text.uploaded,
      error: text.error,
    }),
    [text],
  );

  const enqueueAndSelect = useCallback(
    async (photo: UserPhoto | null) => {
      if (!photo) return;
      await UploadQueue.enqueue(
        photo.id,
        photo.localUri,
        { uploadedBy: userEmail || userName || userId },
        { collection: 'user_photos', uid },
      );
      void UploadQueue.process();
    },
    [uid, userEmail, userId, userName],
  );

  const runAdd = useCallback(
    async (source: 'camera' | 'library') => {
      if (adding) return;
      setAdding(true);
      try {
        const photo =
          source === 'camera'
            ? await photoService.addFromCamera({ userId, type: 'gallery' })
            : await photoService.addFromLibrary({ userId, type: 'gallery' });
        await enqueueAndSelect(photo);
      } catch (error) {
        showUserError(language, 'upload', error);
      } finally {
        setAdding(false);
      }
    },
    [adding, enqueueAndSelect, language, userId],
  );

  const addPhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      await runAdd('library');
      return;
    }
    Alert.alert(text.add, '', [
      { text: text.camera, onPress: () => { void runAdd('camera'); } },
      { text: text.library, onPress: () => { void runAdd('library'); } },
      { text: text.cancel, style: 'cancel' },
    ]);
  }, [runAdd, text]);

  const togglePhotoForReview = useCallback((photo: RtdbPhoto) => {
    if (photo.status !== 'not_submitted' && photo.status !== 'rejected') return;
    setSelectedForReview((prev) => (
      prev.includes(photo.id) ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
    ));
  }, []);

  const submitSelectedForReview = useCallback(async () => {
    if (!uid || selectedForReview.length === 0 || submittingReview) return;
    setSubmittingReview(true);
    try {
      const now = Date.now();
      await Promise.all(selectedForReview.map((photoId) => update(ref(database, `user_photos/${uid}/${photoId}`), {
        status: 'pending',
        moderationStatus: 'pending',
        submittedAt: now,
        updatedAt: now,
        moderationReason: null,
      })));
      setSelectedForReview([]);
    } catch (error) {
      showUserError(language, 'upload', error);
    } finally {
      setSubmittingReview(false);
    }
  }, [language, selectedForReview, submittingReview, uid]);

  const retryPhoto = useCallback(
    (photo: UserPhoto) => {
      void (async () => {
        try {
          await ImageStorage.updatePhoto(photo.id, {
            status: 'queued',
            error: undefined,
            retryCount: 0,
            progress: 0,
          });
          await UploadQueue.enqueue(photo.id, photo.localUri, undefined, {
            collection: 'user_photos',
            uid,
          });
          await UploadQueue.process();
        } catch (error) {
          safeLogError('MyPhotosScreen.retryPhoto', error, { photoId: photo.id });
        }
      })();
    },
    [uid],
  );

  const deletePhoto = useCallback(
    (photo: UserPhoto) => {
      Alert.alert(text.deleteTitle, text.deleteText, [
        { text: text.no, style: 'cancel' },
        {
          text: text.yes,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(photo.id);
              try {
                await photoService.delete(photo.id);
              } catch (error) {
                safeLogError('MyPhotosScreen.deletePhoto', error, { photoId: photo.id });
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]);
    },
    [text],
  );

  const selectPhoto = useCallback(
    (photo: UserPhoto) => {
      if (!selectMode) return;
      if (photo.status !== 'uploaded') {
        Alert.alert(selectText.waitTitle, selectText.waitBody);
        return;
      }
      selectedForAttachmentRef.current = true;
      PhotoSelector.select(photo);
      handleBack();
    },
    [handleBack, selectMode, selectText],
  );

  const renderLocalPhoto = ({ item }: { item: UserPhoto }) => {
    const displayUri = getPhotoThumbnailUri(item) || getBestPhotoUri(item) || item.localUri || '';
    const busy = item.status === 'uploading' || deletingId === item.id;
    const uploadProgress = Math.max(0, Math.min(100, item.progress ?? (item.status === 'uploaded' ? 100 : 0)));

    return (
      <TouchableOpacity
        style={styles.photoCard}
        activeOpacity={0.86}
        onPress={() => {
          if (selectMode) {
            selectPhoto(item);
          } else if (displayUri) {
            setPreviewPhoto({
              uri: getBestPhotoUri(item) || displayUri,
              storagePath: item.storagePath,
            });
          }
        }}
        disabled={deletingId === item.id}
      >
        {displayUri ? (
          <AppPhotoImage
            uri={displayUri}
            storagePath={item.storagePath}
            style={styles.photo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.photoFallback}>
            <MaterialCommunityIcons name="image-off-outline" size={28} color={SCREEN_THEME.textMuted} />
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: statusColor[item.status] }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={styles.statusText}>{statusLabels[item.status]}</Text>
        </View>
        {selectMode && item.status !== 'uploaded' ? (
          <View style={styles.uploadProgressWrap}>
            <View style={styles.uploadProgressTrack}>
              <View style={[styles.uploadProgressFill, { width: `${Math.max(8, uploadProgress)}%` }]} />
            </View>
            <Text style={styles.uploadProgressText}>
              {uploadProgress > 0 ? `${uploadProgress}%` : selectText.waitNotice}
            </Text>
          </View>
        ) : null}
        {selectMode ? (
          <View style={styles.selectOverlay}>
            <MaterialCommunityIcons
              name={item.status === 'uploaded' ? 'check-circle-outline' : 'progress-upload'}
              size={24}
              color="#fff"
            />
          </View>
        ) : item.status === 'error' ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => retryPhoto(item)}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deletePhoto(item)}
            disabled={busy}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderRtdbPhoto = (photo: RtdbPhoto) => {
    const selectable = photo.status === 'not_submitted' || photo.status === 'rejected';
    const selected = selectedForReview.includes(photo.id);
    const badgeLabel = photo.status === 'pending'
      ? text.sectionPending
      : photo.status === 'approved'
        ? text.sectionApproved
        : photo.status === 'rejected'
          ? text.sectionRejected
          : text.saved;
    const badgeColor = photo.status === 'pending'
      ? '#F57F17'
      : photo.status === 'rejected'
        ? SCREEN_THEME.terracottaDark
        : SCREEN_THEME.woodGreenDark;

    return (
      <TouchableOpacity
        key={photo.id}
        style={[sStyles.rtdbCard, selected && styles.selectedCard]}
        activeOpacity={0.88}
        onPress={() => {
          if (selectMode) {
            selectedForAttachmentRef.current = true;
            PhotoSelector.select({
              id: photo.id,
              userId,
              localUri: photo.imageUri,
              imageUrl: photo.imageUri,
              status: 'uploaded',
              thumbnail: photo.imageUri,
              storagePath: photo.storagePath,
              createdAt: photo.uploadedAt || Date.now(),
              updatedAt: photo.uploadedAt || Date.now(),
              moderationStatus: photo.status,
            });
            handleBack();
            return;
          }
          if (selectable) {
            togglePhotoForReview(photo);
            return;
          }
          setPreviewPhoto({ uri: photo.imageUri, storagePath: photo.storagePath });
        }}
        onLongPress={() => setPreviewPhoto({ uri: photo.imageUri, storagePath: photo.storagePath })}
      >
        <AppPhotoImage
          uri={photo.imageUri}
          storagePath={photo.storagePath}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          debugLabel="MyPhotosUnified"
        />
        <View style={[styles.savedBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.statusText}>{badgeLabel}</Text>
        </View>
        {selectable ? (
          <View style={[styles.reviewSelectBadge, selected && styles.reviewSelectBadgeActive]}>
            <MaterialCommunityIcons
              name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'}
              size={22}
              color="#fff"
            />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const hasAnyPhotos =
    displayedLocalPhotos.length > 0 ||
    pendingPhotos.length > 0 ||
    savedPhotos.length > 0 ||
    approvedPhotos.length > 0 ||
    rejectedPhotos.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.82}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{selectMode ? text.selectHint : text.subtitle}</Text>
        </View>
      </View>

      {limitReached && !selectMode ? (
        <View style={styles.pendingBanner}>
          <MaterialCommunityIcons name="image-multiple-outline" size={18} color="#FFF8E1" />
          <Text style={styles.pendingBannerText}>{text.limitReached}</Text>
        </View>
      ) : null}

      {selectMode ? (
        <View style={[styles.pendingBanner, hasAnyPhotos ? styles.selectModeBanner : undefined]}>
          <MaterialCommunityIcons
            name={hasAnyPhotos ? (hasUploadingLocalPhotos ? 'progress-upload' : 'gesture-tap') : 'image-plus'}
            size={18}
            color="#FFF8E1"
          />
          <Text style={styles.pendingBannerText}>
            {!hasAnyPhotos ? selectText.emptyNotice : hasUploadingLocalPhotos ? selectText.waitNotice : selectText.chooseReady}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!hasAnyPhotos && !rtdbLoading ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={42}
              color={SCREEN_THEME.textMuted}
            />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyText}</Text>
          </View>
        ) : null}

        {rtdbLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={SCREEN_THEME.terracotta} />
          </View>
        ) : null}

        {rtdbPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionAll}
              count={rtdbPhotos.length}
              color={SCREEN_THEME.enamelBlueDark}
            />
            <Text style={styles.reviewHint}>{selectMode ? selectText.chooseReady : text.selectForReview}</Text>
            <View style={styles.grid}>
              {rtdbPhotos.map(renderRtdbPhoto)}
            </View>
          </View>
        ) : null}

        {/* Section: Local in-flight uploads */}
        {displayedLocalPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label={text.sectionUploading} count={displayedLocalPhotos.length} />
            <FlatList
              data={displayedLocalPhotos}
              keyExtractor={(item: UserPhoto) => item.id}
              renderItem={renderLocalPhoto}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={localPhotos.length > 1 ? styles.gridRow : undefined}
            />
          </View>
        ) : null}
      </ScrollView>

      {selectedCount > 0 ? (
        <TouchableOpacity
          style={[styles.reviewButton, submittingReview && styles.addButtonDisabled]}
          onPress={() => void submitSelectedForReview()}
          activeOpacity={0.88}
          disabled={submittingReview}
        >
          {submittingReview ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="send-check-outline" size={20} color="#fff" />}
          <Text style={styles.addButtonText}>
            {submittingReview ? text.submittingForReview : `${text.submitForReview} (${selectedCount})`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* FAB — disabled when the personal gallery limit is reached */}
      <TouchableOpacity
        style={[styles.addButton, selectedCount > 0 && styles.addButtonRaised, addButtonDisabled && styles.addButtonDisabled]}
        onPress={() => void addPhoto()}
        activeOpacity={0.88}
        disabled={addButtonDisabled}
      >
        {adding ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <MaterialCommunityIcons name={limitReached ? 'image-multiple-outline' : 'plus'} size={22} color="#fff" />
        )}
        <Text style={styles.addButtonText}>
          {limitReached ? `${totalPhotoCount}/${MAX_USER_PHOTOS}` : text.add}
        </Text>
      </TouchableOpacity>

      {/* Preview modal */}
      <Modal
        visible={Boolean(previewPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <TouchableOpacity
          style={styles.previewBackdrop}
          activeOpacity={1}
          onPress={() => setPreviewPhoto(null)}
        >
          {previewPhoto ? (
            <AppPhotoImage
              uri={previewPhoto.uri}
              storagePath={previewPhoto.storagePath}
              style={styles.previewImage}
              resizeMode="contain"
              debugLabel="MyPhotosPreview"
            />
          ) : null}
          <View style={styles.previewCloseHint}>
            <Text style={styles.previewCloseText}>×</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 24, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  subtitle: { marginTop: 4, color: SCREEN_THEME.textSecondary, lineHeight: 19, fontWeight: '600' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E65100',
  },
  selectModeBanner: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
  },
  pendingBannerText: {
    flex: 1,
    color: '#FFF8E1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 110 },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  section: { marginBottom: 18 },
  reviewHint: {
    marginTop: -4,
    marginBottom: 10,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridRow: { gap: 12 },
  photoCard: {
    width: '47%',
    height: 190,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  selectedCard: {
    borderWidth: 3,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  photo: { width: '100%', height: '100%' },
  photoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  statusBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  savedBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: SCREEN_THEME.woodGreenDark,
  },
  reviewSelectBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(33, 42, 52, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSelectBadgeActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
  },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  uploadProgressWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 42,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(33, 42, 52, 0.76)',
  },
  uploadProgressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  uploadProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  uploadProgressText: {
    marginTop: 5,
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(91, 38, 29, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(91, 38, 29, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(38, 95, 71, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginTop: 24,
  },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 20,
    fontWeight: '600',
  },
  addButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonRaised: { bottom: 86 },
  addButtonDisabled: { opacity: 0.55 },
  reviewButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '94%', height: '50%', borderRadius: 12 },
  previewCloseHint: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

const sStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionLabel: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  sectionBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: SCREEN_THEME.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  rtdbCard: {
    width: '47%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    position: 'relative',
  },
});

export default MyPhotosScreen;
