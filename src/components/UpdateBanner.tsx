import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { supabase } from '../supabase/client';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { ColorTokens } from '../theme';

// "Hay una versión más reciente de Poquet · Actualizar / Ahora no".
//
// Most OTAs apply silently: at launch (src/launchUpdate.ts) or on the next
// cold start. This banner is only for updates flagged as important in
// public.app_config.important_update_after (set by hand right after
// publishing; see supabase/migrations/20261021_app_config.sql): it shows once
// such an update has been downloaded while the phone still runs an older one.
//
// Only on the main tabs, never mid-task (uploading or reviewing a statement,
// paying, adding a card, signing in). "Actualizar" reloads into the new
// bundle (about a second); "Ahora no" hides it until the next launch, when
// the update applies on its own anyway.
const SHOW_ON = new Set(['Home', 'Calendar', 'Insights', 'Settings']);

// Coming back after this long in the background, quietly look for an update,
// so one published while the app was left open still gets noticed. Checking
// on foreground is what expo-updates recommends; the gap just avoids a
// request on every quick app switch.
const RECHECK_AFTER_MS = 2 * 60 * 1000;

// FloatingTabBar: 8 top padding + 64 capsule + bottom padding (safe area, min 12).
const TAB_BAR_BODY = 8 + 64;

async function readImportantAfter(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('important_update_after')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data?.important_update_after) return null;
  const d = new Date(data.important_update_after as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function UpdateBanner({ routeName }: { routeName?: string }) {
  const enabled = !__DEV__ && Updates.isEnabled;
  const { currentlyRunning, downloadedUpdate, isUpdatePending } = Updates.useUpdates();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const es = lang === 'es';
  const [importantAfter, setImportantAfter] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let backgroundAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt = Date.now();
      } else if (state === 'active' && backgroundAt && Date.now() - backgroundAt >= RECHECK_AFTER_MS) {
        backgroundAt = 0;
        Updates.checkForUpdateAsync()
          .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : null))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Read the flag only once an update is actually waiting.
  const pendingId = downloadedUpdate?.updateId;
  useEffect(() => {
    if (!enabled || !isUpdatePending) return;
    readImportantAfter().then(setImportantAfter).catch(() => {});
  }, [enabled, isUpdatePending, pendingId]);

  const pendingAt = downloadedUpdate?.type === Updates.UpdateInfoType.NEW ? downloadedUpdate.createdAt : undefined;
  const runningAt = currentlyRunning.createdAt;
  const important =
    !!importantAfter &&
    !!pendingAt &&
    pendingAt.getTime() >= importantAfter.getTime() &&
    (!runningAt || runningAt.getTime() < importantAfter.getTime());

  if (!enabled || !isUpdatePending || !important || dismissed || !routeName || !SHOW_ON.has(routeName)) return null;

  const update = () => {
    setRestarting(true);
    Updates.reloadAsync({
      reloadScreenOptions: { backgroundColor: colors.bg, spinner: { enabled: true, color: colors.ink, size: 'medium' } },
    }).catch(() => setRestarting(false));
  };

  return (
    <View
      style={[styles.card, { bottom: TAB_BAR_BODY + Math.max(insets.bottom, 12) + 10 }]}
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
          {es ? 'Incluye correcciones. Tarda un segundo.' : 'It includes fixes. It takes a second.'}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={update}
            disabled={restarting}
            style={[styles.primary, restarting && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{es ? 'Actualizar' : 'Update'}</Text>
          </Pressable>
          <Pressable onPress={() => setDismissed(true)} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>{es ? 'Ahora no' : 'Not now'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
