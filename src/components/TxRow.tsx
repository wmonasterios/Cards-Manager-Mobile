import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { DecoratedTransaction } from '../decorate';

export function TxRow({
  tx,
  onPress,
  showCard = false,
}: {
  tx: DecoratedTransaction;
  onPress: () => void;
  showCard?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={[styles.badge, { backgroundColor: tx.catBg }]}>
        <Text style={[styles.badgeText, { color: tx.catInk }]}>{tx.initials}</Text>
      </View>
      <View style={styles.mid}>
        <Text style={styles.merchant} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <Text style={[styles.sub, { color: tx.subInk }]} numberOfLines={1}>
          {tx.sub}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: tx.amountInk }]}>{tx.amountText}</Text>
        <Text style={styles.date} numberOfLines={1}>
          {showCard ? `${tx.cardShort} · ${tx.date}` : tx.date}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.hair,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  mid: { flex: 1, minWidth: 0 },
  merchant: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
  sub: { fontSize: 11, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 13.5, fontWeight: '600' },
  date: { fontSize: 10.5, color: colors.ink3, marginTop: 2 },
});
