import React, { useCallback, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { DecoratedCard } from '../decorate';
import { ColorTokens, radius } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { CardArt } from './CardArt';

const SPRING = { damping: 20, stiffness: 200, mass: 0.9 };
const OPEN_THRESHOLD = 70;
const MAX_GROW = 0.05;

export type HeroFrame = { x: number; y: number; width: number; height: number };

export function StackCard({
  card,
  top,
  zIndex,
  style,
  onOpen,
}: {
  card: DecoratedCard;
  top: number;
  zIndex: number;
  style: StyleProp<ViewStyle>;
  onOpen: (cardId: string, frame: HeroFrame) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ref = useRef<Animated.View>(null);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // Drag can leave a card displaced/grown if it opened CardDetail mid-gesture —
  // put it back to rest whenever Home regains focus (e.g. coming back).
  useFocusEffect(
    useCallback(() => {
      translateY.value = 0;
      scale.value = 1;
    }, [translateY, scale]),
  );

  const open = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onOpen(card.id, { x, y, width, height });
    });
  }, [card.id, onOpen]);

  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(open)();
  });

  // Pulling a card down grows it slightly, like peeking at it in Wallet; past
  // the threshold releasing it opens CardDetail from wherever it ended up,
  // otherwise it springs back to its stacked position.
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-15, 15])
    .onChange((e) => {
      if (e.translationY <= 0) return;
      translateY.value = e.translationY;
      scale.value = 1 + Math.min(e.translationY / 600, MAX_GROW);
    })
    .onEnd((e) => {
      if (e.translationY > OPEN_THRESHOLD) {
        runOnJS(open)();
        return;
      }
      translateY.value = withSpring(0, SPRING);
      scale.value = withSpring(1, SPRING);
    });

  const gesture = Gesture.Race(tap, pan);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={ref} style={[style, { top, zIndex }, dragStyle]}>
        <CardArt cardId={card.id} style={styles.cardArt}>
          <View style={styles.cardTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardBank}>{card.bank}</Text>
              <Text style={styles.cardSub}>
                {card.product} · {card.last4}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardBalance}>{card.balanceText}</Text>
              <Text style={styles.cardSub}>{card.dueShort}</Text>
            </View>
          </View>
          <Text style={styles.cardNetwork}>{card.network.toUpperCase()}</Text>
        </CardArt>
      </Animated.View>
    </GestureDetector>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    cardArt: {
      flex: 1,
      borderRadius: radius.xl,
      padding: 18,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOpacity: 0.55,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: -12 },
      elevation: 6,
    },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBank: { fontSize: 15, fontWeight: '600', color: colors.onArt, letterSpacing: 0.2 },
    cardSub: { fontSize: 11.5, color: 'rgba(243,245,254,0.62)', marginTop: 3 },
    cardBalance: { fontSize: 17, fontWeight: '600', color: colors.onArt },
    cardNetwork: { fontSize: 10.5, fontWeight: '500', letterSpacing: 1.4, color: 'rgba(243,245,254,0.62)' },
  });
}
