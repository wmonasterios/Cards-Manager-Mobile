import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { artGradient, artKey } from '../data';
import { CARD_PALETTE_ORDER } from '../theme';

// Decorative shapes drawn over the card color so cards read as designed
// objects rather than flat swatches. Sizes and offsets are percentages of the
// card, so the same art scales down to the small thumbnails/swatches. Each
// palette color gets its own combination, so two cards side by side differ.
const SOFT = 'rgba(255,255,255,0.20)';
const SOFTER = 'rgba(255,255,255,0.13)';

const DECOR: ViewStyle[][] = [
  // big circle top-right + small dot
  [
    { width: '62%', aspectRatio: 1, borderRadius: 9999, backgroundColor: SOFT, right: '-18%', top: '-70%' },
    { width: '14%', aspectRatio: 1, borderRadius: 9999, backgroundColor: SOFTER, right: '34%', bottom: '12%' },
  ],
  // thick ring bottom-left
  [
    { width: '48%', aspectRatio: 1, borderRadius: 9999, borderWidth: 22, borderColor: SOFT, left: '-14%', bottom: '-70%' },
  ],
  // tilted pill across the right side
  [
    {
      width: '78%',
      height: '42%',
      borderRadius: 9999,
      backgroundColor: SOFT,
      right: '-26%',
      top: '38%',
      transform: [{ rotate: '-24deg' }],
    },
  ],
  // two overlapping circles bottom-right
  [
    { width: '40%', aspectRatio: 1, borderRadius: 9999, backgroundColor: SOFT, right: '-8%', bottom: '-46%' },
    { width: '22%', aspectRatio: 1, borderRadius: 9999, backgroundColor: SOFTER, right: '24%', bottom: '-10%' },
  ],
];

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
  const keyIndex = Math.max(0, CARD_PALETTE_ORDER.indexOf(artKey(cardId, colorKey)));
  const shapes = DECOR[keyIndex % DECOR.length];
  // Clip the shapes in their own layer (matching the card's corner radii)
  // instead of putting overflow:hidden on the card itself — that would cut
  // off the drop shadow the Home stack gives each card on iOS.
  const flat = StyleSheet.flatten(style) ?? {};
  const corners: ViewStyle = {
    borderRadius: flat.borderRadius,
    borderTopLeftRadius: flat.borderTopLeftRadius,
    borderTopRightRadius: flat.borderTopRightRadius,
    borderBottomLeftRadius: flat.borderBottomLeftRadius,
    borderBottomRightRadius: flat.borderBottomRightRadius,
  };
  return (
    <LinearGradient
      colors={[c0, c1, c2]}
      locations={[0, 0.52, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={style}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, corners]}>
        {shapes.map((s, i) => (
          <View key={i} style={[styles.shape, s]} />
        ))}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  shape: { position: 'absolute' },
});
