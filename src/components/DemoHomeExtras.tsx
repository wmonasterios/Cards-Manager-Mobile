import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ColorTokens, fonts, radius } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { DEMO_PERSONA } from '../demo';

// Floating prompt at the bottom of Home while in the demo.
export function DemoCta({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang } = useLocale();
  const es = lang === 'es';
  return (
    <View style={styles.cta} pointerEvents="box-none">
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.ctaTitle}>{es ? 'Así se verían tus tarjetas' : 'This is how your cards would look'}</Text>
        <Text style={styles.ctaSub}>{es ? 'Crea tu cuenta y sube tu primer estado' : 'Create your account and add a statement'}</Text>
      </View>
      <Pressable onPress={onPress} style={styles.ctaBtn} accessibilityRole="button">
        <Text style={styles.ctaBtnText}>{es ? 'Crear cuenta' : 'Sign up'}</Text>
      </Pressable>
    </View>
  );
}

const TOUR = {
  es: [
    { title: 'Cuánto debes, de un vistazo', body: `Poquet suma lo que debes en todas tus tarjetas. Aquí ves las de ${DEMO_PERSONA}; con tu cuenta verás las tuyas.` },
    { title: 'Qué vence primero', body: 'Los anillos de «Necesita atención» cuentan los días que faltan para pagar cada tarjeta. Tócalos para ver el detalle.' },
    { title: 'Tus estados de cuenta', body: 'En la pestaña Estados subes el PDF del banco o lo reenvías por correo. Poquet lo lee y actualiza la tarjeta sola.' },
  ],
  en: [
    { title: 'What you owe, at a glance', body: `Poquet adds up what you owe across all your cards. Here you see ${DEMO_PERSONA}'s; with your account you'll see yours.` },
    { title: "What's due first", body: 'The rings under “Needs attention” count the days left to pay each card. Tap one for the details.' },
    { title: 'Your statements', body: "In the Statements tab you upload your bank's PDF or forward it by email. Poquet reads it and updates the card for you." },
  ],
};

// Three-step tour shown once, right after entering the demo. Skippable.
export function DemoTour({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang } = useLocale();
  const steps = TOUR[lang];
  const [i, setI] = useState(0);
  const es = lang === 'es';
  const last = i === steps.length - 1;
  return (
    <View style={styles.tourRoot}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel={es ? 'Cerrar tour' : 'Close tour'} />
      <View style={styles.tourCard}>
        <Text style={styles.tourCount}>
          {i + 1} {es ? 'de' : 'of'} {steps.length}
        </Text>
        <Text style={styles.tourTitle}>{steps[i].title}</Text>
        <Text style={styles.tourBody}>{steps[i].body}</Text>
        <View style={styles.tourFooter}>
          {steps.map((_, k) => (
            <View key={k} style={[styles.tourDot, k === i && styles.tourDotActive]} />
          ))}
          <View style={{ flex: 1 }} />
          {!last && (
            <Pressable onPress={onDone} style={styles.tourSkip} accessibilityRole="button">
              <Text style={styles.tourSkipText}>{es ? 'Saltar tour' : 'Skip tour'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => (last ? onDone() : setI(i + 1))} style={styles.tourNext} accessibilityRole="button">
            <Text style={styles.tourNextText}>{last ? (es ? 'Listo' : 'Done') : es ? 'Siguiente' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    cta: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 12,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    ctaTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
    ctaSub: { fontSize: 12.5, color: colors.ink3, marginTop: 2 },
    ctaBtn: { height: 44, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.accent, justifyContent: 'center' },
    ctaBtnText: { fontSize: 14, fontWeight: '700', color: colors.onTint2 },

    tourRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,7,15,0.62)', justifyContent: 'flex-end', padding: 16, paddingBottom: 28 },
    tourCard: { backgroundColor: '#F4F5FA', borderRadius: 20, padding: 18, paddingBottom: 12 },
    tourCount: { fontSize: 12.5, fontWeight: '700', color: '#474645' },
    tourTitle: { marginTop: 6, fontSize: 21, lineHeight: 25, fontFamily: fonts.display, color: '#121212' },
    tourBody: { marginTop: 6, fontSize: 14.5, lineHeight: 21, color: '#343433' },
    tourFooter: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
    tourDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9C6C0' },
    tourDotActive: { width: 18, backgroundColor: '#121212' },
    tourSkip: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
    tourSkipText: { fontSize: 14, fontWeight: '600', color: '#474645' },
    tourNext: { height: 44, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#121212', justifyContent: 'center' },
    tourNextText: { fontSize: 14, fontWeight: '700', color: '#FBFAF9' },
  });
}
