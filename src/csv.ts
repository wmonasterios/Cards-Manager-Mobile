import { DecoratedCard } from './decorate';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildTransactionsCsv(cards: DecoratedCard[]): string {
  const header = ['Date', 'Card', 'Merchant', 'Category', 'Amount'];
  const rows = cards.flatMap((c) =>
    c.dtx.map((t) => [t.iso, c.displayName, t.merchant, t.category, t.amount.toFixed(2)]),
  );
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}
