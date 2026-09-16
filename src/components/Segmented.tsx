import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

type Option<T extends string> = { key: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.opt, active && styles.optActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    backgroundColor: colors.surface2,
    borderRadius: radius.md - 2,
  },
  opt: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  optActive: {
    backgroundColor: colors.tint2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.ink2,
  },
  labelActive: {
    color: colors.onTint2,
  },
});
