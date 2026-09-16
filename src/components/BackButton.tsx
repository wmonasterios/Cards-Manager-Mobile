import React from 'react';
import { Pressable, Text } from 'react-native';
import { useColors } from '../theme/ThemeContext';

export function BackButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.hair4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.ink, fontSize: 17, marginTop: -2 }}>{'‹'}</Text>
    </Pressable>
  );
}
