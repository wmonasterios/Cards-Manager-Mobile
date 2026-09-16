import React from 'react';
import { View } from 'react-native';
import { useColors } from '../theme/ThemeContext';

export function ProgressBar({
  pct,
  fill,
  track,
  height = 4,
}: {
  pct: number;
  fill?: string;
  track?: string;
  height?: number;
}) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={{
        overflow: 'hidden',
        width: '100%',
        backgroundColor: track ?? colors.line2,
        height,
        borderRadius: height,
      }}
    >
      <View
        style={{
          width: `${clamped}%`,
          backgroundColor: fill ?? colors.bar,
          height,
          borderRadius: height,
        }}
      />
    </View>
  );
}
