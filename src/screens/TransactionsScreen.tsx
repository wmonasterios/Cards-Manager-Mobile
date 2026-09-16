import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { TxRow } from '../components/TxRow';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Transactions'>;

const CHIPS: Record<'en' | 'es', string[]> = {
  en: ['Groceries', 'Instalment', 'Payment', 'Panamá'],
  es: ['Super', 'Cuotas', 'Pagos', 'Panamá'],
};
// Chip label -> the substring it actually filters on (matches the mockup's behaviour).
const CHIP_QUERY: Record<string, string> = {
  Groceries: 'Groceries', Super: 'Groceries',
  Instalment: 'Instalment', Cuotas: 'Instalment',
  Payment: 'Payment', Pagos: 'Payment',
  'Panamá': 'Panamá',
};

export function TransactionsScreen({ route, navigation }: Props) {
  const { cards } = useCards();
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const allTx = useMemo(
    () => cards.flatMap((c) => c.dtx.map((tx) => ({ tx, cardId: c.id }))),
    [cards],
  );

  const q = query.trim().toLowerCase();
  const results = q
    ? allTx.filter(({ tx }) => `${tx.merchant} ${tx.sub} ${tx.category}`.toLowerCase().includes(q))
    : allTx;

  const note = query
    ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${query}”`
    : t.searchPh + ' — 4 cards, this cycle and the last six statements';

  const pickChip = (label: string) => {
    if (activeChip === label) {
      setActiveChip(null);
      setQuery('');
    } else {
      setActiveChip(label);
      setQuery(CHIP_QUERY[label]);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setActiveChip(null);
              }}
              placeholder={t.searchPh}
              placeholderTextColor={colors.ink3}
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setActiveChip(null);
                }}
                style={styles.clearBtn}
                hitSlop={6}
              >
                <Text style={styles.clearBtnText}>{'×'}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.chipRow}>
            {CHIPS[lang].map((label) => {
              const active = activeChip === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => pickChip(label)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>{note}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.listCard}>
            {results.map(({ tx, cardId }) => (
              <TxRow
                key={tx.id}
                tx={tx}
                showCard
                onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id, cardId })}
              />
            ))}
          </View>
          {!!query && results.length === 0 && <Text style={styles.emptyNote}>{t.noMatch}</Text>}
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
    searchWrap: { marginTop: 18, position: 'relative', justifyContent: 'center' },
    searchInput: {
      padding: 13,
      paddingRight: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 14,
    },
    clearBtn: {
      position: 'absolute',
      right: 8,
      width: 26,
      height: 26,
      borderRadius: 999,
      backgroundColor: colors.line2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearBtnText: { color: colors.ink2b, fontSize: 14, fontWeight: '500' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: {
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 11,
      borderRadius: 999,
    },
    chipActive: { backgroundColor: colors.tint2, borderColor: colors.tint2 },
    chipText: { fontSize: 11.5, fontWeight: '500', color: colors.ink2 },
    chipTextActive: { color: colors.onTint2 },
    note: { fontSize: 11.5, color: colors.ink3, marginTop: 12, lineHeight: 16 },
    section: { paddingHorizontal: spacing.lg, marginTop: 14 },
    listCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    emptyNote: { padding: 22, fontSize: 13, color: colors.ink3, lineHeight: 20 },
  });
}
