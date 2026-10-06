import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { radius, ColorTokens, fonts, VIVID } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useAppSettings } from '../context/AppSettingsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// Welcome screen — the root whenever nobody is signed in (first launch, after
// signing out, after deleting the account). Three explicit paths: start with
// your own cards, see a clearly-labelled demo, or sign in. The demo used to
// sit behind a vague "Skip for now" that dropped people into sample data
// that looked like a real account.
const COPY = {
  es: {
    title: 'Todas tus tarjetas, en un solo bolsillo.',
    sub: 'Sube o reenvía el estado de cuenta de tu banco y Poquet lo ordena por ti.',
    cardLabel: 'Tu banco',
    start: 'Empezar con mis tarjetas',
    demoTitle: 'Ver cómo funciona',
    demoSub: 'Con una cuenta de ejemplo, sin registrarte',
    haveAccount: '¿Ya tienes cuenta?',
    signIn: 'Inicia sesión',
  },
  en: {
    title: 'All your cards, in one pocket.',
    sub: 'Upload or forward your bank statement and Poquet sorts it out for you.',
    cardLabel: 'Your bank',
    start: 'Start with my cards',
    demoTitle: 'See how it works',
    demoSub: 'With a sample account, no sign-up needed',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
  },
};

export function OnboardingScreen({ navigation }: Props) {
  const { lang } = useLocale();
  const c = COPY[lang];
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { completeOnboarding } = useAppSettings();

  const start = () => {
    completeOnboarding();
    navigation.navigate('Auth', { fromOnboarding: true, mode: 'signup' });
  };
  const signIn = () => {
    completeOnboarding();
    navigation.navigate('Auth', { fromOnboarding: true, mode: 'signin' });
  };
  const demo = () => {
    completeOnboarding();
    navigation.navigate('DemoIntro');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.brand}>Poquet</Text>
        </View>

        <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.artCard, { top: 0, left: 18, right: 18, backgroundColor: VIVID.sky }]} />
          <View style={[styles.artCard, { top: 28, left: 9, right: 9, backgroundColor: VIVID.coral }]} />
          <View style={[styles.artCard, styles.artFront, { top: 56, left: 0, right: 0, backgroundColor: VIVID.green }]}>
            <Text style={styles.artText}>{c.cardLabel}</Text>
            <Text style={styles.artText}>US$ ···</Text>
          </View>
        </View>

        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.sub}>{c.sub}</Text>

        <View style={{ flex: 1, minHeight: 28 }} />

        <Pressable onPress={start} style={styles.primaryBtn} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>{c.start}</Text>
        </Pressable>

        <Pressable onPress={demo} style={styles.demoBtn} accessibilityRole="button">
          <View style={styles.demoIcon}>
            <Ionicons name="eye-outline" size={20} color="#121212" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.demoTitle}>{c.demoTitle}</Text>
            <Text style={styles.demoSub}>{c.demoSub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
        </Pressable>

        <View style={styles.signInRow}>
          <Text style={styles.signInText}>{c.haveAccount} </Text>
          <Pressable onPress={signIn} hitSlop={10} accessibilityRole="button">
            <Text style={styles.signInLink}>{c.signIn}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { flexGrow: 1, paddingTop: 20, paddingHorizontal: 24, paddingBottom: 20 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 36, height: 36, borderRadius: 10 },
    brand: { fontSize: 20, fontFamily: fonts.display, color: colors.ink },
    art: { marginTop: 36, height: 148 },
    artCard: { position: 'absolute', height: 92, borderRadius: 18 },
    artFront: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 },
    artText: { fontSize: 15, fontWeight: '700', color: '#121212' },
    title: { marginTop: 32, fontSize: 34, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.4, lineHeight: 38 },
    sub: { fontSize: 15, color: colors.ink2, marginTop: 12, lineHeight: 22 },
    primaryBtn: { height: 56, borderRadius: radius.xl, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { color: colors.onTint2, fontSize: 16, fontWeight: '700' },
    demoBtn: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    demoIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: VIVID.honey, alignItems: 'center', justifyContent: 'center' },
    demoTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
    demoSub: { fontSize: 13, color: colors.ink3, marginTop: 2 },
    signInRow: { marginTop: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    signInText: { fontSize: 14, color: colors.ink3 },
    signInLink: { fontSize: 14, fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' },
  });
}
