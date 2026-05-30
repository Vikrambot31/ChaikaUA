import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { logClientError } from '../utils/errorLogger';

const MAX_PHOTOS = 50;
const NUM_COLUMNS = 3;
const GRID_GAP = 3;
const GALLERY_STORAGE_PATH = 'community_photos';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото району',
    subtitle: "Додавайте фотографії ЖК Чайка. Фото з'явиться після перевірки модератором.",
    addPhoto: 'Вибрати фото',
    pendingStatus: 'на модерації',
    uploadProgress: (p: number) => `завантаження ${p}%`,
    descTitle: 'Опис фото',
    descPlaceholder: 'До 5 слів про місце',
    addressPlaceholder: 'Адреса місця',
    save: 'Зберегти',
    cancel: 'Скасувати',
    loginToUpload: 'Увійдіть щоб додати фото',
    emptyTitle: 'Поки немає фотографій',
    emptyText: "Додайте перше фото. Воно з'явиться після схвалення.",
    photoCounter: (c: number, m: number) => `Фото: ${c} / ${m}`,
  },
  ru: {
    title: 'Фото района',
    subtitle: 'Добавляйте фотографии ЖК Чайка. Фото появится после проверки модератором.',
    addPhoto: 'Выбрать фото',
    pendingStatus: 'на модерации',
    uploadProgress: (p: number) => `загрузка ${p}%`,
    descTitle: 'Описание фото',
    descPlaceholder: 'До 5 слов о месте',
    addressPlaceholder: 'Адрес места',
    save: 'Сохранить',
    cancel: 'Отмена',
    loginToUpload: 'Войдите чтобы добавить фото',
    emptyTitle: 'Пока нет фотографий',
    emptyText: 'Добавьте первое фото. Оно появится после одобрения.',
    photoCounter: (c: number, m: number) => `Фото: ${c} / ${m}`,
  },
  en: {
    title: 'District photos',
    subtitle: 'Add photos of Chaika. Photos appear after moderator review.',
    addPhoto: 'Select photo',
    pendingStatus: 'in moderation',
    uploadProgress: (p: number) => `uploading ${p}%`,
    descTitle: 'Photo description',
    descPlaceholder: 'Up to 5 words about the place',
    addressPlaceholder: 'Place address',
    save: 'Save',
    cancel: 'Cancel',
    loginToUpload: 'Sign in to add a photo',
    emptyTitle: 'No photos yet',
    emptyText: 'Add the first photo. It will appear after approval.',
    photoCounter: (c: number, m: number) => `Photos: ${c} / ${m}`,
  },
} as const;

type GalleryPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
};

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

// ─── Approved photo tile ─────────────────────────────────────────────────────

const GalleryPhotoItem = memo(function GalleryPhotoItem({
  item,
  size,
  currentUserId,
}: {
  item: GalleryPhoto;
  size: number;
  currentUserId?: string;
}) {
  return (
    <View style={[styles.photoCell, { width: size, height: size }]}>
      {item.uri ? (
        <AppPhotoImage
          uri={item.uri}
          storagePath={item.storagePath}
          style={styles.photo}
          resizeMode="cover"
          debugLabel={`DistrictGallery:${item.id}`}
          showDebugInfo={false}
        />
      ) : (
        <View style={styles.photoFallback} />
      )}
      <FeedLikeButton
        currentUserId={currentUserId}
        likePath="feed_likes/district_photos"
        likeId={item.id}
        style={styles.photoLikeButton}
      />
    </View>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FotoRayonaScreen() {
  const { width } = useWindowDimensions();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [remotePhotos, setRemotePhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);

  // Description modal
  const [descVisible, setDescVisible] = useState(false);
  const [descText, setDescText] = useState('');
  const [descAddress, setDescAddress] = useState('');

  // Latest uploading/done photo — what the user just picked
  const activeUpload = useMemo(
    () => uploadedPhotos.find((p) => p.status === 'uploading' || p.status === 'done') ?? null,
    [uploadedPhotos],
  );

  // Firebase: approved photos
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
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            setRemotePhotos([]);
            setLoading(false);
            return;
          }
          const photos = Object.entries(raw as Record<string, unknown>)
            .map<GalleryPhoto | null>(([id, value]) => {
              if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
              try {
                const photo = value as RawCommunityPhoto;
                return {
                  id,
                  uri: toClean(photo.imageUri),
                  storagePath: toClean(photo.storagePath),
                  createdAt: toTimestamp(photo.createdAt) || toTimestamp(photo.uploadedAt),
                };
              } catch {
                return null;
              }
            })
            .filter((p): p is GalleryPhoto => p !== null)
            .filter((p) => (p.uri || p.storagePath) && p.storagePath?.startsWith(`${GALLERY_STORAGE_PATH}/`))
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
            .slice(0, MAX_PHOTOS);
          setRemotePhotos(photos);
          setLoading(false);
        } catch (error) {
          void logClientError('FotoRayona.loadPhotos', error);
          setRemotePhotos([]);
          setLoading(false);
        }
      },
      (error) => {
        void logClientError('FotoRayona.firebase', error);
        setRemotePhotos([]);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const handlePhotosChange = useCallback((photos: UploadedPhoto[]) => {
    setUploadedPhotos(photos.filter((p) => p.status !== 'error'));
  }, []);

  const handleDescWordLimit = useCallback((val: string) => {
    const words = val.split(/\s+/).filter(Boolean);
    if (words.length <= 5) {
      setDescText(val);
    } else {
      setDescText(words.slice(0, 5).join(' '));
    }
  }, []);

  const gridPadding = 10;
  const photoSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: GalleryPhoto }) => (
      <GalleryPhotoItem item={item} size={photoSize} currentUserId={user?.id} />
    ),
    [photoSize, user?.id],
  );

  // Header: just the title
  const header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <Text style={styles.headerTitle}>{text.title}</Text>
        {remotePhotos.length > 0 && (
          <Text style={styles.photoCounter}>{text.photoCounter(remotePhotos.length, MAX_PHOTOS)}</Text>
        )}
      </View>
    ),
    [remotePhotos.length, text],
  );

  // Empty state while loading or no photos
  const empty = useMemo(
    () => (
      <View style={styles.emptyState}>
        {loading ? (
          <ActivityIndicator color={SCREEN_THEME.terracotta} size="large" />
        ) : (
          <>
            <MaterialCommunityIcons name="image-plus" size={30} color="#8C6A46" />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyText}</Text>
          </>
        )}
      </View>
    ),
    [loading, text],
  );

  // Footer: pending upload section + pick button
  const footer = useMemo(() => {
    const isUploading = activeUpload?.status === 'uploading';
    const progress = Math.min(100, Math.max(0, Math.round(activeUpload?.progress ?? (isUploading ? 0 : 100))));
    // Show actual photo — localUri is set immediately when user picks
    const photoUri = activeUpload?.localUri || activeUpload?.thumbUri || activeUpload?.downloadUrl || '';

    return (
      <View style={styles.footerWrap}>
        {/* Pending photo section — visible immediately after user picks */}
        {activeUpload ? (
          <View style={styles.pendingCard}>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%` }]} />
            </View>

            {/* Photo row */}
            <View style={styles.pendingRow}>
              {/* Actual photo thumbnail */}
              <View style={styles.pendingThumb}>
                {photoUri ? (
                  <AppPhotoImage
                    uri={photoUri}
                    storagePath={activeUpload.storagePath}
                    style={styles.pendingThumbImg}
                    resizeMode="cover"
                    debugLabel="PendingUpload"
                    showDebugInfo={false}
                  />
                ) : (
                  <View style={styles.pendingThumbFallback} />
                )}
              </View>

              {/* Status texts */}
              <View style={styles.pendingInfo}>
                {isUploading && (
                  <Text style={styles.progressText}>{text.uploadProgress(progress)}</Text>
                )}
                <Text style={styles.pendingStatusText}>{text.pendingStatus}</Text>
              </View>

              {/* Description button */}
              <TouchableOpacity
                style={styles.descBtn}
                onPress={() => setDescVisible(true)}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="pencil-outline" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Pick photo button */}
        {user ? (
          <PhotoUploadField
            uid={user.id}
            userName={user.name ?? user.email ?? ''}
            maxPhotos={3}
            storagePath={GALLERY_STORAGE_PATH}
            onPhotosChange={handlePhotosChange}
            hideSelectedPreview
            metadata={{
              sourceScreen: 'FotoRayonaScreen',
              sourceFeature: 'district_gallery_quick_upload',
            }}
          />
        ) : (
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.navigate('LoginScreen', {})}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons name="login" size={16} color="#8C6A46" />
            <Text style={styles.loginBtnText}>{text.loginToUpload}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [activeUpload, handlePhotosChange, navigation, text, user]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={remotePhotos}
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

      {/* Description modal — slides up from bottom */}
      <Modal
        visible={descVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDescVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDescVisible(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalTitle}>{text.descTitle}</Text>
            <TextInput
              style={styles.modalInput}
              value={descText}
              onChangeText={handleDescWordLimit}
              placeholder={text.descPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              maxLength={60}
            />
            <TextInput
              style={styles.modalInput}
              value={descAddress}
              onChangeText={setDescAddress}
              placeholder={text.addressPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              maxLength={100}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDescVisible(false)}
                activeOpacity={0.82}
              >
                <Text style={styles.modalCancelText}>{text.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => setDescVisible(false)}
                activeOpacity={0.82}
              >
                <Text style={styles.modalSaveText}>{text.save}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { paddingHorizontal: 10, paddingBottom: 28 },

  // Header
  headerWrap: { paddingTop: 14, paddingBottom: 8 },
  headerTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
  },
  photoCounter: {
    marginTop: 4,
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },

  // Grid
  columnWrapper: { gap: GRID_GAP, marginBottom: GRID_GAP },
  photoCell: { backgroundColor: '#F0E8D8', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoFallback: { width: '100%', height: '100%', backgroundColor: '#858584' },
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

  // Footer
  footerWrap: { paddingTop: 10, gap: 10 },

  // Pending upload card
  pendingCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 10,
    gap: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(34,177,76,0.18)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22B14C',
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#D8D1C2',
  },
  pendingThumbImg: { width: '100%', height: '100%' },
  pendingThumbFallback: { width: '100%', height: '100%', backgroundColor: '#858584' },
  pendingInfo: { flex: 1, gap: 3 },
  progressText: { color: '#22A044', fontSize: 12, fontWeight: '900' },
  pendingStatusText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  descBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Login button
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FAF4EC',
    alignSelf: 'flex-start',
  },
  loginBtnText: { color: '#8C6A46', fontSize: 13, fontWeight: '600' },

  // Empty
  emptyState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: { color: SCREEN_THEME.textPrimary, fontSize: 18, fontWeight: '900' },
  emptyText: { color: SCREEN_THEME.textSecondary, textAlign: 'center', lineHeight: 19 },

  // Description modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FAF4EC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: { color: SCREEN_THEME.textPrimary, fontSize: 17, fontWeight: '900' },
  modalInput: {
    backgroundColor: '#FFFDF6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  modalCancelText: { color: SCREEN_THEME.textSecondary, fontSize: 14, fontWeight: '700' },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  modalSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
