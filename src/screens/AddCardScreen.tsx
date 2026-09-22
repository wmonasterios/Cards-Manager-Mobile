import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { BackButton } from '../components/BackButton';
import { DateField } from '../components/DateField';
import { useCards } from '../context/CardsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCard'>;

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AddCardScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { addRealCard } = useCards();

  const [bank, setBank] = useState('');
  const [product, setProduct] = useState('');
  const [network, setNetwork] = useState('');
  const [last4, setLast4] = useState('');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [minimumPayment, setMinimumPayment] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [cutoffDate, setCutoffDate] = useState(new Date());
  const [busy, setBusy] = useState(false);

  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');

  const save = async () => {
    if (!bank.trim()) {
      Alert.alert('Enter the bank name first.');
      return;
    }
    setBusy(true);
    try {
      await addRealCard({
        bank: bank.trim(),
        product: product.trim() || null,
        network: network.trim() || null,
        last4: last4.trim() || null,
        balance: parseFloat(balance) || 0,
        credit_limit: parseFloat(creditLimit) || 0,
        minimum_payment: parseFloat(minimumPayment) || 0,
        due_date: toIso(dueDate),
        cutoff_date: toIso(cutoffDate),
      });
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not save the card', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>Add a card</Text>
          <Text style={styles.sub}>
            Enter the details from your latest statement. You can update these anytime.
          </Text>

          <Text style={styles.label}>BANK</Text>
          <TextInput
            value={bank}
            onChangeText={setBank}
            placeholder="Banco Aliado"
            placeholderTextColor={colors.ink3}
            style={styles.input}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PRODUCT</Text>
              <TextInput
                value={product}
                onChangeText={setProduct}
                placeholder="Visa Infinite"
                placeholderTextColor={colors.ink3}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>NETWORK</Text>
              <TextInput
                value={network}
                onChangeText={setNetwork}
                placeholder="Visa"
                placeholderTextColor={colors.ink3}
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>LAST 4 DIGITS</Text>
          <TextInput
            value={last4}
            onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))}
            placeholder="1675"
            placeholderTextColor={colors.ink3}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.input}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>BALANCE</Text>
              <TextInput
                value={balance}
                onChangeText={(v) => setBalance(numeric(v))}
                placeholder="0.00"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CREDIT LIMIT</Text>
              <TextInput
                value={creditLimit}
                onChangeText={(v) => setCreditLimit(numeric(v))}
                placeholder="0.00"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>MINIMUM PAYMENT</Text>
          <TextInput
            value={minimumPayment}
            onChangeText={(v) => setMinimumPayment(numeric(v))}
            placeholder="0.00"
            placeholderTextColor={colors.ink3}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <View style={[styles.row, { marginTop: 20 }]}>
            <DateField label="CUT-OFF DATE" value={cutoffDate} onChange={setCutoffDate} />
            <DateField label="PAYMENT DUE DATE" value={dueDate} onChange={setDueDate} />
          </View>

          <Pressable onPress={save} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.saveBtnText}>Save card</Text>}
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
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18, maxWidth: 340 },
    label: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1, marginTop: 18 },
    input: {
      marginTop: 10,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 14,
    },
    row: { flexDirection: 'row', gap: 12 },
    saveBtn: {
      marginTop: 26,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
  });
}
