import { DbStatement, ParsedStatement } from './supabase/types';

// Balance check per statement: the previous statement's balance, minus
// payments, plus charges, must equal this one's balance. Parsed amounts are
// negative for charges and positive for payments, so
//   balance(n) = balance(n-1) - sum(amounts(n))
// A miss means the reader skipped or misread a line; re-reading usually fixes it.

export type StatementCheck =
  | { kind: 'ok'; prevBalance: number }
  | { kind: 'off'; diff: number; prevBalance: number }
  | { kind: 'first' };

// The opening balance is sometimes listed as a line; it isn't a transaction
// (apply-statement drops it too), so it never counts toward the sum.
const NOT_A_TRANSACTION = /^\s*(saldo\s+(anterior|inicial|previo)|balance\s+(anterior|forward)|previous\s+balance)\b/i;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function netOf(parsed: ParsedStatement): number {
  return (parsed.transactions ?? [])
    .filter((t) => !NOT_A_TRANSACTION.test(t.merchant ?? ''))
    .reduce((n, t) => n + Number(t.amount || 0), 0);
}

export function checkAgainst(prevBalance: number, parsed: ParsedStatement): StatementCheck {
  const diff = r2(Number(parsed.balance) - (prevBalance - netOf(parsed)));
  return Math.abs(diff) < 0.01 ? { kind: 'ok', prevBalance } : { kind: 'off', diff: Math.abs(diff), prevBalance };
}

const cutoffOf = (s: DbStatement) => s.parsed?.cutoff_date ?? '';

// Applied statements of the same card, oldest first.
export function cardStatements(rows: DbStatement[], cardId: string): DbStatement[] {
  return rows
    .filter((s) => s.card_id === cardId && s.status === 'applied' && s.parsed?.cutoff_date)
    .sort((a, b) => cutoffOf(a).localeCompare(cutoffOf(b)));
}

// The statement just before this one for the same card (by cutoff), if any.
export function previousStatement(rows: DbStatement[], s: DbStatement): DbStatement | undefined {
  if (!s.card_id) return undefined;
  const list = cardStatements(rows, s.card_id);
  const i = list.findIndex((x) => x.id === s.id);
  return i > 0 ? list[i - 1] : undefined;
}

export function reconcileStatements(rows: DbStatement[]): Map<string, StatementCheck> {
  const out = new Map<string, StatementCheck>();
  const cardIds = new Set(rows.map((s) => s.card_id).filter((x): x is string => !!x));
  for (const cardId of cardIds) {
    const list = cardStatements(rows, cardId);
    list.forEach((s, i) => {
      if (i === 0 || !s.parsed) {
        out.set(s.id, { kind: 'first' });
        return;
      }
      out.set(s.id, checkAgainst(Number(list[i - 1].parsed!.balance), s.parsed));
    });
  }
  return out;
}

// What changed between two readings of the same PDF: lines only in the new
// one ("added") and only in the old one ("removed"), matched on date, amount
// and a normalized merchant name.
export type LineChange = { kind: 'added' | 'removed'; date: string; merchant: string; amount: number };

const norm = (m: string) =>
  m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function sameMerchant(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return x === y;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const n = Math.min(x.length, y.length, 12);
  return n >= 8 && x.slice(0, n) === y.slice(0, n);
}

export function diffReadings(oldP: ParsedStatement, newP: ParsedStatement): LineChange[] {
  const clean = (p: ParsedStatement) => (p.transactions ?? []).filter((t) => !NOT_A_TRANSACTION.test(t.merchant ?? ''));
  const pool = clean(oldP).map((t) => ({ ...t }));
  const added: LineChange[] = [];
  for (const t of clean(newP)) {
    const i = pool.findIndex(
      (p) => p.date === t.date && r2(Number(p.amount)) === r2(Number(t.amount)) && sameMerchant(p.merchant, t.merchant),
    );
    if (i === -1) added.push({ kind: 'added', date: t.date, merchant: t.merchant, amount: Number(t.amount) });
    else pool.splice(i, 1);
  }
  const removed: LineChange[] = pool.map((t) => ({ kind: 'removed', date: t.date, merchant: t.merchant, amount: Number(t.amount) }));
  return [...added, ...removed];
}
