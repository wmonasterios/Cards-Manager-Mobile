// Demo-mode advisor: the demo has no account, so it can't call advisor-chat.
// Instead the four suggestion chips get answers computed here from the same
// sample cards the rest of the demo shows, so every number matches Home,
// Calendar and Insights. Anything typed freely gets a short "create an
// account" reply. Keep these answers to things the real advisor actually does.
import type { DecoratedCard } from './decorate';
import { money } from './format';
import { DEMO_PERSONA } from './demo';

export type DemoQuestion = 'payFirst' | 'topSpend' | 'interest' | 'budget';

export const DEMO_QUESTIONS: Record<'es' | 'en', { key: DemoQuestion; text: string }[]> = {
  es: [
    { key: 'payFirst', text: '¿Qué tarjeta pago primero?' },
    { key: 'topSpend', text: '¿En qué gasté más este mes?' },
    { key: 'interest', text: '¿Cuánto he pagado en intereses?' },
    { key: 'budget', text: 'Arma mi presupuesto' },
  ],
  en: [
    { key: 'payFirst', text: 'Which card should I pay first?' },
    { key: 'topSpend', text: 'What did I spend the most on this month?' },
    { key: 'interest', text: 'How much have I paid in interest?' },
    { key: 'budget', text: 'Build my budget' },
  ],
};

const CAT_ES: Record<string, string> = {
  dining: 'restaurantes', groceries: 'supermercado', transport: 'transporte', fuel: 'gasolina',
  shopping: 'compras', home: 'hogar', beauty: 'belleza', pharmacy: 'farmacia', health: 'salud',
  entertainment: 'entretenimiento', subscriptions: 'suscripciones', kids: 'niños', education: 'educación',
  travel: 'viajes', hotels: 'hoteles', insurance: 'seguros', utilities: 'servicios', government: 'gobierno',
  housing: 'vivienda', fees: 'cargos del banco', taxes: 'impuestos', other: 'otros',
};
const CAT_EN: Record<string, string> = {
  dining: 'dining', groceries: 'groceries', transport: 'transport', fuel: 'fuel', shopping: 'shopping',
  home: 'home', beauty: 'beauty', pharmacy: 'pharmacy', health: 'health', entertainment: 'entertainment',
  subscriptions: 'subscriptions', kids: 'kids', education: 'education', travel: 'travel', hotels: 'hotels',
  insurance: 'insurance', utilities: 'utilities', government: 'government', housing: 'housing',
  fees: 'bank fees', taxes: 'taxes', other: 'other',
};

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Spend = { iso: string; amount: number; category: string; merchant: string; plan?: string };

function spendRows(cards: DecoratedCard[]): Spend[] {
  return cards.flatMap((c) =>
    c.dtx
      .filter((t) => t.amount < 0 && !t.declined && !t.excludedFromSpend)
      .map((t) => ({ iso: t.iso, amount: -t.amount, category: t.category, merchant: t.merchant, plan: t.plan })),
  );
}

// The demo re-anchors its dates to today, so the current month is usually
// only a few days old. Of the last two months, answer about the busier one.
function latestMonth(rows: Spend[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.iso.slice(0, 7), (counts.get(r.iso.slice(0, 7)) ?? 0) + 1);
  const [last, prev] = [...counts.keys()].sort().reverse();
  if (!last) return null;
  return prev && (counts.get(prev) ?? 0) > (counts.get(last) ?? 0) ? prev : last;
}

function monthName(iso: string, es: boolean): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return es ? MONTHS_ES[m] : MONTHS_EN[m];
}

function daysUntil(iso: string): number {
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, mo, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, mo - 1, d) - t) / 86400000);
}

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

export function demoAnswer(q: DemoQuestion, cards: DecoratedCard[], lang: 'es' | 'en'): string {
  const es = lang === 'es';
  const cat = (id: string) => (es ? CAT_ES : CAT_EN)[id] ?? id;
  const cur = cards[0]?.cur ?? 'USD';
  const $ = (n: number) => money(cur, n);
  const rows = spendRows(cards);
  const month = latestMonth(rows);

  if (q === 'payFirst') {
    const unpaid = cards
      .filter((c) => !c.paid && c.nextDueIso && c.balance > 0)
      .map((c) => ({ c, days: daysUntil(c.nextDueIso!) }))
      .sort((a, b) => a.days - b.days);
    if (unpaid.length === 0) {
      return es
        ? 'Estás al día: no tienes pagos pendientes en este ciclo. Buen trabajo.'
        : "You're all caught up: no payments pending this cycle. Nice work.";
    }
    const when = (d: number) =>
      es
        ? d < 0 ? `venció hace ${-d} días` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`
        : d < 0 ? `overdue by ${-d} days` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
    const list = unpaid
      .slice(0, 3)
      .map(({ c, days }, i) => `${i + 1}. ${c.displayName}: ${when(days)}, ${$(c.fullAmount ?? c.balance)}`)
      .join('\n');
    const first = unpaid[0];
    return es
      ? `Por fecha de pago, este es el orden:\n\n${list}\n\nEmpieza por ${first.c.displayName}. Si no te alcanza para el total, paga al menos el mínimo de ${$(first.c.min)} para quedar al día y abona el resto apenas puedas: los intereses corren sobre lo que quede pendiente.`
      : `By due date, here's the order:\n\n${list}\n\nStart with ${first.c.displayName}. If you can't cover the full amount, pay at least the ${$(first.c.min)} minimum to stay current and put the rest in as soon as you can: interest runs on whatever is left.`;
  }

  if (!month) {
    return es ? 'Todavía no hay gastos en tus estados de cuenta.' : "There's no spending in your statements yet.";
  }
  const monthRows = rows.filter((r) => r.iso.startsWith(month));
  const varRows = monthRows.filter((r) => !r.plan);
  const total = monthRows.reduce((n, r) => n + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of varRows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const cats = [...byCat.entries()].filter(([c]) => c !== 'fees').sort((a, b) => b[1] - a[1]);

  if (q === 'topSpend') {
    // Every purchase counts here (cuotas included), like Insights.
    const all = new Map<string, number>();
    for (const r of monthRows) if (r.category !== 'fees') all.set(r.category, (all.get(r.category) ?? 0) + r.amount);
    const top = [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = top.map(([c, v], i) => `${i + 1}. ${cat(c)}: ${$(v)} (${Math.round((v / total) * 100)}%)`).join('\n');
    const biggest = monthRows.slice().sort((a, b) => b.amount - a.amount)[0];
    return es
      ? `En ${monthName(month, true)} gastaste ${$(total)} en ${monthRows.length} compras. Donde más se fue:\n\n${lines}\n\nLa compra más grande fue ${biggest.merchant} por ${$(biggest.amount)}.`
      : `In ${monthName(month, false)} you spent ${$(total)} across ${monthRows.length} purchases. Where most of it went:\n\n${lines}\n\nYour biggest purchase was ${biggest.merchant} at ${$(biggest.amount)}.`;
  }

  if (q === 'interest') {
    const fees = rows.filter((r) => r.category === 'fees').reduce((n, r) => n + r.amount, 0);
    const zeroPlans = cards.flatMap((c) => c.plans).filter((p) => /0%/.test(p.rate));
    const plansNote = zeroPlans.length
      ? es
        ? ` Tus ${zeroPlans.length} compras en cuotas están al 0%, así que tampoco te generan intereses.`
        : ` Your ${zeroPlans.length} installment plans are at 0%, so they don't add interest either.`
      : '';
    return fees > 0
      ? es
        ? `En tus estados de cuenta aparecen ${$(fees)} en intereses y cargos del banco.${plansNote} La forma de evitarlos es pagar el total antes de cada fecha de pago.`
        : `Your statements show ${$(fees)} in interest and bank fees.${plansNote} The way to avoid them is paying the full balance before each due date.`
      : es
        ? `Buenas noticias: en tus estados de cuenta no aparecen cobros de intereses.${plansNote} Sigue pagando el total antes de cada fecha de pago y se mantiene así.`
        : `Good news: your statements show no interest charges.${plansNote} Keep paying the full balance before each due date and it stays that way.`;
  }

  // budget: fixed part = this month's cuotas; variable part = top categories, ~10% under.
  const cuotas = cards.flatMap((c) => c.plans).reduce((n, p) => n + p.monthly, 0);
  const variable = cats.slice(0, 4).map(([c, v]) => ({ c, limit: round10(v * 0.9) }));
  const varTotal = variable.reduce((n, x) => n + x.limit, 0);
  const lines = variable.map((x) => `• ${cat(x.c)}: ${$(x.limit)}`).join('\n');
  return es
    ? `Te propongo esto para el próximo mes, a partir de lo que gastaste en ${monthName(month, true)}:\n\n${lines}\n\nEso suma ${$(varTotal)}, cerca de 10% menos de lo que gastaste ese mes.` +
        (cuotas > 0 ? ` Aparte van tus cuotas, que son fijas: ${$(cuotas)} al mes.` : '') +
        `\n\n¿Quieres que lo ajustemos a una meta de ahorro?`
    : `Here's a plan for next month, based on what you spent in ${monthName(month, false)}:\n\n${lines}\n\nThat adds up to ${$(varTotal)}, about 10% less than you spent that month.` +
        (cuotas > 0 ? ` Your installments are separate and fixed: ${$(cuotas)} a month.` : '') +
        `\n\nWant to adjust it to a savings goal?`;
}

export function demoFreeTextReply(lang: 'es' | 'en'): string {
  return lang === 'es'
    ? `En la demo respondo las preguntas sugeridas con los datos de ${DEMO_PERSONA}. Crea tu cuenta para preguntarme lo que quieras sobre tus propias tarjetas.`
    : `In the demo I answer the suggested questions with ${DEMO_PERSONA}'s sample data. Create an account to ask me anything about your own cards.`;
}
