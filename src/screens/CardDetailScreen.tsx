import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, CARD_PALETTE, CARD_PALETTE_ORDER } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { CardArt } from '../components/CardArt';
import { CARD_HEIGHT } from './HomeScreen';
import { ProgressBar } from '../components/ProgressBar';
import { TxRow } from '../components/TxRow';
import { Segmented } from '../components/Segmented';
import { BackButton } from '../components/BackButton';
import { DateField } from '../components/DateField';
import { useCards } from '../context/CardsContext';
import { money } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'CardDetail'>;

type RangeKey = 'month' | '3months' | 'ytd' | 'custom';

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + delta);
  return toIso(d);
}

function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function CardDetailScreen({ route, navigation }: Props) {
  const { cardId } = route.params;
  const { getCard, togglePaid, isDemo, deleteCard, updateCardDisplay } = useCards();
  const card = getCard(cardId);
  const colors = useColors();
  const { lang, t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [range, setRange] = useState<RangeKey>('month');
  const [showAll, setShowAll] = useState(false);
  const [fromDate, setFromDate] = useState(new Date(2026, 6, 1));
  const [toDate, setToDate] = useState(new Date(2026, 8, 14));
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editColorKey, setEditColorKey] = useState<string | null>(null);
  const [editBank, setEditBank] = useState('');

  const openEdit = () => {
    if (!card) return;
    setEditNickname(card.nickname ?? '');
    setEditColorKey(card.colorKey ?? null);
    setEditBank(card.bank);
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!card) return;
    updateCardDisplay(card.id, {
      nickname: editNickname.trim() || null,
      colorKey: editColorKey,
      bank: editBank.trim() || card.bank,
    });
    setEditOpen(false);
  };

  const handleTogglePaid = () => {
    if (!card) return;
    if (card.paid) {
      togglePaid(card.id);
      return;
    }
    Alert.alert(
      lang === 'es' ? '¿Marcar como pagada?' : 'Mark as paid?',
      lang === 'es'
        ? `Se marcará ${card.displayName} como pagada este ciclo.`
        : `${card.displayName} will be marked as paid this cycle.`,
      [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        { text: lang === 'es' ? 'Marcar pagada' : 'Mark as paid', onPress: () => togglePaid(card.id) },
      ],
    );
  };

  const confirmDelete = () => {
    if (!card) return;
    Alert.alert(
      lang === 'es' ? '¿Eliminar esta tarjeta?' : 'Delete this card?',
      lang === 'es'
        ? 'Se borran permanentemente la tarjeta, sus transacciones, pagos y estados de cuenta. No se puede deshacer.'
        : 'This permanently deletes the card, its transactions, payments and statements. This cannot be undone.',
      [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'es' ? 'Eliminar' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteCard(card.id);
              navigation.navigate('Tabs', { screen: 'Home' });
            } catch (err: any) {
              setDeleting(false);
              Alert.alert(lang === 'es' ? 'No se pudo eliminar' : 'Could not delete', err?.message ?? String(err));
            }
          },
        },
      ],
    );
  };

  const TODAY = toIso(new Date());
  // Plain calendar ranges — deliberately unrelated to any statement's billing cycle.
  const rangeStart =
    range === 'month'
      ? startOfMonth(TODAY)
      : range === '3months'
        ? addMonths(TODAY, -3)
        : range === 'ytd'
          ? `${new Date().getFullYear()}-01-01`
          : toIso(fromDate);
  const rangeEnd = range === 'custom' ? toIso(toDate) : TODAY;

  const rangeTx = useMemo(
    () => (card ? card.dtx.filter((tx) => tx.iso >= rangeStart && tx.iso <= rangeEnd) : []),
    [card, rangeStart, rangeEnd],
  );
  const shown = showAll ? rangeTx : rangeTx.slice(0, 5);
  const rangeSpend = rangeTx.reduce((n, tx) => n + (tx.amount < 0 ? -tx.amount : 0), 0);

  if (!card) return null;

  const balanceLabel = card.paidAmt > 0 ? t.leftToPay : t.stmtBal;

  // While the edit sheet is open, the hero card reflects whatever's being
  // typed/picked right now — the same live-preview feel as changing a photo
  // and seeing the avatar update before you've hit save.
  const heroColorKey = editOpen ? editColorKey : card.colorKey;
  const previewNickname = editOpen ? editNickname.trim() : card.nickname ?? '';
  const previewBank = editOpen ? editBank.trim() || card.bank : card.bank;
  const heroName = previewNickname || previewBank;
  const heroSub = previewNickname ? [previewBank, card.product].filter(Boolean).join(' ') : card.product ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.topActions}>
            {!isDemo && (
              <Pressable onPress={openEdit} style={styles.pillBtn}>
                <Text style={styles.pillBtnText}>{lang === 'es' ? 'Editar' : 'Edit'}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Statements', params: { cardId: card.id } })}
              style={styles.pillBtn}
            >
              <Text style={styles.pillBtnText}>{t.statements}</Text>
            </Pressable>
            <Pressable
              onPress={handleTogglePaid}
              style={[styles.pillBtn, styles.pillBtnAccent]}
            >
              <Text style={[styles.pillBtnText, { color: colors.accent }]}>
                {card.paid ? t.markUnpaid : t.markPaid}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.heroWrap}>
          <Pressable disabled={isDemo} onPress={openEdit}>
            <CardArt cardId={card.id} colorKey={heroColorKey ?? undefined} style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.heroBank} numberOfLines={1}>
                    {heroName}
                  </Text>
                  <Text style={styles.heroSub} numberOfLines={2}>
                    {heroSub}
                  </Text>
                </View>
                <Text style={styles.heroNetwork}>{card.network.toUpperCase()}</Text>
              </View>
              <View style={styles.heroBottom}>
                <Text style={styles.heroLast4}>{card.last4}</Text>
                <Text style={styles.heroCur}>{t.balancesInUsd}</Text>
              </View>
            </CardArt>
          </Pressable>
        </View>

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{balanceLabel}</Text>
            <Text style={styles.tileValue}>{card.balanceText}</Text>
            <Text style={styles.tileNote}>{card.paidNote}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t.payDue}</Text>
            <Text style={styles.tileValue}>{card.dueShort}</Text>
            <Text style={[styles.tileNote, { color: card.stateInk }]}>{card.stateText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t.minPay}</Text>
            <Text style={styles.tileValue}>{card.minText}</Text>
            <Text style={styles.tileNote}>{t.fullPaymentWord} {card.balanceText}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{t.creditUsed}</Text>
            <Text style={styles.tileValue}>{card.usedPct}%</Text>
            <View style={{ marginTop: 10 }}>
              <ProgressBar pct={card.usedPct} fill={card.barInk} />
            </View>
            <Text style={styles.tileNote}>
              {card.availableText} {t.availableWord}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => navigation.navigate('Pay', { cardId: card.id })}
            style={styles.payBtn}
          >
            <Text style={styles.payBtnText}>{t.registerPay}</Text>
          </Pressable>
        </View>

        {card.plans.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t.plans}</Text>
              <Text style={styles.sectionNote}>
                {card.plans.length} {t.activePlansWord}
              </Text>
            </View>
            <View style={{ marginTop: 10, gap: 8 }}>
              {card.plans.map((p) => (
                <View key={p.merchant + p.plan} style={styles.planCard}>
                  <View style={styles.planTopRow}>
                    <Text style={styles.planMerchant}>{p.merchant}</Text>
                    <Text style={styles.planMonthly}>
                      {money(card.cur, p.monthly)}
                      <Text style={styles.planPer}> {t.perMonthShort}</Text>
                    </Text>
                  </View>
                  <View style={styles.planSubRow}>
                    <Text style={styles.planSub}>
                      {t.instalmentWord} {p.plan}
                      {p.rate ? ` · ${p.rate}` : ''}
                    </Text>
                    <Text style={styles.planSub}>
                      {money(card.cur, p.remaining)} {t.leftWord}
                    </Text>
                  </View>
                  <View style={{ marginTop: 9 }}>
                    <ProgressBar pct={p.pct} fill={colors.bar} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t.transactions}</Text>
            <Pressable
              onPress={() => navigation.navigate('Transactions', { cardId: card.id })}
              hitSlop={6}
            >
              <Text style={styles.seeAll}>{t.seeAll}</Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 12 }}>
            <Segmented
              options={[
                { key: 'month', label: t.thisCycle },
                { key: '3months', label: t.threeCycles },
                { key: 'ytd', label: t.ytd },
                { key: 'custom', label: t.range },
              ]}
              value={range}
              onChange={(v) => {
                setRange(v);
                setShowAll(false);
              }}
            />
          </View>
          {range === 'custom' && (
            <View style={styles.dateRow}>
              <DateField
                label="From"
                value={fromDate}
                onChange={setFromDate}
                maximumDate={toDate}
              />
              <DateField
                label="To"
                value={toDate}
                onChange={setToDate}
                minimumDate={fromDate}
              />
            </View>
          )}
          <Text style={styles.txNote}>
            {rangeTx.length} {t.transactions.toLowerCase()} · {money('US$', rangeSpend)}
          </Text>
          <View style={styles.listCard}>
            {shown.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                onPress={() => navigation.navigate('TransactionDetail', { txId: tx.id, cardId: card.id })}
              />
            ))}
          </View>
          {rangeTx.length === 0 && (
            <Text style={styles.emptyNote}>{t.noTxRange}</Text>
          )}
          {(rangeTx.length > shown.length || showAll) && rangeTx.length > 0 && (
            <Pressable onPress={() => setShowAll((v) => !v)} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>
                {showAll ? t.showLess : `${t.showAll} ${rangeTx.length}`}
              </Text>
            </Pressable>
          )}
        </View>

        {!isDemo && (
          <View style={styles.section}>
            <Pressable onPress={confirmDelete} disabled={deleting} style={styles.deleteBtn}>
              {deleting ? (
                <ActivityIndicator color={colors.accentInk2} />
              ) : (
                <Text style={styles.deleteBtnText}>{lang === 'es' ? 'Eliminar tarjeta' : 'Delete card'}</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{lang === 'es' ? 'Editar tarjeta' : 'Edit card'}</Text>

                <Text style={styles.label}>{lang === 'es' ? 'BANCO' : 'BANK'}</Text>
                <TextInput
                  value={editBank}
                  onChangeText={setEditBank}
                  placeholderTextColor={colors.ink3}
                  style={styles.modalSearch}
                />
                <Text style={styles.modalHint}>
                  {lang === 'es'
                    ? 'Acórtalo si quieres — mientras el nombre del banco no cambie, los próximos estados de cuenta lo seguirán reconociendo.'
                    : "Shorten it if you like — as long as the bank itself doesn't change, future statements will still be recognized."}
                </Text>

                <Text style={[styles.label, { marginTop: 14 }]}>{lang === 'es' ? 'APODO' : 'NICKNAME'}</Text>
                <TextInput
                  value={editNickname}
                  onChangeText={setEditNickname}
                  placeholder={card.bank}
                  placeholderTextColor={colors.ink3}
                  style={styles.modalSearch}
                />

                <Text style={[styles.label, { marginTop: 14 }]}>{lang === 'es' ? 'COLOR' : 'COLOR'}</Text>
                <View style={styles.swatchRow}>
                  {CARD_PALETTE_ORDER.map((key) => {
                    const [c0, , c2] = CARD_PALETTE[key];
                    const active = editColorKey === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setEditColorKey(active ? null : key)}
                        style={[
                          styles.swatch,
                          { backgroundColor: c0, borderColor: active ? colors.accent : 'transparent' },
                        ]}
                      >
                        <View style={[styles.swatchInner, { backgroundColor: c2 }]} />
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable onPress={saveEdit} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>{lang === 'es' ? 'Guardar' : 'Save'}</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    topRow: {
      paddingTop: spacing.xxl,
      paddingHorizontal: spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topActions: { flexDirection: 'row', gap: 8 },
    pillBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hair4,
    },
    pillBtnAccent: { borderColor: colors.accent },
    pillBtnText: { fontSize: 11.5, fontWeight: '500', color: colors.ink },
    heroWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
    hero: {
      borderRadius: radius.xl,
      height: CARD_HEIGHT,
      padding: 18,
      justifyContent: 'space-between',
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    heroBank: { fontSize: 16, fontWeight: '600', color: colors.onArt },
    heroSub: { fontSize: 12, color: 'rgba(243,245,254,0.62)', marginTop: 4 },
    heroNetwork: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 1.4,
      color: 'rgba(243,245,254,0.62)',
      flexShrink: 0,
      marginLeft: 8,
    },
    heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    heroLast4: { fontSize: 14, fontWeight: '500', letterSpacing: 2.2, color: colors.onArt },
    heroCur: { fontSize: 11, color: 'rgba(243,245,254,0.62)' },
    tiles: {
      marginTop: 14,
      paddingHorizontal: spacing.xl,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tile: {
      width: '47.5%',
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    tileLabel: { fontSize: 11.5, color: colors.ink2 },
    tileValue: { fontSize: 22, fontWeight: '600', color: colors.ink, marginTop: 8 },
    tileNote: { fontSize: 11, color: colors.ink3, marginTop: 4 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    sectionNote: { fontSize: 11.5, color: colors.ink3 },
    payBtn: {
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    payBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
    planCard: {
      padding: 13,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    planTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    planMerchant: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
    planMonthly: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    planPer: { fontSize: 10.5, fontWeight: '400', color: colors.ink3 },
    planSubRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    planSub: { fontSize: 11, color: colors.ink3 },
    dateRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
    txNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    emptyNote: { padding: 18, fontSize: 12.5, color: colors.ink3 },
    moreBtn: {
      marginTop: 10,
      padding: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    moreBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },
    seeAll: { fontSize: 12, fontWeight: '500', color: colors.accent },
    deleteBtn: {
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accentLine,
      alignItems: 'center',
    },
    deleteBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.accentInk2 },
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
    modalTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, marginBottom: 14 },
    label: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1, marginBottom: 8 },
    modalSearch: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.md - 2,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 14,
      color: colors.ink,
    },
    modalHint: { fontSize: 11, color: colors.ink3, marginTop: 6, lineHeight: 15 },
    swatchRow: { flexDirection: 'row', gap: 12 },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchInner: { width: 18, height: 18, borderRadius: 999 },
    saveBtn: {
      marginTop: 22,
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '600', color: colors.bg },
  });
}
