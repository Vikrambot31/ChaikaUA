import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { storage } from '../firebase-core';
import { uploadAndSavePhoto, type UploadAndSaveResult } from '../services/unifiedPhotoUpload';
import { safeLogError } from '../utils/errorLogger';
import { uniqueId } from '../utils/cryptoId';
import { SCREEN_THEME } from '../utils/screenTheme';
import { showUserError } from '../utils/userFacingErrors';
import { subscribeCurrentUserSecurityRole } from '../services/securityRoles';
import AppPhotoImage from '../components/AppPhotoImage';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from './ImageStorage';
import { PhotoSelector } from './PhotoSelector';
import type { MyPhotosScreenParams, UserPhoto } from './types';

type AppLanguage = 'ua' | 'ru' | 'en';
type Navigation = {
  goBack: () => void;
  canGoBack?: () => boolean;
  navigate?: (screen: string) => void;
};
type Route = RouteProp<Record<string, MyPhotosScreenParams | undefined>, string>;
type PreviewPhoto = { uri: string; storagePath?: string };

const UI_TEXT = {
  ua: {
    title: 'Мої фотографії',
    subtitle: 'Єдина галерея ваших фото в застосунку.',
    add: 'Додати фото',
    emptyTitle: 'Фото ще немає',
    emptyText: 'Додайте фото один раз, потім використовуйте його в будь-якому розділі.',
    selectHint: 'Оберіть фото для цього розділу',
    deleteTitle: 'Видалити фото?',
    deleteText: 'Фото буде прибрано з вашої галереї.',
    yes: 'Так',
    no: 'Ні',
    cancel: 'Скасувати',
    delete: 'Видалити',
    queued: 'У черзі',
    uploading: 'Завантаження',
    uploaded: 'Готово',
    error: 'Помилка',
    retry: 'Повторити',
  },
  ru: {
    title: 'Мои фотографии',
    subtitle: 'Единая галерея ваших фото в приложении.',
    add: 'Добавить фото',
    emptyTitle: 'Фото пока нет',
    emptyText: 'Добавьте фото один раз, затем используйте его в любом разделе.',
    selectHint: 'Выберите фото для этого раздела',
    deleteTitle: 'Удалить фото?',
    deleteText: 'Фото будет убрано из вашей галереи.',
    yes: 'Да',
    no: 'Нет',
    cancel: 'Отмена',
    delete: 'Удалить',
    queued: 'В очереди',
    uploading: 'Загрузка',
    uploaded: 'Готово',
    error: 'Ошибка',
    retry: 'Повторить',
  },
  en: {
    title: 'My photos',
    subtitle: 'One gallery for all your app photos.',
    add: 'Add photo',
    emptyTitle: 'No photos yet',
    emptyText: 'Add a photo once, then use it in any section.',
    selectHint: 'Choose a photo for this section',
    deleteTitle: 'Delete photo?',
    deleteText: 'The photo will be removed from your gallery.',
    yes: 'Yes',
    no: 'No',
    cancel: 'Cancel',
    delete: 'Delete',
    queued: 'Queued',
    uploading: 'Uploading',
    uploaded: 'Ready',
    error: 'Error',
    retry: 'Retry',
  },
} as const;

const MONTHLY_LIMIT = 5;
const SCREEN_PHOTO_LIMIT = 5;

const getMonthlyLimitTitle = (language: AppLanguage): string => (
  language === 'ru' ? 'Лимит на месяц' : language === 'en' ? 'Monthly limit' : 'Ліміт на місяць'
);

const getMonthlyLimitText = (language: AppLanguage): string => (
  language === 'ru'
    ? 'Можно добавить не более 10 фото в месяц.'
    : language === 'en'
      ? 'You can add no more than 5 photos per month.'
      : 'Можна додати не більше 2 фото на місяць.'
);

const getMonthlyProgressText = (language: AppLanguage, used: number): string => (
  language === 'ru'
    ? `В этом месяце добавлено: ${used}/5`
    : language === 'en'
      ? `Added this month: ${used}/5`
      : `У цьому місяці додано: ${used}/5`
);

const getScreenLimitTitle = (language: AppLanguage): string => (
  language === 'ru' ? 'Лимит на экране' : language === 'en' ? 'Screen limit' : 'Ліміт на екрані'
);

const getScreenLimitText = (language: AppLanguage): string => (
  language === 'ru'
    ? 'На этом экране можно хранить до 10 фото.'
    : language === 'en'
      ? 'You can store up to 5 photos on this screen.'
      : 'На цьому екрані можна зберігати до 10 фото.'
);

const statusColor: Record<UserPhoto['status'], string> = {
  queued: '#A66A00',
  uploading: SCREEN_THEME.enamelBlueDark,
  uploaded: SCREEN_THEME.woodGreenDark,
  error: SCREEN_THEME.terracottaDark,
};

// ─── helpers (same pattern as PhotoUploadField / Kuplu-Prodam) ────────────────

const requestPickerPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) return true;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
};

const copyToCache = async (uri: string): Promise<string> => {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const dest = `${FileSystem.cacheDirectory}photo_${uniqueId()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
};

const makeThumbnail = async (uri: string): Promise<string> => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 360 } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
};

// ─────────────────────────────────────────────────────────────────────────────

const MyPhotosScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const uid = useSelector((state: RootState) => state.auth.user?.id ?? '');
  const userName = useSelector((state: RootState) => state.auth.user?.name ?? '');
  const userEmail = useSelector((state: RootState) => state.auth.user?.email ?? '');
  const text = UI_TEXT[language];
  const selectMode = Boolean(route.params?.selectMode);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);
  // local progress tracking — not persisted to AsyncStorage
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const handleBack = useCallback(() => {
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate?.('MainTabs');
  }, [navigation]);

  useEffect(() => {
    if (!uid) {
      setIsAdmin(false);
      return undefined;
    }

    return subscribeCurrentUserSecurityRole((snapshot) => {
      setIsAdmin(snapshot.role === 'admin');
    });
  }, [uid]);

  useEffect(() => {
    const unsubscribe = ImageStorage.subscribe(setPhotos);

    if (selectMode) {
      void ImageStorage.getPhotos().then((existing) => {
        if (existing.length === 0 && !limitReached) {
          void addPhoto();
        }
      });
    }

    return () => {
      unsubscribe();
      if (selectMode) PhotoSelector.cancel();
    };
  }, [selectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack]),
  );

  const statusLabels = useMemo<Record<UserPhoto['status'], string>>(() => ({
    queued: text.queued,
    uploading: text.uploading,
    uploaded: text.uploaded,
    error: text.error,
  }), [text]);

  const monthlyUsed = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return photos.filter((photo) => Number(photo.createdAt) >= monthStart).length;
  }, [photos]);

  const limitReached = !isAdmin && monthlyUsed >= MONTHLY_LIMIT;
  const screenLimitReached = !isAdmin && photos.length >= SCREEN_PHOTO_LIMIT;

  // ─── upload a single photo to Firebase Storage (same flow as PhotoUploadField) ──

  const uploadToStorage = useCallback(async (id: string, localUri: string): Promise<UploadAndSaveResult | null> => {
    setUploadProgress((prev) => ({ ...prev, [id]: 1 }));
    try {
      const upload = await uploadAndSavePhoto(localUri, {
        namespace: 'community_photos',
        resolveDownloadUrl: true,
        communityMetadata: {
          uploadedBy: userEmail || userName || uid,
        },
        sourceLabel: 'MyPhotosScreen.uploadToStorage',
        logContext: { photoId: id },
      });
      await ImageStorage.updatePhoto(id, {
        imageUrl: upload.downloadUrl || '',
        storagePath: upload.storagePath,
        status: 'uploaded',
        error: undefined,
      });
      return upload;
    } catch (err) {
      await ImageStorage.updatePhoto(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      setUploadProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [uid, userEmail, userName]);

  // ─── add photo — same flow as Kuplu-Prodam / PhotoUploadField ────────────────

  const addPhoto = useCallback(async () => {
    if (adding) return;
    if (screenLimitReached) {
      Alert.alert(getScreenLimitTitle(language), getScreenLimitText(language));
      return;
    }
    if (limitReached) {
      Alert.alert(getMonthlyLimitTitle(language), getMonthlyLimitText(language));
      return;
    }
    setAdding(true);
    try {
      // 1. Permission request — same as PhotoUploadField
      const allowed = await requestPickerPermission();
      if (!allowed) { setAdding(false); return; }

      // 2. Launch system picker — same as PhotoUploadField
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 0.9,
      });

      // 3. Android fallback — same as PhotoUploadField
      const assetsFromResult = Array.isArray(result.assets) ? result.assets : [];
      let assets = assetsFromResult;
      if (assets.length === 0 && Platform.OS === 'android') {
        try {
          const pending = await ImagePicker.getPendingResultAsync();
          const pendingResults = Array.isArray(pending) ? pending : pending ? [pending] : [];
          const pendingAsset = pendingResults
            .map((item) => (!item || 'code' in item || item.canceled ? null : (item.assets?.[0] ?? null)))
            .find((a): a is ImagePicker.ImagePickerAsset => Boolean(a?.uri)) ?? null;
          if (pendingAsset) assets = [pendingAsset];
        } catch (_e) { /* ignore */ }
      }
      if (assets.length === 0) {
        if (!result.canceled) {
          safeLogError('MyPhotosScreen.addPhoto', new Error('picker returned without usable asset'), {
            source: 'image-picker',
          });
        }
        setAdding(false);
        return;
      }

      const asset = assets[0];

      // 4. Copy to stable cache location — same as PhotoUploadField
      const cachedUri = await copyToCache(asset.uri);

      // 5. Generate thumbnail — same as PhotoUploadField
      const thumbUri = await makeThumbnail(cachedUri);

      // 6. Add to ImageStorage immediately → triggers setPhotos → photo appears in grid ✓
      const id = `photo_${uniqueId()}`;
      const now = Date.now();
      const newPhoto: UserPhoto = {
        id,
        localUri: cachedUri,
        thumbnail: thumbUri,
        imageUrl: '',
        status: 'uploading',
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
      };
      await ImageStorage.addPhoto(newPhoto);

      // 7. Upload to Firebase Storage — same mechanism as PhotoUploadField
      try {
        await uploadToStorage(id, cachedUri);
      } catch (uploadErr) {
        safeLogError('MyPhotosScreen.uploadToStorage', uploadErr, { photoId: id });
        // status already set to 'error' inside uploadToStorage's error handler
      }

      // 8. In selectMode, pass newly added photo back and close
      if (selectMode) {
        const added = await ImageStorage.getPhoto(id);
        if (added) {
          PhotoSelector.select(added);
          handleBack();
        }
      }
    } catch (error) {
      showUserError(language, 'upload', error);
    } finally {
      setAdding(false);
    }
  }, [adding, handleBack, language, limitReached, navigation, screenLimitReached, selectMode, uid, uploadToStorage]);

  // ─── retry failed upload ──────────────────────────────────────────────────────

  const retryPhoto = useCallback((photo: UserPhoto) => {
    void (async () => {
      if (!photo.localUri) return;
      await ImageStorage.updatePhoto(photo.id, { status: 'uploading', error: undefined });
      try {
        await uploadToStorage(photo.id, photo.localUri);
      } catch (err) {
        safeLogError('MyPhotosScreen.retryPhoto', err, { photoId: photo.id });
      }
    })();
  }, [uploadToStorage]);

  // ─── delete photo ─────────────────────────────────────────────────────────────

  const deletePhoto = useCallback((photo: UserPhoto) => {
    Alert.alert(text.deleteTitle, text.deleteText, [
      { text: text.no, style: 'cancel' },
      {
        text: text.yes,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeletingId(photo.id);
            try {
              const removed = await ImageStorage.removePhoto(photo.id);
              if (removed?.storagePath) {
                try {
                  await deleteObject(storageRef(storage, removed.storagePath));
                } catch (_e) { /* storage cleanup failure is non-critical */ }
              }
            } finally {
              setDeletingId(null);
            }
          })();
        },
      },
    ]);
  }, [text]);

  const selectPhoto = useCallback((photo: UserPhoto) => {
    if (!selectMode) return;
    PhotoSelector.select(photo);
    handleBack();
  }, [handleBack, selectMode]);

  const renderPhoto = ({ item }: { item: UserPhoto }) => {
    const displayUri = getBestPhotoUri(item) || getPhotoThumbnailUri(item) || item.localUri || '';
    const busy = item.status === 'uploading' || deletingId === item.id;
    const progress = uploadProgress[item.id];

    return (
      <TouchableOpacity
        style={styles.photoCard}
        activeOpacity={0.86}
        onPress={() => {
          if (selectMode) {
            selectPhoto(item);
          } else if (displayUri) {
            setPreviewPhoto({ uri: displayUri, storagePath: item.storagePath });
          }
        }}
        disabled={deletingId === item.id}
      >
        {displayUri ? (
          <AppPhotoImage uri={displayUri} storagePath={item.storagePath} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoFallback}>
            <MaterialCommunityIcons name="image-off-outline" size={28} color={SCREEN_THEME.textMuted} />
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: statusColor[item.status] }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={styles.statusText}>
            {item.status === 'uploading' && progress !== undefined
              ? `${statusLabels[item.status]} ${progress}%`
              : statusLabels[item.status]}
          </Text>
        </View>
        {selectMode ? (
          <View style={styles.selectOverlay}>
            <MaterialCommunityIcons name="check-circle-outline" size={24} color="#fff" />
          </View>
        ) : item.status === 'error' ? (
          <TouchableOpacity style={styles.retryButton} onPress={() => retryPhoto(item)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.deleteButton} onPress={() => deletePhoto(item)} disabled={busy} activeOpacity={0.82}>
            <MaterialCommunityIcons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.82}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{selectMode ? text.selectHint : text.subtitle}</Text>
          {!selectMode ? <Text style={styles.limitNote}>{getMonthlyProgressText(language, monthlyUsed)}</Text> : null}
        </View>
      </View>

      <FlatList
        data={photos}
        keyExtractor={(item: UserPhoto) => item.id}
        renderItem={renderPhoto}
        numColumns={2}
        contentContainerStyle={[styles.grid, photos.length === 0 && styles.emptyGrid]}
        columnWrapperStyle={photos.length > 0 ? styles.gridRow : undefined}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="image-multiple-outline" size={42} color={SCREEN_THEME.textMuted} />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyText}</Text>
          </View>
        }
      />

      <TouchableOpacity style={[styles.addButton, (adding || limitReached || screenLimitReached) && styles.addButtonDisabled]} onPress={addPhoto} activeOpacity={0.88} disabled={adding || limitReached || screenLimitReached}>
        {adding ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="plus" size={22} color="#fff" />}
        <Text style={styles.addButtonText}>{text.add}</Text>
      </TouchableOpacity>

      <Modal visible={Boolean(previewPhoto)} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
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
            <Text style={styles.previewCloseText}>✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

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
  limitNote: { marginTop: 6, color: SCREEN_THEME.textMuted, fontSize: 12, fontWeight: '700' },
  grid: { padding: 14, paddingBottom: 110 },
  emptyGrid: { flexGrow: 1, justifyContent: 'center' },
  gridRow: { gap: 12 },
  photoCard: {
    flex: 1,
    height: 190,
    marginBottom: 12,
    borderRadius: 22,
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
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  emptyText: { marginTop: 8, textAlign: 'center', color: SCREEN_THEME.textSecondary, lineHeight: 20, fontWeight: '600' },
  addButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonDisabled: { opacity: 0.75 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '94%', height: '50%', borderRadius: 16 },
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
  previewCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default MyPhotosScreen;


