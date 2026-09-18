import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens, getCategoryColors, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { Segmented } from '../components/Segmented';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Period = 'Week' | 'Month' | 'Year';

const BARS = [
  { label: 'Wk 1', pct: 42 }, { label: 'Wk 2', pct: 68 }, { label: 'Wk 3', pct: 100 },
  { label: 'Wk 4', pct: 34 }, { label: 'Wk 5', pct: 12 },
];

const CATEGORIES = [
  { name: 'groceries', amount: 'US$ 359.70', count: '4 transactions', pct: 100 },
  { name: 'home', amount: 'US$ 210.90', count: '3 instalments', pct: 59 },
  { name: 'travel', amount: 'US$ 142.00', count: '1 instalment', pct: 39 },
  { name: 'dining', amount: 'US$ 62.40', count: '1 transaction', pct: 17 },
  { name: 'health', amount: 'US$ 41.80', count: '1 transaction', pct: 12 },
];

export function InsightsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards, isDemo } = useCards();
  const [period, setPeriod] = useState<Period>('Month');
  const [excludedCardIds, setExcludedCardIds] = useState<Set<string>>(() => new Set());

  const toggleCard = (id: string) => {
    setExcludedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === cards.length) return prev; // never exclude every card
      return next;
    });
  };

  const includedCards = useMemo(
    () => cards.filter((c) => !excludedCardIds.has(c.id)),
    [cards, excludedCardIds],
  );

  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, { amount: number; count: number }> = {};
    let total = 0;
    for (const card of includedCards) {
      for (const tx of card.dtx) {
        if (tx.amount >= 0) continue; // only real charges, not payments/credits
        const entry = totals[tx.category] ?? (totals[tx.category] = { amount: 0, count: 0 });
        entry.amount += Math.abs(tx.amount);
        entry.count += 1;
        total += Math.abs(tx.amount);
      }
    }
    const rows = Object.entries(totals)
      .map(([name, v]) => ({
        name,
        amount: v.amount,
        count: v.count,
        pct: total > 0 ? Math.round((v.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    return { rows, total };
  }, [includedCards]);

  const periodRange =
    period === 'Week' ? '7 – 13 Sep' : period === 'Year' ? (lang === 'es' ? '2026 hasta hoy' : '2026 so far') : (lang === 'es' ? 'Septiembre 2026' : 'September 2026');
  const periodTotal = period === 'Week' ? 'US$ 388.62' : period === 'Year' ? 'US$ 9,420.55' : 'US$ 1,395.60';
  const periodNote =
    lang === 'es'
      ? '4 tarjetas · las cuotas cuentan como el cargo mensual'
      : 'Across 4 cards · instalments counted as the monthly charge';
  const insightNote =
    lang === 'es'
      ? 'Las cuotas suman US$ 310 al mes por los próximos cuatro meses. Dos planes terminan en octubre y liberan US$ 231.90.'
      : 'Instalments add US$ 310 a month for the next four months. Two plans end in October, freeing US$ 231.90.';
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          {isDemo && (
            <>
              <View style={styles.periodWrap}>
                <Segmented
                  options={[
                    { key: 'Week', label: t.week },
                    { key: 'Month', label: t.month },
                    { key: 'Year', label: t.year },
                  ]}
                  value={period}
                  onChange={setPeriod}
                />
              </View>
              <Text style={styles.periodRange}>{periodRange}</Text>
              <Text style={styles.periodTotal}>{periodTotal}</Text>
              <Text style={styles.periodNote}>{periodNote}</Text>

              <View style={styles.chartCard}>
                <View style={styles.chartRow}>
                  {BARS.map((b) => (
                    <View key={b.label} style={styles.barCol}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${b.pct}%`, backgroundColor: b.pct === 100 ? colors.accent : colors.line },
                        ]}
                      />
                      <Text style={styles.barLabel}>{b.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        {isDemo ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.byCategory}</Text>
            <View style={styles.listCard}>
              {CATEGORIES.map((c) => {
                const catColors = getCategoryColors(colors)[c.name] ?? getCategoryColors(colors).other;
                return (
                <Pressable
                  key={c.name}
                  style={styles.catRow}
                  onPress={() => navigation.navigate('Transactions', { initialQuery: c.name })}
                >
                  <View style={[styles.catBadge, { backgroundColor: catColors.bg }]}>
                    <Ionicons name={catColors.icon as any} size={16} color={catColors.ink} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.catName}>{categoryLabel(c.name)}</Text>
                    <View style={styles.catBarTrack}>
                      <View style={[styles.catBarFill, { width: `${c.pct}%` }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.catAmount}>{c.amount}</Text>
                    <Text style={styles.catCount}>{c.count}</Text>
                  </View>
                </Pressable>
                );
              })}
            </View>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{insightNote}</Text>
            </View>
          </View>
        ) : cards.length === 0 ? (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {lang === 'es' ? 'Agrega una tarjeta para ver insights' : 'Add a card to see insights'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {cards.length > 1 && (
              <View style={styles.section}>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setExcludedCardIds(new Set())}
                    style={[styles.chip, excludedCardIds.size === 0 && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, excludedCardIds.size === 0 && styles.chipTextActive]}>
                      {lang === 'es' ? 'Todas' : 'All'}
                    </Text>
                  </Pressable>
                  {cards.map((c) => {
                    const active = !excludedCardIds.has(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => toggleCard(c.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                          {c.bank} {c.last4}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.periodTotal}>{money('US$', categoryBreakdown.total)}</Text>
              <Text style={styles.periodNote}>
                {includedCards.length} {includedCards.length === 1 ? (lang === 'es' ? 'tarjeta' : 'card') : (lang === 'es' ? 'tarjetas' : 'cards')} ·{' '}
                {lang === 'es' ? 'todo el historial' : 'all-time'}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.byCategory}</Text>
              {categoryBreakdown.rows.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyBody}>
                    {lang === 'es'
                      ? 'Todavía no hay transacciones. Sube un estado de cuenta para ver tu gasto por categoría.'
                      : 'No transactions yet. Upload a statement to see your spending by category.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.listCard}>
                  {categoryBreakdown.rows.map((c) => {
                    const catColors = getCategoryColors(colors)[c.name] ?? getCategoryColors(colors).other;
                    return (
                      <Pressable
                        key={c.name}
                        style={styles.catRow}
                        onPress={() => navigation.navigate('Transactions', { initialQuery: c.name })}
                      >
                        <View style={[styles.catBadge, { backgroundColor: catColors.bg }]}>
                          <Ionicons name={catColors.icon as any} size={16} color={catColors.ink} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.catName}>{categoryLabel(c.name)}</Text>
                          <View style={styles.catBarTrack}>
                            <View style={[styles.catBarFill, { width: `${c.pct}%` }]} />
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.catAmount}>{money('US$', c.amount)}</Text>
                          <Text style={styles.catCount}>
                            {c.pct}% · {c.count} {c.count === 1 ? (lang === 'es' ? 'transacción' : 'transaction') : (lang === 'es' ? 'transacciones' : 'transactions')}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    periodWrap: { alignSelf: 'flex-start', minWidth: 200 },
    periodRange: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 18, letterSpacing: -0.3 },
    periodTotal: { fontSize: 34, fontWeight: '600', color: colors.ink, marginTop: 10, letterSpacing: -0.5 },
    periodNote: { fontSize: 12, color: colors.ink3, marginTop: 6 },
    chartCard: {
      marginTop: 18,
      paddingHorizontal: 14,
      paddingTop: 16,
      paddingBottom: 10,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 130 },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: '100%' },
    bar: { width: '100%', maxWidth: 26, borderRadius: 5 },
    barLabel: { fontSize: 10, color: colors.ink3 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg + 2 },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    catRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    catBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm + 1,
      backgroundColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catBadgeText: { fontSize: 11, fontWeight: '600', color: colors.tintInk2 },
    catName: { fontSize: 13, fontWeight: '500', color: colors.ink },
    catBarTrack: { height: 3, borderRadius: 999, backgroundColor: colors.line2, marginTop: 7, overflow: 'hidden' },
    catBarFill: { height: '100%', backgroundColor: colors.accent },
    catAmount: { fontSize: 13, fontWeight: '600', color: colors.ink },
    catCount: { fontSize: 10.5, color: colors.ink3, marginTop: 2 },
    noteCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    noteText: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
    emptyCard: {
      padding: 20,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    emptyTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
    emptyBody: { fontSize: 12.5, color: colors.ink2, marginTop: 6, textAlign: 'center', lineHeight: 18 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    chipActive: { backgroundColor: colors.tint2, borderColor: colors.tint2 },
    chipText: { fontSize: 11.5, fontWeight: '500', color: colors.ink2 },
    chipTextActive: { color: colors.onTint2 },
  });
}
