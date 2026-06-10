import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GuestRegisterBanner from '../components/GuestRegisterBanner';
import { useGuestGuard } from '../hooks/useGuestGuard';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { onValue, ref, update } from 'firebase/database';
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
const PHOTO_UPLOAD_SCREEN_ID = 'PhotoUploadScreen';
const STORAGE_PATH = 'community_photos';
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
    categoryRequired: 'Оберіть категорію для фото',
    submitBtn: 'Відправити на модерацію',
    submitting: 'Надсилаємо...',
    uploadingLabel: 'Фото завантажується...',
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
    empty: 'Пока нет фото в этой категории',
    loadError: 'Не удалось загрузить фото',
    uploadError: 'Не удалось загрузить фото. Попробуйте ещё раз.',
    tabAll: 'Все',
    categoryLabel: 'Категория',
    categoryRequired: 'Выберите категорию для фото',
    submitBtn: 'Отправить на модерацию',
    submitting: 'Отправляем...',
    uploadingLabel: 'Фото загружается...',
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
    empty: 'No photos in this category yet',
    loadError: 'Could not load photos',
    uploadError: 'Failed to upload photo. Please try again.',
    tabAll: 'All',
    categoryLabel: 'Category',
    categoryRequired: 'Choose a category for this photo',
    submitBtn: 'Submit for moderation',
    submitting: 'Submitting...',
    uploadingLabel: 'Photo is uploading...',
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
  status: 'approved' | 'pending';
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

const limitWords = (value: string, maxWords: number): string => {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return words.slice(0, maxWords).join(' ');
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
                  if (sourceScreen !== SCREEN_ID && sourceScreen !== PHOTO_UPLOAD_SCREEN_ID) return;

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
                    status: status === 'approved' ? 'approved' : 'pending',
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

  // Photos that finished uploading to Storage
  const donePhotos = useMemo(
    () => Object.values(pickedPhotos).filter((p) => p.status === 'done'),
    [pickedPhotos],
  );

  // True when at least one done photo hasn't been submitted to moderation yet
  const hasUnsubmitted = useMemo(
    () => donePhotos.some((p) => p.rtdbId && !submittedRtdbIds.has(p.rtdbId)),
    [donePhotos, submittedRtdbIds],
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
    const toSubmit = donePhotos.filter((p) => p.rtdbId && !submittedRtdbIds.has(p.rtdbId));
    if (toSubmit.length === 0) return;

    setSubmitting(true);
    try {
      const batch: Record<string, unknown> = {};
      const now = Date.now();
      for (const photo of toSubmit) {
        batch[`community_photos/${photo.rtdbId}/status`] = 'pending';
        batch[`community_photos/${photo.rtdbId}/moderationStatus`] = 'pending';
        batch[`community_photos/${photo.rtdbId}/updatedAt`] = now;
        // Update category/description/address at submit time so edits are captured
        if (uploadCategory) batch[`community_photos/${photo.rtdbId}/category`] = uploadCategory;
        if (description.trim()) batch[`community_photos/${photo.rtdbId}/description`] = description.trim();
        if (address.trim()) batch[`community_photos/${photo.rtdbId}/locationLabel`] = address.trim();
      }
      await update(ref(database), batch);
      setSubmittedRtdbIds((prev) => new Set([...prev, ...toSubmit.map((p) => p.rtdbId!)]));
    } catch (error) {
      void logClientError('SoulPhotosScreen.submitToModeration', error);
      Alert.alert('', text.uploadError);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, user?.id, donePhotos, submittedRtdbIds, uploadCategory, description, address]);

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

  const gridPadding = 12;
  const tileSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: SoulPhoto }) => {
      if (!item.local && !item.uploading && item.uri) {
        return (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewPhoto(item)}>
            <SoulTile item={item} size={tileSize} pendingLabel={text.pending} uploadLabel={text.upload} />
          </TouchableOpacity>
        );
      }
      return <SoulTile item={item} size={tileSize} pendingLabel={text.pending} uploadLabel={text.upload} />;
    },
    [text.pending, text.upload, tileSize],
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
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.subtitle}>{text.approvedNote}</Text>
      {categoryTabs}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Upload panel
  // ---------------------------------------------------------------------------
  const uploadPanel = (
    <View style={styles.uploadPanel}>
      {categoryPicker}

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
        <View style={[styles.realPickerWrap, !uploadCategory && styles.pickerDisabled]}>
          {!uploadCategory && (
            <View style={styles.pickerBlocker}>
              <MaterialCommunityIcons name="tag-outline" size={17} color="#75684F" />
              <Text style={styles.pickerBlockerText}>{text.categoryRequired}</Text>
            </View>
          )}
          {uploadCategory && (
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
                category: uploadCategory,
                moderationDeferred: true,
              }}
            />
          )}
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
    color: '#75684F',
    fontSize: 13,
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
});
