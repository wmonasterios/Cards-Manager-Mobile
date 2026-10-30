import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import { ColorTokens } from '../theme';
import { money } from '../format';
import { DbCardMember, MemberChoice, ParsedTransaction } from '../supabase/types';

// Additional cards (Oct 2026). A statement can hold several card numbers:
// the principal's, additional cards, an old number that was renewed. The
// reader tags every line with its section's number (card_last4). The first
// time a number shows up on a card, the review screen asks whether it's an
// additional card and whose; everything not marked as additional counts as
// the principal's. Numbers already answered on this card aren't asked again,
// but they're still listed (read-only) so the user can see every number the
// reader found — hiding them read as "it didn't detect my additional card"
// (support report, 29 Oct 2026).

export type MemberDraft = Record<string, { kind: 'principal' | 'additional'; name: string }>;

type NumberSummary = { last4: string; lines: number; charges: number };

export function cardNumbers(transactions: ParsedTransaction[]): NumberSummary[] {
  const by = new Map<string, NumberSummary>();
  for (const t of transactions) {
    const d = String(t.card_last4 ?? '').replace(/\D/g, '');
    if (d.length < 4) continue;
    const last4 = d.slice(-4);
    const s = by.get(last4) ?? { last4, lines: 0, charges: 0 };
    s.lines++;
    if (Number(t.amount) < 0) s.charges += -Number(t.amount);
    by.set(last4, s);
  }
  // Most lines first: usually the principal's own spending.
  return [...by.values()].sort((a, b) => b.lines - a.lines);
}

// The numbers to ask about: only when the statement has 2+ numbers, and only
// those this card hasn't had an answer for yet.
export function numbersToAsk(transactions: ParsedTransaction[] | undefined, known: DbCardMember[]): NumberSummary[] {
  const all = cardNumbers(transactions ?? []);
  if (all.length < 2) return [];
  const answered = new Set(known.map((m) => m.last4));
  return all.filter((n) => !answered.has(n.last4));
}

// Numbers in this statement that already have an answer on this card, shown
// read-only next to the ones being asked about.
export type KnownNumber = NumberSummary & { kind: 'principal' | 'additional'; name: string | null };
export function knownNumbers(transactions: ParsedTransaction[] | undefined, known: DbCardMember[]): KnownNumber[] {
  const all = cardNumbers(transactions ?? []);
  if (all.length < 2) return [];
  const byLast4 = new Map(known.map((m) => [m.last4, m]));
  return all.flatMap((n) => {
    const m = byLast4.get(n.last4);
    return m ? [{ ...n, kind: m.kind, name: m.kind === 'additional' ? m.name : null }] : [];
  });
}

// What to send to apply-statement: every asked number (principal ones too,
// so they aren't asked again). An additional without a name stays principal.
export function memberChoices(asked: NumberSummary[], draft: MemberDraft): MemberChoice[] {
  return asked.map((n) => {
    const d = draft[n.last4];
    const name = d?.name?.trim();
    return d?.kind === 'additional' && name
      ? { last4: n.last4, kind: 'additional', name }
      : { last4: n.last4, kind: 'principal' };
  });
}

// An additional marked without a name: the save button asks for it first.
export function missingName(asked: NumberSummary[], draft: MemberDraft): string | null {
  const n = asked.find((x) => draft[x.last4]?.kind === 'additional' && !draft[x.last4]?.name?.trim());
  return n ? n.last4 : null;
}

export function CardMembersPicker({
  asked,
  known = [],
  draft,
  onChange,
  cur,
  lang,
  totalNumbers,
}: {
  asked: NumberSummary[];
  known?: KnownNumber[];
  draft: MemberDraft;
  onChange: (next: MemberDraft) => void;
  cur: string;
  lang: string;
  totalNumbers: number;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const es = lang === 'es';
  if (asked.length === 0 && known.length === 0) return null;
  const lineSummary = (n: NumberSummary) =>
    es
      ? `${n.lines} ${n.lines === 1 ? 'línea' : 'líneas'} · ${money(cur, n.charges)} en cargos`
      : `${n.lines} ${n.lines === 1 ? 'line' : 'lines'} · ${money(cur, n.charges)} in charges`;

  const set = (last4: string, patch: Partial<{ kind: 'principal' | 'additional'; name: string }>) => {
    const prev = draft[last4] ?? { kind: 'principal' as const, name: '' };
    onChange({ ...draft, [last4]: { ...prev, ...patch } });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>
        {es ? `ESTE ESTADO TRAE ${totalNumbers} TARJETAS` : `THIS STATEMENT HAS ${totalNumbers} CARDS`}
      </Text>
      <Text style={styles.intro}>
        {asked.length > 0
          ? es
            ? 'Marca cuál es una adicional. Lo demás se suma a tu tarjeta principal. Solo te lo preguntamos esta vez.'
            : 'Mark which one is an additional card. Everything else counts as your main card. We only ask this once.'
          : es
            ? 'Ya las conocemos: cada compra queda con su tarjeta. Puedes cambiarlo desde la tarjeta, en Gestionar.'
            : 'We already know them: each purchase stays with its card. You can change this from the card, under Manage.'}
      </Text>
      {known.map((n) => (
        <View key={n.last4} style={styles.row}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.number}>·· {n.last4}</Text>
              <Text style={styles.sub}>{lineSummary(n)}</Text>
            </View>
            <Text style={styles.knownTag} numberOfLines={1}>
              {n.kind === 'additional'
                ? `${es ? 'Adicional' : 'Additional'}${n.name ? ` · ${n.name}` : ''}`
                : es ? 'Principal' : 'Main'}
            </Text>
          </View>
        </View>
      ))}
      {asked.map((n) => {
        const d = draft[n.last4] ?? { kind: 'principal', name: '' };
        const extra = d.kind === 'additional';
        return (
          <View key={n.last4} style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.number}>·· {n.last4}</Text>
                <Text style={styles.sub}>{lineSummary(n)}</Text>
              </View>
              <View style={styles.segment} accessibilityRole="radiogroup">
                <Pressable
                  onPress={() => set(n.last4, { kind: 'principal' })}
                  style={[styles.segBtn, !extra && styles.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: !extra }}
                >
                  <Text style={[styles.segText, !extra && styles.segTextOn]}>{es ? 'Principal' : 'Main'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => set(n.last4, { kind: 'additional' })}
                  style={[styles.segBtn, extra && styles.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: extra }}
                >
                  <Text style={[styles.segText, extra && styles.segTextOn]}>{es ? 'Adicional' : 'Additional'}</Text>
                </Pressable>
              </View>
            </View>
            {extra && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>{es ? '¿De quién es?' : 'Whose is it?'}</Text>
                <TextInput
                  value={d.name}
                  onChangeText={(v) => set(n.last4, { name: v })}
                  placeholder={es ? 'Nombre' : 'Name'}
                  placeholderTextColor={colors.ink3}
                  maxLength={40}
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    kicker: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.6, color: colors.ink3 },
    intro: { fontSize: 12.5, lineHeight: 18, color: colors.ink2, marginTop: 6, marginBottom: 4 },
    row: { paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line2 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    number: { fontSize: 15, fontWeight: '600', color: colors.ink },
    sub: { fontSize: 11.5, color: colors.ink3, marginTop: 2 },
    knownTag: { fontSize: 12.5, fontWeight: '500', color: colors.ink2, maxWidth: '55%' },
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
    inputLabel: { fontSize: 12, color: colors.ink2, marginBottom: 6 },
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
  });
}
