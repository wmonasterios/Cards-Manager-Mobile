import React, { createContext, useContext, useMemo } from 'react';
import { NativeModules, Platform } from 'react-native';
import { dict, Dict, Lang } from './dict';
import { usePersistedState } from '../storage/usePersistedState';

type LocaleContextValue = {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

// Only used as the one-time default before anyone has picked a language —
// usePersistedState only applies it when nothing is saved yet, so this never
// overrides an explicit choice. Reads the device locale straight off
// react-native's own SettingsManager/I18nManager (already part of every
// build, unlike expo-localization) so this needs no new native dependency.
function detectSystemLang(): Lang {
  try {
    const raw: unknown =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ??
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    return typeof raw === 'string' && raw.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = usePersistedState<Lang>('lang', detectSystemLang());
  const t = dict[lang];
  const value = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useT() {
  return useLocale().t;
}
