import { cardArt, CARD_INK, CARD_PALETTE, CARD_PALETTE_ORDER } from './theme';

export type Category =
  | 'dining'
  | 'groceries'
  | 'transport'
  | 'fuel'
  | 'shopping'
  | 'home'
  | 'beauty'
  | 'pharmacy'
  | 'health'
  | 'entertainment'
  | 'subscriptions'
  | 'kids'
  | 'education'
  | 'travel'
  | 'hotels'
  | 'insurance'
  | 'utilities'
  | 'government'
  | 'housing'
  | 'fees'
  | 'payment'
  | 'transfer'
  | 'cash'
  | 'topup'
  | 'taxes'
  | 'other';

export const ALL_CATEGORIES: Category[] = [
  'dining', 'groceries', 'transport', 'fuel', 'shopping', 'home', 'beauty',
  'pharmacy', 'health', 'entertainment', 'subscriptions', 'kids', 'education',
  'travel', 'hotels', 'insurance', 'utilities', 'government', 'housing', 'fees', 'payment',
  'transfer', 'cash', 'topup', 'taxes', 'other',
];

export type Transaction = {
  id: string;
  merchant: string;
  sub: string;
  date: string; // "Sep 12"
  iso: string; // "2026-09-12"
  amount: number; // negative = charge, positive = credit/payment
  category: Category;
  plan?: string;
  rate?: string;
  declined?: boolean;
  statementId?: string;
  categorySource?: string;
  excludedFromSpend?: boolean;
};

export type InstalmentPlan = {
  merchant: string;
  plan: string; // "3 of 12"
  rate: string;
  monthly: number;
  remaining: number;
  pct: number;
};

export type Card = {
  id: string;
  bank: string;
  product: string;
  last4: string;
  network: string;
  cur: string;
  balance: number;
  limit: number;
  min: number;
  due: string;
  cutoff: string;
  dueIso?: string;
  cutoffIso?: string;
  plansNote: string;
  cycleNote: string;
  plans: InstalmentPlan[];
  tx: Transaction[];
  nickname?: string;
  colorKey?: string;
};

const MON: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function tx(
  merchant: string,
  sub: string,
  date: string,
  amount: number,
  category: Category,
  extra?: Partial<Transaction>,
): Transaction {
  const [monName, dayStr] = date.split(' ');
  const iso = `2026-${String(MON[monName]).padStart(2, '0')}-${String(parseInt(dayStr, 10)).padStart(2, '0')}`;
  return {
    id: merchant.toLowerCase().replace(/[^a-z]/g, '') + date.replace(/\W/g, ''),
    merchant,
    sub,
    date,
    amount,
    category,
    iso,
    ...extra,
  };
}

// Template for the demo catalogue. Its dates are only a shape — buildDemoCards
// below re-anchors every card to today so the demo always shows the same three
// situations, whatever day it is opened.
const DEMO_TEMPLATE: Card[] = [
  {
    id: 'aliado',
    bank: 'Banco General',
    product: 'Visa Infinite',
    last4: '•••• 0000',
    network: 'Visa',
    cur: 'US$',
    balance: 3420.1,
    limit: 12000,
    min: 171.01,
    due: 'Sep 18',
    cutoff: 'Aug 30',
    dueIso: '2026-09-18',
    cutoffIso: '2026-08-30',
    plansNote: '2 active',
    cycleNote: '30 Aug – 29 Sep',
    plans: [
      { merchant: 'Samsung Store', plan: '3 of 12', rate: '0% interest', monthly: 89.9, remaining: 809.1, pct: 25 },
      { merchant: 'Copa Airlines', plan: '5 of 6', rate: '0% interest', monthly: 142.0, remaining: 142.0, pct: 83 },
    ],
    tx: [
      tx('Riba Smith', 'Groceries · Panamá', 'Sep 12', -184.22, 'groceries'),
      tx('Copa Airlines', 'Instalment 5/6 · Travel', 'Sep 10', -142.0, 'travel', { plan: '5 of 6' }),
      tx('Cervecería La Rana', 'Dining · Panamá', 'Sep 8', -62.4, 'dining'),
      tx('Samsung Store', 'Instalment 3/12 · Tech', 'Sep 4', -89.9, 'home', { plan: '3 of 12' }),
      tx('Delta Fuel', 'Declined — over limit', 'Sep 2', -55.0, 'fuel', { declined: true }),
      tx('Payment received', 'Transfer · Banco General', 'Aug 31', 900.0, 'payment'),
      tx('Riba Smith', 'Groceries · Panamá', 'Aug 12', -166.9, 'groceries'),
      tx('PriceSmart', 'Groceries · Panamá', 'Jul 22', -241.15, 'groceries'),
      tx('Copa Airlines', 'Instalment 2/6 · Travel', 'Jun 10', -142.0, 'travel', { plan: '2 of 6' }),
    ],
  },
  {
    id: 'bac',
    bank: 'BAC',
    product: 'Visa Signature',
    last4: '•••• 0000',
    network: 'Visa',
    cur: 'US$',
    balance: 1284.52,
    limit: 6000,
    min: 64.23,
    due: 'Sep 25',
    cutoff: 'Sep 5',
    dueIso: '2026-09-25',
    cutoffIso: '2026-09-05',
    plansNote: '1 active',
    cycleNote: '5 Aug – 4 Sep',
    plans: [
      { merchant: 'Apple Store', plan: '2 of 9', rate: '0% interest', monthly: 78.3, remaining: 548.1, pct: 22 },
    ],
    tx: [
      tx('Super 99', 'Groceries · Panamá', 'Sep 11', -96.35, 'groceries'),
      tx('Apple Store', 'Instalment 2/9 · Tech', 'Sep 6', -78.3, 'home', { plan: '2 of 9' }),
      tx('Farmacias Arrocha', 'Health · Panamá', 'Sep 3', -41.8, 'health'),
      tx('Netflix', 'Services · recurring', 'Sep 1', -15.99, 'utilities'),
      tx('Do it Center', 'Tech · Panamá', 'Aug 8', -128.4, 'home'),
      tx('Netflix', 'Services · recurring', 'Jul 1', -15.99, 'utilities'),
    ],
  },
  {
    id: 'bac2',
    bank: 'BAC',
    product: 'Platinum',
    last4: '•••• 0000',
    network: 'Mastercard',
    cur: 'US$',
    balance: 0,
    limit: 3500,
    min: 0,
    due: 'Sep 22',
    cutoff: 'Sep 5',
    dueIso: '2026-09-22',
    cutoffIso: '2026-09-05',
    plansNote: 'None',
    cycleNote: '5 Aug – 4 Sep',
    plans: [],
    tx: [tx('Payment received', 'Transfer · BAC', 'Sep 1', 420.0, 'payment')],
  },
];

// Demo has no statements table to count "needs review" rows from, so the
// Needs-attention list gets this fixed stand-in instead — enough to show
// the feature working without wiring up fake statement rows.
export const DEMO_REVIEW_COUNTS: Record<string, number> = {};

// Cards whose current cycle starts out already paid in the demo (their last
// statement's balance was settled; the next statement just hasn't come in).
export const DEMO_PAID_DEFAULTS: Record<string, boolean> = { bac: true };

const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseIso(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}
function addDaysIso(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
// Same month arithmetic status.ts uses for "next expected cutoff", so a date
// built here lands exactly where deriveStatus will look for it.
function addMonthsIso(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setMonth(d.getMonth() + n);
  return isoOf(d);
}
function diffDays(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86400000);
}
function shortLabel(iso: string): string {
  const d = parseIso(iso);
  return `${MON_ABBR[d.getMonth()]} ${d.getDate()}`;
}
function dayMon(iso: string): string {
  const d = parseIso(iso);
  return `${d.getDate()} ${MON_ABBR[d.getMonth()]}`;
}

// A cutoff whose "next expected cutoff" (one calendar month later) is exactly
// `targetIso`. A few dates can't be hit exactly (nothing + 1 month lands on
// Mar 29–31 in a non-leap year); then take the closest one before it, so the
// statement still reads as late — by a couple of days instead of one.
function cutoffWhoseNextIs(targetIso: string): string {
  let c = addMonthsIso(targetIso, -1);
  for (let i = 0; i < 40 && addMonthsIso(c, 1) > targetIso; i++) c = addDaysIso(c, -1);
  for (let i = 0; i < 5 && addMonthsIso(addDaysIso(c, 1), 1) <= targetIso; i++) c = addDaysIso(c, 1);
  return c;
}

// Shift one template card so that its cutoff becomes `newCutoffIso`, moving
// its due date and every transaction by the same number of days — the card's
// internal timeline (purchases vs. cutoff vs. due date) stays intact.
function reanchor(card: Card, newCutoffIso: string): Card {
  const delta = diffDays(card.cutoffIso!, newCutoffIso);
  const dueIso = addDaysIso(card.dueIso!, delta);
  const cycleStart = addMonthsIso(newCutoffIso, -1);
  return {
    ...card,
    cutoffIso: newCutoffIso,
    cutoff: shortLabel(newCutoffIso),
    dueIso,
    due: shortLabel(dueIso),
    cycleNote: `${dayMon(cycleStart)} – ${dayMon(addDaysIso(newCutoffIso, -1))}`,
    tx: card.tx.map((t) => {
      const iso = addDaysIso(t.iso, delta);
      const date = shortLabel(iso);
      return { ...t, iso, date, id: t.merchant.toLowerCase().replace(/[^a-z]/g, '') + date.replace(/\W/g, '') };
    }),
  };
}

// The demo's three "Needs attention" situations, always relative to today:
// - Banco General: payment due in exactly 3 days (urgent).
// - BAC Visa Signature: last cycle paid, next statement 1 day late.
// - BAC Platinum: paid off, next statement still weeks away (up to date).
export function buildDemoCards(todayIso: string): Card[] {
  return DEMO_TEMPLATE.map((c) => {
    if (c.id === 'aliado') {
      const gap = diffDays(c.cutoffIso!, c.dueIso!);
      return reanchor(c, addDaysIso(addDaysIso(todayIso, 3), -gap));
    }
    if (c.id === 'bac') return reanchor(c, cutoffWhoseNextIs(addDaysIso(todayIso, -1)));
    if (c.id === 'bac2') return reanchor(c, addDaysIso(todayIso, -5));
    return c;
  });
}

// Every demo card's template data — ids, banks, products — for lookups that
// don't care about dates.
export const DEMO_CARD_IDS = DEMO_TEMPLATE.map((c) => c.id);

// Demo cards keep their fixed named gradient. Real cards, unless the user
// picked a color, get one hashed from their id — so two real cards never
// default to looking identical, which used to always happen (every real
// card id fell through to the same cardArt.bac2 fallback).
export function artKey(id: string, colorKey?: string): string {
  if (colorKey && CARD_PALETTE[colorKey]) return colorKey;
  if (cardArt[id]) return cardArt[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_PALETTE_ORDER[hash % CARD_PALETTE_ORDER.length];
}

export function artGradient(id: string, colorKey?: string): [string, string, string] {
  return CARD_PALETTE[artKey(id, colorKey)];
}

// Text colors to use on top of a card's art (dark on vivid fills, light on
// violet/slate).
export function artInk(id: string, colorKey?: string): { main: string; sub: string } {
  return CARD_INK[artKey(id, colorKey)];
}
