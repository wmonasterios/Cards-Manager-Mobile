import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, ColorTokens, fonts, VIVID } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useCards } from '../context/CardsContext';
import { BackButton } from '../components/BackButton';
import { money } from '../format';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { isOfflineError, offlineMessage } from '../errors';
import { DbStatement, ParsedStatement } from '../supabase/types';
import {
  applyStatement,
  deleteAppliedStatement,
  getStatementPdfUrl,
  listNeedsReviewStatements,
  startReread,
  clearReread,
} from '../supabase/statementsApi';
import { StatementCheck, checkAgainst, diffReadings, netOf, previousStatement, reconcileStatements, cardStatements } from '../statementCheck';

function friendlyErrorMessage(err: any, lang: 'en' | 'es'): string {
  if (err instanceof FunctionsFetchError || isOfflineError(err)) return offlineMessage(lang);
  return err?.message ?? String(err);
}

type Mode = 'loading' | 'view' | 'saving' | 'gone';

// A background re-read that hasn't finished after this long is treated as
// lost (edge functions are cut off well before), so the user can start over.
const REREAD_STALE_MS = 6 * 60 * 1000;

const NOT_A_TRANSACTION = /^\s*(saldo\s+(anterior|inicial|previo)|balance\s+(anterior|forward)|previous\s+balance)\b/i;
const txCount = (p: ParsedStatement | null | undefined) =>
  (p?.transactions ?? []).filter((t) => !NOT_A_TRANSACTION.test(t.merchant ?? '')).length;

function fmtDate(iso: string | null | undefined, lang: string, withYear = true) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString(lang === 'es' ? 'es-PA' : 'en-US', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

// One saved statement: its balance check, its numbers, and the two repair
// actions — read the same PDF again (compare, then keep one) or delete it.
export function StatementDetailScreen({ route, navigation }: any) {
  const statementId: string = route.params.statementId;
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang } = useLocale();
  const es = lang === 'es';
  const { session } = useAuth();
  const userId = session?.user.id;
  const { getCard, refresh } = useCards();

  const [mode, setMode] = useState<Mode>('loading');
  const [rows, setRows] = useState<DbStatement[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const all = await listNeedsReviewStatements(userId);
      setRows(all);
      setMode((m) => (m === 'saving' ? m : all.some((s) => s.id === statementId) ? 'view' : 'gone'));
    } catch {
      setMode((m) => (m === 'loading' ? 'gone' : m));
    }
  }, [userId, statementId]);

  useEffect(() => {
    load();
  }, [load]);

  const st = rows.find((s) => s.id === statementId);
  const parsed = st?.parsed ?? null;
  // The re-read lives on the server row, so it survives leaving the screen or
  // the app: 'reading' → we wait (polling), 'ready' → compare and pick.
  const rereadStale =
    st?.reread_status === 'reading' &&
    !!st.reread_started_at &&
    Date.now() - Date.parse(st.reread_started_at) > REREAD_STALE_MS;
  const rereading = st?.reread_status === 'reading' && !rereadStale;
  const newReading = st?.reread_status === 'ready' ? st.reread_parsed ?? null : null;
  const rereadFailed = st?.reread_status === 'failed' || rereadStale;

  useEffect(() => {
    if (!rereading) return;
    const t = setInterval(load, 4000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [rereading, load]);

  // Tell the user once, then clear it so "Volver a leer" can be tried again.
  const failShown = useRef(false);
  useEffect(() => {
    if (!rereadFailed || failShown.current) return;
    failShown.current = true;
    Alert.alert(
      es ? 'No se pudo volver a leer' : "Couldn't read it again",
      es ? 'Tu lectura guardada no cambió. Puedes intentarlo otra vez.' : 'Your saved reading is unchanged. You can try again.',
    );
    clearReread(statementId)
      .then(load)
      .catch(() => {})
      .finally(() => {
        failShown.current = false;
      });
  }, [rereadFailed, statementId, load, es]);

  const card = st?.card_id ? getCard(st.card_id) : undefined;
  const cur = parsed?.currency === 'USD' || !parsed?.currency ? 'US$' : parsed.currency;
  const prev = st ? previousStatement(rows, st) : undefined;
  const check: StatementCheck | undefined = st ? reconcileStatements(rows).get(st.id) : undefined;
  const isLatest = !!st?.card_id && cardStatements(rows, st.card_id).slice(-1)[0]?.id === st?.id;
  const latestCutoff = st?.card_id ? cardStatements(rows, st.card_id).slice(-1)[0]?.parsed?.cutoff_date : undefined;
  const prevCutoff = prev?.parsed?.cutoff_date;
  const title = card?.displayName ?? st?.bank ?? (es ? 'Estado de cuenta' : 'Statement');
  const sub = `${es ? 'Corte' : 'Cutoff'} ${fmtDate(parsed?.cutoff_date, lang)} · ${
    st?.source === 'email' ? (es ? 'por correo el' : 'via email on') : es ? 'PDF subido el' : 'PDF uploaded on'
  } ${fmtDate(st?.received_at, lang, false)}`;

  const openPdf = async () => {
    setOpeningPdf(true);
    try {
      await Linking.openURL(await getStatementPdfUrl(statementId));
    } catch (err) {
      Alert.alert(es ? 'No se pudo abrir el PDF' : 'Could not open the PDF', friendlyErrorMessage(err, lang));
    } finally {
      setOpeningPdf(false);
    }
  };

  const reread = async () => {
    if (!parsed || starting) return;
    setStarting(true);
    try {
      await startReread(statementId);
      setRows((all) =>
        all.map((s) =>
          s.id === statementId
            ? { ...s, reread_status: 'reading', reread_started_at: new Date().toISOString(), reread_parsed: null }
            : s,
        ),
      );
      load();
    } catch (err) {
      Alert.alert(es ? 'No se pudo volver a leer' : "Couldn't read it again", friendlyErrorMessage(err, lang));
    } finally {
      setStarting(false);
    }
  };

  const keepOld = async () => {
    setMode('saving');
    try {
      await clearReread(statementId);
      setMode('view');
      await load();
    } catch (err) {
      setMode('view');
      Alert.alert(es ? 'No se pudo completar' : "Couldn't complete that", friendlyErrorMessage(err, lang));
    }
  };

  const useNew = async () => {
    if (!newReading || !st) return;
    setMode('saving');
    try {
      await applyStatement(statementId, newReading, st.card_id ?? undefined, { replace: true });
      await clearReread(statementId).catch(() => {});
      await refresh();
      setMode('view');
      await load();
    } catch (err) {
      setMode('view');
      Alert.alert(es ? 'No se pudo guardar' : 'Could not save', friendlyErrorMessage(err, lang));
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteAppliedStatement(statementId);
      setConfirmDelete(false);
      await refresh();
      navigation.goBack();
    } catch (err) {
      Alert.alert(es ? 'No se pudo eliminar' : 'Could not delete', friendlyErrorMessage(err, lang));
    } finally {
      setDeleting(false);
    }
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'));

  const header = (
    <View style={styles.header}>
      <BackButton onPress={goBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {newReading ? (es ? 'Nueva lectura' : 'New reading') : title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {newReading ? `${title} · ${es ? 'Corte' : 'Cutoff'} ${fmtDate(parsed?.cutoff_date, lang)}` : sub}
        </Text>
      </View>
    </View>
  );

  if (mode === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.ink3} />
      </SafeAreaView>
    );
  }

  if (mode === 'gone' || !st || !parsed) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={goBack} />
        </View>
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <Text style={[styles.body, { textAlign: 'center' }]}>
            {es ? 'Este estado de cuenta ya no está disponible.' : 'This statement is no longer available.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (rereading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        {header}
        <View style={[styles.center, { flex: 1, paddingHorizontal: 36, gap: 14 }]}>
          <ActivityIndicator color={colors.ink2} size="large" />
          <Text style={[styles.cardTitle, { textAlign: 'center' }]}>{es ? 'Leyendo el PDF otra vez…' : 'Reading the PDF again…'}</Text>
          <Text style={[styles.small, { textAlign: 'center' }]}>
            {es
              ? 'Suele tardar alrededor de un minuto, hasta dos si algo no cuadra. Puedes salir de esta pantalla o de la app: sigue trabajando y te avisamos cuando esté lista. No cambiamos nada hasta que elijas.'
              : "It usually takes about a minute, up to two if something doesn't add up. You can leave this screen or the app: it keeps working and we'll let you know when it's ready. Nothing changes until you choose."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (newReading) {
    const oldCheck = prev ? checkAgainst(Number(prev.parsed!.balance), parsed) : null;
    const newCheck = prev ? checkAgainst(Number(prev.parsed!.balance), newReading) : null;
    const changes = diffReadings(parsed, newReading);
    const balanceChanged = Math.abs(Number(parsed.balance) - Number(newReading.balance)) >= 0.01;
    const Box = ({ label, count, c, strong }: { label: string; count: number; c: StatementCheck | null; strong: boolean }) => (
      <View style={[styles.box, strong ? styles.boxStrong : styles.boxSoft]}>
        <Text style={styles.groupLabel}>{label}</Text>
        <Text style={[styles.bigNum, !strong && { color: colors.ink2 }]}>{count}</Text>
        <Text style={styles.small}>{es ? 'transacciones' : 'transactions'}</Text>
        <View style={{ marginTop: 10 }}>
          <CheckLine c={c} es={es} cur={cur} colors={colors} styles={styles} />
        </View>
      </View>
    );
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        {header}
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Box label={es ? 'ANTES' : 'BEFORE'} count={txCount(parsed)} c={oldCheck} strong={false} />
            <Box label={es ? 'AHORA' : 'NOW'} count={txCount(newReading)} c={newCheck} strong />
          </View>
          {balanceChanged && (
            <Text style={[styles.small, { marginTop: 10 }]}>
              {es ? 'El saldo leído cambió de' : 'The balance read changed from'} {money(cur, Number(parsed.balance))}{' '}
              {es ? 'a' : 'to'} {money(cur, Number(newReading.balance))}.
            </Text>
          )}
          <Text style={[styles.groupLabel, { marginTop: 22 }]}>{es ? 'QUÉ CAMBIÓ' : 'WHAT CHANGED'}</Text>
          <View style={styles.card}>
            {changes.length === 0 ? (
              <View style={styles.factRow}>
                <Text style={styles.body}>{es ? 'Las transacciones son las mismas.' : 'The transactions are the same.'}</Text>
              </View>
            ) : (
              changes.slice(0, 12).map((ch, i) => (
                <View key={`${ch.kind}-${i}`} style={[styles.changeRow, i < Math.min(changes.length, 12) - 1 && styles.rowBorder]}>
                  <View style={styles.changeMark}>
                    <Text style={styles.changeMarkText}>{ch.kind === 'added' ? '+' : '−'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.changeTitle} numberOfLines={1}>
                      {ch.merchant}
                    </Text>
                    <Text style={styles.small}>
                      {ch.kind === 'added' ? (es ? 'Nueva' : 'New') : es ? 'Ya no aparece' : 'No longer there'} · {fmtDate(ch.date, lang, false)}
                    </Text>
                  </View>
                  <Text style={styles.changeAmount}>{money(cur, Math.abs(ch.amount))}</Text>
                </View>
              ))
            )}
          </View>
          {changes.length > 12 && (
            <Text style={[styles.small, { marginTop: 8, textAlign: 'center' }]}>
              {es ? `y ${changes.length - 12} cambios más` : `and ${changes.length - 12} more changes`}
            </Text>
          )}
          <Text style={[styles.small, { marginTop: 12, textAlign: 'center' }]}>
            {es ? 'Las categorías que corregiste a mano se mantienen.' : 'Categories you fixed by hand are kept.'}
          </Text>
        </ScrollView>
        <View style={styles.actions}>
          <Pressable style={[styles.primaryBtn, mode === 'saving' && { opacity: 0.85 }]} onPress={useNew} disabled={mode === 'saving'}>
            {mode === 'saving' ? (
              <View style={styles.btnInner}>
                <ActivityIndicator color={colors.onTint2} size="small" />
                <Text style={styles.primaryBtnText}>{es ? 'Guardando…' : 'Saving…'}</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>{es ? 'Usar la nueva lectura' : 'Use the new reading'}</Text>
            )}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={keepOld} disabled={mode === 'saving'}>
            <Text style={styles.secondaryBtnText}>{es ? 'Quedarme con la anterior' : 'Keep the previous one'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ——— view ———
  const facts: { k: string; v: string }[] = [
    { k: es ? 'Saldo' : 'Balance', v: money(cur, Number(parsed.balance)) },
    { k: es ? 'Pago mínimo' : 'Minimum payment', v: money(cur, Number(parsed.minimum_payment)) },
    { k: es ? 'Fecha de pago' : 'Due date', v: fmtDate(parsed.due_date, lang) },
    { k: es ? 'Transacciones' : 'Transactions', v: String(txCount(parsed)) },
    ...(prev?.parsed ? [{ k: es ? 'Saldo anterior' : 'Previous balance', v: money(cur, Number(prev.parsed.balance)) }] : []),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { padding: 14, flexDirection: 'row', gap: 12 }]}>
          {check?.kind === 'off' ? (
            <View style={[styles.dot, { backgroundColor: colors.seg3, marginTop: 5 }]} />
          ) : (
            <Ionicons name={check?.kind === 'ok' ? 'checkmark' : 'information-circle-outline'} size={17} color={colors.ink2} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {check?.kind === 'off'
                ? `${es ? 'No cuadra por' : 'Off by'} ${money(cur, check.diff)}`
                : check?.kind === 'ok'
                  ? es ? 'Cuadra' : 'Balances'
                  : es ? 'Primer estado de cuenta' : 'First statement'}
            </Text>
            <Text style={[styles.body, { marginTop: 4 }]}>
              {check?.kind === 'off'
                ? es
                  ? 'El saldo anterior, menos tus pagos, más los cargos, no da el saldo de este estado de cuenta. Probablemente se saltó o leyó mal una línea. Volver a leerlo suele corregirlo.'
                  : "The previous balance, minus your payments, plus charges, doesn't match this statement's balance. A line was probably skipped or misread; reading it again usually fixes it."
                : check?.kind === 'ok'
                  ? es
                    ? 'El saldo anterior, menos tus pagos, más los cargos, da exactamente el saldo de este estado de cuenta.'
                    : "The previous balance, minus your payments, plus charges, matches this statement's balance exactly."
                  : es
                    ? 'Es el primero de esta tarjeta en Poquet, así que no hay saldo anterior con qué compararlo.'
                    : "It's this card's first statement in Poquet, so there's no previous balance to compare it with."}
            </Text>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 14 }]}>
          {facts.map((f, i) => (
            <View key={f.k} style={[styles.factRow, i < facts.length - 1 && styles.rowBorder]}>
              <Text style={styles.factK}>{f.k}</Text>
              <Text style={styles.factV}>{f.v}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={openPdf} disabled={openingPdf} style={{ marginTop: 14, alignSelf: 'flex-start' }} hitSlop={8}>
          {openingPdf ? (
            <ActivityIndicator size="small" color={colors.ink2} />
          ) : (
            <Text style={styles.link}>{es ? 'Ver PDF original ↗' : 'View original PDF ↗'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={[styles.primaryBtn, starting && { opacity: 0.85 }]} onPress={reread} disabled={starting} accessibilityRole="button">
          <View style={styles.btnInner}>
            {starting ? <ActivityIndicator color={colors.onTint2} size="small" /> : <Ionicons name="refresh" size={17} color={colors.onTint2} />}
            <Text style={styles.primaryBtnText}>{es ? 'Volver a leer' : 'Read it again'}</Text>
          </View>
        </Pressable>
        <Text style={[styles.small, { textAlign: 'center' }]}>
          {es
            ? 'Lee el mismo PDF otra vez. Antes de reemplazar nada te mostramos qué cambió.'
            : "Reads the same PDF again. We show you what changed before replacing anything."}
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => setConfirmDelete(true)} accessibilityRole="button">
          <View style={styles.btnInner}>
            <Ionicons name="trash-outline" size={16} color={colors.ink2} />
            <Text style={styles.secondaryBtnText}>{es ? 'Eliminar estado de cuenta' : 'Delete statement'}</Text>
          </View>
        </Pressable>
      </View>

      <Modal visible={confirmDelete} transparent animationType="slide" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={styles.scrim} onPress={() => !deleting && setConfirmDelete(false)} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{es ? '¿Eliminar este estado de cuenta?' : 'Delete this statement?'}</Text>
          <Text style={[styles.body, { marginTop: 10, fontSize: 14, lineHeight: 21 }]}>
            {es
              ? `Se borran el PDF y sus ${txCount(parsed)} transacciones de ${title} con corte ${fmtDate(parsed.cutoff_date, lang, false)}. No se puede deshacer.`
              : `This deletes the PDF and its ${txCount(parsed)} transactions from ${title} (cutoff ${fmtDate(parsed.cutoff_date, lang, false)}). This cannot be undone.`}
          </Text>
          <View style={styles.sheetNote}>
            <Text style={styles.body}>
              {isLatest
                ? prevCutoff
                  ? es
                    ? `Es el más reciente: la tarjeta vuelve a mostrar el saldo, el pago mínimo y las fechas del corte ${fmtDate(prevCutoff, lang, false)}.`
                    : `It's the most recent: the card goes back to the balance, minimum and dates of the ${fmtDate(prevCutoff, lang, false)} cutoff.`
                  : es
                    ? 'Es el único de esta tarjeta: la tarjeta conserva el saldo y las fechas que tiene ahora.'
                    : "It's this card's only one: the card keeps its current balance and dates."
                : es
                  ? `El saldo y las fechas de la tarjeta no cambian: vienen del corte más reciente (${fmtDate(latestCutoff, lang, false)}).`
                  : `The card's balance and dates don't change: they come from the latest cutoff (${fmtDate(latestCutoff, lang, false)}).`}
            </Text>
          </View>
          <View style={{ marginTop: 20, gap: 10 }}>
            <Pressable style={styles.dangerBtn} onPress={doDelete} disabled={deleting} accessibilityRole="button">
              {deleting ? <ActivityIndicator color="#121212" /> : <Text style={styles.dangerBtnText}>{es ? 'Eliminar' : 'Delete'}</Text>}
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setConfirmDelete(false)} disabled={deleting}>
              <Text style={styles.secondaryBtnText}>{es ? 'Cancelar' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CheckLine({ c, es, cur, colors, styles }: { c: StatementCheck | null; es: boolean; cur: string; colors: ColorTokens; styles: any }) {
  if (!c || c.kind === 'first') return <Text style={styles.small}>{es ? 'Sin saldo anterior' : 'No previous balance'}</Text>;
  if (c.kind === 'ok')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name="checkmark" size={14} color={colors.ink} />
        <Text style={styles.checkText}>{es ? 'Cuadra' : 'Balances'}</Text>
      </View>
    );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[styles.dot, { backgroundColor: colors.seg3 }]} />
      <Text style={styles.checkText}>
        {es ? 'No cuadra' : 'Off'} · {money(cur, c.diff)}
      </Text>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
    title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
    sub: { fontSize: 12.5, color: colors.ink3, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
    card: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
    cardTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
    body: { fontSize: 12.5, lineHeight: 18, color: colors.ink2 },
    small: { fontSize: 11.5, lineHeight: 16, color: colors.ink3 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, paddingHorizontal: 16 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line2 },
    factK: { fontSize: 13.5, color: colors.ink3 },
    factV: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    link: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    actions: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 6, gap: 10 },
    primaryBtn: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.onTint2 },
    btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    secondaryBtn: { minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { fontSize: 14.5, fontWeight: '600', color: colors.ink2 },
    ghostBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    dangerBtn: { minHeight: 52, borderRadius: radius.lg, backgroundColor: VIVID.coral, alignItems: 'center', justifyContent: 'center' },
    dangerBtnText: { fontSize: 15, fontWeight: '700', color: '#121212' },
    scrim: { flex: 1, backgroundColor: 'rgba(5,7,15,0.62)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 22,
      paddingTop: 12,
      paddingBottom: 36,
    },
    grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 18 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.ink },
    sheetNote: { marginTop: 14, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
    groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.ink3, marginBottom: 8 },
    box: { flex: 1, padding: 14, borderRadius: radius.xl, borderWidth: 1 },
    boxSoft: { backgroundColor: colors.surface2, borderColor: colors.line2 },
    boxStrong: { backgroundColor: colors.surface, borderColor: colors.line },
    bigNum: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 2 },
    checkText: { fontSize: 12, fontWeight: '700', color: colors.ink },
    changeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 },
    changeMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
    changeMarkText: { fontSize: 15, fontWeight: '700', color: colors.ink2 },
    changeTitle: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    changeAmount: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
  });
}
