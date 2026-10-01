// A dropped connection surfaces very differently depending on which layer it
// fails in (Supabase SDK, Expo's fetch polyfill, bare RN networking), so this
// matches on message content rather than an error class.
const OFFLINE_PATTERNS = /offline|network request failed|could not connect to the server/i;

export function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return OFFLINE_PATTERNS.test(msg);
}

export function offlineMessage(lang: 'en' | 'es'): string {
  return lang === 'es'
    ? 'No pudimos conectar. Revisa tu conexión a internet e intenta de nuevo.'
    : "We couldn't connect. Check your internet connection and try again.";
}
