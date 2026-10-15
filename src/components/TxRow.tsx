import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { radius } from '../theme';
import { DecoratedTransaction } from '../decorate';
import { isInstalment, parsePlan } from '../instalments';

export function TxRow({
  tx,
  onPress,
  showCard = false,
}: {
  tx: DecoratedTransaction;
  onPress: () => void;
  showCard?: boolean;
}) {
  const { lang } = useLocale();
  const cuotaWord = lang === 'es' ? 'Cuota' : 'Instalment';
  const movedWord = lang === 'es' ? 'Pasada a cuotas' : 'Moved to instalments';
  const colors = useColors();
  const p = isInstalment(tx) ? parsePlan(tx.plan) : null;
  const cuota = p ? `${cuotaWord} ${p.n}/${p.total}` : tx.planOriginal ? movedWord : null;
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
        <Ionicons name={tx.catIcon as any} size={16} color={tx.catInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '500', color: colors.ink }} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {!!tx.sub && (
            <Text style={{ fontSize: 11, color: tx.subInk, flexShrink: 1 }} numberOfLines={1}>
              {tx.sub}
            </Text>
          )}
          {cuota && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 999,
                backgroundColor: colors.tint,
              }}
            >
              <Ionicons name="calendar-outline" size={9} color={colors.ink2b} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.ink2b }}>{cuota}</Text>
            </View>
          )}
        </View>
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
