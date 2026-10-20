import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { CardArt } from '../components/CardArt';
import { Segmented } from '../components/Segmented';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { money } from '../format';
import { Ionicons } from '@expo/vector-icons';
import { Confetti } from '../components/Confetti';

type Props = NativeStackScreenProps<RootStackParamList, 'Pay'>;
type PayMode = 'min' | 'full' | 'custom';
type PayDate = 'today' | 'due';

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PayScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const { getCard, addPayment, paymentHistory } = useCards();
  const card = getCard(cardId);
  const colors = useColors();
  const { lang, t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [mode, setMode] = useState<PayMode>('full');
  const [custom, setCustom] = useState('');
  const [when, setWhen] = useState<PayDate>('today');
  // Shown after saving a payment that settles the card (with confetti) or
  // newly covers the minimum (an honest heads-up about interest).
  const [celebration, setCelebration] = useState<null | { kind: 'full' | 'min'; title: string; body: string }>(null);

  if (!card) return null;

  const payAmount =
    mode === 'min'
      ? Math.max(0, card.min - card.paidAmt)
      : mode === 'custom'
        ? parseFloat(custom) || 0
        : card.remaining;
  const afterAmount = Math.max(0, card.remaining - payAmount);

  const locale = lang === 'es' ? 'es-PA' : 'en-US';
  const todayDate = new Date();
  const nextDue = card.nextDueIso ?? card.dueIso;
  const dueDate = nextDue ? new Date(nextDue + 'T00:00:00') : todayDate;
  const formatLong = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const formatShort = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const dateText =
    when === 'today' ? `${t.registeredOn} ${formatLong(todayDate)}` : `${t.scheduledFor} ${formatLong(dueDate)}`;
  const whenLabel =
    when === 'today' ? `${t.registeredOn} · ${formatShort(todayDate)}` : `${t.scheduledFor} · ${formatShort(dueDate)}`;

  const history = paymentHistory(card.id)
    .slice()
    .reverse()
    .map((p) => ({ label: t.payment, value: money(card.cur, p.amount), sub: p.when }));

  const save = () => {
    if (payAmount <= 0) {
      Alert.alert(t.enterAmount);
      return;
    }
    const paidOnIso = when === 'today' ? toIso(todayDate) : toIso(dueDate);
    // Decide the message from the card as it was *before* this payment.
    const es = lang === 'es';
    const settlesCard = afterAmount <= 0.005;
    const coversMinNow = !card.minCovered && card.paidAmt + payAmount >= card.min - 0.005;
    addPayment(card.id, payAmount, whenLabel, paidOnIso);
    if (settlesCard) {
      setCelebration({
        kind: 'full',
        title: es ? '¡Felicidades!' : 'Congratulations!',
        body: es
          ? `Pagaste el total de ${card.displayName}. No pagarás intereses.`
          : `You paid ${card.displayName} in full. You won't pay interest.`,
      });
      return;
    }
    if (coversMinNow) {
      setCelebration({
        kind: 'min',
        title: es ? 'Estás al día' : "You're up to date",
        body: es
          ? `Cubriste el mínimo de ${card.displayName}, pero te cobrarán intereses sobre el saldo restante de ${money(card.cur, afterAmount)}.`
          : `You covered ${card.displayName}'s minimum, but you'll be charged interest on the remaining ${money(card.cur, afterAmount)}.`,
      });
      return;
    }
    Alert.alert(
      t.paymentRegisteredTemplate
        .replace('{amount}', money(card.cur, payAmount))
        .replace('{bank}', card.displayName),
    );
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t.registerPay}</Text>
          <Text style={styles.sub}>{t.noMoney}</Text>
          <View style={styles.cardRow}>
            <CardArt cardId={card.id} colorKey={card.colorKey} style={styles.cardThumb} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardName}>
                {card.displayName} {card.product}
              </Text>
              <Text style={styles.cardMeta}>
                {card.last4} · {card.dueShort}
              </Text>
            </View>
            <Text style={styles.cardBalance}>{card.balanceText}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t.amount.toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'min', label: t.minimum },
                { key: 'full', label: t.fullBalance },
                { key: 'custom', label: t.custom },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>
          {mode === 'custom' && (
            <TextInput
              value={custom}
              onChangeText={(v) => setCustom(v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={colors.ink3}
              keyboardType="decimal-pad"
              style={styles.customInput}
            />
          )}
          <Text style={styles.bigAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>{money(card.cur, payAmount)}</Text>
          <Text style={styles.afterNote}>{t.balanceAfter} {money(card.cur, afterAmount)}</Text>

          <Text style={[styles.label, { marginTop: 22 }]}>{t.dateLabel.toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'today', label: t.today },
                { key: 'due', label: t.onDueDate },
              ]}
              value={when}
              onChange={setWhen}
            />
          </View>
          <Text style={styles.dateNote}>{dateText}</Text>

          <Pressable onPress={save} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{t.savePay}</Text>
          </Pressable>

          <Text style={styles.historyTitle}>{t.payHistory}</Text>
          <View style={styles.listCard}>
            {history.map((p, i) => (
              <View key={i} style={styles.historyRow}>
                <View style={{ minWidth: 0 }}>
                  <Text style={styles.historyLabel}>{p.label}</Text>
                  <Text style={styles.historySub}>{p.sub}</Text>
                </View>
                <Text style={styles.historyValue}>{p.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {celebration && (
        <View style={styles.celebrateBackdrop}>
          <View style={styles.celebrateCard} accessibilityLiveRegion="polite">
            <View
              style={[
                styles.celebrateIcon,
                { backgroundColor: celebration.kind === 'full' ? colors.accent : colors.tint },
              ]}
            >
              <Ionicons
                name={celebration.kind === 'full' ? 'sparkles' : 'checkmark'}
                size={26}
                color={celebration.kind === 'full' ? colors.onTint2 : colors.ink}
              />
            </View>
            <Text style={styles.celebrateTitle}>{celebration.title}</Text>
            <Text style={styles.celebrateBody}>{celebration.body}</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.celebrateBtn} accessibilityRole="button">
              <Text style={styles.celebrateBtnText}>{lang === 'es' ? 'Listo' : 'Done'}</Text>
            </Pressable>
          </View>
          {celebration.kind === 'full' && <Confetti />}
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    title: { fontSize: 26, fontFamily: fonts.displayMedium, color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18, maxWidth: 320 },
    cardRow: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 13,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    cardThumb: { width: 46, height: 30, borderRadius: 5 },
    cardName: { fontSize: 13, fontWeight: '500', color: colors.ink },
    cardMeta: { fontSize: 11, color: colors.ink3, marginTop: 3 },
    cardBalance: { fontSize: 14, fontWeight: '600', color: colors.ink },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
    label: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1 },
    customInput: {
      marginTop: 10,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 16,
      fontWeight: '600',
    },
    bigAmount: { fontSize: 40, fontFamily: fonts.display, color: colors.ink, marginTop: 18, letterSpacing: -0.6 },
    afterNote: { fontSize: 12, color: colors.ink3, marginTop: 6 },
    dateNote: { fontSize: 11.5, color: colors.ink3, marginTop: 8, lineHeight: 16 },
    saveBtn: {
      marginTop: 18,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '500', color: colors.onTint2 },
    celebrateBackdrop: {
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      backgroundColor: 'rgba(5,7,15,0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    celebrateCard: {
      width: '100%',
      maxWidth: 360,
      padding: 24,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    celebrateIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    celebrateTitle: { fontSize: 24, fontFamily: fonts.display, color: colors.ink, marginTop: 16, textAlign: 'center' },
    celebrateBody: { fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 8, textAlign: 'center' },
    celebrateBtn: {
      marginTop: 20,
      minHeight: 48,
      alignSelf: 'stretch',
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    celebrateBtnText: { fontSize: 15, fontWeight: '600', color: colors.onTint2 },
    historyTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, marginTop: 24 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.hair,
    },
    historyLabel: { fontSize: 13, fontWeight: '500', color: colors.ink },
    historySub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
    historyValue: { fontSize: 13.5, fontWeight: '600', color: colors.accentInk2 },
  });
}
