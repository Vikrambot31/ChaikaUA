import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ref as dbRef, push } from 'firebase/database';
import { storage, database } from '../firebase-core';
import { compressImage } from '../utils/imageCompressor';
import { safeLogError } from '../utils/errorLogger';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ─── TRACE ────────────────────────────────────────────────────────────────────
const T = (msg: string) => console.log(`[PUF] ${msg}`);

const showPhotoUploadError = (message: string) => {
  Toast.show({
    type: 'error',
    text1: 'Фото не загружено',
    text2: message,
  });
};

export type UploadedPhoto = {
  localUri: string;
  thumbUri: string;
  downloadUrl: string;
  storagePath: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
};

type PhotoItem = {
  id: string;
  localUri: string;
  thumbUri: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  downloadUrl: string | null;
  storagePath: string | null;
  errorMsg: string | null;
};

type PickerResultLike = Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;

const getUsableAssetFromResult = (
  result: PickerResultLike | ImagePicker.ImagePickerErrorResult | null | undefined,
): ImagePicker.ImagePickerAsset | null => {
  if (!result || 'code' in result || result.canceled) {
    return null;
  }
  const asset = result.assets?.[0];
  return asset?.uri ? asset : null;
};

async function resolvePendingPickerAsset(): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    const pendingResults = Array.isArray(pending) ? pending : pending ? [pending] : [];
    return (
      pendingResults
        .map((item) => getUsableAssetFromResult(item))
        .find((item): item is ImagePicker.ImagePickerAsset => Boolean(item)) ?? null
    );
  } catch (error) {
    safeLogError('PhotoUploadField.getPendingResultAsync', error, {
      source: 'image-picker',
    });
    return null;
  }
}

type Props = {
  uid: string;
  userName: string;
  maxPhotos?: number;
  storagePath?: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
  onPickerOpenChange?: (isOpen: boolean) => void;
  onDebugEvent?: (event: { source: string; action: string; details?: Record<string, unknown> }) => void;
};

export default function PhotoUploadField({
  uid,
  userName,
  maxPhotos = 5,
  storagePath: storageFolder = 'community_photos',
  onPhotosChange,
  onPickerOpenChange,
  onDebugEvent,
}: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [failedPreviewIds, setFailedPreviewIds] = useState<Record<string, boolean>>({});

  // ─── DIAGNOSTICS — mount/unmount, render counter, prop & state tracking ─────
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const onDebugEventRef = useRef(onDebugEvent);
  useEffect(() => { onDebugEventRef.current = onDebugEvent; }, [onDebugEvent]);

  // mount/unmount — use ref so unmount log fires even if parent removed callback
  useEffect(() => {
    onDebugEventRef.current?.({ source: 'PhotoUploadField', action: 'lifecycle.mount', details: { uid, maxPhotos, storageFolder } });
    return () => {
      onDebugEventRef.current?.({ source: 'PhotoUploadField', action: 'lifecycle.unmount' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prop identity tracking — detects when parent re-creates callbacks (causes useCallback churn)
  const prevPropsRef = useRef<{
    uid: string;
    userName: string;
    maxPhotos: number;
    storageFolder: string;
  } | null>(null);
  useEffect(() => {
    const prev = prevPropsRef.current;
    const next = { uid, userName, maxPhotos, storageFolder };
    if (prev) {
      const changes: Record<string, unknown> = {};
      if (prev.uid !== next.uid) changes.uid = { from: prev.uid, to: next.uid };
      if (prev.userName !== next.userName) changes.userName = { from: prev.userName, to: next.userName };
      if (prev.maxPhotos !== next.maxPhotos) changes.maxPhotos = { from: prev.maxPhotos, to: next.maxPhotos };
      if (prev.storageFolder !== next.storageFolder) changes.storageFolder = { from: prev.storageFolder, to: next.storageFolder };
      if (Object.keys(changes).length > 0) {
        onDebugEventRef.current?.({
          source: 'PhotoUploadField',
          action: 'props.changed',
          details: { render: renderCountRef.current, changes },
        });
      }
    }
    prevPropsRef.current = next;
  });

  // Internal state change tracking
  useEffect(() => {
    onDebugEventRef.current?.({
      source: 'PhotoUploadField',
      action: 'state.photos.changed',
      details: {
        count: photos.length,
        statuses: photos.map((p) => p.status).join(','),
        ids: photos.map((p) => p.id).join('|'),
      },
    });
  }, [photos]);
  useEffect(() => {
    onDebugEventRef.current?.({ source: 'PhotoUploadField', action: 'state.busy.changed', details: { value: busy } });
  }, [busy]);
  useEffect(() => {
    onDebugEventRef.current?.({
      source: 'PhotoUploadField',
      action: 'state.failedPreviewIds.changed',
      details: { count: Object.keys(failedPreviewIds).length },
    });
  }, [failedPreviewIds]);

  const notifyParent = useCallback(
    (items: PhotoItem[]) => {
      if (!onPhotosChange) return;
      T(`notifyParent folder=${storageFolder} items=${items.length} statuses=[${items.map(p=>p.status).join(',')}]`);
      onDebugEvent?.({
        source: 'PhotoUploadField',
        action: 'notifyParent',
        details: {
          storageFolder,
          items: items.length,
          statuses: items.map((p) => p.status).join(','),
          done: items.filter((p) => p.status === 'done').length,
          uploading: items.filter((p) => p.status === 'uploading').length,
          error: items.filter((p) => p.status === 'error').length,
        },
      });
      const mapped: UploadedPhoto[] = items
        .filter((p) => p.status === 'done' || p.status === 'uploading' || p.status === 'error')
        .map((p) => ({
          localUri: p.localUri,
          thumbUri: p.thumbUri,
          downloadUrl: p.downloadUrl ?? '',
          storagePath: p.storagePath ?? '',
          status: p.status as UploadedPhoto['status'],
          progress: p.progress,
        }));
      onPhotosChange(mapped);
    },
    [onPhotosChange, onDebugEvent, storageFolder],
  );

  const updatePhoto = useCallback(
    (id: string, patch: Partial<PhotoItem>, currentPhotos: PhotoItem[]) => {
      T(`updatePhoto id=${id} patch=${JSON.stringify(patch)} len=${currentPhotos.length}`);
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'updatePhoto', details: { id, patch, currentLen: currentPhotos.length } });
      const updated = currentPhotos.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setPhotos(updated);
      notifyParent(updated);
      return updated;
    },
    [notifyParent, onDebugEvent],
  );

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      return true;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const copyToCache = async (uri: string): Promise<string> => {
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
    const dest = `${FileSystem.cacheDirectory}photo_${makeId()}.${ext}`;
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

  const uploadOne = async (item: PhotoItem, currentPhotos: PhotoItem[]): Promise<PhotoItem[]> => {
    T(`uploadOne START id=${item.id} folder=${storageFolder} uid=${uid}`);
    let latestPhotos = updatePhoto(item.id, { status: 'uploading', progress: 0 }, currentPhotos);
    let uploadStep = 'init';
    let uploadPath = '';

    try {
      uploadStep = 'compress';
      const compressedUri = await compressImage(item.localUri, { maxWidth: 1600, maxHeight: 1600, quality: 0.82 });
      uploadStep = 'readBlob';
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      if (!blob || blob.size <= 0) {
        throw new Error('Invalid blob after compression');
      }

      uploadPath = `${storageFolder}/${uid}/${Date.now()}_${makeId()}.jpg`;
      T(`uploadOne step:upload path=${uploadPath} bytes=${blob.size}`);
      uploadStep = 'upload';
      const ref = storageRef(storage, uploadPath);
      const task = uploadBytesResumable(ref, blob, { contentType: 'image/jpeg' });

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            latestPhotos = updatePhoto(item.id, { progress: pct }, latestPhotos);
          },
          (err) => {
            safeLogError('PhotoUploadField.uploadOne.storageTask', err, {
              step: 'storageTask',
              storagePath: uploadPath,
              storageFolder,
              uid,
              errorCode: (err as { code?: string }).code ?? 'unknown',
            });
            latestPhotos = updatePhoto(item.id, { status: 'error', errorMsg: err.message }, latestPhotos);
            reject(err);
          },
          async () => {
            uploadStep = 'getDownloadURL';
            T(`uploadOne step:getDownloadURL`);
            const url = await getDownloadURL(task.snapshot.ref);
            T(`uploadOne DONE url=${url.slice(0, 60)}`);
            latestPhotos = updatePhoto(
              item.id,
              { status: 'done', progress: 100, downloadUrl: url, storagePath: uploadPath },
              latestPhotos,
            );

            try {
              await push(dbRef(database, 'photo_uploads'), {
                uid,
                userName,
                uploadedAt: Date.now(),
                storagePath: uploadPath,
                downloadUrl: url,
                thumbUrl: item.thumbUri,
                status: 'approved',
              });
            } catch (dbErr) {
              console.warn('[PhotoUploadField] metadata write failed after upload', {
                storagePath: uploadPath,
                error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              });
              safeLogError('PhotoUploadField.uploadOne.metadataWrite', dbErr, {
                storagePath: uploadPath,
                storageFolder,
                uid,
              });
            }

            resolve();
          },
        );
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code ?? 'unknown';
      T(`uploadOne ERROR step=${uploadStep} code=${code} msg=${msg}`);
      safeLogError('PhotoUploadField.uploadOne', err, {
        step: uploadStep,
        storagePath: uploadPath || `${storageFolder}/${uid}/...`,
        storageFolder,
        uid,
        errorCode: code,
      });
      latestPhotos = updatePhoto(item.id, { status: 'error', errorMsg: msg }, latestPhotos);
      showPhotoUploadError('Проверьте интернет и попробуйте выбрать фото ещё раз.');
    }

    return latestPhotos;
  };

  const handleAddPhoto = useCallback(async () => {
    onDebugEvent?.({
      source: 'PhotoUploadField',
      action: 'handleAddPhoto.enter',
      details: { uidPresent: Boolean(uid), busy, photos: photos.length, maxPhotos, storageFolder },
    });
    if (!uid) {
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.blocked.noUid' });
      Alert.alert('Помилка', 'Увійдіть в акаунт, щоб додати фото.');
      return;
    }
    if (busy) {
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.blocked.busy' });
      return;
    }
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) {
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.blocked.maxPhotos', details: { remaining } });
      return;
    }

    T(`handleAddPhoto START uid=${uid} folder=${storageFolder} photos=${photos.length}`);
    onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.start', details: { remaining } });
    setBusy(true);
    onPickerOpenChange?.(true);
    onDebugEvent?.({ source: 'PhotoUploadField', action: 'pickerOpenChange.emit', details: { value: true } });
    T(`handleAddPhoto: pickerOpen=true (guard set)`);
    let preUploadStep = 'picker';

    try {
      const allowed = await requestPermission();
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'permission.result', details: { allowed } });
      if (!allowed) {
        Alert.alert('Помилка', 'Разрешите доступ к фото в настройках телефона и попробуйте снова.');
        setBusy(false);
        onPickerOpenChange?.(false);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'pickerOpenChange.emit', details: { value: false, reason: 'permissionDenied' } });
        return;
      }

      onDebugEvent?.({ source: 'PhotoUploadField', action: 'imagePicker.launch', details: { remaining, allowsMultipleSelection: remaining > 1 } });
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        allowsEditing: false,
        quality: 1,
      });

      T(`handleAddPhoto: picker returned canceled=${result.canceled} directAssets=${result.assets?.length ?? 0}`);
      onDebugEvent?.({
        source: 'PhotoUploadField',
        action: 'imagePicker.returned',
        details: { canceled: result.canceled, directAssets: result.assets?.length ?? 0 },
      });
      // Some Android picker flows may return canceled=true while still providing assets.
      // Prefer direct assets whenever present; fallback to pending result only if empty.
      const assetsFromResult = Array.isArray(result.assets) ? result.assets : [];
      let assets = assetsFromResult;
      if (assets.length === 0 && Platform.OS === 'android') {
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'pendingResult.lookup.start' });
        const pendingAsset = await resolvePendingPickerAsset();
        if (pendingAsset) {
          assets = [pendingAsset];
        }
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'pendingResult.lookup.done', details: { found: Boolean(pendingAsset) } });
      }
      T(`handleAddPhoto: assets after pending fallback=${assets.length}`);
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'assets.resolved', details: { assets: assets.length } });
      if (assets.length === 0) {
        if (!result.canceled) {
          safeLogError('PhotoUploadField.launchImageLibraryAsync', new Error('picker returned without usable asset'), {
            source: 'image-picker',
          });
          showPhotoUploadError('Не удалось получить выбранное фото. Попробуйте открыть галерею ещё раз.');
        }
        T(`handleAddPhoto: NO assets → return early`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.noAssetsReturn', details: { canceled: result.canceled } });
        setBusy(false);
        return;
      }

      let currentPhotos = [...photos];

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        T(`handleAddPhoto: loop i=${i} step:copyToCache uri=${asset.uri.slice(0, 50)}`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'asset.copyToCache.start', details: { index: i, uriStart: asset.uri.slice(0, 80) } });
        preUploadStep = 'copyToCache';
        const cachedUri = await copyToCache(asset.uri);
        T(`handleAddPhoto: step:makeThumbnail cachedUri=${cachedUri.slice(0, 50)}`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'asset.copyToCache.done', details: { index: i, cachedUriStart: cachedUri.slice(0, 80) } });
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'asset.makeThumbnail.start', details: { index: i } });
        preUploadStep = 'makeThumbnail';
        const thumbUri = await makeThumbnail(cachedUri);
        T(`handleAddPhoto: step:addToList thumbReady currentLen=${currentPhotos.length}`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'asset.makeThumbnail.done', details: { index: i, thumbUriStart: thumbUri.slice(0, 80) } });
        preUploadStep = 'setPhotos';

        const newItem: PhotoItem = {
          id: makeId(),
          localUri: cachedUri,
          thumbUri,
          status: 'pending',
          progress: 0,
          downloadUrl: null,
          storagePath: null,
          errorMsg: null,
        };

        currentPhotos = [...currentPhotos, newItem];
        T(`handleAddPhoto: setPhotos+notifyParent newLen=${currentPhotos.length}`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'photos.setLocal', details: { newLen: currentPhotos.length, id: newItem.id } });
        setPhotos(currentPhotos);
        notifyParent(currentPhotos);

        preUploadStep = 'uploadOne';
        T(`handleAddPhoto: step:uploadOne start id=${newItem.id}`);
        onDebugEvent?.({ source: 'PhotoUploadField', action: 'uploadOne.call', details: { id: newItem.id } });
        currentPhotos = await uploadOne(newItem, currentPhotos);
      }
    } catch (err: unknown) {
      onDebugEvent?.({
        source: 'PhotoUploadField',
        action: 'handleAddPhoto.error',
        details: { step: preUploadStep, error: err instanceof Error ? err.message : String(err) },
      });
      console.warn('[PhotoUploadField] add photo flow failed', {
        step: preUploadStep,
        error: err instanceof Error ? err.message : String(err),
      });
      safeLogError('PhotoUploadField.handleAddPhoto', err, {
        source: 'image-picker',
        preUploadStep,
        storageFolder,
        uid,
      });
      showPhotoUploadError('Не удалось подготовить фото. Проверьте файл и интернет, затем попробуйте ещё раз.');
    } finally {
      T(`handleAddPhoto: FINALLY → setBusy=false, pickerOpen=false`);
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'handleAddPhoto.finally', details: { pickerOpen: false } });
      setBusy(false);
      onPickerOpenChange?.(false);
      onDebugEvent?.({ source: 'PhotoUploadField', action: 'pickerOpenChange.emit', details: { value: false, reason: 'finally' } });
    }
  }, [uid, busy, photos, maxPhotos, storageFolder, notifyParent, onPickerOpenChange, onDebugEvent]);

  const handleRemovePhoto = useCallback(
    (id: string) => {
      const updated = photos.filter((p) => p.id !== id);
      setPhotos(updated);
      setFailedPreviewIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      notifyParent(updated);
    },
    [photos, notifyParent],
  );

  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    onDebugEventRef.current?.({ source: 'PhotoUploadField', action: 'state.previewUri.changed', details: { hasPreview: Boolean(previewUri) } });
  }, [previewUri]);

  const canAdd = photos.length < maxPhotos && !busy;

  return (
    <View style={styles.container}>
      {/* Counter + Add button */}
      <View style={styles.topRow}>
        <Text style={styles.counter}>{`\u0424\u043e\u0442\u043e: ${photos.length} / ${maxPhotos}`}</Text>
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
          onPress={() => void handleAddPhoto()}
          activeOpacity={0.78}
          disabled={!canAdd}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <MaterialCommunityIcons name="camera-plus-outline" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.addBtnText}>
            {busy
              ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026'
              : photos.length >= maxPhotos
              ? '\u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c'
              : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0444\u043e\u0442\u043e'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Photo grid — always visible */}
      <View style={styles.grid}>
        {photos.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            style={styles.gridCell}
            activeOpacity={0.85}
            onPress={() => setPreviewUri(item.thumbUri)}
          >
            {failedPreviewIds[item.id] ? (
              <View style={styles.thumbFallback}>
                <MaterialCommunityIcons name="image-off-outline" size={20} color="#7A4B36" />
                <Text style={styles.thumbFallbackText}>Ошибка</Text>
              </View>
            ) : (
              <Image
                source={{ uri: item.thumbUri }}
                style={styles.thumb}
                resizeMode="cover"
                onError={(error) => {
                  console.warn('[PhotoUploadField] thumbnail failed to load', {
                    id: item.id,
                    error: error.nativeEvent?.error,
                  });
                  setFailedPreviewIds((prev) => ({ ...prev, [item.id]: true }));
                }}
              />
            )}

            {item.status === 'uploading' && (
              <View style={styles.overlay}>
                <Text style={styles.overlayPct}>{item.progress}%</Text>
                <View style={styles.miniBarBg}>
                  <View style={[styles.miniBarFill, { width: `${item.progress}%` }]} />
                </View>
              </View>
            )}
            {item.status === 'done' && (
              <View style={[styles.overlay, styles.overlayDone]}>
                <MaterialCommunityIcons name="check-circle" size={22} color="#5DC877" />
              </View>
            )}
            {item.status === 'error' && (
              <View style={[styles.overlay, styles.overlayError]}>
                <MaterialCommunityIcons name="alert-circle" size={22} color="#E05050" />
              </View>
            )}

            <View style={styles.indexBadge}>
              <Text style={styles.indexBadgeText}>{i + 1}</Text>
            </View>

            {item.status !== 'uploading' && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemovePhoto(item.id)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="close" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}

        {/* Empty placeholder slots */}
        {Array.from({ length: maxPhotos - photos.length }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.gridCell, styles.gridCellEmpty]}>
            <MaterialCommunityIcons name="image-plus" size={24} color="#C8B89A" />
          </View>
        ))}
      </View>

      {/* Preview modal */}
      <Modal visible={Boolean(previewUri)} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewUri(null)}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
              onError={(error) => {
                console.warn('[PhotoUploadField] full preview failed to load', {
                  error: error.nativeEvent?.error,
                });
                Toast.show({ type: 'error', text1: 'Фото не открылось', text2: 'Выберите другое фото или попробуйте позже.' });
                setPreviewUri(null);
              }}
            />
          ) : null}
          <View style={styles.previewCloseHint}>
            <Text style={styles.previewCloseText}>✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const ACCENT = '#4B7F9E';

const styles = StyleSheet.create({
  container: { marginVertical: 8 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  counter: { fontSize: 14, fontWeight: '700', color: '#5A4E42' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  addBtnDisabled: { backgroundColor: '#A0B8C8', elevation: 0 },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCell: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E8E0D4',
  },
  gridCellEmpty: {
    borderWidth: 1.5,
    borderColor: '#E0D5C5',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5EE',
  },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4E8DD',
    gap: 2,
  },
  thumbFallbackText: {
    color: '#7A4B36',
    fontSize: 9,
    fontWeight: '800',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  overlayDone: { backgroundColor: 'rgba(0,0,0,0.20)' },
  overlayError: { backgroundColor: 'rgba(80,0,0,0.35)' },
  overlayPct: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginBottom: 3 },
  miniBarBg: {
    width: '80%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  miniBarFill: { height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  indexBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  indexBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  removeBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '94%',
    height: '50%',
    borderRadius: 16,
  },
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
