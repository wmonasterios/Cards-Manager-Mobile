import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

const WHERE_OPTS: { key: string; en: string; es: string }[] = [
  { key: 'parsing', en: 'Statement parsing', es: 'Lectura del PDF' },
  { key: 'balances', en: 'Balances', es: 'Saldos' },
  { key: 'instalments', en: 'Instalments', es: 'Cuotas' },
  { key: 'reminders', en: 'Reminders', es: 'Recordatorios' },
  { key: 'other', en: 'Other', es: 'Otro' },
];

export function ReportScreen({ navigation }: Props) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [where, setWhere] = useState('parsing');
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);

  const deviceNote =
    lang === 'es'
      ? 'Se envía: versión 0.1, iPhone, iOS 26, idioma español. Sin números de tarjeta.'
      : 'Sent with the report: version 0.1, iPhone, iOS 26, English. No card numbers.';

  const send = () => {
    Alert.alert(lang === 'es' ? 'Reporte enviado · ticket #482' : 'Report sent · ticket #482');
    setText('');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t.reportBug}</Text>
          <Text style={styles.sub}>{t.reportSub}</Text>

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
              <Text style={styles.attachLabel}>{t.attach}</Text>
              <Text style={styles.attachSub}>{t.attachSub}</Text>
            </View>
            <Pressable
              onPress={() => setAttach((v) => !v)}
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
          <Pressable onPress={send} style={styles.sendBtn}>
            <Text style={styles.sendBtnText}>{t.send}</Text>
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
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, maxWidth: 320 },
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
      alignItems: 'center',
    },
    sendBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
  });
}
