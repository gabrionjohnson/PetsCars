import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDatabase } from '../db/client';
import { getFirstHome } from '../db/queries/homes';
import { checkIsPro } from '../billing/revenuecat';
import type { Home } from '../types/models';

interface AppStateValue {
  ready: boolean;
  home: Home | null;
  isPro: boolean;
  refreshHome: () => Promise<void>;
  refreshPro: () => Promise<void>;
  setHome: (home: Home) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [home, setHomeState] = useState<Home | null>(null);
  const [isPro, setIsPro] = useState(false);

  const refreshHome = useCallback(async () => {
    const current = await getFirstHome();
    setHomeState(current);
  }, []);

  const refreshPro = useCallback(async () => {
    const pro = await checkIsPro();
    setIsPro(pro);
  }, []);

  useEffect(() => {
    (async () => {
      await getDatabase();
      await refreshHome();
      await refreshPro();
      setReady(true);
    })();
  }, [refreshHome, refreshPro]);

  const setHome = useCallback((nextHome: Home) => {
    setHomeState(nextHome);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({ ready, home, isPro, refreshHome, refreshPro, setHome }),
    [ready, home, isPro, refreshHome, refreshPro, setHome]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
