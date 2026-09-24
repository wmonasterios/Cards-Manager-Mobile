import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, AppState, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useColors } from '../theme/ThemeContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { useLocale } from '../i18n/LocaleContext';
import { radius } from '../theme';

export function LockGate({ children }: { children: React.ReactNode }) {
  const { faceLock } = useAppSettings();
  const colors = useColors();
  const { t } = useLocale();
  const styles = stylesFor(colors);
  const [locked, setLocked] = useState(faceLock);
  const appState = useRef(AppState.currentState);
  const authenticating = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (!faceLock || authenticating.current) return;
    authenticating.current = true;
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        // Nothing to authenticate against on this device — don't block the user.
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t.unlockPrompt,
      });
      setLocked(!result.success);
    } catch {
      // Never let a broken biometrics check permanently lock someone out of their own data.
      setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, [faceLock, t]);

  useEffect(() => {
    if (faceLock) {
      setLocked(true);
      tryUnlock();
    } else {
      setLocked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceLock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Only 'background' means the app was truly hidden (home button, app switch).
      // The Face ID / passcode sheet itself briefly reports 'inactive', which must
      // NOT re-trigger a prompt or every successful unlock immediately asks again.
      if (appState.current === 'background' && next === 'active' && faceLock && !authenticating.current) {
        setLocked(true);
        tryUnlock();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [faceLock, tryUnlock]);

  if (!locked) return <>{children}</>;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t.lockTitle}</Text>
      <Text style={styles.sub}>{t.lockSub}</Text>
      <Pressable onPress={tryUnlock} style={styles.btn}>
        <Text style={styles.btnText}>{t.unlock}</Text>
      </Pressable>
    </View>
  );
}

function stylesFor(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
    title: { fontSize: 22, fontWeight: '600', color: colors.ink },
    sub: { fontSize: 13, color: colors.ink2, marginTop: 8, textAlign: 'center' },
    btn: {
      marginTop: 24,
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    btnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
  });
}
