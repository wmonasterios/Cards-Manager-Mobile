import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { getAvailableMonths, analyseInsights, fmtMoney } from '../insightsAnalysis';

export function InsightsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards, isDemo } = useCards();
  const [excludedCardIds, setExcludedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedMonthIso, setSelectedMonthIso] = useState<string | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);

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

  const months = useMemo(() => getAvailableMonths(includedCards, lang), [includedCards, lang]);
  const monthIso = selectedMonthIso && months.some((m) => m.iso === selectedMonthIso)
    ? selectedMonthIso
    : months[months.length - 1]?.iso ?? null;
  const monthIdx = monthIso ? months.findIndex((m) => m.iso === monthIso) : -1;
  const prevMonthIso = monthIdx > 0 ? months[monthIdx - 1].iso : null;

  const goMonth = (delta: number) => {
    const next = monthIdx + delta;
    if (next < 0 || next >= months.length) return;
    setSelectedMonthIso(months[next].iso);
    setSelCat(null);
  };

  const analysis = useMemo(
    () => (monthIso ? analyseInsights(includedCards, monthIso, prevMonthIso, selCat, colors) : null),
    [includedCards, monthIso, prevMonthIso, selCat, colors],
  );

  const pickCategory = (name: string) => setSelCat((prev) => (prev === name ? null : name));

  const txWord = (n: number) => (lang === 'es' ? (n === 1 ? 'transacción' : 'transacciones') : n === 1 ? 'transaction' : 'transactions');
  const pctText = (share: number) => `${share < 10 ? share.toFixed(1) : Math.round(share)}%`;

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {lang === 'es' ? 'Agrega una tarjeta para ver insights' : 'Add a card to see insights'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!isDemo && cards.length > 1 && (
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

        {!analysis || monthIdx < 0 ? (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyBody}>
                {lang === 'es'
                  ? 'Todavía no hay transacciones. Sube un estado de cuenta para ver tus insights.'
                  : 'No transactions yet. Upload a statement to see your insights.'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Month stepper */}
            <View style={styles.section}>
              <View style={styles.stepperCard}>
                <Pressable onPress={() => goMonth(-1)} disabled={monthIdx <= 0} hitSlop={10} style={styles.stepperBtn}>
                  <Text style={[styles.stepperGlyph, monthIdx <= 0 && styles.stepperGlyphDisabled]}>{'‹'}</Text>
                </Pressable>
                <View style={{ alignItems: 'center', minWidth: 0 }}>
                  <Text style={styles.stepperLabel}>{months[monthIdx].label}</Text>
                  <Text style={styles.stepperSub}>{analysis.txCount} {txWord(analysis.txCount)}</Text>
                </View>
                <Pressable
                  onPress={() => goMonth(1)}
                  disabled={monthIdx >= months.length - 1}
                  hitSlop={10}
                  style={styles.stepperBtn}
                >
                  <Text style={[styles.stepperGlyph, monthIdx >= months.length - 1 && styles.stepperGlyphDisabled]}>
                    {'›'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Summary bars */}
            <View style={styles.section}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryBars}>
                  {[
                    [analysis.spent, colors.seg2],
                    [analysis.paid, colors.seg4],
                    [Math.max(analysis.net, 0), colors.line],
                  ].map(([v, fill], i) => (
                    <View key={i} style={styles.summaryBarCol}>
                      <View
                        style={[
                          styles.summaryBar,
                          { height: `${Math.round((Number(v) / analysis.scale) * 100)}%`, backgroundColor: String(fill) },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.summaryLabels}>
                  {[
                    [analysis.spent, t.spentLabel],
                    [analysis.paid, t.paidLabel2],
                    [analysis.net, t.netLabel],
                  ].map(([v, label], i) => (
                    <View key={i} style={{ alignItems: 'center' }}>
                      <Text style={styles.summaryAmount}>{fmtMoney(Number(v))}</Text>
                      <Text style={styles.summaryLabel}>{String(label).toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Category donut */}
            <View style={styles.section}>
              <View style={styles.donutCard}>
                <View style={{ width: 200, height: 200 }}>
                  <Svg viewBox="0 0 140 140" width="100%" height="100%" style={{ transform: [{ rotate: '-90deg' }] }}>
                    <Circle cx={70} cy={70} r={54} fill="none" stroke={colors.line2} strokeWidth={13} />
                    {analysis.arcs.map((arc) => (
                      <Circle
                        key={arc.name}
                        cx={70}
                        cy={70}
                        r={54}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={arc.width}
                        strokeLinecap="round"
                        strokeDasharray={arc.dash}
                        strokeDashoffset={arc.offset}
                        opacity={arc.opacity}
                        onPress={() => pickCategory(arc.name)}
                      />
                    ))}
                  </Svg>
                  <Pressable onPress={() => setSelCat(null)} style={styles.donutCenter}>
                    <Text style={styles.donutAmount} numberOfLines={1}>
                      {fmtMoney(analysis.sel ? analysis.sel.amount : analysis.spent)}
                    </Text>
                    <Text style={styles.donutLabel} numberOfLines={1}>
                      {analysis.sel ? categoryLabel(analysis.sel.name) : t.spentThisMonth}
                    </Text>
                    <Text style={styles.donutSub} numberOfLines={2}>
                      {analysis.sel
                        ? `${pctText(analysis.sel.share)} ${lang === 'es' ? 'del gasto' : 'of spending'} · ${analysis.sel.count} tx`
                        : analysis.delta === null
                          ? t.tapCategoryHint
                          : `${analysis.delta >= 0 ? '+' : ''}${analysis.delta}% ${lang === 'es' ? 'vs. mes anterior' : 'vs. last month'}`}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* By category */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.byCategory}</Text>
              {analysis.categories.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyBody}>{t.noSpendingMonth}</Text>
                </View>
              ) : (
                <View style={styles.listCard}>
                  {analysis.categories.map((c) => (
                    <Pressable
                      key={c.name}
                      style={[styles.catRow, selCat === c.name && { backgroundColor: colors.tint }]}
                      onPress={() => pickCategory(c.name)}
                    >
                      <View style={[styles.catBadge, { backgroundColor: c.bg }]}>
                        <Ionicons name={c.icon as any} size={16} color={c.ink} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.catRowHead}>
                          <Text style={styles.catName}>{categoryLabel(c.name)}</Text>
                          <Text style={styles.catPct}>{pctText(c.share)}</Text>
                        </View>
                        <View style={styles.catBarTrack}>
                          <View style={[styles.catBarFill, { width: `${Math.max(c.share, 1.5)}%`, backgroundColor: c.color }]} />
                        </View>
                        <Text style={styles.catCount}>{c.count} {txWord(c.count)}</Text>
                      </View>
                      <Text style={styles.catAmount}>{fmtMoney(c.amount)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Spending by week */}
            <View style={styles.section}>
              <View style={styles.weekHeadRow}>
                <Text style={styles.sectionTitle}>{t.spendingByWeek}</Text>
                <Text style={styles.weekAvgNote}>{t.weeklyAverage} {fmtMoney(analysis.avgWeek)}</Text>
              </View>
              <View style={styles.weekCard}>
                <View style={styles.weekRow}>
                  {analysis.weekSums.map((v, i) => (
                    <View key={i} style={styles.weekCol}>
                      <Text style={styles.weekValue}>{v ? fmtMoney(v) : ''}</Text>
                      <View
                        style={[
                          styles.weekBar,
                          {
                            height: `${Math.max((v / analysis.weekMax) * 100, 2)}%`,
                            backgroundColor: v === analysis.weekMax ? colors.accent : colors.line,
                          },
                        ]}
                      />
                      <Text style={styles.weekLabel}>{`W${i + 1}`}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Where it went */}
            {analysis.merchants.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.whereItWent}</Text>
                <View style={styles.listCard}>
                  {analysis.merchants.map((m) => (
                    <View key={m.name} style={styles.catRow}>
                      <View style={[styles.catBadge, { backgroundColor: m.bg }]}>
                        <Ionicons name={m.icon as any} size={16} color={m.ink} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.catName} numberOfLines={1}>{m.name}</Text>
                        <Text style={styles.merchantSub} numberOfLines={1}>
                          {`${categoryLabel(m.category)} · ${m.count} tx`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.catAmount}>{fmtMoney(m.amount)}</Text>
                        <Text style={styles.catCount}>{Math.round(m.share)}%</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingTop: spacing.xxl, paddingBottom: 40 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg + 2 },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
    chipActive: { backgroundColor: colors.tint2, borderColor: colors.tint2 },
    chipText: { fontSize: 11.5, fontWeight: '500', color: colors.ink2 },
    chipTextActive: { color: colors.onTint2 },

    stepperCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: 10,
      paddingHorizontal: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperGlyph: { fontSize: 16, color: colors.ink },
    stepperGlyphDisabled: { color: colors.line },
    stepperLabel: { fontSize: 14.5, fontWeight: '500', color: colors.ink },
    stepperSub: {
      fontSize: 10.5,
      color: colors.ink3,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginTop: 5,
    },

    summaryCard: {
      padding: 16,
      paddingTop: 18,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    summaryBars: { flexDirection: 'row', alignItems: 'flex-end', height: 112, gap: 10 },
    summaryBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
    summaryBar: { width: '100%', maxWidth: 44, minHeight: 3, borderRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
    summaryLabels: { flexDirection: 'row', marginTop: 14, gap: 10 },
    summaryAmount: { fontSize: 15, fontWeight: '600', color: colors.ink },
    summaryLabel: { fontSize: 10.5, color: colors.ink3, letterSpacing: 0.5, marginTop: 6 },

    donutCard: {
      padding: 20,
      alignItems: 'center',
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    donutCenter: {
      position: 'absolute',
      top: 30,
      left: 30,
      right: 30,
      bottom: 30,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    donutAmount: { fontSize: 21, fontWeight: '600', color: colors.ink, letterSpacing: -0.4 },
    donutLabel: { fontSize: 11.5, fontWeight: '500', color: colors.ink2, textAlign: 'center' },
    donutSub: { fontSize: 10.5, color: colors.ink3, textAlign: 'center', maxWidth: 160 },

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
    catRowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    catBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm + 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catName: { fontSize: 13, fontWeight: '500', color: colors.ink },
    catPct: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
    catBarTrack: { height: 4, borderRadius: 999, backgroundColor: colors.line2, marginTop: 8, overflow: 'hidden' },
    catBarFill: { height: '100%' },
    catAmount: { fontSize: 13, fontWeight: '600', color: colors.ink },
    catCount: { fontSize: 10.5, color: colors.ink3, marginTop: 6 },
    merchantSub: { fontSize: 11, color: colors.ink3, marginTop: 3 },

    weekHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    weekAvgNote: { fontSize: 11, color: colors.ink3 },
    weekCard: {
      marginTop: 10,
      padding: 14,
      paddingBottom: 10,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 104 },
    weekCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 7, height: '100%' },
    weekValue: { fontSize: 9.5, fontWeight: '500', color: colors.ink3 },
    weekBar: { width: '100%', maxWidth: 26, borderRadius: 5 },
    weekLabel: { fontSize: 10, color: colors.ink3 },

    emptyCard: {
      marginTop: 10,
      padding: 20,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    emptyTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
    emptyBody: { fontSize: 12.5, color: colors.ink2, textAlign: 'center', lineHeight: 18 },
  });
}
