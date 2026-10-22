import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useAppTheme } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { ColorTokens } from '../theme';

// "Hay una versión más reciente de Poquet · Actualizar / Ahora no".
//
// Owner's call (22 Oct 2026): updates are never applied behind the user's
// back. Every time the app opens (cold start, or coming back to it) we look
// for a new OTA and download it; once one is ready this banner offers it.
// "Actualizar" reloads into it behind an "Actualizando Poquet…" screen (not
// the launch logo, which felt like the app had closed); "Ahora no" hides it
// until the next time the app is opened. An update the user never accepts
// still applies by itself on the next cold start (expo-updates' default).
//
// Only on the main tabs, never mid-task (uploading or reviewing a statement,
// paying, adding a card, signing in).
const SHOW_ON = new Set(['Home', 'Calendar', 'Insights', 'Settings']);

// Coming back to the app counts as opening it, but quick app switches don't
// each need a request.
const MIN_CHECK_GAP_MS = 30 * 1000;

// FloatingTabBar: 8 top padding + 64 capsule + bottom padding (safe area, min 12).
const TAB_BAR_BODY = 8 + 64;

// The native reload screen can only show an image, a background colour and a
// spinner, all centred. These images are "Actualizando Poquet…" set below a
// transparent middle, so the spinner sits just above the text. 280x120 pt,
// drawn at 3x in the app's display font.
const UPDATING_IMG = {
  es: { dark: require('../../assets/2026-10-22-updating-es-dark.png'), light: require('../../assets/2026-10-22-updating-es-light.png') },
  en: { dark: require('../../assets/2026-10-22-updating-en-dark.png'), light: require('../../assets/2026-10-22-updating-en-light.png') },
};
const UPDATING_W = 280;
const UPDATING_H = 120;

let lastCheckAt = 0;
let checking = false;

async function lookForUpdate() {
  if (checking || Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return;
  checking = true;
  lastCheckAt = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (r.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline, server error, or expo-updates' own startup check is still
    // running: try again next time the app is opened.
  } finally {
    checking = false;
  }
}

export function UpdateBanner({ routeName }: { routeName?: string }) {
  const enabled = !__DEV__ && Updates.isEnabled;
  const { downloadedUpdate, isUpdatePending } = Updates.useUpdates();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const es = lang === 'es';
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // Cold start: expo-updates checks on load by itself; this is a backup a
    // few seconds later in case that check was skipped or failed.
    const t = setTimeout(lookForUpdate, 5000);
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasBackground = true;
      } else if (state === 'active' && wasBackground) {
        wasBackground = false;
        setDismissed(false); // "Ahora no" lasts until the next time it's opened
        lookForUpdate();
      }
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [enabled]);

  const isNew = downloadedUpdate?.type === Updates.UpdateInfoType.NEW;
  if (!enabled || !isUpdatePending || !isNew || dismissed || !routeName || !SHOW_ON.has(routeName)) return null;

  const update = () => {
    setRestarting(true);
    const img = Image.resolveAssetSource(UPDATING_IMG[es ? 'es' : 'en'][isDark ? 'dark' : 'light']);
    Updates.reloadAsync({
      reloadScreenOptions: {
        backgroundColor: colors.bg,
        ...(img?.uri ? { image: { url: img.uri, width: UPDATING_W, height: UPDATING_H }, imageResizeMode: 'contain' as const } : {}),
        spinner: { enabled: true, color: colors.ink3, size: 'medium' },
        fade: true,
      },
    }).catch(() => setRestarting(false));
  };

  return (
    <BannerCard
      bottom={TAB_BAR_BODY + Math.max(insets.bottom, 12) + 10}
      styles={styles}
      colors={colors}
      es={es}
      restarting={restarting}
      onUpdate={update}
      onDismiss={() => setDismissed(true)}
    />
  );
}

// Motion (owner's call, 22 Oct 2026 — core Animated, no new native module):
// enters from 24 px below with a fade and a soft spring that settles with a
// slight overshoot (~0.4 s); "Ahora no" slides it down and fades it out
// (~0.2 s) before it unmounts. With "Reduce Motion" on, it only fades.
const ENTER_OFFSET = 24;

function BannerCard({
  bottom,
  styles,
  colors,
  es,
  restarting,
  onUpdate,
  onDismiss,
}: {
  bottom: number;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorTokens;
  es: boolean;
  restarting: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(ENTER_OFFSET)).current;
  const reduceMotion = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        reduceMotion.current = !!reduce;
        if (reduce) offset.setValue(0);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          reduce
            ? Animated.delay(0)
            : Animated.spring(offset, { toValue: 0, stiffness: 260, damping: 18, mass: 1, useNativeDriver: true }),
        ]).start();
      });
    return () => {
      cancelled = true;
    };
  }, [opacity, offset]);

  const dismiss = () => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(offset, { toValue: reduceMotion.current ? 0 : 16, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  return (
    <Animated.View
      style={[styles.card, { bottom, opacity, transform: [{ translateY: offset }] }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconTile}>
        <Ionicons name="refresh" size={19} color={colors.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>
          {es ? 'Hay una versión más reciente de Poquet' : 'A newer version of Poquet is ready'}
        </Text>
        <Text style={styles.body}>
          {es ? 'Trae mejoras y correcciones. Tarda un segundo.' : 'It brings improvements and fixes. It takes a second.'}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onUpdate}
            disabled={restarting}
            style={[styles.primary, restarting && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{es ? 'Actualizar' : 'Update'}</Text>
          </Pressable>
          <Pressable onPress={dismiss} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>{es ? 'Ahora no' : 'Not now'}</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      position: 'absolute',
      left: 14,
      right: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    iconTile: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 14, fontWeight: '600', color: colors.ink },
    body: { fontSize: 12.5, lineHeight: 17, color: colors.ink2, marginTop: 3 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    // Accent only on the control (design-system rule), solid fill.
    primary: { height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
    primaryText: { fontSize: 13, fontWeight: '600', color: colors.onTint2 },
    secondary: { height: 44, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
    secondaryText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  });
}
