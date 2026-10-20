export function money(cur: string, n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);
  const [whole, frac] = abs.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${cur} ${withCommas}.${frac}`;
}

// Amounts in different currencies are never added together: a US$ card and
// a COP card owe "US$ 500.00 + COP 2,000,000.00", not "US$ 2,000,500.00".
// Groups by the card's display currency (cardsApi turns 'USD' into 'US$'),
// US$ first, then in the order each currency first appears.
export function sumByCur(items: { cur: string; n: number }[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const { cur, n } of items) totals.set(cur, (totals.get(cur) ?? 0) + n);
  return [...totals].sort(([a], [b]) => (a === 'US$' ? -1 : b === 'US$' ? 1 : 0));
}

export function moneyByCur(items: { cur: string; n: number }[]): string {
  return sumByCur(items).map(([cur, n]) => money(cur, n)).join(' + ');
}

// For tight spots (the Insights week bars): 10,000 and up shortens to
// "COP 812K" / "COP 1.6M" so a peso amount fits its column; below that it's
// the normal amount, so US$ weeks read exactly as before.
export function moneyCompact(cur: string, n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${cur} ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}${cur} ${Math.round(abs / 1e3)}K`;
  return money(cur, n);
}

// A short day label in the user's language: "Oct 17" (en) / "17 oct" (es).
// Months and order come from the dictionary, so no Intl locale data is needed.
export function shortDay(iso: string | undefined | null, t: { monthsShort: string; dateOrder: string }, fallback = ''): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return fallback;
  const m = t.monthsShort.split(',')[Number(iso.slice(5, 7)) - 1];
  const d = String(Number(iso.slice(8, 10)));
  return t.dateOrder === 'dm' ? `${d} ${m}` : `${m} ${d}`;
}
