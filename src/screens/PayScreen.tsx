import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import { CardArt } from '../components/CardArt';
import { Segmented } from '../components/Segmented';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'Pay'>;
type PayMode = 'min' | 'full' | 'custom';
type PayDate = 'today' | 'due';

export function PayScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const { getCard, addPayment, paymentHistory } = useCards();
  const card = getCard(cardId);

  const [mode, setMode] = useState<PayMode>('full');
  const [custom, setCustom] = useState('');
  const [when, setWhen] = useState<PayDate>('today');

  if (!card) return null;

  const payAmount = mode === 'min' ? card.min : mode === 'custom' ? parseFloat(custom) || 0 : card.remaining;
  const afterAmount = Math.max(0, card.remaining - payAmount);
  const dateText = when === 'today' ? 'Registered 14 Sep 2026' : `Scheduled for ${card.due}, 2026`;

  const history = paymentHistory(card.id)
    .slice()
    .reverse()
    .map((p) => ({ label: 'Registered payment', value: money('US$', p.amount), sub: `${p.when} · this cycle` }))
    .concat([
      { label: 'Registered payment', value: money('US$', 780), sub: '18 Aug' },
      { label: 'Registered payment', value: money('US$', 640.5), sub: '19 Jul' },
    ]);

  const save = () => {
    if (payAmount <= 0) {
      Alert.alert('Enter an amount first');
      return;
    }
    const whenLabel = when === 'today' ? 'Registered · 14 Sep' : `Scheduled · ${card.due}`;
    addPayment(card.id, payAmount, whenLabel);
    Alert.alert(`${money('US$', payAmount)} registered on ${card.bank}`);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>Register a payment</Text>
          <Text style={styles.sub}>
            The app does not move money. You pay in your bank and record it here so the cycle closes.
          </Text>
          <View style={styles.cardRow}>
            <CardArt cardId={card.id} style={styles.cardThumb} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardName}>
                {card.bank} {card.product}
              </Text>
              <Text style={styles.cardMeta}>
                {card.last4} · {card.dueShort}
              </Text>
            </View>
            <Text style={styles.cardBalance}>{card.balanceText}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>AMOUNT</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'min', label: 'Minimum' },
                { key: 'full', label: 'Full balance' },
                { key: 'custom', label: 'Custom' },
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
          <Text style={styles.bigAmount}>{money('US$', payAmount)}</Text>
          <Text style={styles.afterNote}>Balance after this payment {money('US$', afterAmount)}</Text>

          <Text style={[styles.label, { marginTop: 22 }]}>DATE</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'today', label: 'Today' },
                { key: 'due', label: 'On due date' },
              ]}
              value={when}
              onChange={setWhen}
            />
          </View>
          <Text style={styles.dateNote}>{dateText}</Text>

          <Pressable onPress={save} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save payment</Text>
          </Pressable>

          <Text style={styles.historyTitle}>Payment history</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },
  top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
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
  bigAmount: { fontSize: 40, fontWeight: '600', color: colors.ink, marginTop: 18, letterSpacing: -0.6 },
  afterNote: { fontSize: 12, color: colors.ink3, marginTop: 6 },
  dateNote: { fontSize: 11.5, color: colors.ink3, marginTop: 8, lineHeight: 16 },
  saveBtn: {
    marginTop: 18,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
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
