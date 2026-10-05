import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function PinPad({
  length,
  value,
  onChange,
  error,
  disabled,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const press = (key: string) => {
    if (disabled) return;
    if (key === 'del') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < length) {
      onChange(value + key);
    }
  };

  return (
    <View>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && (error ? styles.dotErrorFilled : styles.dotFilled),
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            onPress={() => press(key)}
            disabled={disabled || !key}
            style={({ pressed }) => [
              styles.key,
              !key && styles.keyEmpty,
              pressed && key && styles.keyPressed,
            ]}
          >
            {key === 'del' ? (
              <Ionicons name="backspace-outline" size={22} color={colors.ink} />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 36 },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: 'transparent',
    },
    dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
    // seg1 (violet) is this design system's "urgent/late" signal elsewhere
    // (status rings, health bar) — reused here instead of a one-off red.
    dotErrorFilled: { backgroundColor: colors.seg1, borderColor: colors.seg1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, alignSelf: 'center' },
    key: {
      width: 88,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    keyEmpty: {},
    keyPressed: { backgroundColor: colors.tint },
    keyText: { fontSize: 24, fontWeight: '500', color: colors.ink },
  });
}
