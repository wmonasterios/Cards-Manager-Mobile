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
  // Installments: where `plan` came from ('none' = the user said it isn't a
  // cuota), the id shared by one plan's lines, and whether this line is the
  // purchase that was moved to cuotas (excluded from spend).
  planSource?: string;
  planGroup?: string;
  planOriginal?: boolean;
  // Additional cards: the card number the line was printed under, and the
  // name the user gave it when that number is an additional card (unset for
  // the principal's lines).
  cardLast4?: string;
  member?: string;
};

// One additional card on a card (the user named it).
export type CardMember = { last4: string; name: string };

export type InstalmentPlan = {
  merchant: string;
  plan: string; // "3/12"
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
  // Some banks give the full-payment ("pago de contado") deadline a different
  // date than the minimum payment's (due/dueIso). Only set when it differs.
  fullDue?: string;
  fullDueIso?: string;
  fullAmount?: number;
  plansNote: string;
  cycleNote: string;
  plans: InstalmentPlan[];
  tx: Transaction[];
  nickname?: string;
  colorKey?: string;
  // Additional cards the user marked on this card (empty = none).
  additionals?: CardMember[];
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
      { merchant: 'Samsung Store', plan: '3/12', rate: '0%', monthly: 89.9, remaining: 809.1, pct: 25 },
      { merchant: 'Copa Airlines', plan: '5/6', rate: '0%', monthly: 142.0, remaining: 142.0, pct: 83 },
    ],
    tx: [
      tx('Café Unido', 'Panamá', 'Sep 14', -9.75, 'dining'),
      tx('Cinépolis', 'Panamá', 'Sep 13', -24.0, 'entertainment'),
      tx('Riba Smith', 'Panamá', 'Sep 12', -184.22, 'groceries'),
      tx('Zara', 'Panamá', 'Sep 11', -89.0, 'shopping'),
      tx('Copa Airlines', 'Panamá', 'Sep 10', -142.0, 'travel', { plan: '5/6' }),
      tx('Cervecería La Rana', 'Panamá', 'Sep 8', -62.4, 'dining'),
      tx('Terpel', 'Panamá', 'Sep 7', -48.0, 'fuel'),
      tx('Uber', 'Panamá', 'Sep 6', -12.4, 'transport'),
      tx('El Trapiche', 'Panamá', 'Sep 5', -38.5, 'dining'),
      tx('Samsung Store', 'Panamá', 'Sep 4', -89.9, 'home', { plan: '3/12' }),
      tx('Delta Fuel', 'Panamá', 'Sep 2', -55.0, 'fuel', { declined: true }),
      tx('Payment received', 'Banco General', 'Aug 31', 900.0, 'payment'),
      tx('Café Unido', 'Panamá', 'Aug 27', -7.9, 'dining'),
      tx('Farmacias Metro', 'Panamá', 'Aug 25', -23.4, 'pharmacy'),
      tx('Maito', 'Panamá', 'Aug 23', -96.0, 'dining'),
      tx('Uber', 'Panamá', 'Aug 21', -14.2, 'transport'),
      tx('Zara', 'Panamá', 'Aug 19', -72.5, 'shopping'),
      tx('Terpel', 'Panamá', 'Aug 17', -50.1, 'fuel'),
      tx('Cinépolis', 'Panamá', 'Aug 15', -18.0, 'entertainment'),
      tx('Riba Smith', 'Panamá', 'Aug 12', -166.9, 'groceries'),
      tx('Copa Airlines', 'Panamá', 'Aug 10', -142.0, 'travel', { plan: '4/6' }),
      tx('Sushi Itto', 'Panamá', 'Aug 9', -64.0, 'dining'),
      tx('Café Unido', 'Panamá', 'Aug 6', -8.5, 'dining'),
      tx('Samsung Store', 'Panamá', 'Aug 4', -89.9, 'home', { plan: '2/12' }),
      tx('Uber', 'Panamá', 'Aug 4', -9.8, 'transport'),
      tx('Terpel', 'Panamá', 'Aug 3', -52.3, 'fuel'),
      tx('Mercado de Mariscos', 'Panamá', 'Aug 2', -45.2, 'dining'),
      tx('Payment received', 'Banco General', 'Jul 31', 1150.0, 'payment'),
      tx('Maito', 'Panamá', 'Jul 26', -84.0, 'dining'),
      tx('PriceSmart', 'Panamá', 'Jul 22', -241.15, 'groceries'),
      tx('Terpel', 'Panamá', 'Jul 18', -49.6, 'fuel'),
      tx('Copa Airlines', 'Panamá', 'Jul 10', -142.0, 'travel', { plan: '3/6' }),
      tx('Samsung Store', 'Panamá', 'Jul 4', -89.9, 'home', { plan: '1/12' }),
      tx('Copa Airlines', 'Panamá', 'Jun 10', -142.0, 'travel', { plan: '2/6' }),
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
      { merchant: 'Apple Store', plan: '2/9', rate: '0%', monthly: 78.3, remaining: 548.1, pct: 22 },
    ],
    tx: [
      tx('Super 99', 'Panamá', 'Oct 3', -91.4, 'groceries'),
      tx('Netflix', 'Panamá', 'Oct 1', -15.99, 'subscriptions'),
      tx('Super 99', 'Panamá', 'Sep 26', -83.7, 'groceries'),
      tx('Uber Eats', 'Panamá', 'Sep 20', -28.4, 'dining'),
      tx('Super 99', 'Panamá', 'Sep 18', -88.1, 'groceries'),
      tx('Smart Fit', 'Panamá', 'Sep 15', -35.0, 'health'),
      tx('Super 99', 'Panamá', 'Sep 11', -96.35, 'groceries'),
      tx('Apple Store', 'Panamá', 'Sep 6', -78.3, 'home', { plan: '2/9' }),
      tx('Farmacias Arrocha', 'Panamá', 'Sep 3', -41.8, 'pharmacy'),
      tx('Spotify', 'Panamá', 'Sep 2', -10.99, 'subscriptions'),
      tx('Netflix', 'Panamá', 'Sep 1', -15.99, 'subscriptions'),
      tx('Super 99', 'Panamá', 'Aug 28', -76.9, 'groceries'),
      tx('Felipe Motta', 'Panamá', 'Aug 24', -54.0, 'groceries'),
      tx('Uber Eats', 'Panamá', 'Aug 22', -31.2, 'dining'),
      tx('Super 99', 'Panamá', 'Aug 15', -102.3, 'groceries'),
      tx('Smart Fit', 'Panamá', 'Aug 15', -35.0, 'health'),
      tx('Do it Center', 'Panamá', 'Aug 8', -128.4, 'home'),
      tx('Apple Store', 'Panamá', 'Aug 6', -78.3, 'home', { plan: '1/9' }),
      tx('Spotify', 'Panamá', 'Aug 2', -10.99, 'subscriptions'),
      tx('Netflix', 'Panamá', 'Aug 1', -15.99, 'subscriptions'),
      tx('Netflix', 'Panamá', 'Jul 1', -15.99, 'subscriptions'),
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
    tx: [
      tx('Payment received', 'BAC', 'Sep 1', 420.0, 'payment'),
      tx('La Vespa', 'Panamá', 'Aug 26', -53.9, 'dining'),
      tx('Terpel', 'Panamá', 'Aug 20', -47.6, 'fuel'),
      tx('Novey', 'Panamá', 'Aug 14', -64.5, 'home'),
    ],
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
