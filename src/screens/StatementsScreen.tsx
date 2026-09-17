import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';

type UploadStage = 'idle' | 'parsing' | 'review';

const INBOX = 'w.monasterios.7f3a@in.cardsmanager.app';

const PARSE_STEPS: Record<'en' | 'es', { label: string; mark: string; done: boolean }[]> = {
  en: [
    { label: 'Statement read · 4 pages', mark: '✓', done: true },
    { label: 'Bank recognised · Banco Aliado', mark: '✓', done: true },
    { label: 'Extracting balances and dates', mark: '·', done: false },
    { label: 'Matching transactions to categories', mark: '·', done: false },
  ],
  es: [
    { label: 'Estado de cuenta leído · 4 páginas', mark: '✓', done: true },
    { label: 'Banco reconocido · Banco Aliado', mark: '✓', done: true },
    { label: 'Extrayendo saldos y fechas', mark: '·', done: false },
    { label: 'Clasificando transacciones', mark: '·', done: false },
  ],
};

const PARSED_FIELDS: Record<'en' | 'es', { label: string; value: string; ok: boolean }[]> = {
  en: [
    { label: 'Statement balance', value: 'US$ 3,420.10', ok: true },
    { label: 'Minimum payment', value: 'US$ 171.01', ok: true },
    { label: 'Full payment due', value: '18 Sep 2026', ok: true },
    { label: 'Statement cut-off', value: '30 Aug 2026', ok: true },
    { label: 'Credit limit', value: 'US$ 12,000.00', ok: true },
    { label: 'Instalment purchases', value: '2 found', ok: false },
  ],
  es: [
    { label: 'Saldo del estado', value: 'US$ 3,420.10', ok: true },
    { label: 'Pago mínimo', value: 'US$ 171.01', ok: true },
    { label: 'Pago de contado', value: '18 sep 2026', ok: true },
    { label: 'Fecha de corte', value: '30 ago 2026', ok: true },
    { label: 'Límite de crédito', value: 'US$ 12,000.00', ok: true },
    { label: 'Compras a cuotas', value: '2 encontradas', ok: false },
  ],
};

const STATEMENT_HISTORY: Record<
  'en' | 'es',
  { title: string; sub: string; status: string; accent: boolean; needsReview?: boolean }[]
> = {
  en: [
    { title: 'Banco Aliado · August', sub: 'New layout · we could not read it', status: 'Needs review', accent: true, needsReview: true },
    { title: 'Banco Aliado · September', sub: 'Forwarded by email · 2 min ago', status: 'New', accent: true },
    { title: 'BAC · September', sub: 'Uploaded PDF · 5 Sep', status: 'Applied', accent: false },
    { title: 'Davibank · September', sub: 'Forwarded by email · 8 Sep', status: 'Applied', accent: false },
    { title: 'BAC Platinum · August', sub: 'Uploaded PDF · 6 Aug', status: 'Applied', accent: false },
  ],
  es: [
    { title: 'Banco Aliado · agosto', sub: 'Formato nuevo · no pudimos leerlo', status: 'Revisar', accent: true, needsReview: true },
    { title: 'Banco Aliado · septiembre', sub: 'Reenviado por correo · hace 2 min', status: 'Nuevo', accent: true },
    { title: 'BAC · septiembre', sub: 'PDF subido · 5 sep', status: 'Aplicado', accent: false },
    { title: 'Davibank · septiembre', sub: 'Reenviado por correo · 8 sep', status: 'Aplicado', accent: false },
    { title: 'BAC Platinum · agosto', sub: 'PDF subido · 6 ago', status: 'Aplicado', accent: false },
  ],
};

export function StatementsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDemo } = useCards();
  const [stage, setStage] = useState<UploadStage>('idle');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!isDemo) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.top}>
            <Text style={[styles.title, { marginTop: 0 }]}>
              {lang === 'es' ? 'Estados de cuenta' : 'Statements'}
            </Text>
            <Text style={styles.sub}>
              {lang === 'es'
                ? 'Todavía no podemos leer tus estados de cuenta automáticamente. Por ahora, agrega o actualiza tus tarjetas a mano.'
                : "We can't read your statements automatically yet. For now, add or update your cards by hand."}
            </Text>
          </View>
          <View style={styles.section}>
            <View style={styles.uploadBtn}>
              <Text style={styles.uploadBtnTitle}>
                {lang === 'es' ? 'Próximamente' : 'Coming soon'}
              </Text>
              <Text style={styles.uploadBtnBody}>
                {lang === 'es'
                  ? 'La carga de PDF y el correo dedicado llegarán con el parseo real de estados de cuenta.'
                  : 'PDF upload and a dedicated inbox arrive with real statement parsing.'}
              </Text>
            </View>
            <Pressable onPress={() => navigation.navigate('AddCard')} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{lang === 'es' ? 'Agregar una tarjeta' : 'Add a card'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const startParse = () => {
    setStage('parsing');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage('review'), 1500);
  };

  const copyInbox = async () => {
    await Clipboard.setStringAsync(INBOX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2600);
  };

  const confirmParse = () => {
    setStage('idle');
    Alert.alert(
      lang === 'es' ? 'Banco Aliado actualizado con el estado de septiembre' : 'Banco Aliado updated from the September statement',
    );
    navigation.navigate('CardDetail', { cardId: 'aliado' });
  };

  const title =
    stage === 'review' ? (lang === 'es' ? 'Revisa lo que leímos' : 'Check what we read')
      : stage === 'parsing' ? (lang === 'es' ? 'Leyendo tu estado de cuenta' : 'Reading your statement')
        : (lang === 'es' ? 'Agregar un estado de cuenta' : 'Add a statement');
  const sub =
    stage === 'review'
      ? (lang === 'es' ? 'Estos valores salen del PDF. Confirma y la tarjeta se actualiza.' : 'These values come straight from the PDF. Confirm and the card updates.')
      : stage === 'parsing'
        ? (lang === 'es' ? 'Suele tardar menos de diez segundos. Puedes salir de esta pantalla.' : 'Usually under ten seconds. You can leave this screen.')
        : (lang === 'es' ? 'Dos caminos: envías el PDF, o el correo del banco lo hace por ti.' : 'Two ways in: send the PDF yourself, or let the bank email do it for you.');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          {stage !== 'idle' && <BackButton onPress={() => setStage('idle')} />}
          <Text style={[styles.title, stage === 'idle' && { marginTop: 0 }]}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>

        {stage === 'idle' && (
          <View style={styles.section}>
            <Pressable onPress={startParse} style={styles.uploadBtn}>
              <Text style={styles.uploadBtnTitle}>{t.uploadPdf}</Text>
              <Text style={styles.uploadBtnBody}>{t.uploadBody}</Text>
            </Pressable>

            <View style={styles.emailCard}>
              <Text style={styles.emailTitle}>{t.forward}</Text>
              <Text style={styles.emailBody}>{t.emailBody}</Text>
              <View style={styles.inboxRow}>
                <Text style={styles.inboxText} numberOfLines={1}>
                  {INBOX}
                </Text>
                <Pressable onPress={copyInbox} style={styles.copyBtn}>
                  <Text style={styles.copyBtnText}>{copied ? t.copied : t.copy}</Text>
                </Pressable>
              </View>
              <Text style={styles.sendersNote}>{t.senders}: BAC, Banco Aliado, Davibank</Text>
            </View>

            <Text style={styles.historyTitle}>{t.stmtHistory}</Text>
            <View style={styles.listCard}>
              {STATEMENT_HISTORY[lang].map((s) => (
                <Pressable
                  key={s.title}
                  disabled={!s.needsReview}
                  onPress={() => s.needsReview && navigation.navigate('Fix')}
                  style={styles.historyRow}
                >
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>PDF</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.historyRowTitle} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text style={styles.historyRowSub} numberOfLines={1}>
                      {s.sub}
                    </Text>
                  </View>
                  <Text style={[styles.historyStatus, { color: s.accent ? colors.accentInk2 : colors.ink2 }]}>
                    {s.status}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {stage === 'parsing' && (
          <View style={[styles.section, { gap: 10 }]}>
            {PARSE_STEPS[lang].map((p) => (
              <View key={p.label} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepMark,
                    { borderColor: p.done ? colors.accentLine : colors.line },
                  ]}
                >
                  <Text style={[styles.stepMarkText, { color: p.done ? colors.accentInk : colors.ink2 }]}>
                    {p.mark}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: p.done ? colors.accentInk : colors.ink2 }]}>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {stage === 'review' && (
          <View style={styles.section}>
            <View style={styles.matchBanner}>
              <View style={styles.matchThumb} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.matchTitle}>Banco Aliado · Visa Infinite</Text>
                <Text style={styles.matchSub}>Matched by last 4 digits · 1675</Text>
              </View>
            </View>

            <View style={styles.listCard}>
              {PARSED_FIELDS[lang].map((f) => (
                <View key={f.label} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <View style={styles.fieldValueRow}>
                    <Text style={styles.fieldValue}>{f.value}</Text>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: f.ok ? colors.tint : colors.line },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: f.ok ? colors.accentInk : colors.tintInk2 }]}>
                        {f.ok ? (lang === 'es' ? 'Leído' : 'Parsed') : (lang === 'es' ? 'Revisar' : 'Check')}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.tapNote}>{t.tapCorrect}</Text>
            <View style={styles.reviewActions}>
              <Pressable onPress={confirmParse} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>{t.saveToCard}</Text>
              </Pressable>
              <Pressable onPress={() => setStage('idle')} style={styles.discardBtn}>
                <Text style={styles.discardBtnText}>{t.discard}</Text>
              </Pressable>
            </View>
          </View>
        )}
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
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18, maxWidth: 320 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    uploadBtn: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.accentLine,
      borderRadius: radius.xl,
      backgroundColor: colors.surface2,
      padding: 22,
    },
    uploadBtnTitle: { fontSize: 15, fontWeight: '500', color: colors.accentInk },
    uploadBtnBody: { fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
    emailCard: {
      marginTop: 12,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emailTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
    emailBody: { fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
    inboxRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 11,
      borderRadius: radius.md - 2,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    inboxText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.accentInk },
    copyBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    copyBtnText: { fontSize: 11, fontWeight: '500', color: colors.accent },
    sendersNote: { fontSize: 11, color: colors.ink3, marginTop: 10 },
    historyTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, marginTop: 22 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    historyRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    historyBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm + 1,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyBadgeText: { fontSize: 10, fontWeight: '600', color: colors.accentInk },
    historyRowTitle: { fontSize: 13, fontWeight: '500', color: colors.ink },
    historyRowSub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
    historyStatus: { fontSize: 11, fontWeight: '500' },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stepMark: {
      width: 22,
      height: 22,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepMarkText: { fontSize: 11, fontWeight: '600' },
    stepLabel: { fontSize: 13 },
    matchBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    matchThumb: { width: 46, height: 30, borderRadius: 5, backgroundColor: '#2e4a7d' },
    matchTitle: { fontSize: 13, fontWeight: '500', color: colors.onArt },
    matchSub: { fontSize: 11, color: colors.accentInk, marginTop: 3 },
    fieldRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    fieldLabel: { fontSize: 12.5, color: colors.ink2b, flexShrink: 1 },
    fieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    chip: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 999 },
    chipText: { fontSize: 9.5, fontWeight: '500' },
    tapNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10, lineHeight: 16 },
    reviewActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
    saveBtn: {
      flex: 1,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.accent },
    discardBtn: {
      paddingVertical: 13,
      paddingHorizontal: 15,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    discardBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
  });
}
