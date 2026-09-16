export function money(cur: string, n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);
  const [whole, frac] = abs.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${cur} ${withCommas}.${frac}`;
}
