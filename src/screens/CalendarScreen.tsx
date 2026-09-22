import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, PanResponder, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { money } from '../format';

const UPCOMING: Record<'en' | 'es', { day: string; mon: string; card: string; note: string; amount: string; min: string; due: boolean }[]> = {
  en: [
    { day: '18', mon: 'Sep', card: 'Banco Aliado Visa Infinite', note: 'In 4 days · full payment', amount: 'US$ 3,420.10', min: 'US$ 171.01', due: true },
    { day: '22', mon: 'Sep', card: 'BAC Platinum', note: 'Nothing to pay', amount: 'US$ 0.00', min: 'US$ 0.00', due: false },
    { day: '25', mon: 'Sep', card: 'BAC Visa Signature', note: 'In 11 days', amount: 'US$ 1,284.52', min: 'US$ 64.23', due: false },
    { day: '02', mon: 'Oct', card: 'Davibank Mastercard Black', note: 'Next cycle', amount: 'US$ 2,140.50', min: 'US$ 214.05', due: false },
  ],
  es: [
    { day: '18', mon: 'Sep', card: 'Banco Aliado Visa Infinite', note: 'En 4 días · pago de contado', amount: 'US$ 3,420.10', min: 'US$ 171.01', due: true },
    { day: '22', mon: 'Sep', card: 'BAC Platinum', note: 'Nada por pagar', amount: 'US$ 0.00', min: 'US$ 0.00', due: false },
    { day: '25', mon: 'Sep', card: 'BAC Visa Signature', note: 'En 11 días', amount: 'US$ 1,284.52', min: 'US$ 64.23', due: false },
    { day: '02', mon: 'Oct', card: 'Davibank Mastercard Black', note: 'Próximo ciclo', amount: 'US$ 2,140.50', min: 'US$ 214.05', due: false },
  ],
};

const WEEKDAY_LABELS: Record<'en' | 'es', string[]> = {
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  es: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
};

const MONTH_ABBR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type DayEvent = { card: string; note: string; amount: string; min: string; due: boolean };

export function CalendarScreen() {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards, isDemo } = useCards();
  const { reminder, toggleReminder } = useAppSettings();

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

  const unpaid = cards.filter((c) => !c.paid);
  const usdTotal = unpaid.reduce((n, c) => n + c.remaining, 0);
  const monthDueText = `${unpaid.length} ${lang === 'es' ? 'pagos' : 'payments'} · ${money('US$', usdTotal)} ${lang === 'es' ? 'en total' : 'total'}`;

  const eventsByDay = useMemo(() => {
    const map: Record<number, DayEvent[]> = {};
    const add = (day: number, event: DayEvent) => {
      (map[day] ?? (map[day] = [])).push(event);
    };
    if (isDemo) {
      const currentMonAbbr = MONTH_ABBR_EN[month];
      for (const u of UPCOMING[lang]) {
        if (u.mon !== currentMonAbbr) continue;
        add(Number(u.day), { card: u.card, note: u.note, amount: u.amount, min: u.min, due: u.due });
      }
    } else {
      for (const c of unpaid) {
        if (!c.dueIso) continue;
        const d = new Date(c.dueIso + 'T00:00:00');
        if (d.getFullYear() !== year || d.getMonth() !== month) continue;
        add(d.getDate(), {
          card: `${c.displayName} ${c.product}`.trim(),
          note: c.dueShort,
          amount: c.balanceText,
          min: c.minText,
          due: true,
        });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, unpaid, lang, month, year]);

  const dayEvents = eventsByDay[selectedDay] ?? [];
  const isToday = isCurrentMonth && selectedDay === today.getDate();
  const selectedDateLabel = new Date(year, month, selectedDay).toLocaleDateString(
    lang === 'es' ? 'es-PA' : 'en-US',
    { day: 'numeric', month: 'long' },
  );

  const firstUnpaid = unpaid[0];
  const previewTitle = isDemo
    ? 'Banco Aliado · due in 3 days'
    : firstUnpaid
      ? `${firstUnpaid.displayName} · ${firstUnpaid.dueShort}`
      : lang === 'es'
        ? 'No tienes pagos pendientes'
        : "You're all caught up";
  const previewBody = isDemo
    ? `US$ 3,420.10 full · US$ 171.01 minimum · reminders ${reminder ? 'On' : 'Off'}`
    : firstUnpaid
      ? `${firstUnpaid.balanceText} · ${lang === 'es' ? 'mínimo' : 'min'} ${firstUnpaid.minText} · reminders ${reminder ? 'On' : 'Off'}`
      : `reminders ${reminder ? 'On' : 'Off'}`;

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
          <Text style={styles.sub}>{monthDueText}</Text>

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
                const due = eventsByDay[n]?.length > 0;
                const sel = selectedDay === n;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setSelectedDay(n)}
                    style={[
                      styles.cell,
                      styles.dayCell,
                      { backgroundColor: sel ? colors.tint2 : due ? colors.line2 : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.dayNum, { color: sel ? colors.onTint2 : due ? colors.ink : colors.ink3 }]}>
                      {n}
                    </Text>
                    <View
                      style={[
                        styles.dayDot,
                        { backgroundColor: due ? (sel ? colors.onTint2 : colors.accentInk2) : 'transparent' },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isToday ? (lang === 'es' ? 'Hoy' : 'Today') : selectedDateLabel}
          </Text>
          {dayEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {lang === 'es' ? 'No hay pagos este día.' : 'No payments this day.'}
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 10, gap: 8 }}>
              {dayEvents.map((u, i) => (
                <View key={i} style={styles.upRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.upCard} numberOfLines={1}>
                      {u.card}
                    </Text>
                    <Text style={[styles.upNote, { color: u.due ? colors.accentInk : colors.ink2 }]} numberOfLines={1}>
                      {u.note}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.upAmount}>{u.amount}</Text>
                    <Text style={styles.upMin}>
                      {t.minWord.toLowerCase()} {u.min}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.reminderCard}>
            <View style={styles.reminderTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>{t.reminders}</Text>
                <Text style={styles.reminderSub}>{t.remindersSub}</Text>
              </View>
              <Pressable
                onPress={toggleReminder}
                style={[styles.switchTrack, { backgroundColor: reminder ? colors.tint2 : colors.line2 }]}
              >
                <View
                  style={[
                    styles.switchKnob,
                    { left: reminder ? 20 : 2, backgroundColor: reminder ? colors.onArt : colors.ink3 },
                  ]}
                />
              </Pressable>
            </View>
            <View style={styles.previewCard}>
              <Text style={styles.previewKicker}>{t.notifPreview.toUpperCase()}</Text>
              <Text style={styles.previewTitle}>{previewTitle}</Text>
              <Text style={styles.previewBody}>{previewBody}</Text>
            </View>
          </View>
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
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
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
    dayCell: { borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3 },
    dayNum: { fontSize: 12, fontWeight: '500' },
    dayDot: { width: 4, height: 4, borderRadius: 2 },
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
    reminderCard: {
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    reminderTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    reminderTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
    reminderSub: { fontSize: 11.5, color: colors.ink2, marginTop: 5 },
    switchTrack: { width: 44, height: 26, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
    switchKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 999 },
    previewCard: {
      marginTop: 14,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    previewKicker: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1 },
    previewTitle: { fontSize: 12.5, fontWeight: '500', color: colors.ink, marginTop: 8 },
    previewBody: { fontSize: 11.5, color: colors.ink2, marginTop: 3 },
  });
}
