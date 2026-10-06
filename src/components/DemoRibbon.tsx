import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VIVID } from '../theme';
import { useLocale } from '../i18n/LocaleContext';

// Persistent "DEMO MODE · Sample data" bar shown above every screen of the
// demo (same idea as Stripe's test-mode banner). Honey is a colour nothing
// else in the chrome uses, so it reads as "this is not your account" on any
// tab, in both themes.
export function DemoRibbon({ onExit }: { onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const { lang } = useLocale();
  const es = lang === 'es';
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.label}>{es ? 'MODO DEMO' : 'DEMO MODE'}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          · {es ? 'Datos de ejemplo' : 'Sample data'}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onExit} hitSlop={8} style={styles.exit} accessibilityRole="button">
          <Text style={styles.exitText}>{es ? 'Salir' : 'Exit'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const INK = '#121212';

const styles = StyleSheet.create({
  wrap: { backgroundColor: VIVID.honey },
  row: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, paddingRight: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: INK },
  label: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: INK },
  sub: { fontSize: 13, fontWeight: '500', color: INK, flexShrink: 1 },
  exit: { height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: INK, justifyContent: 'center' },
  exitText: { fontSize: 13, fontWeight: '700', color: VIVID.honey },
});
