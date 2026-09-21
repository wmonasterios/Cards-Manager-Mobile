import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { artGradient } from '../data';

export function CardArt({
  cardId,
  colorKey,
  style,
  children,
}: {
  cardId: string;
  colorKey?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const [c0, c1, c2] = artGradient(cardId, colorKey);
  return (
    <LinearGradient
      colors={[c0, c1, c2]}
      locations={[0, 0.52, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
