import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { equalTo, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { useSelector } from 'react-redux';

import AppPhotoImage from '../components/AppPhotoImage';
import FeedLikeButton from '../components/FeedLikeButton';
import MiniTabBar from '../components/MiniTabBar';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { database } from '../firebase-core';
import { photoAPI } from '../firebase-config';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import InlineFieldHint from '../components/InlineFieldHint';
import { useSoftToast } from '../hooks/useSoftToast';
import { logClientError } from '../utils/errorLogger';

const MAX_PHOTOS = 50;
const UPLOAD_BATCH_SIZE = 3; // слотов в виджете загрузки (избегаем 50 пустых ячеек)
const NUM_COLUMNS = 3;
const GRID_GAP = 3;
const GALLERY_STORAGE_PATH = 'community_photos';
const SUBMITTED_GALLERY_PHOTOS_KEY = '@chaika:foto_rayona_submitted_paths:v1';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото району',
    subtitle: "Додавайте фотографії ЖК Чайка. Фото з'явиться у галереї після перевірки модератором.",
    addPhoto: 'Додати фото',
    photoTitlePlaceholder: 'Назва фото (необов\'язково)',
    uploadWithDescription: 'Завантажити з описом',
    moderationHint: "Після завантаження фото не з'явиться одразу — модератор перевірить його і додасть у галерею.",
    photoCounter: (count: number, max: number) => `Фото: ${count} / ${max}`,
    limitReached: 'Досягнуто ліміт фото. Нові фото можна буде додати після видалення старих.',
    sent: 'Фото надіслано на модерацію',
    sendToModeration: 'Надіслати на модерацію',
    noPhotosReady: 'Спочатку дочекайтесь завершення завантаження фото.',
    sendError: 'Не вдалося надіслати фото на модерацію. Спробуйте ще раз.',
    emptyTitle: 'Поки немає фотографій',
    emptyText: "Додайте перше фото. Воно з'явиться після схвалення модератором.",
    loginToUpload: 'Увійдіть в акаунт, щоб додати фото.',
  },
  ru: {
    title: 'Фото района',
    subtitle: 'Добавляйте фотографии ЖК Чайка. Фото появится в галерее после проверки модератором.',
    addPhoto: 'Добавить фото',
    photoTitlePlaceholder: 'Название фото (необязательно)',
    uploadWithDescription: 'Загрузить с описанием',
    moderationHint: 'После загрузки фото не появится сразу — модератор проверит его и добавит в галерею.',
    photoCounter: (count: number, max: number) => `Фото: ${count} / ${max}`,
    limitReached: 'Достигнут лимит фото. Новые фото можно будет добавить после удаления старых.',
    sent: 'Фото отправлено на модерацию',
    sendToModeration: 'Отправить на модерацию',
    noPhotosReady: 'Сначала дождитесь завершения загрузки фото.',
    sendError: 'Не удалось отправить фото на модерацию. Попробуйте ещё раз.',
    emptyTitle: 'Пока нет фотографий',
    emptyText: 'Добавьте первое фото. Оно появится после одобрения модератором.',
    loginToUpload: 'Войдите в аккаунт, чтобы добавить фото.',
  },
  en: {
    title: 'District photos',
    subtitle: 'Add photos of Chaika. Photos appear in the gallery after moderator review.',
    addPhoto: 'Add photo',
    photoTitlePlaceholder: 'Photo title (optional)',
    uploadWithDescription: 'Upload with description',
    moderationHint: 'After upload, the photo will not appear immediately — a moderator will review it first.',
    photoCounter: (count: number, max: number) => `Photos: ${count} / ${max}`,
    limitReached: 'Photo limit reached. New photos can be added after old ones are removed.',
    sent: 'Photo sent for moderation',
    sendToModeration: 'Send for moderation',
    noPhotosReady: 'Wait until photo upload finishes first.',
    sendError: 'Failed to send photo for moderation. Try again.',
    emptyTitle: 'No photos yet',
    emptyText: 'Add the first photo. It will appear after moderator approval.',
    loginToUpload: 'Sign in to add a photo.',
  },
} as const;

type GalleryPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status?: UploadedPhoto['status'];
};

// Структура узла community_photos в RTDB
type RawCommunityPhoto = {
  imageUri?: unknown;
  storagePath?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
};

const toClean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return date;
  }
  return 0;
};

const getPhotoIdentity = (photo: GalleryPhoto): string => photo.storagePath || photo.uri || photo.id;

const GalleryPhotoItem = memo(function GalleryPhotoItem({ item, size, currentUserId }: { item: GalleryPhoto; size: number; currentUserId?: string }) {
  return (
    <View style={[styles.photoCell, { width: size, height: size }]}>
      <AppPhotoImage
        uri={item.uri}
        storagePath={item.storagePath}
        style={styles.photo}
        resizeMode="cover"
        debugLabel={`DistrictGallery:${item.id}`}
        showDebugInfo={false}
      />
      {item.status === 'uploading' ? (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color="#FFFFFF" size="small" />
        </View>
      ) : null}
      <FeedLikeButton
        currentUserId={currentUserId}
        likePath="feed_likes/district_photos"
        likeId={item.id}
        style={styles.photoLikeButton}
      />
    </View>
  );
});

export default function FotoRayonaScreen() {
  const { width } = useWindowDimensions();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const toast = useSoftToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [remotePhotos, setRemotePhotos] = useState<GalleryPhoto[]>([]);
  const [localPhotos, setLocalPhotos] = useState<GalleryPhoto[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [photoTitle, setPhotoTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [submittedPathsVersion, setSubmittedPathsVersion] = useState(0);

  // Отслеживаем пути уже отправленных на модерацию фото (чтобы не дублировать)
  const submittedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void AsyncStorage.getItem(SUBMITTED_GALLERY_PHOTOS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          submittedPathsRef.current = new Set(parsed.filter((item): item is string => typeof item === 'string'));
          setSubmittedPathsVersion((version) => version + 1);
        }
      })
      .catch(() => {});
  }, []);

  const persistSubmittedPaths = useCallback(async () => {
    await AsyncStorage.setItem(SUBMITTED_GALLERY_PHOTOS_KEY, JSON.stringify(Array.from(submittedPathsRef.current)));
  }, []);

  // Читаем одобренные фото из community_photos (после модерации)
  useEffect(() => {
    const photosRef = query(
      ref(database, 'community_photos'),
      orderByChild('status'),
      equalTo('approved'),
      limitToLast(MAX_PHOTOS),
    );

    const unsubscribe = onValue(
      photosRef,
      (snapshot) => {
        try {
          const raw = snapshot.val() as unknown;
          if (!raw) {
            setRemotePhotos([]);
            setLoading(false);
            return;
          }

          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            void logClientError('FotoRayona.loadPhotos.invalidRoot', new Error('Unexpected community_photos shape'), {
              valueType: Array.isArray(raw) ? 'array' : typeof raw,
            });
            setRemotePhotos([]);
            setLoading(false);
            return;
          }

          const photos = Object.entries(raw as Record<string, unknown>)
            .map<GalleryPhoto | null>(([id, value]) => {
              if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                void logClientError('FotoRayona.loadPhotos.invalidItem', new Error('Unexpected community photo item shape'), {
                  id,
                  valueType: Array.isArray(value) ? 'array' : typeof value,
                });
                return null;
              }

              try {
                const photo = value as RawCommunityPhoto;
                const storagePath = toClean(photo.storagePath);
                const uri = toClean(photo.imageUri);
                return {
                  id,
                  uri,
                  storagePath,
                  createdAt: toTimestamp(photo.createdAt) || toTimestamp(photo.uploadedAt),
                  status: undefined,
                } satisfies GalleryPhoto;
              } catch (error) {
                void logClientError('FotoRayona.loadPhotos.item', error, { id });
                return null;
              }
            })
            .filter((photo): photo is GalleryPhoto => photo !== null)
            .filter((photo) => (photo.uri || photo.storagePath) && photo.storagePath?.startsWith(`${GALLERY_STORAGE_PATH}/`))
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
            .slice(0, MAX_PHOTOS);

          setRemotePhotos(photos);
          setLoading(false);
        } catch (error) {
          void logClientError('FotoRayona.loadPhotos.processing', error);
          setRemotePhotos([]);
          setLoading(false);
        }
      },
      (error) => {
        void logClientError('FotoRayona.loadPhotos.firebase', error);
        setRemotePhotos([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  // После успешной загрузки показываем фото локально. В модерацию отправляет отдельная кнопка.
  const handlePhotosChange = useCallback(
    (photos: UploadedPhoto[]) => {
      setUploadedPhotos(photos);
      // Оптимистичный UI: показываем локальные фото пока они грузятся / ждут модерации
      const mapped = photos
        .filter((photo) => photo.status !== 'error')
        .map((photo, index) => ({
          id: photo.storagePath || photo.downloadUrl || photo.localUri || `local-${index}`,
          uri: photo.downloadUrl || photo.thumbUri || photo.localUri,
          storagePath: photo.storagePath,
          createdAt: Date.now() - index,
          status: photo.status,
        }))
        .filter((photo) => photo.uri || photo.storagePath)
        .reverse();

      setLocalPhotos(mapped);
    },
    [],
  );

  const readyToSubmitPhotos = useMemo(
    () => uploadedPhotos.filter((photo) =>
      photo.status === 'done' &&
      Boolean(photo.storagePath) &&
      Boolean(photo.downloadUrl) &&
      !submittedPathsRef.current.has(photo.storagePath as string),
    ),
    [submittedPathsVersion, uploadedPhotos],
  );

  const handleSubmitPhotos = useCallback(async () => {
    if (!user?.id || sending) return;
    if (readyToSubmitPhotos.length === 0) {
      toast.showError(text.noPhotosReady);
      return;
    }

    setSending(true);
    try {
      const title = photoTitle.trim() || 'Фото Чайки';
      let sentCount = 0;
      for (const photo of readyToSubmitPhotos) {
        if (!photo.storagePath || !photo.downloadUrl || submittedPathsRef.current.has(photo.storagePath)) continue;
        const result = await photoAPI.addPhoto({
          title,
          imageUri: photo.downloadUrl,
          storagePath: photo.storagePath,
          uploadedBy: user.name ?? user.email ?? '',
          target: 'gallery_public',
          sourceScreen: 'FotoRayonaScreen',
          sourceScreenLabel: 'Фото района',
          sourceFeature: 'district_gallery_quick_upload',
        });
        if (!result.success) {
          toast.showError(text.sendError);
          continue;
        }
        submittedPathsRef.current.add(photo.storagePath);
        sentCount += 1;
      }
      if (sentCount > 0) {
        await persistSubmittedPaths();
        setSubmittedPathsVersion((version) => version + 1);
        toast.showSuccess(text.sent);
      }
    } catch {
      toast.showError(text.sendError);
    } finally {
      setSending(false);
    }
  }, [persistSubmittedPaths, photoTitle, readyToSubmitPhotos, sending, text.noPhotosReady, text.sendError, text.sent, toast, user]);

  const photos = useMemo(() => {
    const seen = new Set<string>();
    return [...localPhotos, ...remotePhotos]
      .filter((photo) => {
        const identity = getPhotoIdentity(photo);
        if (!identity || seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, MAX_PHOTOS);
  }, [localPhotos, remotePhotos]);
  const photoCount = photos.length;
  const isPhotoLimitReached = photoCount >= MAX_PHOTOS;

  const gridPadding = 10;
  const photoSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: GalleryPhoto }) => <GalleryPhotoItem item={item} size={photoSize} currentUserId={user?.id} />,
    [photoSize, user?.id],
  );

  const header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
        </View>
      </View>
    ),
    [text.subtitle, text.title],
  );

  const footer = useMemo(
    () => (
      <View style={styles.uploadCard}>
        <Text style={styles.uploadTitle}>{text.addPhoto}</Text>
        {user ? (
          <>
            <TextInput
              value={photoTitle}
              onChangeText={setPhotoTitle}
              placeholder={text.photoTitlePlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={styles.titleInput}
              maxLength={80}
            />
            <Text style={styles.photoCounter}>{text.photoCounter(photoCount, MAX_PHOTOS)}</Text>
            {isPhotoLimitReached ? (
              <InlineFieldHint message={text.limitReached} type="hint" />
            ) : (
              <PhotoUploadField
                uid={user.id}
                userName={user.name ?? user.email ?? ''}
                maxPhotos={Math.min(UPLOAD_BATCH_SIZE, MAX_PHOTOS - photoCount)}
                storagePath={GALLERY_STORAGE_PATH}
                onPhotosChange={handlePhotosChange}
              />
            )}
            <TouchableOpacity
              style={[styles.submitModerationButton, (sending || readyToSubmitPhotos.length === 0) && styles.submitModerationButtonDisabled]}
              onPress={() => void handleSubmitPhotos()}
              activeOpacity={0.82}
              disabled={sending || readyToSubmitPhotos.length === 0}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitModerationButtonText}>{text.sendToModeration}</Text>
              )}
            </TouchableOpacity>
            <InlineFieldHint message={text.moderationHint} type="hint" />
            <TouchableOpacity
              style={styles.fullFormButton}
              onPress={() => navigation.navigate('PhotoUploadScreen')}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons name="text-box-plus-outline" size={16} color="#8C6A46" />
              <Text style={styles.fullFormButtonText}>{text.uploadWithDescription}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.fullFormButton}
            onPress={() => navigation.navigate('LoginScreen', {})}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="login" size={16} color="#8C6A46" />
            <Text style={styles.fullFormButtonText}>{text.loginToUpload}</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [handlePhotosChange, handleSubmitPhotos, isPhotoLimitReached, navigation, photoCount, photoTitle, readyToSubmitPhotos.length, sending, text, user],
  );

  const empty = useMemo(
    () => (
      <View style={styles.emptyState}>
        {loading ? (
          <ActivityIndicator color={SCREEN_THEME.terracotta} size="large" />
        ) : (
          <>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="image-plus" size={30} color="#8C6A46" />
            </View>
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyText}</Text>
          </>
        )}
      </View>
    ),
    [loading, text.emptyText, text.emptyTitle],
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { paddingHorizontal: 10, paddingBottom: 28 },
  headerWrap: { paddingTop: 12, paddingBottom: 8 },
  headerCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 14,
    marginBottom: 10,
  },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 25,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  uploadCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 12,
    marginTop: 10,
  },
  uploadTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  titleInput: {
    backgroundColor: '#FFFDF6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fullFormButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FAF4EC',
  },
  fullFormButtonText: {
    color: '#8C6A46',
    fontSize: 13,
    fontWeight: '600',
  },
  photoCounter: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  submitModerationButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  submitModerationButtonDisabled: {
    opacity: 0.55,
  },
  submitModerationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  columnWrapper: { gap: GRID_GAP, marginBottom: GRID_GAP },
  photoCell: {
    backgroundColor: '#F0E8D8',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  photoLikeButton: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    minWidth: 42,
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(122, 30, 92, 0.92)',
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3ECE4',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  emptyTitle: {
    marginTop: 14,
    color: SCREEN_THEME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 6,
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
