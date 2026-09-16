import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { money } from '../format';

const DUE_DAYS: Record<number, string> = { 18: 'aliado', 22: 'bac2', 25: 'bac' };
const DAYS_IN_MONTH = 30;
const FIRST_WEEKDAY = (new Date(2026, 8, 1).getDay() + 6) % 7; // Monday-first index

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

export function CalendarScreen() {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards } = useCards();
  const { reminder, toggleReminder } = useAppSettings();
  const [selectedDay, setSelectedDay] = useState(25);

  const unpaid = cards.filter((c) => !c.paid);
  const usdTotal = unpaid.reduce((n, c) => n + c.remaining, 0);
  const monthDueText = `${unpaid.length} ${lang === 'es' ? 'pagos' : 'payments'} · ${money('US$', usdTotal)} ${lang === 'es' ? 'en total' : 'total'}`;

  const cells: (number | null)[] = [
    ...Array(FIRST_WEEKDAY).fill(null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <Text style={styles.title}>{t.calendarTitle}</Text>
          <Text style={styles.sub}>
            {lang === 'es' ? 'Septiembre 2026' : 'September 2026'} · {monthDueText}
          </Text>

          <View style={styles.calendarCard}>
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
                const due = DUE_DAYS[n];
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
          <Text style={styles.sectionTitle}>{t.upcoming}</Text>
          <View style={{ marginTop: 10, gap: 8 }}>
            {UPCOMING[lang].map((u, i) => (
              <View key={i} style={styles.upRow}>
                <View style={styles.upDateCol}>
                  <Text style={styles.upDay}>{u.day}</Text>
                  <Text style={styles.upMon}>{u.mon}</Text>
                </View>
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
                    { left: reminder ? 20 : 2, backgroundColor: reminder ? colors.onTint2 : colors.ink3 },
                  ]}
                />
              </Pressable>
            </View>
            <View style={styles.previewCard}>
              <Text style={styles.previewKicker}>{t.notifPreview.toUpperCase()}</Text>
              <Text style={styles.previewTitle}>Banco Aliado · due in 3 days</Text>
              <Text style={styles.previewBody}>
                US$ 3,420.10 full · US$ 171.01 minimum · reminders {reminder ? 'On' : 'Off'}
              </Text>
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
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8 },
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
    upDateCol: { width: 44, alignItems: 'center' },
    upDay: { fontSize: 16, fontWeight: '600', color: colors.ink },
    upMon: { fontSize: 10, color: colors.ink3, marginTop: 3 },
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
