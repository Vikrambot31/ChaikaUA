import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { database, photoAPI } from '../firebase-config';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { subscribeCurrentUserSecurityRole } from '../services/securityRoles';
import type { CommunityPhoto } from '../types/app';
type PreviewPhoto = { uri: string; storagePath?: string };

const UI_TEXT = {
  ua: {
    title: 'Галерея Чайки',
    subtitle: 'Фото двору, будинків та подій Чайки',
    addPhoto: '+ Додати фото',
    addFormTitle: 'Додати фото до галереї',
    publish: 'Надіслати на модерацію',
    successTitle: 'Успішно',
    successMsg: 'Фото завантажено, чекає перевірки адміна.',
    errorTitle: 'Помилка',
    needPhoto: 'Спочатку додайте фото.',
    info: 'Фото потрапить у галерею після перевірки модератором.',
    monthlyLimitTitle: 'Ліміт на місяць',
    monthlyLimitText: 'Можна додати не більше 5 фото на місяць.',
    monthProgress: (used: number) => `Ліміт: ${used}/5 фото цього місяця`,
    limitReached: 'Ліміт на цей місяць вичерпано',
    galleryTitle: 'Останні фото в галереї',
    noPhotosYet: 'Поки немає жодного фото. Будьте першим!',
    pendingBadge: 'На перевірці',
    rejectedBadge: 'Відхилено',
    loadMore: 'Завантажити ще',
    close: 'Закрити',
  },
  ru: {
    title: 'Галерея Чайки',
    subtitle: 'Фото двора, домов и событий Чайки',
    addPhoto: '+ Добавить фото',
    addFormTitle: 'Добавить фото в галерею',
    publish: 'Отправить на модерацию',
    successTitle: 'Успешно',
    successMsg: 'Фото загружено, ожидает проверки админа.',
    errorTitle: 'Ошибка',
    needPhoto: 'Сначала добавьте фото.',
    info: 'Фото появится в галерее после проверки модератором.',
    monthlyLimitTitle: 'Лимит на месяц',
    monthlyLimitText: 'Можно добавить не более 5 фото в месяц.',
    monthProgress: (used: number) => `Лимит: ${used}/5 фото в этом месяце`,
    limitReached: 'Лимит на этот месяц исчерпан',
    galleryTitle: 'Последние фото в галерее',
    noPhotosYet: 'Фото пока нет. Будьте первым!',
    pendingBadge: 'На проверке',
    rejectedBadge: 'Отклонено',
    loadMore: 'Загрузить ещё',
    close: 'Закрыть',
  },
  en: {
    title: 'Chaika Gallery',
    subtitle: 'Photos of Chaika yards, buildings, and events',
    addPhoto: '+ Add photo',
    addFormTitle: 'Add photo to gallery',
    publish: 'Submit for moderation',
    successTitle: 'Success',
    successMsg: 'The photo was uploaded and is waiting for admin review.',
    errorTitle: 'Error',
    needPhoto: 'Add a photo first.',
    info: 'The photo will appear in the gallery after moderator review.',
    monthlyLimitTitle: 'Monthly limit',
    monthlyLimitText: 'You can add no more than 5 photos per month.',
    monthProgress: (used: number) => `Limit: ${used}/5 photos this month`,
    limitReached: 'Monthly limit reached',
    galleryTitle: 'Latest gallery photos',
    noPhotosYet: 'No photos yet. Be the first!',
    pendingBadge: 'Under review',
    rejectedBadge: 'Rejected',
    loadMore: 'Load more',
    close: 'Close',
  },
} as const;

const MONTHLY_LIMIT = 5;
const UNLIMITED_GALLERY_UPLOAD_EMAIL = 'vikramsave@ukr.net';

const isPublicGalleryPhotoRecord = (record: Record<string, unknown> | null | undefined): boolean => {
  if (!record) return false;
  const target = typeof record.target === 'string' ? record.target : '';
  if (target === 'my_photos') return false;
  if (target === 'gallery_public') return true;

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  return Boolean(title) && title !== 'Photo' && title !== 'Р¤РѕС‚Рѕ';
};

const mapCommunityPhotoRecord = (id: string, value: unknown): CommunityPhoto => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = record.status === 'approved' || record.status === 'rejected' ? record.status : 'pending';
  const createdAt = typeof record.createdAt === 'number'
    ? record.createdAt
    : typeof record.uploadedAt === 'number'
      ? record.uploadedAt
      : Date.now();

  return {
    id,
    title: typeof record.title === 'string' ? record.title : 'Photo',
    description: typeof record.description === 'string' ? record.description : '',
    imageUri: typeof record.imageUri === 'string' ? record.imageUri : '',
    storagePath: typeof record.storagePath === 'string' ? record.storagePath : undefined,
    uploadedBy: typeof record.uploadedBy === 'string' ? record.uploadedBy : 'Anonymous',
    userId: typeof record.userId === 'string' ? record.userId : undefined,
    createdAt: new Date(createdAt),
    status,
    target: record.target === 'my_photos' ? 'my_photos' : 'gallery_public',
    likes: typeof record.likes === 'number' ? record.likes : 0,
    locationLabel: typeof record.locationLabel === 'string' ? record.locationLabel : undefined,
    locationType: record.locationType === 'building' || record.locationType === 'place' ? record.locationType : undefined,
    moderationReason: typeof record.moderationReason === 'string' ? record.moderationReason : undefined,
    rejectionReason: typeof record.rejectionReason === 'string' ? record.rejectionReason : undefined,
  };
};

const GalleryChaikaScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];

  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [communityPhotos, setCommunityPhotos] = useState<CommunityPhoto[]>([]);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const isUnlimitedGalleryUploader = (user?.email || '').trim().toLowerCase() === UNLIMITED_GALLERY_UPLOAD_EMAIL;

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return undefined;
    }

    return subscribeCurrentUserSecurityRole((snapshot) => {
      setIsAdmin(snapshot.role === 'admin' || snapshot.role === 'moderator');
    });
  }, [user?.id]);

  const loadGallery = useCallback(async () => {
    setLoadingGallery(true);
    try {
      await ensureFirebaseAuth();
      const snap = await get(ref(database, 'community_photos'));
      const raw = snap.val() as Record<string, unknown> | null;
      const items = Object.entries(raw ?? {})
        .map(([id, value]) => mapCommunityPhotoRecord(id, value))
        .filter((item) =>
          typeof item.imageUri === 'string' &&
          Boolean(item.imageUri) &&
          item.target !== 'my_photos' &&
          (
            isAdmin ||
            item.status === 'approved' ||
            item.userId === user?.id
          )
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 500);

      setCommunityPhotos(items);
      setVisibleCount(12);
    } finally {
      setLoadingGallery(false);
    }
  }, [isAdmin, user?.id]);

  const loadMonthlyLimit = useCallback(async () => {
    if (!user?.id) {
      setMonthlyUsed(MONTHLY_LIMIT);
      return;
    }
    try {
      const authUser = await ensureFirebaseAuth();
      const snap = await get(query(ref(database, 'community_photos'), orderByChild('userId'), equalTo(authUser.uid)));
      const raw = snap.val() as Record<string, Record<string, unknown>> | null;
      if (!raw) { setMonthlyUsed(0); return; }
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const count = Object.values(raw).filter((record) => {
        const createdAt = typeof record?.createdAt === 'number' ? record.createdAt : 0;
        return createdAt >= monthStart && isPublicGalleryPhotoRecord(record);
      }).length;
      setMonthlyUsed(count);
    } catch {
      setMonthlyUsed(0);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadGallery();
    void loadMonthlyLimit();
  }, [loadGallery, loadMonthlyLimit]);

  const handleSubmit = useCallback(async () => {
    const done = formPhotos.filter((p) => p.status === 'done');
    if (done.length === 0) { Alert.alert(text.errorTitle, text.needPhoto); return; }
    if (!user?.id) { navigation.navigate('LoginScreen'); return; }
    if (!isAdmin && !isUnlimitedGalleryUploader && monthlyUsed >= MONTHLY_LIMIT) { Alert.alert(text.monthlyLimitTitle, text.monthlyLimitText); return; }

    setSubmitting(true);
    try {
      const results = await Promise.all(
        done.map((photo) =>
          photoAPI.addPhoto({
            title: 'Фото Чайки',
            imageUri: photo.downloadUrl || photo.storagePath,
            storagePath: photo.storagePath,
            uploadedBy: user?.email || user?.name || 'Anonymous',
            target: 'gallery_public',
          }),
        ),
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        const firstErr = failed[0];
        Alert.alert(text.errorTitle, ('error' in firstErr ? firstErr.error : undefined) ?? 'Upload failed');
        return;
      }
      setAddFormVisible(false);
      setFormPhotos([]);
      Alert.alert(text.successTitle, text.successMsg);
      await Promise.all([loadMonthlyLimit(), loadGallery()]);
    } catch (err) {
      Alert.alert(text.errorTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [formPhotos, isAdmin, isUnlimitedGalleryUploader, monthlyUsed, loadGallery, loadMonthlyLimit, navigation, text, user?.email, user?.id, user?.name]);

  const pickerActiveRef = useRef(false);

  const handlePickerOpenChange = useCallback((isOpen: boolean) => {
    pickerActiveRef.current = isOpen;
  }, []);

  const closeAddForm = useCallback(() => {
    if (pickerActiveRef.current) return;
    setAddFormVisible(false);
    setFormPhotos([]);
  }, []);

  const galleryRows = useMemo(() => communityPhotos.slice(0, visibleCount), [communityPhotos, visibleCount]);
  const hasMore = visibleCount < communityPhotos.length;
  const limitReached = !isAdmin && !isUnlimitedGalleryUploader && monthlyUsed >= MONTHLY_LIMIT;

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Main scrollable content: gallery first ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../../assets/WEBP-version/galery.webp')} style={styles.headerBanner} resizeMode="cover" />

        {/* Header */}
        <View style={styles.heroCard}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        {/* Gallery section — top */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{text.galleryTitle}</Text>
          {loadingGallery ? (
            <View style={styles.galleryLoading}><ActivityIndicator color={SCREEN_THEME.terracotta} /></View>
          ) : galleryRows.length === 0 ? (
            <View style={styles.galleryEmpty}>
              <Text style={styles.galleryEmptyText}>{text.noPhotosYet}</Text>
            </View>
          ) : (
            <>
              <View style={styles.galleryGrid}>
                {galleryRows.map((photo) => {
                  const isPending = photo.status === 'pending';
                  const isRejected = photo.status === 'rejected';
                  return (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.galleryThumbCard}
                      onPress={() => setPreviewPhoto({ uri: String(photo.imageUri || ''), storagePath: photo.storagePath })}
                      activeOpacity={0.85}
                    >
                      <AppPhotoImage
                        uri={photo.imageUri}
                        storagePath={photo.storagePath}
                        style={[
                          styles.galleryThumb,
                          isPending && styles.galleryThumbPending,
                          isRejected && styles.galleryThumbRejected,
                        ]}
                        resizeMode="cover"
                        debugLabel={`Gallery:${photo.id}`}
                      />
                      {isPending || isRejected ? (
                        <View style={[styles.statusOverlayBadge, isRejected && styles.statusOverlayBadgeRejected]}>
                          <Text style={styles.statusOverlayBadgeText}>
                            {isPending ? text.pendingBadge : text.rejectedBadge}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={() => setVisibleCount((n) => Math.min(n + 12, communityPhotos.length))}
                  activeOpacity={0.82}
                >
                  <Text style={styles.loadMoreText}>
                    {text.loadMore} ({communityPhotos.length - visibleCount})
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed "Add photo" bar above MiniTabBar ── */}
      <View style={styles.addBar}>
        <TouchableOpacity
          style={[styles.addBarBtn, limitReached && styles.addBarBtnDisabled]}
          onPress={() => {
            if (limitReached) {
              Alert.alert(text.monthlyLimitTitle, text.monthlyLimitText);
              return;
            }
            setAddFormVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.addBarBtnText}>
            {limitReached ? text.limitReached : text.addPhoto}
          </Text>
        </TouchableOpacity>
      </View>

      <MiniTabBar />

      {/* ── Add photo bottom sheet (same structure as Kuplu-Prodam) ── */}
      <Modal
        visible={addFormVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetOverlay}
        >
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={closeAddForm}
          />
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
              {/* Sheet handle */}
              <View style={styles.sheetHandle} />

              {/* Sheet header */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{text.addFormTitle}</Text>
                <TouchableOpacity onPress={closeAddForm} style={styles.sheetCloseBtn} activeOpacity={0.7}>
                  <Text style={styles.sheetCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.sheetContent}
                style={styles.sheetScroll}
              >
                {/* Limit note */}
                <Text style={styles.limitNote}>{text.monthProgress(monthlyUsed)}</Text>

                {/* Photo upload field */}
                <PhotoUploadField
                  uid={user?.id ?? ''}
                  userName={user?.name ?? ''}
                  maxPhotos={5}
                  storagePath="community_photos"
                  onPhotosChange={(photos) => setFormPhotos(photos.filter((p) => p.status === 'done'))}
                  onPickerOpenChange={handlePickerOpenChange}
                />

                {/* Info hint */}
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>{text.info}</Text>
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || limitReached) && styles.submitBtnDisabled]}
                  onPress={() => { void handleSubmit(); }}
                  disabled={submitting || limitReached}
                  activeOpacity={0.85}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>{text.publish}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Photo preview modal ── */}
      <Modal visible={Boolean(previewPhoto)} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto
            ? <AppPhotoImage uri={previewPhoto.uri} storagePath={previewPhoto.storagePath} style={styles.previewImage} resizeMode="contain" debugLabel="GalleryPreview" />
            : null}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 24 },
  headerBanner: {
    width: '100%',
    marginHorizontal: -16,
    alignSelf: 'center',
    height: 190,
    marginTop: -16,
    marginBottom: 12,
  },

  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  subtitle: { marginTop: 4, color: SCREEN_THEME.textSecondary, textAlign: 'center', lineHeight: 19, fontSize: 13 },

  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 8, marginLeft: 2 },

  galleryLoading: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  galleryEmpty: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    borderStyle: 'dashed',
  },
  galleryEmptyText: { color: SCREEN_THEME.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryThumbCard: {
    width: '47.5%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FFF7E8',
    overflow: 'hidden',
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryThumbPending: { opacity: 0.45 },
  galleryThumbRejected: { opacity: 0.3 },
  statusOverlayBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(50, 50, 50, 0.78)',
  },
  statusOverlayBadgeRejected: { backgroundColor: 'rgba(120, 26, 26, 0.82)' },
  statusOverlayBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  loadMoreBtn: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SCREEN_THEME.terracotta,
    backgroundColor: '#FFF7E8',
  },
  loadMoreText: { color: SCREEN_THEME.terracotta, fontWeight: '800', fontSize: 14 },

  // Fixed add-photo bar above MiniTabBar
  addBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: SCREEN_THEME.appBg,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
  },
  addBarBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBarBtnDisabled: { backgroundColor: '#C0A898' },
  addBarBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },

  // Bottom sheet (same structure as Kuplu-Prodam to prevent unmount on picker return)
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheetScroll: { flexGrow: 0 },
  sheet: {
    backgroundColor: '#FFFAF4',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    minHeight: '88%',
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4C0A8',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE3D5',
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE3D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseTxt: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },

  limitNote: { color: SCREEN_THEME.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 12, marginLeft: 2 },
  infoCard: {
    backgroundColor: '#FFF7E8',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDD9A3',
  },
  infoText: { color: SCREEN_THEME.textSecondary, lineHeight: 19, fontWeight: '600', fontSize: 13 },
  submitBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  // Photo preview modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 16, 14, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  previewImage: { width: '100%', height: '100%' },
});

export default GalleryChaikaScreen;
