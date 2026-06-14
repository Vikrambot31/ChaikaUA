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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import AppPhotoImage from '../components/AppPhotoImage';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { photoService } from '../services/photoService';
import { safeLogError } from '../utils/errorLogger';
import { SCREEN_THEME } from '../utils/screenTheme';
import { showUserError } from '../utils/userFacingErrors';
import ScreenTooltip from '../components/ScreenTooltip';
// HintBadge + useTrainingMode removed — unused after header refactor
import { MY_PHOTOS_TOOLTIP } from '../utils/screenTooltips';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from './ImageStorage';
import { deleteEngineUpload } from './PhotoUploadEngine';
import { UploadQueue } from './UploadQueue';
import type { UserPhoto } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppLanguage = 'ua' | 'ru' | 'en';
type Navigation = {
  goBack: () => void;
  canGoBack?: () => boolean;
  navigate?: (screen: string) => void;
};
type PreviewPhoto = { uri: string; storagePath?: string };
const MAX_USER_PHOTOS = 10;

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
    limitCounterPrefix: 'Завантажено',
    limitCounterOf: 'з',
    sectionAll: 'Мої фото',
    sectionSaved: 'Збережено',
    sectionPending: 'На модерації',
    sectionApproved: 'Одобрені',
    sectionRejected: 'Відхилені',
    sectionUploading: 'Завантажуються',
    pendingBanner: 'Ваше фото перевіряється — нові завантаження тимчасово недоступні',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно тільки вам до одобрення',
    selectForReview: 'Оберіть фото для перевірки або видалення',
    submitForReview: 'Відправити на одобрення',
    submittingForReview: 'Відправляємо...',
    deleteSelected: 'Видалити обрані',
    deletingSelected: 'Видаляємо...',
    deleteSelectedTitle: 'Видалити обрані фото?',
    deleteSelectedText: 'Обрані фото зникнуть з вашої галереї.',
    selectAll: 'Вибрати всі',
    deselectAll: 'Скасувати',
    clearErrors: 'Очистити кеш',
    clearErrorsTitle: 'Видалити фото з помилками?',
    clearErrorsText: 'Всі фото з помилками будуть видалені з пристрою.',
    requestPhotosTitle: 'Фото з ваших заявок',
    requestPhotosNote: 'Зберігаються до 15 днів або за умовами картки, потім видаляються.',
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
    limitCounterPrefix: 'Загружено',
    limitCounterOf: 'из',
    sectionAll: 'Мои фото',
    sectionSaved: 'Сохранено',
    sectionPending: 'На модерации',
    sectionApproved: 'Одобренные',
    sectionRejected: 'Отклонённые',
    sectionUploading: 'Загружаются',
    pendingBanner: 'Ваше фото проверяется — новые загрузки временно недоступны',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно только вам до одобрения',
    selectForReview: 'Выберите фото для проверки или удаления',
    submitForReview: 'Отправить на одобрение',
    submittingForReview: 'Отправляем...',
    deleteSelected: 'Удалить выбранные',
    deletingSelected: 'Удаляем...',
    deleteSelectedTitle: 'Удалить выбранные фото?',
    deleteSelectedText: 'Выбранные фото исчезнут из вашей галереи.',
    selectAll: 'Выбрать все',
    deselectAll: 'Отменить',
    clearErrors: 'Очистить кэш',
    clearErrorsTitle: 'Удалить фото с ошибками?',
    clearErrorsText: 'Все фото с ошибками будут удалены с устройства.',
    requestPhotosTitle: 'Фото из ваших заявок',
    requestPhotosNote: 'Хранятся до 15 дней или по условиям карточки, потом удаляются.',
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
    limitCounterPrefix: 'Uploaded',
    limitCounterOf: 'of',
    sectionAll: 'My photos',
    sectionSaved: 'Saved',
    sectionPending: 'Under review',
    sectionApproved: 'Approved',
    sectionRejected: 'Rejected',
    sectionUploading: 'Uploading',
    pendingBanner: 'Your photo is being reviewed — new uploads are temporarily unavailable',
    rejectedReason: 'Reason:',
    moderationNote: 'Only visible to you until approved',
    selectForReview: 'Select photos for review or deletion',
    submitForReview: 'Send for approval',
    submittingForReview: 'Sending...',
    deleteSelected: 'Delete selected',
    deletingSelected: 'Deleting...',
    deleteSelectedTitle: 'Delete selected photos?',
    deleteSelectedText: 'Selected photos will be removed from your gallery.',
    selectAll: 'Select all',
    deselectAll: 'Deselect',
    clearErrors: 'Clear cache',
    clearErrorsTitle: 'Delete error photos?',
    clearErrorsText: 'All error photos will be removed from the device.',
    requestPhotosTitle: 'Photos from your requests',
    requestPhotosNote: 'Stored for up to 15 days or by the card rules, then deleted.',
  },
} as const;

const REQUEST_PHOTO_PREFIXES = [
  'requests/',
  'lost_found/',
  'buy_sell/',
  'contacts/',
  'local_business/',
  'job_listings/',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_PHOTO_TTL_BY_PREFIX: { prefix: string; ttlMs: number }[] = [
  { prefix: 'buy_sell/', ttlMs: 90 * DAY_MS },
  { prefix: 'contacts/', ttlMs: 30 * DAY_MS },
  { prefix: 'local_business/', ttlMs: 30 * DAY_MS },
  { prefix: 'job_listings/', ttlMs: 30 * DAY_MS },
  { prefix: 'requests/', ttlMs: 15 * DAY_MS },
  { prefix: 'lost_found/', ttlMs: 15 * DAY_MS },
];

const isRequestPhoto = (photo: UserPhoto): boolean => {
  const storagePath = String(photo.storagePath || photo.filePath || '').trim();
  return REQUEST_PHOTO_PREFIXES.some((prefix) => storagePath.startsWith(prefix));
};

const getRequestPhotoTtlMs = (photo: UserPhoto): number => {
  const storagePath = String(photo.storagePath || photo.filePath || '').trim();
  return REQUEST_PHOTO_TTL_BY_PREFIX.find((rule) => storagePath.startsWith(rule.prefix))?.ttlMs ?? 15 * DAY_MS;
};

const isExpiredRequestPhoto = (photo: UserPhoto, now = Date.now()): boolean => {
  if (!isRequestPhoto(photo)) return false;
  const createdAt = Number(photo.createdAt || photo.updatedAt || 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
  return createdAt + getRequestPhotoTtlMs(photo) <= now;
};

const statusColor: Record<UserPhoto['status'], string> = {
  local: SCREEN_THEME.woodGreenDark,
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
  const language = useSelector(
    (state: RootState) => state.language?.current ?? 'ua',
  ) as AppLanguage;
  const uid = useSelector((state: RootState) => state.auth.user?.id ?? '');
  const userEmail = useSelector((state: RootState) => state.auth.user?.email ?? '');
  const text = UI_TEXT[language] ?? UI_TEXT.ru;

  const [localPhotos, setLocalPhotos] = useState<UserPhoto[]>([]);
  const [rtdbPhotos, setRtdbPhotos] = useState<RtdbPhoto[]>([]);
  const [rtdbLoading, setRtdbLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [selectedForReview, setSelectedForReview] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);

  const userId = uid || userEmail || 'local-user';

  // Only show local photos that are NOT yet successfully uploaded.
  // Once status='uploaded', the photo lives in Firebase and should appear
  // in the RTDB section (user_photos) — no need to track it locally anymore.
  const displayedLocalPhotos = useMemo(
    () => localPhotos.filter((photo) => photo.status !== 'uploaded'),
    [localPhotos],
  );
  const requestLocalPhotos = useMemo(
    () => displayedLocalPhotos.filter((photo) => isRequestPhoto(photo) && !isExpiredRequestPhoto(photo)),
    [displayedLocalPhotos],
  );
  const personalLocalPhotos = useMemo(
    () => displayedLocalPhotos.filter((photo) => !isRequestPhoto(photo)),
    [displayedLocalPhotos],
  );
  // Split local photos into distinct groups for clearer UI
  const activeUploadPhotos = useMemo(
    () => personalLocalPhotos.filter((p) => p.status === 'queued' || p.status === 'uploading'),
    [personalLocalPhotos],
  );
  const savedLocalPhotos = useMemo(
    () => personalLocalPhotos.filter((p) => p.status === 'local'),
    [personalLocalPhotos],
  );
  const errorLocalPhotos = useMemo(
    () => personalLocalPhotos.filter((p) => p.status === 'error'),
    [personalLocalPhotos],
  );
  // Counter: only RTDB photos (they represent confirmed saves), plus unsent local ones
  const totalPhotoCount = rtdbPhotos.length + savedLocalPhotos.length + activeUploadPhotos.length + errorLocalPhotos.length;

  const limitReached = totalPhotoCount >= MAX_USER_PHOTOS;
  const selectedCount = selectedForReview.length;
  const selectedReviewableCount = useMemo(() => (
    rtdbPhotos.filter((photo) => selectedForReview.includes(photo.id) && (photo.status === 'not_submitted' || photo.status === 'rejected')).length
  ), [rtdbPhotos, selectedForReview]);

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
    return unsubscribe;
  }, []);

  useEffect(() => {
    const expiredRequestPhotos = localPhotos.filter(isExpiredRequestPhoto);
    if (expiredRequestPhotos.length === 0) return;
    void Promise.all(
      expiredRequestPhotos.map((photo) => ImageStorage.updatePhoto(photo.id, { deleted: true })),
    ).catch((error) => {
      safeLogError('MyPhotosScreen.expiredRequestPhotosCleanup', error, { count: expiredRequestPhotos.length });
    });
  }, [localPhotos]);

  // Real-time listener for RTDB photos — syncs when moderator approves/rejects
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    if (!uid) {
      setRtdbPhotos([]);
      setRtdbLoading(false);
      return () => { active = false; };
    }
    setRtdbLoading(true);

    void ensureFirebaseAuth()
      .then(() => {
        if (!active) return;
        const photosRef = query(
          ref(database, `user_photos/${uid}`),
          orderByChild('uploadedAt')
        );

        unsubscribe = onValue(
          photosRef,
          async (_snapshot) => {
            try {
              const photos = await fetchUserPhotosFromRtdb(uid);
              if (!active) return;
              setRtdbPhotos(photos);
              setRtdbLoading(false);

              // ── Stale-cache cleanup ─────────────────────────────────────────
              // If a local photo has an rtdbId that's no longer in RTDB, it means
              // the upload succeeded at some point but the local status was never
              // updated to 'uploaded' (e.g. app was killed mid-sync). Mark stale
              // entries as deleted so they stop appearing in the error section.
              const rtdbIdSet = new Set(photos.map((p) => p.id));
              const localPhotos = await ImageStorage.getPhotos();
              const staleLocal = localPhotos.filter(
                (p) =>
                  !p.deleted &&
                  p.status !== 'uploaded' &&
                  p.rtdbId &&
                  !rtdbIdSet.has(p.rtdbId),
              );
              if (staleLocal.length > 0) {
                await Promise.all(
                  staleLocal.map((p) => ImageStorage.updatePhoto(p.id, { deleted: true })),
                ).catch((err) => {
                  safeLogError('MyPhotosScreen.staleLocalCleanup', err, { count: staleLocal.length });
                });
              }
            } catch (err) {
              safeLogError('MyPhotosScreen.onValue', err, { uid });
              if (active) setRtdbLoading(false);
            }
          },
          (err) => {
            safeLogError('MyPhotosScreen.realtimeListener', err, { uid });
            if (active) setRtdbLoading(false);
          }
        );
      })
      .catch((err) => {
        safeLogError('MyPhotosScreen.auth', err, { uid });
        if (active) {
          setRtdbPhotos([]);
          setRtdbLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
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
      local: text.uploaded,   // "Готово" — on device, ready to attach
      queued: text.queued,
      uploading: text.uploading,
      uploaded: text.uploaded,
      error: text.error,
    }),
    [text],
  );

  const runAdd = useCallback(
    async (source: 'camera' | 'library') => {
      if (adding) return;
      if (limitReached) {
        Alert.alert(text.add, text.limitReached);
        return;
      }
      setAdding(true);
      try {
        // Photo is saved locally with status='local' — no Firebase upload yet.
        // Upload happens only when the photo is attached to a form and submitted.
        await (source === 'camera'
          ? photoService.addFromCamera({ userId, type: 'gallery' })
          : photoService.addFromLibrary({ userId, type: 'gallery' }));
      } catch (error) {
        safeLogError('MyPhotosScreen.runAdd', error, { source, userId });
        showUserError(language, 'upload', error);
      } finally {
        setAdding(false);
      }
    },
    [adding, language, limitReached, text.add, text.limitReached, userId],
  );

  const addPhoto = useCallback(async () => {
    if (limitReached) {
      Alert.alert(text.add, text.limitReached);
      return;
    }
    if (Platform.OS === 'web') {
      await runAdd('library');
      return;
    }
    Alert.alert(text.add, '', [
      { text: text.camera, onPress: () => { void runAdd('camera'); } },
      { text: text.library, onPress: () => { void runAdd('library'); } },
      { text: text.cancel, style: 'cancel' },
    ]);
  }, [limitReached, runAdd, text]);

  const togglePhotoForReview = useCallback((photo: RtdbPhoto) => {
    setSelectedForReview((prev) => (
      prev.includes(photo.id) ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
    ));
  }, []);

  const submitSelectedForReview = useCallback(async () => {
    const reviewablePhotoIds = rtdbPhotos
      .filter((photo) => selectedForReview.includes(photo.id) && (photo.status === 'not_submitted' || photo.status === 'rejected'))
      .map((photo) => photo.id);
    if (!uid || reviewablePhotoIds.length === 0 || submittingReview || deletingSelected) return;
    setSubmittingReview(true);
    try {
      const now = Date.now();
      await Promise.all(reviewablePhotoIds.map((photoId) => update(ref(database, `user_photos/${uid}/${photoId}`), {
        status: 'pending',
        moderationStatus: 'pending',
        submittedAt: now,
        updatedAt: now,
        moderationReason: null,
      })));
      setSelectedForReview((prev) => prev.filter((photoId) => !reviewablePhotoIds.includes(photoId)));
    } catch (error) {
      safeLogError('MyPhotosScreen.submitSelectedForReview', error, { uid, count: reviewablePhotoIds.length });
      showUserError(language, 'upload', error);
    } finally {
      setSubmittingReview(false);
    }
  }, [deletingSelected, language, rtdbPhotos, selectedForReview, submittingReview, uid]);

  const deleteSelectedRtdbPhotos = useCallback(() => {
    if (!uid || selectedForReview.length === 0 || deletingSelected || submittingReview) return;
    const photosToDelete = rtdbPhotos.filter((photo) => selectedForReview.includes(photo.id));
    if (photosToDelete.length === 0) return;

    Alert.alert(text.deleteSelectedTitle, text.deleteSelectedText, [
      { text: text.no, style: 'cancel' },
      {
        text: text.yes,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeletingSelected(true);
            try {
              await Promise.all(photosToDelete.map((photo) => deleteEngineUpload({
                storagePath: photo.storagePath,
                rtdbId: photo.id,
                collection: 'user_photos',
                uid,
              })));
              setSelectedForReview([]);
              setRtdbPhotos((prev) => prev.filter((photo) => !selectedForReview.includes(photo.id)));
            } catch (error) {
              showUserError(language, 'delete', error);
              safeLogError('MyPhotosScreen.deleteSelectedRtdbPhotos', error, { uid, count: photosToDelete.length });
            } finally {
              setDeletingSelected(false);
            }
          })();
        },
      },
    ]);
  }, [deletingSelected, language, rtdbPhotos, selectedForReview, submittingReview, text, uid]);

  const allRtdbSelected = rtdbPhotos.length > 0 && rtdbPhotos.every((p) => selectedForReview.includes(p.id));

  const toggleSelectAll = useCallback(() => {
    if (allRtdbSelected) {
      setSelectedForReview([]);
    } else {
      setSelectedForReview(rtdbPhotos.map((p) => p.id));
    }
  }, [allRtdbSelected, rtdbPhotos]);

  const clearAllErrorPhotos = useCallback(() => {
    if (errorLocalPhotos.length === 0) return;
    Alert.alert(text.clearErrorsTitle, text.clearErrorsText, [
      { text: text.no, style: 'cancel' },
      {
        text: text.yes,
        style: 'destructive',
        onPress: () => {
          void Promise.all(
            errorLocalPhotos.map((p) => ImageStorage.updatePhoto(p.id, { deleted: true })),
          ).catch((err) => {
            safeLogError('MyPhotosScreen.clearAllErrorPhotos', err, { count: errorLocalPhotos.length });
          });
        },
      },
    ]);
  }, [errorLocalPhotos, text]);

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

  const renderLocalPhoto = ({ item }: { item: UserPhoto }) => {
    const displayUri = getPhotoThumbnailUri(item) || getBestPhotoUri(item) || item.localUri || '';
    const busy = (item.status === 'uploading' || item.status === 'queued') && deletingId !== item.id;

    return (
      <TouchableOpacity
        style={styles.photoCard}
        activeOpacity={0.86}
        onPress={() => {
          if (displayUri) {
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
        {item.status === 'error' ? (
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

  const renderRequestPhoto = (photo: UserPhoto) => {
    const displayUri = getPhotoThumbnailUri(photo) || getBestPhotoUri(photo) || photo.localUri || '';

    return (
      <TouchableOpacity
        key={photo.id}
        style={styles.requestPhotoThumb}
        activeOpacity={0.84}
        onPress={() => {
          if (displayUri) {
            setPreviewPhoto({
              uri: getBestPhotoUri(photo) || displayUri,
              storagePath: photo.storagePath,
            });
          }
        }}
      >
        {displayUri ? (
          <AppPhotoImage
            uri={displayUri}
            storagePath={photo.storagePath}
            style={styles.requestPhotoImage}
            resizeMode="cover"
            debugLabel="MyPhotosRequestThumb"
            showDebugInfo={false}
          />
        ) : (
          <View style={styles.requestPhotoFallback}>
            <MaterialCommunityIcons name="image-off-outline" size={18} color={SCREEN_THEME.textMuted} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderRtdbPhoto = (photo: RtdbPhoto) => {
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
          togglePhotoForReview(photo);
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
        <View style={[styles.reviewSelectBadge, selected && styles.reviewSelectBadgeActive]}>
          <MaterialCommunityIcons
            name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'}
            size={22}
            color="#fff"
          />
        </View>
      </TouchableOpacity>
    );
  };

  const hasAnyPhotos =
    activeUploadPhotos.length > 0 ||
    savedLocalPhotos.length > 0 ||
    errorLocalPhotos.length > 0 ||
    requestLocalPhotos.length > 0 ||
    rtdbPhotos.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={MY_PHOTOS_TOOLTIP.storageKey}
        title={MY_PHOTOS_TOOLTIP.title}
        items={MY_PHOTOS_TOOLTIP.items}
        language={language}
        accentColor={SCREEN_THEME.accentPurple}
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.82}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>
      </View>

      <View style={[styles.photoLimitCounter, limitReached && styles.photoLimitCounterFull]}>
        <MaterialCommunityIcons
          name="image-multiple-outline"
          size={16}
          color={limitReached ? '#8E2E24' : SCREEN_THEME.textSecondary}
        />
        <Text style={[styles.photoLimitCounterText, limitReached && styles.photoLimitCounterTextFull]}>
          {text.limitCounterPrefix}: {totalPhotoCount} {text.limitCounterOf} {MAX_USER_PHOTOS}
        </Text>
      </View>

      {limitReached ? (
        <View style={styles.pendingBanner}>
          <MaterialCommunityIcons name="image-multiple-outline" size={18} color="#FFF8E1" />
          <Text style={styles.pendingBannerText}>{text.limitReached}</Text>
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
            <View style={styles.sectionHeaderRow}>
              <SectionHeader
                label={text.sectionAll}
                count={rtdbPhotos.length}
                color={SCREEN_THEME.enamelBlueDark}
              />
              <TouchableOpacity
                style={styles.selectAllBtn}
                onPress={toggleSelectAll}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons
                  name={allRtdbSelected ? 'checkbox-multiple-marked-outline' : 'checkbox-multiple-blank-outline'}
                  size={16}
                  color={SCREEN_THEME.enamelBlueDark}
                />
                <Text style={styles.selectAllText}>
                  {allRtdbSelected ? text.deselectAll : text.selectAll}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.reviewHint}>{text.selectForReview}</Text>
            <View style={styles.grid}>
              {rtdbPhotos.map(renderRtdbPhoto)}
            </View>
          </View>
        ) : null}

        {/* Section: Currently uploading (queued / uploading) */}
        {activeUploadPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionUploading}
              count={activeUploadPhotos.length}
              color={SCREEN_THEME.enamelBlueDark}
            />
            <FlatList
              data={activeUploadPhotos}
              keyExtractor={(item: UserPhoto) => item.id}
              renderItem={renderLocalPhoto}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={activeUploadPhotos.length > 1 ? styles.gridRow : undefined}
            />
          </View>
        ) : null}

        {/* Section: Saved on device only (not yet submitted to any form) */}
        {savedLocalPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionSaved}
              count={savedLocalPhotos.length}
            />
            <FlatList
              data={savedLocalPhotos}
              keyExtractor={(item: UserPhoto) => item.id}
              renderItem={renderLocalPhoto}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={savedLocalPhotos.length > 1 ? styles.gridRow : undefined}
            />
          </View>
        ) : null}

        {/* Section: Upload errors */}
        {errorLocalPhotos.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <SectionHeader
                label={text.error}
                count={errorLocalPhotos.length}
                color={SCREEN_THEME.terracottaDark}
              />
              <TouchableOpacity
                style={styles.selectAllBtn}
                onPress={clearAllErrorPhotos}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={SCREEN_THEME.terracottaDark} />
                <Text style={[styles.selectAllText, { color: SCREEN_THEME.terracottaDark }]}>
                  {text.clearErrors}
                </Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={errorLocalPhotos}
              keyExtractor={(item: UserPhoto) => item.id}
              renderItem={renderLocalPhoto}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={errorLocalPhotos.length > 1 ? styles.gridRow : undefined}
            />
          </View>
        ) : null}

        {requestLocalPhotos.length > 0 ? (
          <View style={styles.requestPhotosSection}>
            <Text style={styles.requestPhotosTitle}>{text.requestPhotosTitle}</Text>
            <Text style={styles.requestPhotosNote}>{text.requestPhotosNote}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.requestPhotosStrip}
            >
              {requestLocalPhotos.map(renderRequestPhoto)}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {selectedCount > 0 ? (
        <View style={styles.selectedActionBar}>
          <TouchableOpacity
            style={[styles.selectedActionBtn, styles.deleteSelectedButton, (deletingSelected || submittingReview) && styles.addButtonDisabled]}
            onPress={deleteSelectedRtdbPhotos}
            activeOpacity={0.88}
            disabled={deletingSelected || submittingReview}
          >
            {deletingSelected ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="trash-can-outline" size={20} color="#fff" />}
            <Text style={styles.selectedActionText}>
              {deletingSelected ? text.deletingSelected : `${text.deleteSelected} (${selectedCount})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectedActionBtn, styles.reviewSelectedButton, (submittingReview || deletingSelected || selectedReviewableCount === 0) && styles.addButtonDisabled]}
            onPress={() => void submitSelectedForReview()}
            activeOpacity={0.88}
            disabled={submittingReview || deletingSelected || selectedReviewableCount === 0}
          >
            {submittingReview ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="send-check-outline" size={20} color="#fff" />}
            <Text style={styles.selectedActionText}>
              {submittingReview ? text.submittingForReview : `${text.submitForReview} (${selectedReviewableCount})`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* FAB — disabled when the personal gallery limit is reached */}
      <TouchableOpacity
        style={[styles.addButton, selectedCount > 0 && styles.addButtonRaised, (adding || limitReached) && styles.addButtonDisabled]}
        onPress={() => void addPhoto()}
        activeOpacity={0.88}
        disabled={adding}
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
  photoLimitCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  photoLimitCounterFull: {
    backgroundColor: '#FFF1ED',
    borderColor: 'rgba(142, 46, 36, 0.34)',
  },
  photoLimitCounterText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '900',
  },
  photoLimitCounterTextFull: {
    color: '#8E2E24',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#8E2E24',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
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
  requestPhotosSection: {
    marginTop: 2,
    marginBottom: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
  },
  requestPhotosTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  requestPhotosNote: {
    marginTop: 3,
    color: SCREEN_THEME.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  requestPhotosStrip: {
    paddingTop: 8,
    paddingBottom: 2,
    gap: 7,
  },
  requestPhotoThumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  requestPhotoImage: {
    width: '100%',
    height: '100%',
  },
  requestPhotoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
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
    backgroundColor: '#7d0e59',
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
  selectedActionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: 'row',
    gap: 8,
  },
  selectedActionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
  },
  deleteSelectedButton: {
    backgroundColor: '#7d0e59',
  },
  reviewSelectedButton: {
    backgroundColor: '#7d0e59',
  },
  selectedActionText: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
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
