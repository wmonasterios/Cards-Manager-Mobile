import { Card, Transaction } from './data';
import { ColorTokens, getCategoryColors } from './theme';
import { money, shortDay } from './format';
import { Dict } from './i18n/dict';

export type DecoratedTransaction = Transaction & {
  amountText: string;
  amountInk: string;
  subInk: string;
  catBg: string;
  catInk: string;
  catIcon: string;
  cardShort: string;
};

// One payment deadline on a card's current statement. When the bank uses a
// single date for both, there's one 'both' event; when the minimum and the
// full payment have different dates, there's a 'min' and a 'full' event.
export type PayEvent = {
  kind: 'min' | 'full' | 'both';
  iso: string;
  label: string; // "Oct 14"
  amount: number;
  amountText: string;
  settled: boolean;
};

export type DecoratedCard = Card & {
  paid: boolean;
  paidAmt: number;
  remaining: number;
  usedPct: number;
  statementText: string;
  paidNote: string;
  balanceText: string;
  minText: string;
  limitText: string;
  usedText: string;
  availableText: string;
  dueShort: string;
  stateText: string;
  stateInk: string;
  barInk: string;
  displayName: string;
  displaySub: string;
  reviewCount: number;
  dtx: DecoratedTransaction[];
  minCovered: boolean;
  // Paid because registered payments cover the balance (not the Paid toggle).
  coveredByPayments: boolean;
  payEvents: PayEvent[];
  // The next deadline still pending (undefined once the card is paid).
  nextDueIso?: string;
  nextDueLabel?: string;
  nextDueKind?: PayEvent['kind'];
};

export type Payment = { amount: number; when: string; paidOnIso?: string };

export function decorateTransaction(t: Transaction, card: Card, colors: ColorTokens): DecoratedTransaction {
  const categoryColors = getCategoryColors(colors);
  const cat = categoryColors[t.category] ?? categoryColors.other;
  return {
    ...t,
    amountText: (t.amount > 0 ? '+' : '') + money(card.cur, Math.abs(t.amount)),
    amountInk: t.declined ? colors.ink3 : t.amount > 0 ? colors.accentInk2 : colors.ink,
    subInk: t.declined ? colors.accentInk2 : colors.ink3,
    catBg: cat.bg,
    catInk: cat.ink,
    catIcon: cat.icon,
    cardShort: (card.nickname || card.bank) + ' ' + card.last4.slice(-4),
  };
}

export function decorateCard(
  c: Card,
  paidOverride: boolean | undefined,
  payments: Payment[],
  t: Dict,
  colors: ColorTokens,
  reviewCount = 0,
): DecoratedCard {
  // Only payments made after the current statement's own cutoff count against
  // its balance — anything on or before that date was already the bank's own
  // problem to net out, and the "Saldo" on this very statement already did:
  // without this, a payment made against last cycle's balance (before a new
  // statement rolls in and reports its own, already-net balance) keeps
  // getting subtracted forever, eventually zeroing out every future balance.
  const relevantPayments = c.cutoffIso
    ? payments.filter((p) => !p.paidOnIso || p.paidOnIso > c.cutoffIso!)
    : payments;
  const paidAmt = relevantPayments.reduce((n, p) => n + p.amount, 0);
  // Registered payments that cover the whole statement balance settle the
  // card just like marking it Paid does — before this, a US$ 75 payment on a
  // US$ 15.56 balance still showed "Vence hoy · US$ 0.00" as pending.
  const coveredByPayments = c.balance > 0 && paidAmt >= c.balance - 0.005;
  const paid = (paidOverride !== undefined ? paidOverride : c.balance === 0) || coveredByPayments;
  // Marking a card Paid without registering a specific payment amount still
  // means the whole balance is settled — don't leave the old balance showing.
  const remaining = paid ? 0 : Math.max(0, c.balance - paidAmt);
  const usedPct = c.limit > 0 ? Math.round((remaining / c.limit) * 100) : 0;
  const fmtC = (n: number) => money(c.cur, n);

  // There's no separate "minimum paid" flag: the minimum counts as covered
  // once this cycle's registered payments reach it (or the card is paid).
  const minCovered = paid || paidAmt >= c.min - 0.005;
  const fullLeft = paid ? 0 : Math.max(0, (c.fullAmount ?? c.balance) - paidAmt);
  const payEvents: PayEvent[] = [];
  if (c.dueIso && c.fullDueIso && c.fullDueIso !== c.dueIso) {
    const minLeft = Math.max(0, c.min - paidAmt);
    payEvents.push(
      { kind: 'min', iso: c.dueIso, label: shortDay(c.dueIso, t, c.due), amount: minLeft, amountText: fmtC(minLeft), settled: minCovered },
      {
        kind: 'full',
        iso: c.fullDueIso,
        label: shortDay(c.fullDueIso, t, c.fullDue ?? c.due),
        amount: fullLeft,
        amountText: fmtC(fullLeft),
        settled: paid,
      },
    );
    payEvents.sort((a, b) => a.iso.localeCompare(b.iso));
  } else if (c.dueIso) {
    payEvents.push({ kind: 'both', iso: c.dueIso, label: shortDay(c.dueIso, t, c.due), amount: remaining, amountText: fmtC(remaining), settled: paid });
  }
  const next = payEvents.find((e) => !e.settled);

  return {
    ...c,
    paid,
    paidAmt,
    remaining,
    usedPct,
    statementText: fmtC(c.balance),
    paidNote:
      paidAmt > 0
        ? `${fmtC(paidAmt)} ${t.registeredWord} · ${fmtC(remaining)} ${t.leftWord}`
        : `${t.ofWord} ${fmtC(c.limit)}`,
    balanceText: fmtC(remaining),
    minText: fmtC(Math.max(0, c.min - paidAmt)),
    limitText: fmtC(c.limit),
    usedText: fmtC(remaining),
    availableText: fmtC(c.limit - remaining),
    dueShort: paid ? t.paidWord : `${t.dueWord} ${next?.label ?? shortDay(c.dueIso, t, c.due)}`,
    stateText: paid
      ? t.nothing
      : paidAmt > 0
        ? `${fmtC(paidAmt)} ${t.registeredWord}`
        : `${t.minWord} ${fmtC(c.min)}`,
    stateInk: paid ? colors.ink2 : colors.accentInk,
    barInk: usedPct > 60 ? colors.accentInk2 : colors.bar,
    // With a nickname, that becomes the headline and the real bank/product
    // moves to the subtitle so the actual card is still identifiable.
    displayName: c.nickname || c.bank,
    displaySub: c.nickname ? [c.bank, c.product].filter(Boolean).join(' ') : c.product,
    reviewCount,
    dtx: c.tx.map((tr) => decorateTransaction({ ...tr, date: shortDay(tr.iso, t, tr.date) }, c, colors)),
    minCovered,
    coveredByPayments,
    payEvents,
    nextDueIso: next?.iso,
    nextDueLabel: next?.label,
    nextDueKind: next?.kind,
  };
}
