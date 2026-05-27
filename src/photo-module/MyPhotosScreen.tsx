/**
 * TZ_4.4 — MyPhotosScreen
 *
 * Shows the user's photos in three sections by moderation status:
 *   • «На модерації» — status = 'pending' (blurred preview, badge)
 *   • «Одобрені»     — status = 'approved'
 *   • «Відхилені»    — status = 'rejected' (rejection reason shown)
 *
 * In-flight (uploading/queued/error) photos come from local ImageStorage.
 * Moderation-status photos come from a one-time RTDB get() on focus.
 *
 * TZ_4.5 — Duplicate prevention:
 *   • "Add photo" button is disabled if there are any pending photos.
 *   • A banner is shown: «Ваше фото перевіряється».
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
import { get, ref, query, orderByChild, onValue } from 'firebase/database';
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

/** A photo record fetched from RTDB (user_photos/{uid} node). */
type RtdbPhoto = {
  id: string;
  storagePath: string;
  imageUri: string;
  status: 'pending' | 'approved' | 'rejected';
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
    error: 'Помилка',
    sectionPending: 'На модерації',
    sectionApproved: 'Одобрені',
    sectionRejected: 'Відхилені',
    sectionUploading: 'Завантажуються',
    pendingBanner: 'Ваше фото перевіряється — нові завантаження тимчасово недоступні',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно тільки вам до одобрення',
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
    error: 'Ошибка',
    sectionPending: 'На модерации',
    sectionApproved: 'Одобренные',
    sectionRejected: 'Отклонённые',
    sectionUploading: 'Загружаются',
    pendingBanner: 'Ваше фото проверяется — новые загрузки временно недоступны',
    rejectedReason: 'Причина:',
    moderationNote: 'Видно только вам до одобрения',
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
    error: 'Error',
    sectionPending: 'Under review',
    sectionApproved: 'Approved',
    sectionRejected: 'Rejected',
    sectionUploading: 'Uploading',
    pendingBanner: 'Your photo is being reviewed — new uploads are temporarily unavailable',
    rejectedReason: 'Reason:',
    moderationNote: 'Only visible to you until approved',
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
        status: (val.status === 'approved' || val.status === 'rejected')
          ? (val.status as 'approved' | 'rejected')
          : ('pending' as const),
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

const PendingCard: React.FC<{
  photo: RtdbPhoto;
  onPress: () => void;
  noteText: string;
}> = ({ photo, onPress, noteText }) => (
  <TouchableOpacity style={sStyles.rtdbCard} activeOpacity={0.88} onPress={onPress}>
    {/* Dimmed image — pending photos blurred for other users, dim here to indicate status */}
    <AppPhotoImage
      uri={photo.imageUri}
      storagePath={photo.storagePath}
      style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}
      resizeMode="cover"
      debugLabel="MyPhotosPending"
    />
    <View style={sStyles.moderationOverlay}>
      <MaterialCommunityIcons name="clock-outline" size={16} color="#FFD54F" />
      <Text style={sStyles.moderationText} numberOfLines={2}>
        {noteText}
      </Text>
    </View>
  </TouchableOpacity>
);

const RejectedCard: React.FC<{
  photo: RtdbPhoto;
  reasonLabel: string;
  onPress: () => void;
}> = ({ photo, reasonLabel, onPress }) => (
  <TouchableOpacity
    style={[sStyles.rtdbCard, sStyles.rejectedCard]}
    activeOpacity={0.88}
    onPress={onPress}
  >
    <AppPhotoImage
      uri={photo.imageUri}
      storagePath={photo.storagePath}
      style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
      resizeMode="cover"
      debugLabel="MyPhotosRejected"
    />
    <View style={sStyles.moderationOverlay}>
      <MaterialCommunityIcons name="close-circle-outline" size={16} color="#EF9A9A" />
      {photo.moderationReason ? (
        <Text style={[sStyles.moderationText, { color: '#EF9A9A' }]} numberOfLines={3}>
          {reasonLabel} {photo.moderationReason}
        </Text>
      ) : null}
    </View>
  </TouchableOpacity>
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
  const selectMode = Boolean(route.params?.selectMode);

  const [localPhotos, setLocalPhotos] = useState<UserPhoto[]>([]);
  const [rtdbPhotos, setRtdbPhotos] = useState<RtdbPhoto[]>([]);
  const [rtdbLoading, setRtdbLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);

  const userId = uid || userEmail || 'local-user';

  // Derived moderation sections
  const pendingPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'pending'), [rtdbPhotos]);
  const approvedPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'approved'), [rtdbPhotos]);
  const rejectedPhotos = useMemo(() => rtdbPhotos.filter((p) => p.status === 'rejected'), [rtdbPhotos]);

  // TZ_4.5 — button disabled while any pending photo exists
  const hasPendingPhotos = pendingPhotos.length > 0;
  const addButtonDisabled = hasPendingPhotos || adding;

  const handleBack = useCallback(() => {
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate?.('MainTabs');
  }, [navigation]);

  const loadRtdbPhotos = useCallback(async () => {
    if (!uid) return;
    setRtdbLoading(true);
    try {
      const photos = await fetchUserPhotosFromRtdb(uid);
      setRtdbPhotos(photos);
    } finally {
      setRtdbLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    const unsubscribe = ImageStorage.subscribe((items) =>
      setLocalPhotos(items.filter((item) => !item.deleted)),
    );
    if (selectMode) {
      void ImageStorage.getPhotos().then((existing) => {
        if (existing.filter((item) => !item.deleted).length === 0) {
          void addPhoto();
        }
      });
    }

    return () => {
      unsubscribe();
      if (selectMode) PhotoSelector.cancel();
    };
  }, [selectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time listener for RTDB photos — syncs when moderator approves/rejects
  useEffect(() => {
    if (!uid) return;

    const photosRef = query(
      ref(database, `user_photos/${uid}`),
      orderByChild('uploadedAt')
    );

    const unsubscribe = onValue(
      photosRef,
      async (snapshot) => {
        try {
          const photos = await fetchUserPhotosFromRtdb(uid);
          setRtdbPhotos(photos);
        } catch (err) {
          safeLogError('MyPhotosScreen.onValue', err, { uid });
        }
      },
      (err) => {
        safeLogError('MyPhotosScreen.realtimeListener', err, { uid });
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
      void loadRtdbPhotos();
      return () => subscription.remove();
    }, [handleBack, loadRtdbPhotos]),
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
      if (selectMode) {
        PhotoSelector.select(photo);
        handleBack();
      }
    },
    [handleBack, selectMode, uid, userEmail, userId, userName],
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

  const retryPhoto = useCallback(
    (photo: UserPhoto) => {
      void (async () => {
        try {
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
      PhotoSelector.select(photo);
      handleBack();
    },
    [handleBack, selectMode],
  );

  const renderLocalPhoto = ({ item }: { item: UserPhoto }) => {
    const displayUri = getPhotoThumbnailUri(item) || getBestPhotoUri(item) || item.localUri || '';
    const busy = item.status === 'uploading' || deletingId === item.id;

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
            resizeMode="cover"
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
        {selectMode ? (
          <View style={styles.selectOverlay}>
            <MaterialCommunityIcons name="check-circle-outline" size={24} color="#fff" />
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

  const hasAnyPhotos =
    localPhotos.length > 0 ||
    pendingPhotos.length > 0 ||
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

      {/* TZ_4.5 — Banner: disabled while photo is pending */}
      {hasPendingPhotos && !selectMode ? (
        <View style={styles.pendingBanner}>
          <MaterialCommunityIcons name="clock-check-outline" size={18} color="#FFF8E1" />
          <Text style={styles.pendingBannerText}>{text.pendingBanner}</Text>
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

        {/* Section: На модерації */}
        {pendingPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionPending}
              count={pendingPhotos.length}
              color="#F57F17"
            />
            <View style={styles.grid}>
              {pendingPhotos.map((photo) => (
                <PendingCard
                  key={photo.id}
                  photo={photo}
                  onPress={() =>
                    setPreviewPhoto({ uri: photo.imageUri, storagePath: photo.storagePath })
                  }
                  noteText={text.moderationNote}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Section: Одобрені */}
        {approvedPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionApproved}
              count={approvedPhotos.length}
              color={SCREEN_THEME.woodGreenDark}
            />
            <View style={styles.grid}>
              {approvedPhotos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={sStyles.rtdbCard}
                  activeOpacity={0.88}
                  onPress={() =>
                    setPreviewPhoto({ uri: photo.imageUri, storagePath: photo.storagePath })
                  }
                >
                  <AppPhotoImage
                    uri={photo.imageUri}
                    storagePath={photo.storagePath}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    debugLabel="MyPhotosApproved"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* Section: Відхилені */}
        {rejectedPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label={text.sectionRejected}
              count={rejectedPhotos.length}
              color={SCREEN_THEME.terracottaDark}
            />
            <View style={styles.grid}>
              {rejectedPhotos.map((photo) => (
                <RejectedCard
                  key={photo.id}
                  photo={photo}
                  reasonLabel={text.rejectedReason}
                  onPress={() =>
                    setPreviewPhoto({ uri: photo.imageUri, storagePath: photo.storagePath })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Section: Local in-flight uploads */}
        {localPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader label={text.sectionUploading} count={localPhotos.length} />
            <FlatList
              data={localPhotos}
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

      {/* FAB — disabled when pending or adding */}
      <TouchableOpacity
        style={[styles.addButton, addButtonDisabled && styles.addButtonDisabled]}
        onPress={() => void addPhoto()}
        activeOpacity={0.88}
        disabled={addButtonDisabled}
      >
        {adding ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <MaterialCommunityIcons
            name={hasPendingPhotos ? 'clock-outline' : 'plus'}
            size={22}
            color="#fff"
          />
        )}
        <Text style={styles.addButtonText}>
          {hasPendingPhotos ? text.sectionPending : text.add}
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
  addButtonDisabled: { opacity: 0.55 },
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
  rejectedCard: { borderColor: '#EF9A9A' },
  moderationOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  moderationText: {
    flex: 1,
    color: '#FFD54F',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
});

export default MyPhotosScreen;
