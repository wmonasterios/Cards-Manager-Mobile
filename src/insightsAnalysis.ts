import { DecoratedCard, DecoratedTransaction } from './decorate';
import { ColorTokens, chartSeriesColors } from './theme';
import { money } from './format';

const R = 54;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2.5;

const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
};

export type InsightsMonth = { iso: string; label: string };

export type CategorySlice = {
  name: string;
  amount: number;
  count: number;
  share: number;
  color: string;
  bg: string;
  ink: string;
  icon: string;
};

export type DonutArc = {
  name: string;
  color: string;
  dash: string;
  offset: number;
  width: number;
  opacity: number;
};

export type FlatTx = { tx: DecoratedTransaction; cardId: string };

export type InsightsAnalysis = {
  txCount: number;
  spent: number;
  categories: CategorySlice[];
  arcs: DonutArc[];
  filteredTx: FlatTx[];
  weekSums: number[];
  weekMax: number;
  avgWeek: number;
  delta: number | null;
  sel: CategorySlice | null;
};

function flattenTx(cards: DecoratedCard[]): DecoratedTransaction[] {
  return cards.flatMap((c) => c.dtx);
}

function flattenTxWithCard(cards: DecoratedCard[]): FlatTx[] {
  return cards.flatMap((c) => c.dtx.map((tx) => ({ tx, cardId: c.id })));
}

function weekOf(iso: string): number {
  const day = parseInt(iso.slice(8), 10);
  return Math.min(Math.floor((day - 1) / 7), 4);
}

export function getAvailableMonths(cards: DecoratedCard[], lang: 'en' | 'es'): InsightsMonth[] {
  const isos = new Set<string>();
  for (const tx of flattenTx(cards)) {
    isos.add(tx.iso.slice(0, 7));
  }
  return Array.from(isos)
    .sort()
    .map((iso) => {
      const [year, month] = iso.split('-');
      const name = MONTH_NAMES[lang][parseInt(month, 10) - 1];
      return { iso, label: `${name} ${year}` };
    });
}

// weekIdx narrows every downstream total (categories, donut, the transaction list) to
// that week of the month; the week bars themselves always reflect the whole month,
// since they are the navigation control, not a filtered result.
export function analyseInsights(
  cards: DecoratedCard[],
  monthIso: string,
  prevMonthIso: string | null,
  selCat: string | null,
  weekIdx: number | null,
  colors: ColorTokens,
): InsightsAnalysis {
  const allTx = flattenTx(cards);
  const monthTx = allTx.filter((t) => t.iso.slice(0, 7) === monthIso);
  const monthSpendTx = monthTx.filter((t) => t.amount < 0 && !t.declined && !t.excludedFromSpend);
  const spendTx = weekIdx === null ? monthSpendTx : monthSpendTx.filter((t) => weekOf(t.iso) === weekIdx);

  const spent = spendTx.reduce((n, t) => n - t.amount, 0);

  const seg = chartSeriesColors(colors);
  const byCat: Record<string, { amount: number; count: number; bg: string; ink: string; icon: string }> = {};
  for (const t of spendTx) {
    const entry = byCat[t.category] ?? (byCat[t.category] = { amount: 0, count: 0, bg: t.catBg, ink: t.catInk, icon: t.catIcon });
    entry.amount += -t.amount;
    entry.count += 1;
  }
  const categories: CategorySlice[] = Object.entries(byCat)
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count, bg: v.bg, ink: v.ink, icon: v.icon, share: spent ? (v.amount / spent) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .map((c, i) => ({ ...c, color: seg[i % seg.length] }));

  let cursor = 0;
  const arcs: DonutArc[] = categories.map((c) => {
    const len = Math.max((c.share / 100) * CIRCUMFERENCE - (categories.length > 1 ? GAP : 0), 1.5);
    const arc: DonutArc = {
      name: c.name,
      color: c.color,
      dash: `${len} ${CIRCUMFERENCE - len}`,
      offset: -cursor,
      width: selCat === null || selCat === c.name ? 13 : 8,
      opacity: selCat === null || selCat === c.name ? 1 : 0.38,
    };
    cursor += (c.share / 100) * CIRCUMFERENCE;
    return arc;
  });

  // Always the whole month, regardless of weekIdx — this drives the week chart itself.
  const weekSums = [0, 0, 0, 0, 0];
  for (const t of monthSpendTx) {
    weekSums[weekOf(t.iso)] += -t.amount;
  }
  const weekMax = Math.max(...weekSums, 1);
  // Averaged over the weeks that actually had spending, not a fixed /5 — a
  // month with a single busy week shouldn't report an average a fifth of it.
  const weeksWithSpend = weekSums.filter((v) => v > 0).length;
  const avgWeek = weeksWithSpend > 0 ? weekSums.reduce((a, b) => a + b, 0) / weeksWithSpend : 0;

  // Individual transactions, not grouped by merchant — the same real chain shows up
  // under several slightly different names on statements (e.g. "PRICESMART PANAMA
  // ECOM -I-" vs "PRICESMART METR ..."), so grouping by exact merchant text splits
  // one merchant's spend across several meaningless rows. Showing the actual
  // transactions sidesteps that entirely and doubles as the category drill-down.
  const monthWithCard = flattenTxWithCard(cards).filter(
    ({ tx }) => tx.iso.slice(0, 7) === monthIso && tx.amount < 0 && !tx.declined && !tx.excludedFromSpend,
  );
  const weekWithCard = weekIdx === null ? monthWithCard : monthWithCard.filter(({ tx }) => weekOf(tx.iso) === weekIdx);
  const filteredTx = (selCat === null ? weekWithCard : weekWithCard.filter(({ tx }) => tx.category === selCat))
    .slice()
    .sort((a, b) => Math.abs(b.tx.amount) - Math.abs(a.tx.amount));

  const prevTx = prevMonthIso
    ? allTx.filter((t) => t.iso.slice(0, 7) === prevMonthIso && t.amount < 0 && !t.declined && !t.excludedFromSpend)
    : [];
  const prevSpent = prevTx.reduce((n, t) => n - t.amount, 0);
  const delta = weekIdx === null && prevTx.length >= 3 && prevSpent ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;

  const sel = categories.find((c) => c.name === selCat) ?? null;

  return { txCount: monthTx.length, spent, categories, arcs, filteredTx, weekSums, weekMax, avgWeek, delta, sel };
}

export type CardSlice = { cardId: string; name: string; amount: number; count: number; share: number };

// Always computed from every card the user has (not whatever the top card
// filter currently excludes) and ignoring the category filter, the same way
// the week bars ignore it — this is itself a navigation control, not a
// filtered result, so narrowing it by another filter would make it useless
// to tap.
export function analyseByCard(cards: DecoratedCard[], monthIso: string, weekIdx: number | null): CardSlice[] {
  const rows = cards
    .map((c) => {
      const tx = c.dtx.filter(
        (t) =>
          t.iso.slice(0, 7) === monthIso &&
          t.amount < 0 &&
          !t.declined &&
          !t.excludedFromSpend &&
          (weekIdx === null || weekOf(t.iso) === weekIdx),
      );
      return { cardId: c.id, name: `${c.displayName} ${c.last4}`, amount: tx.reduce((n, t) => n - t.amount, 0), count: tx.length };
    })
    .filter((r) => r.count > 0);
  const total = rows.reduce((n, r) => n + r.amount, 0);
  return rows
    .map((r) => ({ ...r, share: total ? (r.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function fmtMoney(n: number): string {
  return money('US$', n);
}
