import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import { radius } from '../theme';
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: colors.hair,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm + 1,
          backgroundColor: tx.catBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '600', color: tx.catInk }}>{tx.initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '500', color: colors.ink }} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <Text style={{ fontSize: 11, marginTop: 2, color: tx.subInk }} numberOfLines={1}>
          {tx.sub}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: tx.amountInk }}>{tx.amountText}</Text>
        <Text style={{ fontSize: 10.5, color: colors.ink3, marginTop: 2 }} numberOfLines={1}>
          {showCard ? `${tx.cardShort} · ${tx.date}` : tx.date}
        </Text>
      </View>
    </Pressable>
  );
}
