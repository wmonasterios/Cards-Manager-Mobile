import React, { createContext, useContext, useMemo } from 'react';
import { dict, Dict, Lang } from './dict';
import { usePersistedState } from '../storage/usePersistedState';

type LocaleContextValue = {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = usePersistedState<Lang>('lang', 'en');
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
