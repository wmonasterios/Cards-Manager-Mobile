import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal, ActivityIndicator, Linking, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, getCategoryColors, categoryLabel, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { ALL_CATEGORIES, Category } from '../data';
import { getStatementPdfUrl } from '../supabase/statementsApi';
import { recordSuggestionFeedback } from '../supabase/cardsApi';
import { isOfflineError, offlineMessage } from '../errors';
import { SeriesCard, MarkCuotaSheet, MovedToCuotasSheet, MarkResult, MovedResult } from '../components/Instalments';
import {
  buildSeries,
  seriesForTx,
  isInstalment,
  parsePlan,
  suggestPlan,
  similarCharges,
  matchingSeriesFor,
  sameAmount,
  sameMerchant,
  newGroupId,
} from '../instalments';
import type { TxPatch } from '../supabase/cardsApi';

type Props = NativeStackScreenProps<RootStackParamList, 'TransactionDetail'>;

export function TransactionDetailScreen({ route, navigation }: Props) {
  const { txId, cardId } = route.params;
  const { getCard, isDemo, updateTxCategory, setTxExcluded, cards, patchTxs } = useCards();
  const card = getCard(cardId);
  const tx = card?.dtx.find((t) => t.id === txId);
  const colors = useColors();
  const { lang, t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openingStatement, setOpeningStatement] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [markOpen, setMarkOpen] = useState(false);
  const [movedOpen, setMovedOpen] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const allSeries = useMemo(() => buildSeries(cards), [cards]);

  if (!card || !tx) return null;

  const es = lang === 'es';
  const series = seriesForTx(allSeries, tx.id);
  const cuota = isInstalment(tx) ? parsePlan(tx.plan) : null;
  const demoBlocked = () => {
    if (!isDemo) return false;
    Alert.alert(es ? 'Pagos en cuotas' : 'Instalments', es ? 'Crea una cuenta para marcar cuotas.' : 'Create an account to mark instalments.');
    return true;
  };
  const failed = () =>
    Alert.alert(es ? 'No se pudo guardar' : 'Could not save', es ? 'Revisa tu conexión e intenta otra vez.' : 'Check your connection and try again.');

  const run = async (patches: { id: string; patch: TxPatch }[], close: () => void) => {
    setSavingPlan(true);
    try {
      await patchTxs(patches);
      close();
    } catch {
      failed();
    } finally {
      setSavingPlan(false);
    }
  };

  const saveMark = ({ n, total, category, alsoIds }: MarkResult) => {
    const sibling = card.dtx.find(
      (o) => o.id !== tx.id && o.planGroup && isInstalment(o) && sameAmount(o.amount, tx.amount) && sameMerchant(o.merchant, tx.merchant),
    );
    const group = tx.planGroup ?? sibling?.planGroup ?? newGroupId();
    const catPatch: TxPatch = category !== tx.category ? { category, category_source: 'manual' } : {};
    const patches: { id: string; patch: TxPatch }[] = [
      { id: tx.id, patch: { plan: `${n}/${total}`, plan_source: 'manual', plan_group: group, ...catPatch } },
      ...alsoIds.map((a) => ({ id: a.id, patch: { plan: a.plan, plan_source: 'manual' as const, plan_group: group, ...catPatch } })),
    ];
    // A new category applies to the whole series, not just this month.
    if (category !== tx.category && series) {
      for (const r of series.rows) if (!patches.some((p) => p.id === r.tx.id)) patches.push({ id: r.tx.id, patch: catPatch });
    }
    run(patches, () => setMarkOpen(false));
  };

  const notCuota = () => {
    if (demoBlocked()) return;
    const clear = (ids: string[]) =>
      run(ids.map((id) => ({ id, patch: { plan: null, plan_source: 'none', plan_group: null } })), () => {});
    const others = series ? series.rows.map((r) => r.tx.id) : [tx.id];
    Alert.alert(
      es ? '¿No es una cuota?' : 'Not an instalment?',
      es
        ? 'Dejará de verse en tus pagos en cuotas. Sigue contando en su categoría.'
        : 'It will no longer show in your instalments. It still counts in its category.',
      [
        { text: es ? 'Cancelar' : 'Cancel', style: 'cancel' },
        ...(others.length > 1 ? [{ text: es ? 'Toda la serie' : 'The whole series', onPress: () => clear(others) }] : []),
        { text: es ? 'Solo esta' : 'Just this one', onPress: () => clear([tx.id]) },
      ],
    );
  };

  const saveMoved = ({ category, seriesKeys }: MovedResult) => {
    const chosen = allSeries.filter((x) => seriesKeys.includes(x.key));
    const group = chosen.find((x) => x.latest.planGroup)?.latest.planGroup ?? newGroupId();
    const patches: { id: string; patch: TxPatch }[] = [
      {
        id: tx.id,
        patch: { excluded_from_spend: true, plan_original: true, plan_group: group, category, category_source: 'manual' },
      },
    ];
    for (const x of chosen) for (const r of x.rows) patches.push({ id: r.tx.id, patch: { plan_group: group, category, category_source: 'manual' } });
    run(patches, () => setMovedOpen(false));
  };

  const undoMoved = () => {
    if (demoBlocked()) return;
    Alert.alert(
      es ? '¿Deshacer?' : 'Undo?',
      es ? 'Este cargo vuelve a contar como gasto y se separa de sus cuotas.' : 'This charge counts as spending again and is unlinked from its instalments.',
      [
        { text: es ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: es ? 'Deshacer' : 'Undo',
          onPress: () => run([{ id: tx.id, patch: { excluded_from_spend: false, plan_original: false, plan_group: null } }], () => {}),
        },
      ],
    );
  };

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
        isOfflineError(err) ? offlineMessage(lang) : (err?.message ?? String(err)),
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

  const toggleExcluded = () => {
    if (isDemo) {
      Alert.alert(
        t.excludeFromSpend,
        lang === 'es' ? 'Crea una cuenta para excluir transacciones del gasto.' : 'Create an account to exclude transactions from spend.',
      );
      return;
    }
    setTxExcluded(tx.id, !tx.excludedFromSpend);
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
    categoryLabel(cat, lang).toLowerCase().includes(categoryQuery.trim().toLowerCase()),
  );

  const statusNote = tx.declined
    ? t.declinedTemplate.replace('{bank}', card.displayName)
    : tx.amount > 0
      ? t.creditedTemplate.replace('{bank}', card.displayName)
      : t.postedTemplate.replace('{bank}', card.displayName).replace('{last4}', card.last4);

  const rows = [
    { label: t.card, value: `${card.displayName} ${card.product}` },
    { label: t.category, value: categoryLabel(tx.category, lang) },
    { label: t.dateLabel, value: `${tx.date}, ${tx.iso.slice(0, 4)}` },
    { label: t.plan, value: tx.plan ? `${tx.plan}${tx.rate ? ` · ${tx.rate}` : ''}` : t.single },
    { label: t.originalDesc, value: tx.merchant.toUpperCase() },
  ];

  const sourceNote = t.sourceNoteTemplate.replace('{bank}', card.displayName).replace('{cutoff}', card.cutoff);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          {!!tx.excludedFromSpend && (
            <View style={styles.noteBanner}>
              <Text style={styles.noteBannerText}>{t.excludedFromSpendNote}</Text>
            </View>
          )}

          <View style={styles.listCard}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          {series && !tx.planOriginal && (
            <View style={{ marginTop: 12 }}>
              <SeriesCard
                series={series}
                currentTxId={tx.id}
                lang={lang}
                onEdit={() => !demoBlocked() && setMarkOpen(true)}
                onNotCuota={notCuota}
              />
            </View>
          )}

          {tx.planOriginal && (
            <View style={{ marginTop: 12, gap: 12 }}>
              {series ? (
                <SeriesCard series={series} currentTxId={tx.id} lang={lang} />
              ) : (
                <View style={styles.sourceCard}>
                  <Text style={styles.toggleTitle}>{es ? 'Pasada a cuotas' : 'Moved to instalments'}</Text>
                  <Text style={[styles.sourceNote, { marginTop: 4 }]}>
                    {es
                      ? 'No cuenta como gasto. Cuando lleguen cuotas que sumen lo mismo, las unimos solas.'
                      : "It doesn't count as spending. When instalments that add up to it arrive, we join them automatically."}
                  </Text>
                </View>
              )}
              <Pressable onPress={undoMoved} style={[styles.sourceBtn, { alignSelf: 'flex-start' }]}>
                <Text style={styles.sourceBtnText}>{es ? 'Ya no está en cuotas' : 'Not in instalments anymore'}</Text>
              </Pressable>
            </View>
          )}

          {!cuota && !tx.planOriginal && tx.amount < 0 && !tx.declined && (
            <View style={styles.sourceCard}>
              <Text style={styles.toggleTitle}>{es ? '¿Lo pagas en cuotas?' : 'Paying this in instalments?'}</Text>
              <Text style={[styles.sourceNote, { marginTop: 4 }]}>
                {es
                  ? 'Márcalo como cuota, o si es la compra que pasaste a cuotas, para no contarla dos veces.'
                  : "Mark it as an instalment, or as the purchase you moved to instalments so it isn't counted twice."}
              </Text>
              <View style={styles.sourceActions}>
                <Pressable onPress={() => !demoBlocked() && setMarkOpen(true)} style={styles.sourceBtn}>
                  <Text style={styles.sourceBtnText}>{es ? 'Es pago en cuotas' : "It's an instalment"}</Text>
                </Pressable>
                <Pressable onPress={() => !demoBlocked() && setMovedOpen(true)} style={styles.sourceBtn}>
                  <Text style={styles.sourceBtnText}>{es ? 'La pasé a cuotas' : 'I moved it to instalments'}</Text>
                </Pressable>
              </View>
            </View>
          )}

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

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.toggleTitle}>{t.excludeFromSpend}</Text>
              <Text style={styles.toggleSub}>
                {tx.excludedFromSpend ? t.excludedFromSpendActive : t.excludedFromSpendInactive}
              </Text>
            </View>
            <Pressable
              onPress={toggleExcluded}
              style={[styles.switchTrack, { backgroundColor: tx.excludedFromSpend ? '#ff453a' : '#34c759' }]}
            >
              <View style={[styles.switchKnob, { left: tx.excludedFromSpend ? 20 : 2 }]} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {markOpen && (
        <MarkCuotaSheet
          visible
          onClose={() => setMarkOpen(false)}
          onSave={saveMark}
          tx={tx}
          cur={card.cur}
          lang={lang}
          initial={cuota}
          suggestion={cuota ? null : suggestPlan(card, tx)}
          similar={similarCharges(card, tx)}
          saving={savingPlan}
        />
      )}
      {movedOpen && (
        <MovedToCuotasSheet
          visible
          onClose={() => setMovedOpen(false)}
          onSave={saveMoved}
          tx={tx}
          lang={lang}
          matches={matchingSeriesFor(allSeries, tx)}
          saving={savingPlan}
        />
      )}

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
            <ScrollView
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                    <Text style={styles.modalRowText}>{categoryLabel(cat, lang)}</Text>
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
    amount: { fontSize: 40, fontFamily: fonts.display, marginTop: 20, letterSpacing: -0.6 },
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
    noteBanner: {
      marginBottom: 12,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    noteBannerText: { fontSize: 12, color: colors.ink2, lineHeight: 17 },
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
    toggleRow: {
      marginTop: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
    },
    toggleTitle: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
    toggleSub: { fontSize: 11.5, color: colors.ink2, marginTop: 4, lineHeight: 16 },
    switchTrack: { width: 44, height: 26, borderRadius: 999 },
    switchKnob: {
      position: 'absolute',
      top: 2,
      width: 22,
      height: 22,
      borderRadius: 999,
      backgroundColor: '#ffffff',
    },
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
    modalCheck: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  });
}
