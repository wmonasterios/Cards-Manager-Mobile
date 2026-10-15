// Installments ("cuotas"). A cuota is a mark on a transaction, not a
// category: the club paid in 24 cuotas is still Entertainment and counts once
// a month, in the month the bank charges it. This module groups the monthly
// lines of one plan into a series so the app can show progress, what's left,
// when it ends and how much frees up afterwards.
import type { DecoratedCard, DecoratedTransaction } from './decorate';

export function parsePlan(plan?: string | null): { n: number; total: number } | null {
  const m = (plan ?? '').match(/(\d{1,3})\s*(?:\/|de|of)\s*(\d{1,3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  return n >= 1 && total >= 1 && n <= total ? { n, total } : null;
}

export function isInstalment(t: { plan?: string; planSource?: string }): boolean {
  return !!t.plan && t.planSource !== 'none';
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Same rule as apply-statement: shared normalized prefix (statements truncate
// names) and an amount within 1% (the last cuota is often a few cents off).
export function sameMerchant(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return x === y;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const n = Math.min(x.length, y.length, 12);
  return n >= 8 && x.slice(0, n) === y.slice(0, n);
}
export function sameAmount(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(1, Math.abs(a) * 0.01);
}

export function monthsBetween(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}
export function addMonthsIso(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const d = Math.min(Number(iso.slice(8, 10)) || 1, lastDay);
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type SeriesRow = { tx: DecoratedTransaction; n: number };

export type InstalmentSeries = {
  key: string;
  cardId: string;
  cardName: string;
  cur: string;
  merchant: string;
  category: DecoratedTransaction['category'];
  monthly: number;
  n: number; // latest cuota seen
  total: number;
  rows: SeriesRow[]; // oldest first
  latest: DecoratedTransaction;
  original?: DecoratedTransaction; // the purchase the user moved to cuotas
  paid: number;
  left: number;
  remainingCount: number;
  endIso: string; // month of the last cuota
  active: boolean;
};

const seriesKey = (t: DecoratedTransaction, cardId: string) =>
  t.planGroup ?? `${cardId}|${norm(t.merchant).slice(0, 8)}|${Math.round(Math.abs(t.amount))}`;

// A plan is active while cuotas are left and its last line is recent; one that
// stopped appearing months ago (paid off early, card closed) isn't.
const STALE_DAYS = 75;

export function buildSeries(cards: DecoratedCard[], todayIso = new Date().toISOString().slice(0, 10)): InstalmentSeries[] {
  const map = new Map<string, { cardId: string; card: DecoratedCard; rows: SeriesRow[]; original?: DecoratedTransaction }>();
  for (const c of cards) {
    for (const t of c.dtx) {
      if (t.planOriginal && t.planGroup) {
        const e = map.get(t.planGroup) ?? { cardId: c.id, card: c, rows: [] };
        e.original = t;
        map.set(t.planGroup, e);
        continue;
      }
      if (!isInstalment(t) || t.amount >= 0) continue;
      const p = parsePlan(t.plan);
      if (!p) continue;
      const k = seriesKey(t, c.id);
      const e = map.get(k) ?? { cardId: c.id, card: c, rows: [] };
      e.rows.push({ tx: t, n: p.n });
      // The cuotas' card wins over the original's (they're often different).
      e.cardId = c.id;
      e.card = c;
      map.set(k, e);
    }
  }
  const staleBefore = (() => {
    const d = new Date(todayIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - STALE_DAYS);
    return d.toISOString().slice(0, 10);
  })();
  const out: InstalmentSeries[] = [];
  for (const [key, e] of map) {
    if (e.rows.length === 0) continue;
    e.rows.sort((a, b) => a.tx.iso.localeCompare(b.tx.iso) || a.n - b.n);
    const last = e.rows[e.rows.length - 1];
    const p = parsePlan(last.tx.plan)!;
    const monthly = Math.abs(last.tx.amount);
    const remainingCount = Math.max(0, p.total - p.n);
    out.push({
      key,
      cardId: e.cardId,
      cardName: e.card.displayName,
      cur: e.card.cur,
      merchant: last.tx.merchant,
      category: last.tx.category,
      monthly,
      n: p.n,
      total: p.total,
      rows: e.rows,
      latest: last.tx,
      original: e.original,
      paid: p.n * monthly,
      left: remainingCount * monthly,
      remainingCount,
      endIso: addMonthsIso(last.tx.iso, remainingCount),
      active: remainingCount > 0 && last.tx.iso >= staleBefore,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

export function seriesForTx(series: InstalmentSeries[], txId: string): InstalmentSeries | undefined {
  return series.find((s) => s.rows.some((r) => r.tx.id === txId) || s.original?.id === txId);
}

// What a line would be if it continues a series this card already has.
export function suggestPlan(card: DecoratedCard, tx: DecoratedTransaction): { n: number; total: number } | null {
  const prior = card.dtx
    .filter((o) => o.id !== tx.id && isInstalment(o) && sameAmount(o.amount, tx.amount) && sameMerchant(o.merchant, tx.merchant))
    .map((o) => ({ o, p: parsePlan(o.plan) }))
    .filter((x): x is { o: DecoratedTransaction; p: { n: number; total: number } } => !!x.p)
    .sort((a, b) => Math.abs(monthsBetween(a.o.iso, tx.iso)) - Math.abs(monthsBetween(b.o.iso, tx.iso)))[0];
  if (!prior) return null;
  const n = prior.p.n + monthsBetween(prior.o.iso, tx.iso);
  return n >= 1 && n <= prior.p.total ? { n, total: prior.p.total } : null;
}

// Other unmarked lines on the same card that look like the same plan.
export function similarCharges(card: DecoratedCard, tx: DecoratedTransaction): DecoratedTransaction[] {
  return card.dtx
    .filter(
      (o) =>
        o.id !== tx.id &&
        o.amount < 0 &&
        !isInstalment(o) &&
        o.planSource !== 'none' &&
        !o.planOriginal &&
        sameAmount(o.amount, tx.amount) &&
        sameMerchant(o.merchant, tx.merchant),
    )
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

// Series whose cuotas add up to a purchase (within 2%), for "La pasé a cuotas".
export function matchingSeriesFor(series: InstalmentSeries[], original: DecoratedTransaction): InstalmentSeries[] {
  const amount = Math.abs(original.amount);
  return series.filter(
    (s) =>
      !s.original &&
      s.rows[s.rows.length - 1].tx.iso >= original.iso &&
      Math.abs(s.monthly * s.total - amount) <= amount * 0.02,
  );
}

export function newGroupId(): string {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
}

const MON = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MONTH_LONG = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
// "ene 2027" / "Jan 2027"
export function monthYear(iso: string, lang: 'es' | 'en') {
  return `${MON[lang][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}
// "17 sept 2026" / "Sep 17, 2026"
export function dayMonthYear(iso: string, lang: 'es' | 'en') {
  const d = Number(iso.slice(8, 10));
  const m = MON[lang][Number(iso.slice(5, 7)) - 1];
  return lang === 'es' ? `${d} ${m} ${iso.slice(0, 4)}` : `${m} ${d}, ${iso.slice(0, 4)}`;
}
// "noviembre" / "November"
export function monthName(iso: string, lang: 'es' | 'en') {
  return MONTH_LONG[lang][Number(iso.slice(5, 7)) - 1];
}
