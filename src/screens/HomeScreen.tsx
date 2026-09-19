import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useT } from '../i18n/LocaleContext';
import { StackCard, HeroFrame } from '../components/StackCard';
import { TxRow } from '../components/TxRow';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

// Exported so CardDetailScreen's hero can match this size exactly — the
// grow animation depends on origin and destination being the same size.
export const CARD_HEIGHT = 214;
const CARD_STEP = 86;

export function HomeScreen({ navigation }: any) {
  const { cards, isDemo } = useCards();
  const colors = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const openCard = (cardId: string, heroFrame: HeroFrame) => {
    navigation.navigate('CardDetail', { cardId, heroFrame });
  };

  const unpaid = cards.filter((c) => !c.paid);
  const totalOwed = unpaid.reduce((n, c) => n + c.remaining, 0);
  const stackHeight = CARD_HEIGHT + (cards.length - 1) * CARD_STEP;
  const recent = useMemo(() => cards.flatMap((c) => c.dtx).slice(0, 4), [cards]);

  const nextDueText = !unpaid.length
    ? 'Everything is paid this cycle'
    : isDemo
      ? 'Banco Aliado due in 4 days — US$ 171.01 minimum'
      : `${unpaid.length} card${unpaid.length > 1 ? 's' : ''} with a balance due`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{t.totalOwed.toUpperCase()}</Text>
            <Text style={styles.total}>{money('US$', totalOwed)}</Text>
            <Text style={styles.totalNote}>
              {cards.length} {t.cardsWord} · {unpaid.length} {t.withBalance}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('Transactions', {})}
              style={styles.iconBtn}
              hitSlop={6}
            >
              <Text style={styles.iconBtnText}>{'⌕'}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Statements')}
              style={[styles.iconBtn, styles.iconBtnAccent]}
              hitSlop={6}
            >
              <Text style={[styles.iconBtnText, { color: colors.accent }]}>+</Text>
            </Pressable>
          </View>
        </View>

        {cards.length > 0 && (
          <View style={styles.dueBanner}>
            <View style={styles.dueDot} />
            <Text style={styles.dueText}>{nextDueText}</Text>
          </View>
        )}

        {cards.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No cards yet</Text>
            <Text style={styles.emptyStateBody}>
              Tap the + button above to add your first card.
            </Text>
          </View>
        )}

        <View style={[styles.stack, { height: cards.length ? stackHeight : 0 }]}>
          {cards.map((c, i) => (
            <StackCard
              key={c.id}
              card={c}
              top={i * CARD_STEP}
              zIndex={10 + i}
              style={styles.stackSlot}
              onOpen={openCard}
            />
          ))}
        </View>

        {cards.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t.latest}</Text>
              <Pressable onPress={() => navigation.navigate('Transactions', {})} hitSlop={6}>
                <Text style={styles.seeAll}>{t.seeAll}</Text>
              </Pressable>
            </View>
            <View style={styles.listCard}>
              {recent.map((tx) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  showCard
                  onPress={() =>
                    navigation.navigate('TransactionDetail', {
                      txId: tx.id,
                      cardId: cards.find((c) => c.dtx.some((x) => x.id === tx.id))?.id ?? cards[0].id,
                    })
                  }
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 1.2,
      color: colors.ink3,
      textTransform: 'uppercase',
    },
    total: { fontSize: 34, fontWeight: '600', color: colors.ink, marginTop: 8, letterSpacing: -0.5 },
    totalNote: { fontSize: 12, color: colors.ink3, marginTop: 4 },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnAccent: { borderColor: colors.accent },
    iconBtnText: { color: colors.ink, fontSize: 18 },
    dueBanner: {
      marginTop: 14,
      marginHorizontal: spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentInk2 },
    dueText: { fontSize: 12.5, fontWeight: '500', color: colors.accentInk, flexShrink: 1 },
    emptyState: {
      marginTop: 18,
      marginHorizontal: spacing.xl,
      padding: 24,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    emptyStateTitle: { fontSize: 15, fontWeight: '500', color: colors.ink },
    emptyStateBody: { fontSize: 12.5, color: colors.ink3, marginTop: 6, textAlign: 'center' },
    stack: { marginTop: 18, paddingHorizontal: spacing.lg, position: 'relative' },
    stackSlot: { position: 'absolute', left: spacing.lg, right: spacing.lg, height: CARD_HEIGHT },
    sectionHeader: {
      marginTop: 8,
      paddingHorizontal: spacing.xl,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    seeAll: { fontSize: 12, fontWeight: '500', color: colors.accent },
    listCard: {
      marginTop: 10,
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
  });
}
