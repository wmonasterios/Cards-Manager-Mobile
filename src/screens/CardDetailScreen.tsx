import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import { CardArt } from '../components/CardArt';
import { ProgressBar } from '../components/ProgressBar';
import { TxRow } from '../components/TxRow';
import { Segmented } from '../components/Segmented';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

const TODAY = '2026-09-14';
type RangeKey = 'cycle' | '3cycles' | 'ytd' | 'custom';

export function CardDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const { getCard, togglePaid } = useCards();
  const card = getCard(cardId);

  const [range, setRange] = useState<RangeKey>('cycle');
  const [showAll, setShowAll] = useState(false);
  const [from, setFrom] = useState('2026-07-01');
  const [to, setTo] = useState(TODAY);

  const rangeStart =
    range === 'cycle' ? '2026-08-14' : range === '3cycles' ? '2026-06-14' : range === 'ytd' ? '2026-01-01' : from;
  const rangeEnd = range === 'custom' ? to : TODAY;

  const rangeTx = useMemo(
    () => (card ? card.dtx.filter((t) => t.iso >= rangeStart && t.iso <= rangeEnd) : []),
    [card, rangeStart, rangeEnd],
  );
  const shown = showAll ? rangeTx : rangeTx.slice(0, 5);
  const rangeSpend = rangeTx.reduce((n, t) => n + (t.amount < 0 ? -t.amount : 0), 0);

  if (!card) return null;

  const balanceLabel = card.paidAmt > 0 ? 'Balance left to pay' : 'Statement balance';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.topActions}>
            <Pressable onPress={() => navigation.navigate('Statements')} style={styles.pillBtn}>
              <Text style={styles.pillBtnText}>Statements</Text>
            </Pressable>
            <Pressable
              onPress={() => togglePaid(card.id)}
              style={[styles.pillBtn, styles.pillBtnAccent]}
            >
              <Text style={[styles.pillBtnText, { color: colors.accent }]}>
                {card.paid ? 'Mark unpaid' : 'Mark as paid'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.heroWrap}>
          <CardArt cardId={card.id} style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroBank}>{card.bank}</Text>
                <Text style={styles.heroSub}>{card.product}</Text>
              </View>
              <Text style={styles.heroNetwork}>{card.network.toUpperCase()}</Text>
            </View>
            <View style={styles.heroBottom}>
              <Text style={styles.heroLast4}>{card.last4}</Text>
              <Text style={styles.heroCur}>Balances in USD</Text>
            </View>
          </CardArt>
        </View>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{balanceLabel}</Text>
            <Text style={styles.tileValue}>{card.balanceText}</Text>
            <Text style={styles.tileNote}>{card.paidNote}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Payment due</Text>
            <Text style={styles.tileValue}>{card.dueShort}</Text>
            <Text style={[styles.tileNote, { color: card.stateInk }]}>{card.stateText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Minimum payment</Text>
            <Text style={styles.tileValue}>{card.minText}</Text>
            <Text style={styles.tileNote}>Full payment {card.balanceText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>Credit used</Text>
            <Text style={styles.tileValue}>{card.usedPct}%</Text>
            <View style={{ marginTop: 10 }}>
              <ProgressBar pct={card.usedPct} fill={card.barInk} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => navigation.navigate('Pay', { cardId: card.id })}
            style={styles.payBtn}
          >
            <Text style={styles.payBtnText}>Register a payment</Text>
          </Pressable>
        </View>

        {card.plans.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Installment plans</Text>
              <Text style={styles.sectionNote}>{card.plansNote}</Text>
            </View>
            <View style={{ marginTop: 10, gap: 8 }}>
              {card.plans.map((p) => (
                <View key={p.merchant + p.plan} style={styles.planCard}>
                  <View style={styles.planTopRow}>
                    <Text style={styles.planMerchant}>{p.merchant}</Text>
                    <Text style={styles.planMonthly}>
                      {money(card.cur, p.monthly)}
                      <Text style={styles.planPer}> /mo</Text>
                    </Text>
                  </View>
                  <View style={styles.planSubRow}>
                    <Text style={styles.planSub}>
                      Instalment {p.plan} · {p.rate}
                    </Text>
                    <Text style={styles.planSub}>{money(card.cur, p.remaining)} left</Text>
                  </View>
                  <View style={{ marginTop: 9 }}>
                    <ProgressBar pct={p.pct} fill={colors.bar} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            <Text style={styles.sectionNote}>{card.cycleNote}</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Segmented
              options={[
                { key: 'cycle', label: 'This cycle' },
                { key: '3cycles', label: '3 cycles' },
                { key: 'ytd', label: 'YTD' },
                { key: 'custom', label: 'Range' },
              ]}
              value={range}
              onChange={(v) => {
                setRange(v);
                setShowAll(false);
              }}
            />
          </View>
          {range === 'custom' && (
            <View style={styles.dateRow}>
              <TextInput
                value={from}
                onChangeText={setFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                style={styles.dateInput}
              />
              <TextInput
                value={to}
                onChangeText={setTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.ink3}
                style={styles.dateInput}
              />
            </View>
          )}
          <Text style={styles.txNote}>
            {rangeTx.length} transactions · {money('US$', rangeSpend)}
          </Text>
          <View style={styles.listCard}>
            {shown.map((t) => (
              <TxRow
                key={t.id}
                tx={t}
                onPress={() => navigation.navigate('TransactionDetail', { txId: t.id, cardId: card.id })}
              />
            ))}
          </View>
          {rangeTx.length === 0 && (
            <Text style={styles.emptyNote}>No transactions in this range.</Text>
          )}
          {(rangeTx.length > shown.length || showAll) && rangeTx.length > 0 && (
            <Pressable onPress={() => setShowAll((v) => !v)} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>
                {showAll ? 'Show less' : `Show all ${rangeTx.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },
  topRow: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: { flexDirection: 'row', gap: 8 },
  pillBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hair4,
  },
  pillBtnAccent: { borderColor: colors.accent },
  pillBtnText: { fontSize: 11.5, fontWeight: '500', color: colors.ink },
  heroWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  hero: {
    borderRadius: radius.xl,
    padding: 18,
    height: 200,
    justifyContent: 'space-between',
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroBank: { fontSize: 16, fontWeight: '600', color: colors.onArt },
  heroSub: { fontSize: 12, color: 'rgba(243,245,254,0.62)', marginTop: 4 },
  heroNetwork: { fontSize: 11, fontWeight: '500', letterSpacing: 1.4, color: 'rgba(243,245,254,0.62)' },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroLast4: { fontSize: 14, fontWeight: '500', letterSpacing: 2.2, color: colors.onArt },
  heroCur: { fontSize: 11, color: 'rgba(243,245,254,0.62)' },
  tiles: {
    marginTop: 14,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '47.5%',
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileLabel: { fontSize: 11.5, color: colors.ink2 },
  tileValue: { fontSize: 22, fontWeight: '600', color: colors.ink, marginTop: 8 },
  tileNote: { fontSize: 11, color: colors.ink3, marginTop: 4 },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
  sectionNote: { fontSize: 11.5, color: colors.ink3 },
  payBtn: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  payBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
  planCard: {
    padding: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  planTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  planMerchant: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
  planMonthly: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  planPer: { fontSize: 10.5, fontWeight: '400', color: colors.ink3 },
  planSubRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  planSub: { fontSize: 11, color: colors.ink3 },
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  dateInput: {
    flex: 1,
    minWidth: 0,
    padding: 11,
    borderRadius: radius.md - 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: 12.5,
  },
  txNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10 },
  listCard: {
    marginTop: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  emptyNote: { padding: 18, fontSize: 12.5, color: colors.ink3 },
  moreBtn: {
    marginTop: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hair4,
    alignItems: 'center',
  },
  moreBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },
});
