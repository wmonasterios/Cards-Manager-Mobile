import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cardsManager:';

// Loads `key` from disk once, then keeps it in sync on every change.
// `loaded` stays false until the initial read completes, so callers can
// avoid rendering (or persisting) default state before the real value
// has had a chance to load.
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (cancelled) return;
        if (raw != null) {
          try {
            setValue(JSON.parse(raw));
          } catch {
            // corrupted value, keep the default
          }
        }
      })
      .finally(() => {
        if (cancelled) return;
        hydrated.current = true;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
  }, [key, value]);

  return [value, setValue, loaded] as const;
}
