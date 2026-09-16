import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import { CardArt } from '../components/CardArt';
import { TxRow } from '../components/TxRow';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const CARD_HEIGHT = 214;
const CARD_STEP = 86;

export function HomeScreen({ navigation }: Props) {
  const { cards } = useCards();

  const unpaid = cards.filter((c) => !c.paid);
  const totalOwed = unpaid.reduce((n, c) => n + c.remaining, 0);
  const stackHeight = CARD_HEIGHT + (cards.length - 1) * CARD_STEP;
  const recent = useMemo(() => cards.flatMap((c) => c.dtx).slice(0, 4), [cards]);

  const nextDueText = unpaid.length
    ? 'Banco Aliado due in 4 days — US$ 171.01 minimum'
    : 'Everything is paid this cycle';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>TOTAL OWED</Text>
            <Text style={styles.total}>{money('US$', totalOwed)}</Text>
            <Text style={styles.totalNote}>
              {cards.length} cards · {unpaid.length} with a balance
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('Transactions', {})}
              style={styles.iconBtn}
              hitSlop={6}
            >
              <Text style={styles.iconBtnText}>{'⌕'}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Statements')}
              style={[styles.iconBtn, styles.iconBtnAccent]}
              hitSlop={6}
            >
              <Text style={[styles.iconBtnText, { color: colors.accent }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.dueBanner}>
          <View style={styles.dueDot} />
          <Text style={styles.dueText}>{nextDueText}</Text>
        </View>

        <View style={[styles.stack, { height: stackHeight }]}>
          {cards.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => navigation.navigate('CardDetail', { cardId: c.id })}
              style={[styles.stackSlot, { top: i * CARD_STEP, zIndex: 10 + i }]}
            >
              <CardArt cardId={c.id} style={styles.cardArt}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardBank}>{c.bank}</Text>
                    <Text style={styles.cardSub}>
                      {c.product} · {c.last4}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.cardBalance}>{c.balanceText}</Text>
                    <Text style={styles.cardSub}>{c.dueShort}</Text>
                  </View>
                </View>
                <Text style={styles.cardNetwork}>{c.network.toUpperCase()}</Text>
              </CardArt>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest activity</Text>
          <Pressable onPress={() => navigation.navigate('Transactions', {})} hitSlop={6}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.listCard}>
          {recent.map((t) => (
            <TxRow
              key={t.id}
              tx={t}
              showCard
              onPress={() =>
                navigation.navigate('TransactionDetail', {
                  txId: t.id,
                  cardId: cards.find((c) => c.dtx.some((x) => x.id === t.id))?.id ?? cards[0].id,
                })
              }
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.2,
    color: colors.ink3,
    textTransform: 'uppercase',
  },
  total: { fontSize: 34, fontWeight: '600', color: colors.ink, marginTop: 8, letterSpacing: -0.5 },
  totalNote: { fontSize: 12, color: colors.ink3, marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hair4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnAccent: { borderColor: colors.accent },
  iconBtnText: { color: colors.ink, fontSize: 18 },
  dueBanner: {
    marginTop: 14,
    marginHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tint2,
  },
  dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentInk2 },
  dueText: { fontSize: 12.5, fontWeight: '500', color: colors.accentInk, flexShrink: 1 },
  stack: { marginTop: 18, paddingHorizontal: spacing.lg, position: 'relative' },
  stackSlot: { position: 'absolute', left: spacing.lg, right: spacing.lg, height: CARD_HEIGHT },
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
  sectionHeader: {
    marginTop: 8,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
  seeAll: { fontSize: 12, fontWeight: '500', color: colors.accent },
  listCard: {
    marginTop: 10,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
});
