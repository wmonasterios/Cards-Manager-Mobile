import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useAppSettings } from '../context/AppSettingsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const STEPS: Record<'en' | 'es', { n: string; title: string; body: string }[]> = {
  en: [
    { n: '1', title: 'Add your first statement', body: 'Upload the PDF your bank sends, or forward the email. No bank passwords, no Open Banking.' },
    { n: '2', title: 'We read the numbers', body: 'Balance, minimum payment, due date, cut-off, credit limit and instalment purchases — BAC, Banco Aliado and Davibank.' },
    { n: '3', title: 'Every card in one place', body: 'One home with all your cards, what you owe and what is due first. Reminders three days before each due date.' },
  ],
  es: [
    { n: '1', title: 'Agrega tu primer estado de cuenta', body: 'Sube el PDF que te manda el banco, o reenvía el correo. Sin claves del banco, sin Open Banking.' },
    { n: '2', title: 'Leemos los números', body: 'Saldo, pago mínimo, fecha de pago, corte, límite y compras a cuotas — BAC, Banco Aliado y Davibank.' },
    { n: '3', title: 'Todas tus tarjetas en un lugar', body: 'Un home con todas las tarjetas, cuánto debes y qué vence primero. Recordatorios tres días antes.' },
  ],
};

export function OnboardingScreen({ navigation }: Props) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { completeOnboarding } = useAppSettings();

  const start = () => {
    completeOnboarding();
    navigation.replace('Tabs', { screen: 'Statements' });
  };

  const skip = () => {
    completeOnboarding();
    navigation.replace('Tabs');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>{t.firstRun.toUpperCase()}</Text>
        <Text style={styles.title}>{t.onbTitle}</Text>
        <Text style={styles.sub}>{t.onbSub}</Text>

        <View style={{ marginTop: 28, gap: 10 }}>
          {STEPS[lang].map((s) => (
            <View key={s.n} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{s.n}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable onPress={start} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t.addFirst}</Text>
        </Pressable>
        <Pressable onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>{t.skip}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingTop: 24, paddingHorizontal: 24, paddingBottom: 40 },
    kicker: { fontSize: 11, fontWeight: '500', letterSpacing: 1.4, color: colors.ink3 },
    title: { fontSize: 32, fontWeight: '500', color: colors.ink, marginTop: 14, letterSpacing: -0.4, lineHeight: 38 },
    sub: { fontSize: 13, color: colors.ink2, marginTop: 12, lineHeight: 20, maxWidth: 320 },
    stepRow: {
      flexDirection: 'row',
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stepNum: {
      width: 24,
      height: 24,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.accentLine,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { fontSize: 11, fontWeight: '600', color: colors.accentInk },
    stepTitle: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
    stepBody: { fontSize: 11.5, color: colors.ink2, marginTop: 5, lineHeight: 17 },
    primaryBtn: {
      marginTop: 22,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    primaryBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
    skipBtn: { marginTop: 8, padding: 12, borderRadius: radius.md, alignItems: 'center' },
    skipBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.ink2 },
  });
}
