import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal, ActivityIndicator, Linking, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, getCategoryColors, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { ALL_CATEGORIES, Category } from '../data';
import { getStatementPdfUrl } from '../supabase/statementsApi';
import { recordSuggestionFeedback } from '../supabase/cardsApi';

type Props = NativeStackScreenProps<RootStackParamList, 'TransactionDetail'>;

export function TransactionDetailScreen({ route, navigation }: Props) {
  const { txId, cardId } = route.params;
  const { getCard, isDemo, updateTxCategory } = useCards();
  const card = getCard(cardId);
  const tx = card?.dtx.find((t) => t.id === txId);
  const colors = useColors();
  const { lang, t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openingStatement, setOpeningStatement] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');

  if (!card || !tx) return null;

  const openStatement = async () => {
    if (!tx.statementId) {
      navigation.navigate('Tabs', { screen: 'Statements' });
      return;
    }
    setOpeningStatement(true);
    try {
      const url = await getStatementPdfUrl(tx.statementId);
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert(
        lang === 'es' ? 'No se pudo abrir el PDF' : 'Could not open the PDF',
        err?.message ?? String(err),
      );
    } finally {
      setOpeningStatement(false);
    }
  };

  const openCategoryPicker = () => {
    if (isDemo) {
      Alert.alert(t.changeCategory, lang === 'es' ? 'Crea una cuenta para editar categorías.' : 'Create an account to edit categories.');
      return;
    }
    setCategoryQuery('');
    setPickerOpen(true);
  };

  const pickCategory = (category: Category) => {
    setPickerOpen(false);
    const wasSuggestion = tx.categorySource === 'suggestion';
    if (category === tx.category) {
      if (wasSuggestion) recordSuggestionFeedback(tx.merchant, 'confirm');
      return;
    }
    Alert.alert(
      lang === 'es' ? '¿Aplicar a todas?' : 'Apply to all?',
      lang === 'es'
        ? `¿Categorizar así todas las transacciones pasadas y futuras de "${tx.merchant}"?`
        : `Categorize all past and future transactions from "${tx.merchant}" this way?`,
      [
        {
          text: lang === 'es' ? 'Solo esta' : 'Just this one',
          onPress: () => {
            updateTxCategory(tx.id, tx.merchant, category, false);
            if (wasSuggestion) recordSuggestionFeedback(tx.merchant, 'reject');
          },
        },
        {
          text: lang === 'es' ? 'Todas' : 'All of them',
          onPress: () => {
            updateTxCategory(tx.id, tx.merchant, category, true);
            if (wasSuggestion) recordSuggestionFeedback(tx.merchant, 'reject');
          },
        },
      ],
    );
  };

  const filteredCategories = ALL_CATEGORIES.filter((cat) =>
    categoryLabel(cat).toLowerCase().includes(categoryQuery.trim().toLowerCase()),
  );

  const statusNote = tx.declined
    ? `Declined by ${card.bank} — over limit`
    : tx.amount > 0
      ? `Payment credited to ${card.bank}`
      : `Posted · ${card.bank} ${card.last4}`;

  const rows = [
    { label: t.card, value: `${card.bank} ${card.product}` },
    { label: t.category, value: categoryLabel(tx.category) },
    { label: t.dateLabel, value: `${tx.date}, 2026` },
    { label: t.plan, value: tx.plan ? `${tx.plan} · 0%` : t.single },
    { label: t.inCycle, value: card.cycleNote },
    { label: t.originalDesc, value: tx.merchant.toUpperCase() },
  ];

  const sourceNote = `Read from the ${card.bank} statement PDF received on ${card.cutoff}. Amounts can differ from the bank app until the next statement arrives.`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.identityRow}>
            <View style={[styles.badge, { backgroundColor: tx.catBg }]}>
              <Ionicons name={tx.catIcon as any} size={22} color={tx.catInk} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.merchant}>{tx.merchant}</Text>
              <Text style={styles.sub}>{tx.sub}</Text>
            </View>
          </View>
          <Text style={[styles.amount, { color: tx.amountInk }]}>{tx.amountText}</Text>
          <Text style={styles.statusNote}>{statusNote}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.listCard}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sourceCard}>
            <Text style={styles.sourceNote}>{sourceNote}</Text>
            <View style={styles.sourceActions}>
              <Pressable onPress={openStatement} disabled={openingStatement} style={styles.sourceBtn}>
                {openingStatement ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.sourceBtnText}>{t.openStatement}</Text>
                )}
              </Pressable>
              <Pressable onPress={openCategoryPicker} style={styles.sourceBtn}>
                <Text style={styles.sourceBtnText}>{t.changeCategory}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t.changeCategory}</Text>
            <TextInput
              value={categoryQuery}
              onChangeText={setCategoryQuery}
              placeholder={lang === 'es' ? 'Buscar categoría' : 'Search category'}
              placeholderTextColor={colors.ink3}
              style={styles.modalSearch}
            />
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {filteredCategories.map((cat) => {
                const catColors = getCategoryColors(colors)[cat];
                const active = cat === tx.category;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => pickCategory(cat)}
                    style={[styles.modalRow, active && { borderColor: colors.accent }]}
                  >
                    <View style={[styles.modalBadge, { backgroundColor: catColors.bg }]}>
                      <Ionicons name={catColors.icon as any} size={16} color={catColors.ink} />
                    </View>
                    <Text style={styles.modalRowText}>{categoryLabel(cat)}</Text>
                    {active && <Text style={styles.modalCheck}>{'✓'}</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22 },
    badge: { width: 54, height: 54, borderRadius: radius.xl - 2, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontSize: 16, fontWeight: '600' },
    merchant: { fontSize: 19, fontWeight: '500', color: colors.ink },
    sub: { fontSize: 12, color: colors.ink3, marginTop: 4 },
    amount: { fontSize: 40, fontWeight: '600', marginTop: 20, letterSpacing: -0.6 },
    statusNote: { fontSize: 12.5, color: colors.ink3, marginTop: 6 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    listCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.hair,
    },
    rowLabel: { fontSize: 13, color: colors.ink2b },
    rowValue: { fontSize: 13, fontWeight: '500', color: colors.ink, textAlign: 'right', flexShrink: 1 },
    sourceCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    sourceNote: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
    sourceActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    sourceBtn: {
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.hair4,
    },
    sourceBtnText: { fontSize: 12, fontWeight: '500', color: colors.ink },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
      maxHeight: '80%',
    },
    modalTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, marginBottom: 10 },
    modalSearch: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.md - 2,
      paddingVertical: 9,
      paddingHorizontal: 12,
      fontSize: 13,
      color: colors.ink,
      marginBottom: 10,
    },
    modalList: { gap: 8 },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginBottom: 8,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    modalBadge: {
      width: 32,
      height: 32,
      borderRadius: radius.sm + 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBadgeText: { fontSize: 10.5, fontWeight: '600' },
    modalRowText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
    modalCheck: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  });
}
