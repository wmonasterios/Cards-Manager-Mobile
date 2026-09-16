import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import { radius } from '../theme';

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
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 3,
        backgroundColor: colors.surface2,
        borderRadius: radius.md - 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={{
              flex: 1,
              paddingVertical: 9,
              paddingHorizontal: 6,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: active ? colors.tint2 : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 11.5, fontWeight: '500', color: active ? colors.onTint2 : colors.ink2 }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
