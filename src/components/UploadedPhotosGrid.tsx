import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import AppPhotoImage from './AppPhotoImage';
import { getBestPhotoUri, getPhotoThumbnailUri, ImageStorage } from '../photo-module/ImageStorage';
import type { UserPhoto } from '../photo-module/types';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';
type PreviewPhoto = { uri: string; storagePath?: string };

type Props = {
  title?: string;
  maxItems?: number;
};

const UI_TEXT = {
  ua: {
    title: 'Завантажені фото',
    empty: 'Після вибору фото вони зʼявляться тут зі статусом завантаження.',
    queued: 'У черзі',
    uploading: 'Завантаження',
    uploaded: 'Готово',
    error: 'Помилка',
  },
  ru: {
    title: 'Загруженные фото',
    empty: 'После выбора фото они появятся здесь со статусом загрузки.',
    queued: 'В очереди',
    uploading: 'Загрузка',
    uploaded: 'Готово',
    error: 'Ошибка',
  },
  en: {
    title: 'Uploaded photos',
    empty: 'Selected photos will appear here with their upload status.',
    queued: 'Queued',
    uploading: 'Uploading',
    uploaded: 'Ready',
    error: 'Error',
  },
} as const;

const STATUS_COLOR: Record<UserPhoto['status'], string> = {
  local: SCREEN_THEME.woodGreenDark,
  queued: '#A66A00',
  uploading: SCREEN_THEME.enamelBlueDark,
  uploaded: SCREEN_THEME.woodGreenDark,
  error: SCREEN_THEME.terracottaDark,
};

export default function UploadedPhotosGrid({ title, maxItems = 12 }: Props) {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const userId = useSelector((state: RootState) => state.auth.user?.id ?? state.auth.user?.email ?? '');
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);

  useEffect(() => {
    // Only show the current user's photos. While auth is still resolving
    // (userId empty) show nothing rather than every photo on the device.
    const unsubscribe = ImageStorage.subscribe((items) => {
      setPhotos(userId ? items.filter((item) => !item.deleted && item.userId === userId) : []);
    });
    return unsubscribe;
  }, [userId]);

  const visiblePhotos = useMemo(() => photos.slice(0, maxItems), [maxItems, photos]);
  const statusLabels = useMemo<Record<UserPhoto['status'], string>>(() => ({
    local: text.uploaded,   // local photo — ready
    queued: text.queued,
    uploading: text.uploading,
    uploaded: text.uploaded,
    error: text.error,
  }), [text]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title ?? text.title}</Text>
      {visiblePhotos.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="image-multiple-outline" size={24} color={SCREEN_THEME.textMuted} />
          <Text style={styles.emptyText}>{text.empty}</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {visiblePhotos.map((photo) => {
            const displayUri = getPhotoThumbnailUri(photo) || getBestPhotoUri(photo) || photo.localUri || '';
            const fullUri = getBestPhotoUri(photo) || displayUri;
            const busy = photo.status === 'queued' || photo.status === 'uploading';
            return (
              <TouchableOpacity
                key={photo.id}
                style={styles.photoCard}
                onPress={() => fullUri && setPreviewPhoto({ uri: fullUri, storagePath: photo.storagePath })}
                activeOpacity={0.86}
              >
                {displayUri ? (
                  <AppPhotoImage uri={displayUri} storagePath={photo.storagePath} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.fallback}>
                    <MaterialCommunityIcons name="image-off-outline" size={22} color={SCREEN_THEME.textMuted} />
                  </View>
                )}
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[photo.status] }]}>
                  {busy ? <ActivityIndicator size="small" color="#fff" style={styles.spinner} /> : null}
                  <Text style={styles.statusText}>{statusLabels[photo.status]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Modal visible={Boolean(previewPhoto)} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto ? (
            <AppPhotoImage
              uri={previewPhoto.uri}
              storagePath={previewPhoto.storagePath}
              style={styles.previewImage}
              resizeMode="contain"
              debugLabel="UploadedPhotosGridPreview"
            />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, gap: 8 },
  title: { color: SCREEN_THEME.textPrimary, fontSize: 13, fontWeight: '900' },
  emptyCard: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D9C69E',
    backgroundColor: '#FFF8EA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  emptyText: { color: SCREEN_THEME.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCard: {
    width: 92,
    height: 92,
    borderRadius: 12,
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
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  spinner: { width: 10, height: 10 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '94%', height: '70%' },
});
