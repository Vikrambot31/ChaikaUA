import { useCallback, useEffect, useState } from 'react';
import { loadPhotos, type PhotoRecord } from '../services/photoApprovalService';

export const usePhotoApproval = () => {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await loadPhotos();
      setPhotos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { photos, loading, error, refresh };
};
