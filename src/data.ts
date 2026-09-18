import { cardArt } from './theme';

export type Category =
  | 'dining'
  | 'groceries'
  | 'transport'
  | 'fuel'
  | 'shopping'
  | 'home'
  | 'clothing'
  | 'beauty'
  | 'pharmacy'
  | 'health'
  | 'entertainment'
  | 'subscriptions'
  | 'recreation'
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
  'dining', 'groceries', 'transport', 'fuel', 'shopping', 'home', 'clothing', 'beauty',
  'pharmacy', 'health', 'entertainment', 'subscriptions', 'recreation', 'kids', 'education',
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
  declined?: boolean;
  statementId?: string;
  categorySource?: string;
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
  plansNote: string;
  cycleNote: string;
  plans: InstalmentPlan[];
  tx: Transaction[];
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

export const CARDS: Card[] = [
  {
    id: 'aliado',
    bank: 'Banco Aliado',
    product: 'Visa Infinite',
    last4: '•••• 1675',
    network: 'Visa',
    cur: 'US$',
    balance: 3420.1,
    limit: 12000,
    min: 171.01,
    due: 'Sep 18',
    cutoff: 'Aug 30',
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
      tx('Payment received', 'Transfer · Banco Aliado', 'Aug 31', 900.0, 'payment'),
      tx('Riba Smith', 'Groceries · Panamá', 'Aug 12', -166.9, 'groceries'),
      tx('PriceSmart', 'Groceries · Panamá', 'Jul 22', -241.15, 'groceries'),
      tx('Copa Airlines', 'Instalment 2/6 · Travel', 'Jun 10', -142.0, 'travel', { plan: '2 of 6' }),
    ],
  },
  {
    id: 'bac',
    bank: 'BAC',
    product: 'Visa Signature',
    last4: '•••• 4821',
    network: 'Visa',
    cur: 'US$',
    balance: 1284.52,
    limit: 6000,
    min: 64.23,
    due: 'Sep 25',
    cutoff: 'Sep 5',
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
    id: 'davi',
    bank: 'Davibank',
    product: 'Mastercard Black',
    last4: '•••• 9043',
    network: 'Mastercard',
    cur: 'US$',
    balance: 2140.5,
    limit: 9000,
    min: 214.05,
    due: 'Oct 2',
    cutoff: 'Sep 8',
    plansNote: '1 active',
    cycleNote: '8 Aug – 7 Sep',
    plans: [
      { merchant: 'Novey', plan: '4 of 12', rate: '1.2% monthly', monthly: 168.4, remaining: 1347.2, pct: 33 },
    ],
    tx: [
      tx('Super Xtra', 'Groceries · Panamá', 'Sep 9', -312.4, 'groceries'),
      tx('Novey', 'Instalment 4/12 · Tech', 'Sep 5', -168.4, 'home', { plan: '4 of 12' }),
      tx('Delta', 'Fuel · Panamá', 'Sep 2', -98.0, 'fuel'),
      tx('El Machetazo', 'Groceries · Panamá', 'Jun 30', -74.2, 'groceries'),
    ],
  },
  {
    id: 'bac2',
    bank: 'BAC',
    product: 'Platinum',
    last4: '•••• 2210',
    network: 'Mastercard',
    cur: 'US$',
    balance: 0,
    limit: 3500,
    min: 0,
    due: 'Sep 22',
    cutoff: 'Sep 5',
    plansNote: 'None',
    cycleNote: '5 Aug – 4 Sep',
    plans: [],
    tx: [tx('Payment received', 'Transfer · BAC', 'Sep 1', 420.0, 'payment')],
  },
];

export function artGradient(id: string): [string, string, string] {
  return cardArt[id] ?? cardArt.bac2;
}
