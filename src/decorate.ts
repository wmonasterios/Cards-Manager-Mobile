import { Card, Transaction } from './data';
import { ColorTokens, getCategoryColors } from './theme';
import { money } from './format';
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
};

export type Payment = { amount: number; when: string };

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
  const paid = paidOverride !== undefined ? paidOverride : c.balance === 0;
  const paidAmt = payments.reduce((n, p) => n + p.amount, 0);
  // Marking a card Paid without registering a specific payment amount still
  // means the whole balance is settled — don't leave the old balance showing.
  const remaining = paid ? 0 : Math.max(0, c.balance - paidAmt);
  const usedPct = c.limit > 0 ? Math.round((remaining / c.limit) * 100) : 0;
  const fmtC = (n: number) => money(c.cur, n);

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
    dueShort: paid ? t.paidWord : `${t.dueWord} ${c.due}`,
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
    dtx: c.tx.map((tr) => decorateTransaction(tr, c, colors)),
  };
}
