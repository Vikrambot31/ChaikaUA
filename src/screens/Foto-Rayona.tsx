import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { increment, onValue, ref, update } from 'firebase/database';
import { useSelector } from 'react-redux';
import GuestRegisterBanner from '../components/GuestRegisterBanner';
import { useGuestGuard } from '../hooks/useGuestGuard';

import AppPhotoImage from '../components/AppPhotoImage';
import TactileButton from '../components/TactileButton';
import MiniTabBar from '../components/MiniTabBar';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { logClientError } from '../utils/errorLogger';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';

const SCREEN_ID = 'FotoRayonaScreen';
const PHOTO_UPLOAD_SCREEN_ID = 'PhotoUploadScreen';
const MAX_ITEMS = 60;
const NUM_COLUMNS = 3;
const GRID_GAP = 7;

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото району',
    approvedNote: 'Схвалені модератором фото',
    pending: 'на модерації',
    awaitConfirm: 'чекаю підтвердження',
    confirmBtn: 'Підтвердити',
    confirmingBtn: 'Відправляю...',
    confirmError: 'Не вдалося відправити. Спробуйте ще.',
    addPhoto: 'Додати фото',
    login: 'Увійдіть, щоб додати фото',
    approved: 'схвалено',
    empty: 'Поки немає фото району',
    loadError: 'Не вдалося завантажити фото',
    swipeBtn: 'Листати',
    swipeBack: '← Фото',
    swipeDoneTitle: 'Усі фото переглянуто',
    swipeDoneSub: (n: number) => `Вподобано: ${n}`,
    swipeRestart: 'Почати знову',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛІ →',
  },
  ru: {
    title: 'Фото района',
    approvedNote: 'Одобренные модератором фото',
    pending: 'на модерации',
    awaitConfirm: 'ждёт подтверждения',
    confirmBtn: 'Подтвердить',
    confirmingBtn: 'Отправляю...',
    confirmError: 'Не удалось отправить. Попробуйте ещё.',
    addPhoto: 'Добавить фото',
    login: 'Войдите, чтобы добавить фото',
    approved: 'одобрено',
    empty: 'Пока нет фото района',
    loadError: 'Не удалось загрузить фото',
    swipeBtn: 'Листать',
    swipeBack: '← Фото',
    swipeDoneTitle: 'Все фото просмотрены',
    swipeDoneSub: (n: number) => `Понравилось: ${n}`,
    swipeRestart: 'Начать снова',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛЬШЕ →',
  },
  en: {
    title: 'District Photos',
    approvedNote: 'Photos approved by moderators',
    pending: 'in moderation',
    awaitConfirm: 'awaiting confirmation',
    confirmBtn: 'Confirm',
    confirmingBtn: 'Submitting...',
    confirmError: 'Could not submit. Try again.',
    addPhoto: 'Add photo',
    login: 'Sign in to add a photo',
    approved: 'approved',
    empty: 'No district photos yet',
    loadError: 'Could not load photos',
    swipeBtn: 'Swipe',
    swipeBack: '← Photos',
    swipeDoneTitle: 'All photos viewed',
    swipeDoneSub: (n: number) => `Liked: ${n}`,
    swipeRestart: 'Start again',
    swipeLikeLabel: 'LIKE ♥',
    swipePassLabel: 'NEXT →',
  },
} as const;

type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending' | 'saved';
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
  uploadedBy?: unknown;
  likes?: unknown;
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

const SoulTile = memo(function SoulTile({
  item,
  size,
  pendingLabel,
  approvedLabel,
}: {
  item: SoulPhoto;
  size: number;
  pendingLabel: string;
  approvedLabel: string;
}) {
  const isApproved = item.status === 'approved';
  const showLabel = item.status === 'pending' || item.status === 'saved' || isApproved;
  const label = isApproved ? approvedLabel : pendingLabel;

  return (
    <View style={[styles.tile, isApproved ? styles.approvedTile : styles.pendingTile, { width: size, height: size }]}>
      {item.uri ? (
        <AppPhotoImage
          uri={item.uri}
          storagePath={item.storagePath}
          style={styles.tileImage}
          resizeMode="cover"
          debugLabel={`DistrictPhoto:${item.id}`}
          showDebugInfo={false}
        />
      ) : (
        <View style={styles.grayExample} />
      )}

      {showLabel ? (
        <View style={[styles.pendingLabel, isApproved && styles.approvedLabel]}>
          <Text style={[styles.pendingText, isApproved && styles.approvedText]}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
});

export default function FotoRayonaScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const { guard: guestGuard, bannerVisible: guestBannerVisible, hideBanner: hideGuestBanner } = useGuestGuard();
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const [remotePhotos, setRemotePhotos] = useState<SoulPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<SoulPhoto | null>(null);
  const [submittedRtdbIds, setSubmittedRtdbIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [likedPhotoIds, setLikedPhotoIds] = useState<string[]>([]);
  const everLikedRef = useRef<Set<string>>(new Set());
  const swipePosition = useRef(new Animated.ValueXY()).current;
  const pulseAnim = useMemo(() => new Animated.Value(1), []);
  const pulseLoopRef = React.useRef<Animated.CompositeAnimation | null>(null);

  const deferredPhotos = useMemo(
    () => remotePhotos.filter((p) => p.status === 'saved' && !submittedRtdbIds.has(p.id)),
    [remotePhotos, submittedRtdbIds],
  );
  const hasUnsubmitted = deferredPhotos.length > 0;

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
      pulseAnim.setValue(1);
    }
    return () => {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    };
  }, [hasUnsubmitted, pulseAnim]);

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
                  if (sourceScreen && sourceScreen !== SCREEN_ID && sourceScreen !== PHOTO_UPLOAD_SCREEN_ID) return;

                  const status = clean(photo.status);
                  const author = clean(photo.uploadedBy);
                  const likes = typeof photo.likes === 'number' ? photo.likes : 0;
                  const base: SoulPhoto = {
                    id,
                    uri: clean(photo.thumbnailUrl) || clean(photo.imageUri),
                    storagePath: clean(photo.storagePath),
                    createdAt: timestamp(photo.createdAt) || timestamp(photo.uploadedAt),
                    status: status === 'approved' ? 'approved' : (status === 'saved' ? 'saved' : 'pending'),
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
              void logClientError('FotoRayonaScreen.photosListener', error);
            }
          },
          (error) => {
            void logClientError('FotoRayonaScreen.photosListenerError', error);
            if (active) setLoadError(true);
          },
        );
      })
      .catch((error) => {
        void logClientError('FotoRayonaScreen.auth', error);
        if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
      });

    return () => {
      active = false;
      unsub?.();
    };
  }, [user?.id]);

  const data = useMemo<SoulPhoto[]>(() => {
    return remotePhotos.slice(0, MAX_ITEMS);
  }, [remotePhotos]);

  const gridPadding = 12;
  const tileSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const submitToModeration = useCallback(async () => {
    if (submitting || !user?.id) return;
    const toSubmit = deferredPhotos.filter((p) => !submittedRtdbIds.has(p.id));
    if (toSubmit.length === 0) return;
    setSubmitting(true);
    try {
      const batch: Record<string, unknown> = {};
      const now = Date.now();
      for (const photo of toSubmit) {
        batch[`community_photos/${photo.id}/status`] = 'pending';
        batch[`community_photos/${photo.id}/moderationStatus`] = 'pending';
        batch[`community_photos/${photo.id}/updatedAt`] = now;
      }
      await update(ref(database), batch);
      setSubmittedRtdbIds((prev) => new Set([...prev, ...toSubmit.map((p) => p.id)]));
    } catch (error) {
      void logClientError('FotoRayonaScreen.submitToModeration', error);
      Alert.alert('', text.confirmError);
    } finally {
      setSubmitting(false);
    }
  }, [deferredPhotos, submitting, text.confirmError, user?.id]);

  // ── Swipe mode ──────────────────────────────────────────────────────────────
  const swipeItems = useMemo(() => data.filter((p) => p.status === 'approved' && !!p.uri), [data]);
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
      void logClientError('FotoRayonaScreen.likePhoto', e);
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

  const renderItem = useCallback(
    ({ item }: { item: SoulPhoto }) => {
      const pendingLabel = item.status === 'saved' ? text.awaitConfirm : text.pending;
      if (item.status === 'approved' && item.uri) {
        return (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewPhoto(item)}>
            <SoulTile item={item} size={tileSize} pendingLabel={pendingLabel} approvedLabel={text.approved} />
          </TouchableOpacity>
        );
      }
      return <SoulTile item={item} size={tileSize} pendingLabel={pendingLabel} approvedLabel={text.approved} />;
    },
    [text.approved, text.awaitConfirm, text.pending, tileSize],
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
      {hasUnsubmitted && (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.submitButton, styles.pulsingSubmitButton]}
            onPress={submitToModeration}
            activeOpacity={0.86}
            disabled={submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? text.confirmingBtn : text.confirmBtn}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      <View style={styles.uploadPanelRow}>
        <TouchableOpacity
          style={[styles.submitButton, styles.swipeBtn]}
          onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeIndex(0); setLikedPhotoIds([]); setSwipeMode(true); }}
          activeOpacity={0.86}
        >
          <MaterialCommunityIcons name="cards" size={19} color="#453321" />
          <Text style={[styles.submitText, styles.swipeBtnText]}>{text.swipeBtn}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, styles.addPhotoBtn]}
          onPress={guestGuard(() => navigation.navigate('PhotoUploadScreen'))}
          activeOpacity={0.86}
          disabled={hasUnsubmitted}
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={19} color="#fff" />
          <Text style={styles.submitText}>{text.addPhoto}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      {loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
      ) : (
        <>
          <MaterialCommunityIcons
            name={loadError ? 'wifi-alert' : 'image-outline'}
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
      {/* Photo swipe overlay */}
      {swipeMode ? (() => {
        const swipeCard = swipeItems[swipeIndex];
        const swipeDone = swipeIndex >= swipeItems.length;
        const swipeRotation = swipePosition.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-10deg', '0deg', '10deg'] });
        const likeOpacity = swipePosition.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
        const passOpacity = swipePosition.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
          <View style={photoSwipeStyles.overlay}>
            <TouchableOpacity style={photoSwipeStyles.backBtn} onPress={() => setSwipeMode(false)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#7A2551" />
              <Text style={photoSwipeStyles.backBtnText}>{text.swipeBack}</Text>
            </TouchableOpacity>
            {swipeDone ? (
              <View style={photoSwipeStyles.doneBox}>
                <Text style={photoSwipeStyles.doneTitle}>{text.swipeDoneTitle}</Text>
                <Text style={photoSwipeStyles.doneSub}>{text.swipeDoneSub(likedPhotoIds.length)}</Text>
                <TactileButton
                  title={text.swipeRestart}
                  onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeIndex(0); setLikedPhotoIds([]); }}
                  variant="primary"
                  style={photoSwipeStyles.restartBtn}
                />
              </View>
            ) : (
              <>
                {swipeItems[swipeIndex + 1] ? (
                  <View style={[photoSwipeStyles.card, photoSwipeStyles.cardBack]} pointerEvents="none" />
                ) : null}
                <Animated.View
                  style={[photoSwipeStyles.card, { transform: [{ translateX: swipePosition.x }, { translateY: swipePosition.y }, { rotate: swipeRotation }] }]}
                  {...swipePanResponder.panHandlers}
                >
                  <AppPhotoImage
                    uri={swipeCard?.uri}
                    storagePath={swipeCard?.storagePath}
                    style={photoSwipeStyles.photo}
                    resizeMode="cover"
                    debugLabel={`SwipePhoto:${swipeCard?.id}`}
                    showDebugInfo={false}
                  />
                  <Animated.View style={[photoSwipeStyles.likeOverlay, { opacity: likeOpacity }]}>
                    <Text style={photoSwipeStyles.likeText}>{text.swipeLikeLabel}</Text>
                  </Animated.View>
                  <Animated.View style={[photoSwipeStyles.passOverlay, { opacity: passOpacity }]}>
                    <Text style={photoSwipeStyles.passText}>{text.swipePassLabel}</Text>
                  </Animated.View>
                  {swipeCard?.author ? (
                    <View style={photoSwipeStyles.infoBar}>
                      <Text style={photoSwipeStyles.authorText}>{swipeCard.author}</Text>
                      {(swipeCard.likes ?? 0) > 0 ? <Text style={photoSwipeStyles.likesCount}>{`❤ ${swipeCard.likes}`}</Text> : null}
                    </View>
                  ) : null}
                </Animated.View>
                <View style={photoSwipeStyles.actions}>
                  <TactileButton
                    title=""
                    icon={<MaterialCommunityIcons name="close" size={40} color="#FFFFFF" />}
                    onPress={handleSwipeLeft}
                    variant="secondary"
                    style={photoSwipeStyles.passBtn}
                  />
                  <TactileButton
                    title=""
                    icon={<MaterialCommunityIcons name="heart" size={48} color="#FFFFFF" />}
                    onPress={handleSwipeRight}
                    variant="primary"
                    style={photoSwipeStyles.likeBtn}
                  />
                </View>
                <Text style={photoSwipeStyles.counter}>{swipeIndex + 1} / {swipeItems.length}</Text>
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
                debugLabel={`DistrictPhotoPreview:${previewPhoto.id}`}
                showDebugInfo={false}
              />
              <View style={styles.previewMeta}>
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
  uploadPanelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8FA77A',
    flexDirection: 'row',
    gap: 6,
  },
  swipeBtn: {
    flex: 1,
    backgroundColor: '#F0D98A',
  },
  swipeBtnText: {
    color: '#453321',
  },
  addPhotoBtn: {
    flex: 1,
  },
  pulsingSubmitButton: {
    backgroundColor: '#E74C3C',
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
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '75%',
  },
  previewMeta: {
    marginTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  previewMetaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});

const photoSwipeStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C0A09',
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
    backgroundColor: 'rgba(28,25,23,0.85)',
    borderWidth: 1,
    borderColor: '#7A2551',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
  },
  backBtnText: { color: '#7A2551', fontSize: 13, fontWeight: '800' },
  card: {
    width: 320,
    height: 460,
    borderRadius: 24,
    backgroundColor: '#1C1917',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#7A2551',
    elevation: 12,
    shadowColor: '#7A2551',
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
    backgroundColor: 'rgba(122,37,81,0.9)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    transform: [{ rotate: '-12deg' }],
  },
  likeText: { color: '#1C1917', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  passOverlay: {
    position: 'absolute',
    top: 32,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#FAFAF9',
    transform: [{ rotate: '12deg' }],
  },
  passText: { color: '#FAFAF9', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  infoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(12,10,9,0.75)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorText: { color: '#FAFAF9', fontSize: 14, fontWeight: '800', flex: 1 },
  likesCount: { color: '#7A2551', fontSize: 14, fontWeight: '800' },
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
    backgroundColor: '#FAFAF9',
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
    backgroundColor: '#7A2551',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#7A2551',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  counter: { position: 'absolute', top: 60, alignSelf: 'center', color: '#B5A990', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  doneBox: { alignItems: 'center', gap: 12, padding: 32 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: '#FAFAF9', textAlign: 'center' },
  doneSub: { fontSize: 16, color: '#7A2551', fontWeight: '700' },
  restartBtn: { backgroundColor: '#7A2551', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  restartBtnText: { color: '#1C1917', fontWeight: '900', fontSize: 15 },
});
