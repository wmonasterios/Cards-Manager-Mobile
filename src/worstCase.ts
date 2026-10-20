import { Card, Category, Transaction } from './data';

// Dev-only stress data for the demo catalogue (see the break-ui skill). On
// web, open the app with `?data=worst` (or `empty` / `one`), or set
// EXPO_PUBLIC_DEMO_DATA to the same value, then enter the demo. Never active
// in a production bundle: CardsContext only calls this under __DEV__.
//
// Values are taken from real limits in the database (19 Oct 2026): merchant
// up to 65 chars, product 29, bank 16, a single charge of US$ 17,500, six
// cards for one user, 194 lines on one card in one month, 12 cuota plans.
export type DemoDataset = 'demo' | 'worst' | 'empty' | 'one';

export function demoDataset(): DemoDataset {
  let v: string | undefined = process.env.EXPO_PUBLIC_DEMO_DATA;
  try {
    const search = (globalThis as any).location?.search as string | undefined;
    const m = search?.match(/[?&]data=(\w+)/);
    if (m) v = m[1];
  } catch {}
  return v === 'worst' || v === 'empty' || v === 'one' ? v : 'demo';
}

// Real statement lines are bank text, often uppercase, truncated or with
// installment markers — not the tidy names the demo uses.
const LONG_MERCHANTS = [
  'PAYPAL *MERCADOLIBRE COMPRA INTERNACIONAL 4029357733 SAN JOSE CRI', // 65
  'DAVIBANK 6% (PLACUOTA:03/48) FINANCIAMIENTO SALDO',
  'Restaurante y Marisquería El Rincón de Ñoño',
  'AMZN Mktp US*2K4L19AB3 Amzn.com/bill WA',
  'Q',
  'GRAND DELI GOURMET OBA PANAM',
  'Farmacias Arrocha Sucursal Costa del Este',
];

function line(base: Transaction, i: number, merchant: string, amount: number, category: Category, extra?: Partial<Transaction>): Transaction {
  return { ...base, id: `${base.id}-w${i}`, merchant, amount, category, plan: undefined, planSource: undefined, ...extra };
}

function stress(card: Card, idx: number): Card {
  const t = card.tx;
  const pick = (i: number) => t[i % t.length];
  const lines: Transaction[] = [
    line(pick(0), 0, LONG_MERCHANTS[0], -17500, 'shopping', { planOriginal: true, excludedFromSpend: true }),
    line(pick(1), 1, LONG_MERCHANTS[1], -364.58, 'fees', { plan: '3/48', planSource: 'statement' }),
    line(pick(2), 2, LONG_MERCHANTS[2], -1284.5, 'dining', { sub: 'Ciudad de Panamá, Panamá' }),
    line(pick(3), 3, LONG_MERCHANTS[3], 0.0, 'shopping'),
    line(pick(4), 4, LONG_MERCHANTS[4], -0.01, 'other', { sub: '' }),
    line(pick(5), 5, '', -12.4, 'other'),
    line(pick(6), 6, LONG_MERCHANTS[5], 23456.78, 'payment'),
    line(pick(7), 7, LONG_MERCHANTS[6], -41.8, 'pharmacy', { plan: '48/48', planSource: 'statement' }),
    line(pick(8), 8, 'Apple Store', -1499, 'home', { planOriginal: true, excludedFromSpend: true }),
  ];
  // One card gets a month as busy as the busiest real one (194 lines, ~US$ 10k;
  // the highest real monthly spend is US$ 12,576).
  const busy =
    idx === 0
      ? Array.from({ length: 194 }, (_, i) =>
          line(t[0], 100 + i, LONG_MERCHANTS[i % LONG_MERCHANTS.length], -(((i * 37) % 100) + 0.99), (['dining', 'groceries', 'shopping', 'transport'] as Category[])[i % 4]),
        )
      : [];
  // Prefix ids: cards w4–w6 reuse a template card's lines.
  return { ...card, tx: [...lines, ...busy, ...t].map((x) => ({ ...x, id: `${card.id}:${x.id}` })) };
}

export function buildWorstCaseCards(demo: Card[], which: Exclude<DemoDataset, 'demo'>): Card[] {
  if (which === 'empty') return [];
  if (which === 'one') {
    const c = demo[0];
    return [{ ...c, plans: c.plans.slice(0, 1), tx: c.tx.filter((x) => !!x.plan).slice(0, 1) }];
  }
  const [a, b, c] = demo;
  const cards: Card[] = [
    // Huge balance against a huge limit, long product, nickname at the max seen.
    { ...a, bank: 'Caja de Ahorros', product: 'Visa Infinite Privilege Metal', nickname: 'Gastos casa!', balance: 23456.78, limit: 34000, min: 1172.84, fullAmount: 23456.78 },
    // Over the limit (142%).
    { ...b, bank: 'Banistmo', product: 'Mastercard Black', balance: 8520.4, limit: 6000, min: 426.02 },
    // Credit balance after an overpayment.
    { ...c, bank: 'BAC Credomatic', product: '', balance: -42.5, min: 0 },
    // No limit read from the statement yet, no product.
    { ...a, id: 'w4', bank: 'Banco Nacional de Panamá', product: '', network: '', limit: 0, balance: 312.15, min: 25 },
    // 16-char bank (the longest real one) with a long product.
    { ...b, id: 'w5', bank: 'Global Bank Corp', product: 'Visa Signature Viajero Plus', balance: 0.01, min: 0.01 },
    { ...c, id: 'w6', bank: 'Davivienda', product: 'Diners Club', nickname: 'Viajes 2026', balance: 48750, limit: 60000, min: 2437.5 },
  ];
  return cards.map(stress);
}
