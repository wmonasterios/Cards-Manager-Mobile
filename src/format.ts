export function money(cur: string, n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);
  const [whole, frac] = abs.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${cur} ${withCommas}.${frac}`;
}

// A short day label in the user's language: "Oct 17" (en) / "17 oct" (es).
// Months and order come from the dictionary, so no Intl locale data is needed.
export function shortDay(iso: string | undefined | null, t: { monthsShort: string; dateOrder: string }, fallback = ''): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return fallback;
  const m = t.monthsShort.split(',')[Number(iso.slice(5, 7)) - 1];
  const d = String(Number(iso.slice(8, 10)));
  return t.dateOrder === 'dm' ? `${d} ${m}` : `${m} ${d}`;
}
