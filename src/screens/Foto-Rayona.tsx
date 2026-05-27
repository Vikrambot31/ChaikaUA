import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { equalTo, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { useSelector } from 'react-redux';

import AppPhotoImage from '../components/AppPhotoImage';
import MiniTabBar from '../components/MiniTabBar';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { database } from '../firebase-core';
import { photoAPI } from '../firebase-config';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import InlineFieldHint from '../components/InlineFieldHint';
import { useSoftToast } from '../hooks/useSoftToast';

const MAX_PHOTOS = 50;
const UPLOAD_BATCH_SIZE = 3; // слотов в виджете загрузки (избегаем 50 пустых ячеек)
const NUM_COLUMNS = 3;
const GRID_GAP = 3;
const GALLERY_STORAGE_PATH = 'community_photos';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото району',
    subtitle: "Додавайте фотографії ЖК Чайка. Фото з'явиться у галереї після перевірки модератором.",
    addPhoto: 'Додати фото',
    uploadWithDescription: 'Завантажити з описом',
    moderationHint: "Після завантаження фото не з'явиться одразу — модератор перевірить його і додасть у галерею.",
    sent: 'Фото надіслано на модерацію',
    sendError: 'Не вдалося надіслати фото на модерацію. Спробуйте ще раз.',
    emptyTitle: 'Поки немає фотографій',
    emptyText: "Додайте перше фото. Воно з'явиться після схвалення модератором.",
    loginToUpload: 'Увійдіть в акаунт, щоб додати фото.',
  },
  ru: {
    title: 'Фото района',
    subtitle: 'Добавляйте фотографии ЖК Чайка. Фото появится в галерее после проверки модератором.',
    addPhoto: 'Добавить фото',
    uploadWithDescription: 'Загрузить с описанием',
    moderationHint: 'После загрузки фото не появится сразу — модератор проверит его и добавит в галерею.',
    sent: 'Фото отправлено на модерацию',
    sendError: 'Не удалось отправить фото на модерацию. Попробуйте ещё раз.',
    emptyTitle: 'Пока нет фотографий',
    emptyText: 'Добавьте первое фото. Оно появится после одобрения модератором.',
    loginToUpload: 'Войдите в аккаунт, чтобы добавить фото.',
  },
  en: {
    title: 'District photos',
    subtitle: 'Add photos of Chaika. Photos appear in the gallery after moderator review.',
    addPhoto: 'Add photo',
    uploadWithDescription: 'Upload with description',
    moderationHint: 'After upload, the photo will not appear immediately — a moderator will review it first.',
    sent: 'Photo sent for moderation',
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

const GalleryPhotoItem = memo(function GalleryPhotoItem({ item, size }: { item: GalleryPhoto; size: number }) {
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
  const [loading, setLoading] = useState(true);

  // Отслеживаем пути уже отправленных на модерацию фото (чтобы не дублировать)
  const submittedPathsRef = useRef<Set<string>>(new Set());

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
        const raw = snapshot.val() as Record<string, RawCommunityPhoto> | null;
        if (!raw) {
          setRemotePhotos([]);
          setLoading(false);
          return;
        }

        const photos = Object.entries(raw)
          .map(([id, value]) => {
            const storagePath = toClean(value.storagePath);
            const uri = toClean(value.imageUri);
            return {
              id,
              uri,
              storagePath,
              createdAt: toTimestamp(value.createdAt) || toTimestamp(value.uploadedAt),
              status: undefined, // approved — оверлей не нужен
            } satisfies GalleryPhoto;
          })
          // Показываем только фото из нашего хранилища (защита от мусорных записей)
          .filter((photo) => (photo.uri || photo.storagePath) && photo.storagePath?.startsWith(`${GALLERY_STORAGE_PATH}/`))
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
          .slice(0, MAX_PHOTOS);

        setRemotePhotos(photos);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, []);

  // После успешной загрузки фото отправляем его в очередь модерации (community_photos)
  const handlePhotosChange = useCallback(
    (photos: UploadedPhoto[]) => {
      // Отправляем на модерацию каждое новое завершённое фото (один раз)
      for (const photo of photos) {
        if (
          user?.id &&
          photo.status === 'done' &&
          photo.storagePath &&
          photo.downloadUrl &&
          !submittedPathsRef.current.has(photo.storagePath)
        ) {
          submittedPathsRef.current.add(photo.storagePath);
          void photoAPI.addPhoto({
            title: 'Фото Чайки',
            imageUri: photo.downloadUrl,
            storagePath: photo.storagePath,
            uploadedBy: user?.name ?? user?.email ?? '',
            target: 'gallery_public',
            sourceScreen: 'FotoRayonaScreen',
            sourceScreenLabel: 'Фото района',
            sourceFeature: 'district_gallery_quick_upload',
          })
            .then((result) => {
              if (result.success) {
                toast.showSuccess(text.sent);
              } else {
                toast.showError(text.sendError);
              }
            })
            .catch(() => toast.showError(text.sendError));
        }
      }

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
    [text.sendError, text.sent, toast, user?.email, user?.id, user?.name],
  );

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

  const gridPadding = 10;
  const photoSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: GalleryPhoto }) => <GalleryPhotoItem item={item} size={photoSize} />,
    [photoSize],
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
            <PhotoUploadField
              uid={user.id}
              userName={user.name ?? user.email ?? ''}
              maxPhotos={UPLOAD_BATCH_SIZE}
              storagePath={GALLERY_STORAGE_PATH}
              onPhotosChange={handlePhotosChange}
            />
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
    [handlePhotosChange, navigation, text.addPhoto, text.loginToUpload, text.moderationHint, text.uploadWithDescription, user],
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
        keyExtractor={getPhotoIdentity}
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
