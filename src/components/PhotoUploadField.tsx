import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import AppPhotoImage from './AppPhotoImage';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from '../photo-module/ImageStorage';
import { UploadQueue } from '../photo-module/UploadQueue';
import type { UserPhoto } from '../photo-module/types';
import type { PhotoUploadMetadata } from '../photo-module/types';
import { photoService } from '../services/photoService';
import { PhotoPermissionError } from '../utils/photoPicker';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { safeLogError } from '../utils/errorLogger';

export type UploadedPhoto = {
  photoId: string;
  localUri: string;
  thumbUri: string;
  downloadUrl: string;
  storagePath: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
};

type Props = {
  uid: string;
  userName: string;
  maxPhotos?: number;
  storagePath?: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
  onBeforePickerOpen?: () => void | Promise<void>;
  onPickerOpenChange?: (isOpen: boolean) => void;
  onDebugEvent?: (event: { source: string; action: string; details?: Record<string, unknown> }) => void;
  metadata?: PhotoUploadMetadata;
  hideSelectedPreview?: boolean;
};

type Lang = 'ua' | 'ru' | 'en';

const STATUS_LABELS_BY_LANG: Record<Lang, Record<UserPhoto['status'], string>> = {
  ua: { local: 'завантаження', queued: 'у черзі', uploading: 'завантаження', uploaded: 'готово', error: 'помилка' },
  ru: { local: 'загружается', queued: 'в очереди', uploading: 'загружается', uploaded: 'готово', error: 'ошибка' },
  en: { local: 'uploading', queued: 'queued', uploading: 'uploading', uploaded: 'done', error: 'error' },
};

const MODERATION_STATUS_LABELS_BY_LANG: Record<Lang, string> = {
  ua: 'на модерації',
  ru: 'на модерации',
  en: 'in moderation',
};

const BUTTON_LABELS_BY_LANG: Record<Lang, { limit: string; more: string; select: string }> = {
  ua: { limit: 'Ліміт фото', more: 'Вибрати ще фото', select: 'Вибрати фото' },
  ru: { limit: 'Лимит фото', more: 'Выбрать ещё фото', select: 'Выбрать фото' },
  en: { limit: 'Photo limit', more: 'Select more photos', select: 'Select photo' },
};

const AUTH_ALERT_BY_LANG: Record<Lang, { title: string; message: string; loginBtn: string }> = {
  ua: { title: 'Потрібен вхід', message: 'Увійдіть в акаунт, щоб завантажити фото.', loginBtn: 'Увійти' },
  ru: { title: 'Требуется вход', message: 'Войдите в аккаунт, чтобы загрузить фото.', loginBtn: 'Войти' },
  en: { title: 'Sign in required', message: 'Sign in to upload photos.', loginBtn: 'Sign in' },
};

const QUEUE_FULL_ALERT_BY_LANG: Record<Lang, { title: string; message: string }> = {
  ua: { title: 'Черга заповнена', message: 'Максимум 5 фото в черзі.' },
  ru: { title: 'Очередь заполнена', message: 'Максимум 5 фото в очереди.' },
  en: { title: 'Queue full', message: 'Maximum 5 photos in queue.' },
};

const PHOTO_UNAVAILABLE_BY_LANG: Record<Lang, string> = {
  ua: 'Фото недоступне',
  ru: 'Фото недоступно',
  en: 'Photo unavailable',
};

const PICKER_SOURCE_LABELS: Record<Lang, { title: string; camera: string; library: string; cancel: string }> = {
  ua: { title: 'Додати фото', camera: 'Камера', library: 'Галерея', cancel: 'Скасувати' },
  ru: { title: 'Добавить фото', camera: 'Камера', library: 'Галерея', cancel: 'Отмена' },
  en: { title: 'Add photo', camera: 'Camera', library: 'Gallery', cancel: 'Cancel' },
};

const PERMISSION_ALERT_BY_LANG: Record<Lang, { title: string; body: string }> = {
  ua: { title: 'Немає доступу', body: 'Дозвольте доступ до камери або галереї в налаштуваннях.' },
  ru: { title: 'Нет доступа', body: 'Разрешите доступ к камере или галерее в настройках.' },
  en: { title: 'No access', body: 'Allow camera or gallery access in settings.' },
};

const PICK_ERROR_BY_LANG: Record<Lang, { title: string; body: string }> = {
  ua: { title: 'Помилка', body: 'Не вдалося додати фото. Спробуйте ще раз.' },
  ru: { title: 'Ошибка', body: 'Не удалось добавить фото. Попробуйте ещё раз.' },
  en: { title: 'Error', body: 'Could not add the photo. Try again.' },
};

// Module-level registry: persists across component remounts within the same JS session.
// Key: `uid::storagePath`, Value: Set of photo IDs picked in this form session.
// Cleared when PhotoUploadField unmounts (user navigates away), so fresh forms start clean.
const photoSessionRegistry = new Map<string, Set<string>>();

function registerSessionPhoto(uid: string, path: string, photoId: string): void {
  const key = `${uid}::${path}`;
  if (!photoSessionRegistry.has(key)) photoSessionRegistry.set(key, new Set());
  photoSessionRegistry.get(key)!.add(photoId);
}

function unregisterSessionPhoto(uid: string, path: string, photoId: string): void {
  const key = `${uid}::${path}`;
  const set = photoSessionRegistry.get(key);
  if (!set) return;
  set.delete(photoId);
  if (set.size === 0) photoSessionRegistry.delete(key);
}

const mapStatus = (status: UserPhoto['status']): UploadedPhoto['status'] => {
  if (status === 'uploaded') return 'done';
  if (status === 'error') return 'error';
  return 'uploading'; // 'local', 'queued', 'uploading' all show as uploading in the form
};

const mapPhoto = (photo: UserPhoto): UploadedPhoto => ({
  photoId: photo.id,
  localUri: photo.localUri,
  thumbUri: getPhotoThumbnailUri(photo) || photo.thumbnail || photo.localUri,
  downloadUrl: photo.imageUrl || getBestPhotoUri(photo),
  storagePath: photo.storagePath || photo.filePath || '',
  status: mapStatus(photo.status),
  progress: photo.progress ?? (photo.status === 'uploaded' ? 100 : 0),
  error: photo.error,
});

export default function PhotoUploadField({
  uid,
  userName,
  maxPhotos = 5,
  storagePath = 'gallery',
  onPhotosChange,
  onBeforePickerOpen,
  onDebugEvent,
  metadata,
  hideSelectedPreview = false,
}: Props) {
  const navigation = useNavigation<{ navigate: (...args: [string, object]) => void }>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const [selected, setSelected] = useState<UserPhoto[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const alertedErrorIdsRef = useRef<Set<string>>(new Set());
  const limitReached = maxPhotos > 0 && selected.length >= maxPhotos;

  const onPhotosChangeRef = useRef(onPhotosChange);
  onPhotosChangeRef.current = onPhotosChange;

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const storagePathRef = useRef(storagePath);
  storagePathRef.current = storagePath;
  const maxPhotosRef = useRef(maxPhotos);
  maxPhotosRef.current = maxPhotos;

  useEffect(() => {
    onDebugEvent?.({
      source: 'PhotoUploadField',
      action: 'mounted',
      details: { uid, userName, maxPhotos, storagePath },
    });
  }, [maxPhotos, onDebugEvent, storagePath, uid, userName]);

  useEffect(() => {
    onPhotosChangeRef.current?.(selected.map(mapPhoto));
  }, [selected]);

  useEffect(() => {
    const failed = selected.find((photo) => photo.status === 'error' && !alertedErrorIdsRef.current.has(photo.id));
    if (!failed) return;
    alertedErrorIdsRef.current.add(failed.id);
    const e = PICK_ERROR_BY_LANG[language] ?? PICK_ERROR_BY_LANG.ua;
    Alert.alert(e.title, failed.error || e.body);
  }, [language, selected]);

  // Синхронизируем статусы уже выбранных фото из ImageStorage (обновляет статус загрузки).
  // После remount компонента (Android lifecycle, кратковременный сброс user) восстанавливаем
  // фото по ID из photoSessionRegistry вместо простого пропуска пустого selected.
  useEffect(() => {
    const unsubscribe = ImageStorage.subscribe((photos) => {
      setSelected((current) => {
        if (current.length === 0) {
          const sessionIds = photoSessionRegistry.get(`${uidRef.current}::${storagePathRef.current}`);
          if (!sessionIds?.size) return current;
          const max = maxPhotosRef.current;
          const restored = photos
            .filter((p) => sessionIds.has(p.id) && !p.deleted)
            .slice(0, max > 0 ? max : undefined);
          return restored.length > 0 ? restored : current;
        }
        return current
          .map((photo) => photos.find((item) => item.id === photo.id) ?? photo)
          .filter((photo) => !photo.deleted);
      });
    });
    return unsubscribe;
  }, []);

  // Очищаем registry при размонтировании — следующее открытие формы начинается с чистого листа.
  useEffect(() => {
    return () => {
      photoSessionRegistry.delete(`${uidRef.current}::${storagePathRef.current}`);
    };
  }, []);

  const addSelectedPhoto = useCallback((photo: UserPhoto) => {
    if (!uid) {
      const a = AUTH_ALERT_BY_LANG[language] ?? AUTH_ALERT_BY_LANG.ua;
      Alert.alert(a.title, a.message, [
        { text: a.loginBtn, onPress: () => navigation.navigate('LoginScreen', {}) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    setSelected((current) => {
      if (current.some((item) => item.id === photo.id)) return current;
      return maxPhotos > 0 ? [...current, photo].slice(0, maxPhotos) : [...current, photo];
    });
    registerSessionPhoto(uid, storagePath, photo.id);
    void UploadQueue.enqueue(
      photo.id,
      photo.localUri,
      {
        ...metadata,
        uploadedBy: userName || uid,
      },
      {
        collection: storagePath,
        uid,
      },
    ).then((accepted) => {
      if (!accepted) {
        unregisterSessionPhoto(uid, storagePath, photo.id);
        setSelected((current) => current.filter((item) => item.id !== photo.id));
        const q = QUEUE_FULL_ALERT_BY_LANG[language] ?? QUEUE_FULL_ALERT_BY_LANG.ua;
        Alert.alert(q.title, q.message);
      }
    }).catch((error) => {
      unregisterSessionPhoto(uid, storagePath, photo.id);
      safeLogError('PhotoUploadField.UploadQueue.enqueue', error, { photoId: photo.id });
      setSelected((current) => current.filter((item) => item.id !== photo.id));
      const e = PICK_ERROR_BY_LANG[language] ?? PICK_ERROR_BY_LANG.ua;
      Alert.alert(e.title, e.body);
    });
  }, [language, maxPhotos, metadata, storagePath, uid, userName]);

  // Picks an image directly via the system overlay (no screen navigation),
  // saves it locally, then enqueues it for upload. Inline progress is rendered
  // from ImageStorage updates — the user never leaves the form.
  const pickFrom = useCallback(async (source: 'camera' | 'library') => {
    try {
      const photo = source === 'camera'
        ? await photoService.addFromCamera({ userId: uid, type: 'gallery' })
        : await photoService.addFromLibrary({ userId: uid, type: 'gallery' });
      if (photo) addSelectedPhoto(photo);
    } catch (error) {
      const alert = error instanceof PhotoPermissionError
        ? (PERMISSION_ALERT_BY_LANG[language] ?? PERMISSION_ALERT_BY_LANG.ua)
        : (PICK_ERROR_BY_LANG[language] ?? PICK_ERROR_BY_LANG.ua);
      Alert.alert(alert.title, alert.body);
      safeLogError('PhotoUploadField.pickFrom', error, { source, storagePath });
    }
  }, [addSelectedPhoto, language, storagePath, uid]);

  const openPicker = useCallback(async () => {
    if (limitReached) return;
    if (!uid) {
      const a = AUTH_ALERT_BY_LANG[language] ?? AUTH_ALERT_BY_LANG.ua;
      Alert.alert(a.title, a.message, [
        { text: a.loginBtn, onPress: () => navigation.navigate('LoginScreen', {}) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    await onBeforePickerOpen?.();
    onDebugEvent?.({ source: 'PhotoUploadField', action: 'open.inline-picker', details: { storagePath } });

    if (Platform.OS === 'web') {
      void pickFrom('library');
      return;
    }
    const labels = PICKER_SOURCE_LABELS[language] ?? PICKER_SOURCE_LABELS.ua;
    Alert.alert(labels.title, '', [
      { text: labels.camera, onPress: () => { void pickFrom('camera'); } },
      { text: labels.library, onPress: () => { void pickFrom('library'); } },
      { text: labels.cancel, style: 'cancel' },
    ]);
  }, [language, limitReached, navigation, onBeforePickerOpen, onDebugEvent, pickFrom, storagePath, uid]);

  const removePhoto = useCallback((photoId: string) => {
    unregisterSessionPhoto(uidRef.current, storagePathRef.current, photoId);
    setSelected((current) => current.filter((photo) => photo.id !== photoId));
    void UploadQueue.remove(photoId);
  }, []);

  const statusLabels = useMemo(
    () => {
      const labels = STATUS_LABELS_BY_LANG[language] ?? STATUS_LABELS_BY_LANG.ua;
      if (storagePath !== 'community_photos') return labels;
      return {
        ...labels,
        uploaded: MODERATION_STATUS_LABELS_BY_LANG[language] ?? MODERATION_STATUS_LABELS_BY_LANG.ua,
      };
    },
    [language, storagePath],
  );

  const buttonLabel = useMemo(() => {
    const l = BUTTON_LABELS_BY_LANG[language] ?? BUTTON_LABELS_BY_LANG.ua;
    if (limitReached) return l.limit;
    if (hideSelectedPreview) return l.select;
    return selected.length > 0 ? l.more : l.select;
  }, [hideSelectedPreview, language, limitReached, selected.length]);

  return (
    <View style={styles.container}>
      {!hideSelectedPreview && selected.length > 0 ? (
        <View style={styles.grid}>
          {selected.map((photo) => {
            const uri = getPhotoThumbnailUri(photo) || getBestPhotoUri(photo) || photo.localUri;
            const isUploading = photo.status === 'local' || photo.status === 'uploading' || photo.status === 'queued';
            return (
              <TouchableOpacity
                key={photo.id}
                style={styles.photoCard}
                activeOpacity={0.86}
                onPress={() => { setPreviewLoadFailed(false); setPreviewUri(getBestPhotoUri(photo) || uri); }}
              >
                {uri ? (
                  <AppPhotoImage uri={uri} storagePath={photo.storagePath} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.fallback}>
                    <MaterialCommunityIcons name="image-off-outline" size={24} color={SCREEN_THEME.textMuted} />
                  </View>
                )}

                {/* Загрузка: большая зелёная шкала прогресса 0→100% */}
                {isUploading ? (
                  <View style={styles.uploadProgressWrap}>
                    <View style={styles.uploadProgressTrack}>
                      <View style={[styles.uploadProgressFill, { width: `${Math.max(8, photo.progress ?? 0)}%` }]} />
                    </View>
                    <Text style={styles.uploadProgressText}>
                      {(photo.progress ?? 0) > 0 ? `${photo.progress}%` : statusLabels[photo.status]}
                    </Text>
                  </View>
                ) : (
                  <View style={[
                    styles.statusBadge,
                    photo.status === 'error' && styles.errorBadge,
                    photo.status === 'uploaded' && styles.doneBadge,
                  ]}>
                    <Text style={styles.statusText}>{statusLabels[photo.status]}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removePhoto(photo.id)}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.selectButton, limitReached && styles.selectButtonDisabled]}
        onPress={() => { void openPicker(); }}
        activeOpacity={0.86}
        disabled={limitReached}
      >
        <MaterialCommunityIcons name="image-multiple-outline" size={20} color="#fff" />
        <Text style={styles.selectButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>

      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewUri(null)}>
          {previewUri && !previewLoadFailed ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
              onError={() => setPreviewLoadFailed(true)}
            />
          ) : previewLoadFailed ? (
            <View style={styles.previewFallback}>
              <MaterialCommunityIcons name="image-off-outline" size={40} color="#fff" />
              <Text style={styles.previewFallbackText}>{PHOTO_UNAVAILABLE_BY_LANG[language] ?? PHOTO_UNAVAILABLE_BY_LANG.ua}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoCard: {
    width: 104,
    height: 104,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  photo: { width: '100%', height: '100%' },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  statusBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(38, 95, 71, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneBadge: { backgroundColor: 'rgba(38, 95, 71, 0.9)' },
  errorBadge: { backgroundColor: 'rgba(150, 56, 42, 0.9)' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  uploadProgressWrap: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 6,
    backgroundColor: 'rgba(20, 28, 22, 0.84)',
  },
  uploadProgressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  uploadProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#4CAF50',
  },
  uploadProgressText: {
    marginTop: 4,
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(91, 38, 29, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  selectButtonDisabled: { opacity: 0.55 },
  selectButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '94%', height: '70%' },
  previewFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  previewFallbackText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
