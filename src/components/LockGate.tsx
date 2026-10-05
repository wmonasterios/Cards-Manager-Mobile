import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, AppState, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useColors } from '../theme/ThemeContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { useLocale } from '../i18n/LocaleContext';
import { radius, fonts } from '../theme';
import { PinPad } from './PinPad';
import { PIN_LENGTH, hasPin, verifyPin, pinLockoutRemainingMs } from '../pin';

type Mode = 'biometric' | 'pin' | null;

export function LockGate({ children }: { children: React.ReactNode }) {
  const { faceLock } = useAppSettings();
  const colors = useColors();
  const { t } = useLocale();
  const styles = stylesFor(colors);
  // Fail closed: assume locked until the first check resolves, so there's
  // never a flash of real data while we're still deciding.
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [mode, setMode] = useState<Mode>(null);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(0);
  const appState = useRef(AppState.currentState);
  const authenticating = useRef(false);

  const tryBiometric = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t.unlockPrompt });
      if (result.success) setLocked(false);
    } catch {
      // Never let a broken biometrics check permanently lock someone out of their own data.
      setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, [t]);

  const evaluate = useCallback(async () => {
    const pinExists = await hasPin();
    setPinAvailable(pinExists);
    if (!faceLock && !pinExists) {
      setLocked(false);
      setReady(true);
      return;
    }
    setLocked(true);
    setPinValue('');
    setPinError(false);
    if (faceLock) {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (hasHardware && isEnrolled) {
        setMode('biometric');
        setReady(true);
        tryBiometric();
        return;
      }
    }
    if (pinExists) {
      setMode('pin');
      setLockoutMs(await pinLockoutRemainingMs());
      setReady(true);
      return;
    }
    // Face ID was asked for but this device has neither biometrics nor a PIN
    // to fall back on — don't permanently lock someone out of their own data.
    setLocked(false);
    setReady(true);
  }, [faceLock, tryBiometric]);

  useEffect(() => {
    evaluate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceLock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Only 'background' means the app was truly hidden (home button, app switch).
      // The Face ID / passcode sheet itself briefly reports 'inactive', which must
      // NOT re-trigger a prompt or every successful unlock immediately asks again.
      if (appState.current === 'background' && next === 'active' && !authenticating.current) {
        evaluate();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [evaluate]);

  useEffect(() => {
    if (lockoutMs <= 0) return;
    const id = setInterval(() => {
      setLockoutMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutMs]);

  const onPinChange = async (next: string) => {
    setPinError(false);
    setPinValue(next);
    if (next.length < PIN_LENGTH) return;
    const ok = await verifyPin(next);
    if (ok) {
      setLocked(false);
      return;
    }
    setPinValue('');
    const remaining = await pinLockoutRemainingMs();
    if (remaining > 0) {
      setLockoutMs(remaining);
    } else {
      setPinError(true);
    }
  };

  if (!ready) return <View style={styles.screen} />;
  if (!locked) return <>{children}</>;

  if (mode === 'pin') {
    const lockedOut = lockoutMs > 0;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t.pinUnlockTitle}</Text>
        {(pinError || lockedOut) && (
          <Text style={styles.error}>
            {lockedOut ? t.pinUnlockLockedTemplate.replace('{seconds}', String(Math.ceil(lockoutMs / 1000))) : t.pinUnlockError}
          </Text>
        )}
        <View style={styles.padWrap}>
          <PinPad length={PIN_LENGTH} value={pinValue} onChange={onPinChange} error={pinError} disabled={lockedOut} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t.lockTitle}</Text>
      <Text style={styles.sub}>{t.lockSub}</Text>
      <Pressable onPress={tryBiometric} style={styles.btn}>
        <Text style={styles.btnText}>{t.unlock}</Text>
      </Pressable>
      {pinAvailable && (
        <Pressable onPress={() => setMode('pin')} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>{t.securitySetupUsePinInstead}</Text>
        </Pressable>
      )}
    </View>
  );
}

function stylesFor(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
    title: { fontSize: 22, fontFamily: fonts.display, color: colors.ink },
    sub: { fontSize: 13, color: colors.ink2, marginTop: 8, textAlign: 'center' },
    error: { fontSize: 13, color: colors.seg1, marginTop: 8, textAlign: 'center' },
    padWrap: { marginTop: 28, alignItems: 'center' },
    btn: {
      marginTop: 24,
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    btnText: { fontSize: 14, fontWeight: '500', color: colors.onTint2 },
    linkBtn: { marginTop: 14, padding: 8 },
    linkBtnText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  });
}
