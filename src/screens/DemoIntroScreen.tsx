import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { radius, ColorTokens, fonts, VIVID } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { SheetFrame } from '../components/SheetFrame';
import { enterApp } from '../navigation/navigationRef';
import { DEMO_PERSONA } from '../demo';

type Props = NativeStackScreenProps<RootStackParamList, 'DemoIntro'>;

// Shown before entering the demo, so nobody mistakes the sample account for
// their own data (or a bug showing someone else's).
const COPY = {
  es: {
    badge: 'MODO DEMO',
    title: `Vas a ver la cuenta de ${DEMO_PERSONA}, una usuaria de ejemplo`,
    body: 'Sus tarjetas, pagos y gastos son inventados. No es tu información ni la de nadie real.',
    rows: [
      { icon: 'document-text-outline', title: 'Datos de ejemplo', sub: 'Los bancos son reales; los montos y movimientos, no.' },
      { icon: 'checkbox-outline', title: 'Toca todo sin miedo', sub: 'Nada de lo que hagas aquí se guarda.' },
      { icon: 'exit-outline', title: 'Sales cuando quieras', sub: 'Con «Salir» en la franja amarilla de arriba.' },
    ],
    explore: 'Explorar la demo',
    create: 'Mejor crear mi cuenta',
  },
  en: {
    badge: 'DEMO MODE',
    title: `You're about to see ${DEMO_PERSONA}'s account, a sample user`,
    body: "Her cards, payments and spending are made up. It's not your information, or anyone real's.",
    rows: [
      { icon: 'document-text-outline', title: 'Sample data', sub: 'The banks are real; the amounts and transactions are not.' },
      { icon: 'checkbox-outline', title: 'Tap anything', sub: 'Nothing you do here is saved.' },
      { icon: 'exit-outline', title: 'Leave anytime', sub: 'With “Exit” on the yellow bar at the top.' },
    ],
    explore: 'Explore the demo',
    create: "I'd rather create my account",
  },
} as const;

export function DemoIntroScreen({ navigation }: Props) {
  const { lang } = useLocale();
  const c = COPY[lang];
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SheetFrame onDismiss={() => navigation.goBack()}>
      <View style={styles.badgeRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{DEMO_PERSONA[0]}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{c.badge}</Text>
        </View>
      </View>

      <Text style={styles.title}>{c.title}</Text>
      <Text style={styles.body}>{c.body}</Text>

      <View style={{ marginTop: 22, gap: 16 }}>
        {c.rows.map((r) => (
          <View key={r.title} style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name={r.icon as any} size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>{r.title}</Text>
              <Text style={styles.rowSub}>{r.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={() => enterApp('Home', true)} style={styles.primaryBtn} accessibilityRole="button">
        <Text style={styles.primaryBtnText}>{c.explore}</Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.replace('Auth', { fromOnboarding: true, mode: 'signup' })}
        style={styles.secondaryBtn}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryBtnText}>{c.create}</Text>
      </Pressable>
    </SheetFrame>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    badgeRow: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: VIVID.honey, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 22, fontFamily: fonts.display, color: '#121212' },
    badge: { height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: VIVID.honey, justifyContent: 'center' },
    badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: '#121212' },
    title: { marginTop: 18, fontSize: 26, lineHeight: 30, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.3 },
    body: { marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.ink2 },
    row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
    rowSub: { fontSize: 13.5, lineHeight: 19, color: colors.ink3, marginTop: 2 },
    primaryBtn: { marginTop: 28, height: 56, borderRadius: radius.xl, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: colors.onTint2, fontSize: 16, fontWeight: '700' },
    secondaryBtn: { marginTop: 6, height: 48, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { fontSize: 15, fontWeight: '600', color: colors.ink2 },
  });
}
