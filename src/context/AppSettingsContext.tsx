import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { usePersistedState } from '../storage/usePersistedState';

type Settings = {
  reminder: boolean;
  notifyNew: boolean;
  weekly: boolean;
  faceLock: boolean;
  onboarded: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  reminder: true,
  notifyNew: true,
  weekly: false,
  faceLock: true,
  onboarded: false,
};

type AppSettingsValue = Settings & {
  toggleReminder: () => void;
  toggleNotifyNew: () => void;
  toggleWeekly: () => void;
  toggleFaceLock: () => void;
  completeOnboarding: () => void;
  loaded: boolean;
};

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings, loaded] = usePersistedState<Settings>('appSettings', DEFAULT_SETTINGS);

  const toggle = useCallback(
    (key: keyof Settings) => setSettings((prev) => ({ ...prev, [key]: !prev[key] })),
    [setSettings],
  );

  const value = useMemo(
    () => ({
      ...settings,
      toggleReminder: () => toggle('reminder'),
      toggleNotifyNew: () => toggle('notifyNew'),
      toggleWeekly: () => toggle('weekly'),
      toggleFaceLock: () => toggle('faceLock'),
      completeOnboarding: () => setSettings((prev) => ({ ...prev, onboarded: true })),
      loaded,
    }),
    [settings, toggle, setSettings, loaded],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
