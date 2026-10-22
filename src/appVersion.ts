import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// What's actually running: the app version plus the OTA bundle (its date and
// the start of its id). Read from expo-constants/expo-updates (both linked in
// every build) — never hardcode it. Used by Settings → About and sent with
// every support report, so a screenshot or a report tells exactly which code
// the person had.

export function updateLabel(es: boolean): string | null {
  if (__DEV__) return 'dev';
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return null;
  const date = Updates.createdAt.toLocaleDateString(es ? 'es' : 'en', { day: 'numeric', month: 'short' });
  const id = Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : '';
  return `${es ? 'actualización' : 'update'} ${date}${id}`;
}

// "Versión 1.1.0 · actualización 21 oct · 3f2a9c1e"
export function versionLine(es: boolean): string {
  const v = Constants.expoConfig?.version ?? '';
  const base = `${es ? 'Versión' : 'Version'} ${v}`.trim();
  const upd = updateLabel(es);
  return upd ? `${base} · ${upd}` : base;
}

export function platformLabel(): string {
  if (Platform.OS === 'ios') return 'iPhone';
  if (Platform.OS === 'android') return 'Android';
  return Platform.OS;
}

export function osVersion(): string {
  if (Platform.OS === 'ios') return `iOS ${Platform.Version}`;
  if (Platform.OS === 'android') return `Android API ${Platform.Version}`;
  return String(Platform.Version ?? '');
}

export function deviceInfo(lang: string) {
  return {
    appVersion: Constants.expoConfig?.version ?? null,
    updateId: Updates.updateId ?? null,
    updateLabel: updateLabel(true),
    platform: platformLabel(),
    osVersion: osVersion(),
    lang,
  };
}
