import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import AppPhotoImage from './AppPhotoImage';
import { PhotoSelector } from '../photo-module/PhotoSelector';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from '../photo-module/ImageStorage';
import { UploadQueue } from '../photo-module/UploadQueue';
import type { UserPhoto } from '../photo-module/types';
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
};

type Props = {
  uid: string;
  userName: string;
  maxPhotos?: number;
  storagePath?: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
  onPickerOpenChange?: (isOpen: boolean) => void;
  onDebugEvent?: (event: { source: string; action: string; details?: Record<string, unknown> }) => void;
};

type Lang = 'ua' | 'ru' | 'en';

const STATUS_LABELS_BY_LANG: Record<Lang, Record<UserPhoto['status'], string>> = {
  ua: { queued: 'у черзі', uploading: 'завантаження', uploaded: 'готово', error: 'помилка' },
  ru: { queued: 'в очереди', uploading: 'загружается', uploaded: 'готово', error: 'ошибка' },
  en: { queued: 'queued', uploading: 'uploading', uploaded: 'done', error: 'error' },
};

const BUTTON_LABELS_BY_LANG: Record<Lang, { limit: string; more: string; select: string }> = {
  ua: { limit: 'Ліміт фото', more: 'Вибрати ще фото', select: 'Вибрати фото' },
  ru: { limit: 'Лимит фото', more: 'Выбрать ещё фото', select: 'Выбрать фото' },
  en: { limit: 'Photo limit', more: 'Select more photos', select: 'Select photo' },
};

const AUTH_ALERT_BY_LANG: Record<Lang, { title: string; message: string }> = {
  ua: { title: 'Потрібен вхід', message: 'Увійдіть в акаунт, щоб завантажити фото.' },
  ru: { title: 'Требуется вход', message: 'Войдите в аккаунт, чтобы загрузить фото.' },
  en: { title: 'Sign in required', message: 'Sign in to upload photos.' },
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

const mapStatus = (status: UserPhoto['status']): UploadedPhoto['status'] => {
  if (status === 'uploaded') return 'done';
  if (status === 'error') return 'error';
  return 'uploading';
};

const mapPhoto = (photo: UserPhoto): UploadedPhoto => ({
  photoId: photo.id,
  localUri: photo.localUri,
  thumbUri: getPhotoThumbnailUri(photo) || photo.thumbnail || photo.localUri,
  downloadUrl: photo.imageUrl || getBestPhotoUri(photo),
  storagePath: photo.storagePath || photo.filePath || '',
  status: mapStatus(photo.status),
  progress: photo.progress ?? (photo.status === 'uploaded' ? 100 : 0),
});

export default function PhotoUploadField({
  uid,
  userName,
  maxPhotos = 5,
  storagePath = 'gallery',
  onPhotosChange,
  onPickerOpenChange,
  onDebugEvent,
}: Props) {
  const navigation = useNavigation<{ navigate: (...args: [string, object]) => void }>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const [selected, setSelected] = useState<UserPhoto[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const limitReached = maxPhotos > 0 && selected.length >= maxPhotos;

  const onPhotosChangeRef = useRef(onPhotosChange);
  onPhotosChangeRef.current = onPhotosChange;

  useFocusEffect(
    useCallback(() => {
      onPickerOpenChange?.(false);
    }, [onPickerOpenChange]),
  );

  // При монтировании: восстанавливаем фото если компонент был пересоздан во время навигации
  useEffect(() => {
    const pending = PhotoSelector.consumePending();
    if (pending) {
      setSelected((current) => {
        if (current.some((item) => item.id === pending.id)) return current;
        return maxPhotos > 0 ? [...current, pending].slice(0, maxPhotos) : [...current, pending];
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Синхронизируем статусы уже выбранных фото из ImageStorage (обновляет статус загрузки)
  useEffect(() => {
    const unsubscribe = ImageStorage.subscribe((photos) => {
      setSelected((current) => {
        if (current.length === 0) return current;
        return current
          .map((photo) => photos.find((item) => item.id === photo.id) ?? photo)
          .filter((photo) => !photo.deleted);
      });
    });
    return unsubscribe;
  }, []);

  const addSelectedPhoto = useCallback((photo: UserPhoto) => {
    if (!uid) {
      const a = AUTH_ALERT_BY_LANG[language] ?? AUTH_ALERT_BY_LANG.ua;
      Alert.alert(a.title, a.message);
      return;
    }
    setSelected((current) => {
      if (current.some((item) => item.id === photo.id)) return current;
      return maxPhotos > 0 ? [...current, photo].slice(0, maxPhotos) : [...current, photo];
    });
    void UploadQueue.enqueue(photo.id, photo.localUri, {
      uploadedBy: userName || uid,
      title: storagePath,
    }).then((accepted) => {
      if (!accepted) {
        setSelected((current) => current.filter((item) => item.id !== photo.id));
        const q = QUEUE_FULL_ALERT_BY_LANG[language] ?? QUEUE_FULL_ALERT_BY_LANG.ua;
        Alert.alert(q.title, q.message);
      }
    }).catch((error) => safeLogError('PhotoUploadField.UploadQueue.enqueue', error, { photoId: photo.id }));
  }, [language, maxPhotos, storagePath, uid, userName]);

  const openSelector = useCallback(() => {
    if (limitReached) return;
    onPickerOpenChange?.(true);
    onDebugEvent?.({ source: 'PhotoUploadField', action: 'open.my-photos', details: { storagePath } });
    PhotoSelector.open(navigation, (photo) => {
      addSelectedPhoto(photo);
      // 600мс задержка — Android не успевает закрыть модалку через onRequestClose после goBack
      setTimeout(() => onPickerOpenChange?.(false), 600);
    });
  }, [addSelectedPhoto, limitReached, navigation, onDebugEvent, onPickerOpenChange, storagePath]);

  const removePhoto = useCallback((photoId: string) => {
    setSelected((current) => current.filter((photo) => photo.id !== photoId));
    void UploadQueue.remove(photoId);
  }, []);

  const statusLabels = useMemo(
    () => STATUS_LABELS_BY_LANG[language] ?? STATUS_LABELS_BY_LANG.ua,
    [language],
  );

  const buttonLabel = useMemo(() => {
    const l = BUTTON_LABELS_BY_LANG[language] ?? BUTTON_LABELS_BY_LANG.ua;
    if (limitReached) return l.limit;
    return selected.length > 0 ? l.more : l.select;
  }, [language, limitReached, selected.length]);

  return (
    <View style={styles.container}>
      {selected.length > 0 ? (
        <View style={styles.grid}>
          {selected.map((photo) => {
            const uri = getPhotoThumbnailUri(photo) || getBestPhotoUri(photo) || photo.localUri;
            const isUploading = photo.status === 'uploading' || photo.status === 'queued';
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

                {/* Статус загрузки */}
                <View style={[
                  styles.statusBadge,
                  photo.status === 'error' && styles.errorBadge,
                  photo.status === 'uploaded' && styles.doneBadge,
                ]}>
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                  ) : null}
                  <Text style={styles.statusText}>{statusLabels[photo.status]}</Text>
                </View>

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
        onPress={openSelector}
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
  spinner: { width: 12, height: 12 },
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
