import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import GuestRegisterBanner from '../components/GuestRegisterBanner';
import { useGuestGuard } from '../hooks/useGuestGuard';
import {
  ActivityIndicator,
  FlatList,
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
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database';
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

const SCREEN_ID = 'SoulPhotosScreen';
const STORAGE_PATH = 'community_photos';
const MAX_ITEMS = 60;
const NUM_COLUMNS = 3;
const GRID_GAP = 7;

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото для душі',
    approvedNote: 'Схвалені модератором фото',
    pending: 'на модерації',
    choose: 'Вибрати фото',
    send: 'Відправити на модерацію',
    sending: 'Фото вже на модерації',
    upload: (p: number) => `завантаження ${p}%`,
    descTitle: 'Опис фото',
    descPlaceholder: 'Опис до 5 слів',
    addressPlaceholder: 'Адреса місця',
    login: 'Увійдіть, щоб додати фото',
    empty: 'Поки немає фото для душі',
    loadError: 'Не вдалося завантажити фото',
    uploadError: 'Не вдалося завантажити фото. Спробуйте ще раз.',
  },
  ru: {
    title: 'Фото для Души',
    approvedNote: 'Одобренные модератором фото',
    pending: 'на модерации',
    choose: 'Выбрать фото',
    send: 'Отправить на модерацию',
    sending: 'Фото уже на модерации',
    upload: (p: number) => `загрузка ${p}%`,
    descTitle: 'Описание фото',
    descPlaceholder: 'Описание до 5 слов',
    addressPlaceholder: 'Адрес места',
    login: 'Войдите, чтобы добавить фото',
    empty: 'Пока нет фото для души',
    loadError: 'Не удалось загрузить фото',
    uploadError: 'Не удалось загрузить фото. Попробуйте ещё раз.',
  },
  en: {
    title: 'Photos for the Soul',
    approvedNote: 'Photos approved by moderators',
    pending: 'in moderation',
    choose: 'Choose photo',
    send: 'Submit for moderation',
    sending: 'Photo is in moderation',
    upload: (p: number) => `uploading ${p}%`,
    descTitle: 'Photo description',
    descPlaceholder: 'Up to 5 words',
    addressPlaceholder: 'Place address',
    login: 'Sign in to add a photo',
    empty: 'No soul photos yet',
    loadError: 'Could not load photos',
    uploadError: 'Failed to upload photo. Please try again.',
  },
} as const;

type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending';
  local?: boolean;
  uploading?: boolean;
  progress?: number;
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
};

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

const limitWords = (value: string, maxWords: number): string => {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return words.slice(0, maxWords).join(' ');
};

const SoulTile = memo(function SoulTile({
  item,
  size,
  pendingLabel,
  uploadLabel,
}: {
  item: SoulPhoto;
  size: number;
  pendingLabel: string;
  uploadLabel: (p: number) => string;
}) {
  const progress = clampProgress(item.progress ?? (item.uploading ? 0 : 100));
  const pending = item.status === 'pending';

  return (
    <View style={[styles.tile, pending ? styles.pendingTile : styles.approvedTile, { width: size, height: size }]}>
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

      {pending && !item.uploading ? (
        <View style={styles.pendingLabel}>
          <Text style={styles.pendingText}>{pendingLabel}</Text>
        </View>
      ) : null}
    </View>
  );
});

export default function SoulPhotosScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const { bannerVisible: guestBannerVisible, hideBanner: hideGuestBanner, guard: guestGuard } = useGuestGuard();
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const [remotePhotos, setRemotePhotos] = useState<SoulPhoto[]>([]);
  const [pickedPhotos, setPickedPhotos] = useState<Record<string, UploadedPhoto>>({});
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void ensureFirebaseAuth()
      .then(() => {
        if (!active) return;
        const photosQuery = query(ref(database, 'community_photos'), orderByChild('sourceScreen'), equalTo(SCREEN_ID));
        unsubscribe = onValue(
          photosQuery,
          (snapshot) => {
            try {
              const value = snapshot.val() as unknown;
              if (!value || typeof value !== 'object' || Array.isArray(value)) {
                if (active) { setRemotePhotos([]); setLoading(false); }
                return;
              }

              const currentUid = user?.id ?? '';
              const items = Object.entries(value as Record<string, unknown>)
                .map<SoulPhoto | null>(([id, raw]) => {
                  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
                  const photo = raw as RawPhoto;
                  const status = clean(photo.status);
                  const owner = clean(photo.uid) || clean(photo.userId);
                  const isApproved = status === 'approved';
                  const isOwnPending = status === 'pending' && Boolean(currentUid) && owner === currentUid;
                  if (!isApproved && !isOwnPending) return null;
                  return {
                    id,
                    uri: clean(photo.thumbnailUrl) || clean(photo.imageUri),
                    storagePath: clean(photo.storagePath),
                    createdAt: timestamp(photo.createdAt) || timestamp(photo.uploadedAt),
                    status: isApproved ? 'approved' : 'pending',
                  };
                })
                .filter((item): item is SoulPhoto => item !== null)
                .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
                .slice(0, MAX_ITEMS);

              if (active) { setRemotePhotos(items); setLoading(false); }
            } catch (error) {
              void logClientError('SoulPhotosScreen.load', error);
              if (active) { setRemotePhotos([]); setLoading(false); }
            }
          },
          (error) => {
            void logClientError('SoulPhotosScreen.firebase', error);
            if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
          },
        );
      })
      .catch((error) => {
        void logClientError('SoulPhotosScreen.auth', error);
        if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [user?.id]);

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
        local: true,
        uploading: photo.status === 'uploading',
        progress: photo.progress,
      }));

    return [...local, ...remotePhotos].slice(0, MAX_ITEMS);
  }, [pickedPhotos, remotePhotos]);

  const pendingCount = data.filter((photo) => photo.status === 'pending').length;
  const hasUploadedLocal = Object.values(pickedPhotos).some((photo) => photo.status === 'done');

  const gridPadding = 12;
  const tileSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: SoulPhoto }) => (
      <SoulTile item={item} size={tileSize} pendingLabel={text.pending} uploadLabel={text.upload} />
    ),
    [text.pending, text.upload, tileSize],
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.78}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.subtitle}>{text.approvedNote}</Text>
    </View>
  );

  const uploadPanel = (
    <View style={styles.uploadPanel}>
      <View style={styles.descriptionRow}>
        <View style={styles.descriptionIcon}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color="#fff" />
        </View>
        <View style={styles.descriptionFields}>
          <Text style={styles.descriptionTitle}>{text.descTitle}</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={text.addressPlaceholder}
            placeholderTextColor="#9B9183"
            style={styles.input}
            maxLength={80}
          />
          <TextInput
            value={description}
            onChangeText={(value) => setDescription(limitWords(value, 5))}
            placeholder={text.descPlaceholder}
            placeholderTextColor="#9B9183"
            style={styles.input}
            maxLength={60}
          />
        </View>
      </View>

      {user ? (
        <View style={styles.realPickerWrap}>
          <PhotoUploadField
            uid={user.id}
            userName={user.name ?? user.email ?? ''}
            maxPhotos={1}
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

      {(hasUploadedLocal || pendingCount > 0) && (
        <View style={styles.statusBadge}>
          <MaterialCommunityIcons name="clock-outline" size={16} color="#fff" />
          <Text style={styles.submitText}>{text.sending}</Text>
        </View>
      )}
    </View>
  );

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
    <SafeAreaView style={styles.container}>
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
      <MiniTabBar />
      <GuestRegisterBanner visible={guestBannerVisible} onClose={hideGuestBanner} />
      <VideoLoadingOverlay visible={loading} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6E9C9' },
  photoList: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 14 },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
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
  pendingText: {
    color: '#77746E',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  uploadPanel: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderTopWidth: 2,
    borderTopColor: '#D8BF8B',
    backgroundColor: '#F6E9C9',
  },
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
  realPickerWrap: {
    overflow: 'hidden',
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
});
