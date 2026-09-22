// "Needs attention" status derivation for the Home screen — one row per card,
// computed fresh on every render (nothing here is persisted). Ported from the
// Nocturne design reference; see the Cards home handoff doc for the rules.
import { DecoratedCard } from './decorate';
import { ColorTokens } from './theme';
import { Dict } from './i18n/dict';

const RING_R = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + delta);
  return toIso(d);
}

// b - a, in whole days.
function daysBetween(fromIso: string, toIso2: string): number {
  const a = new Date(fromIso + 'T00:00:00').getTime();
  const b = new Date(toIso2 + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

export type StatusChip = { text: string; bg: string; ink: string };
export type StatusAction = 'upload' | 'review' | 'pay' | 'open';

export type StatusRow = {
  card: DecoratedCard;
  act: boolean;
  soon: boolean;
  title: string;
  sub: string;
  chips: StatusChip[];
  ringNum: string;
  ringUnit: string;
  ringCaption: string;
  ringDash: string;
  ringColor: string;
  numInk: string;
  action: StatusAction;
  actionLabel: string;
};

export type StatusSummary = {
  rows: StatusRow[];
  segments: { color: string; pct: number }[];
  actCount: number;
  title: string;
  note: string;
};

export function deriveStatus(cards: DecoratedCard[], todayIso: string, t: Dict, colors: ColorTokens): StatusSummary {
  const rows: StatusRow[] = cards.map((c) => {
    const hasStatement = !!c.cutoffIso;
    // A card's own statement tells us its cut-off date, and sometimes the
    // previous one too, but not when the NEXT one is due — so the next
    // expected cut-off is estimated a calendar month after the last one.
    const nextCutoffIso = hasStatement ? addMonths(c.cutoffIso!, 1) : null;
    const stmtLate = !hasStatement || (nextCutoffIso !== null && todayIso > nextCutoffIso);
    const daysLate = hasStatement && nextCutoffIso ? Math.max(daysBetween(nextCutoffIso, todayIso), 0) : 0;

    const dueDays = c.dueIso ? daysBetween(todayIso, c.dueIso) : 999;
    const urgent = !c.paid && dueDays <= 5;
    const soon = !c.paid && dueDays <= 12;
    const act = stmtLate || urgent || c.reviewCount > 0;

    const chips: StatusChip[] = [];
    if (stmtLate) {
      chips.push({
        text: hasStatement ? `${t.statementWord} ${daysLate} ${t.daysLateWord}` : t.noStatementYet,
        bg: colors.tint2,
        ink: colors.onTint2,
      });
    }
    if (c.reviewCount > 0) {
      chips.push({ text: `${c.reviewCount} ${t.toReviewWord}`, bg: colors.tint, ink: colors.accentInk });
    }
    if (!c.paid && !stmtLate) {
      chips.push({
        text: `${t.minWord} ${c.minText}`,
        bg: urgent ? colors.tint : 'transparent',
        ink: urgent ? colors.accentInk : colors.ink3,
      });
    }
    if (c.paid && !stmtLate) {
      chips.push({ text: t.upToDate, bg: 'transparent', ink: colors.ink3 });
    }

    // Ring: days remaining out of a ~30-day cycle; a late statement fills it whole.
    const days = stmtLate ? daysLate : dueDays;
    const frac = stmtLate ? 1 : Math.min(Math.max(1 - days / 30, 0.05), 1);

    const sub = stmtLate
      ? hasStatement
        ? `${t.cutoffLabel} ${c.cutoff} · ${t.nothingReceived}`
        : t.noStatementYet
      : c.paid
        ? `${t.paidWord} · ${t.nextCutoffWord} ${c.cutoff}`
        : `${t.dueWord} ${c.due} · ${c.balanceText}`;

    const action: StatusAction = stmtLate ? 'upload' : c.reviewCount > 0 ? 'review' : !c.paid ? 'pay' : 'open';
    const actionLabel = { upload: t.actionUpload, review: t.actionReview, pay: t.actionPay, open: t.actionOpen }[
      action
    ];

    // The ring's inner unit always just says "days" — what those days count
    // down to (a late statement, a payment, or the next cycle) is spelled out
    // in the caption below the ring instead, so the ring itself stays terse.
    const ringCaption = stmtLate ? t.ringLateCaption : !c.paid ? t.ringPayCaption : t.ringOpenCaption;

    return {
      card: c,
      act,
      soon,
      title: c.displayName,
      sub,
      chips,
      ringNum: hasStatement || !stmtLate ? String(Math.max(days, 0)) : '–',
      ringUnit: t.daysWord,
      ringCaption,
      ringDash: `${(frac * RING_CIRCUMFERENCE).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`,
      ringColor: stmtLate || urgent ? colors.seg1 : soon ? colors.seg3 : colors.line,
      numInk: act ? colors.ink : colors.ink2,
      action,
      actionLabel,
    };
  });

  // Cards needing action float to the top; order is otherwise preserved.
  rows.sort((a, b) => (b.act ? 1 : 0) - (a.act ? 1 : 0));

  const actCount = rows.filter((r) => r.act).length;
  const soonCount = rows.filter((r) => !r.act && r.soon).length;
  const okCount = rows.length - actCount - soonCount;
  const segments = [
    { n: actCount, color: colors.seg1 },
    { n: soonCount, color: colors.seg3 },
    { n: okCount, color: colors.line },
  ]
    .filter((s) => s.n > 0)
    .map((s) => ({ color: s.color, pct: (s.n / rows.length) * 100 }));

  return {
    rows,
    segments,
    actCount,
    title: actCount ? t.needsAttention : t.cardStatus,
    note: actCount ? `${actCount} ${t.cardsWord} · ${rows.length - actCount} ${t.onTrack}` : t.everythingOnTrack,
  };
}
