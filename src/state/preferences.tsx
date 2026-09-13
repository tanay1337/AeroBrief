import Storage from 'expo-sqlite/kv-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UnitPreferences } from '@/domain/models';
import { DEFAULT_PREFERENCES } from '@/domain/models';

const STORAGE_KEY = 'aerobrief.preferences.v1';

interface PreferencesContextValue {
  preferences: UnitPreferences;
  ready: boolean;
  updatePreferences: (patch: Partial<UnitPreferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const preferencesRef = useRef(DEFAULT_PREFERENCES);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    Storage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        const parsed = JSON.parse(stored) as Partial<UnitPreferences>;
        const next = { ...DEFAULT_PREFERENCES, onboardingCompleted: true, ...parsed };
        preferencesRef.current = next;
        setPreferences(next);
      })
      .catch(() => undefined)
      .finally(() => mounted && setReady(true));
    return () => { mounted = false; };
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<UnitPreferences>) => {
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    const write = writes.current.catch(() => undefined).then(() => Storage.setItem(STORAGE_KEY, JSON.stringify(next)));
    writes.current = write;
    await write;
  }, []);

  const value = useMemo(
    () => ({ preferences, ready, updatePreferences }),
    [preferences, ready, updatePreferences]
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
