import React, { useMemo, useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DecoratedCard } from '../decorate';
import { ColorTokens, radius } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { CardArt } from './CardArt';

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
  const ref = useRef<View>(null);

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ref.current?.measureInWindow((x, y, width, height) => {
      onOpen(card.id, { x, y, width, height });
    });
  };

  return (
    <Pressable ref={ref} onPress={open} style={[style, { top, zIndex }]}>
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
    </Pressable>
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
