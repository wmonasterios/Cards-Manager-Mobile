import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useT } from '../i18n/LocaleContext';
import { CardArt } from '../components/CardArt';
import { ProgressBar } from '../components/ProgressBar';
import { TxRow } from '../components/TxRow';
import { Segmented } from '../components/Segmented';
import { BackButton } from '../components/BackButton';
import { DateField } from '../components/DateField';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

const TODAY = '2026-09-14';
type RangeKey = 'cycle' | '3cycles' | 'ytd' | 'custom';

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CardDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const { getCard, togglePaid } = useCards();
  const card = getCard(cardId);
  const colors = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [range, setRange] = useState<RangeKey>('cycle');
  const [showAll, setShowAll] = useState(false);
  const [fromDate, setFromDate] = useState(new Date(2026, 6, 1));
  const [toDate, setToDate] = useState(new Date(2026, 8, 14));

  const rangeStart =
    range === 'cycle'
      ? '2026-08-14'
      : range === '3cycles'
        ? '2026-06-14'
        : range === 'ytd'
          ? '2026-01-01'
          : toIso(fromDate);
  const rangeEnd = range === 'custom' ? toIso(toDate) : TODAY;

  const rangeTx = useMemo(
    () => (card ? card.dtx.filter((tx) => tx.iso >= rangeStart && tx.iso <= rangeEnd) : []),
    [card, rangeStart, rangeEnd],
  );
  const shown = showAll ? rangeTx : rangeTx.slice(0, 5);
  const rangeSpend = rangeTx.reduce((n, tx) => n + (tx.amount < 0 ? -tx.amount : 0), 0);

  if (!card) return null;

  const balanceLabel = card.paidAmt > 0 ? t.leftToPay : t.stmtBal;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.topActions}>
            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Statements' })}
              style={styles.pillBtn}
            >
              <Text style={styles.pillBtnText}>{t.statements}</Text>
            </Pressable>
            <Pressable
              onPress={() => togglePaid(card.id)}
              style={[styles.pillBtn, styles.pillBtnAccent]}
            >
              <Text style={[styles.pillBtnText, { color: colors.accent }]}>
                {card.paid ? t.markUnpaid : t.markPaid}
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
            <Text style={styles.tileLabel}>{t.payDue}</Text>
            <Text style={styles.tileValue}>{card.dueShort}</Text>
            <Text style={[styles.tileNote, { color: card.stateInk }]}>{card.stateText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t.minPay}</Text>
            <Text style={styles.tileValue}>{card.minText}</Text>
            <Text style={styles.tileNote}>Full payment {card.balanceText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t.creditUsed}</Text>
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
            <Text style={styles.payBtnText}>{t.registerPay}</Text>
          </Pressable>
        </View>

        {card.plans.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t.plans}</Text>
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
            <Text style={styles.sectionTitle}>{t.transactions}</Text>
            <Text style={styles.sectionNote}>{card.cycleNote}</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Segmented
              options={[
                { key: 'cycle', label: t.thisCycle },
                { key: '3cycles', label: t.threeCycles },
                { key: 'ytd', label: t.ytd },
                { key: 'custom', label: t.range },
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
              <DateField
                label="From"
                value={fromDate}
                onChange={setFromDate}
                maximumDate={toDate}
              />
              <DateField
                label="To"
                value={toDate}
                onChange={setToDate}
                minimumDate={fromDate}
              />
            </View>
          )}
          <Text style={styles.txNote}>
            {rangeTx.length} {t.transactions.toLowerCase()} · {money('US$', rangeSpend)}
          </Text>
          <View style={styles.listCard}>
            {shown.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id, cardId: card.id })}
              />
            ))}
          </View>
          {rangeTx.length === 0 && (
            <Text style={styles.emptyNote}>No transactions in this range.</Text>
          )}
          {(rangeTx.length > shown.length || showAll) && rangeTx.length > 0 && (
            <Pressable onPress={() => setShowAll((v) => !v)} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>
                {showAll ? t.showLess : `${t.showAll} ${rangeTx.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
    dateRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
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
}
