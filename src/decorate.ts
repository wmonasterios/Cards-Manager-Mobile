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
  initials: string;
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
  dtx: DecoratedTransaction[];
};

export type Payment = { amount: number; when: string };

export function decorateTransaction(t: Transaction, card: Card, colors: ColorTokens): DecoratedTransaction {
  const cat = getCategoryColors(colors)[t.category];
  return {
    ...t,
    amountText: (t.amount > 0 ? '+' : '') + money(card.cur, Math.abs(t.amount)),
    amountInk: t.declined ? colors.ink3 : t.amount > 0 ? colors.accentInk2 : colors.ink,
    subInk: t.declined ? colors.accentInk2 : colors.ink3,
    catBg: cat.bg,
    catInk: cat.ink,
    initials: cat.initials,
    cardShort: card.bank + ' ' + card.last4.slice(-4),
  };
}

export function decorateCard(
  c: Card,
  paidOverride: boolean | undefined,
  payments: Payment[],
  t: Dict,
  colors: ColorTokens,
): DecoratedCard {
  const paid = paidOverride !== undefined ? paidOverride : c.balance === 0;
  const paidAmt = payments.reduce((n, p) => n + p.amount, 0);
  const remaining = Math.max(0, c.balance - paidAmt);
  const usedPct = Math.round((remaining / c.limit) * 100);
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
        : `${fmtC(c.limit - remaining)} ${t.availableWord}`,
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
    dtx: c.tx.map((tr) => decorateTransaction(tr, c, colors)),
  };
}
