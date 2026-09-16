import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function ProgressBar({
  pct,
  fill = colors.bar,
  track = colors.line2,
  height = 4,
}: {
  pct: number;
  fill?: string;
  track?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={[styles.track, { backgroundColor: track, height, borderRadius: height }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: fill, height, borderRadius: height },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fill: {},
});
