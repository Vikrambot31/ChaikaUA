import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ViewMode = 'simple' | 'full';

type ViewModeContextValue = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

const STORAGE_KEY = 'admin_view_mode';

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

const readInitialViewMode = (): ViewMode => {
  if (typeof window === 'undefined') return 'full';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'simple' || stored === 'full' ? stored : 'full';
  } catch {
    return 'full';
  }
};

export const ViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>(readInitialViewMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, viewMode);
    } catch {
      // Local preference only; ignore storage failures.
    }
  }, [viewMode]);

  const value = useMemo<ViewModeContextValue>(() => ({
    viewMode,
    setViewMode: setViewModeState,
  }), [viewMode]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
};

export const useViewMode = (): ViewModeContextValue => {
  const value = useContext(ViewModeContext);
  if (!value) throw new Error('useViewMode must be used within ViewModeProvider');
  return value;
};
