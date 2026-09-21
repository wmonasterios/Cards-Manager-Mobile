import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { TxRow } from '../components/TxRow';
import { BackButton } from '../components/BackButton';
import { Segmented } from '../components/Segmented';
import { DateField } from '../components/DateField';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'Transactions'>;

type RangeKey = 'month' | '3months' | 'ytd' | 'custom';
type SortKey = 'date' | 'amount';

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + delta);
  return toIso(d);
}

function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function TransactionsScreen({ route, navigation }: Props) {
  const { cards } = useCards();
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [range, setRange] = useState<RangeKey>('3months');
  const [fromDate, setFromDate] = useState(new Date(2026, 6, 1));
  const [toDate, setToDate] = useState(new Date(2026, 8, 14));
  const [selCardId, setSelCardId] = useState<string | null>(route.params?.cardId ?? null);
  const [selCategory, setSelCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [hidePayments, setHidePayments] = useState(false);

  const allTx = useMemo(
    () => cards.flatMap((c) => c.dtx.map((tx) => ({ tx, card: c }))),
    [cards],
  );

  const TODAY = toIso(new Date());
  const rangeStart =
    range === 'month'
      ? startOfMonth(TODAY)
      : range === '3months'
        ? addMonths(TODAY, -3)
        : range === 'ytd'
          ? `${new Date().getFullYear()}-01-01`
          : toIso(fromDate);
  const rangeEnd = range === 'custom' ? toIso(toDate) : TODAY;

  const q = query.trim().toLowerCase();

  // Everything except the category filter — this is the scope the category
  // chips are built from, so a chip never leads to a dead-end empty list.
  const scoped = useMemo(
    () =>
      allTx.filter(({ tx, card }) => {
        if (hidePayments && tx.amount > 0) return false;
        if (tx.iso < rangeStart || tx.iso > rangeEnd) return false;
        if (selCardId && card.id !== selCardId) return false;
        if (
          q &&
          !`${tx.merchant} ${tx.sub} ${categoryLabel(tx.category)} ${card.displayName} ${card.bank} ${card.product} ${card.last4}`
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      }),
    [allTx, hidePayments, rangeStart, rangeEnd, selCardId, q],
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    scoped.forEach(({ tx }) => set.add(tx.category));
    return Array.from(set).sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [scoped]);

  // A category chip can go stale if the date/card/search scope no longer
  // contains it — drop the filter instead of silently showing zero results.
  useEffect(() => {
    if (selCategory && !availableCategories.includes(selCategory)) {
      setSelCategory(null);
    }
  }, [availableCategories, selCategory]);

  const results = useMemo(() => {
    const list = selCategory ? scoped.filter(({ tx }) => tx.category === selCategory) : scoped;
    return [...list].sort((a, b) =>
      sortKey === 'amount' ? Math.abs(b.tx.amount) - Math.abs(a.tx.amount) : b.tx.iso.localeCompare(a.tx.iso),
    );
  }, [scoped, selCategory, sortKey]);

  const total = results.reduce((n, { tx }) => n + tx.amount, 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t.searchPh}
              placeholderTextColor={colors.ink3}
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} style={styles.clearBtn} hitSlop={6}>
                <Text style={styles.clearBtnText}>{'×'}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setHidePayments((v) => !v)}
            style={[styles.chip, styles.hidePayBtn, hidePayments && styles.chipActive]}
          >
            <Text style={[styles.chipText, hidePayments && styles.chipTextActive]}>{t.hidePayments}</Text>
          </Pressable>

          <View style={styles.rangeWrap}>
            <Segmented
              options={[
                { key: 'month', label: t.thisCycle },
                { key: '3months', label: t.threeCycles },
                { key: 'ytd', label: t.ytd },
                { key: 'custom', label: t.range },
              ]}
              value={range}
              onChange={setRange}
            />
          </View>
          {range === 'custom' && (
            <View style={styles.dateRow}>
              <DateField label="From" value={fromDate} onChange={setFromDate} maximumDate={toDate} />
              <DateField label="To" value={toDate} onChange={setToDate} minimumDate={fromDate} />
            </View>
          )}

          {cards.length > 1 && (
            <>
              <Text style={styles.filterLabel}>{t.card.toUpperCase()}</Text>
              <View style={styles.chipRow}>
                {cards.map((c) => {
                  const active = selCardId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelCardId(active ? null : c.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {c.displayName} {c.last4}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {availableCategories.length > 0 && (
            <>
              <Text style={styles.filterLabel}>{t.category.toUpperCase()}</Text>
              <View style={styles.chipRow}>
                {availableCategories.map((cat) => {
                  const active = selCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setSelCategory(active ? null : cat)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{categoryLabel(cat)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.summaryRow}>
            <Text style={styles.note}>
              {results.length} {t.transactions.toLowerCase()}
              {results.length > 0 ? ` · ${money('US$', total)}` : ''}
            </Text>
            <Pressable onPress={() => setSortKey(sortKey === 'date' ? 'amount' : 'date')} hitSlop={6}>
              <Text style={styles.sortLink}>
                {t.sortBy}: {sortKey === 'date' ? t.dateLabel : t.amount}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.listCard}>
            {results.map(({ tx, card }) => (
              <TxRow
                key={tx.id}
                tx={tx}
                showCard
                onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id, cardId: card.id })}
              />
            ))}
          </View>
          {results.length === 0 && (
            <Text style={styles.emptyNote}>{query ? t.noMatch : t.noResultsFilters}</Text>
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
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    searchWrap: { marginTop: 18, position: 'relative', justifyContent: 'center' },
    searchInput: {
      padding: 13,
      paddingRight: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 14,
    },
    clearBtn: {
      position: 'absolute',
      right: 8,
      width: 26,
      height: 26,
      borderRadius: 999,
      backgroundColor: colors.line2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: { color: colors.ink2b, fontSize: 14, fontWeight: '500' },
    rangeWrap: { marginTop: 14 },
    dateRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
    filterLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: colors.ink3,
      marginTop: 16,
      marginBottom: 8,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 11,
      borderRadius: 999,
    },
    chipActive: { backgroundColor: colors.tint2, borderColor: colors.tint2 },
    chipText: { fontSize: 11.5, fontWeight: '500', color: colors.ink2 },
    chipTextActive: { color: colors.onTint2 },
    hidePayBtn: { alignSelf: 'flex-start', marginTop: 12 },
    summaryRow: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    note: { fontSize: 11.5, color: colors.ink3, lineHeight: 16, flexShrink: 1 },
    sortLink: { fontSize: 11.5, fontWeight: '500', color: colors.accent },
    section: { paddingHorizontal: spacing.lg, marginTop: 14 },
    listCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    emptyNote: { padding: 22, fontSize: 13, color: colors.ink3, lineHeight: 20 },
  });
}
