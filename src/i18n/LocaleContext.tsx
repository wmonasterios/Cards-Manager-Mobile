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

// The device language, used whenever the person hasn't picked one in
// Settings. Reads Intl first: Hermes exposes the device locale there on both
// platforms, while NativeModules.I18nManager/SettingsManager can be missing
// under the new architecture (bridgeless) — that's how a Spanish Android
// phone ended up in English (Oct 2026). No new native dependency needed.
function detectSystemLang(): Lang {
  const candidates: unknown[] = [];
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {}
  try {
    candidates.push(
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ??
            NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier,
    );
  } catch {}
  const raw = candidates.find((c) => typeof c === 'string' && c.length > 0);
  return typeof raw === 'string' && raw.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Only an explicit pick in Settings is saved ('langChoice'). The old 'lang'
  // key also saved the auto-detected default, so a wrong first guess stuck
  // forever; it's ignored now, and everyone without a pick follows the device.
  const systemLang = useMemo(detectSystemLang, []);
  const [choice, setLang] = usePersistedState<Lang | null>('langChoice', null);
  const lang: Lang = choice ?? systemLang;
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
