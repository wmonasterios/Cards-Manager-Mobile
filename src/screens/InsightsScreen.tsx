import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { TxRow } from '../components/TxRow';
import { getAvailableMonths, analyseInsights, fmtMoney } from '../insightsAnalysis';

export function InsightsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards, isDemo } = useCards();
  const [excludedCardIds, setExcludedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedMonthIso, setSelectedMonthIso] = useState<string | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);

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
    setSelWeek(null);
    setShowAllTx(false);
  };

  const analysis = useMemo(
    () => (monthIso ? analyseInsights(includedCards, monthIso, prevMonthIso, selCat, selWeek, colors) : null),
    [includedCards, monthIso, prevMonthIso, selCat, selWeek, colors],
  );

  const pickCategory = (name: string) => {
    setSelCat((prev) => (prev === name ? null : name));
    setShowAllTx(false);
  };
  const pickWeek = (idx: number) => {
    setSelWeek((prev) => (prev === idx ? null : idx));
    setShowAllTx(false);
  };

  const txWord = (n: number) => (lang === 'es' ? (n === 1 ? 'transacción' : 'transacciones') : n === 1 ? 'transaction' : 'transactions');
  const pctText = (share: number) => `${share < 10 ? share.toFixed(1) : Math.round(share)}%`;
  const sectionTitle = (base: string) => (selWeek === null ? base : `${base} · W${selWeek + 1}`);

  if (cards.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
                      {c.displayName} {c.last4}
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

            {/* Spending by week — the primary drill-down control, so it sits first */}
            <View style={styles.section}>
              <View style={styles.weekHeadRow}>
                <Text style={styles.sectionTitle}>{t.spendingByWeek}</Text>
                <Text style={styles.weekAvgNote}>{t.weeklyAverage} {fmtMoney(analysis.avgWeek)}</Text>
              </View>
              <View style={styles.weekCard}>
                <View style={styles.weekRow}>
                  {analysis.weekSums.map((v, i) => {
                    const active = selWeek === i;
                    const isPeak = v === analysis.weekMax && v > 0;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => pickWeek(i)}
                        style={[styles.weekCol, active && styles.weekColActive]}
                      >
                        <Text
                          style={styles.weekValue}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {v ? fmtMoney(v) : ''}
                        </Text>
                        <View style={styles.weekBarTrack}>
                          <View
                            style={[
                              styles.weekBar,
                              {
                                height: `${Math.max((v / analysis.weekMax) * 100, 2)}%`,
                                backgroundColor: active || isPeak ? colors.accent : colors.line,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.weekLabel}>{`W${i + 1}`}</Text>
                      </Pressable>
                    );
                  })}
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
                  <Pressable onPress={() => { setSelCat(null); setShowAllTx(false); }} style={styles.donutCenter}>
                    <Text style={styles.donutAmount} numberOfLines={1}>
                      {fmtMoney(analysis.sel ? analysis.sel.amount : analysis.spent)}
                    </Text>
                    <Text style={styles.donutLabel} numberOfLines={1}>
                      {analysis.sel
                        ? categoryLabel(analysis.sel.name)
                        : selWeek === null
                          ? t.spentThisMonth
                          : lang === 'es' ? `Gastado semana ${selWeek + 1}` : `Spent week ${selWeek + 1}`}
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
              <Text style={styles.sectionTitle}>{sectionTitle(t.byCategory)}</Text>
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

            {/* Transactions — the actual, individual charges behind the numbers above.
                Filtered by whichever week/category is selected; sorted biggest first. */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  {t.transactions}
                  {selWeek !== null ? ` · W${selWeek + 1}` : ''}
                  {selCat !== null ? ` · ${categoryLabel(selCat)}` : ''}
                </Text>
                <Pressable onPress={() => navigation.navigate('Transactions', {})} hitSlop={6}>
                  <Text style={styles.seeAll}>{t.seeAll}</Text>
                </Pressable>
              </View>
              {analysis.filteredTx.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyBody}>{t.noSpendingMonth}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.listCard}>
                    {(showAllTx ? analysis.filteredTx : analysis.filteredTx.slice(0, 5)).map(({ tx, cardId }) => (
                      <TxRow
                        key={tx.id}
                        tx={tx}
                        showCard
                        onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id, cardId })}
                      />
                    ))}
                  </View>
                  {analysis.filteredTx.length > 5 && (
                    <Pressable onPress={() => setShowAllTx((v) => !v)} style={styles.moreBtn}>
                      <Text style={styles.moreBtnText}>
                        {showAllTx ? t.showLess : `${t.showAll} ${analysis.filteredTx.length}`}
                      </Text>
                    </Pressable>
                  )}
                </>
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
    scrollContent: { paddingTop: spacing.xxl, paddingBottom: 40 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg + 2 },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    seeAll: { fontSize: 12, fontWeight: '500', color: colors.accent },

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
    moreBtn: {
      marginTop: 10,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    moreBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },

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
    weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    weekCol: { flex: 1, alignItems: 'center', gap: 7, borderRadius: radius.sm, paddingVertical: 4 },
    weekColActive: { backgroundColor: colors.tint },
    weekValue: { fontSize: 9.5, fontWeight: '500', color: colors.ink3 },
    // Fixed-height track so the tallest bar (100%) never competes with its own
    // value/label text for space — that competition was pushing the value label
    // out of the card and overlapping the section header above it.
    weekBarTrack: { height: 70, width: '100%', maxWidth: 26, justifyContent: 'flex-end' },
    weekBar: { width: '100%', borderRadius: 5 },
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
