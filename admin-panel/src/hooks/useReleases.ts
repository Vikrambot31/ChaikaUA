import { useCallback, useEffect, useState } from 'react';
import { getReleases, updateReleaseSummary, updateReleaseControl, deleteRelease, type ReleaseRecord } from '../services/releasesService';

export function useReleases() {
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReleases();
      setReleases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpdateSummary = useCallback(async (versionKey: string, summary: string) => {
    await updateReleaseSummary(versionKey, summary);
    setReleases((prev) =>
      prev.map((r) => (r.versionKey === versionKey ? { ...r, summary } : r))
    );
  }, []);

  const handleDeleteRelease = useCallback(async (versionKey: string) => {
    await deleteRelease(versionKey);
    setReleases((prev) => prev.filter((r) => r.versionKey !== versionKey));
  }, []);

  const handleUpdateControl = useCallback(async (
    versionKey: string,
    control: {
      minimumRequiredVersion: string;
      forceUpdateRequired: boolean;
      maintenanceMessage: string;
      betaModeEnabled: boolean;
    },
  ) => {
    await updateReleaseControl(versionKey, control);
    setReleases((prev) =>
      prev.map((r) => (r.versionKey === versionKey ? { ...r, ...control } : r)),
    );
  }, []);

  return {
    releases,
    loading,
    error,
    updateSummary: handleUpdateSummary,
    updateControl: handleUpdateControl,
    deleteRelease: handleDeleteRelease,
    refresh,
  };
}
