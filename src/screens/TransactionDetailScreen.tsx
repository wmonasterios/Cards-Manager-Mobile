import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useT } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'TransactionDetail'>;

export function TransactionDetailScreen({ route, navigation }: Props) {
  const { txId, cardId } = route.params;
  const { getCard } = useCards();
  const card = getCard(cardId);
  const tx = card?.dtx.find((t) => t.id === txId);
  const colors = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!card || !tx) return null;

  const statusNote = tx.declined
    ? `Declined by ${card.bank} — over limit`
    : tx.amount > 0
      ? `Payment credited to ${card.bank}`
      : `Posted · ${card.bank} ${card.last4}`;

  const rows = [
    { label: t.card, value: `${card.bank} ${card.product}` },
    { label: t.category, value: tx.category },
    { label: t.dateLabel, value: `${tx.date}, 2026` },
    { label: t.plan, value: tx.plan ? `${tx.plan} · 0%` : t.single },
    { label: t.inCycle, value: card.cycleNote },
    { label: t.originalDesc, value: tx.merchant.toUpperCase() },
  ];

  const sourceNote = `Read from the ${card.bank} statement PDF received on ${card.cutoff}. Amounts can differ from the bank app until the next statement arrives.`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.identityRow}>
            <View style={[styles.badge, { backgroundColor: tx.catBg }]}>
              <Text style={[styles.badgeText, { color: tx.catInk }]}>{tx.initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.merchant}>{tx.merchant}</Text>
              <Text style={styles.sub}>{tx.sub}</Text>
            </View>
          </View>
          <Text style={[styles.amount, { color: tx.amountInk }]}>{tx.amountText}</Text>
          <Text style={styles.statusNote}>{statusNote}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.listCard}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sourceCard}>
            <Text style={styles.sourceNote}>{sourceNote}</Text>
            <View style={styles.sourceActions}>
              <Pressable
                onPress={() => navigation.navigate('Tabs', { screen: 'Statements' })}
                style={styles.sourceBtn}
              >
                <Text style={styles.sourceBtnText}>{t.openStatement}</Text>
              </Pressable>
              <Pressable
                onPress={() => Alert.alert(t.changeCategory, 'Category editing is coming in a later update.')}
                style={styles.sourceBtn}
              >
                <Text style={styles.sourceBtnText}>{t.changeCategory}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22 },
    badge: { width: 54, height: 54, borderRadius: radius.xl - 2, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontSize: 16, fontWeight: '600' },
    merchant: { fontSize: 19, fontWeight: '500', color: colors.ink },
    sub: { fontSize: 12, color: colors.ink3, marginTop: 4 },
    amount: { fontSize: 40, fontWeight: '600', marginTop: 20, letterSpacing: -0.6 },
    statusNote: { fontSize: 12.5, color: colors.ink3, marginTop: 6 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    listCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.hair,
    },
    rowLabel: { fontSize: 13, color: colors.ink2b },
    rowValue: { fontSize: 13, fontWeight: '500', color: colors.ink, textAlign: 'right', flexShrink: 1 },
    sourceCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    sourceNote: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
    sourceActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    sourceBtn: {
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.hair4,
    },
    sourceBtnText: { fontSize: 12, fontWeight: '500', color: colors.ink },
  });
}
