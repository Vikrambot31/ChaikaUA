import { useCallback, useState } from 'react';
import type { PhotoDraft } from '../types/photoDraft';
import type { PickedPhoto } from '../utils/photoPicker';

export function useSinglePhotoDraft(initialDraft: PhotoDraft | null = null) {
  const [draft, setDraft] = useState<PhotoDraft | null>(initialDraft);

  const setPickedPhoto = useCallback((photo: PickedPhoto) => {
    setDraft({
      localUri: photo.uri,
      source: photo.source,
      status: 'ready',
    });
  }, []);

  const clear = useCallback(() => {
    setDraft(null);
  }, []);

  const setUploading = useCallback(() => {
    setDraft((current) => (current ? { ...current, status: 'uploading', error: undefined } : current));
  }, []);

  const setUploaded = useCallback((remoteStoragePath: string) => {
    setDraft((current) => (
      current
        ? { ...current, remoteStoragePath, status: 'uploaded', error: undefined }
        : current
    ));
  }, []);

  const setError = useCallback((error: string) => {
    setDraft((current) => (current ? { ...current, status: 'error', error } : current));
  }, []);

  return {
    draft,
    localPreviewUri: draft?.localUri || '',
    remoteStoragePath: draft?.remoteStoragePath || '',
    hasPhoto: Boolean(draft?.localUri),
    isUploading: draft?.status === 'uploading',
    setPickedPhoto,
    setUploading,
    setUploaded,
    setError,
    clear,
    setDraft,
  };
}
