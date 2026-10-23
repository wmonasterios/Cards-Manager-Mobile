import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../theme/ThemeContext';
import { ColorTokens, radius, spacing } from '../theme';
import { Card, Transaction } from '../data';
import { money } from '../format';
import { useCards } from '../context/CardsContext';
import { ProgressBar } from './ProgressBar';

// "Adicionales" on the card detail (Oct 2026): what each additional card
// spent in the latest statement, and a sheet to say which of the card's
// numbers are additional cards and whose. The card's own figures (balance,
// minimum, dates) stay the whole account's: it's paid all together.

// The latest statement's lines: the statement whose newest line is newest.
export function latestStatementTx(tx: Transaction[]): Transaction[] {
  const newest = new Map<string, string>();
  for (const t of tx) {
    if (!t.statementId) continue;
    const prev = newest.get(t.statementId);
    if (!prev || t.iso > prev) newest.set(t.statementId, t.iso);
  }
  let best: string | null = null;
  let bestIso = '';
  for (const [id, iso] of newest) if (iso > bestIso) { best = id; bestIso = iso; }
  return best ? tx.filter((t) => t.statementId === best) : [];
}

const isSpend = (t: Transaction) => t.amount < 0 && !t.excludedFromSpend;

// Every card number seen on this card, most lines first.
function numbersOnCard(tx: Transaction[]): { last4: string; lines: number }[] {
  const by = new Map<string, number>();
  for (const t of tx) if (t.cardLast4) by.set(t.cardLast4, (by.get(t.cardLast4) ?? 0) + 1);
  return [...by.entries()].map(([last4, lines]) => ({ last4, lines })).sort((a, b) => b.lines - a.lines);
}

export function CardAdditionals({
  card,
  lang,
  onSeeMember,
}: {
  card: Card;
  lang: string;
  onSeeMember: (last4: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cardMembers, setCardMember, isDemo } = useCards();
  const es = lang === 'es';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, { kind: 'principal' | 'additional'; name: string }>>({});
  const [saving, setSaving] = useState(false);

  const numbers = useMemo(() => numbersOnCard(card.tx), [card.tx]);
  const additionals = card.additionals ?? [];
  const latest = useMemo(() => latestStatementTx(card.tx), [card.tx]);

  // Nothing to show on a card with a single number and no additionals.
  if (isDemo || (numbers.length < 2 && additionals.length === 0)) return null;

  const totalSpend = latest.filter(isSpend).reduce((n, t) => n - t.amount, 0);
  const rows = additionals.map((a) => {
    const mine = latest.filter((t) => t.cardLast4 === a.last4 && !!t.member && isSpend(t));
    const spend = mine.reduce((n, t) => n - t.amount, 0);
    return { ...a, spend, count: mine.length, pct: totalSpend > 0 ? Math.round((spend / totalSpend) * 100) : 0 };
  });
  const cutoffLabel = card.cutoffIso
    ? new Date(card.cutoffIso + 'T00:00:00').toLocaleDateString(es ? 'es-PA' : 'en-US', { day: 'numeric', month: 'short' })
    : '';

  const openSheet = () => {
    const next: typeof draft = {};
    for (const n of numbers) {
      const m = cardMembers.find((x) => x.card_id === card.id && x.last4 === n.last4);
      next[n.last4] = { kind: m?.kind === 'additional' ? 'additional' : 'principal', name: m?.name ?? '' };
    }
    setDraft(next);
    setOpen(true);
  };

  const save = async () => {
    const unnamed = Object.entries(draft).find(([, d]) => d.kind === 'additional' && !d.name.trim());
    if (unnamed) {
      Alert.alert(es ? 'Falta un nombre' : 'Missing a name', es ? `Escribe de quién es la tarjeta ·· ${unnamed[0]}.` : `Type whose card ·· ${unnamed[0]} is.`);
      return;
    }
    setSaving(true);
    try {
      for (const [last4, d] of Object.entries(draft)) {
        const m = cardMembers.find((x) => x.card_id === card.id && x.last4 === last4);
        const name = d.kind === 'additional' ? d.name.trim() : null;
        const unchanged = m && m.kind === d.kind && (m.name ?? null) === name;
        const nothingToSave = !m && d.kind === 'principal';
        if (unchanged || nothingToSave) continue;
        await setCardMember(card.id, last4, d.kind, name);
      }
      setOpen(false);
    } catch {
      Alert.alert(es ? 'No se pudo guardar' : "Couldn't save", es ? 'Revisa tu conexión e inténtalo de nuevo.' : 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{es ? 'Adicionales' : 'Additional cards'}</Text>
        <Pressable onPress={openSheet} hitSlop={8} accessibilityRole="button">
          <Text style={styles.manage}>{es ? 'Gestionar' : 'Manage'}</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <Pressable onPress={openSheet} style={[styles.box, styles.emptyRow]} accessibilityRole="button">
          <Text style={[styles.sub, { flex: 1 }]}>
            {es
              ? `Esta tarjeta trae ${numbers.length} números. ¿Alguno es una adicional?`
              : `This card shows ${numbers.length} card numbers. Is any of them an additional card?`}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
        </Pressable>
      ) : (
        <View style={{ gap: 8, marginTop: 10 }}>
          {rows.map((r) => (
            <View key={r.last4} style={styles.box}>
              <View style={styles.topRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name} <Text style={styles.last4}>·· {r.last4}</Text>
                </Text>
                <Text style={styles.amount}>{money(card.cur, r.spend)}</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={styles.sub}>
                  {es ? `${r.count} ${r.count === 1 ? 'compra' : 'compras'}` : `${r.count} ${r.count === 1 ? 'purchase' : 'purchases'}`}
                  {cutoffLabel ? (es ? ` · corte ${cutoffLabel}` : ` · ${cutoffLabel} cutoff`) : ''}
                </Text>
                <Text style={styles.sub}>{es ? `${r.pct}% del corte` : `${r.pct}% of the statement`}</Text>
              </View>
              <View style={{ marginTop: 9 }}>
                <ProgressBar pct={r.pct} fill={colors.seg2} />
              </View>
              <Pressable onPress={() => onSeeMember(r.last4)} style={styles.link} accessibilityRole="link">
                <Text style={styles.linkText}>{es ? `Ver las compras de ${r.name}` : `See ${r.name}'s purchases`}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => !saving && setOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>{es ? 'Tarjetas de esta cuenta' : 'Cards on this account'}</Text>
                <Text style={styles.sheetHint}>
                  {es
                    ? 'Marca las adicionales y ponles nombre. Lo demás cuenta como tu tarjeta principal.'
                    : 'Mark the additional cards and name them. Everything else counts as your main card.'}
                </Text>
                {numbers.map((n) => {
                  const d = draft[n.last4] ?? { kind: 'principal' as const, name: '' };
                  const extra = d.kind === 'additional';
                  const set = (patch: Partial<typeof d>) => setDraft({ ...draft, [n.last4]: { ...d, ...patch } });
                  return (
                    <View key={n.last4} style={styles.sheetRow}>
                      <View style={styles.topRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.name}>·· {n.last4}</Text>
                          <Text style={styles.sub}>{es ? `${n.lines} líneas` : `${n.lines} lines`}</Text>
                        </View>
                        <View style={styles.segment} accessibilityRole="radiogroup">
                          <Pressable
                            onPress={() => set({ kind: 'principal' })}
                            style={[styles.segBtn, !extra && styles.segOn]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: !extra }}
                          >
                            <Text style={[styles.segText, !extra && styles.segTextOn]}>{es ? 'Principal' : 'Main'}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => set({ kind: 'additional' })}
                            style={[styles.segBtn, extra && styles.segOn]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: extra }}
                          >
                            <Text style={[styles.segText, extra && styles.segTextOn]}>{es ? 'Adicional' : 'Additional'}</Text>
                          </Pressable>
                        </View>
                      </View>
                      {extra && (
                        <TextInput
                          value={d.name}
                          onChangeText={(v) => set({ name: v })}
                          placeholder={es ? '¿De quién es?' : 'Whose is it?'}
                          placeholderTextColor={colors.ink3}
                          maxLength={40}
                          autoCapitalize="words"
                          style={styles.input}
                        />
                      )}
                    </View>
                  );
                })}
                <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.7 }]} accessibilityRole="button">
                  <Text style={styles.saveBtnText}>{saving ? (es ? 'Guardando…' : 'Saving…') : es ? 'Guardar' : 'Save'}</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    manage: { fontSize: 12, fontWeight: '500', color: colors.ink },
    box: {
      padding: 13,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emptyRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    name: { fontSize: 13.5, fontWeight: '500', color: colors.ink, flexShrink: 1 },
    last4: { fontWeight: '400', color: colors.ink3 },
    amount: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    subRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    sub: { fontSize: 11, color: colors.ink3 },
    link: {
      marginTop: 10,
      paddingTop: 10,
      minHeight: 36,
      borderTopWidth: 1,
      borderTopColor: colors.line2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    linkText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
      maxHeight: '85%',
    },
    sheetTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    sheetHint: { fontSize: 12, lineHeight: 17, color: colors.ink2, marginTop: 6, marginBottom: 4 },
    sheetRow: { paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line2, gap: 10 },
    segment: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: 999,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line,
    },
    segBtn: { height: 36, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center' },
    segOn: { backgroundColor: colors.accent },
    segText: { fontSize: 12.5, fontWeight: '500', color: colors.ink2 },
    segTextOn: { color: colors.onTint2, fontWeight: '600' },
    input: {
      height: 44,
      paddingHorizontal: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 15,
    },
    saveBtn: { marginTop: 22, padding: 14, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center' },
    saveBtnText: { fontSize: 14, fontWeight: '600', color: colors.onTint2 },
  });
}
