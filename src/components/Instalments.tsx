// Installment ("cuota") UI shared by the transaction detail: the series card
// (progress, paid, left, end, each cuota) and the two sheets — "Es pago en
// cuotas" (mark or edit a line) and "La pasé a cuotas" (the original
// purchase, which stops counting so it isn't added twice).
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorTokens, radius, spacing, fonts, getCategoryColors, categoryLabel } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { ALL_CATEGORIES, Category } from '../data';
import { money } from '../format';
import type { DecoratedTransaction } from '../decorate';
import {
  InstalmentSeries,
  addMonthsIso,
  dayMonthYear,
  monthYear,
  monthsBetween,
} from '../instalments';

type Lang = 'es' | 'en';

export function SeriesCard({
  series,
  currentTxId,
  lang,
  onEdit,
  onNotCuota,
}: {
  series: InstalmentSeries;
  currentTxId: string;
  lang: Lang;
  onEdit?: () => void;
  onNotCuota?: () => void;
}) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const es = lang === 'es';
  const fmt = (n: number) => money(series.cur, n);
  const rate = series.latest.rate;

  // Seen cuotas, then the ones still to come (projected from the last one).
  const seen = series.rows.map((r) => ({ n: r.n, iso: r.tx.iso, amount: Math.abs(r.tx.amount), paid: true, current: r.tx.id === currentTxId }));
  const upcoming = Array.from({ length: series.remainingCount }, (_, i) => ({
    n: series.n + i + 1,
    iso: addMonthsIso(series.latest.iso, i + 1),
    amount: series.monthly,
    paid: false,
    current: false,
  }));
  const MAX_UPCOMING = 4;
  const list = [...seen, ...upcoming.slice(0, MAX_UPCOMING)];
  const hidden = upcoming.length - Math.min(upcoming.length, MAX_UPCOMING);

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.title}>
          {es ? `Plan de ${series.total} cuotas` : `${series.total}-instalment plan`}
        </Text>
        {!!rate && <Text style={s.meta}>{rate}</Text>}
      </View>
      {series.total <= 24 ? (
        <View style={s.steps}>
          {Array.from({ length: series.total }, (_, i) => (
            <View key={i} style={[s.step, { backgroundColor: i < series.n ? colors.bar : colors.line }]} />
          ))}
        </View>
      ) : (
        <View style={s.track}>
          <View style={[s.fill, { width: `${(series.n / series.total) * 100}%`, backgroundColor: colors.bar }]} />
        </View>
      )}
      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statLabel}>{es ? 'Pagado' : 'Paid'}</Text>
          <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>{fmt(series.paid)}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>{es ? 'Falta' : 'Left'}</Text>
          <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>{fmt(series.left)}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>{es ? 'Termina' : 'Ends'}</Text>
          <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.3}>{monthYear(series.endIso, lang)}</Text>
        </View>
      </View>
      {series.original && (
        <Text style={s.note}>
          {es
            ? `Compra original: ${series.original.merchant} · ${fmt(Math.abs(series.original.amount))}, no cuenta como gasto.`
            : `Original purchase: ${series.original.merchant} · ${fmt(Math.abs(series.original.amount))}, not counted as spending.`}
        </Text>
      )}
      <View style={s.list}>
        {list.map((r) => (
          <View key={`${r.n}-${r.iso}`} style={s.listRow}>
            <Text style={[s.listText, { color: r.current ? colors.ink : r.paid ? colors.ink2 : colors.ink3 }, r.current && { fontWeight: '600' }]}>
              {r.n}/{series.total} · {dayMonthYear(r.iso, lang)}
            </Text>
            <Text style={[s.listText, { color: r.paid ? colors.ink2 : colors.ink3, fontWeight: '500' }]}>
              {r.paid ? (es ? 'Pagada' : 'Paid') : fmt(r.amount)}
            </Text>
          </View>
        ))}
        {hidden > 0 && (
          <View style={s.listRow}>
            <Text style={[s.listText, { color: colors.ink3 }]}>
              {es ? `y ${hidden} cuotas más` : `and ${hidden} more`}
            </Text>
            <Text style={[s.listText, { color: colors.ink3 }]}>{fmt(hidden * series.monthly)}</Text>
          </View>
        )}
      </View>
      {(onEdit || onNotCuota) && (
        <View style={s.actions}>
          {onEdit && (
            <Pressable onPress={onEdit} style={s.ghostBtn}>
              <Text style={s.ghostText}>{es ? 'Editar cuota' : 'Edit instalment'}</Text>
            </Pressable>
          )}
          {onNotCuota && (
            <Pressable onPress={onNotCuota} style={s.ghostBtn}>
              <Text style={[s.ghostText, { color: colors.ink2 }]}>{es ? 'No es cuota' : 'Not an instalment'}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// Inline category list for the sheets (a second Modal on top of a Modal
// misbehaves on iOS, so the picker opens inside the sheet).
function CategoryField({ value, onChange, lang }: { value: Category; onChange: (c: Category) => void; lang: Lang }) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const catColors = getCategoryColors(colors);
  const pickable = ALL_CATEGORIES.filter((c) => !['payment', 'transfer', 'topup'].includes(c));
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} style={s.field}>
        <Text style={s.fieldLabel}>{lang === 'es' ? 'Categoría' : 'Category'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.dot, { backgroundColor: catColors[value]?.bg ?? colors.line }]} />
          <Text style={s.fieldValue}>{categoryLabel(value, lang)}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.ink3} />
        </View>
      </Pressable>
      {open && (
        <View style={s.catWrap}>
          {pickable.map((c) => {
            const active = c === value;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={[s.chip, active && s.chipActive]}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{categoryLabel(c, lang)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  const colors = useColors();
  return <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.accent : colors.ink3} />;
}

export type MarkResult = {
  n: number;
  total: number;
  category: Category;
  alsoIds: { id: string; plan: string }[];
};

export function MarkCuotaSheet({
  visible,
  onClose,
  onSave,
  tx,
  cur,
  lang,
  initial,
  suggestion,
  similar,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (r: MarkResult) => void;
  tx: DecoratedTransaction;
  cur: string;
  lang: Lang;
  initial?: { n: number; total: number } | null;
  suggestion?: { n: number; total: number } | null;
  similar: DecoratedTransaction[];
  saving?: boolean;
}) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const es = lang === 'es';
  const start = initial ?? suggestion ?? null;
  const [nText, setNText] = useState(start ? String(start.n) : '');
  const [totalText, setTotalText] = useState(start ? String(start.total) : '');
  const [category, setCategory] = useState<Category>(tx.category);
  const [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());

  const n = parseInt(nText, 10);
  const total = parseInt(totalText, 10);
  const valid = Number.isFinite(n) && Number.isFinite(total) && n >= 1 && total >= 2 && n <= total && total <= 120;

  // Each similar line gets the number it would have by month distance.
  const also = similar
    .map((o) => ({ o, k: valid ? n + monthsBetween(tx.iso, o.iso) : NaN }))
    .filter((x) => !valid || (x.k >= 1 && x.k <= total));

  const save = () => {
    if (!valid || saving) return;
    onSave({
      n,
      total,
      category,
      alsoIds: also.filter((x) => !unchecked.has(x.o.id)).map((x) => ({ id: x.o.id, plan: `${x.k}/${total}` })),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.grabber} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              <View>
                <Text style={s.sheetTitle}>{es ? 'Es pago en cuotas' : 'This is an instalment'}</Text>
                <Text style={s.sheetBody}>
                  {es
                    ? `Sigue contando en ${categoryLabel(category, lang)}, una vez al mes. Además lo verás en tus pagos en cuotas.`
                    : `It still counts under ${categoryLabel(category, lang)}, once a month, and also shows in your instalments.`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{es ? 'Cuota' : 'Instalment'}</Text>
                  <TextInput
                    value={nText}
                    onChangeText={(v) => setNText(v.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    style={s.input}
                    placeholderTextColor={colors.ink3}
                    accessibilityLabel={es ? 'Número de cuota' : 'Instalment number'}
                  />
                </View>
                <Text style={[s.fieldLabel, { paddingBottom: 15 }]}>{es ? 'de' : 'of'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{es ? 'Total de cuotas' : 'Total instalments'}</Text>
                  <TextInput
                    value={totalText}
                    onChangeText={(v) => setTotalText(v.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    style={s.input}
                    placeholderTextColor={colors.ink3}
                    accessibilityLabel={es ? 'Total de cuotas' : 'Total instalments'}
                  />
                </View>
              </View>
              {suggestion && !initial && (
                <Text style={s.hint}>
                  {es
                    ? `Sugerido por la serie: ${suggestion.n} de ${suggestion.total}.`
                    : `Suggested from the series: ${suggestion.n} of ${suggestion.total}.`}
                </Text>
              )}
              <CategoryField value={category} onChange={setCategory} lang={lang} />
              {also.length > 0 && (
                <View>
                  <Text style={s.groupTitle}>{es ? 'También marcar los cargos iguales' : 'Also mark the matching charges'}</Text>
                  <Text style={s.hint}>
                    {es ? 'Mismo comercio y monto en esta tarjeta, sin marca de cuota' : 'Same merchant and amount on this card, not marked yet'}
                  </Text>
                  <View style={s.box}>
                    {also.map(({ o, k }) => {
                      const on = !unchecked.has(o.id);
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() =>
                            setUnchecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(o.id)) next.delete(o.id);
                              else next.add(o.id);
                              return next;
                            })
                          }
                          style={s.boxRow}
                        >
                          <Check on={on} />
                          <Text style={[s.boxText, { flex: 1 }]}>
                            {dayMonthYear(o.iso, lang)} · {money(cur, Math.abs(o.amount))}
                          </Text>
                          {valid && <Text style={s.hint}>{es ? `quedará ${k}/${total}` : `becomes ${k}/${total}`}</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              <Text style={s.hint}>
                {es
                  ? 'Las próximas cuotas de esta serie se marcan solas. Lo que marques tú no lo cambia una nueva lectura.'
                  : "This series' next instalments are marked automatically. A new reading never undoes what you mark."}
              </Text>
              <Pressable onPress={save} disabled={!valid || saving} style={[s.primary, (!valid || saving) && { opacity: 0.45 }]}>
                <Text style={s.primaryText}>{saving ? (es ? 'Guardando…' : 'Saving…') : es ? 'Guardar' : 'Save'}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type MovedResult = { category: Category; seriesKeys: string[] };

export function MovedToCuotasSheet({
  visible,
  onClose,
  onSave,
  tx,
  lang,
  matches,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (r: MovedResult) => void;
  tx: DecoratedTransaction;
  lang: Lang;
  matches: InstalmentSeries[];
  saving?: boolean;
}) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const es = lang === 'es';
  const [category, setCategory] = useState<Category>(tx.category);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(matches.slice(0, 1).map((m) => m.key)));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.grabber} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            <View>
              <Text style={s.sheetTitle}>{es ? 'La pasé a cuotas' : 'I moved it to instalments'}</Text>
              <Text style={s.sheetBody}>
                {es
                  ? 'Este cargo deja de contar como gasto para no sumarlo dos veces. Cuentan las cuotas, una vez al mes, en la categoría que elijas.'
                  : 'This charge stops counting as spending so it isn’t added twice. The instalments count instead, once a month, in the category you pick.'}
              </Text>
            </View>
            <CategoryField value={category} onChange={setCategory} lang={lang} />
            {matches.length > 0 ? (
              <View style={s.matchCard}>
                <Text style={s.groupTitle}>{es ? 'Encontramos cuotas que coinciden' : 'We found matching instalments'}</Text>
                {matches.map((m) => {
                  const on = picked.has(m.key);
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.key)) next.delete(m.key);
                          else next.add(m.key);
                          return next;
                        })
                      }
                      style={[s.boxRow, { paddingHorizontal: 0 }]}
                    >
                      <Check on={on} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.boxText}>{m.merchant}</Text>
                        <Text style={s.hint}>
                          {m.cardName} · {money(m.cur, m.monthly)} × {m.total} = {money(m.cur, m.monthly * m.total)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={s.hint}>
                {es
                  ? '¿Aún no llegan las cuotas? Guárdalo igual: cuando aparezcan y sumen lo mismo que esta compra, las unimos solas.'
                  : 'Instalments not here yet? Save it anyway: when they show up and add up to this purchase, we join them automatically.'}
              </Text>
            )}
            <Pressable
              onPress={() => !saving && onSave({ category, seriesKeys: [...picked] })}
              disabled={saving}
              style={[s.primary, saving && { opacity: 0.45 }]}
            >
              <Text style={s.primaryText}>{saving ? (es ? 'Guardando…' : 'Saving…') : es ? 'Guardar' : 'Save'}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      padding: 16,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
    title: { fontSize: 14, fontWeight: '600', color: colors.ink },
    meta: { fontSize: 12, color: colors.ink3 },
    steps: { flexDirection: 'row', gap: 3, marginTop: 12 },
    step: { flex: 1, height: 7, borderRadius: 4 },
    track: { height: 7, borderRadius: 4, backgroundColor: colors.line, marginTop: 12, overflow: 'hidden' },
    fill: { height: 7 },
    stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
    stat: { flex: 1, minWidth: 0 },
    statLabel: { fontSize: 11, color: colors.ink3 },
    statValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink, marginTop: 2 },
    note: { fontSize: 12, color: colors.ink2, lineHeight: 17, marginTop: 12 },
    list: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.hair },
    listRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 36,
      borderBottomWidth: 1,
      borderBottomColor: colors.hair,
    },
    listText: { fontSize: 12.5 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    ghostBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostText: { fontSize: 13, fontWeight: '500', color: colors.ink },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl + 6,
      borderTopRightRadius: radius.xl + 6,
      paddingHorizontal: spacing.xl,
      paddingTop: 10,
      paddingBottom: spacing.xxl + 8,
      maxHeight: '88%',
    },
    grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { fontSize: 21, fontFamily: fonts.display, color: colors.ink },
    sheetBody: { fontSize: 12.5, lineHeight: 18, color: colors.ink2, marginTop: 4 },
    fieldLabel: { fontSize: 12, color: colors.ink3 },
    input: {
      minHeight: 48,
      marginTop: 6,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 17,
      fontWeight: '600',
    },
    hint: { fontSize: 11.5, color: colors.ink3, lineHeight: 16 },
    field: {
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    fieldValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    dot: { width: 10, height: 10, borderRadius: 3 },
    catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
    chipActive: { backgroundColor: colors.tint2, borderColor: colors.tint2 },
    chipText: { fontSize: 12, fontWeight: '500', color: colors.ink2 },
    chipTextActive: { color: colors.onTint2 },
    groupTitle: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 2 },
    box: { marginTop: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
    boxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 46,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.hair,
    },
    boxText: { fontSize: 13, color: colors.ink },
    matchCard: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
    primary: {
      minHeight: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { fontSize: 15, fontWeight: '700', color: colors.onTint2 },
  });
}
