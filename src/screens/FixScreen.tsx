import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Fix'>;

const FIX_FIELDS: Record<'en' | 'es', string[]> = {
  en: ['Statement balance', 'Minimum payment', 'Full payment due', 'Cut-off date', 'Credit limit'],
  es: ['Saldo del estado', 'Pago mínimo', 'Pago de contado', 'Fecha de corte', 'Límite de crédito'],
};

const FIX_LINES = [
  'FECHA DE CORTE 30/08/26',
  'LIMITE DE CREDITO $12,000.00',
  'SALDO AL CORTE $3,420.10',
  'PAGAR ANTES DE 18/09/26',
  'PAGO MINIMO $171.01',
  'CREDITO DISPONIBLE $8,579.90',
];

export function FixScreen({ navigation }: Props) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fields = FIX_FIELDS[lang];
  const [activeField, setActiveField] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});

  const pickLine = (line: string) => {
    const match = line.match(/[\d.,/]+$/);
    const value = match ? match[0] : line;
    setValues((prev) => ({ ...prev, [fields[activeField]]: value }));
    setActiveField((i) => Math.min(i + 1, fields.length - 1));
  };

  const mappedCount = Object.keys(values).length;

  const saveFix = () => {
    Alert.alert(
      lang === 'es'
        ? 'Regla guardada para Banco Aliado · el próximo mes se lee solo'
        : 'Rule saved for Banco Aliado · next month it reads itself',
    );
    navigation.navigate('Tabs', { screen: 'Statements' });
  };

  const sendSample = () => {
    Alert.alert(lang === 'es' ? 'Muestra enviada sin datos sensibles' : 'Redacted sample sent to support');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t.fixParser}</Text>
          <Text style={styles.sub}>{t.fixSub}</Text>

          <View style={styles.chipRow}>
            {fields.map((label, i) => {
              const active = i === activeField;
              return (
                <Pressable
                  key={label}
                  onPress={() => setActiveField(i)}
                  style={[styles.chip, active && { backgroundColor: colors.tint2, borderColor: colors.tint2 }]}
                >
                  <Text style={[styles.chipText, active && { color: colors.onTint2 }]}>
                    {label} · {values[label] ?? (lang === 'es' ? 'sin asignar' : 'unassigned')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.mapNote}>
            {mappedCount} / {fields.length} {lang === 'es' ? 'campos asignados' : 'fields mapped'}
          </Text>

          <View style={styles.linesCard}>
            {FIX_LINES.map((line) => (
              <Pressable key={line} onPress={() => pickLine(line)} style={styles.lineRow}>
                <Text style={styles.lineText}>{line}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={saveFix} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{t.saveRule}</Text>
          </Pressable>
          <Pressable onPress={sendSample} style={styles.sendSampleBtn}>
            <Text style={styles.sendSampleBtnText}>{t.sendSample}</Text>
          </Pressable>
          <View style={styles.noteCard}>
            <Text style={styles.noteCardText}>{t.fixNoteLong}</Text>
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
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, maxWidth: 340 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
    chip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 999 },
    chipText: { fontSize: 11, fontWeight: '500', color: colors.ink2 },
    mapNote: { fontSize: 11.5, color: colors.ink3, marginTop: 12 },
    linesCard: {
      marginTop: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
      overflow: 'hidden',
    },
    lineRow: { borderTopWidth: 1, borderTopColor: colors.hair, paddingVertical: 11, paddingHorizontal: 13 },
    lineText: { fontSize: 11.5, color: colors.ink2b, fontFamily: 'monospace' },
    saveBtn: {
      marginTop: 14,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
    sendSampleBtn: {
      marginTop: 8,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    sendSampleBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },
    noteCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    noteCardText: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
  });
}
