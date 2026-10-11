import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, PanResponder, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { CalendarMascot } from '../components/Mascot';
import { money } from '../format';
import { artGradient } from '../data';

const WEEKDAY_LABELS: Record<'en' | 'es', string[]> = {
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  es: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
};

type DayEvent = {
  kind: 'due' | 'paid';
  card: string;
  note: string;
  amount: string;
  // Raw amount + currency, so the day summary can add up what's due.
  value?: number;
  cur?: string;
  min?: string;
  cardId?: string;
  colorKey?: string;
};

export function CalendarScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards, isDemo, paymentHistory } = useCards();

  const today = useMemo(() => new Date(), []);
  const [monthOffset, setMonthOffset] = useState(0);
  const viewDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1), [today, monthOffset]);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const isCurrentMonth = monthOffset === 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first index
  const monthLabel = viewDate.toLocaleDateString(lang === 'es' ? 'es-PA' : 'en-US', { month: 'long', year: 'numeric' });

  const [selectedDay, setSelectedDay] = useState(today.getDate());

  const goToMonth = (offset: number) => {
    setMonthOffset(offset);
    setSelectedDay(offset === 0 ? today.getDate() : 1);
  };

  const monthOffsetRef = useRef(monthOffset);
  monthOffsetRef.current = monthOffset;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -40) goToMonth(monthOffsetRef.current + 1);
        else if (gesture.dx >= 40) goToMonth(monthOffsetRef.current - 1);
      },
    }),
  ).current;

  const es = lang === 'es';
  const daysFromToday = (iso: string) =>
    Math.round(
      (new Date(iso + 'T00:00:00').getTime() -
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
        86400000,
    );

  const eventsByDay = useMemo(() => {
    const map: Record<number, DayEvent[]> = {};
    const add = (day: number, event: DayEvent) => {
      (map[day] ?? (map[day] = [])).push(event);
    };
    const inMonth = (iso: string) => {
      const d = new Date(iso + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : null;
    };
    // Days (per card) that already show a registered payment, so a settled
    // deadline on that same day doesn't get a second, duplicate "paid" row.
    const paidDays = new Set<string>();
    if (!isDemo) {
      for (const c of cards) {
        for (const p of paymentHistory(c.id)) {
          if (!p.paidOnIso) continue;
          const day = inMonth(p.paidOnIso);
          if (day === null) continue;
          paidDays.add(`${c.id}:${day}`);
          add(day, {
            kind: 'paid',
            card: `${c.displayName} ${c.product}`.trim(),
            note: es ? 'Pagado' : 'Paid',
            amount: money(c.cur, p.amount),
            cardId: c.id,
            colorKey: c.colorKey,
          });
        }
      }
    }
    // Every deadline on each card's current statement — one per card when the
    // bank uses a single date, or the minimum and the full payment separately
    // when they differ (see PayEvent in decorate.ts). Demo dates are
    // re-anchored to today, so this matches what Home shows.
    for (const c of cards) {
      for (const ev of c.payEvents) {
        const day = inMonth(ev.iso);
        if (day === null) continue;
        const card = `${c.displayName} ${c.product}`.trim();
        if (!ev.settled) {
          const n = daysFromToday(ev.iso);
          const when =
            n < 0
              ? es ? 'Vencido' : 'Overdue'
              : n === 0
                ? es ? 'Vence hoy' : 'Due today'
                : n === 1
                  ? es ? 'Mañana' : 'Tomorrow'
                  : es ? `En ${n} días` : `In ${n} days`;
          const what =
            ev.kind === 'min' ? (es ? 'pago mínimo' : 'minimum payment') : es ? 'pago de contado' : 'full payment';
          add(day, {
            kind: 'due',
            card,
            note: `${when} · ${what}`,
            amount: ev.amountText,
            value: ev.amount,
            cur: c.cur,
            min: ev.kind === 'both' && !c.minCovered ? c.minText : undefined,
            cardId: c.id,
            colorKey: c.colorKey,
          });
        } else {
          if (ev.kind !== 'min' && paidDays.has(`${c.id}:${day}`)) continue;
          add(day, {
            kind: 'paid',
            card,
            note:
              ev.kind === 'min'
                ? es ? 'Pago mínimo · cubierto' : 'Minimum payment · covered'
                : c.balance === 0
                  ? es ? 'Nada por pagar' : 'Nothing to pay'
                  : es ? 'Pagado' : 'Paid',
            amount: ev.kind === 'min' ? money(c.cur, c.min) : c.statementText,
            cardId: c.id,
            colorKey: c.colorKey,
          });
        }
      }
    }
    // Pending first, then settled, so the list under the calendar leads with
    // what still needs doing.
    for (const day of Object.keys(map)) {
      map[Number(day)].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'due' ? -1 : 1));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, cards, paymentHistory, lang, month, year]);

  const dayEvents = eventsByDay[selectedDay] ?? [];
  const isToday = isCurrentMonth && selectedDay === today.getDate();

  // Summary under the month name follows the selected day: how many cards have
  // a payment due that day and what they add up to (per currency).
  const dueToday = dayEvents.filter((e) => e.kind === 'due');
  const dueCards = new Set(dueToday.map((e) => e.cardId ?? e.card)).size;
  const totalsByCur = new Map<string, number>();
  for (const e of dueToday) {
    if (e.value === undefined || !e.cur) continue;
    totalsByCur.set(e.cur, (totalsByCur.get(e.cur) ?? 0) + e.value);
  }
  const totalsText = [...totalsByCur].map(([cur, n]) => money(cur, n)).join(' + ');
  const daySummary = dueCards
    ? `${dueCards} ${es ? (dueCards === 1 ? 'tarjeta por pagar' : 'tarjetas por pagar') : dueCards === 1 ? 'card to pay' : 'cards to pay'}${totalsText ? ` · ${totalsText}` : ''}`
    : dayEvents.length
      ? es ? 'Nada pendiente por pagar este día' : 'Nothing left to pay this day'
      : es ? 'No hay eventos este día' : 'No events this day';
  const selectedDateLabel = new Date(year, month, selectedDay).toLocaleDateString(
    lang === 'es' ? 'es-PA' : 'en-US',
    { day: 'numeric', month: 'long' },
  );

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.title}>{t.calendarTitle}</Text>
          <View style={styles.monthNavRow}>
            <Pressable onPress={() => goToMonth(monthOffset - 1)} hitSlop={10} style={styles.monthNavBtn}>
              <Text style={styles.monthNavIcon}>{'‹'}</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => goToMonth(monthOffset + 1)} hitSlop={10} style={styles.monthNavBtn}>
              <Text style={styles.monthNavIcon}>{'›'}</Text>
            </Pressable>
          </View>
          <Text style={styles.daySummary}>{daySummary}</Text>

          <View style={styles.calendarCard} {...panResponder.panHandlers}>
            <View style={styles.weekRow}>
              {WEEKDAY_LABELS[lang].map((d, i) => (
                <Text key={i} style={styles.weekLabel}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((n, i) => {
                if (n === null) return <View key={i} style={styles.cell} />;
                const events = eventsByDay[n] ?? [];
                const hasEvents = events.length > 0;
                const sel = selectedDay === n;
                // Today stays marked (outline + accent number) even after
                // selecting another day or moving to another month and back.
                const isTodayCell = isCurrentMonth && n === today.getDate();
                return (
                  <Pressable
                    key={i}
                    onPress={() => setSelectedDay(n)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${n}${isTodayCell ? (es ? ', hoy' : ', today') : ''}${hasEvents ? (es ? `, ${events.length} eventos` : `, ${events.length} events`) : ''}`}
                    style={[
                      styles.cell,
                      styles.dayCell,
                      {
                        backgroundColor: sel ? colors.tint2 : hasEvents ? colors.line2 : 'transparent',
                        borderColor: isTodayCell && !sel ? colors.accent : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        {
                          color: sel ? colors.onTint2 : isTodayCell ? colors.accent : hasEvents ? colors.ink : colors.ink3,
                          fontWeight: sel || isTodayCell ? '800' : '500',
                        },
                      ]}
                    >
                      {n}
                    </Text>
                    {/* One dot per event (max 3). Color follows the event, not
                        the card: filled = to pay, hollow grey = paid. */}
                    <View style={styles.dotRow}>
                      {events.slice(0, 3).map((e, k) => (
                        <View
                          key={k}
                          style={[
                            styles.dayDot,
                            e.kind === 'due'
                              ? { backgroundColor: sel ? colors.onTint2 : colors.seg1 }
                              : { borderWidth: 1.5, borderColor: sel ? colors.onTint2 : colors.ink3 },
                          ]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.seg1 }]} />
              <Text style={styles.legendText}>{es ? 'Por pagar' : 'To pay'}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { borderWidth: 1.5, borderColor: colors.ink3 }]} />
              <Text style={styles.legendText}>{es ? 'Pagado / nada por pagar' : 'Paid / nothing to pay'}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendToday, { borderColor: colors.accent }]} />
              <Text style={styles.legendText}>{es ? 'Hoy' : 'Today'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isToday ? (lang === 'es' ? 'Hoy' : 'Today') : selectedDateLabel}
          </Text>
          {dayEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <CalendarMascot size={52} />
              <Text style={styles.emptyText}>
                {lang === 'es' ? 'No hay eventos este día' : 'No events this day'}
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 10, gap: 8 }}>
              {dayEvents.map((u, i) => {
                const cardId = u.cardId;
                return (
                  <Pressable
                    key={i}
                    style={styles.upRow}
                    disabled={!cardId}
                    onPress={cardId ? () => navigation.navigate('CardDetail', { cardId }) : undefined}
                  >
                    {/* The card's own color lives here (not on the calendar dots). */}
                    {cardId && (
                      <View
                        style={[
                          styles.cardBar,
                          u.kind === 'due'
                            ? { backgroundColor: artGradient(cardId, u.colorKey)[1] }
                            : { borderWidth: 2, borderColor: artGradient(cardId, u.colorKey)[1] },
                        ]}
                      />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.upCard} numberOfLines={1}>
                        {u.card}
                      </Text>
                      <Text
                        style={[styles.upNote, { color: u.kind === 'due' ? colors.ink : colors.ink3 }]}
                        numberOfLines={1}
                      >
                        {u.note}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.upAmount}>{u.amount}</Text>
                      {u.min !== undefined && (
                        <Text style={styles.upMin}>
                          {t.minWord.toLowerCase()} {u.min}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    title: { fontSize: 26, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
    daySummary: { fontSize: 12.5, color: colors.ink2, marginTop: 12 },
    monthNavRow: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    monthNavBtn: {
      width: 32,
      height: 32,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthNavIcon: { fontSize: 16, color: colors.ink, fontWeight: '600' },
    monthLabel: { fontSize: 15, fontWeight: '500', color: colors.ink },
    calendarCard: {
      marginTop: 18,
      padding: 14,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    weekLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '500', color: colors.ink3 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
    dayCell: { borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 3 },
    dayNum: { fontSize: 13, fontWeight: '500' },
    dotRow: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
    dayDot: { width: 6, height: 6, borderRadius: 3 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendToday: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5 },
    legendText: { fontSize: 12, color: colors.ink3 },
    cardBar: { width: 8, height: 28, borderRadius: 4 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    emptyCard: {
      marginTop: 10,
      padding: 16,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
      alignItems: 'center',
      gap: 6,
    },
    emptyText: { fontSize: 12.5, color: colors.ink3 },
    upRow: {
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    upCard: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
    upNote: { fontSize: 11, marginTop: 3 },
    upAmount: { fontSize: 14, fontWeight: '600', color: colors.ink },
    upMin: { fontSize: 10.5, color: colors.ink3, marginTop: 3 },
  });
}
