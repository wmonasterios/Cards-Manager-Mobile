import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { SheetFrame } from '../components/SheetFrame';

type Props = NativeStackScreenProps<RootStackParamList, 'DemoExit'>;

// Opened from the demo ribbon's "Exit" and the Home "Create account" prompt.
const COPY = {
  es: {
    title: '¿Listo para ver tus tarjetas?',
    body: 'Al crear tu cuenta, la demo desaparece y empiezas desde cero, solo con tu información.',
    steps: ['Crea tu cuenta con correo, Google o Apple', 'Sube o reenvía el PDF de tu banco', 'Poquet lo lee y ordena tus tarjetas'],
    create: 'Crear mi cuenta',
    keep: 'Seguir explorando la demo',
    haveAccount: '¿Ya tienes cuenta?',
    signIn: 'Inicia sesión',
  },
  en: {
    title: 'Ready to see your own cards?',
    body: 'Once you create your account, the demo goes away and you start fresh with only your information.',
    steps: ['Create your account with email, Google or Apple', "Upload or forward your bank's PDF", 'Poquet reads it and sorts your cards'],
    create: 'Create my account',
    keep: 'Keep exploring the demo',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
  },
};

export function DemoExitScreen({ navigation }: Props) {
  const { lang } = useLocale();
  const c = COPY[lang];
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SheetFrame onDismiss={() => navigation.goBack()}>
      <Text style={styles.title}>{c.title}</Text>
      <Text style={styles.body}>{c.body}</Text>

      <View style={{ marginTop: 20, gap: 12 }}>
        {c.steps.map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => navigation.replace('Auth', { fromOnboarding: true, mode: 'signup' })}
        style={styles.primaryBtn}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>{c.create}</Text>
      </Pressable>
      <Pressable onPress={() => navigation.goBack()} style={styles.secondaryBtn} accessibilityRole="button">
        <Text style={styles.secondaryBtnText}>{c.keep}</Text>
      </Pressable>
      <View style={styles.signInRow}>
        <Text style={styles.signInText}>{c.haveAccount} </Text>
        <Pressable
          onPress={() => navigation.replace('Auth', { fromOnboarding: true, mode: 'signin' })}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={styles.signInLink}>{c.signIn}</Text>
        </Pressable>
      </View>
    </SheetFrame>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    title: { marginTop: 22, fontSize: 26, lineHeight: 30, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.3 },
    body: { marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.ink2 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
    stepNumText: { fontSize: 13, fontWeight: '700', color: colors.ink },
    stepText: { flex: 1, fontSize: 15, color: colors.ink },
    primaryBtn: { marginTop: 26, height: 56, borderRadius: radius.xl, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: colors.onTint2, fontSize: 16, fontWeight: '700' },
    secondaryBtn: { marginTop: 6, height: 48, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { fontSize: 15, fontWeight: '600', color: colors.ink2 },
    signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    signInText: { fontSize: 14, color: colors.ink3 },
    signInLink: { fontSize: 14, fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' },
  });
}
