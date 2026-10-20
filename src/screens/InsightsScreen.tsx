import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens, categoryLabel, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { TxRow } from '../components/TxRow';
import { getAvailableMonths, analyseInsights, analyseByCard, fmtMoney, cardCurrencies } from '../insightsAnalysis';
import { moneyCompact } from '../format';
import { buildSeries, monthName, monthYear, addMonthsIso } from '../instalments';

export function InsightsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards: allCards, isDemo } = useCards();
  // Amounts in different currencies can't share one donut or one total, so
  // the screen analyses one currency at a time. With every card in the same
  // currency there's no selector and the screen works exactly as before.
  const currencies = useMemo(() => cardCurrencies(allCards), [allCards]);
  const [selCur, setSelCur] = useState<string | null>(null);
  const cur = selCur && currencies.includes(selCur) ? selCur : currencies[0] ?? 'US$';
  const cards = useMemo(
    () => (currencies.length > 1 ? allCards.filter((c) => c.cur === cur) : allCards),
    [allCards, currencies, cur],
  );
  const fmt = (n: number) => fmtMoney(cur, n);
  const [excludedCardIds, setExcludedCardIds] = useState<Set<string>>(() => new Set());
  const [selectedMonthIso, setSelectedMonthIso] = useState<string | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selWeek, setSelWeek] = useState<number | null>(null);
  const [showAllTx, setShowAllTx] = useState(false);
  // Card filter folds into one row under the month; opening it shows the chips.
  const [cardsOpen, setCardsOpen] = useState(false);
  // With a category picked, the other categories fold away until asked for.
  const [showOtherCats, setShowOtherCats] = useState(false);

  const toggleCard = (id: string) => {
    setExcludedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Excluding the last remaining card means "go back to All" instead of
      // silently doing nothing (which is what a plain "never exclude every
      // card" guard would do here).
      if (next.size === cards.length) return new Set();
      return next;
    });
  };

  const includedCards = useMemo(
    () => cards.filter((c) => !excludedCardIds.has(c.id)),
    [cards, excludedCardIds],
  );

  // Months come from every card in the selected currency, not the filtered
  // ones: the card chips only filter inside the month you're on, they never
  // move you to another month.
  const months = useMemo(() => getAvailableMonths(cards, lang), [cards, lang]);
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
    setShowOtherCats(false);
  };

  const analysis = useMemo(
    () => (monthIso ? analyseInsights(includedCards, monthIso, prevMonthIso, selCat, selWeek, colors) : null),
    [includedCards, monthIso, prevMonthIso, selCat, selWeek, colors],
  );

  // Independent of the top card filter (uses every card, not includedCards) —
  // it's itself a navigation control, so filtering it by the top chips would
  // make it show only whatever's already selected.
  const cardBreakdown = useMemo(
    () => (monthIso ? analyseByCard(cards, monthIso, selWeek) : []),
    [cards, monthIso, selWeek],
  );
  const isolatedCardId = includedCards.length === 1 ? includedCards[0].id : null;

  // Installments: the active plans (as of today) on the cards in view.
  const activeSeries = useMemo(() => buildSeries(includedCards).filter((x) => x.active), [includedCards]);
  const cuotaLeft = activeSeries.reduce((n, x) => n + x.left, 0);
  const freed = useMemo(() => {
    if (activeSeries.length === 0) return null;
    const soonest = activeSeries.map((x) => x.endIso.slice(0, 7)).sort()[0];
    const ending = activeSeries.filter((x) => x.endIso.slice(0, 7) === soonest);
    return { month: addMonthsIso(`${soonest}-01`, 1), amount: ending.reduce((n, x) => n + x.monthly, 0), ending };
  }, [activeSeries]);
  const pickCard = (cardId: string) => {
    if (isolatedCardId === cardId) {
      setExcludedCardIds(new Set());
    } else {
      setExcludedCardIds(new Set(cards.filter((c) => c.id !== cardId).map((c) => c.id)));
    }
  };

  // Switching currency is a different set of cards: start that view clean.
  const pickCurrency = (next: string) => {
    if (next === cur) return;
    setSelCur(next);
    setExcludedCardIds(new Set());
    setSelCat(null);
    setSelWeek(null);
    setShowAllTx(false);
    setShowOtherCats(false);
  };

  const pickCategory = (name: string) => {
    setSelCat((prev) => (prev === name ? null : name));
    setShowAllTx(false);
    setShowOtherCats(false);
  };
  const pickWeek = (idx: number) => {
    setSelWeek((prev) => (prev === idx ? null : idx));
    setShowAllTx(false);
  };

  const txWord = (n: number) => (lang === 'es' ? (n === 1 ? 'transacción' : 'transacciones') : n === 1 ? 'transaction' : 'transactions');
  const pctText = (share: number) => `${share < 10 ? share.toFixed(1) : Math.round(share)}%`;
  const weekTag = (i: number) => `${lang === 'es' ? 'S' : 'W'}${i + 1}`;
  const sectionTitle = (base: string) => (selWeek === null ? base : `${base} · ${weekTag(selWeek)}`);

  const showCurrencyFilter = !isDemo && currencies.length > 1;
  const currencyFilter = showCurrencyFilter ? (
    <View style={styles.section}>
      <View style={[styles.filterCard, styles.currencyCard]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.filterLabel}>{lang === 'es' ? 'MONEDA' : 'CURRENCY'}</Text>
          <Text style={styles.currencySub} numberOfLines={1}>
            {lang === 'es'
              ? `${cards.length} ${cards.length === 1 ? 'tarjeta' : 'tarjetas'} en ${cur}`
              : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} in ${cur}`}
          </Text>
        </View>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {currencies.map((k) => {
            const active = k === cur;
            return (
              <Pressable
                key={k}
                onPress={() => pickCurrency(k)}
                style={[styles.segmentBtn, active && styles.chipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                hitSlop={4}
              >
                <Text style={[styles.segmentText, active && styles.chipTextActive]}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  ) : null;

  const showCardFilter = !isDemo && cards.length > 1;
  const cardFilter = showCardFilter ? (
    <View style={styles.section}>
      <View style={styles.filterCard}>
        <Pressable
          onPress={() => setCardsOpen((v) => !v)}
          style={styles.filterHead}
          accessibilityRole="button"
          accessibilityState={{ expanded: cardsOpen }}
        >
          <Text style={styles.filterLabel}>{lang === 'es' ? 'TARJETAS' : 'CARDS'}</Text>
          <Text style={styles.filterValue}>
            {excludedCardIds.size === 0
              ? `${lang === 'es' ? 'Todas' : 'All'} · ${cards.length}`
              : `${includedCards.length} ${lang === 'es' ? 'de' : 'of'} ${cards.length}`}
          </Text>
          <Ionicons name={cardsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
        </Pressable>
        {cardsOpen && (
          <View style={[styles.chipRow, { marginTop: 12 }]}>
            <Pressable
              onPress={() => setExcludedCardIds(new Set())}
              style={[styles.chip, excludedCardIds.size === 0 && styles.chipActive]}
            >
              <Text style={[styles.chipText, excludedCardIds.size === 0 && styles.chipTextActive]}>
                {lang === 'es' ? 'Todas' : 'All'}
              </Text>
            </Pressable>
            {cards.map((c) => {
              const active = excludedCardIds.size > 0 && !excludedCardIds.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => (excludedCardIds.size === 0 ? pickCard(c.id) : toggleCard(c.id))}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {c.displayName} {c.last4}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  ) : null;

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
        {!analysis || monthIdx < 0 ? (
          <>
          {currencyFilter}
          {cardFilter}
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyBody}>
                {lang === 'es'
                  ? 'Todavía no hay transacciones. Sube un estado de cuenta para ver tus insights.'
                  : 'No transactions yet. Upload a statement to see your insights.'}
              </Text>
            </View>
          </View>
          </>
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

            {currencyFilter}
            {cardFilter}

            {/* Spending by week — the primary drill-down control, so it sits first */}
            <View style={styles.section}>
              <View style={styles.weekHeadRow}>
                <Text style={styles.sectionTitle}>{t.spendingByWeek}</Text>
                <Text style={styles.weekAvgNote}>{t.weeklyAverage} {fmt(analysis.avgWeek)}</Text>
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
                          {v ? moneyCompact(cur, v) : ''}
                        </Text>
                        <View style={styles.weekBarTrack}>
                          <View
                            style={[
                              styles.weekBar,
                              {
                                height: `${Math.max((v / analysis.weekMax) * 100, 2)}%`,
                                backgroundColor: active || isPeak ? colors.accent : analysis.sel ? analysis.sel.color : colors.line,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.weekLabel}>{weekTag(i)}</Text>
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
                    <Text style={styles.donutAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>
                      {fmt(analysis.sel ? analysis.sel.amount : analysis.spent)}
                    </Text>
                    <Text style={styles.donutLabel} numberOfLines={1}>
                      {analysis.sel
                        ? categoryLabel(analysis.sel.name, lang)
                        : selWeek === null
                          ? t.spentThisMonth
                          : lang === 'es' ? `Gastado semana ${selWeek + 1}` : `Spent week ${selWeek + 1}`}
                    </Text>
                    <Text style={styles.donutSub} numberOfLines={2}>
                      {analysis.sel
                        ? `${pctText(analysis.sel.share)} ${
                            selWeek === null ? (lang === 'es' ? 'del mes' : 'of the month') : lang === 'es' ? 'de la semana' : 'of the week'
                          }${
                            analysis.selDelta !== null
                              ? ` · ${analysis.selDelta >= 0 ? '+' : ''}${analysis.selDelta}% ${lang === 'es' ? 'vs. mes anterior' : 'vs. last month'}`
                              : ''
                          }`
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
                  {(analysis.sel && !showOtherCats ? [analysis.sel] : analysis.categories).map((c) => (
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
                          <Text style={styles.catName}>{categoryLabel(c.name, lang)}</Text>
                          <Text style={styles.catPct}>{pctText(c.share)}</Text>
                        </View>
                        <View style={[styles.catBarTrack, { flexDirection: 'row' }]}>
                          <View
                            style={[
                              styles.catBarFill,
                              { width: `${Math.max(c.share * (1 - c.instAmount / c.amount), c.instAmount ? 0 : 1.5)}%`, backgroundColor: c.color },
                            ]}
                          />
                          {c.instAmount > 0 && (
                            <View
                              style={[
                                styles.catBarFill,
                                { width: `${Math.max(c.share * (c.instAmount / c.amount), 1.5)}%`, backgroundColor: c.color, opacity: 0.45 },
                              ]}
                            />
                          )}
                        </View>
                        <Text style={styles.catCount}>
                          {c.count} {txWord(c.count)}
                          {c.instAmount > 0
                            ? lang === 'es'
                              ? ` · incluye ${fmt(c.instAmount)} en cuotas`
                              : ` · ${fmt(c.instAmount)} in instalments`
                            : ''}
                        </Text>
                      </View>
                      <Text style={styles.catAmount}>{fmt(c.amount)}</Text>
                    </Pressable>
                  ))}
                  {analysis.sel && analysis.categories.length > 1 && (
                    <Pressable
                      onPress={() => setShowOtherCats((v) => !v)}
                      style={styles.otherCatsBtn}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showOtherCats }}
                    >
                      <Text style={styles.otherCatsText}>
                        {showOtherCats
                          ? lang === 'es' ? 'Ocultar las otras categorías' : 'Hide the other categories'
                          : lang === 'es'
                            ? `Ver las otras ${analysis.categories.length - 1} categorías`
                            : `See the other ${analysis.categories.length - 1} categories`}
                      </Text>
                      <Ionicons name={showOtherCats ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* By card — a second axis on the same month/week, always across every
                card (not whatever the top filter already narrowed to), so tapping
                it is always a useful shortcut rather than a no-op. */}
            {!selCat && cards.length > 1 && cardBreakdown.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{sectionTitle(t.byCard)}</Text>
                <View style={styles.listCard}>
                  {cardBreakdown.map((c) => (
                    <Pressable
                      key={c.cardId}
                      style={[styles.catRow, isolatedCardId === c.cardId && { backgroundColor: colors.tint }]}
                      onPress={() => pickCard(c.cardId)}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.catRowHead}>
                          <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.catPct}>{pctText(c.share)}</Text>
                        </View>
                        <View style={styles.catBarTrack}>
                          <View style={[styles.catBarFill, { width: `${Math.max(c.share, 1.5)}%`, backgroundColor: colors.accent }]} />
                        </View>
                        <Text style={styles.catCount}>{c.count} {txWord(c.count)}</Text>
                      </View>
                      <Text style={styles.catAmount}>{fmt(c.amount)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Installments: what's fixed this month and the plans still running. */}
            {!selCat && (activeSeries.length > 0 || analysis.instSpent > 0) && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{lang === 'es' ? 'Pagos en cuotas' : 'Instalments'}</Text>
                  {activeSeries.length > 0 && (
                    <Text style={styles.weekAvgNote}>
                      {activeSeries.length} {lang === 'es' ? (activeSeries.length === 1 ? 'activa' : 'activas') : 'active'}
                    </Text>
                  )}
                </View>
                <View style={styles.cuotaCard}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cuotaLabel}>
                        {lang === 'es' ? `En ${monthName(`${monthIso}-01`, 'es')}` : `In ${monthName(`${monthIso}-01`, 'en')}`}
                      </Text>
                      <Text style={styles.cuotaValue}>{fmt(analysis.instSpent)}</Text>
                      {analysis.spent > 0 && (
                        <Text style={styles.cuotaSub}>
                          {Math.round((analysis.instSpent / analysis.spent) * 100)}% {lang === 'es' ? 'de tu gasto' : 'of your spending'}
                        </Text>
                      )}
                    </View>
                    {activeSeries.length > 0 && (
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cuotaLabel}>{lang === 'es' ? 'Te falta pagar' : 'Still to pay'}</Text>
                        <Text style={styles.cuotaValue}>{fmt(cuotaLeft)}</Text>
                      </View>
                    )}
                  </View>
                  {freed && (
                    <View style={styles.cuotaFreed}>
                      <View style={[styles.cuotaDot, { backgroundColor: colors.seg6 }]} />
                      <Text style={styles.cuotaFreedText}>
                        {lang === 'es'
                          ? `En ${monthName(freed.month, 'es')} se te liberan ${fmt(freed.amount)} al mes: ${
                              freed.ending.length === 1 ? `termina ${freed.ending[0].merchant}` : `terminan ${freed.ending.length} planes`
                            }.`
                          : `From ${monthName(freed.month, 'en')} you free up ${fmt(freed.amount)} a month: ${
                              freed.ending.length === 1 ? `${freed.ending[0].merchant} ends` : `${freed.ending.length} plans end`
                            }.`}
                      </Text>
                    </View>
                  )}
                </View>
                {activeSeries.length > 0 && (
                  <View style={styles.listCard}>
                    {activeSeries.map((x) => (
                      <Pressable
                        key={x.key}
                        style={styles.cuotaRow}
                        onPress={() => navigation.navigate('TransactionDetail', { txId: x.latest.id, cardId: x.cardId })}
                      >
                        <View style={styles.catRowHead}>
                          <Text style={[styles.catName, { flex: 1 }]} numberOfLines={1}>{x.merchant}</Text>
                          <Text style={styles.catAmount}>{fmt(x.monthly)}</Text>
                        </View>
                        <View style={[styles.catRowHead, { marginTop: 3 }]}>
                          <Text style={styles.catCount} numberOfLines={1}>
                            {categoryLabel(x.category, lang)} · {lang === 'es' ? 'cuota' : 'instalment'} {x.n}/{x.total}
                          </Text>
                          <Text style={styles.catCount}>
                            {lang === 'es' ? 'termina' : 'ends'} {monthYear(x.endIso, lang)}
                          </Text>
                        </View>
                        <View style={styles.catBarTrack}>
                          <View style={[styles.catBarFill, { width: `${(x.n / x.total) * 100}%`, backgroundColor: colors.bar }]} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Transactions — the actual, individual charges behind the numbers above.
                Filtered by whichever week/category is selected; sorted biggest first. */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  {t.transactions}
                  {selWeek !== null ? ` · ${weekTag(selWeek)}` : ''}
                  {selCat !== null ? ` · ${categoryLabel(selCat, lang)}` : ''}
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
    seeAll: { fontSize: 12, fontWeight: '500', color: colors.ink },

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
    donutAmount: { fontSize: 21, fontFamily: fonts.display, color: colors.ink, letterSpacing: -0.4 },
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
    filterCard: {
      padding: 12,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
    filterLabel: { flex: 1, fontSize: 11, letterSpacing: 1.2, color: colors.ink3 },
    filterValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    currencyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingRight: 10 },
    currencySub: { fontSize: 12, color: colors.ink2, marginTop: 4 },
    segment: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
    segmentBtn: { minWidth: 60, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center' },
    segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
    otherCatsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    otherCatsText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },

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

    cuotaCard: {
      marginTop: 10,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cuotaLabel: { fontSize: 11, color: colors.ink3 },
    cuotaValue: { fontSize: 17, fontWeight: '600', color: colors.ink, marginTop: 2 },
    cuotaSub: { fontSize: 10.5, color: colors.ink3, marginTop: 2 },
    cuotaFreed: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      marginTop: 12,
      padding: 11,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
    },
    cuotaDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
    cuotaFreedText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.ink2b },
    cuotaRow: { borderTopWidth: 1, borderTopColor: colors.hair, padding: 12 },
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
