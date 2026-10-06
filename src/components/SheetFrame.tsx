import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';

// Bottom sheet chrome for a `transparentModal` stack screen: a dimmed
// backdrop (tap to dismiss) and a rounded panel anchored to the bottom.
export function SheetFrame({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Cerrar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.grabber} />
        {children}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,7,15,0.6)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  });
}
