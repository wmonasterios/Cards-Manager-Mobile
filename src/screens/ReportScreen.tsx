import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { submitReport, ReportArea } from '../supabase/supportApi';
import { versionLine, platformLabel, osVersion } from '../appVersion';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

const WHERE_OPTS: { key: ReportArea; en: string; es: string }[] = [
  { key: 'parsing', en: 'Statement parsing', es: 'Lectura del PDF' },
  { key: 'balances', en: 'Balances', es: 'Saldos' },
  { key: 'instalments', en: 'Instalments', es: 'Cuotas' },
  { key: 'reminders', en: 'Reminders', es: 'Recordatorios' },
  { key: 'other', en: 'Other', es: 'Otro' },
];

export function ReportScreen({ navigation, route }: Props) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDemo } = useCards();
  const es = lang === 'es';
  // Opened from a statement (its review or detail): the report is about that
  // one, so it defaults to "PDF reading" and to letting us look at it.
  const statementId = route.params?.statementId;
  const source = route.params?.source ?? 'settings';
  const label = route.params?.label;
  const [where, setWhere] = useState<ReportArea>(statementId ? 'parsing' : 'other');
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(!!statementId);
  const [sending, setSending] = useState(false);

  const deviceNote = es
    ? `Se envía con el reporte: ${versionLine(true)}, ${platformLabel()}, ${osVersion()}, español. Nunca números de tarjeta.`
    : `Sent with the report: ${versionLine(false)}, ${platformLabel()}, ${osVersion()}, English. Never card numbers.`;

  const attachLabel = statementId
    ? es ? 'Permitir que revisemos este estado de cuenta' : 'Let us look at this statement'
    : es ? 'Permitir que revisemos mi último estado de cuenta' : 'Let us look at my latest statement';
  const attachSub = es
    ? 'Solo para encontrar el error: lo que leímos y el PDF original. No se comparte con nadie.'
    : 'Only to find the problem: what we read and the original PDF. Never shared with anyone.';

  const canSend = text.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    if (isDemo) {
      Alert.alert(
        es ? 'Estás en el modo demo' : "You're in the demo",
        es ? 'Crea tu cuenta para enviarnos un reporte.' : 'Create your account to send us a report.',
      );
      return;
    }
    setSending(true);
    try {
      await submitReport({ area: where, message: text.trim(), allowReview: attach, statementId, source, lang });
      Alert.alert(
        es ? 'Recibido' : 'Got it',
        es ? 'Gracias. Lo revisamos y te respondemos a tu correo.' : "Thanks. We'll look into it and reply to your email.",
      );
      setText('');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(
        es ? 'No se pudo enviar' : "Couldn't send it",
        e?.message === 'too_many'
          ? es ? 'Ya nos enviaste varios reportes hoy. Escríbenos a support@poquetapp.com.' : "You've sent several reports today. Email us at support@poquetapp.com."
          : es ? 'Revisa tu conexión e inténtalo de nuevo.' : 'Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t.reportBug}</Text>
          <Text style={styles.sub}>{t.reportSub}</Text>
          {!!label && (
            <View style={styles.aboutCard}>
              <Text style={styles.aboutKicker}>{es ? 'SOBRE ESTE ESTADO DE CUENTA' : 'ABOUT THIS STATEMENT'}</Text>
              <Text style={styles.aboutText} numberOfLines={2}>{label}</Text>
            </View>
          )}

          <View style={styles.chipRow}>
            {WHERE_OPTS.map((o) => {
              const active = where === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setWhere(o.key)}
                  style={[styles.chip, active && { backgroundColor: colors.tint2, borderColor: colors.tint2 }]}
                >
                  <Text style={[styles.chipText, active && { color: colors.onTint2 }]}>
                    {lang === 'es' ? o.es : o.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.reportPh}
            placeholderTextColor={colors.ink3}
            multiline
            style={styles.textarea}
          />

          <View style={styles.attachRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.attachLabel}>{attachLabel}</Text>
              <Text style={styles.attachSub}>{attachSub}</Text>
            </View>
            <Pressable
              onPress={() => setAttach((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: attach }}
              hitSlop={8}
              style={[styles.switchTrack, { backgroundColor: attach ? colors.tint2 : colors.line2 }]}
            >
              <View
                style={[
                  styles.switchKnob,
                  { left: attach ? 20 : 2, backgroundColor: attach ? colors.onArt : colors.ink3 },
                ]}
              />
            </Pressable>
          </View>

          <Text style={styles.deviceNote}>{deviceNote}</Text>
          <Pressable
            onPress={send}
            disabled={!canSend}
            style={[styles.sendBtn, !canSend && { opacity: sending ? 0.85 : 0.45 }]}
            accessibilityRole="button"
          >
            {sending ? <ActivityIndicator color={colors.onTint2} size="small" /> : <Text style={styles.sendBtnText}>{t.send}</Text>}
          </Pressable>
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
    title: { fontSize: 26, fontFamily: fonts.displayMedium, color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, maxWidth: 320 },
    aboutCard: {
      marginTop: 14,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    aboutKicker: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.6, color: colors.ink3 },
    aboutText: { fontSize: 13, fontWeight: '500', color: colors.ink, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
    chip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 999 },
    chipText: { fontSize: 11.5, fontWeight: '500', color: colors.ink2 },
    textarea: {
      height: 120,
      marginTop: 12,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 13,
      textAlignVertical: 'top',
    },
    attachRow: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    attachLabel: { fontSize: 13, fontWeight: '500', color: colors.ink },
    attachSub: { fontSize: 11, color: colors.ink3, marginTop: 3 },
    switchTrack: { width: 44, height: 26, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
    switchKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 999 },
    deviceNote: { fontSize: 11, color: colors.ink3, marginTop: 10, lineHeight: 16 },
    sendBtn: {
      marginTop: 16,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
      alignItems: 'center',
    },
    sendBtnText: { fontSize: 14, fontWeight: '500', color: colors.onTint2 },
  });
}
