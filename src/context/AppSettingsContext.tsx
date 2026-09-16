import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

type AppSettingsValue = {
  signedIn: boolean;
  toggleSignedIn: () => void;
  reminder: boolean;
  toggleReminder: () => void;
  notifyNew: boolean;
  toggleNotifyNew: () => void;
  weekly: boolean;
  toggleWeekly: () => void;
  faceLock: boolean;
  toggleFaceLock: () => void;
  onboarded: boolean;
  completeOnboarding: () => void;
};

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(true);
  const [reminder, setReminder] = useState(true);
  const [notifyNew, setNotifyNew] = useState(true);
  const [weekly, setWeekly] = useState(false);
  const [faceLock, setFaceLock] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  const value = useMemo(
    () => ({
      signedIn,
      toggleSignedIn: () => setSignedIn((v) => !v),
      reminder,
      toggleReminder: () => setReminder((v) => !v),
      notifyNew,
      toggleNotifyNew: () => setNotifyNew((v) => !v),
      weekly,
      toggleWeekly: () => setWeekly((v) => !v),
      faceLock,
      toggleFaceLock: () => setFaceLock((v) => !v),
      onboarded,
      completeOnboarding: () => setOnboarded(true),
    }),
    [signedIn, reminder, notifyNew, weekly, faceLock, onboarded],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
