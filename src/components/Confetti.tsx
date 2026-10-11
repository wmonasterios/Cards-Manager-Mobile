import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { VIVID } from '../theme';

// A burst of confetti that rains from the top of the screen — pure JS
// (Animated + native driver), no native module, so it ships safely over OTA.
// Used for the "paid in full" celebration on the Pay screen.
const COLORS = [VIVID.coral, VIVID.violet, VIVID.honey, VIVID.sky, VIVID.pink, VIVID.green, '#C8FF4D'];
const PIECES = 70;

type Piece = {
  x: number;
  drift: number;
  size: number;
  ratio: number;
  color: string;
  delay: number;
  duration: number;
  spin: number;
  round: boolean;
};

export function Confetti({ onDone }: { onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, () => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 160,
        size: 6 + Math.random() * 7,
        ratio: 0.4 + Math.random() * 0.8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.25,
        duration: 0.6 + Math.random() * 0.4,
        spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
        round: Math.random() < 0.25,
      })),
    [width],
  );

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && onDone?.());
    return () => anim.stop();
  }, [progress, onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        // Each piece runs on its own slice of the shared 0→1 timeline.
        const start = p.delay;
        const end = Math.min(1, p.delay + p.duration);
        const local = progress.interpolate({ inputRange: [0, start, end, 1], outputRange: [0, 0, 1, 1] });
        const translateY = local.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] });
        const translateX = local.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.drift, p.drift * 0.6] });
        const rotate = local.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 180}deg`] });
        const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: 0,
              width: p.size,
              height: p.round ? p.size : p.size * p.ratio,
              borderRadius: p.round ? p.size / 2 : 1.5,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
