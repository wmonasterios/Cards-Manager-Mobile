import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import { BackButton } from '../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Statements'>;
type UploadStage = 'idle' | 'parsing' | 'review';

const INBOX = 'w.monasterios.7f3a@in.cardsmanager.app';

const PARSE_STEPS = [
  { label: 'Statement read · 4 pages', mark: '✓', done: true },
  { label: 'Bank recognised · Banco Aliado', mark: '✓', done: true },
  { label: 'Extracting balances and dates', mark: '·', done: false },
  { label: 'Matching transactions to categories', mark: '·', done: false },
];

const PARSED_FIELDS: { label: string; value: string; ok: boolean }[] = [
  { label: 'Statement balance', value: 'US$ 3,420.10', ok: true },
  { label: 'Minimum payment', value: 'US$ 171.01', ok: true },
  { label: 'Full payment due', value: '18 Sep 2026', ok: true },
  { label: 'Statement cut-off', value: '30 Aug 2026', ok: true },
  { label: 'Credit limit', value: 'US$ 12,000.00', ok: true },
  { label: 'Instalment purchases', value: '2 found', ok: false },
];

const STATEMENT_HISTORY = [
  { title: 'Banco Aliado · August', sub: 'New layout · we could not read it', status: 'Needs review', accent: true, needsReview: true },
  { title: 'Banco Aliado · September', sub: 'Forwarded by email · 2 min ago', status: 'New', accent: true },
  { title: 'BAC · September', sub: 'Uploaded PDF · 5 Sep', status: 'Applied', accent: false },
  { title: 'Davibank · September', sub: 'Forwarded by email · 8 Sep', status: 'Applied', accent: false },
  { title: 'BAC Platinum · August', sub: 'Uploaded PDF · 6 Aug', status: 'Applied', accent: false },
];

export function StatementsScreen({ navigation }: Props) {
  const [stage, setStage] = useState<UploadStage>('idle');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

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
    Alert.alert('Banco Aliado updated from the September statement');
    navigation.navigate('CardDetail', { cardId: 'aliado' });
  };

  const title =
    stage === 'review' ? 'Check what we read' : stage === 'parsing' ? 'Reading your statement' : 'Add a statement';
  const sub =
    stage === 'review'
      ? 'These values come straight from the PDF. Confirm and the card updates.'
      : stage === 'parsing'
        ? 'Usually under ten seconds. You can leave this screen.'
        : 'Two ways in: send the PDF yourself, or let the bank email do it for you.';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>

        {stage === 'idle' && (
          <View style={styles.section}>
            <Pressable onPress={startParse} style={styles.uploadBtn}>
              <Text style={styles.uploadBtnTitle}>Upload a PDF statement</Text>
              <Text style={styles.uploadBtnBody}>
                Pick it from Files or scan a printed statement. Password-protected PDFs are supported.
              </Text>
            </Pressable>

            <View style={styles.emailCard}>
              <Text style={styles.emailTitle}>Forward by email</Text>
              <Text style={styles.emailBody}>
                Send the bank's statement email to your private address and the card updates itself.
              </Text>
              <View style={styles.inboxRow}>
                <Text style={styles.inboxText} numberOfLines={1}>
                  {INBOX}
                </Text>
                <Pressable onPress={copyInbox} style={styles.copyBtn}>
                  <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
                </Pressable>
              </View>
              <Text style={styles.sendersNote}>Known senders: BAC, Banco Aliado, Davibank</Text>
            </View>

            <Text style={styles.historyTitle}>Statement history</Text>
            <View style={styles.listCard}>
              {STATEMENT_HISTORY.map((s) => (
                <Pressable
                  key={s.title}
                  disabled={!s.needsReview}
                  onPress={() =>
                    s.needsReview &&
                    Alert.alert(
                      'Needs review',
                      'Fixing a statement the parser could not read is coming in a later update.',
                    )
                  }
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
            {PARSE_STEPS.map((p) => (
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
              {PARSED_FIELDS.map((f) => (
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
                        {f.ok ? 'Parsed' : 'Check'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.tapNote}>
              Tap any value to correct it before saving. Corrections teach the parser for next month.
            </Text>
            <View style={styles.reviewActions}>
              <Pressable onPress={confirmParse} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save to card</Text>
              </Pressable>
              <Pressable onPress={() => setStage('idle')} style={styles.discardBtn}>
                <Text style={styles.discardBtnText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
