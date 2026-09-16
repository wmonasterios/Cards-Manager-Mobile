import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';
import { TxRow } from '../components/TxRow';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Transactions'>;

export function TransactionsScreen({ route, navigation }: Props) {
  const { cards } = useCards();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  const allTx = useMemo(
    () => cards.flatMap((c) => c.dtx.map((t) => ({ tx: t, cardId: c.id }))),
    [cards],
  );

  const q = query.trim().toLowerCase();
  const results = q
    ? allTx.filter(({ tx }) => `${tx.merchant} ${tx.sub} ${tx.category}`.toLowerCase().includes(q))
    : allTx;

  const note = query
    ? `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${query}”`
    : 'Search 4 cards, this cycle and the last six statements';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Merchant, category, card"
              placeholderTextColor={colors.ink3}
              style={styles.searchInput}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} style={styles.clearBtn} hitSlop={6}>
                <Text style={styles.clearBtnText}>{'×'}</Text>
              </Pressable>
            )}
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
          {!!query && results.length === 0 && (
            <Text style={styles.emptyNote}>
              Nothing matched. Search looks at merchant names as they appear on the statement, so try a
              shorter word.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
